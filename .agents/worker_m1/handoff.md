# Relatório de Handoff — Milestone M1: Schema e Modelo Consolidado SQLite

## 1. Observation

- **Arquivo Modificado**: `backend/database.js` (linhas 1831 a 1910).
- **Modificações Aplicadas**:
  1. No comando `CREATE TABLE IF NOT EXISTS compras_estoque_cache`:
     Foram inseridas as 11 novas colunas para garantir que novas instâncias do banco de dados já inicializem com o schema completo:
     - `apresentacao TEXT`
     - `preco_unitario_ult_compra REAL DEFAULT 0`
     - `ultima_compra_fornecedor TEXT`
     - `ultima_compra_data TEXT`
     - `ultima_compra_nf TEXT`
     - `preco_venda_vigente REAL DEFAULT 0`
     - `preco_normal REAL DEFAULT 0`
     - `preco_promocional REAL DEFAULT 0`
     - `inicio_promocao TEXT`
     - `termino_promocao TEXT`
     - `qtd_sugerida_compra REAL DEFAULT 0`
  2. Em `createTables()`, logo após a criação da tabela, foram adicionados blocos `try/catch` idempotentes executando `ALTER TABLE compras_estoque_cache ADD COLUMN ...` para cada uma das 11 colunas:
     ```javascript
     // Migrações R1 - Motor de Busca e Inteligência de Medicamentos
     try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN apresentacao TEXT'); } catch (e) {}
     try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN preco_venda_vigente REAL DEFAULT 0'); } catch (e) {}
     try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN preco_normal REAL DEFAULT 0'); } catch (e) {}
     try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN preco_promocional REAL DEFAULT 0'); } catch (e) {}
     try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN inicio_promocao TEXT'); } catch (e) {}
     try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN termino_promocao TEXT'); } catch (e) {}
     try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN preco_unitario_ult_compra REAL DEFAULT 0'); } catch (e) {}
     try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN ultima_compra_fornecedor TEXT'); } catch (e) {}
     try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN ultima_compra_data TEXT'); } catch (e) {}
     try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN ultima_compra_nf TEXT'); } catch (e) {}
     try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN qtd_sugerida_compra REAL DEFAULT 0'); } catch (e) {}
     try { db.exec('UPDATE compras_estoque_cache SET preco_unitario_ult_compra = ultima_compra_valor WHERE (preco_unitario_ult_compra IS NULL OR preco_unitario_ult_compra = 0) AND ultima_compra_valor > 0'); } catch (e) {}
     ```
  3. No bloco de índices de `compras_estoque_cache`, garantiu-se que todos os índices requeridos estejam declarados juntos:
     ```javascript
     try {
       db.exec('CREATE INDEX IF NOT EXISTS idx_cec_status ON compras_estoque_cache(status_ruptura)');
       db.exec('CREATE INDEX IF NOT EXISTS idx_cec_ean ON compras_estoque_cache(ean)');
       db.exec('CREATE INDEX IF NOT EXISTS idx_cec_descricao ON compras_estoque_cache(descricao)');
       db.exec('CREATE INDEX IF NOT EXISTS idx_cec_curva ON compras_estoque_cache(curva_abc)');
       db.exec('CREATE INDEX IF NOT EXISTS idx_cec_ciclo ON compras_estoque_cache(ciclo_vida)');
     } catch(e) {}
     ```
- **Verificação das Colunas via CLI**:
  Comando:
  ```bash
  node -e "const db = require('./backend/database'); console.log(db.pragma('table_info(compras_estoque_cache)').map(c => c.name));"
  ```
  Saída obtida (código de saída 0):
  ```json
  [
    "produto_id",
    "descricao",
    "ean",
    "categoria_id",
    "curva_abc",
    "saldo",
    "est_minimo_calculado",
    "est_minimo_digifarma",
    "vmd_ponderado",
    "vendas_30d",
    "vendas_31_60d",
    "custo_unitario",
    "ultima_compra_valor",
    "status_ruptura",
    "margem_seguranca_aplicada",
    "dias_sem_venda",
    "sincronizado_em",
    "atualizado_em",
    "vendas_61_90d",
    "ciclo_vida",
    "est_maximo_calculado",
    "apresentacao",
    "preco_venda_vigente",
    "preco_normal",
    "preco_promocional",
    "inicio_promocao",
    "termino_promocao",
    "preco_unitario_ult_compra",
    "ultima_compra_fornecedor",
    "ultima_compra_data",
    "ultima_compra_nf",
    "qtd_sugerida_compra"
  ]
  ```
- **Verificação dos Índices via CLI**:
  Comando:
  ```bash
  node -e "const db = require('./backend/database'); console.log(db.pragma('index_list(compras_estoque_cache)'));"
  ```
  Saída obtida:
  - `idx_cec_descricao`
  - `idx_cec_ciclo`
  - `idx_cec_curva`
  - `idx_cec_ean`
  - `idx_cec_status`
  Missing indexes: `[]`.
- **Verificação Transacional de Insert e Select nas novas colunas**:
  Comando executou insert de produto teste com as 11 novas colunas, select confirmou valores (`TESTE M1 MEDICAMENTO 500MG CX 20 COMP 12.5 8.2 40`), e rollback reverteu sem deixar lixo no banco.
- **Verificação de Regressão em Testes Legados**:
  `node backend/test_ultimas_compras_mineracao.js` executou e passou com 24 aprovados e 0 falhas.

---

## 2. Logic Chain

1. **Observação das Instruções do Milestone M1**: O requisito exige a extensão do schema de `compras_estoque_cache` para conter 11 novos campos (`apresentacao`, `preco_venda_vigente`, `preco_normal`, `preco_promocional`, `inicio_promocao`, `termino_promocao`, `preco_unitario_ult_compra`, `ultima_compra_fornecedor`, `ultima_compra_data`, `ultima_compra_nf`, `qtd_sugerida_compra`) e a presença dos 4 índices essenciais (`idx_cec_ean`, `idx_cec_descricao`, `idx_cec_status`, `idx_cec_curva`).
2. **Observação da Arquitetura do SQLite em `backend/database.js`**: `database.js` executa `createTables()` na inicialização com `better-sqlite3`. A base existente em `data/belafarma.db` possui 64.537 registros. Para preservar dados e assegurar idempotência, as colunas devem ser adicionadas com `ALTER TABLE ... ADD COLUMN` encapsuladas em blocos `try/catch`.
3. **Observação dos Testes e Verificações**: Após a adição das instruções DDL e execução do Node, `PRAGMA table_info('compras_estoque_cache')` retornou exatamente 32 colunas no total, contendo 100% das 11 colunas exigidas. `PRAGMA index_list('compras_estoque_cache')` confirmou a presença dos 4 índices essenciais mais o índice de ciclo de vida.
4. **Conclusão Lógica**: O schema da tabela `compras_estoque_cache` no SQLite está plenamente consolidado, retrocompatível e pronto para ser utilizado pelos serviços de inteligência e busca nos milestones subsequentes (M2-M5).

---

## 3. Caveats

- As colunas adicionadas recebem valores padrão (ex: `0`, `NULL`), aguardando a sincronização e os cálculos de giro que serão implementados no Milestone M2 em `backend/services/medicamentos-busca.service.js` e `backend/services/compras-estoque.service.js`.
- O backfill retroativo de `preco_unitario_ult_compra` foi aplicado a partir de `ultima_compra_valor` para manter a integridade dos registros existentes em cache até que a sincronização em lote de notas fiscais seja disparada.

---

## 4. Conclusion

O Milestone M1 foi implementado com sucesso em `backend/database.js`:
- Todas as 11 novas colunas foram adicionadas com DDL idempotente.
- Todos os 4 índices essenciais (`idx_cec_ean`, `idx_cec_descricao`, `idx_cec_status`, `idx_cec_curva`) estão criados e ativos.
- O banco inicializa sem erros e a integridade de dados foi verificada.

---

## 5. Verification Method

Para verificar independentemente a implementação:

1. **Checar lista de colunas no SQLite**:
   ```bash
   node -e "const db = require('./backend/database'); const cols = db.pragma('table_info(compras_estoque_cache)').map(c => c.name); console.log(cols); const req = ['apresentacao','preco_venda_vigente','preco_normal','preco_promocional','inicio_promocao','termino_promocao','preco_unitario_ult_compra','ultima_compra_fornecedor','ultima_compra_data','ultima_compra_nf','qtd_sugerida_compra']; console.log('Faltando:', req.filter(c => !cols.includes(c)));"
   ```
   *Critério de aceitação*: `Faltando: []`.

2. **Checar índices ativos no SQLite**:
   ```bash
   node -e "const db = require('./backend/database'); const idxs = db.pragma('index_list(compras_estoque_cache)').map(i => i.name); console.log(idxs); const req = ['idx_cec_ean','idx_cec_descricao','idx_cec_status','idx_cec_curva']; console.log('Faltando:', req.filter(i => !idxs.includes(i)));"
   ```
   *Critério de aceitação*: `Faltando: []`.

3. **Condições de Invalidação**:
   - Este relatório seria invalidado se o comando `PRAGMA table_info` indicasse a ausência de qualquer uma das 11 colunas ou se a inicialização de `database.js` gerasse exceção não tratada.
