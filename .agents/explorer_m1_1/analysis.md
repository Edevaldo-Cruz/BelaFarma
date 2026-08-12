# Technical Analysis: M1 Database Schema & Data Models Update

## 1. Executive Summary
This analysis details the database schema and TypeScript interface updates required for **Milestone 1 (M1)** of the WhatsApp Interactive Audit System.
The updates enable storing AI-extracted chat audit metrics (`review_status`, `is_new_customer`, `chat_duration_seconds`, `chat_message_count`, `discussed_products_json`, `rejection_details_json`, `reviewed_by`, `reviewed_at`) in the `deliveries` table and record granular product rejection reasons in a dedicated `chat_product_rejections` table.

---

## 2. Source Code Examination

### 2.1 `backend/database.js`
- **File Path**: `f:\Documentos\Desenvolvimento\BelaFarma\backend\database.js`
- **Context**:
  - The SQLite database uses `better-sqlite3` and WAL mode (line 14).
  - Schema creation and column migrations occur inside `createTables()` (lines 17-1432).
  - The `deliveries` table creation is at lines 1279–1295.
  - Previous migrations for `deliveries` (`sale_closed`, `unclosed_reason`, indexes) are located at lines 1296–1308.
- **Modification Target**: Lines 1308–1309 in `backend/database.js`.

### 2.2 `types.ts`
- **File Path**: `f:\Documentos\Desenvolvimento\BelaFarma\types.ts`
- **Context**:
  - Defines shared domain models and interfaces for both frontend React components and backend service typing.
  - `DeliveryStatus` and `Delivery` interface are located at lines 542–559.
  - End of file is line 579.
- **Modification Target**:
  1. Update `Delivery` interface (lines 544–559).
  2. Append new exported interfaces (`PendingReview`, `ProductRejection`, `RejectionMetrics`) starting at line 580.

---

## 3. Implementation Details for Worker

### 3.1 `backend/database.js` Changes

Insert the following migration code directly after line 1308 (`console.log('✅ Tabela deliveries atualizada...');`):

```js
    // M1: Interactive WhatsApp Audit System - deliveries table migrations
    try { db.exec('ALTER TABLE deliveries ADD COLUMN review_status TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE deliveries ADD COLUMN is_new_customer INTEGER DEFAULT 0'); } catch(e) {}
    try { db.exec('ALTER TABLE deliveries ADD COLUMN chat_duration_seconds INTEGER DEFAULT 0'); } catch(e) {}
    try { db.exec('ALTER TABLE deliveries ADD COLUMN chat_message_count INTEGER DEFAULT 0'); } catch(e) {}
    try { db.exec('ALTER TABLE deliveries ADD COLUMN discussed_products_json TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE deliveries ADD COLUMN rejection_details_json TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE deliveries ADD COLUMN reviewed_by TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE deliveries ADD COLUMN reviewed_at DATETIME'); } catch(e) {}
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_deliveries_review_status ON deliveries(review_status)');
    } catch(e) {}

    // M1: Create chat_product_rejections table for product rejection tracking
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_product_rejections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        delivery_id INTEGER,
        phone TEXT,
        product_name TEXT,
        reason TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_cpr_delivery ON chat_product_rejections(delivery_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cpr_phone ON chat_product_rejections(phone)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cpr_reason ON chat_product_rejections(reason)');
    } catch (e) {}
    console.log('✅ Tabela chat_product_rejections e colunas de auditoria em deliveries verificadas/criadas!');
```

### 3.2 `types.ts` Changes

#### Step 1: Update `Delivery` interface (Lines 544–559)
Replace `Delivery` interface with:

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
  sale_closed?: number; // 1 = Fechado, 0 = Não Fechado
  unclosed_reason?: string; // Preço Alto, Falta de Estoque, Sem Resposta, etc.
  last_message_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Audit & Review fields (M1)
  review_status?: string; // 'pending' | 'reviewed' | 'dismissed'
  is_new_customer?: number; // 1 = Novo cliente, 0 = Cliente recorrente
  chat_duration_seconds?: number;
  chat_message_count?: number;
  discussed_products_json?: string;
  rejection_details_json?: string;
  reviewed_by?: string;
  reviewed_at?: string;
}
```

#### Step 2: Append new interfaces at the bottom of `types.ts` (Line 580)

```ts
export interface PendingReview {
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

export interface ProductRejection {
  id?: number;
  delivery_id?: number | string;
  phone?: string;
  product_name: string;
  reason: string;
  notes?: string;
  created_at?: string;
}

export interface RejectionMetrics {
  total_rejections: number;
  by_reason: Record<string, number>;
  by_product: Array<{
    product_name: string;
    count: number;
    main_reason: string;
  }>;
}
```

---

## 4. Verification Method
1. Execute Node initialization of `backend/database.js` (e.g. `node -e "require('./backend/database.js')"` or running backend server) to verify database schema migrations execute cleanly without SQLite syntax or pragma errors.
2. Run `PRAGMA table_info(deliveries);` and `PRAGMA table_info(chat_product_rejections);` on SQLite database to verify all 8 new columns and the new table exist.
3. Run `npx tsc --noEmit` to verify TypeScript type compliance.
