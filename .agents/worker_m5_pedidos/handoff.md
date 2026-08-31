# Relatório de Handoff — Worker M5: Elaboração de Pedidos de Compra e Controle Orçamentário

**Data/Hora:** 2026-08-29T14:28:30-03:00  
**Agente:** Worker M5 (`worker_m5_pedidos`)  
**Parent Agent:** `78620ac3-2868-4b6e-896d-c2c6e6f842ea`  
**Milestone:** M5 (Pedidos de Compra & Controle Orçamentário — R5 / F13, F14)

---

## 1. Observation

- **Requisitos de M5 (R5 / F13, F14)**:
  - F13: Elaboração de espelhos formais de pedidos de compra organizados por distribuidora vencedora, contendo código do produto no Digifarma, código de barras (EAN), descrição, quantidade, preço unitário, bonificações aplicadas, condição de pagamento, previsão de entrega e valor total formatado para cópia/WhatsApp.
  - F14: Controle orçamentário mensal integrado à tabela `monthly_limits`, cálculo de comprometimento e saldo disponível, trava estrita contra estouro orçamentário e projeção de vencimento de boletos parcelados (ex: 28/35/42 dias) integrados à tabela `boletos` de Contas a Pagar.
- **Arquivos Modificados / Criados**:
  - `backend/database.js`: Adicionada tabela `compras_pedidos_itens`, índices (`idx_cpi_pedido`, `idx_cpi_ean`, `idx_cpi_codigo`), índices de suporte em `compras_pedidos` e migrações seguras de colunas complementares (`mes_referencia`, `ano_referencia`, `boletos_json`, `texto_formatado`, `motivo_cancelamento`).
  - `backend/services/compras-pedidos.service.js`: Criado o serviço central implementando:
    * `gerarEspelhoPedidoCompra(dados)` e `gerarEspelhoPedido(distribuidoraId, cotacaoVencedoraId, options)`
    * `validarOrcamento(tetoMensal, totalJaComprometido, valorNovoPedido, prazosDias)` e `validarTetoOrcamentario(valorTotalPedido, mesReferencia, anoReferencia, options)`
    * `obterResumoOrcamentoMensal(mes, ano)` e `definirLimiteMensal(mes, ano, limite)`
    * `projetarVencimentosBoletos(valorTotal, condicaoPagamentoOuPrazos, dataBase)` e `vincularBoletosContasAPagar(pedidoId, parcelas)`
    * CRUD e Workflow: `criarPedidoCompra`, `listarPedidos`, `obterPedidoPorId`, `atualizarStatusPedido`, `cancelarPedido`, `exportarEspelhoTexto`.
  - `backend/test_compras_m5.js`: Criada suíte completa com 32 testes automatizados cobrindo todos os cenários e corner cases de M5.
- **Resultados de Execução**:
  - `node backend/test_compras_m5.js`: **32/32 testes aprovados (100% PASS)**
  - `node test_compras_e2e.js`: **160/160 testes aprovados (100% PASS)** nos 4 Tiers
  - `node backend/test_compras_estoque.js; node backend/test_compras_m2.js; node backend/test_compras_m3.js; node backend/test_compras_m4.js; node backend/test_compras_m5.js`: **100% PASS em todos os módulos**

---

## 2. Logic Chain

1. **Geração de Espelhos Formais de Pedido**:
   - Os dados do pedido ou da cotação vencedora são validados para garantir que não existam pedidos vazios.
   - Cada item calcula seu subtotal com precisão contábil monetária de duas casas decimais (`Number((qtd * preco).toFixed(2))`), preservando código interno do Digifarma, EAN e bonificações negociadas (ex: "10+2", "5% desc").
   - O texto formatado é construído seguindo padrão Markdown legível para WhatsApp com cabeçalho, detalhamento por linha e rodapé com valor total.
2. **Controle Orçamentário e Travas**:
   - A função `validarTetoOrcamentario` consulta o limite cadastrado na tabela `monthly_limits` para o mês/ano de referência.
   - Soma o montante já comprometido em pedidos ativos (`compras_pedidos`) e pedidos legados (`orders`).
   - Se o valor do novo pedido ultrapassar o saldo disponível, dispara erro `ORCAMENTO_EXCEDIDO` com detalhes precisos da diferença, bloqueando a operação quando a trava estrita estiver ativa.
3. **Projeção e Vinculação Financeira de Boletos**:
   - O parser `extrairPrazosDias` suporta strings comerciais variadas (ex: `"28/35/42 dias"`, `"30 dias"`, `"À vista"`, arrays de inteiros).
   - `projetarVencimentosBoletos` projeta as datas de vencimento exatas no formato ISO (`YYYY-MM-DD`) e divide o valor total entre as parcelas, realizando a compensação exata de centavos na última parcela.
   - `vincularBoletosContasAPagar` persiste os boletos na tabela `boletos` do Contas a Pagar vinculados ao `order_id`, atualizando a flag `integrado_contas_pagar = 1` no pedido.
4. **Cancelamento e Integridade**:
   - O cancelamento de um pedido de compras atualiza seu status para `Cancelado` e cancela automaticamente os boletos pendentes vinculados na tabela `boletos`.

---

## 3. Caveats

- A tabela `boletos` é mantida compatível com o schema principal do sistema BelaFarma (`id`, `supplierName`, `order_id`, `due_date`, `value`, `status`).
- Quando não houver teto cadastrado em `monthly_limits` para um mês específico, a função valida com tolerância padrão ou permite configuração manual via `definirLimiteMensal`.

---

## 4. Conclusion

O Milestone M5 está **100% implementado, testado e validado**. O serviço `backend/services/compras-pedidos.service.js` cumpre integralmente os contratos de interface do `PROJECT.md` § 5, suporta todas as regras de negócio de F13 e F14, e foi aprovado com 100% de sucesso em testes unitários, testes de integração e na suíte E2E opaque-box.

---

## 5. Verification Method

Comandos para verificação independente:

```bash
# 1. Executar suíte específica do Worker M5
node backend/test_compras_m5.js

# 2. Executar suíte E2E completa da Central de Compras (Tiers 1 a 4)
node test_compras_e2e.js

# 3. Executar todos os testes da Central de Compras em conjunto
node backend/test_compras_estoque.js; node backend/test_compras_m2.js; node backend/test_compras_m3.js; node backend/test_compras_m4.js; node backend/test_compras_m5.js
```
