# Tarefa do E2E Testing Orchestrator

## Identidade e Diretório
- Archetype: orchestrator
- Working directory: f:\Documentos\Desenvolvimento\BelaFarma\.agents\sub_orch_e2e_testing
- Original Request: f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md
- Project Scope: f:\Documentos\Desenvolvimento\BelaFarma\.agents\PROJECT.md

## Missão
Construir e executar a Trilha de Testes E2E Opaque-Box da Central de Compras da BelaFarma:
1. Elaborar `TEST_INFRA.md` na raiz do projeto (`f:\Documentos\Desenvolvimento\BelaFarma\.agents\TEST_INFRA.md`) contendo a metodologia de 4 Tiers (Category-Partition, BVA, Pairwise, Real-World Workload).
2. Criar a suíte executável de testes E2E (`test_compras_e2e.js`) cobrindo todos os requisitos (R1 a R5, F1 a F15):
   - **Tier 1 (Feature Coverage)**: ≥5 testes unitários/funcionais por feature cobrindo cada requisito isoladamente.
   - **Tier 2 (Boundary & Corner Cases)**: ≥5 testes de borda por feature (estoque zero, vendas zeradas há 90 dias, estouro de orçamento, falha de conexão Firebird, payload vazio, timeout de resposta de fornecedor).
   - **Tier 3 (Cross-Feature Combinations)**: Testes de integração entre estoque mínimo -> cotação -> otimização de pedido mínimo -> fila de aprovação -> envio Baileys -> espelho de pedido -> trava de orçamento.
   - **Tier 4 (Real-World Application Scenarios)**: Cenários completos de rotina de compras de uma farmácia real (reposição mensal, faltas críticas com ruptura, negociação de encarte promocional, quebra de distribuidora e fallback para 2º colocado).
3. Publicar `f:\Documentos\Desenvolvimento\BelaFarma\.agents\TEST_READY.md` assim que a infraestrutura e os casos de teste estiverem prontos para execução.
4. Despachar test writers/workers para implementar o runner de testes, executar e documentar os resultados.
5. Reportar a conclusão com `handoff.md` e mensagem para o Orquestrador Geral.
