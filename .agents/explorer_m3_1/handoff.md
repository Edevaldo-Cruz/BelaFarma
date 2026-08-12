# Handoff Report: Milestone 3 (Frontend Queue & Visual Alerts)

## 1. Observation

### Exact Locations and Verbatim Code Snippets

1. **`types.ts` (lines 544–568 & 589–612)**:
   ```ts
   export interface Delivery {
     id: string;
     phone: string;
     customer_name?: string;
     delivery_address?: string;
     items?: string;
     total_amount: number;
     payment_method?: string;
     status: DeliveryStatus;
     sale_closed?: number;
     unclosed_reason?: string;
     last_message_id?: string;
     notes?: string;
     created_at: string;
     updated_at: string;
     review_status?: string;
     is_new_customer?: number;
     chat_duration_seconds?: number;
     chat_message_count?: number;
     discussed_products_json?: string;
     rejection_details_json?: string;
     reviewed_by?: string;
     reviewed_at?: string;
   }
   ```
   *Observation*: Field `wa_name?: string;` returned by backend SQL query (`COALESCE(wc.name, wc.pushName) as wa_name`) is not currently declared on `Delivery` or `PendingReview`.

2. **`components/Sidebar.tsx` (lines 146 & 401–405)**:
   ```tsx
   { id: 'deliveries', label: 'Pedidos & Entregas', icon: Truck },
   // ...
   {item.id === 'debtors-report' && hasOverdue && (
     <span className="ml-auto w-2 h-2 bg-red-600 rounded-full animate-pulse shadow-sm" title="Existem clientes com pagamento atrasado" />
   )}
   ```
   *Observation*: `Sidebar.tsx` uses interval polling `useEffect` hooks for notifications (e.g. `debtors-report` and `ifood-sales`). It lacks a pending reviews badge for the `deliveries` menu item.

3. **`components/Dashboard.tsx` (lines 855–955)**:
   *Observation*: The KPI grid displays stats for Ticket Médio, Tickets, Vencimentos, Pedidos em Atraso, Distribuidora Ativa, and Total de Pedidos. It lacks a visual alert banner and KPI card for pending WhatsApp audit reviews.

4. **`components/DeliveryWidget.tsx` (lines 1–754)**:
   *Observation*: Contains single-view table of deliveries with period/closed filters. It currently lacks a sub-tab view or inbox queue for displaying pending review cards from `GET /api/deliveries/pending-reviews`.

5. **`backend/delivery-endpoints.js` (lines 128–148)**:
   ```javascript
   app.get('/api/deliveries/pending-reviews', (req, res) => {
     const sql = `
       SELECT d.*, COALESCE(wc.name, wc.pushName) as wa_name
       FROM deliveries d
       LEFT JOIN whatsapp_contacts wc ON wc.id = d.phone || '@s.whatsapp.net'
       WHERE d.review_status = 'pending_review'
       ORDER BY d.created_at DESC
     `;
     const pendingReviews = db.prepare(sql).all();
     res.json({
       success: true,
       count: pendingReviews.length,
       pending_reviews: pendingReviews
     });
   });
   ```
   *Observation*: The backend endpoint is ready and returns `{ success: true, count: N, pending_reviews: [...] }`.

---

## 2. Logic Chain

1. **Data Model**: SQL query in `delivery-endpoints.js` fetches deliveries with `review_status = 'pending_review'`.
2. **Interface Alignment**: Declaring `wa_name?: string;` in `types.ts` ensures TypeScript type safety across frontend components when processing records from `/api/deliveries/pending-reviews`.
3. **Navigation Alerting**: By adding `pendingReviewCount` state and a 30-second polling `useEffect` in `Sidebar.tsx`, the menu item `deliveries` can show an animated badge whenever `pendingReviewCount > 0`.
4. **Dashboard Alerting**: Fetching `/api/deliveries/pending-reviews` in `Dashboard.tsx` allows rendering a prominent alert banner at the top of the dashboard and a dedicated KPI card in the statistics grid, providing instant entry points to the pending queue.
5. **Inbox Queue UI**: Updating `DeliveryWidget.tsx` to include sub-tabs (`📥 Revisões Pendentes` vs `🛵 Histórico & Auditoria`) enables attendants to view pending review cards rendered with customer information, AI-extracted metrics (Cliente Novo badge, Chat Duration, Message Count, Discussed Products list), and an action button ("Revisar Atendimento").

---

## 3. Caveats

- No source code files were modified during this exploration stage (strictly read-only).
- In Milestone 3, clicking "Revisar Atendimento" triggers the `onSelectPendingReview` callback handler. The full interactive questionnaire modal (`PendingReviewModal.tsx`) will be fully implemented and connected to `POST /api/deliveries/:id/submit-review` in Milestone 4 (M4).
- Polling interval set to 30 seconds ensures low overhead while keeping visual badges in sync.

---

## 4. Conclusion & Concrete Implementation Steps for Worker

The implementation plan for Milestone 3 (M3) consists of the following 5 tasks:

### Task 1: TypeScript Interface Alignment (`types.ts`)
- Add `wa_name?: string;` to `Delivery` and `PendingReview` interfaces in `types.ts`.

### Task 2: Visual Alert Badge in Navigation (`components/Sidebar.tsx`)
- Add state `pendingReviewCount: number`.
- Add `useEffect` fetching `GET /api/deliveries/pending-reviews` on mount and every 30 seconds.
- Render badge next to `{ id: 'deliveries' }` in `Sidebar.tsx` when `pendingReviewCount > 0`.

### Task 3: Visual Alert Banner & KPI Card in Dashboard (`components/Dashboard.tsx`)
- Add state `pendingReviewCount: number` and fetch `GET /api/deliveries/pending-reviews`.
- Render alert banner if `pendingReviewCount > 0` with button calling `onNavigate('deliveries')`.
- Add "Revisões Pendentes" KPI card to the top stats grid.

### Task 4: "Revisões Pendentes" Inbox Queue & Cards (`components/DeliveryWidget.tsx`)
- Add tab switcher (`activeTab`: `'pending_reviews' | 'all_deliveries'`).
- Fetch `GET /api/deliveries/pending-reviews` into `pendingReviews` state.
- Render Pending Review cards with:
  - Customer details (`wa_name || customer_name || phone`).
  - AI Metric badges: `is_new_customer === 1` badge ("Cliente Novo 🆕" / "Cliente Recorrente 👤"), duration (`chat_duration_seconds`), message count (`chat_message_count`), discussed products (`discussed_products_json`).
  - Action trigger button ("📝 Revisar Atendimento") calling `onSelectPendingReview`.

### Task 5: Parent Component Wiring (`components/DeliveriesPage.tsx` & `App.tsx`)
- Accept and pass `onSelectPendingReview` prop from `App.tsx` down through `DeliveriesPage.tsx` to `DeliveryWidget.tsx`.

---

## 5. Verification Method

To verify the implementation after code changes:

1. **TypeScript Build Verification**:
   Run TypeScript compiler / Vite build to confirm zero type errors:
   ```powershell
   npx tsc --noEmit
   ```
2. **Visual & UI Verification**:
   - Check `Sidebar.tsx` badge rendering for pending reviews.
   - Check `Dashboard.tsx` banner and KPI card.
   - Switch to `DeliveriesPage` and verify `DeliveryWidget.tsx` sub-tabs ("Revisões Pendentes" vs "Histórico").
   - Inspect pending review cards for correct display of AI metrics (Cliente Novo, Duração, Qtd Mensagens, Produtos Discutidos).
   - Ensure compliance with global rules (pt-BR language, no `alert()`, toast notifications).
