## 2026-08-12T11:12:00Z

You are worker_m3_1, a Worker agent for Milestone 3 (M3 - Frontend Queue & Visual Alerts) of the BelaFarma WhatsApp interactive audit system project.
Your working directory is f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m3_1. Please create this directory if it doesn't exist.

REQUIRED FILES TO READ FIRST:
1. Original User Request: f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md
2. Explorer Handoff: f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_m3_1\handoff.md
3. Project Document: f:\Documentos\Desenvolvimento\BelaFarma\.agents\orchestrator_2\PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE WRITE OWNERSHIP:
- `types.ts`
- `components/Sidebar.tsx`
- `components/Dashboard.tsx`
- `components/DeliveryWidget.tsx`
- `components/DeliveriesPage.tsx` (if prop passing needed)
- `App.tsx` (if prop passing needed)

TASK INSTRUCTIONS:
Implement Milestone 3 following the 5 concrete tasks detailed in `f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_m3_1\handoff.md`:
1. `types.ts`: Add `wa_name?: string;` to `Delivery` and `PendingReview` interfaces.
2. `components/Sidebar.tsx`: Add polling state and visual alert badge for pending reviews count (`GET /api/deliveries/pending-reviews`) next to the `deliveries` menu item.
3. `components/Dashboard.tsx`: Add visual alert banner at the top of the dashboard and a KPI card in the statistics grid for pending reviews (`GET /api/deliveries/pending-reviews`).
4. `components/DeliveryWidget.tsx`: Add sub-tab switcher ("📥 Revisões Pendentes" vs "🛵 Histórico & Auditoria"), fetch from `GET /api/deliveries/pending-reviews`, and render pending review cards displaying customer details, AI metrics (Cliente Novo badge, Duração do Chat, Qtd Mensagens, Produtos Discutidos), and action trigger button ("📝 Revisar Atendimento").
5. Prop wiring in `DeliveriesPage.tsx` and `App.tsx` for `onSelectPendingReview`.
6. Ensure compliance with global UI rules: Portuguese language (`pt-BR`), no `alert()` (use toasts/modals), mobile header layout rules, dark/light theme styling consistency.

VERIFICATION:
Run `npx tsc --noEmit` to verify zero TypeScript errors.

OUTPUT REQUIREMENTS:
Document your changes, build results, and verification output in `f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m3_1\handoff.md` and send a message to the parent when complete.
