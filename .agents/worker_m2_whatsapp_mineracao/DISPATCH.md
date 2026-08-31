# Tarefa: Worker M2 - WhatsApp Compras Isolado & Mineração Histórica

## 2026-08-29T17:11:18Z

### Identidade e Diretório
- Archetype: teamwork_preview_worker
- Working directory: f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m2_whatsapp_mineracao
- Original Request: f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md
- Project Scope: f:\Documentos\Desenvolvimento\BelaFarma\.agents\PROJECT.md
- Analysis Report: f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_survey_frontend_whatsapp\analysis.md e f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_survey_backend\analysis.md

### MANDATORY INTEGRITY WARNING
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

### Missão
Implementar de forma completa, robusta e genuína o serviço isolado Baileys para compras e a mineração de conversas:
1. **Propriedade de Arquivos**:
   - `backend/baileys-compras-service.js` (Instância dedicada Baileys com pasta `backend/baileys-session-compras` ou `data/baileys-session-compras`)
   - `backend/services/compras-mineracao.service.js` (Serviço de extração e indexação de representantes, prazos, pedido mínimo e catálogo histórico)
   - Tabelas SQLite em `backend/database.js` (`compras_fornecedores_meta`, `compras_oportunidades_mineradas`, `compras_historico_mensagens`, etc.)
2. **Requisitos Específicos (R2, F4, F5, F6)**:
   - Gerenciamento completo de sessão Baileys isolada, geração de QR Code, verificação de status (`connected`, `connecting`, `qr_ready`, `disconnected`) e reconexão resiliente.
   - Parser/minerador de mensagens históricas para identificar:
     1. Representantes e distribuidoras/laboratórios;
     2. Prazos médios e condições de pagamento negociadas (ex: 28/35/42 dias, boleto, à vista);
     3. Valores de pedido mínimo de cada distribuidora;
     4. Catálogo e histórico de categorias/produtos fornecidos.
   - Indexador contínuo de novas ofertas e mensagens recebidas, cruzando com a lista de faltas/produtos abaixo do mínimo e validando se o preço ofertado é inferior ao preço da última compra no Digifarma.
3. **Verificação**:
   - Criar e rodar testes automatizados para validar a instância, parsing de mensagens reais, extração de condições comerciais, e indexação de oportunidades.
   - Gravar relatório em `f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m2_whatsapp_mineracao\handoff.md`.
