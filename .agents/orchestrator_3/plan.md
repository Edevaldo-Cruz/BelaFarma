# Plano de Implementação — Central de Compras BelaFarma

## 1. Visão Geral
Construção do módulo unificado "Central de Compras" integrando:
- Inteligência de Estoque Mínimo 30 dias (CMV ponderado + margem de segurança) e gravação no Firebird Digifarma (`PRODUTOS`).
- Instância isolada Baileys para WhatsApp Comercial (`baileys-session-compras`).
- Mineração de histórico de conversas antigas (representantes, prazos, pedido mínimo, catálogo).
- Motor de Cotações com Score Ponderado (60% preço líquido, 25% prazo/orçamento, 15% pontualidade/quebra), otimização de pedido mínimo e gestão de quebras.
- Fila de Aprovação Obrigatória (Web + Alerta WhatsApp ADM) — NENHUM envio externo sem aprovação prévia.
- Espelhos formais de Pedidos de Compra e integração com Orçamento Mensal / Contas a Pagar.
- Interface Web unificada "Central de Compras" com 7 subseções.

## 2. Fases de Execução

### Fase 0: Survey e Mapeamento de Arquitetura (Explorers paralelos)
- Explorer 1: Mapeamento de Backend, Serviços existentes (delivery-service, chatbot, APIs, Node.js packages, rotas).
- Explorer 2: Mapeamento da integração com Firebird / Digifarma (conexão, queries, tabela `PRODUTOS`, campos de estoque e compras, transações).
- Explorer 3: Mapeamento do Frontend Web (React / Vite / Next / dashboard, rotas, componentes, temas, menus, modais, toasts) e arquitetura WhatsApp Baileys existente.

### Fase 1: Síntese e Consolidação de PROJECT.md
- Elaboração do inventário exaustivo de funcionalidades (R1 a R5 + regras de integridade e usabilidade).
- Definição dos contratos de interface entre backend, frontend, Baileys e Firebird.
- Decomposição em Milestones estruturados.

### Fase 2: Trilha Paralela de Testes E2E (E2E Testing Track)
- Criação de `TEST_INFRA.md`.
- Construção de testes em 4 Tiers (Feature Coverage, Boundary/Corner, Pairwise/Cross-feature, Real-World Workload).
- Publicação de `TEST_READY.md`.

### Fase 3: Trilha de Implementação (Sub-Orquestradores por Milestone)
- Ciclo rigoroso por Milestone: Explorer -> Worker -> Reviewers (2) -> Challengers (2) -> Auditor -> Gate.
- Monitoramento de integridade e aderência a zero alertas, zero bypass.

### Fase 4: Validação Final e Hardening Adversarial (Tier 5)
- Execução de 100% dos testes E2E.
- Adversarial coverage audit com Challengers + Workers.

### Fase 5: Handoff e Apresentação Final
- Relatório de entrega completo e síntese estruturada.
