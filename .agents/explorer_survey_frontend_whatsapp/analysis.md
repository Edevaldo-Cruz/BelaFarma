# Mapeamento do Frontend Web UI e da Arquitetura WhatsApp (Baileys) — Central de Compras BelaFarma

## 1. Sumário Executivo

Este documento consolida o mapeamento técnico completo da camada de interface web (**Frontend React/Vite/TypeScript**) e dos serviços de comunicação **WhatsApp via Baileys headless** da plataforma BelaFarma. O objetivo é fornecer as diretrizes arquiteturais, especificações de componentes, fluxos de dados, modelos de tela e contratos de API para a implementação do novo módulo unificado **"Central de Compras"** e de sua instância dedicada e isolada **`baileys-compras-service.js`**.

---

## 2. Diagnóstico da Camada Frontend Web

### 2.1 Stack Tecnológico e Configuração
- **Framework & Build**: React 19.2.3, Vite 6.2.0, TypeScript 5.8.2.
- **Estilização**: Tailwind CSS com classes utilitárias, temas Claro/Escuro persistidos em `localStorage` (`belinha_theme`), animações Tailwind `animate-in fade-in slide-in-from-bottom-4`.
- **Ícones**: `lucide-react` (v0.562.0).
- **Gráficos**: `recharts` (v3.6.0).
- **Gestão de Toasts & Notificações**: `ToastContext.tsx` provê hook `useToast()` com variantes `success`, `error`, `warning`, `info`.
- **Padrão de Diálogos & Modais**:
  - Modais customizados com backdrop `fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm`, cartões com bordas suaves `rounded-[2.5rem]`, tipografia em `font-black text-slate-800 dark:text-slate-100` e sombras profundas.
  - **Regra Estrita de Produção**: `alert()` e `confirm()` nativos são **expressamente proibidos** em código de produção e devem ser substituídos por Toasts e Modais interativos.

### 2.2 Padrão de Layout e Responsividade
- **Layout Desktop**:
  - Sidebar fixa à esquerda (`w-64`), com logo "belinha sistema", botão de notificações com badge animado, perfil do usuário, alternador de tema e lista de itens ordenados alfabeticamente (exceto Dashboard no topo e Configurações no rodapé).
  - Conteúdo principal (`flex-1 flex flex-col h-screen overflow-hidden`) com scrollbar customizada na área de visualização.
- **Layout Mobile (Regra de Negócio BelaFarma)**:
  - Implementado em `MobileHeader.tsx`:
    1. **Linha Superior**: Logotipo e identificador do sistema centralizados.
    2. **Linha Inferior**: Botão de menu lateral (Hamburger) à esquerda e barra de busca à direita na mesma linha horizontal.
  - O menu lateral móvel é renderizado como overlay deslizando da esquerda (`fixed inset-y-0 left-0 z-40 w-64 translate-x-0`).

---

## 3. Arquitetura da Nova Guia "Central de Compras" na Interface Web

### 3.1 Ponto de Inserção na Navegação
1. **Tipo de Visão (`types.ts`)**:
   ```typescript
   export type View = 
     | 'dashboard' 
     | 'central-compras' // Nova visão unificada
     | 'orders' 
     | ... ;
   ```
2. **Menu Lateral (`Sidebar.tsx`)**:
   - Inserir o item `{ id: 'central-compras', label: 'Central de Compras', icon: ShoppingBag, adminOnly: true }`.
   - Adicionar badge com contador em tempo real de mensagens pendentes na Fila de Aprovação (`pendingPurchasingApprovalsCount > 0`).
3. **Ponto de Renderização no `App.tsx`**:
   ```tsx
   {currentView === 'central-compras' && user.role === UserRole.ADM && (
     <CentralCompras 
       user={user} 
       theme={theme}
       onNavigate={(view) => setCurrentView(view)} 
     />
   )}
   ```

### 3.2 Arquitetura de Componentes da Central de Compras (`CentralCompras.tsx`)
A interface será construída como um hub modularizado contendo uma barra superior de abas estilizadas (*pills navigation*), permitindo navegar fluidamente entre as 7 subseções requeridas:

```
CentralCompras (Hub Central)
├── Sub-aba 1: EstoqueDashboardTab (Dashboard de Estoque Mínimo & Faltas)
├── Sub-aba 2: MineracaoOfertasTab (Mineração de Oportunidades & Histórico de Conversas)
├── Sub-aba 3: CotacoesRankingTab (Central de Cotações, Comparador & Ranking Ponderado)
├── Sub-aba 4: FilaAprovacaoTab (Fila de Aprovação Obrigatória & Alerta Duplo)
├── Sub-aba 5: PedidosOrcamentoTab (Espelho de Pedidos & Controle Orçamentário)
├── Sub-aba 6: RepresentantesTab (Gestão de Representantes, Distribuidoras & Prazos)
└── Sub-aba 7: WhatsAppConexaoTab (Painel Baileys Compras - QR Code & Status)
```

---

## 4. Detalhamento Funcional das 7 Subseções da Interface

### Subseção 1: Visão Geral / Dashboard de Estoque Mínimo e Faltas
- **Objetivo**: Garantir abastecimento para 30 dias de operação sem ruptura, combinando cálculo de CMV e sincronização transacional com o Digifarma.
- **Componentes Visuais**:
  - **Cards de Métricas (KPIs)**:
    - *Ruptura Crítica*: Contagem de itens com estoque = 0.
    - *Abaixo do Mínimo*: Quantidade de produtos com estoque inferior à cobertura de 30 dias.
    - *Investimento Estimado de Reposição*: Somatório de `(Estoque Mínimo - Estoque Atual) × Preço de Custo`.
    - *Status do Sync Digifarma*: Indicador em tempo real da última sincronização do banco Firebird.
  - **Tabela Interativa de Estoque**:
    - Colunas: Código/EAN, Nome do Medicamento, Apresentação, Giro 30/60 dias, CMV Diário, Estoque Atual, **Estoque Mínimo Calculado (CMV diário × 30 + 15%)**, Status de Risco (Ruptura [Vermelho], Alerta [Amarelo], Confortável [Verde]).
  - **Ações**:
    - Botão *"Sincronizar Mínimo no Digifarma"*: Abre modal de confirmação com resumo dos valores a serem gravados via transação segura na tabela `PRODUTOS` do Firebird.
    - Botão *"Adicionar Selecionados à Cotação"*: Envia os itens selecionados diretamente para o fluxo de cotação.

### Subseção 2: Mineração de Oportunidades & Histórico de Conversas
- **Objetivo**: Extrair e indexar ofertas comerciais recebidas dos representantes via WhatsApp, identificando preços vantajosos.
- **Componentes Visuais**:
  - **Painel de Varredura**: Botão *"Varrer Histórico de Conversas"* e botão *"Importar Novas Mensagens"*.
  - **Feed de Oportunidades Inteligentes**:
    - Cards de ofertas detectadas via IA com: Nome do Fornecedor / Representante, Data/Hora da mensagem, Texto original transcrito / anexo de tabela/imagem, Lista de produtos identificados.
    - **Validador de Preço Inteligente**: Compara o preço da oferta com a última compra no Digifarma (`VIEW_ULT_COMPRAS`). Se a oferta for inferior, exibe badge verde com a economia percentual (ex: *"14.2% mais barato que a última compra"*).
  - **Ação**: Botão *"Criar Cotação / Pedido com esta Oferta"*.

### Subseção 3: Central de Cotações, Comparador e Ranking Ponderado de Fornecedores
- **Objetivo**: Automatizar a coleta de preços e determinar a distribuição ótima dos pedidos respeitando prazos, bonificações e pedido mínimo.
- **Componentes Visuais**:
  - **Gerador de Solicitação de Cotação**:
    - Seleção de produtos faltantes ou sugeridos.
    - Identificação automática dos fornecedores que vendem cada categoria/produto.
    - Botão *"Gerar Mensagens de Cotação"* (as mensagens vão para a Fila de Aprovação, sem disparo automático direto).
  - **Comparador & Matriz de Ranking Ponderado**:
    - Algoritmo de Score Ponderado:
      $$\text{Score} = (0.60 \times \text{Score Preço Líquido}) + (0.25 \times \text{Score Prazo/Orçamento}) + (0.15 \times \text{Score Histórico/Pontualidade})$$
    - Tabela comparativa destacando o 1º colocado (ouro), 2º colocado (prata) e 3º colocado (bronze).
  - **Simulador & Otimizador de Pedido Mínimo**:
    - Exibe barra de progresso do valor total por fornecedor vs. Pedido Mínimo da distribuidora (ex: *R$ 380,00 de R$ 500,00 mínimo*).
    - Sugestão inteligente: Preenchimento automático com outros itens faltantes daquele fornecedor ou recomendação de transferência para o 2º melhor fornecedor global com comparativo de custo-benefício.
  - **Gestão de Quebras e Fallback**:
    - Botão *"Registrar Quebra / Falta de Fornecedor"*, que reatribui imediatamente os itens para a 2ª melhor colocada e gera nova notificação.

### Subseção 4: Fila de Aprovação Obrigatória de Mensagens e Notificações
- **Objetivo**: Cumprir a regra de segurança onde **nenhuma mensagem externa sai sem validação humana prévia**.
- **Componentes Visuais**:
  - **Lista de Mensagens Pendentes**:
    - Card com: Tipo (Solicitação de Cotação, Envio de Pedido de Compra, Confirmação/Recusa), Destinatário (Nome e WhatsApp do Representante), Distribuidora, Pré-visualização do texto exato com formatação WhatsApp (*bold*, quebras de linha, listas).
    - Tabela de itens, quantidades e valores vinculados.
  - **Ações de Controle**:
    - Botão *"Aprovar e Enviar Agora"* (aciona o envio via Baileys Compras).
    - Botão *"Editar Mensagem / Valores"* (abre modal para alterar texto, quantidade ou preços antes de despachar).
    - Botão *"Rejeitar / Descartar"* (cancela a mensagem e registra o log).
  - **Painel de Status do Alerta Duplo**:
    - Indica se o alerta imediato via WhatsApp já foi disparado para os Administradores com o link de ação rápida.

### Subseção 5: Painel de Pedidos de Compra e Controle Orçamentário
- **Objetivo**: Visualizar, imprimir e acompanhar espelhos de pedidos de compra e projetar o impacto financeiro no fluxo de caixa.
- **Componentes Visuais**:
  - **Espelho Formal do Pedido de Compra**:
    - Identificação completa: Número do Pedido, Distribuidora, Representante, CNPJ, Condição de Pagamento negociada, Previsão de Entrega.
    - Grade de Produtos: Código Digifarma, EAN, Descrição, Qtd, Preço Unitário, Bonificação, Subtotal Líquido.
    - Botões: *"Copiar Texto Formatado"*, *"Gerar PDF / Imprimir"*, *"Registrar Entrada de NF"*.
  - **Termômetro Orçamentário Mensal**:
    - Barra de progresso visual com: Teto Orçamentário Definido (R$), Total de Compras Já Faturadas no Mês (R$), Pedidos em Aberto / Pendentes (R$), Saldo Disponível Restante (R$).
  - **Calendário de Vencimentos de Boletos Projetados**:
    - Integração direta com Contas a Pagar/Boletos exibindo a projeção das datas de vencimento com base nos prazos negociados (ex: 28/35/42 dias).

### Subseção 6: Cadastro e Gestão de Representantes e Distribuidoras
- **Objetivo**: Manter base consolidada de contatos comerciais, condições de faturamento e histórico de desempenho.
- **Componentes Visuais**:
  - Tabela e cards de fornecedores integrados com a base de `FORNECEDORES` do Digifarma.
  - Campos gerenciáveis: Nome do Representante, Telefone WhatsApp Comercial, Prazos habituais de pagamento, Valor de Pedido Mínimo (R$), Categorias/Laboratórios representados, Score de Pontualidade (0-100), Histórico de Quebras e Pedidos Anteriores.
  - Modal de edição e cadastro rápido de novos representantes minerados pelo WhatsApp.

### Subseção 7: Conexão do WhatsApp Comercial (QR Code e Status)
- **Objetivo**: Controlar o pareamento e a saúde da instância isolada `baileys-compras-service.js`.
- **Componentes Visuais**:
  - Indicador de status em tempo real com badges animados:
    - *Conectado*: Verde pulsante, exibindo número comercial vinculado e latência.
    - *Desconectado / Aguardando QR*: Amarelo/Vermelho com renderização do QR Code em canvas/base64.
  - Card central com o QR Code dinâmico com auto-refresh a cada 20 segundos.
  - Botões de Ação: *"Reconectar / Novo QR Code"*, *"Desconectar Sessão"*, *"Testar Conexão"*.
  - Terminal de logs de eventos do Baileys Compras em tempo real.

---

## 5. Arquitetura da Instância Isolada `baileys-compras-service.js`

### 5.1 Princípios de Isolamento e Não Interferência
1. **Diretório de Sessão Próprio**:
   - `backend/baileys-session-compras` (Windows dev) e `backend/data/baileys-session-compras` (Linux VPS / Docker).
   - Não compartilha tokens, chaves criptográficas ou cache com `baileys-session` (Principal) ou `baileys-session-secondary`.
2. **Segregação Total de Chatbot de Vendas**:
   - Mensagens recebidas no WhatsApp Comercial de compras **nunca** disparam respostas automáticas de balcão (assistente de vendas ao cliente).
   - O handler `messages.upsert` encaminha o payload exclusivamente para o pipeline de mineração de compras (`compras-mining.service.js`).
3. **Trava Rígida de Envio**:
   - A função `sendTextMessage` e `sendMediaMessage` do serviço de compras só é acionada por chamadas autenticadas da rota de aprovação expressa (`POST /api/purchasing/approval/approve/:id`).
   - Nenhuma rotina em background tem permissão para enviar mensagens diretamente para fornecedores.

### 5.2 Estrutura do Módulo `backend/baileys-compras-service.js`

```javascript
/**
 * baileys-compras-service.js
 * Instância Isolada de WhatsApp Comercial para a Central de Compras.
 */

const path = require('path');
const fs = require('fs');

const SESSION_DIR = process.platform === 'win32'
  ? path.join(__dirname, 'baileys-session-compras')
  : path.join(__dirname, 'data', 'baileys-session-compras');

let sock = null;
let isConnected = false;
let isConnecting = false;
let lastQR = null;
let lastError = null;
let reconnectTimer = null;
let savedDb = null;

// Funções exportadas:
// - connect(db)
// - disconnect()
// - getStatus()
// - sendTextToSupplier(phone, text)
// - sendMediaToSupplier(phone, mediaPath, caption)
// - scanHistoryMessages(days)
```

### 5.3 Contrato de Endpoints REST para o WhatsApp Compras
| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `GET` | `/api/purchasing/whatsapp/status` | Retorna `{ connected, hasQR, phone, error }` |
| `GET` | `/api/purchasing/whatsapp/qrcode` | Retorna `{ hasQR: true, qrCode: "data:image/png;base64,..." }` |
| `POST` | `/api/purchasing/whatsapp/reconnect` | Reseta a pasta de sessão e gera novo QR Code limpo |
| `POST` | `/api/purchasing/whatsapp/disconnect` | Encerra a conexão do socket |
| `POST` | `/api/purchasing/whatsapp/scan-history` | Inicia varredura das conversas recentes de representantes |

---

## 6. Fluxo de Mineração e Fila de Aprovação com Alerta Duplo

### 6.1 Diagrama de Sequência do Fluxo de Aprovação e Alerta Duplo

```
[Módulo Compras / IA] 
         │
         ▼
[Cria Proposta de Cotação / Pedido]
         │
         ├──► 1. Salva em SQLite: `compras_fila_aprovacao` (status: 'pendente')
         │
         ├──► 2. Alerta Web: Notifica painel (Badge + Mural + Toast)
         │
         └──► 3. Alerta WhatsApp ADM: Dispara via WhatsApp Principal mensagem para os Admins
                 com o resumo da cotação e link de autorização rápida.
                         │
                         ▼
           [Administrador Revisa no Painel Web]
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
   [Aprovar e Enviar]               [Rejeitar / Editar]
         │                               │
         ▼                               ▼
[baileys-compras-service]         [Atualiza SQLite & Registra Log]
         │
         ▼
[Mensagem enviada ao Representante]
```

### 6.2 Estrutura da Tabela SQLite `compras_fila_aprovacao`
```sql
CREATE TABLE IF NOT EXISTS compras_fila_aprovacao (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,               -- 'cotacao', 'pedido', 'notificacao'
  destinatario_telefone TEXT NOT NULL,
  destinatario_nome TEXT NOT NULL,
  fornecedor_id TEXT,
  fornecedor_nome TEXT NOT NULL,
  mensagem_texto TEXT NOT NULL,
  dados_contexto TEXT,              -- JSON com itens, quantidades, valores e ranking
  status TEXT DEFAULT 'pendente',   -- 'pendente', 'aprovado', 'rejeitado', 'editado_enviado'
  notificado_admin INTEGER DEFAULT 0,
  admin_notificado_em TEXT,
  aprovado_por TEXT,
  aprovado_em TEXT,
  rejeitado_motivo TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

## 7. Recomendações Técnicas para Implementação

1. **Componentes React**:
   - Manter o padrão de Tailwind CSS já utilizado na aplicação (tons de `slate-50` a `slate-900`, acentos em `amber-500`/`orange-600` e `blue-600`, alertas em `red-600` e sucessos em `emerald-600`).
   - Evitar re-renders excessivos usando `useMemo` para ordenações e rankings ponderados.
   - Utilizar `useToast()` para todo feedback ao usuário em vez de diálogos nativos.
2. **Robustez no Baileys**:
   - Proteger o carregamento do `@whiskeysockets/baileys` com bloco `try/catch` (lazy load) para evitar falhas no servidor caso as dependências estejam sendo atualizadas.
   - Implementar reconexão com backoff e limpeza automática de pasta de sessão quando o código de erro indicar `loggedOut` (401) ou falha de chave de criptografia (`badSession`).
3. **Segurança e Transações Firebird**:
   - Todas as gravações de estoque mínimo no Digifarma devem ser feitas dentro de transações do Firebird com rollback automático caso ocorra interrupção de rede com o servidor.
