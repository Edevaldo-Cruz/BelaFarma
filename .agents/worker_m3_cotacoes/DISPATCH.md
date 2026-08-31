# Tarefa: Worker M3 - Motor de Cotações Inteligentes, Ranking Ponderado (60/25/15) e Otimização de Pedido Mínimo

## 2026-08-29T17:20:56Z
- **Archetype**: teamwork_preview_worker
- **Roles**: implementer, qa, specialist
- **Working directory**: f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m3_cotacoes
- **Original Request**: f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md
- **Project Scope**: f:\Documentos\Desenvolvimento\BelaFarma\.agents\PROJECT.md
- **Parent ID**: 78620ac3-2868-4b6e-896d-c2c6e6f842ea

## MANDATORY INTEGRITY WARNING
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Missão
Implementar o motor de cotações completo em `backend/services/compras-cotacoes.service.js`:
1. **Requisitos de M3 (R3 / F7, F8, F9, F10)**:
   - Reconhecimento automático de fornecedores que atendem determinado produto faltante ou abaixo do mínimo (cruzando catálogo histórico minerado em M2 e tabela `FORNECEDORES` do Digifarma).
   - Redação de mensagens contextualizadas e profissionais de solicitação de cotação para cada fornecedor (com nome do representante, itens solicitados, EAN, quantidade sugerida e formatação clara para WhatsApp).
   - Motor de Score Ponderado:
     * **Menor Preço Líquido** (com bonificações e descontos adicionais aplicados): peso **60%**;
     * **Prazo de Pagamento** e compatibilidade orçamentária: peso **25%**;
     * **Histórico de Pontualidade e Baixa Taxa de Quebra**: peso **15%**.
   - **Otimização Automática de Pedido Mínimo**: se a cesta dos itens mais baratos de um fornecedor não atingir o valor de faturamento mínimo, o algoritmo deve:
     * Simular preenchimento com outros itens necessários com boa taxa de giro daquele fornecedor;
     * Ou realocar itens para o 2º melhor colocado global, calculando e exibindo a comparação de custo-benefício total.
   - **Gestão de Quebras e Fallback**: se o fornecedor vencedor não responder no prazo limite ou informar falta de estoque, passar a vez automaticamente para o segundo colocado (recalculando score).
2. **Propriedade de Arquivos**:
   - `backend/services/compras-cotacoes.service.js`
   - Tabelas SQLite em `backend/database.js` (`compras_cotacoes`, `compras_cotacoes_respostas`, `compras_cotacoes_itens`)
3. **Verificação**:
   - Criar suíte de testes automatizados `backend/test_compras_m3.js` validando todos os cálculos de score, fórmulas de bonificação, simulação de pedido mínimo e repasse de quebra.
   - Executar os testes e gravar relatório em `handoff.md`.
