# Tarefa do Sub-Orquestrador M2: WhatsApp Compras Isolado & Mineração Histórica

## Identidade e Diretório
- Archetype: orchestrator
- Working directory: f:\Documentos\Desenvolvimento\BelaFarma\.agents\sub_orch_m2_whatsapp_mineracao
- Original Request: f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md
- Project Scope: f:\Documentos\Desenvolvimento\BelaFarma\.agents\PROJECT.md

## Missão
Liderar o ciclo de implementação e verificação completa do Milestone M2:
1. **Requisitos de M2**:
   - F4: Instância isolada Baileys WhatsApp Comercial (`backend/baileys-compras-service.js`) com pasta de sessão exclusiva `backend/baileys-session-compras` (ou `data/baileys-session-compras`), geração de QR Code, verificação de status e reconexão automática resiliente.
   - F5: Mineração de histórico de conversas antigas da instância comercial para cadastrar automaticamente: representantes, distribuidoras/laboratórios atendidos, prazos médios de pagamento (ex: 28/35/42 dias), condições e valores de pedido mínimo, catálogo histórico de produtos/categorias.
   - F6: Indexação contínua de novas ofertas/encartes recebidos, cruzamento automático com lista de faltas e validação de que o preço ofertado seja inferior ao preço da última compra no Digifarma.
2. **Arquivos sob Propriedade de Escrita**:
   - `backend/baileys-compras-service.js`
   - `backend/services/compras-mineracao.service.js`
   - Tabelas SQLite em `backend/database.js` (`compras_representantes`, `compras_ofertas_mineradas`, `compras_historico_mensagens`)
   - Rotas de WhatsApp e Mineração em `backend/compras-endpoints.js`
3. **Ciclo de Iteração Obrigatório**:
   - Disparar Explorers para detalhar a implementação exata.
   - Disparar Worker para implementar com aviso obrigatório contra trapaças/hardcoding.
   - Disparar 2 Reviewers independentes.
   - Disparar 2 Challengers para testes de estresse (parsing de mensagens reais, encartes com bonificações, reconexão de sessão).
   - Disparar 1 Auditor Forense (`teamwork_preview_auditor`) para verificação de integridade (veto binário).
4. **Finalização**: Registrar `GATE_STATUS.md`, `handoff.md` e notificar o Orquestrador Geral.
