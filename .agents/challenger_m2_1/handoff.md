# Relatório de Handoff Adversarial — Milestone M2: Inteligência de Estoque e Sync Resiliente

**Data/Hora**: 2026-09-04T12:42:00Z  
**Agente**: Challenger 1 (Adversarial Critic & Specialist)  
**Diretório de Trabalho**: `f:\Documentos\Desenvolvimento\BelaFarma\.agents\challenger_m2_1`  
**Destinatário**: Orchestrator (`43b4ed79-f1ab-4a34-b8c7-4fbc5c8b65ce`)  
**Parecer Formal**: ❌ **REJECT** (Bloqueado até resolução de Bug Crítico de Persistência no SQLite em sincronização real)

---

## 1. Observation

### 1.1 Bug Bloqueante Detectado Empiricamente na Sincronização Real com Firebird
- **Arquivo**: `backend/services/medicamentos-busca.service.js`
- **Linhas 438-439 e 503-504**:
  ```javascript
  const inicioPromocao = p.INICIO_PROMOCAO !== undefined ? p.INICIO_PROMOCAO : p.inicio_promocao;
  const terminoPromocao = p.TERMINO_PROMOCAO !== undefined ? p.TERMINO_PROMOCAO : p.termino_promocao;
  ...
  inicio_promocao: inicioPromocao,
  termino_promocao: terminoPromocao,
  ```
- **Linhas 565-585 (Transação SQLite)**:
  ```javascript
  const tx = sqlite.transaction((items) => {
    for (const i of items) {
      upsertStmt.run(
        ...
        i.preco_normal, i.preco_promocional, i.inicio_promocao, i.termino_promocao,
        ...
      );
    }
  });

  try {
    tx(itensParaSalvar);
  } catch (errTx) {
    console.error('[Medicamentos Busca] Erro na transação de salvamento SQLite:', errTx.message);
  }
  ```
- **Comando Executado para Auditoria Real**:
  ```powershell
  node -e "const { sincronizarEstoqueMedicamentos } = require('./backend/services/medicamentos-busca.service'); const Database = require('./backend/node_modules/better-sqlite3'); const testDb = new Database(':memory:'); const realDb = require('./backend/database'); const sql1 = realDb.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get('compras_estoque_cache').sql; const sql2 = realDb.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get('digifarma_ultimas_compras_cache').sql; testDb.exec(sql1); testDb.exec(sql2); sincronizarEstoqueMedicamentos(testDb, { forceOffline: false }).then(r => { console.log('REAL SYNC RESULT:', r, 'COUNT IN DB:', testDb.prepare('SELECT COUNT(*) as c FROM compras_estoque_cache').get().c); process.exit(0); }).catch(e => { console.log('REAL SYNC ERROR:', e.message); process.exit(1); })"
  ```
- **Resultado Observado (Verbatim)**:
  ```
  [Medicamentos Busca] Erro na transação de salvamento SQLite: SQLite3 can only bind numbers, strings, bigints, buffers, and null
  REAL SYNC RESULT: {
    success: true,
    fromCache: false,
    totalSincronizados: 64546,
    itensCriticos: 62484,
    durationMs: 4833
  } COUNT IN DB: 0
  ```
- **Constatação Empírica**:
  1. O driver `node-firebird` retorna as colunas `INICIO_PROMOCAO` e `TERMINO_PROMOCAO` (TIMESTAMP) como instâncias nativas de `Date` do JavaScript.
  2. O driver `better-sqlite3` estritamente rejeita instâncias de `Date`, exigindo primitivos (`numbers, strings, bigints, buffers, and null`).
  3. A chamada `upsertStmt.run(...)` lança `SQLite3 can only bind numbers, strings, bigints, buffers, and null`, provocando rollback atômico imediato da transação inteira.
  4. O bloco `try / catch (errTx)` captura o erro com `console.error`, porém a função continua e retorna falsamente `{ success: true, totalSincronizados: 64546 }`.
  5. Na realidade, **0 produtos foram persistidos no banco de dados SQLite (`COUNT IN DB: 0`)**.

### 1.2 Proliferação de Falsos Positivos em `itensCriticosList` (62.484 itens)
- A consulta SQL ao catálogo ativo seleciona todos com `PROD_ATIVO = 'S'`. No ERP Digifarma real, existem 64.546 produtos cadastrados, dos quais a grande maioria são itens históricos sem giro (`VMD = 0` e `SALDO = 0`).
- O código classifica `saldo <= 0` como `'RUPTURA'`:
  ```javascript
  if (intel.status_ruptura === 'RUPTURA' || intel.status_ruptura === 'ABAIXO_MINIMO') {
    totalCriticos++;
    itensCriticosList.push(...);
  }
  ```
- Como consequência, **62.484 produtos** (itens com saldo zero e demanda zero, sem necessidade de compra) foram enfileirados para o Agente Horácio (`notificarHoracio: true`), o que sobrecarregaria de forma catastrófica a memória e os prompts do agente.

### 1.3 Avaliação dos Testes Unitários de Matemática e Preços (Totalmente Aprovados)
- Criada a suíte `backend/test_adversarial_m2.js` cobrindo 40 cenários extremos:
  - **Saldos Negativos**: `-50` un gerou `qtd_sugerida_compra = 119` (cobrindo o rombo de -50 + 69 de mínimo), e `-0.01` un gerou `35.01` com status `'RUPTURA'`.
  - **Giros Nulos**: `vmd = 0` com `saldo = 0` resultou em `min = 0, max = 0, sugerido = 0, status = 'RUPTURA'`. `saldo = 10` resultou em `'EXCESSO'`.
  - **Margens 0% e 100%**: `margem = 0` resultou em min 30 / max 60; `margem = 100%` resultou em min 60 / max 120; margem 500% escalou proporcionalmente.
  - **Piso Curva A**: VMD fracionário mínimo (`0.001`) acionou o piso de 2 unidades e máximo 4. Curva A com dormência (`VMD = 0`) corretamente manteve mínimo 0 (não forçou compra fantasma).
  - **Preços Vigentes**: Aprovado nos limites de milissegundo (`23:59:59.000` e `23:59:59.999` promocionais; `00:00:00.000` normal), formatos sem hora, promoções zeradas/negativas e inversão temporal.
  - **Benchmark**: 1.000 produtos processados em SQLite atômico em **19ms** (0.019ms por item).

---

## 2. Logic Chain

1. **Premissa 1**: Um serviço de sincronização tem como objetivo primário manter a réplica local (`compras_estoque_cache`) atualizada a partir do banco de produção (Firebird).
2. **Premissa 2**: Tipos `TIMESTAMP` no Firebird são mapeados pelo driver `node-firebird` para objetos `Date`.
3. **Premissa 3**: `better-sqlite3` lança `TypeError` ao receber instâncias de `Date` como parâmetros de bind SQL.
4. **Premissa 4**: O código em `medicamentos-busca.service.js` não sanitiza `inicioPromocao` e `terminoPromocao` para strings ISO (`.toISOString()` ou `formatarDataFirebird`).
5. **Dedução Lógica**: Toda execução de `sincronizarEstoqueMedicamentos` contra um banco Firebird real que contenha produtos com promoção falha na inserção SQLite e reverte toda a transação.
6. **Agravante**: O mascaramento do erro via `catch (errTx)` retorna `success: true` com 64.546 itens "sincronizados", ocultando que a base SQLite está com 0 registros gravados.
7. **Conclusão Lógica**: O Milestone M2 não pode ser aprovado em produção neste estado, pois causaria falha silenciosa de sincronização a cada execução do agendador cron.

---

## 3. Caveats

- **Isolamento de Escopo**: A regra de governança proíbe que o agente Challenger altere arquivos de implementação (`medicamentos-busca.service.js`). Portanto, a correção deve ser realizada pelo Worker M2 ou na fase de transição.
- **Modo Offline**: Quando executado estritamente com `forceOffline: true` (dados já existentes no SQLite), a sincronização funciona perfeitamente porque as datas no SQLite já são strings primitivas.
- **Matemática do Motor**: A fórmula de 30 dias de cobertura sem ruptura e o estoque máximo rigorosamente em 2x estão 100% corretos e aderentes a R2.

---

## 4. Conclusion

O Milestone M2 é formalmente **REJEITADO (REJECT)** com recomendação de **correção pontual mandatória** antes do avanço para o Milestone M3:

### Ações Obrigatórias para o Worker:
1. **Sanitização de Objetos `Date` para SQLite**:
   Em `backend/services/medicamentos-busca.service.js`, converter `inicioPromocao` e `terminoPromocao` (e quaisquer outras datas) para string antes do bind:
   ```javascript
   const formatarDataIso = (val) => {
     if (!val) return null;
     if (val instanceof Date) return val.toISOString();
     return String(val).trim();
   };

   const inicioPromocao = formatarDataIso(p.INICIO_PROMOCAO !== undefined ? p.INICIO_PROMOCAO : p.inicio_promocao);
   const terminoPromocao = formatarDataIso(p.TERMINO_PROMOCAO !== undefined ? p.TERMINO_PROMOCAO : p.termino_promocao);
   const ultData = formatarDataIso(uc && uc.data_compra ? uc.data_compra : (p.ULTIMA_COMPRA_DATA || p.ultima_compra_data || null));
   ```
2. **Propagação de Falha na Transação**:
   No bloco `catch (errTx)` de `sincronizarEstoqueMedicamentos`, se `tx` falhar, retornar `{ success: false, error: errTx.message, totalSincronizados: 0, fromCache }` em vez de mascarar sucesso.
3. **Filtro de Itens Críticos para o Horácio**:
   Ao popular `itensCriticosList`, considerar apenas produtos que tenham demanda real e necessidade de compra:
   ```javascript
   if ((intel.status_ruptura === 'RUPTURA' || intel.status_ruptura === 'ABAIXO_MINIMO') && intel.qtd_sugerida_compra > 0)
   ```
   Isso reduz a lista de 62.484 itens mortos para apenas as rupturas reais da farmácia.

---

## 5. Verification Method

Para verificar empiricamente a correção deste bug, execute os seguintes passos:

1. **Executar a Suíte Completa Adversarial**:
   ```powershell
   node backend/test_adversarial_m2.js
   ```
   *Condição de Aprovação*: Teste 3.7 deve passar e salvar o produto com objeto `Date` com sucesso no banco SQLite (`saved.c === 1`).

2. **Executar Teste contra o Firebird Real**:
   ```powershell
   node -e "const { sincronizarEstoqueMedicamentos } = require('./backend/services/medicamentos-busca.service'); const Database = require('./backend/node_modules/better-sqlite3'); const testDb = new Database(':memory:'); const realDb = require('./backend/database'); const sql1 = realDb.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get('compras_estoque_cache').sql; const sql2 = realDb.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get('digifarma_ultimas_compras_cache').sql; testDb.exec(sql1); testDb.exec(sql2); sincronizarEstoqueMedicamentos(testDb, { forceOffline: false }).then(r => { console.log('REAL SYNC RESULT:', r, 'COUNT IN DB:', testDb.prepare('SELECT COUNT(*) as c FROM compras_estoque_cache').get().c); process.exit(0); }).catch(e => { console.log('REAL SYNC ERROR:', e.message); process.exit(1); })"
   ```
   *Condição de Aprovação*: `COUNT IN DB` deve ser `64546` (ou similar) sem nenhum erro de `SQLite3 can only bind numbers, strings, bigints, buffers, and null`.
