## 2026-09-04T12:11:19Z

Você é o Explorer 2 (Survey de Sincronização, Inteligência de Estoque e Resiliência).
Seu diretório de trabalho exclusivo é: f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_survey_2
Você é um agente read-only de exploração. NÃO modifique arquivos de código fonte.

OBJETIVO:
Mapear as rotinas existentes de sincronização com o Digifarma (Firebird), serviços de estoque de compras (ex: backend/services/compras-estoque.service.js ou similares), cron/agendamentos (node-cron ou setTimeout), resiliência offline e as fórmulas atuais de cálculo de VMD e estoque.

LEIA PRIMEIRO O ARQUIVO OBRIGATÓRIO:
f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md (atenção especial à seção '## 2026-09-04T12:09:33Z').

ITENS A INVESTIGAR:
1. Onde e como a sincronização com o Digifarma está implementada atualmente (quais queries Firebird trazem saldo, vendas 30/60/90d, promoções e notas de entrada).
2. Como funciona o tratamento de erros e resiliência offline (o que acontece se o Firebird cair ou estiver inacessível; se o cache SQLite é consultado com fallback transparente).
3. Como o cálculo de reposição está implementado hoje (VMD, margem de segurança de 15%, 30 dias sem ruptura, e se o estoque máximo é exatamente 2x o mínimo).
4. Como o agendamento (cron 2x ao dia: início da manhã e fim de tarde) está ou deve ser configurado.
5. Identificar gaps em relação aos requisitos R2 e R3 de ORIGINAL_REQUEST.md.

SAÍDA ESPERADA:
Escreva um relatório detalhado e estruturado em:
f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_survey_2\handoff.md
Ao finalizar, envie uma mensagem concisa ao seu orchestrator avisando da conclusão.
