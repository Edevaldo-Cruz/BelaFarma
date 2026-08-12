# Handoff Report — Milestone 2 (M2) Review

## 1. Observation
- **Reviewed Target Files**:
  - `backend/delivery-endpoints.js` (lines 128–336)
  - `backend/services/whatsapp-delivery-service.js` (lines 34–77, 269–440)
  - `backend/database.js` (lines 1310–1340)
  - `backend/test_m2_verification.js` (lines 1–218)
- **Specific Code Observations**:
  1. `POST /api/deliveries/:id/submit-review` (`backend/delivery-endpoints.js`, lines 220–256):
     ```javascript
     // Step 1: UPDATE deliveries committed OUTSIDE transaction
     db.prepare(`UPDATE deliveries SET sale_closed = 0, status = 'Nao_Fechado', review_status = 'reviewed', ... WHERE id = ?`).run(...);

     // Step 2: Separate transaction for chat_product_rejections
     if (rejectionsArr.length > 0) {
       db.transaction(() => {
         for (const rej of rejectionsArr) {
           insertRejection.run(id, existing.phone, rej.product_name, rej.reason, rej.notes);
         }
       })();
     }
     ```
  2. `GET /api/deliveries/rejection-metrics` (`backend/delivery-endpoints.js`, lines 305–316):
     ```sql
     SELECT product_name, COUNT(*) as count, reason as main_reason
     FROM chat_product_rejections
     WHERE product_name IS NOT NULL AND product_name != ''
     GROUP BY product_name
     ORDER BY count DESC
     LIMIT 50
     ```
     `reason as main_reason` is selected without an aggregate function in `GROUP BY product_name`.
  3. `GET /api/deliveries/rejection-metrics` Fallback Count (`backend/delivery-endpoints.js`, lines 276–303):
     `total_rejections` is calculated via `SELECT COUNT(*) FROM chat_product_rejections`. If 0, fallback calculates `by_reason` from `deliveries.unclosed_reason`, but leaves `total_rejections` at `0`.
  4. Input Validation Gaps (`backend/delivery-endpoints.js`, lines 180–215):
     - `gerou_entrega` is not type-checked (`typeof gerou_entrega !== 'boolean'`); missing or non-boolean values silently default to false (`sale_closed = 0`).
     - `parseFloat(details.total_amount)` with non-numeric string returns `NaN`, causing better-sqlite3 to throw a 500 error instead of returning 400 Bad Request.
     - `rejection_details` array elements are not checked for `null` or non-object values, throwing `TypeError` during iteration.

## 2. Logic Chain
1. **Transaction & Atomicity Risk**:
   - In `POST /api/deliveries/:id/submit-review`, updating `deliveries` before opening the transaction for `chat_product_rejections` breaks database atomicity. If insertion fails (e.g. malformed item in `rejection_details`), `deliveries` remains updated with `review_status = 'reviewed'`, removing it from the pending review queue while 0 rejection records are saved.
2. **SQL Aggregation Error**:
   - In SQLite, selecting an unaggregated column (`reason as main_reason`) under `GROUP BY product_name` yields an arbitrary row's value rather than the true statistical mode (most frequent reason) for that product.
3. **Metric Output Inconsistency**:
   - When no `chat_product_rejections` exist, `by_reason` is populated from `deliveries`, but `total_rejections` remains `0`, returning `{ total_rejections: 0, by_reason: { "Preço Alto": 5 } }`.
4. **Input Validation & Resilience**:
   - Lack of parameter type checks (`typeof gerou_entrega === 'boolean'`, `isNaN(total_amount)`, `rej && typeof rej === 'object'`) exposes the API to HTTP 500 exceptions on bad client inputs instead of standard HTTP 400 Bad Request responses.

## 3. Caveats
- No code cheating or hardcoded test facades were found; implementations query real SQLite tables.
- Gemini/OpenAI prompt extraction in `whatsapp-delivery-service.js` correctly includes `products_discussed` JSON array.
- Database schema in `database.js` correctly defines `chat_product_rejections` table and delivery audit columns.

## 4. Conclusion
**Verdict: REQUEST_CHANGES**

### Required Modifications:
1. **Transaction Safety**: Wrap both `UPDATE deliveries` and `chat_product_rejections` insertions (plus `DELETE FROM chat_product_rejections WHERE delivery_id = ?` to handle re-submissions safely) inside a single `db.transaction(...)` block.
2. **SQL Aggregation Correctness**: Update `GET /api/deliveries/rejection-metrics` top product query to determine the true `main_reason` per product.
3. **Fallback Metrics Alignment**: When `chat_product_rejections` is empty and fallback is used, calculate `total_rejections` as the sum of fallback counts or total unclosed deliveries.
4. **Input Validation**: Add HTTP 400 validation in `POST /api/deliveries/:id/submit-review` for `gerou_entrega` (must be boolean), `total_amount` (numeric check), and `rejection_details` array element objects.

## 5. Verification Method
- Run `node backend/test_m2_verification.js`.
- Add test assertions to `test_m2_verification.js` for:
  - Atomic rollback when rejection insert fails.
  - Correct `main_reason` returned when a product has multiple rejection reasons.
  - HTTP 400 Bad Request on invalid input parameters.
  - Re-submitting a review replaces previous rejection items instead of duplicating them.

---

# Detailed Review Findings

### [Major] Finding 1: Transaction Safety & Atomicity Violation in Review Submission
- **Where**: `backend/delivery-endpoints.js`, lines 220–256
- **Why**: `UPDATE deliveries` executes before `db.transaction(...)` for inserting into `chat_product_rejections`. A failure during insertion leaves `deliveries` updated with `review_status = 'reviewed'`, but no rejection rows created.
- **Suggestion**: Combine `UPDATE deliveries` and `INSERT INTO chat_product_rejections` into a single transaction block.

### [Major] Finding 2: Non-deterministic `main_reason` in Rejection Metrics Query
- **Where**: `backend/delivery-endpoints.js`, lines 305–316
- **Why**: `SELECT product_name, COUNT(*) as count, reason as main_reason ... GROUP BY product_name` returns an arbitrary `reason` value in SQLite rather than the mode/most common reason.
- **Suggestion**: Use a subquery or window function/grouping to select the most frequent `reason` for each product.

### [Minor] Finding 3: `total_rejections` Inconsistency in Fallback Mode
- **Where**: `backend/delivery-endpoints.js`, lines 276–303
- **Why**: `total_rejections` remains 0 when `by_reason` fallback is triggered.
- **Suggestion**: Update `total_rejections` to equal `sum(by_reason values)` during fallback execution.

### [Minor] Finding 4: Insufficient Input Validation in `submit-review` Endpoint
- **Where**: `backend/delivery-endpoints.js`, lines 180–215
- **Why**: Missing boolean check for `gerou_entrega`, `NaN` handling for `total_amount`, and null element checks in `rejection_details` array cause HTTP 500 errors on invalid client payloads.
- **Suggestion**: Add strict parameter validation and return HTTP 400 with a descriptive error message on validation failure.

### [Minor] Finding 5: Accumulation of Duplicate Rejections on Review Re-submission
- **Where**: `backend/delivery-endpoints.js`, lines 240–256
- **Why**: Re-submitting a review inserts new rows into `chat_product_rejections` without removing existing records for the `delivery_id`.
- **Suggestion**: Execute `DELETE FROM chat_product_rejections WHERE delivery_id = ?` within the transaction before inserting new rejection entries.

---

# Verified Claims & Integrity Check

- [x] Integrity Violation Check → PASSED (No hardcoded responses, fake outputs, or facade functions found).
- [x] AI Prompt & Metrics Extraction → PASSED (Prompts in `whatsapp-delivery-service.js` extract `products_discussed` array properly).
- [x] Table Schema Verification → PASSED (`chat_product_rejections` and `deliveries` audit columns exist in `database.js`).
