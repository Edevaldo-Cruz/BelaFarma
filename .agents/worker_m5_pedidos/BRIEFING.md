# BRIEFING — 2026-08-29T14:28:00-03:00

## Mission
Implementar backend/services/compras-pedidos.service.js com geração de espelhos formais de pedidos de compra organizados por distribuidora vencedora, controle orçamentário mensal (monthly_limits) e projeção de vencimento de boletos no Contas a Pagar.

## 🔒 My Identity
- Archetype: teamwork_preview_worker
- Roles: implementer, qa, specialist
- Working directory: f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m5_pedidos
- Original parent: 78620ac3-2868-4b6e-896d-c2c6e6f842ea
- Milestone: M5 (Pedidos de Compra & Controle Orçamentário)

## 🔒 Key Constraints
- DO NOT CHEAT. All implementations must be genuine.
- Zero `alert()` no frontend (usar toasts e modais).
- Servidor de produção local Raspberry Pi 4 (192.168.1.70).
- Modo WAL no SQLite (`backend/database.js`).
- Testes automatizados robustos cobrindo 100% dos requisitos M5 / R5 / F13, F14.

## Current Parent
- Conversation ID: 78620ac3-2868-4b6e-896d-c2c6e6f842ea
- Updated: 2026-08-29T14:26:00-03:00

## Task Summary
- **What to build**:
  1. `backend/services/compras-pedidos.service.js` (geração de espelhos formais de pedidos, validação e trava orçamentária contra `monthly_limits`, projeção e vinculação de boletos em `boletos`/`orders`).
  2. Ajustes de schema em `backend/database.js` (`compras_pedidos`, `compras_pedidos_itens`, índices).
  3. Suíte de testes `backend/test_compras_m5.js` cobrindo todos os cenários, corner cases e integrações.
- **Success criteria**:
  - Geração de espelho formal completo com código, EAN, descrição, quantidade, preço unitário, bonificação, condição de pagamento e previsão de entrega.
  - Exportação de texto formatado para WhatsApp/cópia rápida.
  - Validação estrita de teto orçamentário mensal com cálculo de comprometido/disponível e trava de estouro.
  - Projeção de boletos (parcelamento flexível) e vinculação no Contas a Pagar.
  - Todos os testes M5 e E2E passando com 100% de sucesso.
- **Interface contracts**: `PROJECT.md` § 5
- **Code layout**: `PROJECT.md` § Code Layout

## Change Tracker
- **Files modified**:
  - `backend/database.js`: Adicionada tabela `compras_pedidos_itens`, índices de suporte e migrações seguras de colunas em `compras_pedidos`.
  - `backend/services/compras-pedidos.service.js`: Implementado serviço completo de espelhos, orçamento e projeção de boletos.
  - `backend/test_compras_m5.js`: Criada suíte com 32 testes cobrindo F13, F14, integração e corner cases.
- **Build status**: PASS (32/32 testes M5 e 160/160 testes E2E aprovados)
- **Pending issues**: none

## Quality Status
- **Build/test result**: PASS (100% de cobertura nos requisitos M5)
- **Lint status**: OK
- **Tests added/modified**: `backend/test_compras_m5.js` (32 testes automatizados)

## Loaded Skills
- None requested

## Key Decisions Made
- `numeroPedido` usa prefixo `PED_` com timestamp e sufixo aleatório único para garantir unicidade estrita mesmo em chamadas de alta concorrência.
- Divisão de boletos preserva a soma exata de centavos compensando qualquer dízima fracionária na última parcela.
- Suporte a injeção flexível de banco de dados SQLite para permitir isolamento em testes e interoperabilidade em produção.

## Artifact Index
- `backend/services/compras-pedidos.service.js` — Serviço central de pedidos e controle orçamentário
- `backend/database.js` — Schema das tabelas de pedidos de compras
- `backend/test_compras_m5.js` — Suíte de testes automatizados do Worker M5
- `handoff.md` — Relatório formal de handoff
