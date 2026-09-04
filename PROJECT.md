# Project: Motor de Busca e Inteligência de Estoque de Medicamentos (BelaFarma)

## Architecture
- **Banco de Dados**: SQLite local em modo WAL (`data/belafarma.db` via `backend/database.js` com `better-sqlite3`).
- **Conexão Externa**: Firebird Digifarma (`192.168.1.10:3050`) com pool de 10 conexões, circuit breaker de 20s e fallback transparente para cache SQLite.
- **Camada de Serviços**:
  - `backend/services/medicamentos-busca.service.js`: Motor unificado de busca, inteligência de estoque (30d/2x), resolução de preços vigentes e sincronização em lote.
  - `backend/services/compras-estoque.service.js`: Ajuste de fórmulas de estoque mínimo (30 dias sem ruptura) e máximo (2x), com compatibilidade para testes existentes.
  - `backend/services/horacio-agent.service.js`: Geração proativa de relatório executivo matinal/vespertino pós-sync e validação reativa de cotações.
  - `backend/services/compras-mineracao.service.js`: Consulta unificada em `compras_estoque_cache` para ofertas do WhatsApp.
- **Camada de API REST**:
  - `backend/medicamentos-endpoints.js`: Montado em `/api/medicamentos` em `backend/server.js`.
- **Agendamento**:
  - `node-cron` configurado para 07:30 e 17:30 (horário de Brasília) em `backend/server.js`.
- **Testes**:
  - `backend/test_motor_busca_medicamentos.js` cobrindo 100% dos requisitos R1-R5.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Schema Consolidado | Adicionar 11 colunas na tabela `compras_estoque_cache` (SQLite) com DDL idempotente | M1 | R1 |
| 2 | Índices e Performance | Validar índices (`ean`, `descricao`, `curva_abc`, `status_ruptura`) garantindo busca < 10ms | M1 | R1 |
| 3 | Estoque Mínimo 30 Dias | Calcular `est_minimo_calculado` como `Math.ceil(VMD_P * 30 * (1 + margem/100))` | M2 | R2 |
| 4 | Estoque Máximo 2x | Fixar `est_maximo_calculado` estritamente como `est_minimo_calculado * 2` | M2 | R2 |
| 5 | Quantidade Sugerida | Calcular `qtd_sugerida_compra = Math.max(0, est_minimo_calculado - saldo)` | M2 | R2 |
| 6 | Matriz de 4 Status | Classificar em `RUPTURA` (saldo <= 0), `ABAIXO_MINIMO` (0 < saldo < min), `NORMAL` (min..max), `EXCESSO` (> max) | M2 | R2 |
| 7 | Preço de Venda Vigente | Resolver promoção ativa (dentro da vigência) vs preço normal | M2 | R1/R2 |
| 8 | Sincronização em Lote | Extrair do Firebird catálogo, vendas 30/60/90d, promoções e notas de entrada | M2 | R3 |
| 9 | Resiliência Offline | Se Firebird estiver inacessível/offline, continuar 100% operacional via SQLite sem 500 | M2 | R3 |
| 10 | Motor de Busca REST | Implementar `GET /api/medicamentos/busca` com busca flexível, filtros e paginação | M3 | R4 |
| 11 | Detalhe de Medicamento | Implementar `GET /api/medicamentos/:id` (com fallback por EAN) | M3 | R4 |
| 12 | Listagem de Rupturas | Implementar `GET /api/medicamentos/rupturas` com quantidade necessária para 30 dias | M3 | R4 |
| 13 | Endpoint Sincronizar | Implementar `POST /api/medicamentos/sincronizar` sob demanda | M3 | R3/R4 |
| 14 | Agendamento 2x ao dia | Configurar cron para 07:30 e 17:30 em `server.js` | M3 | R3 |
| 15 | Horácio Proativo | Compilar itens críticos pós-sync e acionar Horácio para relatório executivo de compras | M4 | R5 |
| 16 | Horácio & Mineração Reativo | Atualizar Horácio e mineração para usar busca unificada como fonte única da verdade | M4 | R5 |
| 17 | Testes E2E Automatizados | Criar `backend/test_motor_busca_medicamentos.js` cobrindo 100% dos requisitos R1-R5 | M5 | Verification |
| 18 | Regressão Zero | Garantir que testes legados (`test_ultimas_compras_mineracao.js`, `test_compras_estoque.js`) passem | M5 | Verification |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Schema e Modelo Consolidado | DDL idempotente em `backend/database.js` (11 colunas e índices) | none | DONE |
| M2 | Inteligência de Estoque e Sync Resiliente | `medicamentos-busca.service.js` (30d/2x, preço vigente, sync Firebird e resiliência offline) e ajuste em `compras-estoque.service.js` | M1 | DONE |
| M3 | Endpoints REST e Agendador Cron | `backend/medicamentos-endpoints.js` e montagem de rotas/cron em `backend/server.js` | M2 | IN_PROGRESS |
| M4 | Integração com Agente Horácio e Mineração | Fluxo proativo pós-sync e consumo reativo em `horacio-agent.service.js` e `compras-mineracao.service.js` | M2, M3 | PLANNED |
| M5 | Testes E2E e Hardening de Qualidade | `backend/test_motor_busca_medicamentos.js` e validação completa sem quebras | M1, M2, M3, M4 | PLANNED |

## Code Layout
- `backend/database.js`: Tabela `compras_estoque_cache` e migrações idempotentes de colunas.
- `backend/services/medicamentos-busca.service.js`: Lógica de busca rápida, cálculo de inteligência (30d/2x), resolução de preço vigente e sincronização resiliente.
- `backend/services/compras-estoque.service.js`: Ajustes nas fórmulas de reposição (30d sem ruptura, dobro no máximo) preservando retrocompatibilidade.
- `backend/medicamentos-endpoints.js`: Roteador Express contendo endpoints `/busca`, `/:id`, `/rupturas` e `/sincronizar`.
- `backend/server.js`: Registro do roteador `/api/medicamentos` e agendamento cron 2x ao dia (`30 7,17 * * *`).
- `backend/services/horacio-agent.service.js`: Método `gerarRelatorioExecutivoSincronizacao` e consulta unificada ao cache.
- `backend/services/compras-mineracao.service.js`: Consulta unificada em `compras_estoque_cache` para cotações e ofertas.
- `backend/test_motor_busca_medicamentos.js`: Suíte de testes automatizados E2E cobrindo 100% de R1 a R5.
