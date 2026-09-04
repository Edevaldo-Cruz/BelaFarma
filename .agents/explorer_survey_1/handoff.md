# Relatório de Survey de Banco de Dados e Esquema (Explorer 1)

## 1. Observation

### 1.1 Inicialização do SQLite e Gerenciamento de Migrações
- **Caminho do Banco de Dados e Conexão**:
  - `backend/config.js` (linhas 9-17):
    ```javascript
    let dbPath = process.env.DB_PATH;
    if (!dbPath) {
      const localDataDir = path.join(__dirname, '..', 'data');
      if (fs.existsSync(localDataDir)) {
        dbPath = path.join(localDataDir, 'belafarma.db');
      } else {
        dbPath = path.join(__dirname, 'belafarma.db');
      }
    }
    ```
    Em ambiente local de desenvolvimento, o arquivo ativo é `f:\Documentos\Desenvolvimento\BelaFarma\data\belafarma.db`.
  - `backend/database.js` (linhas 1-15):
    - Driver utilizado: `better-sqlite3`.
    - Modo WAL ativado logo após a inicialização: `db.pragma('journal_mode = WAL');`.
  - **Mecanismo de Migrações**:
    - Não há framework externo de migração (ex: Flyway, Knex, Prisma).
    - As tabelas são criadas e migradas via chamadas puras e síncronas na função `createTables()` em `backend/database.js` (executada na linha 2315 no momento do require).
    - Tabelas novas usam: `db.exec('CREATE TABLE IF NOT EXISTS ...');`.
    - Adições de novas colunas usam blocos idempotentes:
      ```javascript
      try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN ...'); } catch(e) {}
      ```
    - Índices usam:
      ```javascript
      try { db.exec('CREATE INDEX IF NOT EXISTS idx_... ON tabela(coluna)'); } catch(e) {}
      ```

### 1.2 Estrutura Atual da Tabela `compras_estoque_cache`
- **Definição em código (`backend/database.js`, linhas 1833-1871)**:
  ```sql
  CREATE TABLE IF NOT EXISTS compras_estoque_cache (
    produto_id INTEGER PRIMARY KEY,
    descricao TEXT NOT NULL,
    ean TEXT,
    categoria_id INTEGER DEFAULT 0,
    curva_abc TEXT DEFAULT 'C',
    saldo REAL DEFAULT 0,
    est_minimo_calculado REAL DEFAULT 0,
    est_maximo_calculado REAL DEFAULT 0,
    est_minimo_digifarma REAL DEFAULT 0,
    vmd_ponderado REAL DEFAULT 0,
    vendas_30d REAL DEFAULT 0,
    vendas_31_60d REAL DEFAULT 0,
    vendas_61_90d REAL DEFAULT 0,
    ciclo_vida TEXT DEFAULT 'ESTAVEL',
    custo_unitario REAL DEFAULT 0,
    ultima_compra_valor REAL DEFAULT 0,
    status_ruptura TEXT DEFAULT 'NORMAL',
    margem_seguranca_aplicada REAL DEFAULT 15.0,
    dias_sem_venda INTEGER DEFAULT 0,
    sincronizado_em TEXT,
    atualizado_em TEXT NOT NULL
  );
  ```
- **Inspeção física no banco (`data/belafarma.db`)**:
  - Total de registros atuais: **64.537 produtos cadastrados**.
  - Colunas existentes:
    1. `produto_id` (INTEGER, PK=1)
    2. `descricao` (TEXT NOT NULL, PK=0)
    3. `ean` (TEXT, PK=0)
    4. `categoria_id` (INTEGER DEFAULT 0, PK=0)
    5. `curva_abc` (TEXT DEFAULT 'C', PK=0)
    6. `saldo` (REAL DEFAULT 0, PK=0)
    7. `est_minimo_calculado` (REAL DEFAULT 0, PK=0)
    8. `est_minimo_digifarma` (REAL DEFAULT 0, PK=0)
    9. `vmd_ponderado` (REAL DEFAULT 0, PK=0)
    10. `vendas_30d` (REAL DEFAULT 0, PK=0)
    11. `vendas_31_60d` (REAL DEFAULT 0, PK=0)
    12. `custo_unitario` (REAL DEFAULT 0, PK=0)
    13. `ultima_compra_valor` (REAL DEFAULT 0, PK=0)
    14. `status_ruptura` (TEXT DEFAULT 'NORMAL', PK=0)
    15. `margem_seguranca_aplicada` (REAL DEFAULT 15.0, PK=0)
    16. `dias_sem_venda` (INTEGER DEFAULT 0, PK=0)
    17. `sincronizado_em` (TEXT, PK=0)
    18. `atualizado_em` (TEXT NOT NULL, PK=0)
    19. `vendas_61_90d` (REAL DEFAULT 0, PK=0)
    20. `ciclo_vida` (TEXT DEFAULT 'ESTAVEL', PK=0)
    21. `est_maximo_calculado` (REAL DEFAULT 0, PK=0)
- **Índices existentes e ativos**:
  - `idx_cec_status` em `compras_estoque_cache(status_ruptura)`
  - `idx_cec_ean` em `compras_estoque_cache(ean)`
  - `idx_cec_curva` em `compras_estoque_cache(curva_abc)`
  - `idx_cec_ciclo` em `compras_estoque_cache(ciclo_vida)`
  - `idx_cec_descricao` em `compras_estoque_cache(descricao)`
- **Desempenho medido dos índices (Benchmark em 64.537 registros)**:
  - Busca por `produto_id` (PK): `0.0603 ms`
  - Busca por `ean` (Index): `0.0626 ms`
  - Busca por `descricao` LIKE '%DIPIRONA%': `2.2917 ms`
  - Busca por `status_ruptura` (Index): `0.1015 ms`
  - Busca por `curva_abc` (Index): `0.1296 ms`
  - Todas as consultas executam com folga abaixo de `2.5 ms` (limite exigido em R1: `< 10 ms`).

### 1.3 Comparativo de Campos de R1 com a Tabela Atual

| Bloco R1 | Campo Exigido | Tipo / Restrição | Estado Atual | Ação Necessária |
| :--- | :--- | :--- | :--- | :--- |
| **Identificação** | `produto_id` | INTEGER PRIMARY KEY | Já existe (`PK=1`) | Nenhuma |
| | `ean` | TEXT | Já existe (indexado) | Nenhuma |
| | `descricao` | TEXT NOT NULL | Já existe (indexado) | Nenhuma |
| | `apresentacao` | TEXT | **Ausente** (estava concatenado em `descricao`) | `ADD COLUMN apresentacao TEXT;` |
| | `categoria_id` | INTEGER DEFAULT 0 | Já existe | Nenhuma |
| | `curva_abc` | TEXT DEFAULT 'C' | Já existe (indexado) | Nenhuma |
| **Estoque** | `saldo` | REAL DEFAULT 0 | Já existe | Nenhuma |
| **Preço de Venda** | `preco_venda_vigente` | REAL DEFAULT 0 | **Ausente** | `ADD COLUMN preco_venda_vigente REAL DEFAULT 0;` |
| | `preco_normal` | REAL DEFAULT 0 | **Ausente** | `ADD COLUMN preco_normal REAL DEFAULT 0;` |
| | `preco_promocional` | REAL DEFAULT 0 | **Ausente** | `ADD COLUMN preco_promocional REAL DEFAULT 0;` |
| | `inicio_promocao` | TEXT | **Ausente** | `ADD COLUMN inicio_promocao TEXT;` |
| | `termino_promocao` | TEXT | **Ausente** | `ADD COLUMN termino_promocao TEXT;` |
| **Última Compra** | `preco_unitario_ult_compra` | REAL DEFAULT 0 | Campo chama `ultima_compra_valor` | `ADD COLUMN preco_unitario_ult_compra REAL DEFAULT 0;` (e manter alias/sync com `ultima_compra_valor`) |
| | `ultima_compra_fornecedor` | TEXT | **Ausente** | `ADD COLUMN ultima_compra_fornecedor TEXT;` |
| | `ultima_compra_data` | TEXT | **Ausente** | `ADD COLUMN ultima_compra_data TEXT;` |
| | `ultima_compra_nf` | TEXT | **Ausente** | `ADD COLUMN ultima_compra_nf TEXT;` |
| **Reposição & Consumo** | `vmd_ponderado` | REAL DEFAULT 0 | Já existe | Nenhuma |
| | `vendas_30d` | REAL DEFAULT 0 | Já existe | Nenhuma |
| | `vendas_31_60d` | REAL DEFAULT 0 | Já existe | Nenhuma |
| | `vendas_61_90d` | REAL DEFAULT 0 | Já existe | Nenhuma |
| | `ciclo_vida` | TEXT DEFAULT 'ESTAVEL' | Já existe | Nenhuma |
| | `est_minimo_calculado` | REAL DEFAULT 0 | Já existe, mas calculava 15d | Atualizar cálculo para 30 dias |
| | `est_maximo_calculado` | REAL DEFAULT 0 | Já existe | Atualizar cálculo para 2x mínimo |
| | `qtd_sugerida_compra` | REAL DEFAULT 0 | **Ausente** | `ADD COLUMN qtd_sugerida_compra REAL DEFAULT 0;` |
| | `status_ruptura` | TEXT DEFAULT 'NORMAL' | Já existe (indexado) | Nenhuma |

### 1.4 Conexão Firebird e Queries Existentes no Backend
- **Conexão**:
  - Arquivo: `backend/services/digifarma.service.js`.
  - Host: `192.168.1.10:3050`, Database: `C:\Digifarma\Dados\digifarma6.fdb`, User: `SYSDBA`.
  - Pool com 10 conexões (`node-firebird.pool(10, options)`), Circuit Breaker de 20 segundos em falhas físicas de rede.
- **Tabelas do Firebird Utilizadas**:
  - `PRODUTOS`:
    - `PRODUTO_ID` (inteiro)
    - `PRODUTO` (descrição comercial)
    - `APRESENTACAO` (dosagem/forma farmacêutica)
    - `COD_BARRAS` (EAN)
    - `CATEGORIA_ID` (categoria interna)
    - `PROD_SALDO` (saldo físico em loja)
    - `PROD_PRVENDA` (preço normal de venda)
    - `PROD_PRPROMOCAO` (preço promocional cadastrado)
    - `INICIO_PROMOCAO` (timestamp/data de início da promoção)
    - `TERMINO_PROMOCAO` (timestamp/data de término da promoção)
    - `PROD_ESTMINIMO` (campo onde é gravado o estoque mínimo no Digifarma)
    - `PROD_PRCOMPRA` / `VALOR_ULT_COMPRA` (custo/última compra de cadastro)
    - `PROD_ATIVO` (filtro `'S'`)
  - `CAB_NOTAS` + `ITEM_NOTAS` + `FORNECEDORES`:
    - Filtrados por `CAB_NOTAS.ENTRADA_SAIDA = 'E'` e `(CAB_NOTAS.CANCELAMENTO = 'N' OR CAB_NOTAS.CANCELAMENTO IS NULL)`.
    - Ordenados por `CAB_NOTAS.DATA_EMISSAO DESC, CAB_NOTAS.CAB_NOTA_ID DESC`.
    - Dados extraídos: `ITEM_NOTAS_PRCOMPRA`, `ITEM_NOTAS_EMBALAGEM`, `ITEM_NOTAS_ULT_COMPRA`, `CAB_NOTAS.DATA_EMISSAO`, `CAB_NOTAS.NOTA_FISCAL`, `FORNECEDORES.FORNECEDOR`.
  - `CAB_VENDAS` + `ITEM_VENDAS`:
    - Filtrados por `CAB_VENDAS.CANCELADO <> 'S'` para os 3 períodos (0-30d, 31-60d, 61-90d).

---

## 2. Logic Chain

1. **Observação 1.1** mostra que a inicialização do SQLite ocorre em `backend/database.js` no arquivo ativo `data/belafarma.db` através de DDLs e `ALTER TABLE` controlados em blocos `try/catch`.
   - **Inferência**: Para adicionar os campos faltantes de R1, a abordagem canônica do projeto é inserir instruções idempotentes `ALTER TABLE compras_estoque_cache ADD COLUMN ...` logo abaixo da criação da tabela em `backend/database.js` (linhas 1857-1873).

2. **Observações 1.2 e 1.3** mostram que a tabela `compras_estoque_cache` já possui 64.537 registros populados e 5 índices cobrindo `status_ruptura`, `ean`, `curva_abc`, `ciclo_vida` e `descricao`.
   - **Inferência**: A tabela é a base central de produtos da loja. Nenhuma alteração destrutiva (DROP TABLE) pode ocorrer. Apenas comandos aditivos de colunas (`ALTER TABLE compras_estoque_cache ADD COLUMN ...`) e comandos de `UPDATE` devem ser utilizados para preservar os 64k registros e permitir preenchimento retroativo dos novos campos.

3. **Observação 1.3** identifica que faltam exatamente 11 campos em `compras_estoque_cache`:
   - `apresentacao`
   - `preco_venda_vigente`
   - `preco_normal`
   - `preco_promocional`
   - `inicio_promocao`
   - `termino_promocao`
   - `preco_unitario_ult_compra`
   - `ultima_compra_fornecedor`
   - `ultima_compra_data`
   - `ultima_compra_nf`
   - `qtd_sugerida_compra`
   - **Inferência**: Adicionando essas 11 colunas, a tabela satisfaz 100% dos requisitos de dados exigidos por R1 em `ORIGINAL_REQUEST.md`.

4. **Observação 1.2 (Benchmark)** demonstra que as queries em `compras_estoque_cache` utilizando os índices existentes (`idx_cec_ean`, `idx_cec_descricao`, `idx_cec_curva`, `idx_cec_status` e `PRIMARY KEY` em `produto_id`) levam entre 0.06ms e 2.29ms.
   - **Inferência**: A infraestrutura de indexação atual já cumpre o critério de aceitação de performance (< 10ms) para buscas por ID, EAN, termos textuais LIKE e filtros por status e curva.

5. **Observação 1.4** demonstra que as fontes de dados para todos os 11 novos campos já estão devidamente mapeadas no Firebird e em serviços existentes:
   - Os dados de preços normais e promocionais (`PROD_PRVENDA`, `PROD_PRPROMOCAO`, `INICIO_PROMOCAO`, `TERMINO_PROMOCAO`) já são consultados no Firebird em `stock.service.js` e `digifarma-sync.service.js`.
   - Os dados de última compra (`preco_unitario_ult_compra`, `ultima_compra_fornecedor`, `ultima_compra_data`, `ultima_compra_nf`) já são consultados no Firebird em `compras-mineracao.service.js` e já estão parcialmente cacheados na tabela `digifarma_ultimas_compras_cache` (30.987 registros existentes).
   - **Inferência**: A rotina de sincronização de `compras_estoque_cache` pode integrar essas queries de forma direta, populando tanto os dados de catálogo e giro quanto os dados de preço vigente e última nota fiscal.

6. **Observação 1.3 e Testes Automatizados** revelam que o serviço `compras-estoque.service.js` anteriormente calculava o estoque mínimo considerando 15 dias de cobertura (`demanda15d = vmdPonderado * 15`).
   - **Inferência**: Para atender rigorosamente a especificação de 2026-09-04:
     - `est_minimo_calculado` deve ser calculado para 30 dias: `Math.ceil(vmdPonderado * 30 * (1 + margem/100))`.
     - `est_maximo_calculado` deve ser rigorosamente `est_minimo_calculado * 2`.
     - `qtd_sugerida_compra` deve ser `Math.max(0, est_minimo_calculado - saldo)`.

---

## 3. Caveats

1. **População inicial de dados históricos**: Como o banco SQLite local contém 64.537 produtos mas nem todos tiveram nota fiscal recente no Firebird, produtos que nunca tiveram NF de entrada devem receber como fallback os valores de `PRODUTOS.VALOR_ULT_COMPRA` ou `PRODUTOS.PROD_PRCOMPRA`, com metadados `ultima_compra_fornecedor = 'Cadastro Geral Digifarma'`, `ultima_compra_nf = 'Sem NF Entrada'` e `ultima_compra_data = NULL`, exatamente como já implementado em `compras-mineracao.service.js`.
2. **Resolução de Datas Promocionais**: O Firebird pode retornar datas como objetos `Date` ou strings dependendo da versão do driver `node-firebird`. O código de resolução de `preco_venda_vigente` deve tratar ambos os formatos de forma resiliente.
3. **Escopo Read-Only**: Sendo uma exploração investigativa, nenhum código de produção foi alterado neste ciclo; os scripts executados foram limitados a leituras e testes de benchmark isolados dentro de `.agents/explorer_survey_1/`.

---

## 4. Conclusion

1. **Estado do SQLite**:
   - Banco ativo: `data/belafarma.db`.
   - Gerenciador de schema: `backend/database.js` (função `createTables()`).
   - Tabela `compras_estoque_cache`: Existe, operacional com 64.537 registros e índices rápidos.
2. **Lacunas Identificadas no Esquema**:
   - Faltam 11 colunas na tabela `compras_estoque_cache` para conformidade com R1:
     `apresentacao`, `preco_venda_vigente`, `preco_normal`, `preco_promocional`, `inicio_promocao`, `termino_promocao`, `preco_unitario_ult_compra`, `ultima_compra_fornecedor`, `ultima_compra_data`, `ultima_compra_nf`, `qtd_sugerida_compra`.
   - Índices requeridos (`ean`, `descricao`, `curva_abc`, `status_ruptura`) já existem e funcionam em < 2.5ms.
3. **DDL de Migração Recomendado para `backend/database.js`**:
   ```javascript
   // Migrações R1 - Motor de Busca e Inteligência de Medicamentos
   try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN apresentacao TEXT'); } catch(e) {}
   try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN preco_venda_vigente REAL DEFAULT 0'); } catch(e) {}
   try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN preco_normal REAL DEFAULT 0'); } catch(e) {}
   try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN preco_promocional REAL DEFAULT 0'); } catch(e) {}
   try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN inicio_promocao TEXT'); } catch(e) {}
   try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN termino_promocao TEXT'); } catch(e) {}
   try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN preco_unitario_ult_compra REAL DEFAULT 0'); } catch(e) {}
   try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN ultima_compra_fornecedor TEXT'); } catch(e) {}
   try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN ultima_compra_data TEXT'); } catch(e) {}
   try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN ultima_compra_nf TEXT'); } catch(e) {}
   try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN qtd_sugerida_compra REAL DEFAULT 0'); } catch(e) {}
   ```
4. **Alinhamento de Regras de Negócio**:
   - Atualizar a fórmula de `est_minimo_calculado` para 30 dias de giro sem ruptura (`Math.ceil(VMD_P * 30 * (1 + margem/100))`).
   - Fixar `est_maximo_calculado = est_minimo_calculado * 2`.
   - Preencher `qtd_sugerida_compra = Math.max(0, est_minimo_calculado - saldo)`.
   - Resolver `preco_venda_vigente` comparando a data atual com `inicio_promocao` e `termino_promocao`.

---

## 5. Verification Method

Para verificar de forma independente todas as conclusões deste relatório:

1. **Verificação de Colunas no SQLite**:
   ```bash
   node -e "const db = require('./backend/database.js'); console.log(db.prepare(\"PRAGMA table_info('compras_estoque_cache')\").all().map(c => c.name));"
   ```
2. **Verificação de Índices e Performance**:
   Execute o script de benchmark disponibilizado em:
   ```bash
   node .agents/explorer_survey_1/benchmark_queries.cjs
   ```
   Deve confirmar que todas as buscas (`produto_id`, `ean`, `descricao`, `status_ruptura`, `curva_abc`) retornam em `< 2.5ms`.
3. **Verificação de Queries Firebird**:
   Inspeção nos arquivos:
   - `backend/services/stock.service.js` (linhas 215-221) para query de preços normais e promocionais vigentes no Firebird.
   - `backend/services/compras-mineracao.service.js` (linhas 2750-2775) para query de notas fiscais de entrada (`CAB_NOTAS`, `ITEM_NOTAS`, `FORNECEDORES`).
4. **Condições de Invalidação**:
   - Este relatório seria invalidado se o banco de produção não utilizasse SQLite em modo WAL ou se a tabela `compras_estoque_cache` tivesse uma chave primária diferente de `produto_id`. Ambas as hipóteses foram verificadas e descartadas.
