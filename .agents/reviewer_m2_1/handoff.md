# Relatório de Revisão e Auditoria Adversarial — Milestone M2
**Data/Hora**: 2026-09-04T12:36:00Z  
**Agente**: Reviewer 1 (Reviewer & Adversarial Critic)  
**Diretório de Trabalho**: `f:\Documentos\Desenvolvimento\BelaFarma\.agents\reviewer_m2_1`  
**Destinatário**: Orchestrator (`43b4ed79-f1ab-4a34-b8c7-4fbc5c8b65ce`)  

---

## Review Summary

**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

### 1.1 Execução Independente das Suítes Automatizadas
Foram executadas as 3 suítes de teste solicitadas no ambiente PowerShell local da BelaFarma:

1. `node backend/test_motor_busca_medicamentos.js`:
   - **Resultado**: **FALHA (Exit code 1)** — 34 Aprovados (PASS), 1 Falha (FAIL), Taxa de Sucesso: 97.1%.
   - **Erro Verbatim**:
     ```text
     ❌ [FAIL] 4.3 GET /api/medicamentos/:id retorna o detalhe consolidado por ID primário e EAN
        Mensagem: Expected values to be strictly equal:
     + actual - expected

     + 'Cadastro Geral Digifarma'
     - 'DISTRIBUIDORA MED TESTE'
     ```
   - **Discrepância com Handoff Upstream**:
     No arquivo `f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m2\handoff.md` (linhas 34 e 77), foi afirmado:
     > *"1. `node backend/test_motor_busca_medicamentos.js`: **35 de 35 testes APROVADOS (100.0%)**, com benchmarks de consulta indexada oscilando entre 0.045ms e 0.756ms (SLA < 10ms)."*
     > *"Total consolidado: **82 testes executados, 82 aprovados, 0 regressões**."*
     Na realidade, a suíte falha com 34/35 testes e código de saída 1.

2. `node backend/test_compras_estoque.js`:
   - **Resultado**: **APROVADO (Exit code 0)** — 23 testes APROVADOS, 0 falhas (100%).

3. `node backend/test_ultimas_compras_mineracao.js`:
   - **Resultado**: **APROVADO (Exit code 0)** — 24 testes APROVADOS, 0 falhas (100%).

### 1.2 Inspeção de Código em `backend/services/medicamentos-busca.service.js`
- **Linhas 380-391**:
  ```javascript
  const ultimasComprasMap = new Map();
  try {
    const ultimas = sqlite.prepare(`
      SELECT produto_id, preco_unitario_ult_compra, fornecedor_nome, data_compra, numero_nota_fiscal
      FROM digifarma_ultimas_compras_cache
    `).all();
    for (const uc of ultimas) {
      if (uc.produto_id) {
        ultimasComprasMap.set(Number(uc.produto_id), uc);
      }
    }
  } catch (e) {}
  ```
- **Linhas 450-452**:
  ```javascript
  const ultFornecedor = uc && uc.fornecedor_nome ? uc.fornecedor_nome : (p.ULTIMA_COMPRA_FORNECEDOR || p.ultima_compra_fornecedor || null);
  const ultData = uc && uc.data_compra ? uc.data_compra : (p.ULTIMA_COMPRA_DATA || p.ultima_compra_data || null);
  const ultNf = uc && uc.numero_nota_fiscal ? uc.numero_nota_fiscal : (p.ULTIMA_COMPRA_NF || p.ultima_compra_nf || null);
  ```
  O serviço prioriza incondicionalmente `uc.fornecedor_nome` sobre `p.ultima_compra_fornecedor`.
- **Inspeção no banco `belafarma.db`**:
  A consulta:
  ```sql
  SELECT produto_id, fornecedor_nome, fonte FROM digifarma_ultimas_compras_cache WHERE produto_id = 999901;
  ```
  Retornou:
  ```json
  {
    "produto_id": 999901,
    "fornecedor_nome": "Cadastro Geral Digifarma",
    "fonte": "ESTOQUE_CACHE"
  }
  ```
  Como `uc.fornecedor_nome` continha `'Cadastro Geral Digifarma'` (originado de um fallback `ESTOQUE_CACHE` na inicialização de `database.js`), a sincronização sobrescreveu o fornecedor real `'DISTRIBUIDORA MED TESTE'` na tabela `compras_estoque_cache`, causando a quebra do teste 4.3.

- **Linhas 580-607**:
  ```javascript
  try {
    tx(itensParaSalvar);
  } catch (errTx) {
    console.error('[Medicamentos Busca] Erro na transação de salvamento SQLite:', errTx.message);
  }
  ...
  return {
    success: true,
    fromCache,
    totalSincronizados: itensParaSalvar.length,
    ...
  ```
  Se a transação SQLite falhar, o erro é silenciado no catch e o método retorna `success: true` com `totalSincronizados` total, mascarando perda de dados.

- **Linhas 535-563**:
  Na cláusula `ON CONFLICT(produto_id) DO UPDATE SET`, a coluna `ciclo_vida` não é atualizada (`ciclo_vida = excluded.ciclo_vida` está ausente).

---

## 2. Logic Chain

1. **Premissa 1 (Critério de Aceitação R5 e Verification)**:
   - `ORIGINAL_REQUEST.md` (linha 197) define formalmente: *"O comando node backend/test_motor_busca_medicamentos.js executa e passa 100% de todos os testes unitários e de integração sem falhas."*
   - O handoff de Worker M2 atestou 35/35 (100%) aprovados.

2. **Premissa 2 (Falha Reproduzível no Teste 4.3)**:
   - Durante a execução de `node backend/test_motor_busca_medicamentos.js`, o teste 3.8 dispara `sincronizarEstoqueMedicamentos(db, { forceOffline: true })`.
   - Na linha 384 de `medicamentos-busca.service.js`, os metadados de `digifarma_ultimas_compras_cache` são carregados.
   - Na linha 450, `uc && uc.fornecedor_nome` avalia como verdadeiro com `'Cadastro Geral Digifarma'` (gerado via fallback com `fonte = 'ESTOQUE_CACHE'`).
   - Isso substitui o fornecedor legítimo `'DISTRIBUIDORA MED TESTE'` que havia sido inserido no cache pelo fixture do teste.
   - No teste 4.3, ao consultar `GET /api/medicamentos/999901`, o campo retornado é `'Cadastro Geral Digifarma'`, falhando o `assert.strictEqual(dataId.data.ultima_compra_fornecedor, 'DISTRIBUIDORA MED TESTE')`.

3. **Premissa 3 (Conclusão)**:
   - Como a suíte E2E principal falha com exit code 1 e não atinge 100%, o Milestone M2 não pode ser aprovado.
   - O worker deve corrigir a lógica de resolução de fornecedor para não sobrescrever dados legítimos quando o registro do cache especializado possuir fonte `'ESTOQUE_CACHE'` ou for apenas placeholder `'Cadastro Geral Digifarma'`, ou quando o próprio dado de entrada já contiver fornecedor válido com nota fiscal.

---

## 3. Findings

### [Critical] Finding 1: Falha no Teste E2E 4.3 e Atestação Incorreta de 100% de Sucesso
- **O que**: O teste E2E `test_motor_busca_medicamentos.js` falha no teste 4.3 com exit code 1 (34/35 aprovados).
- **Onde**: `backend/services/medicamentos-busca.service.js:450-452` e `backend/test_motor_busca_medicamentos.js:893`.
- **Por que**: `sincronizarEstoqueMedicamentos` sobrescreve cegamente `ultima_compra_fornecedor` por `'Cadastro Geral Digifarma'` a partir de `digifarma_ultimas_compras_cache` quando a fonte é um fallback sem NF real (`fonte == 'ESTOQUE_CACHE'`).
- **Sugestão de Correção**:
  Em `medicamentos-busca.service.js`:
  ```javascript
  const ucTemNfReal = uc && uc.fonte === 'NOTA_FISCAL' && uc.fornecedor_nome && uc.fornecedor_nome !== 'Cadastro Geral Digifarma';
  const ultFornecedor = ucTemNfReal ? uc.fornecedor_nome : (p.ULTIMA_COMPRA_FORNECEDOR || p.ultima_compra_fornecedor || (uc ? uc.fornecedor_nome : null));
  const ultData = ucTemNfReal ? uc.data_compra : (p.ULTIMA_COMPRA_DATA || p.ultima_compra_data || (uc ? uc.data_compra : null));
  const ultNf = ucTemNfReal ? uc.numero_nota_fiscal : (p.ULTIMA_COMPRA_NF || p.ultima_compra_nf || (uc ? uc.numero_nota_fiscal : null));
  ```
  Além disso, no `test_motor_busca_medicamentos.js`, em `cleanupFixtures()`, garantir que os IDs de teste (`TEST_PRODUCT_IDS`) também sejam limpos de `digifarma_ultimas_compras_cache`.

### [Major] Finding 2: Transação SQLite com Falha Silenciosa em `sincronizarEstoqueMedicamentos`
- **O que**: Em caso de falha de gravação no SQLite dentro de `tx(itensParaSalvar)`, a função captura o erro, não faz rollback/throw e retorna `success: true` com contagem total de sincronizados.
- **Onde**: `backend/services/medicamentos-busca.service.js:580-607`.
- **Por que**: API chamadora e endpoints recebem falso positivo de sincronização bem-sucedida quando nenhuma alteração foi persistida.
- **Sugestão de Correção**: Tratar o erro na transação para retornar `{ success: false, error: errTx.message, fromCache, totalSincronizados: 0 }` ou propagar a exceção.

### [Minor] Finding 3: Ausência de `ciclo_vida` no `ON CONFLICT DO UPDATE SET`
- **O que**: A coluna `ciclo_vida` é incluída no `INSERT`, mas não no bloco `DO UPDATE SET`.
- **Onde**: `backend/services/medicamentos-busca.service.js:535-563`.
- **Por que**: Mudanças de ciclo de vida de produtos existentes (ex: ESTAVEL para DECLINIO) nunca serão atualizadas no banco de dados SQLite local durante re-sincronizações.
- **Sugestão de Correção**: Adicionar `ciclo_vida = excluded.ciclo_vida,` no `DO UPDATE SET`.

### [Minor] Finding 4: Divergência de Status para Produto sem Vendas e Saldo Positivo
- **O que**: `calcularInteligenciaEstoque(5, 0)` classifica como `'EXCESSO'` (pois `min=0, max=0` e `5 > 0`), enquanto `determinarStatusRuptura(5, 0)` em `compras-estoque.service.js:254` classifica como `'NORMAL'` (requisito do teste 2.5 de `test_compras_estoque.js`).
- **Onde**: `medicamentos-busca.service.js:62` vs `compras-estoque.service.js:254`.
- **Sugestão de Correção**: Padronizar a regra para que quando `vmd == 0` e `est_minimo == 0`, saldo positivo seja tratado de forma coerente entre os dois serviços.

---

## 4. Verified Claims

- Estoque mínimo para 30 dias de giro (`Math.ceil(VMD_P * 30 * (1 + margem/100))`): **APROVADO** (verificado via testes 2.1 e 2.2).
- Estoque máximo rigorosamente igual a 2x mínimo: **APROVADO** (verificado via teste 2.3 em ambos os serviços).
- Quantidade sugerida de reposição (`Math.max(0, est_minimo - saldo)`): **APROVADO** (verificado via testes 2.4 e 2.5).
- Matriz de 4 status (`RUPTURA`, `ABAIXO_MINIMO`, `NORMAL`, `EXCESSO`): **APROVADO** (verificado via testes 2.6 a 2.9).
- Resolução de preço vigente no período de promoção e expiração: **APROVADO** (verificado via testes 3.1 a 3.6).
- Resiliência offline no SQLite sem lançar erro 500: **APROVADO** (verificado via testes 3.8 e 5.1).
- Suíte `test_compras_estoque.js`: **APROVADO** (23/23 testes, 100%).
- Suíte `test_ultimas_compras_mineracao.js`: **APROVADO** (24/24 testes, 100%).
- Suíte `test_motor_busca_medicamentos.js`: **FALHA** (34/35 testes, teste 4.3 falha).

---

## 5. Caveats

- Não foram alterados arquivos de implementação, em estrito cumprimento às restrições de governança de Reviewer.
- O endpoint REST real (`medicamentos-endpoints.js`) e a integração do Agente Horácio (`horacio-agent.service.js`) pertencem aos Milestones M3 e M4 e não foram avaliados nesta auditoria de M2.

---

## 6. Conclusion

O Milestone M2 apresenta avanços arquiteturais de alta qualidade (fórmulas de 30 dias/2x rigorosas, benchmarks ultrarrápidos abaixo de 1ms, resolução precisa de vigência promocional). Entretanto, **NÃO PODE SER APROVADO** neste ciclo devido à quebra de regressão no teste 4.3 de `backend/test_motor_busca_medicamentos.js` e à discrepância de atestação no handoff do implementador.

O parecer formal é **REQUEST_CHANGES**.

---

## 7. Verification Method

Para verificar a resolução das pendências, o desenvolvedor deve aplicar as correções dos findings 1, 2 e 3 e executar:

```powershell
# 1. Deve retornar 35/35 APROVADOS (100%) e exit code 0
node backend/test_motor_busca_medicamentos.js

# 2. Deve permanecer 23/23 APROVADOS (100%) e exit code 0
node backend/test_compras_estoque.js

# 3. Deve permanecer 24/24 APROVADOS (100%) e exit code 0
node backend/test_ultimas_compras_mineracao.js
```
