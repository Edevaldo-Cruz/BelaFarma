# Relatório de Handoff — Worker M3 (Motor de Cotações, Ranking Ponderado & Pedido Mínimo)

## 1. Observation
- **Requisitos analisados**:
  - R3 / F7: Reconhecimento de fornecedores adequados para produtos faltantes e redação contextual de mensagens de cotação para WhatsApp.
  - R3 / F8: Motor de Score Ponderado: 60% Menor Preço Líquido (com bonificações aplicadas), 25% Prazo de Pagamento, 15% Histórico de Pontualidade e Baixa Taxa de Quebra.
  - R3 / F9: Otimização Automática de Pedido Mínimo: simulação de preenchimento inteligente com itens de giro alto do fornecedor ou realocação para o 2º melhor colocado global com cálculo de custo-benefício.
  - R3 / F10: Gestão de quebras com penalização da taxa de quebra histórica (+15% até teto de 100%) e repasse automático da liderança para o próximo colocado elegível.
- **Arquivos modificados / criados**:
  - `backend/database.js`: Tabela `compras_cotacoes_itens` criada com índices e colunas adicionais em `compras_cotacoes_respostas` (`posicao_ranking`, `prazo_dias`, `condicao_pagamento`, `motivo_quebra`, `pedido_minimo_atingido`, `valor_total_cotado`).
  - `backend/services/compras-cotacoes.service.js`: Implementado com 100% dos requisitos de F7, F8, F9, F10 e persistência SQLite.
  - `backend/test_compras_m3.js`: Suíte com 24 testes unitários e de integração validando todos os cenários.
- **Resultados de Testes**:
  - `node backend/test_compras_m3.js` -> 24/24 testes passaram (100% sucesso).
  - `node backend/test_compras_estoque.js` -> 23/23 testes passaram (100% sucesso).
  - `node backend/test_compras_m2.js` -> 16/16 testes passaram (100% sucesso).
  - `node test_compras_e2e.js` -> 160/160 testes passaram nos Tiers 1 a 4 (100% sucesso).

## 2. Logic Chain
1. **Bonificações e Preço Líquido Efetivo**:
   - Desenvolveu-se `calcularPrecoLiquidoComBonificacao` suportando múltiplos formatos de encartes farmacêuticos ("compre 10 ganhe 2", "10+2", "compre 20 leve 25", "15% off", descontos adicionais).
   - O preço unitário líquido resultante é usado como base para todo o cálculo de ranking e comparação contra a última compra do Digifarma.
2. **Motor de Score Ponderado (60/25/15)**:
   - **Preço (60%)**: `scorePreco = (menorPrecoRodada / precoLiquido) * 100` (normalização pelo menor preço de mercado da rodada, teto 100).
   - **Prazo (25%)**: `scorePrazo = min(100, max(10, (prazoDias / 42) * 100))` (escala linear até 42 dias, piso de 10 pts para à vista e teto de 100 pts para prazos >= 42 dias).
   - **Histórico (15%)**: `scoreHistorico = pontualidadeScore * (1 - (taxaQuebraHistorica / 100))` (padrão neutro de 75 pts para novos fornecedores, penalizado diretamente pela taxa de quebra).
   - **Score Total**: `(0.60 * scorePreco) + (0.25 * scorePrazo) + (0.15 * scoreHistorico)` com ordenação decrescente e desempates por Menor Preço e Maior Prazo.
3. **Redação Contextual de Cotações**:
   - `gerarMensagemCotacao` produz mensagens personalizadas por distribuidora e representante, formatando a lista de produtos com descrição, EAN e quantidades em negrito para WhatsApp.
4. **Otimização de Pedido Mínimo**:
   - Analisa o subtotal da cesta de cada fornecedor.
   - Se `>= pedidoMinimo`, estratégia `'Atingido_Direto'`.
   - Se `< pedidoMinimo`, simula preenchimento com itens de giro alto / Curva A/B daquele fornecedor (`'Preenchimento_Giro_Alto'`).
   - Se inviável, calcula o custo-benefício de realocação para o 2º melhor colocado global (`'Realocacao_Segundo_Colocado'`), comparando o custo extra de inflar o pedido vs a diferença de preço do 2º colocado.
5. **Gestão de Quebras & Fallback**:
   - `processarQuebraFornecedor` / `tratarQuebraFornecedor` marca o fornecedor desistente como `'Quebra_Declarada'`, incrementa sua taxa histórica em +15% no banco SQLite e repassa a liderança automaticamente para o próximo colocado elegível, recalculando o ranking da rodada.

## 3. Caveats
- No modo offline (sem conexão ativa com o servidor Firebird Digifarma), o serviço opera transparentemente via cache local SQLite (`compras_estoque_cache` e `compras_fornecedores_meta`).
- Para produtos novos sem fornecedor específico no catálogo histórico minerado, o sistema distribui a solicitação para as principais distribuidoras ativas cadastradas.

## 4. Conclusion
O módulo M3 (Motor de Cotações Inteligentes, Ranking Ponderado, Otimização de Pedido Mínimo e Gestão de Quebras) foi implementado com total fidelidade às especificações de negócio, arquitetura em SQLite WAL e conformidade com as suítes de testes unitários e E2E 4 Tiers.

## 5. Verification Method
Para reproduzir e verificar independentemente a implementação:

1. **Executar a suíte de testes unitários e de integração de M3**:
   ```powershell
   node backend/test_compras_m3.js
   ```
   *Resultado esperado: 24/24 testes aprovados (100% PASS).*

2. **Executar a suíte E2E completa (4 Tiers)**:
   ```powershell
   node test_compras_e2e.js
   ```
   *Resultado esperado: 160/160 testes aprovados (100% PASS).*

3. **Executar as suítes de regressão de M1 e M2**:
   ```powershell
   node backend/test_compras_estoque.js
   node backend/test_compras_m2.js
   ```
   *Resultado esperado: Todos os testes aprovados com zero falhas.*
