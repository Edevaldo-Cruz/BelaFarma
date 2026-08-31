import React, { useState, useMemo } from 'react';
import { DollarSign, Search, Plus, Calendar as CalendarIcon, TrendingUp, AlertCircle, ArrowRight, Wallet, Receipt, Check, CheckCircle, Clock, RotateCcw, X } from 'lucide-react';
import { Boleto, Order, FixedAccount, FixedAccountPayment, CashClosingRecord, BoletoStatus } from '../types';
import Calendar from 'react-calendar';
import { useToast } from './ToastContext';
type CalendarValue = Date | Date[] | null;
import 'react-calendar/dist/Calendar.css';
import './DaysInDebt.css';

interface DaysInDebtProps {
  boletos: Boleto[];
  orders: Order[];
  fixedAccounts: FixedAccount[];
  cashClosings: CashClosingRecord[];
  onAddBoleto?: (boleto: Partial<Boleto>) => Promise<void> | void;
  onUpdateBoletoStatus?: (boletoId: string, status: BoletoStatus) => Promise<void> | void;
  onRefreshData?: () => void;
}

interface DebtCardInfo {
  mainDate: Date;
  mainDateValue: number;
  surroundingDates: {
    date: Date;
    value: number;
  }[];
}

export const DaysInDebt: React.FC<DaysInDebtProps> = ({ 
  boletos, 
  orders, 
  fixedAccounts, 
  cashClosings,
  onAddBoleto,
  onUpdateBoletoStatus,
  onRefreshData
}) => {
  const { addToast } = useToast();

  // Mudança para array de strings YYYY-MM-DD para seleção múltipla
  const [selectedDateStrings, setSelectedDateStrings] = useState<string[]>([new Date().toISOString().split('T')[0]]); 

  // --- Modal de Lançar Novo Boleto ---
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newBoletoSupplier, setNewBoletoSupplier] = useState('');
  const [newBoletoValue, setNewBoletoValue] = useState(0);
  const [newBoletoValueInput, setNewBoletoValueInput] = useState('0,00');
  const [newBoletoDueDate, setNewBoletoDueDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [newBoletoInvoice, setNewBoletoInvoice] = useState('');
  const [newBoletoInstallments, setNewBoletoInstallments] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const toggleDate = (date: Date, event: React.MouseEvent<HTMLButtonElement>) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    setSelectedDateStrings(prev => {
      // Se CTRL ou META (Command) estiver pressionado, alterna a seleção (multi-seleção)
      if (event.ctrlKey || event.metaKey) {
        if (prev.includes(dateStr)) {
          return prev.filter(d => d !== dateStr);
        } else {
          return [...prev, dateStr];
        }
      }
      
      // Clique simples: seleção única
      return [dateStr];
    });
  };
  const [totalValue, setTotalValue] = useState(0);
  const [totalValueInput, setTotalValueInput] = useState('0,00');
  const [installments, setInstallments] = useState(1);
  const [days, setDays] = useState<string>('15');
  const [currentCash, setCurrentCash] = useState(0);
  const [currentCashInput, setCurrentCashInput] = useState('0,00');
  const [simulationResult, setSimulationResult] = useState<DebtCardInfo[]>([]);
  const [fixedPayments, setFixedPayments] = useState<FixedAccountPayment[]>([]);
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // --- Gestão de Saldo Devedor do Prolabore ---
  const [initialDebt, setInitialDebt] = useState<number>(0);
  const [isEditingDebt, setIsEditingDebt] = useState(false);
  const [debtInput, setDebtInput] = useState('0,00');
  const [budgetStatus, setBudgetStatus] = useState<'ok' | 'busted'>('ok');
  const [monthlySalesGoal, setMonthlySalesGoal] = useState<number>(40000);

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const [resDebt, resGoal, resLimits] = await Promise.all([
          fetch('/api/settings/delayed_prolabore_balance'),
          fetch('/api/settings/monthly_sales_goal'),
          fetch('/api/settings') // Fetch limits differently if not available, but let's fetch from all-data
        ]);
        
        if (resDebt.ok) {
          const data = await resDebt.json();
          if (data && data.value) {
             const val = Number(data.value);
             setInitialDebt(val);
             setDebtInput(new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(val));
          }
        }
        if (resGoal.ok) {
          const data = await resGoal.json();
          if (data && data.value) setMonthlySalesGoal(Number(data.value));
        }

        // Budget check
        const resAll = await fetch('/api/all-data');
        if (resAll.ok) {
          const allData = await resAll.json();
          const limits = allData.monthlyLimits?.documents || [];
          const now = new Date();
          const currentMonthName = now.toLocaleString('pt-BR', { month: 'long' });
          const currentLimit = limits.find((l: any) => l.month === now.getMonth() + 1 && l.year === now.getFullYear());
          
          if (currentLimit) {
            const totalSpentThisMonth = orders.reduce((acc: number, curr: any) => {
              if (curr.installments && curr.installments.length > 0) {
                return acc + curr.installments
                  .filter((inst: any) => {
                    const d = new Date(inst.dueDate);
                    return d.toLocaleString('pt-BR', { month: 'long' }).toLowerCase() === currentMonthName.toLowerCase();
                  })
                  .reduce((sum: number, inst: any) => sum + inst.value, 0);
              } else {
                return acc + (curr.paymentMonth.toLowerCase() === currentMonthName.toLowerCase() ? curr.totalValue : 0);
              }
            }, 0);

            if (totalSpentThisMonth > currentLimit.limit) {
              setBudgetStatus('busted');
            }
          }
        }
      } catch (err) {
        console.error('Error fetching prolabore debt settings:', err);
      }
    };
    fetchData();
  }, [orders]);

  const handleSaveDebt = async () => {
    const numericValue = parseFloat(debtInput.replace(/\./g, '').replace(',', '.'));
    if (!isNaN(numericValue)) {
      setInitialDebt(numericValue);
      setIsEditingDebt(false);
      try {
        await fetch('/api/settings/delayed_prolabore_balance', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: numericValue })
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

  const provisionedThisMonth = useMemo(() => {
    if (budgetStatus === 'busted') return 0; // Trava de Segurança
    
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthClosings = (cashClosings || []).filter(c => {
        if (!c.date) return false;
        if (c.date < '2026-08-31') return false; // Ignora antes de 31/08/2026
        const [yearStr, monthStr] = c.date.split('-'); 
        return parseInt(yearStr) === currentYear && (parseInt(monthStr) - 1) === currentMonth;
    });

    return monthClosings.reduce((sum, c) => sum + ((Number(c.totalSales) || 0) * 0.17), 0);
  }, [cashClosings, budgetStatus]);

  const currentDebt = initialDebt - provisionedThisMonth;
  // --- Fim da Gestão de Saldo Devedor ---

  // Fetch fixed account payments whenever the calendar month changes
  React.useEffect(() => {
    const fetchFixedPayments = async () => {
      try {
        const response = await fetch(`/api/fixed-account-payments?month=${currentCalendarMonth}`);
        if (!response.ok) throw new Error('Failed to fetch fixed payments');
        const data = await response.json();
        setFixedPayments(data);
      } catch (error) {
        console.error('Error fetching fixed payments:', error);
      }
    };

    fetchFixedPayments();
  }, [currentCalendarMonth]);

  const handleMonthChange = ({ activeStartDate }: { activeStartDate: Date | null }) => {
    if (activeStartDate) {
      const year = activeStartDate.getFullYear();
      const month = String(activeStartDate.getMonth() + 1).padStart(2, '0');
      setCurrentCalendarMonth(`${year}-${month}`);
    }
  };

  const handleChangeTotalValue = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    value = value.replace(/\D/g, ''); 

    if (value === '') {
      setTotalValue(0);
      setTotalValueInput('0,00');
      return;
    }

    const numericValue = parseInt(value, 10) / 100;
    setTotalValue(numericValue);
    setTotalValueInput(
      new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numericValue)
    );
  };

  const handleChangeCurrentCash = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    value = value.replace(/\D/g, ''); 

    if (value === '') {
      setCurrentCash(0);
      setCurrentCashInput('0,00');
      return;
    }

    const numericValue = parseInt(value, 10) / 100;
    setCurrentCash(numericValue);
    setCurrentCashInput(
      new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numericValue)
    );
  };

  // --- Modal Helpers ---
  const handleOpenAddModal = (targetDate?: string) => {
    const initialDate = targetDate || (selectedDateStrings.length > 0 ? selectedDateStrings[0] : new Date().toISOString().split('T')[0]);
    setNewBoletoDueDate(initialDate);
    setNewBoletoSupplier('');
    setNewBoletoValue(0);
    setNewBoletoValueInput('0,00');
    setNewBoletoInvoice('');
    setNewBoletoInstallments(1);
    setIsAddModalOpen(true);
  };

  const handleChangeNewBoletoValue = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value === '') {
      setNewBoletoValue(0);
      setNewBoletoValueInput('0,00');
      return;
    }
    const numericValue = parseInt(value, 10) / 100;
    setNewBoletoValue(numericValue);
    setNewBoletoValueInput(
      new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numericValue)
    );
  };

  const handleSaveBoleto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoletoSupplier.trim()) {
      addToast('Por favor, informe o fornecedor.', 'warning');
      return;
    }
    if (newBoletoValue <= 0) {
      addToast('Por favor, informe um valor maior que zero.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const numInstallments = Math.max(1, newBoletoInstallments);
      const installmentValue = Math.round((newBoletoValue / numInstallments) * 100) / 100;
      
      const [yearStr, monthStr, dayStr] = newBoletoDueDate.split('-');
      const baseYear = parseInt(yearStr, 10);
      const baseMonth = parseInt(monthStr, 10) - 1; // 0-indexed
      const baseDay = parseInt(dayStr, 10);

      for (let i = 0; i < numInstallments; i++) {
        const dueDateObj = new Date(baseYear, baseMonth + i, baseDay);
        const yStr = dueDateObj.getFullYear();
        const mStr = String(dueDateObj.getMonth() + 1).padStart(2, '0');
        const dStr = String(dueDateObj.getDate()).padStart(2, '0');
        const calculatedDueDate = `${yStr}-${mStr}-${dStr}`;

        const boletoPayload: Partial<Boleto> = {
          id: `boleto-${Date.now()}-${i + 1}-${Math.random().toString(36).substring(2, 6)}`,
          supplierName: newBoletoSupplier.trim(),
          due_date: calculatedDueDate,
          value: installmentValue,
          status: BoletoStatus.PENDENTE,
          invoice_number: newBoletoInvoice.trim() || undefined,
          installment_number: i + 1
        };

        if (onAddBoleto) {
          await onAddBoleto(boletoPayload);
        } else {
          const res = await fetch('/api/boletos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(boletoPayload)
          });
          if (!res.ok) throw new Error('Falha ao criar boleto');
        }
      }

      addToast(
        numInstallments > 1 
          ? `${numInstallments} parcelas do boleto lançadas com sucesso!` 
          : 'Boleto lançado no calendário com sucesso!', 
        'success'
      );

      if (onRefreshData) onRefreshData();
      setIsAddModalOpen(false);
    } catch (err: any) {
      console.error('Erro ao salvar boleto:', err);
      addToast('Erro ao salvar boleto no servidor.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (item: any) => {
    const isFixed = item.isFixed;
    const currentStatus = item.status;
    const newStatus = currentStatus === 'Pago' || currentStatus === BoletoStatus.PAGO ? BoletoStatus.PENDENTE : BoletoStatus.PAGO;

    try {
      if (isFixed) {
        const todayStr = new Date().toISOString().split('T')[0];
        const paidAtValue = newStatus === BoletoStatus.PAGO ? todayStr : null;
        const res = await fetch(`/api/fixed-account-payments/${item.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus, paidAt: paidAtValue })
        });
        if (!res.ok) throw new Error('Falha ao atualizar conta fixa');

        // Update local state for fixed payments
        setFixedPayments(prev => prev.map(fp => fp.id === item.id ? { ...fp, status: newStatus as any, paidAt: paidAtValue } : fp));
      } else {
        if (onUpdateBoletoStatus) {
          await onUpdateBoletoStatus(item.id, newStatus);
        } else {
          const res = await fetch(`/api/boletos/${item.id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
          });
          if (!res.ok) throw new Error('Falha ao atualizar status do boleto');
        }
      }

      addToast(
        newStatus === BoletoStatus.PAGO 
          ? `Lançamento de ${item.supplierName} marcado como PAGO!` 
          : `Lançamento de ${item.supplierName} marcado como PENDENTE.`, 
        'success'
      );
      
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      console.error('Erro ao atualizar status:', err);
      addToast('Erro ao atualizar status.', 'error');
    }
  };

  const handleSimulate = () => {
    const installmentValue = totalValue / (installments || 1);
    const daysArray = days.split(',').map(d => parseInt(d.trim(), 10)).filter(d => !isNaN(d));
    const today = new Date();
    
    const results: DebtCardInfo[] = daysArray.map(day => {
      const mainDate = new Date(today);
      mainDate.setDate(today.getDate() + day);
      mainDate.setHours(0, 0, 0, 0);

      const mainDateBoletos = boletos.filter(b => {
        if (b.status === BoletoStatus.PAGO) return false;
        const d = new Date(b.due_date);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === mainDate.getTime();
      });
      
      const activeFixedPayments = fixedPayments.filter(fp => 
        fp.status === 'Pendente' && fp.dueDate === mainDate.toISOString().split('T')[0]
      );
      
      const mainDateValue = mainDateBoletos.reduce((acc, b) => acc + b.value, installmentValue) + 
                          activeFixedPayments.reduce((acc, fp) => acc + fp.value, 0);

      const surroundingDates: DebtCardInfo['surroundingDates'] = [];
      for (let i = -3; i <= 3; i++) {
        if (i === 0) continue;
        const surroundingDate = new Date(mainDate);
        surroundingDate.setDate(mainDate.getDate() + i);
        
        const surroundingBoletos = boletos.filter(b => {
          if (b.status === BoletoStatus.PAGO) return false;
          const d = new Date(b.due_date);
          d.setHours(0, 0, 0, 0);
          return d.getTime() === surroundingDate.getTime();
        });
        const surroundingValue = surroundingBoletos.reduce((acc, b) => acc + b.value, 0);
        if (surroundingValue > 0) {
          surroundingDates.push({ date: surroundingDate, value: surroundingValue });
        }
      }

      return { mainDate, mainDateValue, surroundingDates };
    });

    setSimulationResult(results);
  };

  const paymentDates = useMemo(() => {
    const dates = new Set(boletos.filter(b => b.status !== BoletoStatus.PAGO).map(b => {
      const d = new Date(b.due_date);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }));

    // Add fixed payment dates
    fixedPayments.filter(fp => fp.status === 'Pendente').forEach(fp => {
      const d = new Date(fp.dueDate + 'T00:00:00');
      d.setHours(0, 0, 0, 0);
      dates.add(d.getTime());
    });

    return dates;
  }, [boletos, fixedPayments]);

  // Calculate values per day for color intensity (only pending debt)
  const dayValues = useMemo(() => {
    const values = new Map<string, number>();
    
    // Add pending boleto values
    boletos.filter(b => b.status !== BoletoStatus.PAGO).forEach(b => {
      const dateStr = b.due_date.split('T')[0];
      const current = values.get(dateStr) || 0;
      values.set(dateStr, current + b.value);
    });
    
    // Add fixed payment values
    fixedPayments.filter(fp => fp.status === 'Pendente').forEach(fp => {
      const current = values.get(fp.dueDate) || 0;
      values.set(fp.dueDate, current + fp.value);
    });
    
    return values;
  }, [boletos, fixedPayments]);

  // Calculate average and standard deviation for color scaling
  const { avgValue, stdDeviation } = useMemo(() => {
    if (dayValues.size === 0) return { avgValue: 0, stdDeviation: 0 };
    
    const values = Array.from(dayValues.values()).filter((v): v is number => typeof v === 'number');
    if (values.length === 0) return { avgValue: 0, stdDeviation: 0 };
    
    // Calculate average
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    
    // Calculate standard deviation
    const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    return { avgValue: avg, stdDeviation: stdDev };
  }, [dayValues]);


  const totalPendingBalance = useMemo(() => {
    const boletosTotal = boletos
      .filter(b => b.status !== BoletoStatus.PAGO)
      .reduce((acc, b) => acc + b.value, 0);
    const fixedTotal = fixedPayments
      .filter(fp => fp.status === 'Pendente')
      .reduce((acc, fp) => acc + fp.value, 0);
    return boletosTotal + fixedTotal;
  }, [boletos, fixedPayments]);

  const getTileClassName = ({ date, view }: { date: Date, view: string }) => {
    // Only apply logic for month view to avoid performance issues
    if (view !== 'month') return null;

    // Use UTC date string YYYY-MM-DD for comparison to match database format purely
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // Check if selected
    const isSelected = selectedDateStrings.includes(dateStr);
    let classes = isSelected ? 'react-calendar__tile--active ' : '';

    const dayValue = dayValues.get(dateStr);
    
    if (dayValue && dayValue > 0 && avgValue > 0) {
      // Calculate how many standard deviations away from the mean
      const deviationFromMean = (dayValue - avgValue) / (stdDeviation || 1);
      
      if (deviationFromMean >= 1.5) return classes + 'has-payment deviation-very-high';
      if (deviationFromMean >= 1.0) return classes + 'has-payment deviation-high';
      if (deviationFromMean >= 0.5) return classes + 'has-payment deviation-above-avg';
      if (deviationFromMean >= -0.5) return classes + 'has-payment deviation-near-avg';
      if (deviationFromMean >= -1.0) return classes + 'has-payment deviation-below-avg';
      return classes + 'has-payment deviation-very-low';
    }
    
    return classes || null;
  };

  const selectedBoletosByDate = useMemo(() => {
    if (selectedDateStrings.length === 0) return {};

    const grouped: Record<string, any[]> = {};

    selectedDateStrings.forEach(dateStr => {
      const matchedBoletos = boletos.filter(b => b.due_date.split('T')[0] === dateStr);
      
      const matchedFixedPayments = fixedPayments
        .filter(fp => fp.dueDate === dateStr)
        .map(fp => ({
          id: fp.id,
          supplierName: `[FIXA] ${fp.fixedAccountName}`,
          value: fp.value,
          due_date: fp.dueDate,
          status: fp.status || 'Pendente',
          isFixed: true
        }));
      
      const items = [...matchedBoletos, ...matchedFixedPayments];
      if (items.length > 0) {
        grouped[dateStr] = items;
      }
    });

    return grouped;
  }, [selectedDateStrings, boletos, fixedPayments]);

  const selectedTotal = useMemo(() => {
    return Object.values(selectedBoletosByDate)
      .flat()
      .filter((item: any) => item.status !== BoletoStatus.PAGO && item.status !== 'Pago')
      .reduce((acc, item: any) => acc + item.value, 0);
  }, [selectedBoletosByDate]);

  const averageDailySales = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const dayOfMonth = now.getDate(); // Dia atual do mês (ex: 18)

    const monthClosings = (cashClosings || []).filter(c => {
        if (!c.date) return false;
        const [yearStr, monthStr] = c.date.split('-'); 
        return parseInt(yearStr) === currentYear && (parseInt(monthStr) - 1) === currentMonth;
    });

    if (monthClosings.length === 0) return 0;
    
    const totalSalesSum = monthClosings.reduce((acc, curr) => acc + (curr.totalSales || 0), 0);
    // Divide pelo número de dias passados no mês atual (ex: hoje dia 18 → divide por 18)
    return totalSalesSum / dayOfMonth;
  }, [cashClosings]);

  // 1. Calcular a dedução total de provisão considerando a transição de meses e Férias/13º
  const totalProvisionDiscount = useMemo(() => {
    return (averageDailySales * 0.17) * selectedDateStrings.length;
  }, [averageDailySales, selectedDateStrings]);

  const salesForecast = averageDailySales * selectedDateStrings.length;
  const forecastBalance = currentCash + salesForecast - selectedTotal - totalProvisionDiscount;

  return (
    <div className="space-y-12 animate-in fade-in duration-700 pb-20">
      {/* MODAL LANÇAR BOLETO */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-red-50/50 dark:bg-red-900/10">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight text-red-700 dark:text-red-400 flex items-center gap-2">
                  <Plus className="w-5 h-5" /> Lançar Boleto no Calendário
                </h2>
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-0.5">
                  Cadastrar compromisso no calendário
                </p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSaveBoleto} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1">
                  Fornecedor / Favorecido *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Medley, Santa Cruz, Eurofarma..."
                  value={newBoletoSupplier}
                  onChange={(e) => setNewBoletoSupplier(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl font-bold text-slate-900 dark:text-slate-100 outline-none focus:border-red-500 transition-all text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1">
                    Valor (R$) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">R$</span>
                    <input
                      type="text"
                      required
                      value={newBoletoValueInput}
                      onChange={handleChangeNewBoletoValue}
                      className="w-full pl-11 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl font-black text-slate-900 dark:text-slate-100 text-lg outline-none focus:border-red-500 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1">
                    Vencimento *
                  </label>
                  <input
                    type="date"
                    required
                    value={newBoletoDueDate}
                    onChange={(e) => setNewBoletoDueDate(e.target.value)}
                    className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl font-bold text-slate-900 dark:text-slate-100 text-sm outline-none focus:border-red-500 transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1">
                    Nº da Nota / Fatura
                  </label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={newBoletoInvoice}
                    onChange={(e) => setNewBoletoInvoice(e.target.value)}
                    className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl font-bold text-slate-900 dark:text-slate-100 text-sm outline-none focus:border-red-500 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1">
                    Parcelas
                  </label>
                  <select
                    value={newBoletoInstallments}
                    onChange={(e) => setNewBoletoInstallments(Number(e.target.value))}
                    className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl font-bold text-slate-900 dark:text-slate-100 text-sm outline-none focus:border-red-500 transition-all"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                      <option key={n} value={n}>
                        {n}x {n > 1 ? `(R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(newBoletoValue / n)} / mês)` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-6 py-3 text-xs font-black uppercase text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-8 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black uppercase text-xs tracking-wider shadow-lg transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar Boleto(s)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter">Dias Comprometidos</h1>
          <p className="text-slate-500 dark:text-slate-400 font-bold italic text-sm">Controle de fluxo de caixa e compromissos futuros.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
           <button
             onClick={() => handleOpenAddModal()}
             className="flex items-center gap-2 px-6 py-3.5 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg transition-all active:scale-95"
           >
             <Plus className="w-5 h-5" /> Lançar Boleto
           </button>
           <div className="flex flex-col items-end">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Total a Pagar (Pendente Mês)</span>
              <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/10 px-6 py-3 rounded-2xl border border-red-100 dark:border-red-900/30 shadow-sm">
                <DollarSign className="w-6 h-6 text-red-600 dark:text-red-400" />
                <span className="text-2xl font-black text-red-700 dark:text-red-400 tracking-tighter">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPendingBalance)}
                </span>
              </div>
           </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* CALENDAR E PAINEL DE DÍVIDA SECTION */}
        <section className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Calendário de Pagamentos</h2>
              <button
                onClick={() => handleOpenAddModal()}
                className="text-[10px] font-black uppercase text-red-600 dark:text-red-400 hover:underline flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar Boleto
              </button>
            </div>
            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-xl transition-all duration-300 hover:shadow-2xl">
              <Calendar
                onClickDay={toggleDate}
                onActiveStartDateChange={handleMonthChange}
                value={null}
                tileClassName={getTileClassName}
                className="w-full"
              />
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mt-4 text-center tracking-widest opacity-60">
                Dica: Segure CTRL para selecionar múltiplos dias
              </p>
            </div>
          </div>

          {/* PAINEL DE SALDO DEVEDOR PROLABORE */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border-2 border-indigo-100 dark:border-indigo-900/30 shadow-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                <Wallet className="w-4 h-4" /> Saldo Devedor: Prolabore
              </h2>
              {budgetStatus === 'busted' && (
                <span className="text-[9px] font-bold bg-red-100 text-red-700 px-2 py-1 rounded uppercase tracking-wider animate-pulse">
                  Orçamento Estourado
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Dívida Inicial</p>
                {isEditingDebt ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-400">R$</span>
                    <input
                      type="text"
                      value={debtInput}
                      onChange={(e) => setDebtInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                      className="w-24 bg-transparent border-b-2 border-indigo-500 outline-none text-lg font-black text-slate-800 dark:text-slate-100 focus:ring-0 px-0 py-1"
                      autoFocus
                    />
                    <button onClick={handleSaveDebt} className="text-xs font-bold bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full hover:bg-indigo-200">Salvar</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditingDebt(true)}>
                    <p className="text-lg font-black text-slate-800 dark:text-slate-100">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(initialDebt)}
                    </p>
                    <span className="opacity-0 group-hover:opacity-100 text-[10px] font-bold text-indigo-500 transition-opacity">Editar</span>
                  </div>
                )}
              </div>
              
              <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-800/50">
                <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-500 uppercase tracking-widest mb-1">Amortizado no Mês</p>
                <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(provisionedThisMonth)}
                </p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Dívida Atual</span>
              <span className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentDebt)}
              </span>
            </div>
          </div>
        </section>

        {/* DETAILS SECTION */}
        <section className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-50/50 dark:bg-slate-800/30 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Resumo da Simulação
            </h2>
            
            {selectedDateStrings.length > 0 && (
              <div className="grid grid-cols-2 gap-4 w-full md:w-auto mt-4 md:mt-0">
                {/* Venda Prevista */}
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center justify-center min-w-[160px]">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 text-center">Venda Prevista</span>
                  <span className="text-lg font-black text-blue-600 dark:text-blue-400">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(salesForecast)}
                  </span>
                </div>

                {/* Saldo em Caixa (Editável) */}
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border-2 border-blue-200 dark:border-blue-900/50 shadow-md flex flex-col items-center justify-center min-w-[160px] group transition-all hover:border-blue-400">
                  <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1 text-center">Saldo em Caixa</span>
                  <div className="flex items-center">
                    <span className="text-lg font-black text-slate-400 mr-1">R$</span>
                    <input
                      type="text"
                      value={currentCashInput}
                      onChange={handleChangeCurrentCash}
                      className="text-lg font-black text-slate-900 dark:text-slate-100 bg-transparent outline-none w-24 text-center focus:ring-0"
                    />
                  </div>
                </div>

                {/* Total Selecionado */}
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center justify-center min-w-[160px]">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 text-center">Despesas a Pagar</span>
                  <span className="text-lg font-black text-red-600 dark:text-red-400">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedTotal)}
                  </span>
                </div>

                {/* Saldo Previsto */}
                <div className={`p-4 rounded-2xl shadow-sm flex flex-col items-center justify-center min-w-[160px] border ${
                  forecastBalance >= 0 
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400' 
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
                }`}>
                  <span className="text-[9px] font-black uppercase tracking-widest mb-1 text-center opacity-70">Saldo Previsto</span>
                  <span className="text-lg font-black">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(forecastBalance)}
                  </span>
                  {totalProvisionDiscount > 0 && (
                    <span className="text-[7.5px] font-bold mt-1 text-center leading-tight opacity-80">
                      (Deduzido R$ {new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(totalProvisionDiscount)} de provisão)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <div className="space-y-6 scrollbar-hide max-h-[500px] overflow-y-auto pr-2 pb-10">
            {selectedDateStrings.length > 0 ? (
               selectedDateStrings.sort().map(dateStr => {
                 const items = selectedBoletosByDate[dateStr] || [];
                 const [year, month, day] = dateStr.split('-');
                 const formattedDate = `${day}/${month}/${year}`;
                 const dayTotal = items.reduce((acc, i: any) => acc + i.value, 0);

                 return (
                   <div key={dateStr} className="space-y-3">
                     <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-xl">{formattedDate}</span>
                          <span className="text-xs font-bold text-slate-400 dark:text-slate-500">
                            (Total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dayTotal)})
                          </span>
                        </div>
                        <button
                          onClick={() => handleOpenAddModal(dateStr)}
                          className="text-[10px] font-black uppercase tracking-wider text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Boleto para este dia
                        </button>
                     </div>
                     
                     {items.length > 0 ? (
                       items.map((boleto: any) => {
                         const isFixed = boleto.isFixed;
                         const isPaid = boleto.status === 'Pago' || boleto.status === BoletoStatus.PAGO;
                         
                         const todayStr = new Date().toISOString().split('T')[0];
                         const isOverdue = !isPaid && dateStr < todayStr;

                         const rowClasses = isPaid
                           ? "group bg-emerald-50/40 dark:bg-emerald-900/10 p-5 rounded-[2rem] border border-emerald-200/70 dark:border-emerald-800/40 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all hover:shadow-md"
                           : isFixed 
                             ? "group bg-blue-50/40 dark:bg-blue-900/10 p-5 rounded-[2rem] border border-blue-200 dark:border-blue-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md"
                             : "group bg-white dark:bg-slate-900/50 p-5 rounded-[2rem] border border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all hover:border-red-200 dark:hover:border-red-900/50 hover:shadow-md";
                         
                         const iconClasses = isPaid
                           ? "p-3 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-2xl"
                           : isFixed
                             ? "p-3 bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-2xl group-hover:scale-110 transition-transform"
                             : "p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl group-hover:scale-110 transition-transform";

                         return (
                          <div key={boleto.id} className={rowClasses}>
                            <div className="flex items-center gap-4">
                              <div className={iconClasses}>
                                {isPaid ? <CheckCircle className="w-5 h-5" /> : <Receipt className="w-5 h-5" />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter text-base">
                                    {boleto.supplierName}
                                  </p>

                                  {isPaid ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                                      <Check className="w-3 h-3" /> Pago
                                    </span>
                                  ) : isOverdue ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 animate-pulse">
                                      <AlertCircle className="w-3 h-3" /> Vencido
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                                      <Clock className="w-3 h-3" /> Pendente
                                    </span>
                                  )}
                                </div>
                                
                                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mt-0.5">
                                  Vencimento em {formattedDate} {boleto.invoice_number ? `• NF: ${boleto.invoice_number}` : ''}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                              <span className={
                                isPaid 
                                  ? "font-black text-lg text-emerald-600 dark:text-emerald-400 line-through opacity-80" 
                                  : isFixed 
                                    ? "font-black text-xl text-blue-700 dark:text-blue-400" 
                                    : "font-black text-xl text-red-600 dark:text-red-400"
                              }>
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(boleto.value)}
                              </span>

                              <button
                                onClick={() => handleToggleStatus(boleto)}
                                title={isPaid ? "Marcar como Pendente" : "Marcar como Pago"}
                                className={
                                  isPaid
                                    ? "flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-black uppercase rounded-xl transition-all active:scale-95"
                                    : "flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase rounded-xl shadow-md transition-all active:scale-95"
                                }
                              >
                                {isPaid ? (
                                  <>
                                    <RotateCcw className="w-3.5 h-3.5" /> Pendente
                                  </>
                                ) : (
                                  <>
                                    <Check className="w-4 h-4" /> Marcar Pago
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                         );
                       })
                     ) : (
                       <div className="bg-slate-50/50 dark:bg-slate-800/20 p-6 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center flex flex-col items-center justify-center gap-2">
                         <p className="text-slate-400 dark:text-slate-500 font-bold uppercase text-[10px] tracking-widest">Nenhum pagamento cadastrado para este dia.</p>
                         <button
                           onClick={() => handleOpenAddModal(dateStr)}
                           className="text-xs font-black uppercase text-red-600 dark:text-red-400 hover:underline flex items-center gap-1 mt-1"
                         >
                           <Plus className="w-4 h-4" /> Lançar Boleto agora
                         </button>
                       </div>
                     )}
                   </div>
                 );
               })
            ) : (
              <div className="bg-slate-50 dark:bg-slate-800/20 p-12 rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-slate-800 text-center flex flex-col items-center gap-4">
                <AlertCircle className="w-10 h-10 text-slate-300 dark:text-slate-700" />
                <p className="text-slate-400 dark:text-slate-500 font-bold uppercase text-[10px] tracking-widest">Selecione um dia no calendário para ver e lançar compromissos.</p>
                <button
                  onClick={() => handleOpenAddModal()}
                  className="px-6 py-3 bg-red-600 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-md hover:bg-red-700 transition-all"
                >
                  Lançar Boleto
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* SIMULATION SECTION */}
      <section className="space-y-6 pt-6">
        <div className="flex items-center gap-4 ml-2">
            <div className="w-8 h-8 rounded-full bg-slate-900 dark:bg-slate-100 flex items-center justify-center text-white dark:text-slate-900 font-black">?</div>
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter">Simular Novo Pedido</h2>
        </div>

        <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border-2 border-slate-100 dark:border-slate-800 shadow-2xl space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-2">Valor Total do Pedido</label>
              <div className="relative group">
                <div className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-slate-300 dark:text-slate-600 group-focus-within:text-red-500 transition-colors">R$</div>
                <input
                  type="text"
                  value={totalValueInput}
                  onChange={handleChangeTotalValue}
                  className="w-full pl-14 pr-6 py-5 bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-red-100 dark:focus:border-red-900/30 rounded-2xl outline-none font-black text-2xl text-slate-900 dark:text-slate-100 transition-all"
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-2">Número de Parcelas</label>
              <div className="relative group">
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={installments}
                  onChange={(e) => setInstallments(parseInt(e.target.value, 10))}
                  className="w-full px-6 py-5 bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-red-100 dark:focus:border-red-900/30 rounded-2xl outline-none font-black text-2xl text-slate-900 dark:text-slate-100 transition-all"
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-2">Dias para Vencimento</label>
              <div className="relative group">
                <input
                  type="text"
                  placeholder="Ex: 15, 30, 45"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="w-full px-6 py-5 bg-slate-50 dark:bg-slate-800 border-2 border-transparent focus:border-red-100 dark:focus:border-red-900/30 rounded-2xl outline-none font-black text-2xl text-slate-900 dark:text-slate-100 transition-all"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleSimulate}
            className="w-full flex items-center justify-center gap-3 py-6 bg-slate-900 dark:bg-slate-50 text-white dark:text-slate-900 rounded-[2rem] font-black uppercase text-sm tracking-[0.2em] shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <Search className="w-5 h-5" /> Iniciar Simulação (Preview)
          </button>
        </div>
      </section>

      {/* SIMULATION RESULTS */}
      {simulationResult.length > 0 && (
        <div className="space-y-8 py-6 animate-in slide-in-from-bottom-5 duration-500">
          <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">Resultado da Projeção</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {simulationResult.map((result, index) => (
              <div key={index} className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl overflow-hidden hover:border-blue-200 dark:hover:border-blue-900/50 transition-all group">
                <div className="bg-slate-50 dark:bg-slate-800/50 p-8 border-b border-slate-100 dark:border-slate-800 relative">
                  <div className="absolute top-6 right-8 p-3 bg-white dark:bg-slate-900 rounded-xl shadow-sm text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Projectada</div>
                  <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-1">Parcela {index + 1}</p>
                  <p className="font-black text-xl text-slate-900 dark:text-slate-100 uppercase tracking-tighter mb-2">{result.mainDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}</p>
                  <p className="font-black text-4xl text-red-600 dark:text-red-500 tracking-tighter">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(result.mainDateValue)}
                  </p>
                </div>
                <div className="p-8 space-y-4">
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] flex items-center gap-2">
                    <TrendingUp className="w-3 h-3" /> Compromissos Próximos
                  </p>
                  <div className="space-y-3">
                    {result.surroundingDates.length > 0 ? (
                      result.surroundingDates.map(sd => (
                        <div key={sd.date.toISOString()} className="flex justify-between items-center group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50 p-2 rounded-xl transition-colors">
                          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{sd.date.toLocaleDateString('pt-BR')}</span>
                          <span className="text-xs font-black text-slate-900 dark:text-slate-200">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sd.value)}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] font-bold text-slate-300 dark:text-slate-700 italic">Sem botaletos vizinhos.</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

