# BRIEFING — 2026-08-29T14:09:30Z

## Mission
Mapear a arquitetura Frontend Web UI e o serviço WhatsApp (Baileys) no BelaFarma para o novo módulo Central de Compras.

## 🔒 My Identity
- Archetype: teamwork_preview_explorer
- Roles: Frontend Specialist, Baileys/WhatsApp Architecture Specialist, Investigation & Synthesis
- Working directory: f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_survey_frontend_whatsapp
- Original parent: 78620ac3-2868-4b6e-896d-c2c6e6f842ea
- Milestone: Survey & Architectural Design (M1)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement features yet, only produce structured analysis and handoff.
- Write files only in `.agents/explorer_survey_frontend_whatsapp/`.
- No `alert()` in production code (use custom modals / toasts).
- Communication in Portuguese.
- Raspberry Pi 4 is the production server (192.168.1.70).

## Current Parent
- Conversation ID: 78620ac3-2868-4b6e-896d-c2c6e6f842ea
- Updated: not yet

## Investigation State
- **Explored paths**: `App.tsx`, `types.ts`, `components/Sidebar.tsx`, `components/MobileHeader.tsx`, `components/ToastContext.tsx`, `components/Quotations.tsx`, `components/QuotationComparator.tsx`, `components/SuppliersManager.tsx`, `components/OffersAgent.tsx`, `backend/server.js`, `backend/baileys-service.js`, `backend/baileys-secondary-service.js`, `backend/purchasing-endpoints.js`, `backend/database.js`.
- **Key findings**: 
  1. Frontend usa React 19 + Vite + Tailwind CSS. A navegação em `Sidebar.tsx` e `App.tsx` utiliza o type union `View`.
  2. Modais e Toasts seguem padrão sem `alert()`. Layout mobile segue regra estrita (logo centralizado em cima; busca e hamburger embaixo).
  3. O backend já possui 2 instâncias Baileys (`baileys-service.js` e `baileys-secondary-service.js`). A nova instância comercial `baileys-compras-service.js` com pasta `baileys-session-compras` garante isolamento 100% do chatbot de clientes.
  4. Fila de aprovação obrigatória com alerta duplo (Web e WhatsApp ADM) projetada para garantir zero envio sem validação humana.
- **Unexplored areas**: Nenhuma área crítica restante para o survey frontend/whatsapp.

## Key Decisions Made
- Estruturado o design do componente `CentralCompras.tsx` unificando 7 subseções com sub-abas interativas.
- Projetada a nova instância `baileys-compras-service.js` e os endpoints de integração REST.
- Especificada a tabela `compras_fila_aprovacao` e a mecânica de notificação com alerta duplo.

## Artifact Index
- `.agents/explorer_survey_frontend_whatsapp/analysis.md` — Relatório técnico detalhado do Frontend e WhatsApp
- `.agents/explorer_survey_frontend_whatsapp/handoff.md` — Relatório de Handoff com 5 componentes
- `.agents/explorer_survey_frontend_whatsapp/progress.md` — Acompanhamento de progresso e heartbeat
