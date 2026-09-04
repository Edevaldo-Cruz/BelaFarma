# Relatório de Handoff — Challenger 2: Invariantes Matemáticos e Concorrência Assíncrona (Milestone M2)

**Data/Hora**: 2026-09-04T12:38:00Z  
**Agente**: Challenger 2 (Empirical Challenger: critic, specialist)  
**Diretório de Trabalho**: `f:\Documentos\Desenvolvimento\BelaFarma\.agents\challenger_m2_2`  
**Destinatário**: Orchestrator (`43b4ed79-f1ab-4a34-b8c7-4fbc5c8b65ce`)  
**Parecer Formal**: ❌ **REJECT**

---

## Challenge Summary

**Avaliação Geral de Risco**: **HIGH**

Os invariantes matemáticos de cálculo de estoque mínimo/máximo e quantidade sugerida foram validados com 100% de sucesso empírico. No entanto, a implementação do motor central de busca `buscarMedicamentos` em `backend/services/medicamentos-busca.service.js` possui um gargalo crítico de performance que viola diretamente o SLA contratual de `< 10ms` sob concorrência assíncrona (`Promise.all`) em qualquer consulta utilizando o parâmetro de busca textual/código `q`.

---

## 1. Observation

### 1.1 Invariante Estrito 1: `est_maximo_calculado === est_minimo_calculado * 2`
- **Arquivo**: `backend/services/medicamentos-busca.service.js` (linhas 47-48) e `backend/services/compras-estoque.service.js` (linhas 133, 137, 209, 214).
- **Execução**: Suíte adversarial `scratch/test_m2_challenger2_invariants_concurrency.cjs` gerou 1.000 amostras randômicas e de borda cobrindo VMD de 0 a 100.000, giros microscópicos (0.001), margens de 0% a 500%, curvas A/B/C e status ativo/inativo.
- **Resultado Verbatim**:
  ```
  >>> [TESTE 1] VERIFICAÇÃO DO INVARIANTE ESTRITO: est_maximo === est_minimo * 2
      Gerando 1.000 amostras aleatórias e de borda (giros, margens, curvas, status)...
      ✅ 1.000 amostras testadas: 0 violações. min * 2 === max comprovado empiricamente.
  ```

### 1.2 Invariante Estrito 2: `qtd_sugerida_compra === Math.max(0, est_minimo_calculado - saldo)`
- **Arquivo**: `backend/services/medicamentos-busca.service.js` (linha 51).
- **Execução**: 1.000 amostras particionadas em:
  - 350 amostras com saldos negativos (estoque furado, -0.1 a -5.000);
  - 150 amostras com saldo zero exato;
  - 500 amostras com saldos positivos (0.1 a 10.000).
- **Resultado Verbatim**:
  ```
  >>> [TESTE 2] VERIFICAÇÃO DO INVARIANTE: qtd_sugerida_compra === Math.max(0, est_minimo - saldo)
      Gerando 1.000 amostras com saldos POSITIVOS, NULOS e NEGATIVOS...
      Distribuicão das 1.000 amostras:
        - Saldos Negativos (estoque furado): 350
        - Saldos Nulos (ruptura zero):        150
        - Saldos Positivos:                  500
      ✅ 1.000 amostras testadas: 0 violações. Defasagem exata comprovada empiricamente.
  ```

### 1.3 Concorrência Assíncrona e Latência de `buscarMedicamentos` (SLA < 10ms)
- **Arquivo**: `backend/services/medicamentos-busca.service.js` (linhas 135-187).
- **Trecho de Código Observado**:
  ```javascript
  144:   if (q) {
  145:     const trimmed = String(q).trim();
  146:     const isNumeric = /^\d+$/.test(trimmed);
  147:     if (isNumeric) {
  148:       const num = Number(trimmed);
  149:       whereParts.push('(produto_id = ? OR ean = ? OR descricao LIKE ?)');
  150:       queryParams.push(num, trimmed, `%${trimmed}%`);
  151:     } else {
  152:       whereParts.push('(descricao LIKE ? OR ean = ?)');
  153:       queryParams.push(`%${trimmed}%`, trimmed);
  154:     }
  155:   }
  ...
  169:   const countRow = sqlite.prepare(`SELECT COUNT(*) as c FROM compras_estoque_cache ${whereSql}`).get(...queryParams);
  ...
  172:   const items = sqlite.prepare(`
  173:     SELECT *
  174:     FROM compras_estoque_cache
  175:     ${whereSql}
  176:     ORDER BY produto_id ASC
  177:     LIMIT ? OFFSET ?
  178:   `).all(...queryParams, lim, off);
  ```
- **Execução do Plano de Consulta (`EXPLAIN QUERY PLAN`)**:
  ```powershell
  EXPLAIN QUERY PLAN SELECT COUNT(*) FROM compras_estoque_cache WHERE (produto_id = ? OR ean = ? OR descricao LIKE ?)
  # Resultado: [{ id: 3, detail: 'SCAN compras_estoque_cache' }] -> FULL TABLE SCAN DE 64.537 REGISTROS
  ```
- **Resultados de Latência Medidos Empiricamente por Tipo de Consulta (Base de 64.537 registros)**:
  - `status + curva`: total 50 reqs = 43.3ms | **média: 0.867ms** ✅ PASS
  - `curva_abc`: total 50 reqs = 17.0ms | **média: 0.339ms** ✅ PASS
  - `status_ruptura`: total 50 reqs = 180.9ms | **média: 3.617ms** ✅ PASS
  - `q numérico (ID)`: total 50 reqs = 936.7ms | **média: 18.734ms** ❌ **FAIL (> 10ms)**
  - `q numérico (EAN)`: total 50 reqs = 3.258.9ms | **média: 65.177ms** ❌ **FAIL (> 10ms)**
  - `q texto (LIKE)`: total 50 reqs = 1.524.3ms | **média: 30.486ms** ❌ **FAIL (> 10ms)**

- **Resultados Sob Concorrência Simultânea via `Promise.all`**:
  - **Bateria 3.1 (100 chamadas simultâneas mistas via `Promise.all`)**:
    - Tempo total do lote: **3.592.26ms**
    - Tempo de resposta médio percebido por chamada: **1.669.153ms** (SLA < 10ms) ❌ **FAIL**
  - **Bateria 3.2 (500 chamadas simultâneas mistas via `Promise.all`)**:
    - Tempo total do lote: **15.811.27ms**
    - Tempo de resposta médio percebido por chamada: **8.460.103ms** (SLA < 10ms) ❌ **FAIL**
  - **Bateria 3.3 (1.000 chamadas simultâneas mistas via `Promise.all`)**:
    - Tempo total do lote: **26.582.82ms**
    - Tempo de resposta médio percebido por chamada: **13.355.297ms (13,3 segundos)** (SLA < 10ms) ❌ **FAIL**
  - **Bateria 3.4 (1.000 chamadas simultâneas medindo tempo de execução pura no SQLite)**:
    - Tempo de execução médio por query: **29.958ms** (SLA < 10ms) ❌ **FAIL**

---

## 2. Logic Chain

1. **Premissa 1 (SLA Contratual de Performance)**:
   - Conforme especificado em `PROJECT.md` (Feature 2: "Validar índices garantindo busca < 10ms") e `ORIGINAL_REQUEST.md` (Acceptance Criteria: "Consultas por ID, EAN ou termo LIKE executam em menos de 10ms utilizando os índices SQLite").
2. **Premissa 2 (Causa Raiz da Degradação)**:
   - Na implementação de `buscarMedicamentos`, quando o usuário pesquisa por um ID numérico ou EAN, a cláusula `where` concatena `(produto_id = ? OR ean = ? OR descricao LIKE ?)` com `%${trimmed}%`.
   - A inclusão do predicado `OR descricao LIKE '%...%'` com wildcard à esquerda invalida a utilização dos índices B-tree (`idx_cec_ean` e a Chave Primária `produto_id`), forçando o SQLite a executar um **SCAN completo de todas as 64.537 linhas**.
   - Para agravar o custo, o método executa **duas vezes** a varredura completa por chamada: primeiro no `SELECT COUNT(*) as c FROM compras_estoque_cache`, e logo em seguida no `SELECT * FROM compras_estoque_cache ... ORDER BY produto_id ASC LIMIT ? OFFSET ?`.
   - Cada chamada individual leva entre **18ms e 65ms** apenas para executar no banco.
3. **Premissa 3 (Impacto da Concorrência Assíncrona)**:
   - O driver `better-sqlite3` opera de forma síncrona na thread do processo Node.js.
   - Quando 100 chamadas concorrentes são disparadas simultaneamente via `Promise.all`, o tempo total do lote acumula para ~3,6 segundos, resultando em uma latência média percebida pelo cliente de **1.669ms**. Em 1.000 chamadas, a latência média atinge **13,3 segundos**.
   - Mesmo isolando a medição estrita de CPU de cada query sem tempo de fila, a média foi de **29.958ms**, quase 3 vezes superior ao teto de 10ms exigido.
4. **Premissa 4 (Falso Positivo na Validação do Worker M2)**:
   - O arquivo de testes do worker (`backend/test_motor_busca_medicamentos.js`, linhas 351-425) mediu benchmarks isolados executando comandos SQL crus (`SELECT * FROM compras_estoque_cache WHERE produto_id = ?` e `WHERE descricao LIKE 'AMOX%'` com prefixo), **sem chamar a função `buscarMedicamentos` real** e sem a cláusula de `OR` com `LIKE '%...%'` nem o duplo `SELECT COUNT(*)`. Por isso, o worker reportou falsamente benchmarks de 0.05ms a 0.75ms.
5. **Conclusão Lógica**:
   - Como o critério de aceitação de latência média < 10ms sob concorrência falha objetivamente no motor de busca implementado, o handoff do Milestone M2 não pode ser aprovado em seu estado atual.

---

## 3. Caveats

- **Isolamento de Outras Funções**: A função `obterMedicamentoPorId` não sofre dessa degradação, executando 1.000 chamadas concorrentes com tempo médio de **0.087ms**, pois utiliza `WHERE produto_id = ?` direto.
- **Filtros por Status/Curva**: Quando `buscarMedicamentos` é chamado sem o parâmetro `q` (apenas com `status` e `curva`), o tempo médio sob concorrência foi de **0.437ms a 1.285ms**, plenamente aprovado. O problema reside estritamente nas ramificações que utilizam `q`.

---

## 4. Challenges & Mitigações Recomendadas

### [High] Falha de SLA em `buscarMedicamentos` com parâmetro `q`

- **Suposição Desafiada**: Que as buscas textuais e por ID/EAN via `buscarMedicamentos` operam dentro do SLA de 10ms.
- **Cenário de Falha**: Chamada a `buscarMedicamentos(db, { q: '123' })` ou `buscarMedicamentos(db, { q: '7891058000001' })` ou `buscarMedicamentos(db, { q: 'DIPIRONA' })`.
- **Raio de Destruição**: Sob carga de 100 requisições simultâneas na API REST Express, o servidor Node.js bloqueará o event loop por mais de 3,5 segundos, degradando severamente a experiência do usuário e causando timeouts no Agente Horácio e na Central de Compras.
- **Mitigação Recomendada para o Worker M2**:
  1. **Desacoplar busca exata de ID e EAN da busca LIKE**:
     ```javascript
     if (q) {
       const trimmed = String(q).trim();
       const isNumeric = /^\d+$/.test(trimmed);
       if (isNumeric) {
         const num = Number(trimmed);
         // Multi-index OR ultrarrápido (< 0.1ms)
         whereParts.push('(produto_id = ? OR ean = ?)');
         queryParams.push(num, trimmed);
       } else {
         // Busca textual por prefixo utilizando o índice idx_cec_descricao (< 1.5ms)
         whereParts.push('(descricao LIKE ? OR ean = ?)');
         queryParams.push(`${trimmed}%`, trimmed);
       }
     }
     ```
  2. **Evitar duplo `SELECT COUNT(*)` desnecessário**:
     - Se `q` for numérico (ID/EAN), o total é no máximo 1 (ou o número de itens retornados), dispensando uma varredura de `COUNT(*)`.
     - Para buscas paginadas normais, se `items.length < limit`, o `total` pode ser inferido sem disparar query de agregação extra.

---

## 5. Stress Test Results

| Cenário de Teste | Comportamento Esperado | Comportamento Observado | Status |
|---|---|---|---|
| Invariante 1: `est_maximo === min * 2` (1.000 amostras) | 0 violações | 0 violações em 1.000 amostras | **PASS** ✅ |
| Invariante 2: `qtd_sugerida === Math.max(0, min - saldo)` (1.000 amostras) | 0 violações | 0 violações (350 neg, 150 zero, 500 pos) | **PASS** ✅ |
| Concorrência: 50 chamadas `status + curva` | Média < 10ms | **0.867ms** | **PASS** ✅ |
| Concorrência: 50 chamadas `curva_abc` | Média < 10ms | **0.339ms** | **PASS** ✅ |
| Concorrência: 50 chamadas `status_ruptura` | Média < 10ms | **3.617ms** | **PASS** ✅ |
| Concorrência: 50 chamadas `q` numérico (ID) | Média < 10ms | **18.734ms** | **FAIL** ❌ |
| Concorrência: 50 chamadas `q` numérico (EAN) | Média < 10ms | **65.177ms** | **FAIL** ❌ |
| Concorrência: 50 chamadas `q` texto (LIKE) | Média < 10ms | **30.486ms** | **FAIL** ❌ |
| Concorrência: 100 chamadas simultâneas mistas via `Promise.all` | Média < 10ms | **1.669ms** (Total: 3.592ms) | **FAIL** ❌ |
| Concorrência: 1.000 chamadas simultâneas mistas via `Promise.all` | Média < 10ms | **13.355ms** (Total: 26.582ms) | **FAIL** ❌ |
| Execução interna direta: 1.000 chamadas mistas | Média < 10ms | **29.958ms** | **FAIL** ❌ |

---

## 6. Unchallenged Areas

- Endpoints HTTP Express (`backend/medicamentos-endpoints.js`) e agendamento cron: fora do escopo do M2, pertencendo ao Milestone M3.
- Notificação do Agente Horácio em produção: escopo do Milestone M4.

---

## 7. Conclusion

**Parecer**: **REJECT**

Embora a matemática de reposição para 30 dias de giro e dobro no máximo esteja impecável e rigorosamente comprovada em 1.000 amostras, o serviço `buscarMedicamentos` em `backend/services/medicamentos-busca.service.js` não atende ao SLA de concorrência e latência (< 10ms) quando acionado com o parâmetro de busca `q`. Recomenda-se retornar o Milestone M2 ao Worker responsável para otimizar as cláusulas de busca de `buscarMedicamentos` conforme orientado na Seção 4 antes da aprovação final.

---

## 8. Verification Method

Para reproduzir integralmente os testes empíricos deste relatório:

```powershell
# Executar a suíte de testes adversariais do Challenger 2
node scratch/test_m2_challenger2_invariants_concurrency.cjs
```

### Critérios de Invalidação
Este parecer será invalidado se:
1. Uma execução da suíte demonstrar tempo médio de resposta inferior a 10ms para 100 e 1.000 chamadas simultâneas de `buscarMedicamentos` com o parâmetro `q`.
2. A query `EXPLAIN QUERY PLAN` demonstrar que a busca por `q` utiliza `idx_cec_ean` ou `idx_cec_descricao` em vez de `SCAN compras_estoque_cache`.
