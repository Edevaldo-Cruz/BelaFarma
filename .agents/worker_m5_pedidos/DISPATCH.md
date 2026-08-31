# Tarefa: Worker M5 - Elaboração de Pedidos de Compra & Controle Orçamentário

## Identidade e Diretório
- Archetype: teamwork_preview_worker
- Working directory: f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m5_pedidos
- Original Request: f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md
- Project Scope: f:\Documentos\Desenvolvimento\BelaFarma\.agents\PROJECT.md

## MANDATORY INTEGRITY WARNING
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Missão
Implementar o serviço de elaboração de pedidos de compra e controle financeiro orçamentário em `backend/services/compras-pedidos.service.js`:
1. **Requisitos de M5 (R5 / F13, F14)**:
   - Elaboração de espelhos formais de Pedidos de Compra organizados por distribuidora vencedora, contendo:
     * Código interno do produto no Digifarma, Código de Barras (EAN), Descrição completa;
     * Quantidade sugerida / aprovada;
     * Preço unitário acordado e bonificações aplicadas (ex: 10+2, desconto percentual);
     * Valor total do pedido;
     * Condição de pagamento negociada (ex: 28/35/42 dias) e previsão de entrega.
   - **Integração com Orçamento Mensal**:
     * Consulta ao teto orçamentário mensal da farmácia na tabela `monthly_limits` (ou tabela de orçamento);
     * Cálculo de comprometimento do orçamento atual vs. projeção dos novos pedidos;
     * Alerta e trava se o pedido ultrapassar o limite disponível para compras do mês.
   - **Integração com Fluxo de Contas a Pagar (Boletos)**:
     * Projeção automática das datas de vencimento dos boletos a partir da condição de pagamento (ex: 28/35/42 dias a contar da emissão/entrega);
     * Integração/vinculação com a tabela `boletos` de Contas a Pagar.
2. **Propriedade de Arquivos**:
   - `backend/services/compras-pedidos.service.js`
   - Tabelas SQLite em `backend/database.js` (`compras_pedidos`, `compras_pedidos_itens`)
3. **Verificação**:
   - Criar suíte de testes automatizados `backend/test_compras_m5.js` cobrindo espelho de pedidos, validação orçamentária, parcelamento de boletos e cenários de estouro de limite.
   - Executar os testes e gravar relatório em `handoff.md`.
