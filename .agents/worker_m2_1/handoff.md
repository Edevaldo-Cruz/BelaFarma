# Handoff Report — Milestone 2 (M2 - Backend AI Scanner & REST Endpoints)

## 1. Observation
- **Modified Files**:
  - `backend/services/whatsapp-delivery-service.js`:
    - Updated `DELIVERY_AUDIT_SYSTEM_PROMPT` (lines 34–77) to extract `products_discussed` as a JSON array.
    - Updated `scanDeliveriesFromWhatsApp` (lines 269–440) to compute `chat_duration_seconds`, `chat_message_count`, `is_new_customer`, `discussed_products_json`, and set `review_status = 'pending_review'` when `sale_closed === false`.
  - `backend/delivery-endpoints.js`:
    - Added `GET /api/deliveries/pending-reviews` (lines 129–148).
    - Added `GET /api/deliveries/pending-reviews/:id` (lines 150–174).
    - Added `POST /api/deliveries/:id/submit-review` (lines 176–271).
    - Added `GET /api/deliveries/rejection-metrics` (lines 273–336).
- **Verification Script Created**:
  - `backend/test_m2_verification.js`: Automated test suite creating an in-memory SQLite database, seeding a pending review delivery, testing all 4 REST endpoints (`GET pending-reviews`, `GET pending-reviews/:id`, `POST submit-review`, `GET rejection-metrics`), and verifying SQL insertions into `chat_product_rejections`.

## 2. Logic Chain
1. **AI System Prompt & Extraction**:
   - Including `products_discussed` instructions in `DELIVERY_AUDIT_SYSTEM_PROMPT` allows Gemini/OpenAI to extract individual item names into an array.
2. **Scanner Calculation**:
   - `chat_duration_seconds` measures `(maxTimestamp - minTimestamp) / 1000` from message history.
   - `is_new_customer` checks whether phone has prior `sale_closed = 1` delivery or completed sales.
   - `review_status` is set to `'pending_review'` for unclosed sales (`sale_closed = 0`), adding them automatically to the Dashboard review queue.
3. **REST Endpoints**:
   - `GET /api/deliveries/pending-reviews` retrieves items with `review_status = 'pending_review'`.
   - `POST /api/deliveries/:id/submit-review` updates status, sets `review_status = 'reviewed'`, and inserts rejected items into `chat_product_rejections`.
   - `GET /api/deliveries/rejection-metrics` aggregates rejection counts by reason and top rejected products.

## 3. Caveats
- `chat_product_rejections` uses `delivery_id` as TEXT matching `deliveries.id` (e.g. `deliv_...`).
- When no product rejections exist yet in `chat_product_rejections`, `GET /api/deliveries/rejection-metrics` falls back to aggregating `unclosed_reason` directly from `deliveries`.

## 4. Conclusion
Milestone 2 (M2) backend implementation is complete, non-bypassable, and verified against schema and REST route requirements.

## 5. Verification Method
- Execute: `node backend/test_m2_verification.js`
- Test endpoints via HTTP client:
  - `GET http://localhost:3001/api/deliveries/pending-reviews`
  - `GET http://localhost:3001/api/deliveries/pending-reviews/:id`
  - `POST http://localhost:3001/api/deliveries/:id/submit-review`
  - `GET http://localhost:3001/api/deliveries/rejection-metrics`
