# DISPATCH — Worker M3 & M4 (Endpoints REST, Cron Agendado e Integração com Agente Horácio)

Você é o Worker responsável pela implementação conjunta dos Milestones M3 e M4:
- M3: Endpoints REST Express (`/api/medicamentos/*`) e agendamento cron 2x ao dia em `backend/server.js`.
- M4: Integração do Agente Horácio (relatório proativo pós-sync e consumo reativo em cotações e mineração).

Seu diretório exclusivo de trabalho é:
`f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m3_m4`

Arquivos sob sua posse exclusiva de escrita:
- `backend/medicamentos-endpoints.js` (criar novo arquivo)
- `backend/server.js` (montar rota e adicionar cron)
- `backend/services/horacio-agent.service.js` (adicionar relatório proativo e consumo reativo)
- `backend/services/compras-mineracao.service.js` (atualizar consumo reativo para usar busca unificada)

LEIA OS DOCUMENTOS OBRIGATÓRIOS:
- `f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md` (seção '## 2026-09-04T12:09:33Z')
- `f:\Documentos\Desenvolvimento\BelaFarma\PROJECT.md`
- `f:\Documentos\Desenvolvimento\BelaFarma\TEST_READY.md`
- `f:\Documentos\Desenvolvimento\BelaFarma\backend\test_motor_busca_medicamentos.js`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work.

OBJETIVO DA IMPLEMENTAÇÃO:
1. Criar `backend/medicamentos-endpoints.js`:
   - Exportar função fábrica `module.exports = function(db) { const router = express.Router(); ... return router; };`
   - Implementar:
     - `GET /busca`: lê query params `q`, `status`, `curva`, `limit`, `page`/`offset` e chama `medicamentosBuscaService.buscarMedicamentos(db, { q, status, curva, limit, offset })`. Retorna `{ success: true, data: result.items, pagination: { total: result.total, page, limit } }`.
     - `GET /rupturas`: lê `curva`, `limit`, `offset` e chama `medicamentosBuscaService.obterRupturas(db, { curva, limit, offset })`. Retorna `{ success: true, data: result.items, total: result.total, total_orcado_30d: result.total_orcado_30d }`.
     - `GET /:id`: chama `medicamentosBuscaService.obterMedicamentoPorId(db, req.params.id)`. Se não encontrar, retorna 404 `{ success: false, error: 'Medicamento não encontrado' }`. Se encontrar, retorna `{ success: true, data: item }`.
     - `POST /sincronizar`: dispara `medicamentosBuscaService.sincronizarEstoqueMedicamentos(db, req.body || {})`. Se bem-sucedido, aciona proativamente o Horácio `horacioAgent.gerarRelatorioExecutivoSincronizacao(result.itensCriticos, db)` e responde 200 `{ success: true, message: 'Sincronização concluída com sucesso', ... }`. Se ocorrer erro de rede, trata com fallback transparente sem disparar erro 500.

2. Em `backend/server.js`:
   - Montar o roteador:
     ```javascript
     const medicamentosEndpoints = require('./medicamentos-endpoints.js');
     app.use('/api/medicamentos', medicamentosEndpoints(db));
     ```
   - Configurar o agendamento cron 2x ao dia às 07:30 e 17:30 (horário de Brasília):
     ```javascript
     cron.schedule('30 7,17 * * *', async () => {
       console.log('[CRON-MEDICAMENTOS] 🔄 Iniciando sincronização agendada de estoque de medicamentos (07:30/17:30)...');
       try {
         const medicamentosBuscaService = require('./services/medicamentos-busca.service');
         const horacioAgent = require('./services/horacio-agent.service');
         const syncResult = await medicamentosBuscaService.sincronizarEstoqueMedicamentos(db);
         if (syncResult && syncResult.itensCriticos && syncResult.itensCriticos.length > 0) {
           await horacioAgent.gerarRelatorioExecutivoSincronizacao(syncResult.itensCriticos, db);
         }
         console.log('[CRON-MEDICAMENTOS] ✅ Sincronização e notificação proativa concluídas com sucesso.');
       } catch (err) {
         console.error('[CRON-MEDICAMENTOS] ❌ Erro na sincronização agendada:', err.message);
       }
     }, { timezone: 'America/Sao_Paulo' });
     ```

3. Em `backend/services/horacio-agent.service.js`:
   - Implementar `gerarRelatorioExecutivoSincronizacao(itensCriticos, dbInst)`:
     - Cria um relatório consolidado com os itens em ruptura/abaixo do mínimo com necessidade de 30 dias calculada (`qtd_sugerida_compra`).
     - Grava o relatório em `compras_horacio_relatorios`.
     - Retorna objeto com `relatorioId`, `resumoTexto` e `totalItens`.
   - Em `analisarOfertasEmTempoReal`, utilizar `medicamentosBuscaService.obterMedicamentoPorId(dbInst, validacao.produtoId)` como fonte primária unificada para estoque e preços.

4. Em `backend/services/compras-mineracao.service.js`:
   - Em `validarOfertaComDigifarma`, consumir `medicamentosBuscaService.obterMedicamentoPorId(dbInst, produtoId)` para obter preço unitário histórico e saldo atual em uma leitura atômica.

5. Executar as suítes e validar 100% de sucesso:
   - `node backend/test_motor_busca_medicamentos.js`
   - `node backend/test_compras_estoque.js`
   - `node backend/test_ultimas_compras_mineracao.js`

6. Escrever o relatório completo em:
   `f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m3_m4\handoff.md` e avisar via `send_message`.
