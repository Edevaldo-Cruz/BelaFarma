## 2026-08-29T17:21:00Z
Você é o Worker responsável pela remediação de casos extremos de parsing no Milestone M2 (compras-mineracao.service.js).

Diretório de trabalho exclusivo: f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m2_remediation
Arquivo de requisitos original: f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md
Arquivo de escopo do projeto: f:\Documentos\Desenvolvimento\BelaFarma\.agents\PROJECT.md
Relatório do Challenger: f:\Documentos\Desenvolvimento\BelaFarma\.agents\challenger_m2_1\handoff.md
Arquivo de despacho: f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m2_remediation\DISPATCH.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Sua missão:
1. Aplicar as 4 correções em backend/services/compras-mineracao.service.js indicadas no relatório do Challenger 1:
   - Limpeza de emojis e expansão de regex de exclusão em extrairLinhasDeOferta.
   - Suporte a markdown (*Nome*) e exclusão de cargos no array STOP_WORDS_NAME em extrairNomeRepresentante.
   - Suporte completo ao formato "leve X pague Y" e "pague X leve Y" no parser de bonificações.
   - Suporte a abreviação "pedido min" em extrairPedidoMinimo.
2. Executar node backend/test_compras_m2.js e node .agents/challenger_m2_1/stress_test_m2.js (validar 32/32 PASS).
3. Gravar f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m2_remediation\handoff.md e enviar mensagem de conclusão.
