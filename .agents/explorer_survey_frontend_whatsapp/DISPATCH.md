# Tarefa do Explorer 3: Mapeamento de Frontend Web UI e WhatsApp Baileys

## Identidade e Diretório
- Archetype: teamwork_preview_explorer
- Working directory: f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_survey_frontend_whatsapp
- Original Request: f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md

## Missão
Investigar a camada de interface Web (Frontend) e o serviço existente de WhatsApp (Baileys):
1. Inspecionar o frontend (React, Vite, Next, router, componentes, sidebar de navegação, painéis existentes, layout em telas pequenas e desktop, toast/modals sem alert()).
2. Mapear onde e como a nova guia "Central de Compras" deve ser inserida na navegação e desenhar a arquitetura das 7 subseções requeridas:
   - 1. Visão Geral / Dashboard de Estoque Mínimo e Faltas;
   - 2. Mineração de Oportunidades & Histórico de Conversas;
   - 3. Central de Cotações, Comparador e Ranking de Fornecedores;
   - 4. Fila de Aprovação de Mensagens e Notificações;
   - 5. Painel de Pedidos de Compra e Controle Orçamentário;
   - 6. Cadastro e Gestão de Representantes e Distribuidoras;
   - 7. Conexão do WhatsApp Comercial (QR Code e Status).
3. Inspecionar o serviço existente de WhatsApp Baileys (chatbot, delivery-service ou similar): como gerencia sessões, autenticação, eventos de conexão/QR code, envio/recebimento de mensagens, e como projetar a instância ISOLADA `baileys-compras-service.js` com pasta de sessão `baileys-session-compras`.
4. Documentar todos os achados em `f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_survey_frontend_whatsapp\analysis.md` e `handoff.md`.
