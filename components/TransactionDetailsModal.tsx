import React from 'react';
import { X, CheckCircle } from 'lucide-react';
import { Order, Boleto, BoletoStatus, FixedAccount } from '../types';

type VirtualTransaction = Order | Boleto | (FixedAccount & { isFixed: true, targetDate: string });

interface TransactionDetailsModalProps {
  transaction: VirtualTransaction;
  onClose: () => void;
  onUpdateStatus: (boletoId: string, status: BoletoStatus) => void;
}

const isBoleto = (transaction: VirtualTransaction): transaction is Boleto => {
  return 'due_date' in transaction && !('isFixed' in transaction);
};

const isFixed = (transaction: VirtualTransaction): transaction is (FixedAccount & { isFixed: true, targetDate: string }) => {
    return 'isFixed' in transaction;
}

export const TransactionDetailsModal: React.FC<TransactionDetailsModalProps> = ({ transaction, onClose, onUpdateStatus }) => {
  const canBePaid = isBoleto(transaction) && transaction.status !== BoletoStatus.PAGO;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-slate-900 dark:text-white">
          <h2 className="text-lg font-black uppercase tracking-tight">Detalhes do Registro</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-600 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6 space-y-4 text-slate-700 dark:text-slate-300 font-medium">
          {isBoleto(transaction) ? (
            <>
              <p><strong className="text-slate-900 dark:text-slate-100">Fornecedor:</strong> {transaction.supplierName}</p>
              <p><strong className="text-slate-900 dark:text-slate-100">Valor:</strong> {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(transaction.value)}</p>
              <p><strong className="text-slate-900 dark:text-slate-100">Status:</strong> {transaction.status}</p>
              <p><strong className="text-slate-900 dark:text-slate-100">Data de Vencimento:</strong> {new Date(transaction.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
              {transaction.invoice_number && <p><strong className="text-slate-900 dark:text-slate-100">Nº da Nota Fiscal:</strong> {transaction.invoice_number}</p>}
            </>
          ) : isFixed(transaction) ? (
            <>
              <p><strong className="text-slate-900 dark:text-slate-100">Nome da Conta:</strong> {transaction.name}</p>
              <p><strong className="text-slate-900 dark:text-slate-100">Valor Estimado:</strong> {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(transaction.value)}</p>
              <p><strong className="text-slate-900 dark:text-slate-100">Periodicidade:</strong> Mensal Recorrente</p>
              <p><strong className="text-slate-900 dark:text-slate-100">Dia de Vencimento:</strong> Dia {transaction.dueDay.toString().padStart(2, '0')}</p>
              <p><strong className="text-slate-900 dark:text-slate-100">Projeção para:</strong> {new Date(transaction.targetDate + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs rounded-xl font-bold uppercase tracking-widest border border-blue-100 dark:border-blue-900/30">
                Lançamento automático de conta fixa
              </div>
            </>
          ) : (
             <>
              <p><strong className="text-slate-900 dark:text-slate-100">Distribuidora:</strong> {transaction.distributor}</p>
              <p><strong className="text-slate-900 dark:text-slate-100">Valor Total:</strong> {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(transaction.totalValue)}</p>
              <p><strong className="text-slate-900 dark:text-slate-100">Status:</strong> {transaction.status}</p>
              <p><strong className="text-slate-900 dark:text-slate-100">Data do Pedido:</strong> {new Date(transaction.orderDate).toLocaleDateString('pt-BR')}</p>
              <p><strong className="text-slate-900 dark:text-slate-100">Previsão de Chegada:</strong> {new Date(transaction.arrivalForecast).toLocaleDateString('pt-BR')}</p>
            </>
          )}
        </div>
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/10 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <button onClick={onClose} className="px-4 py-2 text-sm font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all">
            Fechar
          </button>
          {canBePaid && (
            <button
              onClick={() => onUpdateStatus(transaction.id, BoletoStatus.PAGO)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
            >
              <CheckCircle className="w-4 h-4" />
              Marcar como Pago
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
