# Project: Central de Compras BelaFarma

## Architecture

O módulo "Central de Compras" é uma solução autônoma, resiliente e unificada dentro da plataforma BelaFarma, composta por três camadas principais:

1. **Camada de Dados & Inteligência de Estoque (Backend & Firebird)**:
   - Sincronização e gravação atômica direta no banco de dados Firebird do ERP Digifarma (`192.168.1.10:3050` ou rede local) no campo `PROD_ESTMINIMO` da tabela `PRODUTOS`.
   - Cálculo de Demanda/CMV ponderado dos últimos 30 a 60 dias com margem de segurança configurável (padrão +15%).
   - Persistência de cache, cotações, oportunidades, fila de aprovação e pedidos em SQLite local (`backend/database.js` em modo WAL).

2. **Camada de Comunicação & WhatsApp Comercial (Baileys Isolado)**:
   - Instância independente `baileys-compras-service.js` com pasta de sessão exclusiva `backend/baileys-session-compras`.
   - Isolamento estrito de 100% dos fluxos de atendimento a clientes de varejo e impressão de etiquetas.
   - Mineração e indexação contínua de histórico de conversas com representantes (fornecedores, prazos, pedido mínimo, tabelas).
   - Motor de Cotações com Score Ponderado (60% Preço Líquido, 25% Prazo/Orçamento, 15% Pontualidade/Quebra) e otimização de pedido mínimo.

3. **Camada de Governança & Fila de Aprovação (Human-in-the-Loop)**:
   - Fila de Aprovação Obrigatória (`compras_fila_aprovacao`): NENHUMA mensagem externa é disparada no WhatsApp sem autorização expressa do administrador.
   - Sistema de Alerta Duplo: Notificação em tempo real na interface web e disparo de resumo com link de ação rápida no WhatsApp dos Administradores.
   - Geração de espelhos de Pedidos de Compra integrados ao Orçamento Mensal e Contas a Pagar.

4. **Camada de Apresentação Web (Frontend React & TypeScript)**:
   - Guia unificada "Central de Compras" (`components/CentralCompras.tsx`) no `Sidebar.tsx` e `App.tsx` com 7 sub-abas completas.
   - Conformidade total com as regras de UI: zero `alert()` (uso de Toasts/Modais) e layout mobile do cabeçalho com logo no topo e barra de navegação/busca na segunda linha.

---

## Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Cálculo Ponderado de Estoque Mínimo (30 dias) | Calcula a demanda diária dos últimos 30 a 60 dias (pesos 0.65 e 0.35) e projeta estoque mínimo para 30 dias com margem de segurança (+15% padrão). | M1 | R1 / Survey |
| F2 | Gravação Atômica no Firebird Digifarma | Atualiza o campo `PROD_ESTMINIMO` na tabela `PRODUTOS` via transação `READ_COMMITTED` com rollback seguro em caso de falha. | M1 | R1 / Survey |
| F3 | Monitoramento de Ruptura e Faltas | Sinaliza produtos com estoque zero (ruptura) ou abaixo do mínimo calculado em tempo real com fallback para cache local. | M1 | R1 / Survey |
| F4 | Instância Isolada Baileys WhatsApp Compras | Serviço `baileys-compras-service.js` com pasta `baileys-session-compras`, QR Code, status e reconexão automática resiliente. | M2 | R2 / Survey |
| F5 | Mineração de Histórico de Conversas de Representantes | Varre conversas antigas do WhatsApp comercial e cadastra representantes, distribuidoras, prazos médios de pagamento, pedidos mínimos e catálogos. | M2 | R2 / Survey |
| F6 | Indexador Contínuo de Oportunidades & Ofertas | Monitora novas mensagens/encartes recebidos, cruza com lista de faltas e valida se o preço ofertado é inferior à última compra no Digifarma. | M2 | R2 / Survey |
| F7 | Geração Contextual de Solicitações de Cotação | Identifica fornecedores por produto/categoria e redige mensagens profissionais de solicitação de cotação respeitando o histórico. | M3 | R3 / Survey |
| F8 | Motor de Ranking Ponderado de Cotações | Aplica Score Ponderado: 60% Menor Preço Líquido (com bonificações), 25% Prazo/Orçamento, 15% Histórico de Pontualidade/Quebra. | M3 | R3 / Survey |
| F9 | Otimização Automática de Pedido Mínimo | Simula preenchimento com outros itens necessários do fornecedor ou realoca para o 2º melhor colocado global calculando o custo-benefício. | M3 | R3 / Survey |
| F10 | Gestão de Quebras e Fallback de Cotação | Repassa automaticamente a vez para o segundo colocado se o fornecedor vencedor não responder ou informar falta. | M3 | R3 / Survey |
| F11 | Fila de Aprovação Obrigatória de Mensagens | Nenhuma mensagem externa é enviada sem aprovação humana prévia na interface web (revisão de texto, itens e valores). | M4 | R4 / Survey |
| F12 | Sistema de Alerta Duplo (Web & WhatsApp ADM) | Badge/alerta em tempo real na interface web e mensagem de notificação com link de autorização rápida no WhatsApp dos Administradores. | M4 | R4 / Survey |
| F13 | Elaboração de Espelhos de Pedidos de Compra | Gera espelhos formais de pedidos por distribuidora (código, EAN, descrição, quantidade, preço unitário, bonificações, prazos e entrega). | M5 | R5 / Survey |
| F14 | Controle Orçamentário e Integração Financeira | Projeta gastos no teto do Orçamento Mensal da farmácia e agenda vencimentos de boletos no Contas a Pagar. | M5 | R5 / Survey |
| F15 | Interface Web Unificada "Central de Compras" | Tela principal `CentralCompras.tsx` com navegação por sub-abas para as 7 seções completas, integrada ao menu lateral e responsiva. | M6 | R5 / Survey |
| F16 | Trilha de Testes E2E e Hardening Adversarial | Suíte abrangente de testes automatizados nos Tiers 1-4 e validação adversarial no Tier 5 garantindo 100% de conformidade e integridade. | M7 / E2E Track | R1-R5 / Protocol |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Criação da infraestrutura de testes opaque-box (`TEST_INFRA.md`), casos de teste Tiers 1 a 4 e publicação de `TEST_READY.md`. | none | DONE |
| M1 | Estoque Mínimo 30 Dias & Sync Digifarma | Cálculo ponderado de CMV (30-60d + 15%), gravação atômica em `PRODUTOS.PROD_ESTMINIMO` no Firebird e monitoramento de faltas/rupturas. | none | DONE |
| M2 | WhatsApp Compras Isolado & Mineração Histórica | Instância Baileys dedicada (`baileys-session-compras`), QR Code, mineração de representantes/prazos/pedidos mínimos e indexação de ofertas. | none | DONE |
| M3 | Motor de Cotações, Ranking & Pedido Mínimo | Score Ponderado (60/25/15), redação de cotações, otimização de faturamento mínimo e fallback de quebras para 2º colocado. | M1, M2 | DONE |
| M4 | Fila de Aprovação Obrigatória & Alerta Duplo | Tabela `compras_fila_aprovacao`, interceptação de envios, revisão web de mensagens e alerta rápido no WhatsApp ADM. | M2, M3 | DONE |
| M5 | Pedidos de Compra & Controle Orçamentário | Geração formal de espelhos de pedidos por distribuidora, integração com `monthly_limits` e fluxo de Contas a Pagar. | M1, M3 | DONE |
| M6 | Interface Web Unificada Central de Compras | Componente `CentralCompras.tsx` com as 7 sub-abas, integração em `Sidebar.tsx`, `App.tsx`, toasts/modais sem `alert()`, layout mobile e desktop. | M1, M2, M3, M4, M5 | DONE |
| M7 | Validação E2E Final & Hardening Adversarial | Aprovação de 100% dos testes E2E (Tiers 1-4) e hardening de cobertura adversarial (Tier 5 com auditoria de integridade forense). | E2E, M1-M6 | DONE |

---

## Interface Contracts

### 1. Backend Estoque & Digifarma (`backend/services/compras-estoque.service.js`)
- `calcularEstoqueMinimo30Dias(produtoId, margemSegurancaPercent = 15)` -> `{ produtoId, vmdPonderado, estoqueMinimoSugerido, estoqueAtual, statusRuptura }`
- `sincronizarEstoqueMinimoDigifarma(produtoId, estoqueMinimo)` -> `{ success: boolean, rowsAffected: number, error?: string }`
- `listarProdutosAbaixoDoMinimo(filtros)` -> `Array<{ produtoId, descricao, ean, saldo, estMinimo, status, curvaAbc, ultimaCompra }>`

### 2. WhatsApp Comercial Baileys (`backend/baileys-compras-service.js`)
- `initComprasBaileys()` -> `Promise<void>`
- `getComprasConnectionStatus()` -> `{ status: 'connected' | 'connecting' | 'disconnected' | 'qr_ready', qrCode: string | null }`
- `minerarHistoricoConversas()` -> `Promise<{ representantesCadastrados: number, ofertasIndexadas: number, condicoesMapeadas: number }>`
- `enviarMensagemAprovada(approvalId)` -> `Promise<{ success: boolean, messageId: string, timestamp: string }>`

### 3. Motor de Cotações & Ranking (`backend/services/compras-cotacoes.service.js`)
- `gerarSolicitacaoCotacao(listaProdutosIds)` -> `Array<{ fornecedorId, fornecedorNome, telefone, mensagemTexto, produtos: [] }>`
- `calcularScoreFornecedor({ precoLiquido, prazoDias, tetoOrcamento, taxaQuebraHistorica })` -> `number` (0 a 100)
- `otimizarPedidoMinimo(cotacoesPorFornecedor)` -> `{ alocacaoVencedora: [], simulacaoPedidoMinimo: [], realocacoes: [] }`
- `tratarQuebraFornecedor(cotacaoId, fornecedorId)` -> `{ novoVencedorId, status: 'reallocated' }`

### 4. Fila de Aprovação & Alertas (`backend/services/compras-aprovacao.service.js`)
- `enfileirarMensagem({ tipo, destinatario, fornecedorId, conteudo, dadosCotacao, criadoPor })` -> `{ approvalId, status: 'pendente' }`
- `listarFilaAprovacao(status = 'pendente')` -> `Array<ApprovalItem>`
- `aprovarMensagem(approvalId, usuarioAprovador, textoModificado?)` -> `Promise<{ status: 'aprovado', enviado: boolean }>`
- `rejeitarMensagem(approvalId, motivo)` -> `{ status: 'rejeitado', motivo }`
- `notificarAdministradoresWhatsApp(approvalId)` -> `Promise<void>`

### 5. Pedidos de Compra & Orçamento (`backend/services/compras-pedidos.service.js`)
- `gerarEspelhoPedido(distribuidoraId, cotacaoVencedoraId)` -> `PedidoCompraEspelho`
- `validarTetoOrcamentario(valorTotalPedido, mesReferencia)` -> `{ permitido: boolean, limiteMensal: number, comprometido: number, disponivel: number }`
- `vincularBoletosContasAPagar(pedidoId, parcelas)` -> `{ boletosGerados: Array<{ valor, vencimento, fornecedor }> }`

### 6. Rotas REST da Central de Compras (`backend/compras-endpoints.js`)
- `GET /api/central-compras/dashboard`: Métricas de estoque, faltas, cotações abertas, aprovações pendentes e orçamento.
- `GET /api/central-compras/estoque/minimo`: Lista de produtos com cálculo de 30 dias e status de sincronização.
- `POST /api/central-compras/estoque/sync-digifarma`: Dispara gravação atômica em lote ou unitária no Firebird.
- `GET /api/central-compras/whatsapp/status` & `/qrcode`: Estado da instância Baileys de compras.
- `POST /api/central-compras/whatsapp/minerar`: Dispara mineração de histórico.
- `GET /api/central-compras/cotacoes`: Lista e detalhes de cotações e rankings.
- `POST /api/central-compras/cotacoes/criar`: Cria solicitação de cotação e encaminha para fila de aprovação.
- `GET /api/central-compras/aprovacoes/pendentes`: Itens pendentes de aprovação humana.
- `POST /api/central-compras/aprovacoes/:id/aprovar`: Aprova e dispara via Baileys comercial.
- `POST /api/central-compras/aprovacoes/:id/rejeitar`: Rejeita mensagem.
- `GET /api/central-compras/pedidos`: Lista de espelhos de pedidos e orçamentos.
- `POST /api/central-compras/pedidos/gerar`: Converte cotação aprovada em pedido de compra formal.
- `GET /api/central-compras/fornecedores`: Gestão de representantes e distribuidoras.

---

## Code Layout

- `backend/services/compras-estoque.service.js`: Lógica de estoque mínimo de 30 dias, CMV e sync Firebird.
- `backend/services/compras-mineracao.service.js`: Extração de representantes, condições e ofertas de conversas.
- `backend/services/compras-cotacoes.service.js`: Motor de cotações, ranking ponderado (60/25/15) e pedido mínimo.
- `backend/services/compras-aprovacao.service.js`: Gestão da fila de aprovação humana e alerta duplo.
- `backend/services/compras-pedidos.service.js`: Espelhos de pedidos e controle orçamentário.
- `backend/baileys-compras-service.js`: Instância isolada do WhatsApp Comercial de Compras.
- `backend/compras-endpoints.js`: Rotas express integradas ao servidor.
- `components/CentralCompras.tsx`: Componente React principal da Central de Compras com as 7 sub-abas.
- `components/compras/`: Subcomponentes especializados:
  - `ComprasDashboard.tsx`: Visão geral de estoque mínimo, faltas e KPIs.
  - `ComprasMineracao.tsx`: Mineração de oportunidades e histórico de conversas.
  - `ComprasCotacoes.tsx`: Central de cotações, comparador e ranking.
  - `ComprasAprovacaoFila.tsx`: Fila de mensagens pendentes com ações rápidas.
  - `ComprasPedidosPainel.tsx`: Espelhos formais de pedidos e controle de orçamento.
  - `ComprasRepresentantes.tsx`: Cadastro de representantes e distribuidoras.
  - `ComprasWhatsAppConexao.tsx`: Pareamento QR Code e status da conexão comercial.
- `test_compras_e2e.js`: Suíte de testes E2E para todos os tiers (1 a 4).
