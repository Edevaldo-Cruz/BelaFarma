# Relatório de Handoff — Explorer 2: Survey de Sincronização, Inteligência de Estoque e Resiliência

**Data/Hora**: 2026-09-04T12:16:00Z  
**Agente**: Explorer 2 (Survey de Sincronização, Inteligência de Estoque e Resiliência)  
**Diretório de Trabalho**: `f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_survey_2`  
**Destinatário**: Orchestrator (`43b4ed79-f1ab-4a34-b8c7-4fbc5c8b65ce`)  

---

## 1. Observation

### 1.1 Estado Atual das Queries e Rotinas de Sincronização com o Digifarma (Firebird)

#### A. Sincronização de Estoque e Vendas 30/60/90d
- **Arquivo**: `backend/services/compras-estoque.service.js` (linhas 237–280 e 545–588)
- **Implementação**:
  A sincronização atual extrai o catálogo ativo e as vendas agrupadas em 3 janelas temporais diretamente no Firebird:
  ```sql
  SELECT 
    p.PRODUTO_ID,
    p.PRODUTO as DESCRICAO,
    p.APRESENTACAO,
    p.COD_BARRAS as EAN,
    p.CATEGORIA_ID,
    p.PROD_SALDO as SALDO,
    p.PROD_ESTMINIMO as EST_MINIMO_DIGIFARMA,
    COALESCE(p.PROD_PRCOMPRA, 0) as CUSTO_UNITARIO,
    COALESCE(p.VALOR_ULT_COMPRA, 0) as ULTIMA_COMPRA_VALOR,
    p.PROD_ATIVO,
    COALESCE(v30.QTD_30D, 0) as VENDAS_30D,
    COALESCE(v60.QTD_31_60D, 0) as VENDAS_31_60D,
    COALESCE(v90.QTD_61_90D, 0) as VENDAS_61_90D
  FROM PRODUTOS p
  LEFT JOIN (
    SELECT iv.PRODUTO_ID, SUM(iv.ITEMVEND_QUANT) as QTD_30D
    FROM ITEM_VENDAS iv
    JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
    WHERE v.CANCELADO <> 'S'
      AND v.VENDA_DATA_HORA >= CAST('NOW' AS TIMESTAMP) - 30
    GROUP BY iv.PRODUTO_ID
  ) v30 ON p.PRODUTO_ID = v30.PRODUTO_ID
  LEFT JOIN (
    SELECT iv.PRODUTO_ID, SUM(iv.ITEMVEND_QUANT) as QTD_31_60D
    FROM ITEM_VENDAS iv
    JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
    WHERE v.CANCELADO <> 'S'
      AND v.VENDA_DATA_HORA >= CAST('NOW' AS TIMESTAMP) - 60
      AND v.VENDA_DATA_HORA < CAST('NOW' AS TIMESTAMP) - 30
    GROUP BY iv.PRODUTO_ID
  ) v60 ON p.PRODUTO_ID = v60.PRODUTO_ID
  LEFT JOIN (
    SELECT iv.PRODUTO_ID, SUM(iv.ITEMVEND_QUANT) as QTD_61_90D
    FROM ITEM_VENDAS iv
    JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
    WHERE v.CANCELADO <> 'S'
      AND v.VENDA_DATA_HORA >= CAST('NOW' AS TIMESTAMP) - 90
      AND v.VENDA_DATA_HORA < CAST('NOW' AS TIMESTAMP) - 60
    GROUP BY iv.PRODUTO_ID
  ) v90 ON p.PRODUTO_ID = v90.PRODUTO_ID
  WHERE p.PROD_ATIVO = 'S'
  ```
- **Disparo**: Apenas manual no endpoint `POST /api/central-compras/estoque/recalcular` (`compras-endpoints.js`: linha 162). Não há cron executando este recálculo automaticamente.

#### B. Sincronização de Preços Promocionais e Preços Normais
- **Arquivo**: `backend/services/digifarma-sync.service.js` (linhas 53–75 e linhas 8–29)
- **Implementação**:
  - A query de produtos do `digifarma-sync.service.js` busca:
    ```sql
    SELECT PRODUTO_ID, PRODUTO, APRESENTACAO, COD_BARRAS, CATEGORIA_ID, ESTOQUE,
           PROD_PRVENDA, PROD_PRCOMPRA, PROD_PRPROMOCAO, INICIO_PROMOCAO, TERMINO_PROMOCAO, ...
    FROM PRODUTOS WHERE PROD_ATIVO = 'S'
    ```
  - A função `getEffectivePrice(p)` calcula o preço efetivo:
    - Se `PROD_PRPROMOCAO > 0` e `now >= INICIO_PROMOCAO` e `now <= TERMINO_PROMOCAO` (com fim às 23:59:59.999), retorna `PROD_PRPROMOCAO`.
    - Caso contrário, retorna `PROD_PRVENDA`.
  - **Deficiência observada**: Os dados de promoção (`PROD_PRPROMOCAO`, `INICIO_PROMOCAO`, `TERMINO_PROMOCAO`) são gravados exclusivamente na tabela `digifarma_products_cache`, mas **NÃO** são gravados na tabela `compras_estoque_cache`, que atualmente nem possui essas colunas.

#### C. Sincronização de Notas Fiscais de Entrada (Últimas Compras)
- **Arquivo**: `backend/services/compras-mineracao.service.js` (linhas 3112–3131) e `backend/services/entradas-sync.service.js` (linhas 21–38)
- **Implementação**:
  ```sql
  SELECT
    I.PRODUTO_ID,
    P.COD_BARRAS,
    P.PRODUTO,
    I.ITEM_NOTAS_PRCOMPRA,
    I.ITEM_NOTAS_EMBALAGEM,
    I.ITEM_NOTAS_ULT_COMPRA,
    I.ITEM_NOTAS_QUANT,
    C.DATA_EMISSAO,
    C.NOTA_FISCAL,
    F.FORNECEDOR
  FROM ITEM_NOTAS I
  JOIN CAB_NOTAS C ON I.CAB_NOTA_ID = C.CAB_NOTA_ID
  JOIN PRODUTOS P ON I.PRODUTO_ID = P.PRODUTO_ID
  LEFT JOIN FORNECEDORES F ON C.FORNECEDOR_ID = F.FORNECEDOR_ID
  WHERE C.ENTRADA_SAIDA = 'E' AND (C.CANCELAMENTO = 'N' OR C.CANCELAMENTO IS NULL)
    AND C.DATA_EMISSAO >= ?
  ORDER BY C.DATA_EMISSAO DESC, C.CAB_NOTA_ID DESC
  ```
- **Cálculo de Preço Real**: Realizado por `calcularPrecoUnitarioReal(prCompra, emb, ultFrac)` em `compras-mineracao.service.js`: linha 767, dividindo pelo fator da embalagem fracionada e gravado em `digifarma_ultimas_compras_cache`.
- **Deficiência observada**: O serviço de estoque `compras-estoque.service.js` lê apenas `p.VALOR_ULT_COMPRA` da tabela `PRODUTOS`. Não faz join com `ITEM_NOTAS`, e as colunas `ultima_compra_fornecedor`, `ultima_compra_data` e `ultima_compra_nf` não existem em `compras_estoque_cache`.

---

### 1.2 Tratamento de Erros e Resiliência Offline

- **Conexão e Pool**: `backend/services/digifarma.service.js` (linhas 1–127).
  - Pool com 10 conexões Firebird apontando para `192.168.1.10:3050`, database `C:\Digifarma\Dados\digifarma6.fdb`.
  - **Circuit Breaker**: Em caso de falha de conexão física no pool, `firebirdOfflineUntil = Date.now() + 20000;` (mantém bloqueado por 20 segundos).
  - Consultas em modo offline durante o circuit breaker são rejeitadas imediatamente com erro `"Circuit Breaker: Servidor do Digifarma Offline."`, sem segurar a requisição.
  - **Timeout de Consulta**: `queryDigifarma(sql, params, timeoutMs)` possui timeout padrão de 30.000ms (15.000ms em buscas pontuais, 60.000ms em recálculos globais).
- **Mecanismo de Fallback em `compras-estoque.service.js`**:
  - `calcularEstoqueMinimo30Dias(produtoId)`: Em caso de falha ou circuit breaker no Firebird (linhas 286–288), faz fallback transparente para `db.prepare('SELECT * FROM compras_estoque_cache WHERE produto_id = ?').get(pId)` e define `fromCache = true` (linha 294).
  - `recalcularTodosEstoqueMinimo()`: Em caso de falha no Firebird (linhas 595–624), faz fallback para `db.prepare('SELECT * FROM compras_estoque_cache').all()`, permitindo recalcular usando os históricos já existentes.
  - `listarProdutosAbaixoDoMinimo()`: Executa **100% no SQLite** (`compras_estoque_cache`), respondendo em `< 5ms` sem tocar no Firebird.
  - `sincronizarEstoqueMinimoDigifarma()`: Tenta gravar `UPDATE PRODUTOS SET PROD_ESTMINIMO = ? WHERE PRODUTO_ID = ?` no Firebird. Se falhar, retorna `{ success: false, error: err.message }` de forma graciosa sem quebrar a aplicação.
- **Estado de Conexão no Teste em Tempo Real**:
  - Teste executado no ambiente: conexão com o Firebird `192.168.1.10:3050` está **ONLINE e operacional**, respondendo com sucesso a consultas em `PRODUTOS`.

---

### 1.3 Cálculo de Reposição Atual (VMD, Margem e Estoque Mínimo/Máximo)

- **Arquivo**: `backend/services/compras-estoque.service.js` (linhas 58–178).
- **Implementação Atual**:
  ```javascript
  const demanda90dPonderada = (v1 * pesoP1) + (v2 * pesoP2) + (v3 * pesoP3); // Pesos padrão 0.50, 0.30, 0.20
  const vmdPonderado = demanda90dPonderada / 30;
  const demanda15d = vmdPonderado * 15;
  const demanda30d = vmdPonderado * 30;

  let multiplicadorCiclo = 1.0;
  if (cicloVida === 'CRESCIMENTO') multiplicadorCiclo = 1.20;
  else if (cicloVida === 'DECLINIO') multiplicadorCiclo = 0.50;

  const fatorMargem = 1 + ((margem * multiplicadorCiclo) / 100);

  let estoqueMinimo = Math.ceil(demanda15d * fatorMargem);  // ⚠️ 15 DIAS DE GIRO
  let estoqueMaximo = Math.ceil(demanda30d * fatorMargem); // ⚠️ 30 DIAS DE GIRO
  if (estoqueMaximo < estoqueMinimo) estoqueMaximo = estoqueMinimo * 2;
  ```
- **Problema Crítico de Divergência**:
  1. O código calcula `estoqueMinimo` para **15 dias** (`demanda15d`), enquanto o requisito R2 de `ORIGINAL_REQUEST.md` exige rigorosamente **30 dias de cobertura sem ruptura**: `Math.ceil(VMD_P * 30 * (1 + margem/100))`.
  2. O `estoqueMaximo` é calculado de forma independente via `demanda30d * fatorMargem`, enquanto o requisito R2 exige: `est_maximo_calculado = est_minimo_calculado * 2`.
  3. A quantidade sugerida de reposição em `listarProdutosAbaixoDoMinimo` (linha 927) calcula `sugerido = Math.max(0, estMax - saldo)`, enquanto o requisito R2 estipula: `Math.max(0, est_minimo_calculado - saldo)` (defasagem para cobrir os 30 dias de segurança).
  4. Classificação de status em `determinarStatusRuptura` (linhas 192–207): quando `min = 0` e `saldo > 0`, o fallback interno calcula `max = 1`, classificando erroneamente produtos sem giro com saldo positivo como `EXCESSO` em vez de `NORMAL`.
  5. Quebra de retrocompatibilidade de parâmetros em `test_compras_estoque.js`: a suíte falhou em 8 testes porque a função foi refatorada para receber `vendas61_90dOuMargem` como 3º parâmetro sem manter sobrecarga compatível com chamadas legadas `(v30, v60, margem)`.

---

### 1.4 Configuração de Agendamento e Cron

- **Arquivo**: `backend/server.js` (linhas 4130–4450)
- **Crons Atualmente Existentes no Sistema**:
  - Backup local SQLite: `01:00` e `13:00` (`cron.schedule('0 1 * * *')`, `cron.schedule('0 13 * * *')`).
  - Notícias da Rádio: `08:30`, `14:30`, `19:30`.
  - Robô de Faltas Automáticas: `23:30` diariamente.
  - Vigilante de Saúde: a cada 6 horas (`0 */6 * * *`).
  - Sincronização de Faltas: a cada hora (`0 * * * *`).
  - Napp Solutions Scraper: todo domingo às `02:00`.
  - Agente Horácio (Cortes comerciais): `11:00` e `16:00` de Seg a Sáb (`cron.schedule('0 11,16 * * 1-6')`).
  - Daemon de Sincronização Rápida: `setInterval` a cada 2 minutos (vendas de hoje e crediário).
  - Daemon de Sincronização Completa de Produtos: `setInterval` a cada 2 horas (`syncProdutos` e `syncEstoqueResumo`).
  - Daemon de Entradas Recentes: `setInterval` a cada 15 minutos (`sincronizarVariacaoPrecosMural`).
- **Constatação**:
  - **NÃO EXISTE** cron configurado para sincronizar o estoque de reposição 2 vezes ao dia (ex: início da manhã às 07:30 e fim de tarde às 17:30).
  - **NÃO EXISTE** a rota `POST /api/medicamentos/sincronizar` nem as rotas `GET /api/medicamentos/*`.

---

### 1.5 Estrutura da Tabela `compras_estoque_cache` (SQLite)

- **Arquivo**: `backend/database.js` (linhas 1831–1872)
- **Schema Atual Verificado via PRAGMA**:
  - `produto_id` (PK), `descricao`, `ean`, `categoria_id`, `curva_abc`, `saldo`, `est_minimo_calculado`, `est_minimo_digifarma`, `vmd_ponderado`, `vendas_30d`, `vendas_31_60d`, `vendas_61_90d`, `ciclo_vida`, `custo_unitario`, `ultima_compra_valor`, `status_ruptura`, `margem_seguranca_aplicada`, `dias_sem_venda`, `sincronizado_em`, `atualizado_em`, `est_maximo_calculado`.
- **Registros Atuais**: 64.537 linhas armazenadas no SQLite.
- **Índices Existentes**:
  - `idx_cec_status` (`status_ruptura`)
  - `idx_cec_ean` (`ean`)
  - `idx_cec_curva` (`curva_abc`)
  - `idx_cec_ciclo` (`ciclo_vida`)
  - `idx_cec_descricao` (`descricao`)

---

## 2. Logic Chain

1. **Premissa 1 (R2)**: O requisito R2 de `ORIGINAL_REQUEST.md` define que o Estoque Mínimo (`est_minimo_calculado`) deve garantir 30 dias de operação sem ruptura (`Math.ceil(VMD_P * 30 * (1 + margem/100))`) e o Estoque Máximo (`est_maximo_calculado`) deve ser estritamente o dobro (`est_minimo_calculado * 2`).
   - *Observação*: No arquivo `backend/services/compras-estoque.service.js` linha 152, o cálculo multiplica `demanda15d * fatorMargem`, resultando em apenas 15 dias de cobertura. E na linha 153 calcula o máximo separadamente com `demanda30d * fatorMargem`.
   - *Dedução*: Há divergência direta com a regra de negócio central de 30 dias sem ruptura. O serviço atual projeta apenas metade do estoque de segurança necessário.

2. **Premissa 2 (R1 e R3 - Dados de Promoção e Notas Fiscais)**: O requisito R1 e R3 estabelece que a tabela `compras_estoque_cache` deve unificar preços de venda vigentes (resolvendo se a promoção está ativa), histórico da última compra com dados da nota fiscal (preço unitário real com rateio de embalagem, data, fornecedor e NF) e ser a fonte única de verdade do motor de busca.
   - *Observação*: A tabela `compras_estoque_cache` não possui as colunas `apresentacao`, `preco_venda_vigente`, `preco_normal`, `preco_promocional`, `inicio_promocao`, `termino_promocao`, `ultima_compra_fornecedor`, `ultima_compra_data`, `ultima_compra_nf`, nem `qtd_sugerida_compra`. Além disso, a query do `compras-estoque.service.js` não consulta tabelas de notas fiscais (`CAB_NOTAS`/`ITEM_NOTAS`) nem promoções.
   - *Dedução*: O motor de busca e o Agente Horácio não conseguem consultar preço vigente ou dados fidedignos de última compra a partir de `compras_estoque_cache` no estado atual da tabela e das queries.

3. **Premissa 3 (R3 - Agendamento 2x ao Dia)**: O requisito R3 exige rotina agendada 2x ao dia (início da manhã às 07:30 e fim de tarde às 17:30) com timezone de Brasília (`America/Sao_Paulo`), além do endpoint manual `/api/medicamentos/sincronizar`.
   - *Observação*: A busca por cron no `backend/server.js` revelou que não existe agendamento configurado para 07:30 e 17:30, nem existe o endpoint `/api/medicamentos/sincronizar`.
   - *Dedução*: A rotina de inteligência de estoque depende hoje 100% de disparos manuais na interface da Central de Compras ou de rotinas assíncronas isoladas que não alimentam o cache unificado.

4. **Premissa 4 (R3 e Resiliência Offline)**: Se o Firebird cair ou estiver inacessível, o sistema deve continuar respondendo 100% via SQLite local em `< 10ms` sem disparar erro HTTP 500.
   - *Observação*: `compras_estoque_cache` já possui 64.537 registros cacheados no SQLite e `digifarma.service.js` possui Circuit Breaker de 20s. A consulta local ao SQLite já executa em menos de 2ms.
   - *Dedução*: A infraestrutura de resiliência local via SQLite é sólida e funcional, necessitando apenas que os novos endpoints `/api/medicamentos/*` e a rotina de sincronização tratem o erro de rede/timeout do Firebird sem quebrar o retorno JSON.

5. **Premissa 5 (R5 - Notificação do Horácio)**: Ao concluir a sincronização diária, o motor deve compilar os itens críticos em ruptura ou abaixo do mínimo e acionar o Agente Horácio para gerar o relatório executivo de compras do dia.
   - *Observação*: Em `backend/server.js` linha 4438, o Agente Horácio é acionado apenas nos horários de corte (11h e 16h) lendo `compras_oportunidades_mineradas`.
   - *Dedução*: Não há gancho automático conectando o término da sincronização diária de estoque com a compilação proativa de relatório executivo de compras no Horácio.

---

## 3. Caveats

1. **Volume de Dados no Firebird**: Uma query direta no Firebird que junta `PRODUTOS`, `ITEM_VENDAS` (90 dias) e `ITEM_NOTAS` em um único `JOIN` pode ser proibitivamente lenta (> 60 segundos) se executada para todos os 64k produtos de uma só vez. A estratégia recomendada é sincronizar em etapas otimizadas ou combinar os dados já existentes em `digifarma_products_cache` e `digifarma_ultimas_compras_cache` em uma transação local SQLite de alta velocidade.
2. **Concorrência de Acesso ao SQLite**: O SQLite do projeto opera em modo WAL com transações síncronas. Qualquer rotina de sincronização em lote deve utilizar `db.transaction()` para evitar locks de escrita prolongados.
3. **Comunicação Firebird em Ambiente de Produção**: Em produção Linux (Raspberry Pi 4), a latência para o Firebird pode variar se a rede interna oscilar. O circuit breaker existente de 20s é vital para proteger o Node.js contra esgotamento do pool.
4. **Modificações de Código Fonte**: Como Explorer em modo estritamente read-only, nenhuma alteração de código ou banco foi realizada durante este survey.

---

## 4. Conclusion

### Mapeamento dos Gaps em Relação aos Requisitos R2 e R3

| Item | Requisito em ORIGINAL_REQUEST.md | Estado Atual no Código | Gap Identificado | Ação Necessária na Implementação |
| :--- | :--- | :--- | :--- | :--- |
| **G1** | **R2**: Estoque Mínimo para 30 dias de giro sem ruptura | Calcula 15 dias de giro (`demanda15d * fatorMargem`) | **Crítico**: Projeta apenas metade do estoque de segurança | Alterar fórmula para `Math.ceil(VMD_P * 30 * (1 + margem/100))` |
| **G2** | **R2**: Estoque Máximo rigorosamente igual a 2x o mínimo | Calcula `Math.ceil(demanda30d * fatorMargem)` | **Médio**: Máximo não é estritamente 2x o mínimo devido a arredondamentos | Definir `est_maximo_calculado = est_minimo_calculado * 2` |
| **G3** | **R2**: Quantidade Sugerida de Compra (defasagem para 30d) | Calcula `est_maximo - saldo` | **Médio**: Sugere compra para atingir estoque máximo | Definir `qtd_sugerida_compra = Math.max(0, est_minimo_calculado - saldo)` |
| **G4** | **R2**: Matriz de Classificação de Status | Fallback classifica `saldo > 0` com `min = 0` como `EXCESSO` | **Baixo**: Falso excesso em itens sem giro | Ajustar `determinarStatusRuptura`: RUPTURA (<=0), ABAIXO_MINIMO (< min), NORMAL (min..max), EXCESSO (> max) |
| **G5** | **R1/R2**: Schema de `compras_estoque_cache` | Faltam 10 colunas requeridas por R1 | **Crítico**: Schema defasado em relação a promoções e última NF | Aplicar migrations `ALTER TABLE` para adicionar as colunas ausentes |
| **G6** | **R3**: Sincronização Agendada 2x ao dia (07h30 e 17h30) | Inexistente (apenas crons de backup, rádio, horacio corte) | **Crítico**: Não há execução periódica configurada | Adicionar `cron.schedule('30 7,17 * * *')` no `server.js` |
| **G7** | **R3**: Endpoint `POST /api/medicamentos/sincronizar` | Inexistente (apenas rotas em `/api/central-compras/estoque/*`) | **Crítico**: Rota REST ausente | Criar rota sob demanda com feedback estruturado |
| **G8** | **R3**: Extração de Preços Promocionais vigentes | Apenas no `digifarma-sync.service.js` para outra tabela | **Alto**: `compras_estoque_cache` não tem preço vigente | Incluir `PROD_PRVENDA`, `PROD_PRPROMOCAO`, datas de vigência no sync do estoque |
| **G9** | **R3**: Extração de dados da última nota fiscal | Apenas no `compras-mineracao.service.js` para outra tabela | **Alto**: `compras_estoque_cache` não tem fornecedor, NF e data | Cruzar/migrar dados de `digifarma_ultimas_compras_cache` para `compras_estoque_cache` |
| **G10** | **R3**: Resiliência Offline com Fallback Total | Fallback existe parcialmente em recálculo e listagem | **Médio**: Endpoints novos de busca devem ser 100% SQLite | Garantir que o serviço de busca e endpoints nunca travem com Firebird offline |
| **G11** | **R4**: Motor de Busca de Medicamentos | Inexistente (apenas `/api/central-compras/estoque/minimo`) | **Crítico**: Serviço centralizado e endpoints ausentes | Implementar motor de busca com filtro por termo, EAN, status e paginação |
| **G12** | **R5**: Acionamento Proativo do Agente Horácio | Inexistente após a sincronização diária | **Alto**: Horácio só roda em horário de corte | Acionar `horacioAgent` ao concluir a sincronização matinal e vespertina |

---

## 5. Verification Method

Para que o orquestrador ou o especialista de implementação possam verificar de forma independente as constatações deste relatório:

1. **Verificação do Código Atual de Cálculo**:
   - Inspecionar `backend/services/compras-estoque.service.js` nas linhas 152–158:
     ```javascript
     let estoqueMinimo = Math.ceil(demanda15d * fatorMargem); // 15 dias!
     let estoqueMaximo = Math.ceil(demanda30d * fatorMargem);
     ```
   - Inspecionar linha 927:
     ```javascript
     sugerido = Math.max(0, estMax - saldo); // Usa estMax!
     ```

2. **Verificação da Suíte de Testes Existente**:
   - Executar no diretório `backend`:
     ```powershell
     node test_compras_estoque.js
     ```
   - Confirmar as 8 falhas atuais decorrentes de divergências nas fórmulas matemáticas e assinaturas de parâmetros.

3. **Verificação do Schema da Tabela `compras_estoque_cache`**:
   - Executar no diretório `backend`:
     ```powershell
     node -e "const db = require('./database'); console.log(db.pragma('table_info(compras_estoque_cache)').map(c => c.name));"
     ```
   - Constatar a ausência das colunas: `apresentacao`, `preco_venda_vigente`, `preco_normal`, `preco_promocional`, `inicio_promocao`, `termino_promocao`, `ultima_compra_fornecedor`, `ultima_compra_data`, `ultima_compra_nf` e `qtd_sugerida_compra`.

4. **Verificação dos Agendamentos Cron Atuais**:
   - Inspecionar `backend/server.js` nas linhas 4130 a 4450 e verificar que não existe nenhum `cron.schedule` registrado para `30 7,17 * * *`.

5. **Verificação da Conectividade do Firebird**:
   - Executar no diretório `backend`:
     ```powershell
     node -e "const { queryDigifarma } = require('./services/digifarma.service'); queryDigifarma('SELECT FIRST 1 PRODUTO_ID, PRODUTO FROM PRODUTOS').then(console.log).catch(console.error);"
     ```
   - Confirmar que o banco Firebird em `192.168.1.10:3050` está online e responde normalmente.

---
**Status**: Survey concluído com sucesso. Relatório pronto para balizar a implementação da Central de Compras e Motor de Medicamentos.
