# Milestone 2 (M2) — Backend AI Scanner & REST Endpoints Analysis & Implementation Summary

## 1. Executive Summary
The backend component for Milestone 2 (M2) has been fully implemented in BelaFarma. This milestone enhances the WhatsApp delivery AI scanner and adds REST API endpoints to support interactive review of unclosed sales by farmácia staff.

## 2. Implemented Features

### Component 1: Extended AI Delivery Scanner (`backend/services/whatsapp-delivery-service.js`)
- **System Prompt Enhancement**: Updated `DELIVERY_AUDIT_SYSTEM_PROMPT` to extract `products_discussed` (array of individual product/medication names discussed during the conversation).
- **Customer Status Calculation (`is_new_customer`)**: Automatically queries SQLite for prior closed sales in `deliveries`, `customers`, and `sales` to determine if a contact is a new customer (`1` if no prior history, else `0`).
- **Chat Metrics**:
  - `chat_duration_seconds`: Calculated as `(maxTimestamp - minTimestamp) / 1000`.
  - `chat_message_count`: Total message count in analyzed chat transcript.
  - `discussed_products_json`: Serialized array of products discussed.
- **Review Queue Status (`review_status`)**: Set to `'pending_review'` when `sale_closed === false`, allowing staff interactive auditing.

### Component 2: Delivery & Rejection REST Endpoints (`backend/delivery-endpoints.js`)
- **`GET /api/deliveries/pending-reviews`**:
  - Returns list of unclosed sales waiting for manual review (`review_status = 'pending_review'`), ordered by `created_at DESC`. Includes WhatsApp contact name (`wa_name`).
- **`GET /api/deliveries/pending-reviews/:id`**:
  - Fetches complete detail for a single pending review delivery by ID.
- **`POST /api/deliveries/:id/submit-review`**:
  - Processes questionnaire responses from atendente:
    - If `gerou_entrega === true`: Updates delivery to closed (`sale_closed = 1`, `status = 'Pendente'`), sets `review_status = 'reviewed'`, records `reviewed_at` timestamp and `reviewed_by`.
    - If `gerou_entrega === false`: Updates delivery to unclosed (`sale_closed = 0`, `status = 'Nao_Fechado'`), sets `review_status = 'reviewed'`, records `rejection_details_json`, `unclosed_reason`, and inserts individual product rejections into `chat_product_rejections` table.
- **`GET /api/deliveries/rejection-metrics`**:
  - Queries and consolidates metrics: `total_rejections`, `by_reason` (breakdown by refusal reason), and `top_rejected_products` / `by_product` (top rejected products with primary refusal reasons).

## 3. File Ownership & Modification Log
- `backend/services/whatsapp-delivery-service.js`: Extended system prompt and scanner logic for M2 audit fields.
- `backend/delivery-endpoints.js`: Added the 4 REST endpoints (`pending-reviews`, `pending-reviews/:id`, `submit-review`, `rejection-metrics`).
