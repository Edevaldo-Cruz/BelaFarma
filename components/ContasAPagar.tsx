import React, { useState, useMemo, useEffect } from 'react';
import { 
  DollarSign, 
  Filter, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  X,
  Save,
  Plus,
  Pencil,
  Trash2,
  Calendar as CalendarIcon,
  Info,
  PiggyBank
} from 'lucide-react';
import { Boleto, BoletoStatus, Order, MonthlyLimit, User, FixedAccountPayment, CashClosingRecord } from '../types';
import { BoletoForm } from './BoletoForm';
import { useToast } from './ToastContext';

interface ContasAPagarProps {
  user: User;
  boletos: Boleto[];
  orders: Order[];
  onUpdateBoletoStatus: (boletoId: string, status: BoletoStatus) => void;
  onAddBoleto: (boleto: Partial<Boleto>) => void;
  onUpdateBoleto: (boleto: Boleto) => void;
  onDeleteBoleto: (boletoId: string) => void;
  monthlyLimits: MonthlyLimit[];
  cashClosings?: CashClosingRecord[];
}

interface UnifiedPayment {
  id: string; 
  type: 'boleto' | 'fixed' | 'provision';
  supplierName: string;
  dueDate: string; 
  value: number;
  status: BoletoStatus | 'Pago' | 'Pendente';
  originalBoleto?: Boleto;
  originalFixed?: FixedAccountPayment;
  invoice_number?: string;
  paidAt?: string;
  provisionDetails?: string;
}

export const ContasAPagar: React.FC<ContasAPagarProps> = ({ 
  user, 
  boletos, 
  orders, 
  onUpdateBoletoStatus, 
  onAddBoleto, 
  onUpdateBoleto,
  onDeleteBoleto,
  monthlyLimits,
  cashClosings
}) => {
  const { addToast } = useToast();
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [isBoletoFormOpen, setIsBoletoFormOpen] = useState(false);
  const [boletoToEdit, setBoletoToEdit] = useState<Boleto | null>(null);
  const [fixedPayments, setFixedPayments] = useState<FixedAccountPayment[]>([]);
  
  // Provisões Dinâmicas State
  const [monthlySalesGoal, setMonthlySalesGoal] = useState<number>(40000);
  const [paidProvisionsDates, setPaidProvisionsDates] = useState<string[]>([]);
  const [budgetStatus, setBudgetStatus] = useState<'ok' | 'busted'>('ok');

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Busca de Settings para Provisões
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const resGoal = await fetch('/api/settings/monthly_sales_goal');
        if (resGoal.ok) {
          const d = await resGoal.json();
          if (d && d.value) setMonthlySalesGoal(Number(d.value));
        }

        const resPaid = await fetch('/api/settings/paid_provisions_dates');
        if (resPaid.ok) {
          const d = await resPaid.json();
          if (d && d.value) {
            try { setPaidProvisionsDates(JSON.parse(d.value)); } catch(e) {}
          }
        }
      } catch (err) {
        console.error('Erro ao buscar configurações de provisão:', err);
      }
    };
    fetchSettings();
  }, []);

  // Verifica o Budget para o Mês Selecionado
  useEffect(() => {
    const currentLimit = monthlyLimits.find(l => l.month === selectedMonth + 1 && l.year === selectedYear);
    if (currentLimit) {
      // Checar se estourou
      const totalPurchasesMonth = orders
        .filter(o => {
          if (!o.order_date) return false;
          const [y, m] = o.order_date.split('-');
          return parseInt(y) === selectedYear && parseInt(m) - 1 === selectedMonth;
        })
        .reduce((sum, o) => sum + (o.total || 0), 0);

      if (totalPurchasesMonth > currentLimit.limit_value) {
        setBudgetStatus('busted');
      } else {
        setBudgetStatus('ok');
      }
    } else {
      setBudgetStatus('ok');
    }
  }, [monthlyLimits, orders, selectedMonth, selectedYear]);

  // Carrega os pagamentos de contas fixas salvos
  useEffect(() => {
    const fetchFixedPayments = async () => {
      try {
        const res = await fetch(`/api/fixed-account-payments?month=${selectedMonth + 1}&year=${selectedYear}`);
        if (res.ok) {
          const data = await res.json();
          setFixedPayments(data);
        }
      } catch (err) {
        console.error('Erro ao carregar pagamentos de contas fixas:', err);
      }
    };
    fetchFixedPayments();
  }, [selectedMonth, selectedYear]);

  const getDueDateStatus = (dueDateStr: string): 'overdue' | 'due-today' | 'due-tomorrow' | 'default' => {
    const dueDate = new Date(dueDateStr + 'T00:00:00');
    dueDate.setHours(0, 0, 0, 0);
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);

    if (dueDate < now) return 'overdue';
    if (dueDate.getTime() === now.getTime()) return 'due-today';
    if (dueDate.getTime() === tomorrow.getTime()) return 'due-tomorrow';
    
    return 'default';
  };

  const getEffectiveStatus = (boleto: Boleto): BoletoStatus => {
    const dueDate = new Date(boleto.due_date + 'T00:00:00');
    dueDate.setHours(0, 0, 0, 0);
    
    if (boleto.status === BoletoStatus.PENDENTE && dueDate < now) {
      return BoletoStatus.VENCIDO;
    }
    return boleto.status;
  };
  
  const getOrderForBoleto = (boleto: Boleto): Order | undefined => {
    if (!boleto.order_id) return undefined;
    return orders.find(o => o.id === boleto.order_id);
  }

  // Lista Unificada de Pagamentos
  const unifiedList = useMemo(() => {
    const list: UnifiedPayment[] = [];

    // 1. Boletos do Mês
    boletos.forEach(b => {
      if (!b.due_date) return;
      const [y, m] = b.due_date.split('-');
      if (parseInt(y) === selectedYear && parseInt(m) - 1 === selectedMonth) {
        list.push({
          id: b.id,
          type: 'boleto',
          supplierName: b.supplier_name,
          dueDate: b.due_date,
          value: b.amount,
          status: b.status,
          originalBoleto: b,
          invoice_number: b.invoice_number,
          paidAt: b.paid_at
        });
      }
    });

    // 2. Contas Fixas do Mês
    fixedPayments.forEach(fp => {
      list.push({
        id: fp.id,
        type: 'fixed',
        supplierName: `[Fixa] ${fp.account_name}`,
        dueDate: fp.due_date,
        value: fp.value,
        status: fp.status,
        originalFixed: fp,
        paidAt: fp.paidAt
      });
    });

    // 3. Provisões Diárias (Pró-labore 12%, Impostos 4%, Reserva 1%)
    if (cashClosings && budgetStatus !== 'busted') {
      cashClosings.forEach(c => {
        if (!c.date || !c.totalSales || c.totalSales <= 0) return;
        
        const closingDate = new Date(c.date + 'T00:00:00');
        const minDate = new Date('2026-06-01T00:00:00');
        if (closingDate < minDate) return;

        const dueD = new Date(closingDate);
        dueD.setDate(dueD.getDate() + 1);
        const yDue = dueD.getFullYear();
        const mDue = dueD.getMonth();
        const dDue = String(dueD.getDate()).padStart(2, '0');
        const dueDateStr = `${yDue}-${String(mDue + 1).padStart(2, '0')}-${dDue}`;

        if (yDue === selectedYear && mDue === selectedMonth) {
          const dateBr = c.date.split('-').reverse().join('/');
          const salesVal = Number(c.totalSales) || 0;
          
          const valProlabore = salesVal * 0.12;
          const valTax = salesVal * 0.04;
          const valReserve = salesVal * 0.01;

          const isProlaborePaid = paidProvisionsDates.includes(`prolabore-${c.date}`);
          const isTaxPaid = paidProvisionsDates.includes(`tax-${c.date}`);
          const isReservePaid = paidProvisionsDates.includes(`reserve-${c.date}`);

          const formatBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

          // 1. Pró-labore (12%)
          list.push({
            id: `provision-prolabore-${c.date}`,
            type: 'provision',
            supplierName: `Provisão Pró-labore (12%) - Fechamento: ${dateBr}`,
            dueDate: dueDateStr,
            value: valProlabore,
            status: isProlaborePaid ? 'Pago' : 'Pendente',
            provisionDetails: `12% de ${formatBRL(salesVal)}`
          });

          // 2. Impostos (4%)
          list.push({
            id: `provision-tax-${c.date}`,
            type: 'provision',
            supplierName: `Provisão Impostos (4%) - Fechamento: ${dateBr}`,
            dueDate: dueDateStr,
            value: valTax,
            status: isTaxPaid ? 'Pago' : 'Pendente',
            provisionDetails: `4% de ${formatBRL(salesVal)}`
          });

          // 3. Reserva (1%)
          list.push({
            id: `provision-reserve-${c.date}`,
            type: 'provision',
            supplierName: `Provisão Reserva (1%) - Fechamento: ${dateBr}`,
            dueDate: dueDateStr,
            value: valReserve,
            status: isReservePaid ? 'Pago' : 'Pendente',
            provisionDetails: `1% de ${formatBRL(salesVal)}`
          });
        }
      });
    }

    // Ordenar por Vencimento Ascendente
    list.sort((a, b) => {
      const dateA = new Date(a.dueDate + 'T00:00:00').getTime();
      const dateB = new Date(b.dueDate + 'T00:00:00').getTime();
      return dateA - dateB;
    });

    return list;
  }, [boletos, fixedPayments, cashClosings, monthlySalesGoal, selectedMonth, selectedYear, paidProvisionsDates, budgetStatus, orders]);

  // Filtro
  const filteredList = useMemo(() => {
    if (statusFilter === 'all') return unifiedList;
    return unifiedList.filter(item => {
      if (statusFilter === BoletoStatus.PAGO || statusFilter === 'Pago') {
        return (item.status as string) === BoletoStatus.PAGO || (item.status as string) === 'Pago';
      }
      if (statusFilter === BoletoStatus.VENCIDO || statusFilter === 'Vencido') {
        return (item.status as string) === BoletoStatus.VENCIDO || ((item.status as string) === 'Pendente' && new Date(item.dueDate + 'T00:00:00') < now);
      }
      return (item.status as string) === BoletoStatus.PENDENTE || (item.status as string) === 'Pendente';
    });
  }, [unifiedList, statusFilter]);

  const totalOfMonth = useMemo(() => {
    return filteredList.reduce((acc, b) => acc + b.value, 0);
  }, [filteredList]);

  const totalProvisionedThisMonth = useMemo(() => {
    return unifiedList
      .filter(item => item.type === 'provision')
      .reduce((acc, item) => acc + item.value, 0);
  }, [unifiedList]);

  const currentMonthLimit = useMemo(() => {
    const limit = monthlyLimits.find(l => l.month === selectedMonth + 1 && l.year === selectedYear);
    return limit ? limit.limit : 0;
  }, [monthlyLimits, selectedMonth, selectedYear]);

  const getStatusBadge = (item: UnifiedPayment) => {
    const isPaid = (item.status as string) === BoletoStatus.PAGO || (item.status as string) === 'Pago';
    const isOverdue = (item.status as string) === BoletoStatus.VENCIDO || ((item.status as string) === 'Pendente' && new Date(item.dueDate + 'T00:00:00') < now);

    if (isPaid) {
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> Pago</span>;
    }
    if (isOverdue) {
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 animate-pulse"><AlertTriangle className="w-3.5 h-3.5" /> Vencido</span>;
    }
    
    // Pendente
    const dueDateStatus = getDueDateStatus(item.dueDate);
    if (dueDateStatus === 'due-today') {
       return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700"><Clock className="w-3.5 h-3.5" /> Vence Hoje</span>;
    }
    if (dueDateStatus === 'due-tomorrow') {
       return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700"><Clock className="w-3.5 h-3.5" /> Vence Amanhã</span>;
    }
    return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700"><Clock className="w-3.5 h-3.5" /> Pendente</span>;
  };
  
  const totalPendente = useMemo(() => {
     return unifiedList
      .filter(b => (b.status as string) === BoletoStatus.PENDENTE || (b.status as string) === 'Pendente' || (b.status as string) === BoletoStatus.VENCIDO)
      .reduce((acc, b) => acc + b.value, 0);
  }, [unifiedList]);

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(selectedYear, i, 1);
    return { value: i, label: d.toLocaleString('pt-BR', { month: 'long' }) };
  });

  const handleSaveBoleto = (boletoData: Partial<Boleto>) => {
    if (boletoToEdit) {
      onUpdateBoleto({ ...boletoToEdit, ...boletoData } as Boleto);
    } else {
      onAddBoleto(boletoData);
    }
    setIsBoletoFormOpen(false);
    setBoletoToEdit(null);
  };
  
  const handleDelete = (boletoId: string) => {
    if (window.confirm('Tem certeza que deseja excluir este boleto? Esta ação não pode ser desfeita.')) {
      onDeleteBoleto(boletoId);
    }
  };

  // Actions for different types
  const handleTogglePayment = async (item: UnifiedPayment) => {
    if (item.type === 'boleto' && item.originalBoleto) {
      const newStatus = item.status === BoletoStatus.PAGO ? BoletoStatus.PENDENTE : BoletoStatus.PAGO;
      onUpdateBoletoStatus(item.id, newStatus);
    } 
    else if (item.type === 'fixed' && item.originalFixed) {
      try {
        const newStatus = item.status === 'Pago' ? 'Pendente' : 'Pago';
        const paidAt = newStatus === 'Pago' ? new Date().toISOString().split('T')[0] : null;
        
        const response = await fetch(`/api/fixed-account-payments/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus, paidAt })
        });
        
        if (!response.ok) throw new Error('Failed to update fixed payment');
        
        setFixedPayments(prev => 
          prev.map(p => p.id === item.id ? { ...p, status: newStatus, paidAt } : p)
        );
      } catch (error) {
        console.error(error);
        addToast('Erro ao atualizar pagamento da conta fixa', 'error');
      }
    }
    else if (item.type === 'provision') {
      // O ID da provisão é `provision-base-${c.date}` ou `provision-bonus-${c.date}`
      const provisionKey = item.id.replace('provision-', ''); 
      let newDates = [...paidProvisionsDates];
      if (item.status === 'Pago') {
         newDates = newDates.filter(d => d !== provisionKey);
      } else {
         newDates.push(provisionKey);
      }
      setPaidProvisionsDates(newDates);
      try {
        await fetch('/api/settings/paid_provisions_dates', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: JSON.stringify(newDates) })
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      {isBoletoFormOpen && (
        <BoletoForm
          user={user}
          onSave={handleSaveBoleto}
          onCancel={() => {
            setIsBoletoFormOpen(false);
            setBoletoToEdit(null);
          }}
          orders={orders}
          boletoToEdit={boletoToEdit}
        />
      )}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tighter leading-none">Contas a Pagar</h1>
          <p className="text-slate-500 font-medium text-sm">Lista Unificada: Boletos, Fixas e Provisões</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => { setBoletoToEdit(null); setIsBoletoFormOpen(true); }}
            className="flex items-center gap-2 px-4 py-3 bg-red-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl transition-all active:scale-[0.98] hover:bg-red-700"
          >
            <Plus className="w-4 h-4" />
            Novo Boleto
          </button>
          <div className="p-4 bg-red-50 border-2 border-red-100 rounded-2xl text-right">
              <p className="text-[10px] font-black text-red-700/60 uppercase tracking-widest">Total em Aberto</p>
              <p className="text-2xl font-black text-red-800 tracking-tighter">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPendente)}
              </p>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-right w-full">
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Previsão de Saída do Mês</p>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Teto Compras: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentMonthLimit)}</p>
              </div>
              <p className="text-2xl font-black text-slate-800 tracking-tighter mt-1">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalOfMonth)}
              </p>
          </div>
          <div className="p-4 bg-emerald-50 border-2 border-emerald-200 rounded-2xl text-right w-full">
              <div className="flex justify-end items-center">
                <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Total Provisionado (Mês)</p>
              </div>
              <p className="text-2xl font-black text-emerald-800 tracking-tighter mt-1">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalProvisionedThisMonth)}
              </p>
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-4 items-center justify-end bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="relative w-full md:w-48">
            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select 
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
            >
              {monthOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label.toUpperCase()}</option>)}
            </select>
          </div>
          <div className="relative w-full md:w-32">
             <select 
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="relative w-full md:w-56">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select 
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
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
          <table className="w-full text-left border-collapse responsive-table">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Compromisso</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Vencimento</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Situação</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Valor</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredList.map((item) => {
                const dueDateStatus = getDueDateStatus(item.dueDate);
                
                // Determina a classe base da linha (Foco em Contas Fixas em Azul Claro)
                let rowClass = 'transition-colors group hover:bg-slate-50';
                
                // Se for Conta Fixa ou Provisão: Destaque Azul!
                if (item.type === 'fixed' || item.type === 'provision') {
                  rowClass = 'bg-blue-50/40 hover:bg-blue-50/80 transition-colors group';
                }

                // Mas Vencidos continuam vermelhos para chamar mais atenção
                const isOverdue = (item.status as string) === BoletoStatus.VENCIDO || ((item.status as string) === 'Pendente' && new Date(item.dueDate + 'T00:00:00') < now);
                if (isOverdue) {
                    rowClass = 'bg-red-50/80 hover:bg-red-100/80 transition-colors group';
                }

                const isPaid = (item.status as string) === BoletoStatus.PAGO || (item.status as string) === 'Pago';

                return (
                  <tr key={item.id} className={rowClass}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {item.type === 'fixed' && <Clock className="w-4 h-4 text-blue-500 opacity-60" />}
                        {item.type === 'provision' && <PiggyBank className="w-4 h-4 text-emerald-500 opacity-60" />}
                        <div className="flex flex-col">
                          <span className={`font-black uppercase group-hover:text-slate-700 transition-colors tracking-tighter ${isPaid ? 'text-slate-400 line-through' : 'text-slate-900'} ${item.type !== 'boleto' ? 'text-blue-800' : ''}`}>
                            {item.supplierName}
                          </span>
                          {item.invoice_number && (
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">NFE: {item.invoice_number}</span>
                          )}
                          {item.type === 'provision' && (
                            <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-tighter">Reserva de Lucro</span>
                          )}
                          {item.provisionDetails && (
                            <span className="text-[10px] text-emerald-700/70 font-bold tracking-tighter mt-0.5">{item.provisionDetails}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                        <span className={`text-sm font-bold ${isPaid ? 'text-slate-400' : 'text-slate-700'}`}>
                            {item.dueDate.split('T')[0].split('-').reverse().join('/')}
                        </span>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(item)}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-black text-base tracking-tighter ${isPaid ? 'text-slate-400' : 'text-slate-900'}`}>
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-1">
                        
                        {item.type === 'boleto' && (
                          <button 
                            onClick={() => { setBoletoToEdit(item.originalBoleto!); setIsBoletoFormOpen(true); }}
                            className="p-2 text-slate-400 hover:text-blue-600 rounded-xl transition-colors" 
                            title="Editar Boleto"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        
                        <button 
                            onClick={() => handleTogglePayment(item)}
                            className={`p-2 rounded-xl transition-all border ${
                              isPaid 
                                ? 'text-emerald-600 bg-emerald-100 border-emerald-200' 
                                : 'text-slate-300 bg-white border-slate-200 hover:text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300'
                            }`}
                            title={isPaid ? "Desmarcar Pagamento" : "Marcar como Pago"}
                        >
                            <CheckCircle2 className="w-4 h-4" />
                        </button>

                        {item.type === 'boleto' && (
                          <button 
                            onClick={() => handleDelete(item.id)}
                            className="p-2 text-slate-400 hover:text-red-600 rounded-xl transition-colors" 
                            title="Excluir Boleto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredList.length === 0 && (
            <div className="py-16 text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-blue-100 mx-auto" />
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Nenhum compromisso pendente neste filtro.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
