# ✅ Checklist de Implementação - Sistema Foguete Amarelo

## 📋 Visão Geral
Este checklist guia a implementação completa do sistema Foguete Amarelo da Cimed.
Marque cada item conforme for concluindo.

---

## 🗄️ FASE 1: Banco de Dados (Estimativa: 1-2 horas)

### 1.1 Criar Tabelas Principais
- [ ] Abrir `backend/database.js`
- [ ] Adicionar tabela `invoices` (notas fiscais)
- [ ] Adicionar tabela `invoice_items` (produtos da nota)
- [ ] Adicionar tabela `sales` (vendas do PDV)
- [ ] Adicionar tabela `sale_items` (produtos vendidos)
- [ ] Adicionar tabela `foguete_amarelo_payments` (pagamentos antecipados)
- [ ] Adicionar tabela `accounts_payable` (contas a pagar unificada)

### 1.2 Criar Índices
- [ ] Índices para `invoices` (supplier, foguete, due_date)
- [ ] Índices para `invoice_items` (invoice_id, product_code)
- [ ] Índices para `sales` (sale_date, user_id, status)
- [ ] Índices para `sale_items` (sale_id, product_code)
- [ ] Índices para `foguete_amarelo_payments` (invoice_id, payment_date)

### 1.3 Testar Estrutura
- [ ] Executar migrations
- [ ] Verificar se todas as tabelas foram criadas
- [ ] Inserir dados de exemplo (usar script SQL fornecido)
- [ ] Validar relacionamentos (foreign keys)

**Arquivo de referência:** `.agent/knowledge/foguete_amarelo_database.sql`

---

## 🔧 FASE 2: Backend - API (Estimativa: 3-4 horas)

### 2.1 Endpoint: Cadastrar Nota Fiscal
- [ ] Criar `POST /api/invoices`
- [ ] Validar dados de entrada
- [ ] Calcular data de vencimento (+120 dias se FA)
- [ ] Inserir em `invoices`
- [ ] Inserir itens em `invoice_items`
- [ ] Criar título em `accounts_payable`
- [ ] Registrar log da operação
- [ ] Testar com Postman/Insomnia

### 2.2 Endpoint: Registrar Venda (PDV)
- [ ] Criar `POST /api/sales`
- [ ] Validar dados de entrada
- [ ] Iniciar transação do banco
- [ ] Para cada produto vendido:
  - [ ] Buscar lote (FIFO) em `invoice_items`
  - [ ] Verificar se é Foguete Amarelo
  - [ ] Se sim: Calcular custo da venda
  - [ ] Se sim: Criar pagamento antecipado (D+1)
  - [ ] Se sim: Atualizar `accounts_payable` (amortização)
  - [ ] Atualizar quantidade em `invoice_items`
  - [ ] Inserir em `sale_items`
- [ ] Inserir venda em `sales`
- [ ] Commit da transação
- [ ] Registrar log
- [ ] Testar com dados reais

### 2.3 Endpoint: Dashboard Foguete Amarelo
- [ ] Criar `GET /api/foguete-amarelo/dashboard`
- [ ] Query com JOIN de `invoices`, `accounts_payable`, `foguete_amarelo_payments`
- [ ] Calcular percentual de amortização
- [ ] Calcular dias até vencimento
- [ ] Retornar JSON formatado
- [ ] Testar retorno

### 2.4 Endpoint: Detalhes de Nota
- [ ] Criar `GET /api/foguete-amarelo/:invoiceId/details`
- [ ] Buscar informações da nota
- [ ] Buscar histórico de pagamentos antecipados
- [ ] Buscar itens da nota (produtos)
- [ ] Retornar JSON completo
- [ ] Testar com ID válido

### 2.5 Endpoints Auxiliares
- [ ] Criar `GET /api/invoices` (listar todas)
- [ ] Criar `GET /api/invoices/:id` (detalhes de uma)
- [ ] Criar `PUT /api/invoices/:id` (editar)
- [ ] Criar `DELETE /api/invoices/:id` (cancelar)
- [ ] Criar `GET /api/sales` (listar vendas)
- [ ] Criar `GET /api/sales/:id` (detalhes de venda)
- [ ] Criar `POST /api/sales/:id/cancel` (cancelar venda)

### 2.6 Lógica de Cancelamento de Venda
- [ ] Reverter quantidade em `invoice_items`
- [ ] Cancelar pagamentos antecipados relacionados
- [ ] Atualizar amortização em `accounts_payable`
- [ ] Marcar venda como cancelada
- [ ] Registrar log

**Arquivo de referência:** `.agent/knowledge/foguete_amarelo_implementation.md` (seção Pseudocódigo)

---

## 🎨 FASE 3: Frontend - Interface (Estimativa: 4-6 horas)

### 3.1 Componente: Formulário de Nota Fiscal
- [ ] Criar `components/InvoiceForm.tsx`
- [ ] Campo: Número da nota
- [ ] Campo: Fornecedor
- [ ] Campo: Data de emissão
- [ ] Campo: Valor total
- [ ] Checkbox: "É Foguete Amarelo?"
- [ ] Campo condicional: Data de vencimento (auto-calculada)
- [ ] Tabela de produtos (código, nome, qtd, custo)
- [ ] Botão: Adicionar produto
- [ ] Botão: Remover produto
- [ ] Validações de formulário
- [ ] Integração com API `POST /api/invoices`
- [ ] Toast de sucesso/erro
- [ ] Limpar formulário após salvar

### 3.2 Componente: Dashboard Foguete Amarelo
- [ ] Criar `components/FogueteAmareloMonitor.tsx`
- [ ] Buscar dados da API `GET /api/foguete-amarelo/dashboard`
- [ ] Renderizar cards para cada nota FA
- [ ] Exibir: Número da nota, fornecedor
- [ ] Exibir: Data de emissão, vencimento
- [ ] Exibir: Valor original, amortizado, restante
- [ ] Exibir: Percentual de amortização
- [ ] Barra de progresso visual
- [ ] Botão: "Ver Detalhes"
- [ ] Botão: "Histórico de Vendas"
- [ ] Filtros: Por fornecedor, por status
- [ ] Ordenação: Por vencimento, por valor

### 3.3 Componente: Modal de Detalhes
- [ ] Criar `components/FogueteAmareloDetailsModal.tsx`
- [ ] Buscar dados da API `GET /api/foguete-amarelo/:id/details`
- [ ] Seção: Informações da nota
- [ ] Seção: Produtos da nota (tabela)
- [ ] Seção: Histórico de pagamentos antecipados
- [ ] Exibir: Data, valor, venda relacionada, status
- [ ] Botão: Fechar modal
- [ ] Responsivo (mobile-friendly)

### 3.4 Atualizar: Contas a Pagar
- [ ] Abrir `components/ContasAPagar.tsx`
- [ ] Buscar também de `accounts_payable` (nova tabela)
- [ ] Adicionar badge "🚀 Foguete Amarelo" para notas FA
- [ ] Exibir valor amortizado e saldo restante
- [ ] Link para dashboard FA
- [ ] Atualizar filtros para incluir tipo "Nota Fiscal"

### 3.5 Criar: Página de Vendas (PDV)
- [ ] Criar `components/SalesPage.tsx`
- [ ] Campo: Buscar produto (por código ou nome)
- [ ] Tabela: Produtos adicionados ao carrinho
- [ ] Exibir: Nome, qtd, preço unitário, total
- [ ] Botão: Remover produto
- [ ] Campo: Método de pagamento
- [ ] Campo: Cliente (opcional)
- [ ] Exibir: Total da venda
- [ ] Botão: Finalizar venda
- [ ] Integração com API `POST /api/sales`
- [ ] Alerta se produto for Foguete Amarelo
- [ ] Toast de sucesso/erro
- [ ] Limpar carrinho após venda

### 3.6 Atualizar: Menu Principal
- [ ] Abrir `components/Sidebar.tsx`
- [ ] Adicionar item: "Notas Fiscais"
- [ ] Adicionar item: "Foguete Amarelo"
- [ ] Adicionar item: "Vendas (PDV)"
- [ ] Ícones apropriados

### 3.7 Atualizar: Roteamento
- [ ] Abrir `App.tsx`
- [ ] Adicionar rota: `/invoices` → `InvoiceForm`
- [ ] Adicionar rota: `/foguete-amarelo` → `FogueteAmareloMonitor`
- [ ] Adicionar rota: `/sales` → `SalesPage`
- [ ] Atualizar tipo `View` em `types.ts`

### 3.8 Criar: Estilos CSS
- [ ] Criar `components/FogueteAmareloMonitor.css`
- [ ] Estilo para cards de nota
- [ ] Estilo para barra de progresso
- [ ] Estilo para badges
- [ ] Cores: Amarelo para FA, verde para amortizado
- [ ] Responsividade mobile

**Arquivo de referência:** `.agent/knowledge/foguete_amarelo_implementation.md` (seção Interface do Usuário)

---

## 🧪 FASE 4: Testes e Validações (Estimativa: 2-3 horas)

### 4.1 Testes de Backend
- [ ] Testar cadastro de nota normal
- [ ] Testar cadastro de nota Foguete Amarelo
- [ ] Testar venda de produto normal
- [ ] Testar venda de produto Foguete Amarelo
- [ ] Validar cálculo de custo
- [ ] Validar criação de pagamento D+1
- [ ] Validar amortização do saldo
- [ ] Testar venda com múltiplos produtos
- [ ] Testar venda com produtos de notas diferentes
- [ ] Testar cancelamento de venda
- [ ] Validar reversão de amortização
- [ ] Testar consulta ao dashboard
- [ ] Testar consulta de detalhes

### 4.2 Testes de Frontend
- [ ] Testar formulário de nota (validações)
- [ ] Testar checkbox Foguete Amarelo
- [ ] Testar cálculo automático de vencimento
- [ ] Testar adição/remoção de produtos
- [ ] Testar salvamento de nota
- [ ] Testar carregamento do dashboard
- [ ] Testar exibição de cards
- [ ] Testar barra de progresso
- [ ] Testar modal de detalhes
- [ ] Testar página de vendas
- [ ] Testar busca de produtos
- [ ] Testar finalização de venda
- [ ] Testar integração com Contas a Pagar

### 4.3 Testes de Fluxo Completo
- [ ] Cadastrar nota FA com 3 produtos
- [ ] Vender 1 produto da nota
- [ ] Verificar criação de pagamento D+1
- [ ] Verificar amortização no dashboard
- [ ] Vender mais produtos
- [ ] Verificar atualização em tempo real
- [ ] Cancelar uma venda
- [ ] Verificar reversão da amortização
- [ ] Testar com múltiplas notas FA simultâneas

### 4.4 Testes de Edge Cases
- [ ] Vender quantidade maior que estoque
- [ ] Vender produto sem lote rastreado
- [ ] Cancelar nota com vendas já realizadas
- [ ] Nota com vencimento passado
- [ ] Produto em múltiplas notas (FIFO)
- [ ] Valores decimais (ex: 1.5 unidades)

### 4.5 Validações de Cálculo
- [ ] Validar custo = quantidade × custo_unitário
- [ ] Validar amortização = soma de todos os pagamentos
- [ ] Validar saldo = original - amortizado
- [ ] Validar percentual = (amortizado / original) × 100
- [ ] Validar data D+1 = data_venda + 1 dia

---

## 📚 FASE 5: Documentação e Treinamento (Estimativa: 1-2 horas)

### 5.1 Documentação Técnica
- [ ] Documentar endpoints da API
- [ ] Documentar estrutura do banco
- [ ] Documentar fluxo de dados
- [ ] Documentar regras de negócio
- [ ] Criar diagrama de arquitetura

### 5.2 Manual do Usuário
- [ ] Criar guia: Como cadastrar nota FA
- [ ] Criar guia: Como realizar venda
- [ ] Criar guia: Como consultar dashboard
- [ ] Criar guia: Como interpretar amortização
- [ ] Criar FAQ para usuários finais

### 5.3 Treinamento
- [ ] Treinar equipe no cadastro de notas
- [ ] Treinar equipe no PDV
- [ ] Treinar equipe na consulta ao dashboard
- [ ] Demonstrar casos de uso reais

---

## 🚀 FASE 6: Deploy e Monitoramento (Estimativa: 1 hora)

### 6.1 Preparação para Deploy
- [ ] Revisar código
- [ ] Remover console.logs desnecessários
- [ ] Otimizar queries SQL
- [ ] Testar em ambiente de staging
- [ ] Fazer backup do banco de dados

### 6.2 Deploy
- [ ] Fazer merge para branch principal
- [ ] Deploy do backend
- [ ] Deploy do frontend
- [ ] Verificar funcionamento em produção

### 6.3 Monitoramento
- [ ] Monitorar logs de erro
- [ ] Verificar performance das queries
- [ ] Coletar feedback dos usuários
- [ ] Ajustar conforme necessário

---

## 📊 Resumo de Progresso

**Total de Tarefas:** ~150  
**Tarefas Concluídas:** 0  
**Progresso:** 0%

**Tempo Estimado Total:** 12-18 horas

---

## 🎯 Prioridades

### Alta Prioridade (Fazer Primeiro)
1. Criar tabelas do banco de dados
2. Implementar endpoint de venda com lógica FA
3. Criar dashboard de monitoramento

### Média Prioridade
4. Criar formulário de cadastro de nota
5. Criar página de vendas (PDV)
6. Integrar com Contas a Pagar

### Baixa Prioridade (Pode Fazer Depois)
7. Relatórios avançados
8. Notificações automáticas
9. Exportação de dados

---

## 💡 Dicas de Implementação

1. **Comece pelo banco de dados** - É a base de tudo
2. **Teste cada endpoint** antes de passar para o próximo
3. **Use dados de exemplo** para validar a lógica
4. **Implemente em pequenos incrementos** - não tente fazer tudo de uma vez
5. **Faça commits frequentes** com mensagens descritivas
6. **Documente conforme desenvolve** - não deixe para depois

---

## 🆘 Quando Pedir Ajuda

Peça ajuda se:
- [ ] Encontrar erro que não consegue resolver em 30 minutos
- [ ] Não entender alguma parte da lógica
- [ ] Precisar de clarificação sobre requisitos
- [ ] Quiser validar sua implementação antes de continuar

---

**Última atualização:** 08/02/2026  
**Versão do checklist:** 1.0
