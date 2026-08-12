# Project: WhatsApp Interactive Audit System (BelaFarma)

## Architecture
- **Backend Service**: `backend/services/whatsapp-delivery-service.js` (Background scan of cold/idle WhatsApp messages via Evolution API, AI classification using OpenAI / Gemini).
- **Database**: SQLite initialized in `backend/database.js`. Tables: `deliveries`, `whatsapp_messages`, `customers`, `sales`, and `chat_product_rejections`.
- **API Endpoints**: Express app in `backend/server.js` mounting `backend/delivery-endpoints.js`.
- **Frontend SPA**: React 19 + TypeScript + Vite + Tailwind CSS (`App.tsx`, `components/Dashboard.tsx`, `components/Sidebar.tsx`, `components/DeliveryWidget.tsx`, `components/PendingReviewModal.tsx`).
- **UI Conventions**: No `alert()`, toast notifications via `ToastContext`, modals with backdrop blur, MobileHeader layout (row 1 logo, row 2 menu + search), all in Portuguese (`pt-BR`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Cold/Idle Chat Background AI Scanner | AI background scan in `whatsapp-delivery-service.js` identifies cold/idle WhatsApp chats and classifies unclosed/idle chats into "Revisão Pendente". | M2 | R1 |
| 2 | Automatic AI Metrics Extraction | AI extracts new customer status (DB history query), chat duration/frequency, and discussed products list from chat messages. | M2 | R1 |
| 3 | Database Schema Update for Audit & Rejections | Update SQLite DB (`backend/database.js`) adding columns to `deliveries` (`review_status`, `is_new_customer`, `chat_duration_seconds`, `chat_message_count`, `discussed_products_json`, `rejection_details_json`, `reviewed_by`, `reviewed_at`) and create `chat_product_rejections` table. | M1 | R1 |
| 4 | Audit & Rejection REST API Endpoints | REST endpoints in `backend/delivery-endpoints.js`: `GET /api/deliveries/pending-reviews`, `GET /api/deliveries/pending-reviews/:id`, `POST /api/deliveries/:id/submit-review`, `GET /api/deliveries/rejection-metrics`. | M2 | R1, R3 |
| 5 | Dashboard Visual Alert & Pending Queue Inbox | Dashboard UI (`Sidebar.tsx`, `Dashboard.tsx`, `DeliveryWidget.tsx`) displays visual alert count badge and a "Revisões Pendentes" inbox queue. | M3 | R2 |
| 6 | Interactive Questionnaire Modal ("Gerou entrega?") | Modal (`PendingReviewModal.tsx`) asking "Gerou entrega?". If Yes -> confirm delivery details. If No -> pre-filled questionnaire with discussed products to confirm rejected products and reasons (Preço, Falta de Estoque, Apenas Dúvida, etc.). | M4 | R3 |
| 7 | Optimistic State Update & Queue Removal | Submitting questionnaire updates DB via API, removes item from pending queue, updates state, and shows toast notification. | M4 | R3 |
| 8 | E2E Testing Suite & Integration Verification | Opaque-box test script and full end-to-end integration verification across DB, AI, API, and UI components. | M5 | Acceptance |

## Code Layout
- `backend/database.js` — SQLite table migrations & helper queries
- `backend/services/whatsapp-delivery-service.js` — Cold/idle chat scanner & AI metric extraction
- `backend/delivery-endpoints.js` — Express REST endpoints for deliveries and audit reviews
- `types.ts` — TypeScript type declarations for Delivery, PendingReview, RejectionMetric, etc.
- `components/Sidebar.tsx` — Sidebar navigation & pending review alert badge
- `components/Dashboard.tsx` — Dashboard view & metrics summary
- `components/DeliveryWidget.tsx` — Pending review queue inbox widget
- `components/PendingReviewModal.tsx` — Interactive "Gerou entrega?" questionnaire modal
- `backend/scripts/test-audit-system-e2e.js` — Automated E2E verification test script

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Database Schema & Data Models | SQLite migration in `database.js`, TypeScript interface updates in `types.ts` | None | DONE |
| M2 | Backend AI & REST Endpoints | Prompt update, chat metrics calculation in `whatsapp-delivery-service.js`, REST endpoints in `delivery-endpoints.js` | M1 | DONE |
| M3 | Frontend Queue & Visual Alerts | Sidebar badge, Dashboard alert, pending reviews queue in `DeliveryWidget.tsx` | M2 | DONE |
| M4 | Interactive Modal Questionnaire | `PendingReviewModal.tsx` ("Gerou entrega?" Yes/No flow), submit handler, API integration, optimistic state removal | M3 | DONE |
| M5 | E2E Testing & Hardening | Integration script `test-audit-system-e2e.js`, full verification, TypeScript compilation build check | M4 | IN_PROGRESS |

## Interface Contracts
### `GET /api/deliveries/pending-reviews`
- Response: `[{ id, phone, customer_name, is_new_customer, chat_duration_seconds, chat_message_count, discussed_products_json, created_at, ... }]`

### `POST /api/deliveries/:id/submit-review`
- Body: `{ gerou_entrega: boolean, delivery_details?: { delivery_address, items, total_amount, payment_method }, rejection_details?: [{ product_name, reason, notes }], reviewed_by?: string }`
- Response: `{ success: true, delivery_id: number, review_status: 'reviewed' }`

### `GET /api/deliveries/rejection-metrics`
- Response: `{ total_rejections: number, by_reason: { [reason: string]: number }, by_product: [{ product_name: string, count: number, main_reason: string }] }`
