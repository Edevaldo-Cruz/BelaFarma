# Relatório Técnico de Análise Frontend — Dashboard BelaFarma

**Data**: 2026-08-12  
**Autor**: explorer_frontend_1 (teamwork_preview_explorer)  
**Projeto**: BelaFarma Dashboard & Fila de Revisão Pendente  

---

## 1. Visão Geral e Arquitetura Frontend

A aplicação web da BelaFarma é construída sobre uma pilha moderna de tecnologias web baseadas em **React 19 + TypeScript + Vite + Tailwind CSS + Lucide React**.

### Principais Arquivos e Estrutura de Diretórios
- `index.html`: Ponto de entrada HTML com suporte a PWA e viewport móvel.
- `index.tsx`: Montagem do React DOM root e encapsulamento dos provedores contextuais (`ToastProvider`).
- `App.tsx` (1126 linhas): Componente raiz gerenciador de estado global da aplicação.
- `types.ts` (579 linhas): Definições globais de interfaces e enums TypeScript (`Delivery`, `Order`, `User`, `View`, `Task`, etc.).
- `components/`: Diretório contendo 89 componentes React reutilizáveis e páginas de visão do painel.

### Gerenciamento de Estado e Navegação
- **Visualizações (`View`)**: Controladas via estado React `const [currentView, setCurrentView] = useState<View>('dashboard')` em `App.tsx:96`.
- **Comunicação em Tempo Real**: `App.tsx:277-300` escuta eventos Server-Sent Events (SSE) via `EventSource('/api/webhook/stream')` e aciona um sinal sonoro sintetizado (`tocarSino()`, Web Audio API) em novidades.
- **Sessões e Inatividade**: `App.tsx:210-240` gerencia temporizador de logout automático por inatividade de 15 minutos (desativado em dispositivos móveis).

---

## 2. Estrutura do Painel Web (Dashboard)

### 2.1 Componentes Principais do Dashboard (`components/Dashboard.tsx`)
O Dashboard (`Dashboard.tsx`, 1830 linhas) é o painel executivo e operacional central:
- **Resumo Financeiro & Orçamentário** (`budgetData`, linhas 100-179): Exibe cartões com orçamento diário, semanal e mensal calculados em tempo real via `calculateWeeklyBudgetsCascade()`.
- **Estatísticas de Vendas ao Vivo** (`liveSalesData`, linhas 185-201): Exibe o faturamento do dia por modalidade de pagamento (Dinheiro, Crédito, Débito, Pix, Crediário).
- **Gráficos Interativos**:
  - `SalesChart.tsx`: Gráfico de evolução de vendas diárias/mensais.
  - `ExpensesChart.tsx`: Distribuição de despesas.
  - `FinancialEvolutionChart.tsx`: Saúde financeira comparativa.
  - `PaymentMethodsChart.tsx`: Gráfico em rosca por forma de pagamento.
  - `DeliverySummaryChart.tsx`: Gráfico de entregas e atendimentos.
- **Widgets de Monitoramento**:
  - Carrossel de Produtos Parados há mais de 90 dias (`inactiveProducts`, linhas 244-250).
  - Contador de Visitantes Diários/Totais (`visitorStats`, linhas 217-242).
- **Diálogos e Modais Incorporados**:
  - `GoalPopup.tsx`: Pop-up de metas de vendas.
  - `OrderStatusModal.tsx`: Modal para detalhes e atualização de status de pedidos.
  - `BoletoBudgetSummaryModal.tsx`: Central de orçamentos e boletos.

---

## 3. Componentes Existentes para Entregas, Pedidos e Notificações

### 3.1 Módulo de Entregas (`components/DeliveryWidget.tsx` e `DeliveriesPage.tsx`)
- `DeliveryWidget.tsx` (754 linhas): Componente responsável por listar atendimentos WhatsApp e entregas.
- **Métricas Consolidadas** (`DeliveryMetrics`, linhas 40-51):
  - Total de contatos auditados (`totalContacts`).
  - Vendas fechadas e valor total (`closedSalesCount`, `closedSalesAmount`).
  - Vendas não fechadas e motivos (`unclosedSalesCount`, `byUnclosedReason`).
  - Taxa de conversão (%) e ticket médio (R$).
- **Filtros e Busca**: Período (`today`, `7days`, `30days`, `month`, `prev_month`, `all`), status (`Pendente`, `Em Rota`, `Entregue`, `Nao_Fechado`, `Cancelado`), e termo de busca.
- **Auditoria Manual via IA**: Botão `handleTriggerAIScan` (linhas 93-126) faz requisição `POST /api/deliveries/scan` para varrer conversas de WhatsApp via LLM.

### 3.2 Central de Notificações e Badges (`components/NotificationPanel.tsx` e `Sidebar.tsx`)
- `Sidebar.tsx` (linhas 218-225): Consolida notificações de atenção de tarefas, boletos vencidos, depósitos bancários e alertas do iFood.
- `NotificationPanel.tsx` (276 linhas): Menu dropdown popover exibido ao clicar no ícone de sino na barra lateral, renderizando alertas com cores táticas.

---

## 4. Convenções e Regras de UI do Projeto

As seguintes regras são estritamente observadas em todo o código frontend do BelaFarma:

1. **Regra de Layout de Cabeçalho em Telas Pequenas (`MobileHeader.tsx`)**:
   - **Primeira linha (topo)**: Logo centralizado (`belinha sistema` com ícone `PlusSquare`).
   - **Segunda linha (abaixo)**: Botão de menu hamburger e barra de busca de medicamentos posicionados **na mesma linha**.
   - *Código de referência*: `components/MobileHeader.tsx:12-50`.
   
2. **Proibição Absoluta de `alert()` em Produção**:
   - Chamadas nativas `alert()` não devem ser utilizadas no código de produção.
   - Mensagens de aviso/sucesso sem necessidade de confirmação devem usar o hook `useToast()` importado de `ToastContext.tsx`:
     ```tsx
     const { addToast } = useToast();
     addToast('Mensagem de sucesso!', 'success'); // 'success' | 'error' | 'warning' | 'info'
     ```
   - Diálogos de confirmação ou formulários interativos devem usar modais customizados baseados em Tailwind CSS com efeito backdrop blur (`fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4`).

3. **Idioma**:
   - Toda a interface com o usuário, rótulos, mensagens de validação e alertas são redigidos exclusivamente em **Português do Brasil (`pt-BR`)**.

4. **Diretório de Mídia e Envio de Imagens**:
   - Imagens enviadas ou anexadas aos registros de entrega são salvas localmente em `delivery-service/public/uploads/` (ou `backend/public/uploads/`).

---

## 5. Especificação de Implementação: Fila de "Revisões Pendentes" e Alerta Visual

### 5.1 Alerta Visual Badge
Para indicar que há conversas aguardando auditoria manual do atendente, um badge pulsante deve ser adicionado ao item "Pedidos & Entregas" no menu lateral (`Sidebar.tsx`) e na barra superior do Dashboard (`Dashboard.tsx`).

#### Trecho de Código Sugerido (`Sidebar.tsx`):
```tsx
{/* Cálculo de Revisões Pendentes */}
const pendingReviewsCount = deliveries.filter(d => d.sale_closed === 0 && !d.unclosed_reason).length;

{/* Renderização da Badge no Item de Menu */}
<button onClick={() => setView('deliveries')} className="...">
  <Truck className="w-5 h-5" />
  <span>Pedidos & Entregas</span>
  {pendingReviewsCount > 0 && (
    <span className="ml-auto px-2 py-0.5 text-xs font-black text-white bg-amber-500 rounded-full animate-pulse shadow-sm">
      {pendingReviewsCount}
    </span>
  )}
</button>
```

### 5.2 Caixa de Entrada "Revisões Pendentes" no Dashboard
No topo do `Dashboard.tsx` ou em uma aba dedicada no `DeliveryWidget.tsx`, incluir um card de lista tática no estilo caixa de entrada:

#### Componente Proposto:
- **Card de Notificação de Topo**: Banner de alerta amarelo/laranja quando `pendingReviewsCount > 0`.
- **Lista de Atendimentos Esfriados/Ociosos**: Exibe o nome do cliente, telefone (formatado), produtos extraídos pela IA, horário em que a conversa esfriou, e um botão destacado **"Revisar Atendimento"**.

---

## 6. Especificação de Implementação: Modal Interativo ("Gerou entrega?")

Ao clicar em um item da fila de revisões pendentes, o sistema abrirá o `PendingReviewModal.tsx`.

### 6.1 Fluxo de Interação do Modal

```
[ Início: Clique no item da fila ]
                │
                ▼
   ┌──────────────────────────┐
   │  "Gerou entrega/venda?"  │
   └────────────┬─────────────┘
                │
        ┌───────┴───────┐
        ▼               ▼
     [ SIM ]         [ NÃO ]
        │               │
        │               ▼
        │    ┌──────────────────────────┐
        │    │ Questionário Pré-preenchido│
        │    │ - Produtos discutidos    │
        │    │ - Confirmar rejeitados   │
        │    │ - Selecionar motivo      │
        │    └──────────┬───────────────┘
        │               │
        ▼               ▼
   ┌──────────────────────────┐
   │ Preencher/Confirmar Dados│
   │ (Endereço, Valor, Pgto)  │
   └────────────┬─────────────┘
                │
                ▼
   ┌──────────────────────────┐
   │ Submit -> API PUT /api/..│
   └────────────┬─────────────┘
                │
                ▼
   ┌──────────────────────────┐
   │ Removido da Fila + Toast │
   └──────────────────────────┘
```

### 6.2 Estrutura JSX do Modal Interativo

```tsx
import React, { useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle, ShoppingBag, HelpCircle, X } from 'lucide-react';
import { useToast } from './ToastContext';

interface PendingReviewModalProps {
  isOpen: boolean;
  delivery: any; // Instância da entrega / conversa pendente
  onClose: () => void;
  onSuccess: (updatedDelivery: any) => void;
}

export const PendingReviewModal: React.FC<PendingReviewModalProps> = ({
  isOpen,
  delivery,
  onClose,
  onSuccess
}) => {
  const { addToast } = useToast();
  const [step, setStep] = useState<'initial' | 'yes_form' | 'no_questionnaire'>('initial');
  const [loading, setLoading] = useState(false);

  // Campos do formulário "SIM" (Venda Fechada)
  const [customerName, setCustomerName] = useState(delivery?.customer_name || '');
  const [address, setAddress] = useState(delivery?.delivery_address || '');
  const [totalAmount, setTotalAmount] = useState(delivery?.total_amount || 0);
  const [paymentMethod, setPaymentMethod] = useState(delivery?.payment_method || 'Pix');
  const [items, setItems] = useState(delivery?.items || '');

  // Campos do formulário "NÃO" (Venda Recusada / Questionário)
  const [rejectedReason, setRejectedReason] = useState('Preço Alto');
  const [rejectedProducts, setRejectedProducts] = useState<string[]>(
    delivery?.items ? delivery.items.split(',').map((i: string) => i.trim()) : []
  );
  const [notes, setNotes] = useState('');

  if (!isOpen || !delivery) return null;

  const handleSubmitYes = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/deliveries/${delivery.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sale_closed: 1,
          status: 'Pendente',
          customer_name: customerName,
          delivery_address: address,
          total_amount: parseFloat(totalAmount as any),
          payment_method: paymentMethod,
          items: items,
          unclosed_reason: null
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast('✅ Entrega confirmada e cadastrada com sucesso!', 'success');
        onSuccess(data.delivery);
        onClose();
      } else {
        throw new Error(data.error || 'Erro ao atualizar registro.');
      }
    } catch (err: any) {
      addToast(err.message || 'Falha ao salvar dados.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitNo = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/deliveries/${delivery.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sale_closed: 0,
          status: 'Nao_Fechado',
          unclosed_reason: rejectedReason,
          items: rejectedProducts.join(', '),
          notes: notes
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast('📋 Motivo de não fechamento registrado!', 'info');
        onSuccess(data.delivery);
        onClose();
      } else {
        throw new Error(data.error || 'Erro ao salvar questionário.');
      }
    } catch (err: any) {
      addToast(err.message || 'Falha ao salvar questionário.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95">
        
        {/* Cabeçalho */}
        <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Auditoria de Conversa</h3>
            <p className="text-xs font-semibold text-slate-400">{delivery.customer_name || delivery.phone}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
            <X size={20} />
          </button>
        </div>

        {/* Etapa 1: Decisão Inicial */}
        {step === 'initial' && (
          <div className="py-8 text-center space-y-6">
            <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              O atendimento gerou entrega ou venda?
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setStep('yes_form')}
                className="flex flex-col items-center justify-center p-6 bg-emerald-50 dark:bg-emerald-950/30 border-2 border-emerald-500 rounded-2xl text-emerald-700 dark:text-emerald-300 font-black text-lg hover:bg-emerald-100 transition-all active:scale-95"
              >
                <CheckCircle2 size={36} className="mb-2 text-emerald-600" />
                SIM (Gerou Venda)
              </button>
              <button
                onClick={() => setStep('no_questionnaire')}
                className="flex flex-col items-center justify-center p-6 bg-rose-50 dark:bg-rose-950/30 border-2 border-rose-500 rounded-2xl text-rose-700 dark:text-rose-300 font-black text-lg hover:bg-rose-100 transition-all active:scale-95"
              >
                <XCircle size={36} className="mb-2 text-rose-600" />
                NÃO (Recusado/Orçamento)
              </button>
            </div>
          </div>
        )}

        {/* Etapa 2A: Formulário SIM */}
        {step === 'yes_form' && (
          <div className="py-4 space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Nome do Cliente</label>
              <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full mt-1 p-3 rounded-xl border dark:bg-slate-800 dark:border-slate-700 dark:text-white" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Endereço de Entrega</label>
              <input type="text" value={address} onChange={e => setAddress(e.target.value)} className="w-full mt-1 p-3 rounded-xl border dark:bg-slate-800 dark:border-slate-700 dark:text-white" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Valor Total (R$)</label>
                <input type="number" step="0.01" value={totalAmount} onChange={e => setTotalAmount(e.target.value as any)} className="w-full mt-1 p-3 rounded-xl border dark:bg-slate-800 dark:border-slate-700 dark:text-white" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Pagamento</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full mt-1 p-3 rounded-xl border dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                  <option value="Pix">Pix</option>
                  <option value="Cartão">Cartão de Crédito/Débito</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Crediário">Crediário</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button onClick={() => setStep('initial')} className="px-4 py-2 rounded-xl text-slate-500 font-bold hover:bg-slate-100">Voltar</button>
              <button onClick={handleSubmitYes} disabled={loading} className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700">
                Confirmar Entrega
              </button>
            </div>
          </div>
        )}

        {/* Etapa 2B: Questionário NÃO */}
        {step === 'no_questionnaire' && (
          <div className="py-4 space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Motivo Principal da Recusa</label>
              <select value={rejectedReason} onChange={e => setRejectedReason(e.target.value)} className="w-full mt-1 p-3 rounded-xl border dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                <option value="Preço Alto">Preço Alto / Achou Caro</option>
                <option value="Falta de Estoque">Falta de Estoque</option>
                <option value="Apenas Dúvida">Apenas Dúvida / Cotação Sem Intenção</option>
                <option value="Sem Resposta do Cliente">Sem Resposta do Cliente após orçamento</option>
                <option value="Desistiu">Desistiu da Compra</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Produtos Discutidos / Rejeitados</label>
              <input type="text" value={rejectedProducts.join(', ')} onChange={e => setRejectedProducts(e.target.value.split(',').map(s => s.trim()))} className="w-full mt-1 p-3 rounded-xl border dark:bg-slate-800 dark:border-slate-700 dark:text-white" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Observações Adicionais</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full mt-1 p-3 rounded-xl border dark:bg-slate-800 dark:border-slate-700 dark:text-white" />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button onClick={() => setStep('initial')} className="px-4 py-2 rounded-xl text-slate-500 font-bold hover:bg-slate-100">Voltar</button>
              <button onClick={handleSubmitNo} disabled={loading} className="px-6 py-2 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700">
                Salvar Motivo e Finalizar
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
```

---

## 7. Atualização do Estado Frontend e Remoção da Fila

1. **Atualização Otimista da Interface (Optimistic UI Update)**:
   Assim que o atendente confirma o formulário no modal, a função de callback `onSuccess(updatedDelivery)` é acionada:
   ```tsx
   setDeliveries(prevDeliveries => 
     prevDeliveries.filter(item => item.id !== updatedDelivery.id)
   );
   ```
2. **Atualização de Dados Globais**:
   Em seguida, é efetuada a chamada de re-sincronização `fetchDeliveries()` ou `fetchData()`, atualizando os cartões de métricas do Dashboard e zerando a contagem da badge de notificação.
3. **Feedback ao Usuário**:
   Exibição do toast contextual (`addToast("Item processado e removido da fila!", "success")`) conforme diretrizes do projeto.

---

## 8. Recomendações Técnicas de Implementação

1. **Local de Criação do Novo Componente Modal**:
   Criar `components/PendingReviewModal.tsx` e exportá-lo para ser consumido em `components/Dashboard.tsx` e `components/DeliveryWidget.tsx`.
2. **Atualização das Métricas no Backend**:
   Garantir que a rota `PUT /api/deliveries/:id` grave corretamente os campos `sale_closed`, `unclosed_reason` e `status` no banco de dados SQLite (`deliveries` table).
3. **Conformidade com Regras de Layout**:
   Testar a visualização do modal e das badges em telas móveis respeitando a regra do header móvel (`MobileHeader.tsx`).
