# Milestone 3 Analysis Report: Frontend Queue & Visual Alerts

## Executive Summary
This report analyzes the implementation plan for **Milestone 3 (M3 - Frontend Queue & Visual Alerts)** of the WhatsApp Interactive Audit System for BelaFarma. Milestone 3 connects the backend endpoints implemented in M2 (`GET /api/deliveries/pending-reviews`) to the React frontend UI, providing real-time visual alert badges in navigation and dashboard, as well as an interactive inbox queue ("Revisões Pendentes") in `DeliveryWidget.tsx`.

---

## 1. Problem & Architecture Overview

### Goal
Provide real-time visibility and an organized inbox queue for WhatsApp customer chats flagged by AI scanner for manual review (e.g. idle/cold chats where sales were unclosed or need validation).

### Key Components Investigated
1. `types.ts` — Core data structures (`Delivery`, `PendingReview`, `RejectionMetrics`, `ProductRejection`).
2. `components/Sidebar.tsx` — Main navigation sidebar with badges for notifications and section alerts.
3. `components/Dashboard.tsx` — System dashboard KPI cards and overview.
4. `components/DeliveryWidget.tsx` — Delivery management and WhatsApp audit widget.
5. `components/DeliveriesPage.tsx` — Container page wrapping `DeliveryWidget`.
6. `App.tsx` — Top-level state and routing container.
7. `backend/delivery-endpoints.js` — Backend REST API endpoints serving `/api/deliveries/pending-reviews`.

---

## 2. Component Analysis & Implementation Strategy

### Component 1: `types.ts` (Interface Alignment)
- **Current Observation**:
  - `Delivery` (lines 544–568) and `PendingReview` (lines 589–612) contain `review_status`, `is_new_customer`, `chat_duration_seconds`, `chat_message_count`, `discussed_products_json`, `rejection_details_json`, `reviewed_by`, `reviewed_at`.
  - Field `wa_name?: string;` (returned by SQL JOIN in `delivery-endpoints.js` line 132) is missing from TypeScript interface definitions.
- **Proposed Alignment**:
  - Add `wa_name?: string;` to both `Delivery` and `PendingReview` interfaces.

---

### Component 2: `components/Sidebar.tsx` (Visual Badge Alert)
- **Current Observation**:
  - Sidebar renders navigation items (`menuItems`, line 120-159), including `{ id: 'deliveries', label: 'Pedidos & Entregas', icon: Truck }`.
  - Side effects fetch overdue debtors (`/api/debtors-report`) and iFood notifications (`/api/ifood-sales/notifications`) on interval timers.
- **Proposed Changes**:
  1. Add `pendingReviewCount` state (`const [pendingReviewCount, setPendingReviewCount] = React.useState(0);`).
  2. Add `useEffect` polling `GET /api/deliveries/pending-reviews` (every 30 seconds and on mount).
  3. Render count badge on the `deliveries` menu item when `pendingReviewCount > 0`:
     ```tsx
     {item.id === 'deliveries' && pendingReviewCount > 0 && (
       <span className="ml-auto flex h-5 min-w-5 items-center justify-center px-1.5 bg-amber-500 rounded-full text-[10px] font-black text-slate-950 animate-pulse shadow-sm" title={`${pendingReviewCount} conversas aguardando revisão`}>
         {pendingReviewCount}
       </span>
     )}
     ```

---

### Component 3: `components/Dashboard.tsx` (Dashboard Alert & KPI Card)
- **Current Observation**:
  - Renders top KPI grid (lines 855–955) for metrics such as Ticket Médio, Total de Tickets, Pedidos em Atraso, etc.
- **Proposed Changes**:
  1. Add `pendingReviewCount` state and `useEffect` fetching `GET /api/deliveries/pending-reviews`.
  2. **Banner Alert** (Top of Dashboard): If `pendingReviewCount > 0`, render an attention-grabbing alert banner:
     - Text: `"📥 Existem ${pendingReviewCount} conversas do WhatsApp aguardando sua revisão manual."`
     - Action button: `"Ver Fila de Revisão →"` calling `onNavigate('deliveries')`.
  3. **KPI Card**: Add a dedicated KPI card in the KPI grid:
     - Title: `Revisões Pendentes (IA)`
     - Value: `${pendingReviewCount}`
     - Subtitle: `Conversas para auditar`
     - Clicking card calls `onNavigate('deliveries')`.

---

### Component 4: `components/DeliveryWidget.tsx` (Inbox Queue & Cards)
- **Current Observation**:
  - Renders single table view of deliveries filtered by period, closed status, and search query.
  - Calls `GET /api/deliveries`.
- **Proposed Changes**:
  1. **Tab Bar Header**:
     - Introduce two sub-tabs at the top of the widget:
       - Tab 1: `📥 Fila de Revisões Pendentes` (with count badge `pendingCount`)
       - Tab 2: `🛵 Histórico & Auditoria de Entregas` (existing table view)
  2. **Fetch Logic**:
     - Create `fetchPendingReviews` calling `GET /api/deliveries/pending-reviews`.
     - Update state: `pendingReviews: PendingReview[]`, `pendingCount: number`, `pendingLoading: boolean`.
     - Automatically poll or re-fetch on tab switch.
  3. **Pending Review Card Inbox Grid**:
     - When `activeTab === 'pending_reviews'`:
       - If empty (`pendingReviews.length === 0`), render friendly empty state (`"Nenhuma conversa aguardando revisão manual no momento 🎉"`).
       - Render a grid of cards (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3`).
  4. **Card UI Layout & Extracted Metrics**:
     - **Customer Header**: Name (`wa_name || customer_name || phone`), phone number, date/time string.
     - **AI Metrics Badges**:
       - `is_new_customer === 1`: `🆕 Cliente Novo` (emerald badge) vs `👤 Cliente Recorrente` (blue badge).
       - `chat_duration_seconds`: Formatted duration (e.g. `3 min` or `45s`).
       - `chat_message_count`: Message count (`12 msgs`).
       - `total_amount`: Estimated value (`R$ 45,90`).
     - **Produtos Discutidos**:
       - Safe JSON parser for `discussed_products_json`.
       - Render product tags (e.g. `Dipirona 500mg`, `Dorflex`).
     - **Action Trigger Button**:
       - `"📝 Revisar Atendimento"`
       - Triggers `onSelectPendingReview(item)` (ready for M4 modal integration).

---

## 3. UI Rules Compliance Verification

| Rule | Requirement | Verification Plan |
|---|---|---|
| **Language** | Portuguese (`pt-BR`) | All labels, titles, badges, and empty states in Portuguese (`pt-BR`). |
| **No `alert()`** | Must use toasts or inline modals | Use `useToast().addToast()` for notifications. No `alert()` allowed. |
| **Mobile Header Layout** | Row 1 logo, row 2 menu + search | Mobile header in `MobileHeader.tsx` untouched and compliant. Responsive design testing on mobile screens. |
| **Tailwind & Dark Mode** | Consistent dark slate theme | Use `dark:bg-slate-900`, `dark:border-slate-800`, `text-slate-100`, `bg-amber-500/10` style tokens. |

---

## 4. Architectural Verification Matrix

```
[Backend: WhatsApp AI Scanner (M2)]
       │ (Sets review_status = 'pending_review')
       ▼
[SQLite DB: deliveries table]
       │
       ├───────────────────────────────────────────────┐
       ▼                                               ▼
GET /api/deliveries/pending-reviews           GET /api/deliveries
       │                                               │
       ├───────────────────────┬───────────────────────┤
       ▼                       ▼                       ▼
[Sidebar.tsx Badge]   [Dashboard.tsx Banner]  [DeliveryWidget.tsx Inbox Queue]
(Badge count)         (Alert & KPI card)       (Cards with AI metrics & trigger)
```

---

## 5. Implementation Roadmap for Worker Agent

1. **Step 1 (`types.ts`)**: Update interfaces `Delivery` and `PendingReview` with `wa_name?: string;`.
2. **Step 2 (`Sidebar.tsx`)**: Implement `pendingReviewCount` state, fetch hook, and badge on `deliveries` menu item.
3. **Step 3 (`Dashboard.tsx`)**: Implement `pendingReviewCount` state, banner alert, and KPI card.
4. **Step 4 (`DeliveryWidget.tsx`)**: Implement tab switcher (`pending_reviews` vs `all_deliveries`), pending reviews fetcher, and pending review inbox card rendering with AI metrics and action trigger.
5. **Step 5 (`DeliveriesPage.tsx` / `App.tsx`)**: Wire up callback props `onSelectPendingReview`.
6. **Step 6 (Verification)**: Execute `npm run build` or `npx tsc --noEmit` build verification.
