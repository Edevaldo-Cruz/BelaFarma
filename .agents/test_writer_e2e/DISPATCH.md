# Tarefa: Test Writer E2E Track (Central de Compras)

## Identidade e Diretório
- Archetype: teamwork_preview_test_writer
- Working directory: f:\Documentos\Desenvolvimento\BelaFarma\.agents\test_writer_e2e
- Original Request: f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md
- Project Scope: f:\Documentos\Desenvolvimento\BelaFarma\.agents\PROJECT.md

## Missão
Construir a infraestrutura completa de testes E2E Opaque-Box para a Central de Compras da BelaFarma:
1. Ler atentamente `ORIGINAL_REQUEST.md` e `PROJECT.md`.
2. Criar o documento metodológico `f:\Documentos\Desenvolvimento\BelaFarma\.agents\TEST_INFRA.md` cobrindo os 4 Tiers de teste:
   - Tier 1: Cobertura de Features (≥5 casos por feature F1-F15)
   - Tier 2: Casos de Borda e Corner Cases (≥5 casos por feature)
   - Tier 3: Combinações Cross-Feature (pares de interação)
   - Tier 4: Cenários Reais de Aplicação (≥5 fluxos completos)
3. Implementar a suíte executável `f:\Documentos\Desenvolvimento\BelaFarma\test_compras_e2e.js` com testes determinísticos, mocks de rede/baileys/firebird quando aplicável e verificações reais dos cálculos matemáticos, regras de score ponderado (60/25/15), pedido mínimo, travas de aprovação humana, espelhos de pedido e orçamento.
4. Executar os testes via comando no Node (`node test_compras_e2e.js`).
5. Publicar `f:\Documentos\Desenvolvimento\BelaFarma\.agents\TEST_READY.md` contendo o resumo dos testes, comando de execução e contagem por Tier.
6. Gravar `handoff.md` e enviar mensagem ao Orquestrador com o resultado.
