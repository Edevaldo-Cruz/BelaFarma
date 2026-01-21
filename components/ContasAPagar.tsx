import React, { useState, useMemo } from 'react';
import { 
  DollarSign, 
  Filter, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  X,
  Save,
  Plus,
  Calendar as CalendarIcon
} from 'lucide-react';
import { Boleto, BoletoStatus, Order, MonthlyLimit, User } from '../types';
import { BoletoForm } from './BoletoForm';

interface ContasAPagarProps {
  user: User;
  boletos: Boleto[];
  orders: Order[];
  onUpdateBoletoStatus: (boletoId: string, status: BoletoStatus) => void;
  onAddBoleto: (boleto: Partial<Boleto> & { boletoFile?: File }) => void;
  monthlyLimits: MonthlyLimit[];
}

export const ContasAPagar: React.FC<ContasAPagarProps> = ({ user, boletos, orders, onUpdateBoletoStatus, onAddBoleto, monthlyLimits }) => {
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [isBoletoFormOpen, setIsBoletoFormOpen] = useState(false);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const getDueDateStatus = (dueDateStr: string): 'overdue' | 'due-today' | 'due-tomorrow' | 'default' => {
    const dueDate = new Date(dueDateStr);
    dueDate.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);

    if (dueDate < now) return 'overdue';
    if (dueDate.getTime() === now.getTime()) return 'due-today';
    if (dueDate.getTime() === tomorrow.getTime()) return 'due-tomorrow';
    
    return 'default';
  };

  const getEffectiveStatus = (boleto: Boleto): BoletoStatus => {
    const dueDate = new Date(boleto.due_date);
    dueDate.setHours(0, 0, 0, 0);
    
    if (boleto.status === BoletoStatus.PENDENTE && dueDate < now) {
      return BoletoStatus.VENCIDO;
    }
    return boleto.status;
  };
  
  const getOrderForBoleto = (boleto: Boleto): Order | undefined => {
    return orders.find(o => o.id === boleto.order_id);
  }

  const filteredBoletos = useMemo(() => {
    return boletos.filter(boleto => {
      const boletoDate = new Date(boleto.due_date);
      const matchesMonth = boletoDate.getMonth() === selectedMonth && boletoDate.getFullYear() === selectedYear;
      if (!matchesMonth) return false;

      const effectiveStatus = getEffectiveStatus(boleto);
      if (statusFilter === 'all') return true;
      return effectiveStatus === statusFilter;
    });
  }, [boletos, statusFilter, selectedMonth, selectedYear]);

  const totalOfMonth = useMemo(() => {
    return filteredBoletos.reduce((acc, b) => acc + b.value, 0);
  }, [filteredBoletos]);

  const currentMonthLimit = useMemo(() => {
    const limit = monthlyLimits.find(l => l.month === selectedMonth + 1 && l.year === selectedYear);
    return limit ? limit.limit : 0;
  }, [monthlyLimits, selectedMonth, selectedYear]);

  const getStatusBadge = (boleto: Boleto) => {
    const status = getEffectiveStatus(boleto);

    switch(status) {
      case BoletoStatus.PAGO:
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> Pago</span>;
      case BoletoStatus.VENCIDO:
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 animate-pulse"><AlertTriangle className="w-3.5 h-3.5" /> Vencido</span>;
      default: // Pendente
        const dueDateStatus = getDueDateStatus(boleto.due_date);
        if (dueDateStatus === 'due-today') {
           return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700"><Clock className="w-3.5 h-3.5" /> Vence Hoje</span>;
        }
        if (dueDateStatus === 'due-tomorrow') {
           return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700"><Clock className="w-3.5 h-3.5" /> Vence Amanhã</span>;
        }
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700"><Clock className="w-3.5 h-3.5" /> Pendente</span>;
    }
  };
  
  const totalPendente = useMemo(() => {
     return boletos
      .filter(b => getEffectiveStatus(b) === BoletoStatus.PENDENTE || getEffectiveStatus(b) === BoletoStatus.VENCIDO)
      .reduce((acc, b) => acc + b.value, 0);
  }, [boletos]);

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(selectedYear, i, 1);
    return { value: i, label: d.toLocaleString('pt-BR', { month: 'long' }) };
  });

  const handleSaveBoleto = (boleto: Partial<Boleto> & { boletoFile?: File }) => {
    onAddBoleto(boleto);
    setIsBoletoFormOpen(false);
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      {isBoletoFormOpen && (
        <BoletoForm
          user={user}
          onSave={handleSaveBoleto}
          onCancel={() => setIsBoletoFormOpen(false)}
          orders={orders}
        />
      )}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tighter leading-none">Contas a Pagar</h1>
          <p className="text-slate-500 font-medium text-sm">Gerenciamento de boletos e pagamentos.</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsBoletoFormOpen(true)}
            className="flex items-center gap-2 px-4 py-3 bg-red-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            Novo Boleto
          </button>
          <div className="p-4 bg-red-50 border-2 border-red-100 rounded-2xl text-right">
              <p className="text-[10px] font-black text-red-700/60 uppercase tracking-widest">Total em Aberto (Geral)</p>
              <p className="text-2xl font-black text-red-800 tracking-tighter">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPendente)}
              </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-4 bg-blue-50 border-2 border-blue-100 rounded-2xl text-right w-full">
            <div className="flex justify-between items-center">
              <p className="text-[10px] font-black text-blue-700/60 uppercase tracking-widest">Total do Mês</p>
              <p className="text-[10px] font-black text-blue-700/60 uppercase tracking-widest">Limite: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentMonthLimit)}</p>
            </div>
            <p className="text-2xl font-black text-blue-800 tracking-tighter">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalOfMonth)}
            </p>
            <div className="w-full bg-blue-200 rounded-full h-1.5 mt-2">
              <div 
                className="bg-blue-600 h-1.5 rounded-full" 
                style={{ width: `${currentMonthLimit > 0 ? Math.min((totalOfMonth / currentMonthLimit) * 100, 100) : 0}%` }}
              ></div>
            </div>
        </div>
        <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="relative w-full md:w-48">
            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select 
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
            >
              {monthOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label.toUpperCase()}</option>)}
            </select>
          </div>
          <div className="relative w-full md:w-32">
             <select 
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="relative w-full md:w-56">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select 
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Todos os Status</option>
              {Object.values(BoletoStatus).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fornecedor / NF</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Vencimento</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Situação</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Valor</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBoletos.map((boleto) => {
                const order = getOrderForBoleto(boleto);
                const dueDateStatus = getDueDateStatus(boleto.due_date);
                
                let rowClass = 'transition-colors group hover:bg-red-50/30';
                if (getEffectiveStatus(boleto) === BoletoStatus.VENCIDO) {
                    rowClass += ' bg-red-100/50';
                } else if (dueDateStatus === 'due-today') {
                    rowClass += ' bg-orange-100/50';
                } else if (dueDateStatus === 'due-tomorrow') {
                    rowClass += ' bg-yellow-100/50';
                }

                return (
                  <tr key={boleto.id} className={rowClass}>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className={`font-black uppercase group-hover:text-red-700 transition-colors tracking-tighter text-slate-900`}>{order?.distributor || 'N/A'}</span>
                        {boleto.invoice_number && (
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{boleto.invoice_number}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                        <span className={`text-sm font-bold text-slate-700`}>
                            {new Date(boleto.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </span>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(boleto)}</td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-black text-slate-900 text-base tracking-tighter">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(boleto.value)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center">
                        {getEffectiveStatus(boleto) !== BoletoStatus.PAGO && (
                            <button 
                                onClick={() => onUpdateBoletoStatus(boleto.id, BoletoStatus.PAGO)}
                                className="p-2 text-slate-300 bg-slate-50 border border-slate-200 hover:text-emerald-600 hover:bg-emerald-100 hover:border-emerald-200 rounded-xl transition-all" 
                                title="Marcar como Pago"
                            >
                                <CheckCircle2 className="w-4 h-4" />
                            </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredBoletos.length === 0 && (
            <div className="py-16 text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-100 mx-auto" />
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Nenhum boleto encontrado para este filtro.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
