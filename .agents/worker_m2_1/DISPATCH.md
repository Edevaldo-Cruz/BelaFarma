## 2026-08-12T13:59:08Z
You are worker_m2_1.
Your working directory is f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m2_1.
Your identity and role: teamwork_preview_worker.

Read ORIGINAL_REQUEST.md: f:\Documentos\Desenvolvimento\BelaFarma\.agents\ORIGINAL_REQUEST.md
Read M2 Explorer handoff: f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_m2_1\handoff.md
Read M2 Explorer analysis: f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_m2_1\analysis.md

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Exclusive file ownership for this task:
- `f:\Documentos\Desenvolvimento\BelaFarma\backend\services\whatsapp-delivery-service.js`
- `f:\Documentos\Desenvolvimento\BelaFarma\backend\delivery-endpoints.js`

Task:
Implement Milestone 2 (M2 - Backend AI Scanner & REST Endpoints) for BelaFarma.

Instructions:
1. Update `backend/services/whatsapp-delivery-service.js`:
   - Update `DELIVERY_AUDIT_SYSTEM_PROMPT` to instruct AI to extract `"products_discussed": ["nome do produto 1", "nome do produto 2"]`.
   - Update `scanDeliveriesFromWhatsApp(db, options)` to calculate and save:
     - `is_new_customer`: 1 if phone has no prior closed sales, else 0.
     - `chat_duration_seconds`: difference between max and min message timestamp in seconds.
     - `chat_message_count`: total count of messages analyzed in chat.
     - `discussed_products_json`: JSON.stringify of `products_discussed` array.
     - `review_status`: set to `'pending_review'` when `sale_closed === false`.
2. Update `backend/delivery-endpoints.js`:
   - Add endpoint `GET /api/deliveries/pending-reviews`: return items with `review_status = 'pending_review'` ordered by `created_at DESC`.
   - Add endpoint `GET /api/deliveries/pending-reviews/:id`: return single pending review item by ID.
   - Add endpoint `POST /api/deliveries/:id/submit-review`:
     - If `gerou_entrega === true`: update delivery status to closed/pending delivery, `review_status = 'reviewed'`, `reviewed_at = CURRENT_TIMESTAMP`, `reviewed_by`.
     - If `gerou_entrega === false`: update delivery `sale_closed = 0`, `review_status = 'reviewed'`, `rejection_details_json`, `unclosed_reason`, insert product rejections into `chat_product_rejections` table.
   - Add endpoint `GET /api/deliveries/rejection-metrics`: query aggregated rejection metrics (`total_rejections`, `by_reason`, `top_rejected_products`).
3. Verification:
   - Verify syntax and exports via Node execution script.

Output:
Write `handoff.md` and `analysis.md` in `f:\Documentos\Desenvolvimento\BelaFarma\.agents\worker_m2_1\`. Include build and test verification results in handoff.md.
Notify orchestrator when done via send_message.
