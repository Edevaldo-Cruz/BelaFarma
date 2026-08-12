# Handoff Report: Backend & Database Investigation for Interactive WhatsApp Audit System

## 1. Observation
- **Service & Scan Logic**: Found in `backend/services/whatsapp-delivery-service.js` (365 lines).
  - `syncMessagesFromEvolution(db)` (lines 80-180): Syncs chats from Evolution API (`/chat/findChats`, `/chat/findMessages`) into SQLite tables `whatsapp_messages` and `whatsapp_contacts`.
  - `scanDeliveriesFromWhatsApp(db, options)` (lines 182-360): Selects chats from `whatsapp_messages` (`WHERE timestamp >= ? GROUP BY phone HAVING msgCount >= 1`), fetches last 50 messages, checks deduplication in `deliveries` (`phone` + `last_message_id`), formats prompt, and calls `callAI(...)`.
- **AI Integration**: Found in `backend/services/ai.service.js` (135 lines).
  - `callAI(prompt, systemPrompt, options)`: Primary provider `process.env.AI_PROVIDER || 'openai'` (`gpt-4o-mini`), fallback provider Google Gemini (`gemini-flash-latest`).
- **Cron Jobs**:
  - `backend/server.js`: Boot scan at 15s (`scanDeliveriesFromWhatsApp(db, { currentMonth: true })`, line 3696) and periodic scan every 10 min (`hours: 24`, line 3706).
  - `backend/delivery-endpoints.js`: Periodic scan every 30 min (`hours: 48`, line 263).
- **SQLite Database**:
  - Central config in `backend/config.js` (lines 8-17). Database connection & WAL mode initialized in `backend/database.js` (lines 9-14).
  - Existing `deliveries` table (`database.js:1279-1308`): Columns `id`, `phone`, `customer_name`, `delivery_address`, `items`, `total_amount`, `payment_method`, `status`, `sale_closed`, `unclosed_reason`, `last_message_id`, `notes`, `created_at`, `updated_at`.
  - Existing `whatsapp_messages` table (`database.js:1251-1267`): Columns `id`, `phone`, `fromMe`, `messageText`, `rawMessage`, `timestamp`.
  - Existing `customers` table (`database.js:228-241`, `1312-1348`): Columns `id`, `name`, `cpf`, `phone`, `email`, `address`, `createdAt`, `creditLimit`, `source`, `whatsapp_name`.

## 2. Logic Chain
1. **Chat Cold/Idle Processing**:
   - Conversations are synchronized into `whatsapp_messages`. The background service queries `whatsapp_messages` grouped by `phone` for chats with >= 1 message within the target window (e.g. 24h or current month).
   - Deduplication prevents re-auditing identical states by matching `(phone, last_message_id)`.
2. **Customer Metrics Computation**:
   - **New vs. Returning Customer**: Can be computed by checking if `phone` exists in `customers` table OR checking prior closed sales (`SELECT COUNT(*) FROM deliveries WHERE phone = ? AND sale_closed = 1 AND created_at < ?`). Zero prior sales indicates a New Customer (`is_new_customer = 1`).
   - **Chat Duration**: Derived from `MAX(timestamp) - MIN(timestamp)` of messages in `whatsapp_messages` for that phone.
   - **Chat Frequency**: Derived from `COUNT(DISTINCT date(timestamp/1000, 'unixepoch'))` over the past 30 days.
3. **Database Schema Enhancements Required**:
   - To support the "Revisão Pendente" queue and attendant questionnaire pre-filling, `deliveries` needs additional fields: `review_status` ('pending_review', 'reviewed', etc.), `is_new_customer`, `chat_duration_seconds`, `chat_message_count`, `discussed_products_json`, `rejection_details_json`, `reviewed_by`, `reviewed_at`.
   - To enable aggregated rejection metric queries (e.g., rejections by reason or product), a new normalized table `chat_product_rejections` should be added.

## 3. Caveats
- **Read-Only Scope**: This report is produced under read-only investigation mode. Source code files (`backend/services/whatsapp-delivery-service.js`, `backend/database.js`, `backend/delivery-endpoints.js`) were inspected but not modified.
- **Evolution API Connection**: Message sync depends on Evolution API running and accessible at `EVOLUTION_API_URL` (default `http://localhost:8080`).

## 4. Conclusion
The BelaFarma backend already possesses a robust AI delivery auditing service (`whatsapp-delivery-service.js`), SQLite database framework (`database.js`), and delivery endpoints (`delivery-endpoints.js`). Adding the "Fila de Revisão Pendente" and rejection metrics requires:
1. Updating `DELIVERY_AUDIT_SYSTEM_PROMPT` in `whatsapp-delivery-service.js` to return structured `products_discussed` JSON.
2. Running safe SQLite migrations in `backend/database.js` to add audit/review columns to `deliveries` and create `chat_product_rejections`.
3. Adding API endpoints in `backend/delivery-endpoints.js` for `/api/deliveries/pending-reviews`, `/api/deliveries/:id/submit-review`, and `/api/deliveries/rejection-metrics`.

## 5. Verification Method
1. **Inspect Schema**: Verify existing tables and column definitions in `backend/database.js` lines 1251–1308.
2. **Inspect AI Service**: Verify AI call flow in `backend/services/whatsapp-delivery-service.js` lines 182–360 and `backend/services/ai.service.js` lines 1–132.
3. **Test Endpoints & Migrations**: Once implemented, run `node backend/database.js` or start server `node backend/server.js` and query SQLite database using `sqlite3` or Node script to confirm column additions and endpoint responses (`/api/deliveries`).
