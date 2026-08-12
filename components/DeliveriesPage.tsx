import React from 'react';
import { DeliveryWidget } from './DeliveryWidget';
import { Delivery, View } from '../types';

interface DeliveriesPageProps {
  onNavigate?: (view: View) => void;
  onSelectPendingReview?: (delivery: Delivery, mode?: 'pedido' | 'cotacao') => void;
  reviewedDeliveryId?: string | null;
}

export const DeliveriesPage: React.FC<DeliveriesPageProps> = ({ onNavigate, onSelectPendingReview, reviewedDeliveryId }) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-3">
            <span>🛵</span> Gestão de Deliveries & Vendas Não Fechadas
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
            Auditoria automatizada por IA do WhatsApp: acompanhe vendas confirmadas, pedidos de entrega e orçamentos perdidos.
          </p>
        </div>
      </div>

      <DeliveryWidget 
        onOpenChat={(phone) => onNavigate && onNavigate('whatsapp-vendas')} 
        onSelectPendingReview={onSelectPendingReview}
        reviewedDeliveryId={reviewedDeliveryId}
      />
    </div>
  );
};
