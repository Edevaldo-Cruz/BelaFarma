# Implementation Plan — Correção Definitiva da Última Compra (Central de Compras)

## 1. Contexto & Problema
- Na Central de Compras (guia Mineração), o preço da "Última Compra" do Digifarma estava sendo coletado incorretamente para produtos comercializados em caixas/embalagens coletivas (ex: produto ID 188549 `AP.BARB VICEROY LADY CARE C/2 12UND` exibindo R$ 38,88 em vez de R$ 3,24/un).
- O motivo principal: o sistema lia `ITEM_NOTAS_PRCOMPRA` diretamente sem fracionar por `ITEM_NOTAS_EMBALAGEM`, e priorizava `VALOR_ULT_COMPRA` da tabela `PRODUTOS` em vez da última nota fiscal de entrada real.
- Falta de cache indexado de alta performance (< 5ms) no SQLite contendo os metadados de nota de entrada (NF, fornecedor, data, embalagem).
- Falta de recálculo automático das ofertas já mineradas e falta de interface rica com tooltip/card de auditoria e botão de sincronização rápida.

## 2. Etapas de Execução

### Etapa 1: Banco de Dados Local SQLite (`backend/database.js`)
- Criar a tabela `digifarma_ultimas_compras_cache` com índices:
  - `produto_id` INTEGER PRIMARY KEY
  - `ean` TEXT
  - `descricao` TEXT
  - `preco_unitario_ult_compra` REAL NOT NULL
  - `preco_total_nota` REAL
  - `quantidade` REAL
  - `embalagem` INTEGER DEFAULT 1
  - `embalagem_detalhe` TEXT
  - `data_compra` TEXT
  - `fornecedor_nome` TEXT
  - `numero_nota_fiscal` TEXT
  - `fonte` TEXT DEFAULT 'NOTA_FISCAL'
  - `atualizado_em` TEXT NOT NULL
- Adicionar colunas `embalagem_ult_compra` e `preco_total_nota` em `compras_oportunidades_mineradas`.
- Inicializar / sincronizar o cache para produtos locais (incluindo o produto 188549 e os itens de `compras_estoque_cache`).

### Etapa 2: Serviço de Mineração & Extração Fiel (`backend/services/compras-mineracao.service.js`)
- Implementar extração fiel R1:
  - Fonte primária: última NF de entrada em `CAB_NOTAS` + `ITEM_NOTAS` + `FORNECEDORES` (`ENTRADA_SAIDA = 'E'` e `CANCELAMENTO = 'N'`).
  - Cálculo de preço unitário: se `ITEM_NOTAS_EMBALAGEM > 1`, `ITEM_NOTAS_PRCOMPRA / ITEM_NOTAS_EMBALAGEM`. Se `ITEM_NOTAS_ULT_COMPRA > 0 && ITEM_NOTAS_ULT_COMPRA < ITEM_NOTAS_PRCOMPRA`, usar o valor fracionado.
  - Metadados completos: `DATA_EMISSAO`, `NOTA_FISCAL`, `FORNECEDOR`, `ITEM_NOTAS_EMBALAGEM`, `embalagemDetalhe`.
  - Fallback estrito: `PRODUTOS.VALOR_ULT_COMPRA` ou `PROD_PRCOMPRA` SOMENTE se o produto nunca teve NF de entrada.
- Implementar cache R2:
  - `buscarUltimaCompraProduto(produtoId, ean, produtoNome, db)` com busca em < 5ms em `digifarma_ultimas_compras_cache`.
  - `sincronizarUltimasComprasDigifarma(db, options)` para sincronização em lote de alta performance e tolerância a Firebird offline.
- Implementar recálculo R3:
  - `recalcularOfertasMineradas(db)`: atualiza `preco_ult_compra_digifarma`, `ultimo_fornecedor`, `data_ult_compra`, `nota_fiscal_ult_compra`, `embalagem_ult_compra`, `percentual_desconto` e `status` (`Aprovado_Radar` vs `Descartado_Preco_Maior`).
- Ajustar `listarOportunidades` para retornar todos os metadados enriquecidos.

### Etapa 3: Endpoints REST (`backend/compras-endpoints.js`)
- `POST /api/central-compras/sincronizar-ultimas-compras`: dispara a sincronização e o recálculo, retornando estatísticas em JSON.
- `POST /api/central-compras/recalcular-ofertas-mineradas`: dispara o recálculo das oportunidades salvas.
- Garantir tempo de resposta de `/api/central-compras/oportunidades` em < 100ms.

### Etapa 4: Frontend (`components/compras/ComprasMineracao.tsx` e `types.ts`)
- Atualizar interface `OportunidadeMinerada` em `types.ts`.
- Adicionar botão de ação rápida "Sincronizar Últimas Compras do Digifarma" no topo, com loading spinner e feedback por toast (sem alert()).
- Na coluna "Última Compra", destacar o valor unitário: `R$ 3,24/un`.
- Tooltip/card interativo (hover e click) exibindo:
  - Data formatada
  - Fornecedor
  - Número da NF
  - Detalhe da embalagem (ex: `Embalagem: Caixa c/ 12 unidades (R$ 38,88 total)`)
- Exibir metadados também no modal de detalhes da oferta.

### Etapa 5: Testes Automatizados & Validação
- Criar `backend/test_ultimas_compras_mineracao.js` cobrindo todos os critérios de aceite.
- Executar `npm run build` do frontend.
- Executar suíte de testes.
