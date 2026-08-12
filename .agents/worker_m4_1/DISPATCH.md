## 2026-08-12T14:26:53Z

<USER_REQUEST>
You are worker_m4_1, Worker agent for Milestone 4 (M4: Interactive Questionnaire Modal) of BelaFarma WhatsApp audit system.
Your working directory is f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m4_1. Please create this directory if it doesn't exist.

REQUIRED FILES TO READ FIRST:
1. Original User Request: f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md
2. Explorer Handoff: f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_m4_1\handoff.md
3. Project Document: f:\Documentos\Desenvolvimento\BelaFarma\.agents\orchestrator_2\PROJECT.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE WRITE OWNERSHIP:
- `components/PendingReviewModal.tsx` (Create new component)
- `components/DeliveryWidget.tsx`
- `components/DeliveriesPage.tsx`
- `App.tsx`

TASK INSTRUCTIONS:
Implement Milestone 4 following the specifications in `f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_m4_1\handoff.md`:

1. **Create `components/PendingReviewModal.tsx`**:
   - Modal container with backdrop blur (`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4`).
   - Header with customer info (`wa_name || customer_name || phone`), phone, `Cliente Novo` / `Recorrente` badge, chat duration (`chat_duration_seconds`), message count (`chat_message_count`).
   - Primary question: "Gerou entrega?" with "SIM" and "NÃO" decision toggle buttons.
   - **"SIM" Flow**: Form with fields (Delivery Address, Items, Total Amount, Payment Method dropdown ["PIX", "Cartão de Crédito", "Cartão de Débito", "Dinheiro"], Notes). Submits `POST /api/deliveries/:id/submit-review` with `{ gerou_entrega: true, delivery_details: { delivery_address, items, total_amount, payment_method, notes } }`.
   - **"NÃO" Flow**: Pre-filled questionnaire with discussed products parsed safely from `discussed_products_json`. Each product has a rejection checkbox, reason selector ("Preço", "Falta de Estoque", "Apenas Dúvida", "Outro"), and optional notes. Allows adding custom product lines if needed. Submits `POST /api/deliveries/:id/submit-review` with `{ gerou_entrega: false, unclosed_reason, rejection_details: [{ product_name, reason, notes }] }`.
   - **Feedback & UX**: Use `useToast` from `./ToastContext` to display success/error notifications ("Revisão de atendimento concluída com sucesso!"). Strictly NO `alert()`.
   - Loading indicator during API fetch.

2. **Integrate with `DeliveryWidget.tsx` / `DeliveriesPage.tsx` / `App.tsx`**:
   - In `App.tsx`: maintain state for `selectedPendingReview: Delivery | null` and render `<PendingReviewModal delivery={selectedPendingReview} onClose={() => setSelectedPendingReview(null)} onSubmitSuccess={handleReviewSubmitted} />`.
   - In `DeliveryWidget.tsx` and `App.tsx`: upon successful submission, optimistically filter out the reviewed item from `pendingReviews` state array, updating count badges and inbox queue cleanly.

3. **Global Rule Compliance**:
   - Portuguese language (`pt-BR`).
   - No `alert()`.
   - Dark/light mode theme alignment.

VERIFICATION:
Run `npx tsc --noEmit` to verify zero TypeScript errors.

OUTPUT REQUIREMENTS:
Document code changes and build verification in `f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m4_1\handoff.md` and send a message to the parent when complete.
</USER_REQUEST>
