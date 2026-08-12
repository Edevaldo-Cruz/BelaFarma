## 2026-08-12T10:58:19Z
Task for Milestone 2 (M2 - Backend AI Scanner & REST Endpoints):
Analyze `backend/services/whatsapp-delivery-service.js` and `backend/delivery-endpoints.js` in `f:\Documentos\Desenvolvimento\BelaFarma`.
Provide exact implementation details for:
1. `backend/services/whatsapp-delivery-service.js`:
   - Updating `DELIVERY_AUDIT_SYSTEM_PROMPT` to instruct AI to extract `products_discussed` (JSON array of product names discussed in conversation).
   - Updating `scanDeliveriesFromWhatsApp(db, options)` to calculate:
     - `is_new_customer`: 1 if phone has no prior closed sales or customer record, else 0.
     - `chat_duration_seconds`: `Math.round((maxTimestamp - minTimestamp) / 1000)` from messages.
     - `chat_message_count`: count of messages in conversation.
     - `review_status`: set to `'pending_review'` when a chat is scanned and sale is unclosed/idle (`sale_closed === false`).
     - Save these fields + `discussed_products_json` into `deliveries` insert/update query.
2. `backend/delivery-endpoints.js`:
   - `GET /api/deliveries/pending-reviews`: List all deliveries with `review_status = 'pending_review'` ordered by `created_at DESC`.
   - `GET /api/deliveries/pending-reviews/:id`: Get detailed single pending review record.
   - `POST /api/deliveries/:id/submit-review`: Accept questionnaire submission:
     - `gerou_entrega` (boolean)
     - If true: set `sale_closed = 1`, `status = 'pendente'`, update delivery details, set `review_status = 'reviewed'`, `reviewed_at = CURRENT_TIMESTAMP`, `reviewed_by`.
     - If false: set `sale_closed = 0`, `review_status = 'reviewed'`, `rejection_details_json`, `unclosed_reason`, insert each rejected product into `chat_product_rejections`, `reviewed_at = CURRENT_TIMESTAMP`, `reviewed_by`.
   - `GET /api/deliveries/rejection-metrics`: Query aggregated rejection metrics from `chat_product_rejections` and `deliveries`.

Output:
Write `handoff.md` and `analysis.md` in `f:\Documentos\Desenvolvimento\BelaFarma\.agents\explorer_m2_1\`.
Include exact code snippets, SQL queries, and line numbers for the worker.
Notify orchestrator when done via send_message.
