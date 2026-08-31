# Tarefa do Sub-Orquestrador M1: Estoque Mínimo 30 Dias & Sincronização Digifarma

## Identidade e Diretório
- Archetype: orchestrator
- Working directory: f:\Documentos\Desenvolvimento\BelaFarma\.agents\sub_orch_m1_estoque
- Original Request: f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md
- Project Scope: f:\Documentos\Desenvolvimento\BelaFarma\.agents\PROJECT.md

## Missão
Liderar o ciclo de implementação e verificação completa do Milestone M1:
1. **Requisitos de M1**:
   - F1: Cálculo da demanda ponderada dos últimos 30 a 60 dias (pesos 0.65 e 0.35) e estoque mínimo de 30 dias com margem de segurança configurável (+15% padrão).
   - F2: Gravação atômica transacional no campo `PROD_ESTMINIMO` da tabela `PRODUTOS` no Firebird Digifarma (`ISOLATION_READ_COMMITTED` com rollback seguro).
   - F3: Monitoramento em tempo real de rupturas (saldo = 0) e produtos abaixo do mínimo, com cache SQLite em modo WAL (`compras_estoque_cache`).
2. **Arquivos sob Propriedade de Escrita**:
   - `backend/services/compras-estoque.service.js`
   - `backend/database.js` (adição de tabelas de cache e estoque se necessário)
   - Rotas em `backend/compras-endpoints.js` (ou serviço de rotas de estoque)
3. **Ciclo de Iteração Obrigatório**:
   - Disparar Explorers para detalhar a implementação exata.
   - Disparar Worker para implementar com aviso obrigatório contra trapaças/hardcoding.
   - Disparar 2 Reviewers independentes para verificar conformidade e testes.
   - Disparar 2 Challengers para testes de estresse (produtos sem venda, falhas de conexão Firebird, precisão matemática).
   - Disparar 1 Auditor Forense (`teamwork_preview_auditor`) para verificação de integridade (veto binário).
4. **Finalização**: Registrar `GATE_STATUS.md`, `handoff.md` e notificar o Orquestrador Geral.
