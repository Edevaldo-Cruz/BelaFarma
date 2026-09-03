# Plano de Revisão Adversarial - reviewer_1

## 1. Entendimento Independente dos Requisitos
- **R1. Extração Fiel via Notas Fiscais de Entrada (Firebird):**
  - Consulta primária: `CAB_NOTAS` + `ITEM_NOTAS` + `FORNECEDORES` com `C.ENTRADA_SAIDA = 'E'` e `C.CANCELAMENTO = 'N'`, ordenada por `C.DATA_EMISSAO DESC`.
  - Cálculo de preço unitário: se `ITEM_NOTAS_EMBALAGEM > 1`, `preco_unitario = ITEM_NOTAS_PRCOMPRA / ITEM_NOTAS_EMBALAGEM` (ou `ITEM_NOTAS_ULT_COMPRA` se já for unitário fracionado).
  - Metadados: `DATA_EMISSAO`, `NOTA_FISCAL`, `FORNECEDOR`, `ITEM_NOTAS_EMBALAGEM`.
  - Fallback estrito: `PRODUTOS.VALOR_ULT_COMPRA` ou `PRODUTOS.PROD_PRCOMPRA` apenas se nunca houve NF de entrada.
- **R2. Sincronização Híbrida e Cache Local (SQLite):**
  - Tabela de cache indexada (`digifarma_ultimas_compras_cache`): `produto_id`, `ean`, `preco_unitario_ult_compra`, `data_compra`, `fornecedor_nome`, `numero_nota_fiscal`, `embalagem`, `atualizado_em`.
  - Endpoint `POST /api/central-compras/sincronizar-ultimas-compras`.
  - Tempo de busca < 5ms durante mineração / carregamento.
- **R3. Recálculo Automático das Oportunidades Existentes:**
  - Endpoint `POST /api/central-compras/recalcular-ofertas-mineradas`.
  - Atualização dos campos `preco_ult_compra_digifarma`, `ultimo_fornecedor`, `data_ult_compra`, `nota_fiscal_ult_compra`, `percentual_desconto` e `status` (`Aprovado_Radar` vs `Descartado_Preco_Maior`).
- **R4. Interface Visual na Guia Mineração (`ComprasMineracao.tsx`):**
  - Valor unitário destacado: `R$ 3,24/un`.
  - Tooltip/card ao passar mouse ou clicar com data, fornecedor, NF e detalhe da embalagem coletiva / valor total.
  - Botão "Sincronizar Últimas Compras do Digifarma" com feedback visual e toast (sem `alert()`).
- **Critérios de Aceite:**
  - Produto `AP.BARB VICEROY LADY CARE C/2 12UND` (ID 188549) R$ 3,24 (e não R$ 38,88).
  - Desconto correto.
  - `GET /api/central-compras/oportunidades` < 100ms.
  - `npm run build` compila sem erros.
  - Testes cobrindo integridade.
  - Push para `origin/main` ao finalizar.

## 2. Hipóteses Adversariais e Ataques Planejados
1. **Verificação de Regressão e Execução dos Testes Existentes:**
   - Rodar `backend/test_ultimas_compras_mineracao.js` e `backend/test_compras_m2.js`.
   - Rodar `npm run build`.
2. **Auditoria no Cálculo do Preço Unitário e Fracionamento:**
   - O que acontece se `ITEM_NOTAS_PRCOMPRA` já for o valor unitário e `ITEM_NOTAS_ULT_COMPRA` for o total da caixa, ou vice-versa? Como o Firebird do Digifarma realmente armazena esses campos?
   - E se `ITEM_NOTAS_EMBALAGEM` for 0, negativo ou `null`? Ocorre divisão por zero (retornando `Infinity` ou `NaN`)?
   - E se `ITEM_NOTAS_EMBALAGEM = 1`?
   - E se `ITEM_NOTAS_PRCOMPRA` for 0 ou nulo?
3. **Auditoria de Concorrência, Transações e SQLite:**
   - A tabela `digifarma_ultimas_compras_cache` possui chave primária correta? (ex: `produto_id` é PK ou UNIQUE?). Se não for UNIQUE, inserções ou sincronizações duplicadas podem acumular linhas duplicadas?
   - O que acontece ao chamar `POST /api/central-compras/sincronizar-ultimas-compras` repetidamente? O cache cresce indefinidamente ou faz UPSERT?
   - O schema do cache tem todos os campos pedidos no requisito? (`produto_id`, `ean`, `preco_unitario_ult_compra`, `data_compra`, `fornecedor_nome`, `numero_nota_fiscal`, `embalagem`, `atualizado_em`).
4. **Auditoria dos Endpoints e Contratos de API:**
   - Os endpoints `POST /api/central-compras/sincronizar-ultimas-compras` e `POST /api/central-compras/recalcular-ofertas-mineradas` estão devidamente registrados em `backend/compras-endpoints.js`?
   - O `GET /api/central-compras/oportunidades` responde aos novos campos `embalagemUltCompra` e `precoTotalNota`?
   - O frontend consome exatamente essas chaves?
5. **Auditoria do Recálculo de Oportunidades (`recalcularOfertasMineradas`):**
   - O recálculo usa o valor unitário fracionado para calcular `percentual_desconto`?
   - Fórmula: `((preco_ult_compra - preco_ofertado) / preco_ult_compra) * 100`.
   - O que acontece se `preco_ult_compra` for 0? Divisão por zero?
   - E se o status prévio era `Descartado_Preco_Maior`, ele vira `Aprovado_Radar` se a oferta for menor que o unitário? E vice-versa?
6. **Auditoria do Frontend (`ComprasMineracao.tsx`):**
   - Verificar se há chamadas a `alert()`.
   - Verificar acessibilidade e usabilidade do tooltip/popover (clique e hover).
   - Verificar se o botão de sincronização aciona a sincronização E o recálculo, e recarrega os dados.
   - Verificar renderização em telas pequenas / mobile.
7. **Auditoria do SQL do Firebird em `compras-mineracao.service.js`:**
   - Analisar a query SQL do Firebird montada no código.
   - Verificar se a query está correta sintaticamente para Firebird (ex: `FIRST 1`, nomes de colunas, joins, filtros `C.ENTRADA_SAIDA = 'E'` e `C.CANCELAMENTO = 'N'`).
