## 2026-09-04T12:16:41Z

Você é o Worker responsável pela implementação do Milestone M1: Schema e Modelo Consolidado SQLite da tabela compras_estoque_cache.

Seu diretório de trabalho exclusivo é:
f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m1

Arquivos sob sua posse exclusiva de escrita:
backend/database.js

LEIA OS DOCUMENTOS OBRIGATÓRIOS ANTES DE MODIFICAR QUALQUER CÓDIGO:
- f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md (seção '## 2026-09-04T12:09:33Z')
- f:\Documentos\Desenvolvimento\BelaFarma\PROJECT.md
- f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_survey_1\handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

INSTRUÇÕES DE IMPLEMENTAÇÃO:
1. Abra backend/database.js e localize a função createTables() onde compras_estoque_cache é criada e migrada.
2. Adicione de forma idempotente e segura (com blocos try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN ...'); } catch(e) {}) as 11 colunas de R1:
   - apresentacao TEXT
   - preco_venda_vigente REAL DEFAULT 0
   - preco_normal REAL DEFAULT 0
   - preco_promocional REAL DEFAULT 0
   - inicio_promocao TEXT
   - termino_promocao TEXT
   - preco_unitario_ult_compra REAL DEFAULT 0
   - ultima_compra_fornecedor TEXT
   - ultima_compra_data TEXT
   - ultima_compra_nf TEXT
   - qtd_sugerida_compra REAL DEFAULT 0
3. Assegure que os índices essenciais existam:
   - idx_cec_ean em compras_estoque_cache(ean)
   - idx_cec_descricao em compras_estoque_cache(descricao)
   - idx_cec_status em compras_estoque_cache(status_ruptura)
   - idx_cec_curva em compras_estoque_cache(curva_abc)
4. Execute comando Node.js para verificar que o banco inicia sem erro e que todas as colunas existem em compras_estoque_cache:
   node -e "const db = require('./backend/database'); console.log(db.pragma('table_info(compras_estoque_cache)').map(c => c.name));"
5. Escreva seu relatório detalhado em:
   f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m1\handoff.md
6. Ao concluir, avise o orchestrator via send_message.
