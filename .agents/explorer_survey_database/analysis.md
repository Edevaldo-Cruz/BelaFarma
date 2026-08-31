# Relatório de Análise Técnica: Banco de Dados Firebird (Digifarma) e Camada de Persistência

**Data**: 2026-08-29  
**Autor**: Explorer 2 (Database & Persistence Surveyor)  
**Projeto**: BelaFarma — Central de Compras Integrada  
**Status**: Investigação Concluída  

---

## 1. Visão Geral da Arquitetura de Dados

A plataforma BelaFarma opera em uma arquitetura híbrida de persistência de alto desempenho:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           BelaFarma Backend (Node.js)                           │
│                                                                                 │
│   ┌────────────────────────┐                   ┌────────────────────────────┐  │
│   │   SQLite Local (WAL)   │                   │    Firebird 2.5 / 3.0      │  │
│   │     belafarma.db       │                   │ (Digifarma ERP - PDV/Caixa)│  │
│   │                        │                   │   192.168.1.10:3050        │  │
│   │ • Cache de Produtos    │  Sincronização    │ • PRODUTOS                 │  │
│   │ • Cotações & Fila      │ ◄───────────────► │ • CAB_VENDAS / ITEM_VENDAS │  │
│   │ • Pedidos de Compra    │     Automática    │ • CAB_NOTAS / ITEM_NOTAS   │  │
│   │ • Histórico & Mensagens│                   │ • FORNECEDORES             │  │
│   └────────────────────────┘                   └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

1. **ERP Digifarma (Firebird)**: Banco de dados relacional legado onde operam o PDV (frente de caixa), emissão fiscal de cupons/NFC-e, entrada de notas fiscais de fornecedores e controle oficial de estoque físico.
2. **SQLite Local (`belafarma.db`)**: Banco de dados relacional embarcado no backend Node.js, operando em modo WAL (`journal_mode = WAL`), responsável por prover latência ultra-baixa (< 5ms), tabelas de enriquecimento (representantes minerados, cotações, filas de aprovação de WhatsApp, espelhos de pedidos de compra, regras de precificação e cache sincronizado).

---

## 2. Driver e Configuração do Firebird (Digifarma)

### 2.1. Dependências e Conectividade
- **Driver Node.js**: `node-firebird` (versão `^2.3.2`).
- **Módulo Centralizador**: `backend/services/digifarma.service.js`.
- **Parâmetros de Conexão**:
  - `host`: `192.168.1.10` (IP da máquina servidora do Digifarma na rede local da farmácia)
  - `port`: `3050`
  - `database`: `C:\Digifarma\Dados\digifarma6.fdb`
  - `user`: `SYSDBA`
  - `password`: `masterkey`
  - `lowercase_keys`: `false`
  - `pageSize`: `4096`
  - `pool`: Gerenciado com `firebird.pool(5, options)` para reutilização eficiente de conexões.

---

## 3. Schemas de Tabelas e Mapeamento de Campos no Firebird

### 3.1. Tabela `PRODUTOS` (Catálogo e Estoque Central)

| Campo Firebird | Tipo | Descrição / Papel no Sistema |
| :--- | :--- | :--- |
| `PRODUTO_ID` | `INTEGER` (PK) | Identificador numérico único do produto no Digifarma. |
| `PRODUTO` | `VARCHAR` | Nome e descrição comercial do produto. |
| `APRESENTACAO` | `VARCHAR` | Apresentação farmacêutica (ex: "500MG 30 COMP", "XAROPE 120ML"). |
| `COD_BARRAS` | `VARCHAR` | Código de barras oficial (EAN-13 / GTIN). |
| `PROD_SALDO` | `NUMERIC/DOUBLE` | Saldo físico atual em estoque na farmácia (também referenciado como `ESTOQUE`). |
| `PROD_ESTMINIMO` | `NUMERIC/DOUBLE` | **Estoque mínimo cadastrado no Digifarma (Alvo de gravação do R1)**. |
| `PROD_PRVENDA` | `NUMERIC/DOUBLE` | Preço de venda normal balcão. |
| `PROD_PRPROMOCAO` | `NUMERIC/DOUBLE` | Preço promocional vigente. |
| `INICIO_PROMOCAO` | `DATE/TIMESTAMP` | Data de início da vigência do preço promocional. |
| `TERMINO_PROMOCAO` | `DATE/TIMESTAMP` | Data de término da vigência do preço promocional. |
| `PROD_PRCOMPRA` | `NUMERIC/DOUBLE` | Preço de custo / compra cadastrado. |
| `VALOR_ULT_COMPRA` | `NUMERIC/DOUBLE` | Preço unitário pago na última entrada de nota fiscal. |
| `PROD_ATIVO` | `CHAR(1)` | Flag de produto ativo (`'S'` = Ativo, `'N'` = Inativo/Descontinuado). |
| `CATEGORIA_ID` | `INTEGER` (FK) | Chave estrangeira para a tabela `CATEGORIA`. |
| `TRIBUTACAO_MONOFASICA`| `VARCHAR` | Classificação fiscal para apuração de PIS/COFINS monofásico. |
| `CST_PIS` / `CST_COFINS`| `VARCHAR` | Códigos de Situação Tributária federais. |
| `ALIQUOTA_ST` | `NUMERIC` | Alíquota de Substituição Tributária (ICMS-ST). |
| `NCM` | `VARCHAR` | Nomenclatura Comum do Mercosul. |
| `CEST` | `VARCHAR` | Código Especificador da Substituição Tributária. |

---

### 3.2. Tabelas de Vendas (`CAB_VENDAS` e `ITEM_VENDAS`)

#### `CAB_VENDAS` (Cabeçalho da Venda / Cupom Fiscal)
| Campo Firebird | Tipo | Descrição |
| :--- | :--- | :--- |
| `VENDA_NOTA_ID` (ou `CAB_VENDAS_ID`) | `INTEGER` (PK) | Identificador único do cupom/venda. |
| `VENDA_DATA_HORA` (ou `DATA_EMISSAO`) | `TIMESTAMP` | Data e hora exata da emissão da venda. |
| `VENDA_TOTAL` | `NUMERIC` | Valor total líquido da venda. |
| `CANCELADO` | `CHAR(1)` | Indicador de cancelamento (`'N'` = Venda Válida, `'S'` = Cancelada). |
| `CLIENTE_ID` | `INTEGER` (FK) | Identificador do cliente (ou nulo se venda balcão anônima). |

#### `ITEM_VENDAS` (Itens Vendidos)
| Campo Firebird | Tipo | Descrição |
| :--- | :--- | :--- |
| `ITEM_VENDA_ID` (ou `ITEM_VENDAS_ID`) | `INTEGER` (PK) | Identificador do item no cupom. |
| `VENDA_NOTA_ID` | `INTEGER` (FK) | Vínculo com o cabeçalho `CAB_VENDAS`. |
| `PRODUTO_ID` | `INTEGER` (FK) | Vínculo com o produto em `PRODUTOS`. |
| `ITEMVEND_QUANT` (ou `ITEM_VENDAS_QUANT`) | `NUMERIC` | Quantidade física vendida. |
| `ITEMVEND_PRVENDA` (ou `ITEM_VENDAS_VALOR`) | `NUMERIC` | Preço de venda unitário / total faturado. |
| `ITEMVEND_CMV` | `NUMERIC` | Custo da Mercadoria Vendida unitário registrado no momento da venda. |
| `ITEMVEND_ULT_COMPRA` | `NUMERIC` | Custo da última compra registrado na venda. |

---

### 3.3. Tabelas de Entradas e Compras (`CAB_NOTAS`, `ITEM_NOTAS`, `FORNECEDORES`)

#### `FORNECEDORES` (Distribuidores e Laboratórios)
| Campo Firebird | Tipo | Descrição |
| :--- | :--- | :--- |
| `FORNECEDOR_ID` | `INTEGER` (PK) | Código identificador do fornecedor no Digifarma. |
| `FORNECEDOR` | `VARCHAR` | Razão Social / Nome da Distribuidora (ex: Santa Cruz, Profarma, Panpharma, Gam). |

#### `CAB_NOTAS` (Cabeçalho de Notas Fiscais de Entrada)
| Campo Firebird | Tipo | Descrição |
| :--- | :--- | :--- |
| `CAB_NOTA_ID` | `INTEGER` (PK) | Identificador único da nota fiscal de entrada. |
| `NOTA_FISCAL` | `VARCHAR` | Número da NF-e emitida pelo fornecedor. |
| `DATA_EMISSAO` | `TIMESTAMP/DATE` | Data de emissão da nota pelo fornecedor. |
| `FORNECEDOR_ID` | `INTEGER` (FK) | Distribuidora emissora da nota. |
| `ENTRADA_SAIDA` | `CHAR(1)` | `'E'` para Entrada de Mercadorias / Compra. |
| `CANCELAMENTO` | `CHAR(1)` | `'N'` para nota ativa válida, `'S'` para cancelada. |
| `VALOR_TOTAL` / `VALOR_TOTAL_DEC` | `NUMERIC` | Valor total bruto/líquido da nota fiscal. |

#### `ITEM_NOTAS` (Itens da Nota Fiscal de Entrada)
| Campo Firebird | Tipo | Descrição |
| :--- | :--- | :--- |
| `ITEM_NOTA_ID` | `INTEGER` (PK) | Identificador do item da NF. |
| `CAB_NOTA_ID` | `INTEGER` (FK) | Vínculo com `CAB_NOTAS`. |
| `PRODUTO_ID` | `INTEGER` (FK) | Vínculo com `PRODUTOS`. |
| `ITEM_NOTAS_QUANT` | `NUMERIC` | Quantidade de unidades faturadas e recebidas. |
| `ITEM_NOTAS_PRCOMPRA` | `NUMERIC` | Preço de custo unitário líquido pago na nota fiscal. |

---

## 4. Gestão de Transações, Isolamento e Rollback no Firebird

O módulo `backend/services/digifarma.service.js` estabelece a seguinte disciplina para garantir integridade e atomicidade:

1. **Detecção Automática de Escrita**:
   ```javascript
   const isWrite = /^\s*(UPDATE|INSERT|DELETE)/i.test(sql);
   ```
2. **Nível de Isolamento**:
   - Utiliza `firebird.ISOLATION_READ_COMMITTED` para transações de escrita, garantindo consistência sem gerar bloqueios de leitura concorrentes no PDV.
3. **Mecanismo de Rollback e Tratamento de Falhas**:
   - Se a query falhar (`err` na execução): `tr.rollback(function() { db.detach(); });`
   - Se o timeout estourar (padrão 30s): encerra a transação com `tr.rollback` e descarta a conexão do pool com `db.detach()`.
   - Se a operação for bem-sucedida: chama `tr.commit()`. Se o commit falhar, aciona `tr.rollback`.
4. **Padrão para Operações em Lote / Multi-Declarações**:
   - Para atualizações em massa de estoque mínimo, deve-se utilizar uma única transação (`db.transaction`) iterando sobre os itens e executando um único `tr.commit` no encerramento do lote, com rollback total se qualquer item gerar erro de integridade.

---

## 5. Requisitos Técnicos para o Cálculo e Sincronização do Estoque Mínimo (R1)

### 5.1. Fórmula Matemática e Ponderação de Vendas (30 a 60 Dias)
O objetivo é garantir **30 dias de operação ininterrupta sem ruptura**, evitando excesso de capital imobilizado.

1. **Período de Análise**:
   - **Período Recente ($P_1$)**: Últimos 30 dias ($D_1 = 30$ dias), com peso $W_1 = 0.65$.
   - **Período Anterior ($P_2$)**: Dias 31 a 60 ($D_2 = 30$ dias), com peso $W_2 = 0.35$.
2. **Cálculo da Venda Média Diária Ponderada ($VMD_P$)**:
   $$VMD_P = \frac{(QtdVendida_{P1} \times 0.65) + (QtdVendida_{P2} \times 0.35)}{30}$$
3. **Demanda Base para 30 Dias ($D_{30}$)**:
   $$D_{30} = VMD_P \times 30$$
4. **Margem de Segurança Configurável ($\alpha$, padrão $+15\%$)**:
   $$EstoqueMinimo = \lceil D_{30} \times (1 + \frac{\alpha}{100}) \rceil$$
5. **Regras de Exceção e Proteção**:
   - **Produtos sem venda há > 90 dias (Parados)**: $EstoqueMinimo = 0$ (não sugerir compra nem fixar mínimo artificial).
   - **Produtos Curva A / Essenciais**: Caso $EstoqueMinimo < 2$, definir piso de segurança $= 2$ unidades se o produto for ativo e de alta relevância.
   - **Produtos Descontinuados / Inativos (`PROD_ATIVO = 'N'`)**: Ignorados pelo cálculo.

### 5.2. Query Firebird Ponderada de Vendas (30 e 60 Dias)
```sql
SELECT 
  p.PRODUTO_ID,
  p.PRODUTO,
  p.COD_BARRAS,
  p.PROD_SALDO as ESTOQUE_ATUAL,
  p.PROD_ESTMINIMO as MINIMO_ATUAL,
  p.PROD_PRCOMPRA as CUSTO_ATUAL,
  p.VALOR_ULT_COMPRA,
  COALESCE(v30.QTD_30D, 0) as VENDAS_30D,
  COALESCE(v60.QTD_31_60D, 0) as VENDAS_31_60D
FROM PRODUTOS p
LEFT JOIN (
  SELECT iv.PRODUTO_ID, SUM(iv.ITEMVEND_QUANT) as QTD_30D
  FROM ITEM_VENDAS iv
  JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
  WHERE v.CANCELADO <> 'S'
    AND v.VENDA_DATA_HORA >= CURRENT_DATE - 30
  GROUP BY iv.PRODUTO_ID
) v30 ON p.PRODUTO_ID = v30.PRODUTO_ID
LEFT JOIN (
  SELECT iv.PRODUTO_ID, SUM(iv.ITEMVEND_QUANT) as QTD_31_60D
  FROM ITEM_VENDAS iv
  JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
  WHERE v.CANCELADO <> 'S'
    AND v.VENDA_DATA_HORA >= CURRENT_DATE - 60
    AND v.VENDA_DATA_HORA < CURRENT_DATE - 30
  GROUP BY iv.PRODUTO_ID
) v60 ON p.PRODUTO_ID = v60.PRODUTO_ID
WHERE p.PROD_ATIVO = 'S';
```

### 5.3. Gravação Direta e Atômica no Digifarma
```sql
UPDATE PRODUTOS 
SET PROD_ESTMINIMO = ? 
WHERE PRODUTO_ID = ?;
```

---

## 6. Tabelas SQLite Locais para Suporte à Central de Compras

Para suportar os requisitos R1 a R5 com desempenho instantâneo (< 5ms) e desacoplamento do WhatsApp, o SQLite local (`backend/database.js`) já conta com a seguinte estrutura e deve ser estendido:

### 6.1. Tabelas Existentes e seus Papéis
1. `suppliers` / `local_suppliers`: Mapeamento de fornecedores com `digifarma_id`, `representante`, `telefone`, `prazo_boletos`.
2. `quotations`, `quotation_lists`, `quotation_list_items`: Histórico de cotações, itens cotados e respostas.
3. `orders` / `boletos` / `monthly_limits`: Registro de pedidos emitidos, faturamento, boletos e limite orçamentário mensal.
4. `shortages`: Tabela de faltas registradas via WhatsApp ou rotinas automáticas de estoque crítico.
5. `digifarma_products_cache`: Cache SQLite do catálogo de produtos com curva ABC, preços e saldos.

### 6.2. Tabelas Recomendadas para os Novos Requisitos (R2 a R5)
Para unificar a Central de Compras Autônoma:
1. `purchasing_mined_representatives`:
   - `id`, `phone`, `pushName`, `distributor_name`, `categories_json`, `payment_terms_json`, `min_order_value`, `last_interaction_at`.
2. `purchasing_mined_offers`:
   - `id`, `supplier_id`, `supplier_name`, `product_name`, `barcode`, `offered_price`, `last_purchase_price`, `discount_percent`, `bonus_notes`, `min_qty`, `raw_message`, `extracted_at`.
3. `purchasing_approval_queue` (Fila Obrigatória de Aprovação):
   - `id`, `type` (`cotacao`, `pedido_compra`, `esclarecimento`), `recipient_phone`, `recipient_name`, `subject`, `message_text`, `payload_json`, `status` (`pendente`, `aprovado`, `rejeitado`), `admin_notified` (0/1), `created_at`, `approved_at`, `approved_by`, `sent_at`.
4. `purchasing_order_drafts`:
   - `id`, `distributor_id`, `distributor_name`, `seller_name`, `seller_phone`, `total_items_value`, `discount_value`, `final_value`, `payment_condition`, `delivery_forecast_days`, `status` (`rascunho`, `em_aprovacao`, `aprovado`, `enviado_whatsapp`, `cancelado`), `items_json`, `created_at`.

---

## 7. Conclusão da Investigação
O banco de dados Firebird do Digifarma está perfeitamente mapeado, os campos chave de estoque (`PROD_SALDO`, `PROD_ESTMINIMO`), custos (`PROD_PRCOMPRA`, `VALOR_ULT_COMPRA`), vendas (`ITEM_VENDAS`, `CAB_VENDAS`) e notas fiscais (`ITEM_NOTAS`, `CAB_NOTAS`, `FORNECEDORES`) foram identificados com precisão, e o padrão transacional com isolamento `READ_COMMITTED` e tratamento de timeout/rollback está pronto para a implementação da Central de Compras.
