## 2026-09-04T12:43:26Z
Você é o Worker responsável pela remediação da Iteração 2 do Milestone M2 (Inteligência de Estoque e Sync Resiliente).

Seu diretório exclusivo de trabalho é:
f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m2_iter2

Arquivos sob sua posse exclusiva de escrita:
- backend/services/medicamentos-busca.service.js
- backend/test_motor_busca_medicamentos.js

LEIA OS DOCUMENTOS OBRIGATÓRIOS:
- f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md (seção '## 2026-09-04T12:09:33Z')
- f:\Documentos\Desenvolvimento\BelaFarma\PROJECT.md
- f:\Documentos\Desenvolvimento\BelaFarma\.agents\reviewer_m2_1\handoff.md
- f:\Documentos\Desenvolvimento\BelaFarma\.agents\reviewer_m2_2\handoff.md
- f:\Documentos\Desenvolvimento\BelaFarma\.agents\challenger_m2_2\handoff.md
- f:\Documentos\Desenvolvimento\BelaFarma\.agents\challenger_m2_1\handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work.

TAREFAS DE REMEDIAÇÃO:
1. Em backend/services/medicamentos-busca.service.js, em sincronizarEstoqueMedicamentos:
   - Corrigir a resolução de última compra para não sobrescrever dados legítimos com o placeholder 'Cadastro Geral Digifarma':
     const ucTemNfReal = uc && uc.fonte === 'NOTA_FISCAL' && uc.fornecedor_nome && uc.fornecedor_nome !== 'Cadastro Geral Digifarma';
     const ultFornecedor = ucTemNfReal ? uc.fornecedor_nome : (p.ULTIMA_COMPRA_FORNECEDOR || p.ultima_compra_fornecedor || (uc ? uc.fornecedor_nome : null));
     const ultData = ucTemNfReal ? uc.data_compra : (p.ULTIMA_COMPRA_DATA || p.ultima_compra_data || (uc ? uc.data_compra : null));
     const ultNf = ucTemNfReal ? uc.numero_nota_fiscal : (p.ULTIMA_COMPRA_NF || p.ultima_compra_nf || (uc ? uc.numero_nota_fiscal : null));
   - Tratar objetos Date vindos do Firebird para string (ex: date.toISOString() ou YYYY-MM-DD HH:mm:ss) antes de gravar no SQLite para evitar o erro SQLite3 can only bind numbers, strings, bigints, buffers, and null.
   - Adicionar ciclo_vida = excluded.ciclo_vida, no ON CONFLICT(produto_id) DO UPDATE SET.
   - Na transação tx(itensParaSalvar), se lançar erro, retornar { success: false, error: errTx.message, fromCache, totalSincronizados: 0 }.
   - Em itensCriticos, filtrar apenas itens com giro recente (vendas_30d > 0 ou vmd_ponderado > 0 ou saldo > 0).

2. Em backend/services/medicamentos-busca.service.js, em buscarMedicamentos:
   - Otimizar busca com parâmetro q para cumprir o SLA de < 10ms sob concorrência e evitar Full Table Scan:
     if (q) {
       const trimmed = String(q).trim();
       const isNumeric = /^\d+$/.test(trimmed);
       if (isNumeric) {
         const num = Number(trimmed);
         whereParts.push('(produto_id = ? OR ean = ?)');
         queryParams.push(num, trimmed);
       } else {
         whereParts.push('(descricao LIKE ? OR ean = ?)');
         queryParams.push(`${trimmed}%`, trimmed);
       }
     }
   - Não executar SELECT COUNT(*) desnecessário quando isNumeric ou quando items.length < limit.

3. Em backend/test_motor_busca_medicamentos.js:
   - Em cleanupFixtures(), garantir que os IDs de teste (TEST_PRODUCT_IDS) também sejam limpos de digifarma_ultimas_compras_cache.

4. Executar e validar as 3 suítes:
   - node backend/test_motor_busca_medicamentos.js -> Deve passar 35/35 (100.0%, exit code 0)
   - node backend/test_compras_estoque.js -> Deve passar 23/23 (100.0%, exit code 0)
   - node backend/test_ultimas_compras_mineracao.js -> Deve passar 24/24 (100.0%, exit code 0)

5. Escrever handoff em f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m2_iter2\handoff.md e avisar via send_message.
