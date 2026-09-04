# Relatório de Handoff — Explorer 3 (Survey de Motor de Busca, APIs, Horácio e Testes)

**Data/Hora**: 2026-09-04T12:15:00Z  
**Autor**: Explorer Survey 3  
**Status**: Concluído (Hard Handoff)  
**Escopo**: Mapeamento de rotas backend Express, endpoints REST de medicamentos, inteligência de estoque e regras de reposição (30 dias sem ruptura e 2x no máximo), integração proativa e reativa do Agente Horácio, consumo de estoque e histórico pelo serviço de mineração, e estruturação da nova suíte de testes automatizados `backend/test_motor_busca_medicamentos.js` cobrindo 100% dos requisitos R1 a R5.

---

## 1. Observation (Observações Diretas)

### 1.1 Rotas Existentes de Backend Relacionadas a Estoque e Compras
- **`backend/server.js`**:
  - Linhas 4027–4029:
    ```javascript
    const stockEndpoints = require('./stock-endpoints.js');
    app.use('/api/stock', stockEndpoints());
    console.log('📦 Módulo Controle de Estoque inicializado.');
    ```
  - Linhas 4102–4109:
    ```javascript
    const purchasingEndpoints = require('./purchasing-endpoints.js');
    const comprasEndpoints = require('./compras-endpoints.js');
    ...
    app.use('/api/purchasing', purchasingEndpoints(db));
    app.use('/api/central-compras', comprasEndpoints(db));
    ```
  - Linhas 4437–4449:
    ```javascript
    // CRON: AGENTE HORÁCIO — CONSOLIDAÇÃO EXECUTIVA DE COMPRAS (11:00 E 16:00 SEG-SÁB)
    cron.schedule('0 11,16 * * 1-6', async () => {
      console.log('[CRON-HORACIO] 📋 Horário de corte atingido. Executando consolidação executiva de compras...');
      try {
        const horacioAgent = require('./services/horacio-agent.service');
        const db = require('./database');
        await horacioAgent.executarConsolidacaoHorarioCorte(db);
        console.log('[CRON-HORACIO] ✅ Consolidação e relatório executivo disparados com sucesso.');
      } catch (err) {
        console.error('[CRON-HORACIO] ❌ Erro ao executar consolidação:', err.message);
      }
    }, { timezone: 'America/Sao_Paulo' });
    ```
  - **Inexistência do prefixo `/api/medicamentos`**: Não há atualmente nenhum arquivo `medicamentos-endpoints.js` ou rota `/api/medicamentos/*` registrada no Express em `server.js`.

- **`backend/compras-endpoints.js`**:
  - Linha 97: `router.get('/estoque/minimo', async (req, res) => ...)` (usa `comprasEstoqueService.listarProdutosAbaixoDoMinimo`).
  - Linha 116: `router.get('/estoque/resumo', (req, res) => ...)` (usa `comprasEstoqueService.obterResumoEstoqueMinimo`).
  - Linha 125: `router.get('/estoque/calcular/:produtoId', async (req, res) => ...)` (usa `comprasEstoqueService.calcularEstoqueMinimo30Dias`).
  - Linha 136: `router.post('/estoque/sync-digifarma', async (req, res) => ...)` (sincroniza mínimo com Firebird).
  - Linha 162: `router.post('/estoque/recalcular', async (req, res) => ...)` (recálculo global).
  - Linha 300: `router.post('/sincronizar-ultimas-compras', async (req, res) => ...)` (sincroniza entradas de NF para `digifarma_ultimas_compras_cache`).
  - Linhas 1132–1148: Rota rudimentar de busca:
    ```javascript
    router.get('/produtos-busca', (req, res) => {
      try {
        const { q } = req.query;
        if (!q || q.trim().length < 2) {
          return res.json({ success: true, data: [] });
        }
        const rows = db.prepare(`
          SELECT produto_id, descricao, ean, saldo, custo_unitario, ultima_compra_valor
          FROM compras_estoque_cache
          WHERE descricao LIKE ? OR ean = ?
          LIMIT 25
        `).all(`%${q.trim()}%`, q.trim());
        res.json({ success: true, data: rows });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });
    ```
  - Linhas 1153–1210: Rotas do Horácio no router de compras (`/horacio/relatorios`, `/horacio/executar-analise`, `/horacio/criar-cotacao/:id`, `/horacio/disparar-whatsapp/:id`).

- **`backend/stock-endpoints.js`**:
  - Consome `services/stock.service.js`, que faz consultas diretas ao Firebird (`queryDigifarma`) para endpoints `/api/stock/summary`, `/api/stock/products`, `/api/stock/categories`, `/api/stock/products/sales-info`, retornando erro 503 "Servidor do Digifarma Offline" quando o Firebird está inacessível.

### 1.2 Schema Real de `compras_estoque_cache` no SQLite
- Execução direta via Node.js:
  `node -e "const db = require('./backend/database'); console.log(JSON.stringify(db.pragma('table_info(compras_estoque_cache)'), null, 2));"`
- **Colunas atualmente presentes**:
  `produto_id` (PK, INTEGER), `descricao` (TEXT), `ean` (TEXT), `categoria_id` (INTEGER), `curva_abc` (TEXT), `saldo` (REAL), `est_minimo_calculado` (REAL), `est_minimo_digifarma` (REAL), `vmd_ponderado` (REAL), `vendas_30d` (REAL), `vendas_31_60d` (REAL), `custo_unitario` (REAL), `ultima_compra_valor` (REAL), `status_ruptura` (TEXT), `margem_seguranca_aplicada` (REAL), `dias_sem_venda` (INTEGER), `sincronizado_em` (TEXT), `atualizado_em` (TEXT), `vendas_61_90d` (REAL), `ciclo_vida` (TEXT), `est_maximo_calculado` (REAL).
- **Colunas ausentes necessárias para R1**:
  `apresentacao` (TEXT), `preco_venda_vigente` (REAL), `preco_normal` (REAL), `preco_promocional` (REAL), `inicio_promocao` (TEXT), `termino_promocao` (TEXT), `preco_unitario_ult_compra` (REAL), `ultima_compra_fornecedor` (TEXT), `ultima_compra_data` (TEXT), `ultima_compra_nf` (TEXT), `qtd_sugerida_compra` (REAL).
- **Índices existentes em `compras_estoque_cache`**:
  `idx_cec_status` (status_ruptura), `idx_cec_ean` (ean), `idx_cec_curva` (curva_abc), `idx_cec_ciclo` (ciclo_vida), `idx_cec_descricao` (descricao).

### 1.3 Operação Atual do Agente Horácio (`horacio-agent.service.js`)
- **Proativo**:
  - Acionado exclusivamente pelo cron de corte em `server.js:4438` nos horários 11:00 e 16:00 (Seg-Sáb) através de `executarConsolidacaoHorarioCorte(db)`.
  - Em `executarConsolidacaoHorarioCorte` (linhas 320–325), busca oportunidades em `comprasMineracaoService.listarOportunidades(dbInst, { limite: 150 })`.
  - **Não é acionado após a sincronização da manhã ou da tarde**, e não gera um relatório focado diretamente na lista consolidada de rupturas/estoque mínimo de 30 dias para a reposição matinal.
- **Reativo**:
  - Acionado em `baileys-compras-service.js:357` ao chegar mensagem do WhatsApp: `horacioAgent.analisarOfertasEmTempoReal(...)`.
  - Dentro de `analisarOfertasEmTempoReal` (linhas 158–177):
    1. Chama `comprasMineracaoService.validarOfertaComDigifarma(produtoNome, ean, precoOfertado, dbInst)`.
    2. Executa consulta SQL direta separada:
       ```javascript
       if (validacao.produtoId) {
         dadosEstoque = dbInst.prepare('SELECT * FROM compras_estoque_cache WHERE produto_id = ?').get(validacao.produtoId);
       }
       if (!dadosEstoque && validacao.ean) {
         dadosEstoque = dbInst.prepare('SELECT * FROM compras_estoque_cache WHERE ean = ?').get(validacao.ean);
       }
       ```
    3. Recupera `curva_abc`, `vendas_30d`, `vmd_ponderado`, `saldoAtual`, `estMinimo`.

### 1.4 Consumo de Dados pelo Serviço de Mineração (`compras-mineracao.service.js`)
- Em `validarOfertaComDigifarma` (linhas 853–899):
  1. Realiza busca primária em `digifarma_ultimas_compras_cache` para obter `preco_unitario_ult_compra`, `data_compra`, `fornecedor_nome`, `numero_nota_fiscal`.
  2. Realiza busca secundária em `compras_estoque_cache` para obter `saldo`, `est_minimo_calculado`, `est_minimo_digifarma`.
  3. Se não encontrar no cache e o Firebird estiver online, faz query no Firebird (`queryDigifarma`).
- Em `enriquecerOportunidadesEmLote` (linhas 1888–1896):
  Prepara statements separados para cache de compras e cache de estoque:
  ```javascript
  stmtCacheId = db.prepare('SELECT * FROM digifarma_ultimas_compras_cache WHERE produto_id = ? AND preco_unitario_ult_compra > 0 LIMIT 1');
  stmtCacheEan = db.prepare('SELECT * FROM digifarma_ultimas_compras_cache WHERE ean = ? AND preco_unitario_ult_compra > 0 LIMIT 1');
  stmtCacheDesc = db.prepare('SELECT * FROM digifarma_ultimas_compras_cache WHERE descricao = ? AND preco_unitario_ult_compra > 0 LIMIT 1');
  stmtEstoqueId = db.prepare('SELECT saldo, est_minimo_calculado, est_minimo_digifarma FROM compras_estoque_cache WHERE produto_id = ? LIMIT 1');
  stmtEstoqueEan = db.prepare('SELECT saldo, est_minimo_calculado, est_minimo_digifarma FROM compras_estoque_cache WHERE ean = ? LIMIT 1');
  stmtEstoqueDesc = db.prepare('SELECT saldo, est_minimo_calculado, est_minimo_digifarma FROM compras_estoque_cache WHERE descricao = ? LIMIT 1');
  ```
- Em `sincronizarUltimasEntradasDigifarma` (linhas 3115–3205):
  Extrai do Firebird `CAB_NOTAS`, `ITEM_NOTAS`, `PRODUTOS` e grava em `digifarma_ultimas_compras_cache`.

### 1.5 Diagnóstico das Suítes de Testes Existentes
- **`backend/test_ultimas_compras_mineracao.js`**:
  - Executado via terminal: `node backend/test_ultimas_compras_mineracao.js`.
  - Resultado: **24 PASSOU | 0 FALHOU** (100% de aprovação).
  - Estrutura: Funções `test(name, fn)` e `asyncTest(name, fn)`, medições de tempo com `performance.now()` (< 5ms), assertivas com `assert`, testes adversariais de fallback.
- **`backend/test_compras_estoque.js`**:
  - Executado via terminal: `node backend/test_compras_estoque.js`.
  - Resultado: **15 Aprovados | 8 Falhas**.
  - Causa das falhas: Divergência entre os parâmetros legados do teste (que esperava 30d com pesos 65/35 e cobertura de 30d para `calcularDemandaPonderada(100, 50, 15)`) e a implementação intermediária do serviço, que adotou 3 períodos (50/30/20) com 15 dias de cobertura mínima. A nova especificação de 2026-09-04 define claramente: 30 dias de cobertura sem ruptura para o mínimo e o dobro para o máximo.

---

## 2. Logic Chain (Cadeia de Raciocínio Lógico)

1. **Da necessidade de consolidação única (R1) ao schema de `compras_estoque_cache`**:
   - *Observação*: Hoje, as informações de estoque estão em `compras_estoque_cache`, as informações de última compra em notas fiscais estão em `digifarma_ultimas_compras_cache`, e os preços promocionais com período de vigência estão no Firebird / `digifarma_products_cache`.
   - *Raciocínio*: A existência de múltiplos caches obriga o motor de busca, o Horácio e o serviço de mineração a fazerem 2 ou 3 queries por produto, gerando overhead e risco de dados dessincronizados. Consolidar na tabela `compras_estoque_cache` todas as colunas de identificação (`produto_id`, `ean`, `descricao`, `apresentacao`, `categoria_id`, `curva_abc`), estoque (`saldo`), preço vigente (`preco_venda_vigente`, `preco_normal`, `preco_promocional`, vigências), última compra (`preco_unitario_ult_compra`, `fornecedor`, `data`, `nf`) e reposição (`vmd_ponderado`, vendas por período, `ciclo_vida`, `est_minimo_calculado`, `est_maximo_calculado`, `qtd_sugerida_compra`, `status_ruptura`) viabiliza leituras atômicas em menos de 1ms por ID/EAN e menos de 10ms por texto.

2. **Das regras matemáticas de inteligência de estoque (R2)**:
   - *Observação*: O requisito de 2026-09-04 define categoricamente:
     - `VMD_P` = média ponderada do consumo nos períodos recentes com margem de segurança configurável (padrão 15%).
     - `Estoque Mínimo` (`est_minimo_calculado`): quantidade para 30 dias sem ruptura = `Math.ceil(VMD_P * 30 * (1 + margem/100))`.
     - `Estoque Máximo` (`est_maximo_calculado`): rigorosamente o dobro do mínimo = `est_minimo_calculado * 2`.
     - `Quantidade Sugerida de Compra`: defasagem para 30 dias = `Math.max(0, est_minimo_calculado - saldo)`.
     - Status:
       - `saldo <= 0` → `RUPTURA`
       - `0 < saldo < est_minimo_calculado` → `ABAIXO_MINIMO`
       - `est_minimo_calculado <= saldo <= est_maximo_calculado` → `NORMAL`
       - `saldo > est_maximo_calculado` → `EXCESSO`
   - *Raciocínio*: Elimina-se a ambiguidade anterior de 15 dias de cobertura. Qualquer produto com saldo inferior a 30 dias de giro é priorizado para compra, e se ultrapassar 60 dias (2x mínimo), é classificado em excesso.

3. **Da regra de Preço de Venda Vigente (R3)**:
   - *Observação*: O Digifarma armazena `PROD_PRVENDA`, `PROD_PRPROMOCAO`, `INICIO_PROMOCAO` e `TERMINO_PROMOCAO`.
   - *Raciocínio*: A função resolutora de preço vigente deve verificar se a data/hora atual está no intervalo `[INICIO_PROMOCAO, TERMINO_PROMOCAO 23:59:59]` e `PROD_PRPROMOCAO > 0`. Se verdadeiro, `preco_venda_vigente = preco_promocional`. Caso contrário, `preco_venda_vigente = preco_normal`. Essa resolução deve ser gravada diretamente no cache durante a sincronização e também recalculada dinamicamente caso a consulta ocorra após a expiração.

4. **Da criação e padronização dos endpoints REST (R4)**:
   - *Observação*: Não existe rota `/api/medicamentos`.
   - *Raciocínio*: Deve-se criar o arquivo `backend/medicamentos-endpoints.js` e montá-lo em `server.js` via `app.use('/api/medicamentos', medicamentosEndpoints(db))`, apoiado pelo serviço `backend/services/medicamentos-busca.service.js`.
     - `GET /api/medicamentos/busca`: busca ultra-rápida indexada suportando EAN (exato), ID (numérico) ou termo (LIKE), com filtros `status` e `curva` e paginação.
     - `GET /api/medicamentos/:id`: detalhe consolidado por ID (com fallback por EAN).
     - `GET /api/medicamentos/rupturas`: listagem direta e veloz de itens com `status_ruptura IN ('RUPTURA', 'ABAIXO_MINIMO')`, ordenados por criticidade de ruptura e curva ABC, trazendo a quantidade de reposição necessária para 30 dias e valor total orçado.
     - `POST /api/medicamentos/sincronizar`: gatilho sob demanda para carga completa de dados do Firebird, cálculo atômico no SQLite, com fallback gracioso (retornando status 200 via cache local sem erro 500 se o Firebird estiver offline) e disparo proativo ao Horácio.

5. **Da integração proativa e reativa do Agente Horácio (R5)**:
   - *Observação*: Hoje, Horácio atua proativamente apenas no corte das 11h/16h e reativamente fazendo queries manuais.
   - *Raciocínio*:
     - **Proativo**: Ao término da sincronização (às 07:30 e 17:30 agendadas, ou via `POST /api/medicamentos/sincronizar`), o motor de busca compila a lista de rupturas e abaixo do mínimo e invoca o Horácio (`horacioAgent.gerarRelatorioPosSincronizacao(itensCriticos, db)`). O Horácio analisa o saldo de cada item, projeta 30 dias de compras, gera o Resumo Executivo Padronizado com tabela de sugestões e grava em `compras_horacio_relatorios` (enviando via WhatsApp para a administração).
     - **Reativo**: O Horácio e o serviço de mineração substituem suas queries manuais pela chamada a `medicamentosBuscaService.obterMedicamento(idOuEan)`, obtendo preço histórico, preço vigente e estoque em um único objeto validado.

6. **Do desenho do novo teste `backend/test_motor_busca_medicamentos.js`**:
   - *Observação*: Os testes no repositório utilizam `assert` nativo do Node.js e banco SQLite (em arquivo ou `:memory:`).
   - *Raciocínio*: `test_motor_busca_medicamentos.js` deve ser uma suíte autônoma, modular e determinística, sem dependência do Firebird estar online, testando ponta a ponta:
     1. Schema e performance de índices (< 10ms);
     2. Matemática de estoque (30 dias sem ruptura, 2x máximo, quantidade sugerida, 4 status);
     3. Preço de venda vigente (promoção ativa vs expirada vs inexistente) e resiliência offline;
     4. Rotas e busca flexível (termo, EAN, ID, rupturas);
     5. Acionamento proativo e consumo reativo do Agente Horácio.

---

## 3. Caveats (Ressalvas e Limitações)

1. **Firebird de Produção vs. Ambiente Local**:
   - Em ambiente de desenvolvimento local, a porta do Firebird (3050) pode estar inacessível ou simulada. Por isso, todas as funções de busca, cálculo e testes DEVEM possuir resiliência total a partir do cache SQLite local (`belafarma.db` ou banco de teste `:memory:`), assegurando que `node backend/test_motor_busca_medicamentos.js` execute 100% verde sem depender de conexão externa ativa.
2. **Campos Existentes com Nomes Alternativos**:
   - O campo `ultima_compra_valor` já existe em `compras_estoque_cache`. A especificação pede `preco_unitario_ult_compra`. O serviço deve manter compatibilidade bidirecional (ex: preencher ambos ou tratar como alias) para não quebrar integrações existentes do módulo de compras.
3. **Agendamento de Cron no Windows / Linux**:
   - Em `server.js`, as tarefas cron utilizam `{ timezone: 'America/Sao_Paulo' }`. O agendamento da sincronização 2x ao dia deve ser configurado como `'30 7,17 * * *'` (07:30 e 17:30 todos os dias) com o mesmo fuso horário.

---

## 4. Conclusion (Conclusão e Proposta de Implementação)

A arquitetura para o Motor de Busca e Inteligência de Estoque de Medicamentos é clara, viável e perfeitamente integrada aos padrões vigentes no BelaFarma:

### 4.1 Arquitetura de Arquivos Proposta
1. **`backend/database.js`**:
   - Adicionar migrações via `ALTER TABLE compras_estoque_cache ADD COLUMN ...` (em blocos `try/catch`) para as colunas:
     - `apresentacao TEXT`
     - `preco_venda_vigente REAL DEFAULT 0`
     - `preco_normal REAL DEFAULT 0`
     - `preco_promocional REAL DEFAULT 0`
     - `inicio_promocao TEXT`
     - `termino_promocao TEXT`
     - `preco_unitario_ult_compra REAL DEFAULT 0`
     - `ultima_compra_fornecedor TEXT`
     - `ultima_compra_data TEXT`
     - `ultima_compra_nf TEXT`
     - `qtd_sugerida_compra REAL DEFAULT 0`
   - Garantir criação dos índices `idx_cec_ean`, `idx_cec_descricao`, `idx_cec_status`, `idx_cec_curva`.

2. **`backend/services/medicamentos-busca.service.js` (Novo Serviço Centralizado)**:
   - Funções principais:
     - `resolverPrecoVigente(produto, dataRef)`
     - `calcularInteligenciaEstoque(saldo, vmd, margem, curvaAbc)` (retorna `est_minimo_calculado` para 30d, `est_maximo_calculado` como dobro, `qtd_sugerida_compra` e `status_ruptura`)
     - `buscarMedicamentos(db, { q, status, curva, limit, offset })` (< 10ms)
     - `obterMedicamentoPorId(db, id)` (< 1ms)
     - `obterRupturas(db, { curva, limit, offset })`
     - `sincronizarEstoqueMedicamentos(db, options)` (extrai do Firebird ou faz fallback no cache local, upserta no `compras_estoque_cache` e aciona o Horácio)

3. **`backend/medicamentos-endpoints.js` (Novo Roteador REST)**:
   - Endpoints padronizados:
     - `GET /api/medicamentos/busca`
     - `GET /api/medicamentos/:id`
     - `GET /api/medicamentos/rupturas`
     - `POST /api/medicamentos/sincronizar`

4. **`backend/server.js`**:
   - Montagem do roteador:
     ```javascript
     const medicamentosEndpoints = require('./medicamentos-endpoints.js');
     app.use('/api/medicamentos', medicamentosEndpoints(db));
     ```
   - Agendamento cron 2x ao dia (07:30 e 17:30):
     ```javascript
     cron.schedule('30 7,17 * * *', async () => {
       console.log('[CRON-MEDICAMENTOS] 🔄 Iniciando sincronização agendada de estoque de medicamentos (07:30/17:30)...');
       try {
         const medicamentosBuscaService = require('./services/medicamentos-busca.service');
         await medicamentosBuscaService.sincronizarEstoqueMedicamentos(db);
       } catch (err) {
         console.error('[CRON-MEDICAMENTOS] ❌ Erro na sincronização agendada:', err.message);
       }
     }, { timezone: 'America/Sao_Paulo' });
     ```

5. **`backend/services/horacio-agent.service.js` & `backend/services/compras-mineracao.service.js`**:
   - Adicionar método `gerarRelatorioExecutivoSincronizacao(itensCriticos, db)` no Horácio.
   - Atualizar chamadas reativas de busca para utilizarem `medicamentosBuscaService.obterMedicamentoPorId(db, id)` e `obterMedicamentoPorEan(db, ean)`.

6. **`backend/test_motor_busca_medicamentos.js`**:
   - Suíte de testes automatizados com cobertura completa dos requisitos R1 a R5.

---

## 5. Verification Method (Método de Verificação)

Para validar de forma independente a conformidade desta análise e a execução dos requisitos:

### Comandos de Teste
1. **Execução da suíte atual de mineração**:
   ```bash
   node backend/test_ultimas_compras_mineracao.js
   ```
   *Resultado esperado*: 24 testes aprovados sem falhas.

2. **Inspeção de schema e índices no SQLite**:
   ```bash
   node -e "const db = require('./backend/database'); console.log(db.pragma('table_info(compras_estoque_cache)'));"
   node -e "const db = require('./backend/database'); console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='compras_estoque_cache'\").all());"
   ```

3. **Execução da nova suíte (quando implementada)**:
   ```bash
   node backend/test_motor_busca_medicamentos.js
   ```
   *Critério de aprovação*: 100% de testes unitários e de integração verdes sem falhas, validando schema R1, regras matemáticas de 30 dias e 2x máximo R2, preço vigente e resiliência Firebird R3, busca rápida R4 e integração Horácio R5.

### Condições de Invalidação
- Se alguma consulta indexada por ID, EAN ou termo LIKE em `compras_estoque_cache` ultrapassar 10ms em média sob carga normal.
- Se o Estoque Máximo calculado for diferente de exatamente `est_minimo_calculado * 2`.
- Se a queda de conexão com o Firebird causar erro HTTP 500 nos endpoints `/api/medicamentos/*` em vez de responder graciosamente via cache SQLite local.
