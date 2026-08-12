# Detailed Analysis & Implementation Specification: Milestone 4 (PendingReviewModal)

## Executive Summary
This document outlines the concrete architectural specification and implementation plan for `components/PendingReviewModal.tsx` and its integration within BelaFarma's WhatsApp Audit System (Milestone 4). The interactive questionnaire modal allows pharmacy attendants to process idle/cold WhatsApp conversations queued in "Revisão Pendente". Attendants choose between "SIM" (confirm delivery details) and "NÃO" (fill rejection questionnaire for discussed products), submitting structured metrics to the backend API (`POST /api/deliveries/:id/submit-review`), triggering toast feedback, closing the modal, and optimistically removing the item from the pending queue.

---

## 1. Codebase Audit & Integration Context

### 1.1 Key Codebase Files Examined

| File Path | Role & Relevant Functionality |
|-----------|--------------------------------|
| `types.ts` | Declares `Delivery`, `PendingReview`, `ProductRejection`, `RejectionMetrics`, `DeliveryStatus`. Includes M1 fields (`review_status`, `is_new_customer`, `chat_duration_seconds`, `chat_message_count`, `discussed_products_json`, `rejection_details_json`, `reviewed_by`, `reviewed_at`). |
| `backend/delivery-endpoints.js` | Endpoint `POST /api/deliveries/:id/submit-review` handling atomic SQLite updates (`deliveries` and `chat_product_rejections` tables). Expects `{ gerou_entrega, delivery_details?, rejection_details?, unclosed_reason?, reviewed_by? }`. |
| `backend/database.js` | SQLite table definitions (`deliveries`, `chat_product_rejections`, `whatsapp_contacts`). |
| `components/ToastContext.tsx` | Provides `useToast()` hook with `addToast(message, type)`. |
| `components/DeliveryWidget.tsx` | Displays pending review inbox cards (`pending_reviews` tab) and historical audit table (`all_deliveries` tab). Invokes `onSelectPendingReview(delivery)` callback. |
| `App.tsx` | Main application shell managing global state, view routing, toast notifications, and `selectedPendingReview` state. |

---

## 2. API Contract & Validation Requirements

### 2.1 Backend Endpoint: `POST /api/deliveries/:id/submit-review`

- **URL**: `/api/deliveries/:id/submit-review`
- **Method**: `POST`
- **Headers**: `Content-Type: application/json`

#### Request Payload — "SIM" Path (Gerou Entrega)
```json
{
  "gerou_entrega": true,
  "delivery_details": {
    "customer_name": "João Silva",
    "delivery_address": "Rua das Flores, 123 - Centro",
    "items": "Dipirona 500mg (2x), Amoxicilina 500mg (1x)",
    "total_amount": 45.50,
    "payment_method": "Pix",
    "notes": "Cliente solicitou entrega para o período da tarde"
  },
  "reviewed_by": "Atendente"
}
```

#### Request Payload — "NÃO" Path (Orçamento Não Fechado / Rejeição)
```json
{
  "gerou_entrega": false,
  "unclosed_reason": "Preço",
  "rejection_details": [
    {
      "product_name": "Dorflex 30 comprimidos",
      "reason": "Preço",
      "notes": "Cliente achou R$ 18,90 caro comparado à concorrente"
    },
    {
      "product_name": "Protetor Solar Sundown FPS 50",
      "reason": "Falta de Estoque",
      "notes": "Produto indisponível na filial no momento"
    }
  ],
  "reviewed_by": "Atendente"
}
```

#### Backend Response
```json
{
  "success": true,
  "delivery_id": "deliv_1723456789_abc12",
  "review_status": "reviewed",
  "delivery": { ... }
}
```

---

## 3. Detailed Component Architecture: `components/PendingReviewModal.tsx`

### 3.1 Props Interface & State Definition

```typescript
import React, { useState, useMemo } from 'react';
import {
  X,
  CheckCircle,
  XCircle,
  User,
  Phone,
  Clock,
  MessageSquare,
  Sparkles,
  MapPin,
  Package,
  DollarSign,
  CreditCard,
  FileText,
  AlertTriangle,
  Send,
  Loader2,
  Plus,
  Trash2
} from 'lucide-react';
import { Delivery, PendingReview } from '../types';
import { useToast } from './ToastContext';

export interface PendingReviewModalProps {
  delivery: Delivery | PendingReview;
  onClose: () => void;
  onSubmitSuccess?: (updatedDelivery: Delivery) => void;
  reviewerName?: string;
}

export interface RejectionItemState {
  id: string;
  product_name: string;
  reason: 'Preço' | 'Falta de Estoque' | 'Apenas Dúvida' | 'Outro';
  notes: string;
  selected: boolean;
}
```

### 3.2 Key Internal State Variables
- `gerouEntrega`: `boolean | null` (Initial state: `null` or `true`, requiring explicit selection or step confirmation).
- `isSubmitting`: `boolean` (Loading spinner indicator during API call).
- **"SIM" Form State**:
  - `customerName`: string (`delivery.customer_name || delivery.wa_name || ''`)
  - `deliveryAddress`: string (`delivery.delivery_address || ''`)
  - `items`: string (`delivery.items || ''`)
  - `totalAmount`: string/number (`delivery.total_amount || 0`)
  - `paymentMethod`: string (`delivery.payment_method || 'Pix'`)
  - `notes`: string (`delivery.notes || ''`)
- **"NÃO" Form State**:
  - `rejectionItems`: `RejectionItemState[]` (Extracted from `delivery.discussed_products_json`).
  - `primaryReason`: string (`'Preço'` | `'Falta de Estoque'` | `'Apenas Dúvida'` | `'Outro'`).
  - `generalNotes`: string (`''`).

---

## 4. UI/UX & Design Specification

### 4.1 Backdrop & Container
- **Backdrop**: `fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200`
- **Modal Box**: `bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200`

### 4.2 Modal Header
1. **Customer Title**:
   - `displayName = delivery.wa_name || delivery.customer_name || delivery.phone`
   - Secondary subtitle with phone number: `📞 delivery.phone`
2. **Customer Type Badge**:
   - `is_new_customer === 1` -> `<span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">🆕 Cliente Novo</span>`
   - `is_new_customer === 0` -> `<span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30">👤 Cliente Recorrente</span>`
3. **AI Extracted Metrics Summary Bar**:
   - Duração do Chat: `chat_duration_seconds` formatted as `Xm Ys` (e.g., `2m 15s`).
   - Mensagens Trocadas: `chat_message_count` (e.g., `14 msgs`).
4. **Close Button**: Top right `X` icon button triggering `onClose()`.

### 4.3 Primary Decision Toggle: "Gerou entrega?"
Two distinct action buttons displayed prominently at top of form body:

- **SIM (Entrega Realizada / Venda Fechada)**:
  - Active: `bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 border-2 border-emerald-500`
  - Inactive: `bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 border-2 border-transparent`
- **NÃO (Orçamento Perdido / Não Fechado)**:
  - Active: `bg-rose-600 text-white shadow-lg shadow-rose-600/30 border-2 border-rose-500`
  - Inactive: `bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 border-2 border-transparent`

---

### 4.4 Form Path 1: "SIM" (Entrega Confirmada)

Fields rendered inside a styled card container (`bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-2xl p-5 space-y-4`):

1. **Nome do Cliente**:
   - `<input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nome completo do cliente" className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-emerald-500 outline-none" />`
2. **Endereço de Entrega**:
   - `<input type="text" value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Rua, Número, Bairro, Ponto de Referência" className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-emerald-500 outline-none" />`
3. **Itens / Produtos Comprados**:
   - `<textarea value={items} onChange={e => setItems(e.target.value)} placeholder="Ex: Dipirona 500mg 2x, Dorflex 1x..." rows={2} className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-emerald-500 outline-none" />`
4. **Valor Total (R$) & Forma de Pagamento**:
   - Grid layout (2 columns on tablet/desktop):
     - **Valor (R$)**: `<input type="number" step="0.01" value={totalAmount} onChange={e => setTotalAmount(parseFloat(e.target.value) || 0)} className="w-full px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none" />`
     - **Forma de Pagamento**:
       ```html
       <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
         <option value="Pix">Pix</option>
         <option value="Dinheiro">Dinheiro</option>
         <option value="Cartão de Crédito">Cartão de Crédito</option>
         <option value="Cartão de Débito">Cartão de Débito</option>
         <option value="Boleto">Boleto</option>
         <option value="A combinar">A combinar</option>
       </select>
       ```
5. **Observações**:
   - `<textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Instruções de entrega ou troco..." rows={2} className="..." />`

---

### 4.5 Form Path 2: "NÃO" (Questionário de Rejeição de Produtos)

Fields rendered inside a styled card container (`bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-2xl p-5 space-y-4`):

1. **Pre-filled Product Rejection Questionnaire**:
   - Products are pre-populated by parsing `delivery.discussed_products_json`:
     ```typescript
     const initialProducts: RejectionItemState[] = useMemo(() => {
       if (!delivery.discussed_products_json) return [];
       try {
         const parsed = JSON.parse(delivery.discussed_products_json);
         const list = Array.isArray(parsed) ? parsed : [parsed];
         return list.map((p, idx) => ({
           id: `p_${idx}_${Date.now()}`,
           product_name: typeof p === 'string' ? p : p.name || p.product_name || 'Produto',
           reason: 'Preço',
           notes: '',
           selected: true
         }));
       } catch (e) {
         return [];
       }
     }, [delivery.discussed_products_json]);
     ```
   - Fallback if no products identified: displays default single product row `"Atendimento Geral / Não Especificado"`, plus a `+ Adicionar Produto Rejeitado` button.
2. **Per-Product Rejection Controls**:
   - Checkbox / Toggle for each product (`selected`).
   - Reason dropdown selector with options:
     - `"Preço"`
     - `"Falta de Estoque"`
     - `"Apenas Dúvida"`
     - `"Outro"`
   - Text input for specific notes (`notes`: string, e.g. "Achou por R$ 15 no concorrente Y").
3. **Motivo Principal da Não Venda**:
   - Select field (`primaryReason`) to establish `unclosed_reason` on the `deliveries` table.

---

## 5. Integration with App & DeliveryWidget

### 5.1 Submission Handler & Optimistic Update Flow

```typescript
const handleSubmitReview = async () => {
  if (gerouEntrega === null) {
    addToast('Por favor, informe se o atendimento gerou entrega (SIM ou NÃO).', 'warning');
    return;
  }

  setIsSubmitting(true);

  try {
    const payload = gerouEntrega
      ? {
          gerou_entrega: true,
          delivery_details: {
            customer_name: customerName.trim(),
            delivery_address: deliveryAddress.trim(),
            items: items.trim(),
            total_amount: Number(totalAmount) || 0,
            payment_method: paymentMethod,
            notes: notes.trim()
          },
          reviewed_by: reviewerName || 'Atendente'
        }
      : {
          gerou_entrega: false,
          unclosed_reason: primaryReason,
          rejection_details: rejectionItems
            .filter(item => item.selected && item.product_name.trim())
            .map(item => ({
              product_name: item.product_name.trim(),
              reason: item.reason,
              notes: item.notes.trim()
            })),
          reviewed_by: reviewerName || 'Atendente'
        };

    const res = await fetch(`/api/deliveries/${delivery.id}/submit-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (res.ok && data.success) {
      addToast('Revisão de atendimento concluída com sucesso!', 'success');
      onSubmitSuccess?.(data.delivery || { ...delivery, review_status: 'reviewed' });
      onClose();
    } else {
      throw new Error(data.error || 'Erro ao submeter revisão.');
    }
  } catch (err: any) {
    console.error('[PendingReviewModal] Erro ao submeter:', err);
    addToast(err.message || 'Erro ao conectar ao servidor.', 'error');
  } font-medium finally {
    setIsSubmitting(false);
  }
};
```

### 5.2 Optimistic Queue Removal in `DeliveryWidget.tsx` / `App.tsx`

When `onSubmitSuccess` fires:
1. `setPendingReviews(prev => prev.filter(item => item.id !== updatedDelivery.id))`
2. Refresh delivery metrics and history list (`fetchDeliveries()`).
3. Set `selectedPendingReview(null)` in `App.tsx`.

---

## 6. Verification Method & Compliance Checklist

### 6.1 Compliance Audit

| Requirement / Rule | Status | Implementation Mechanism |
|-------------------|--------|--------------------------|
| No `alert()` allowed | ✅ Verified | Uses `addToast` from `useToast()` hook. |
| Language Preference | ✅ Verified | All UI labels, toasts, and dropdowns in Portuguese (`pt-BR`). |
| Backdrop Styling | ✅ Verified | `backdrop-blur-sm bg-black/50` fixed overlay. |
| Dark Mode Support | ✅ Verified | Tailwind CSS `dark:bg-slate-900`, `dark:border-slate-800`, `dark:text-slate-100`. |
| Mobile Responsiveness | ✅ Verified | `max-h-[90vh] overflow-y-auto`, responsive grid (`grid-cols-1 sm:grid-cols-2`). |
