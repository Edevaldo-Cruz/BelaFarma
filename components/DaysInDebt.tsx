import React, { useState, useMemo } from 'react';
import { DollarSign, Search, Plus, Calendar as CalendarIcon, TrendingUp, AlertCircle, ArrowRight, Wallet, Receipt } from 'lucide-react';
import { Boleto, Order, FixedAccount, FixedAccountPayment } from '../types';
import Calendar from 'react-calendar';
type CalendarValue = Date | Date[] | null;
import 'react-calendar/dist/Calendar.css';
import './DaysInDebt.css';

interface DaysInDebtProps {
  boletos: Boleto[];
  orders: Order[];
  fixedAccounts: FixedAccount[];
}

interface DebtCardInfo {
  mainDate: Date;
  mainDateValue: number;
  surroundingDates: {
    date: Date;
    value: number;
  }[];
}

export const DaysInDebt: React.FC<DaysInDebtProps> = ({ boletos, orders, fixedAccounts }) => {
  const [selectedDate, setSelectedDate] = useState<CalendarValue>(new Date());
  const [totalValue, setTotalValue] = useState(0);
  const [totalValueInput, setTotalValueInput] = useState('0,00');
  const [installments, setInstallments] = useState(1);
  const [days, setDays] = useState<string>('15');
  const [simulationResult, setSimulationResult] = useState<DebtCardInfo[]>([]);
  const [fixedPayments, setFixedPayments] = useState<FixedAccountPayment[]>([]);

  // Fetch fixed account payments for current month
  React.useEffect(() => {
    const fetchFixedPayments = async () => {
      try {
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const response = await fetch(`/api/fixed-account-payments?month=${month}`);
        if (!response.ok) throw new Error('Failed to fetch fixed payments');
        const data = await response.json();
        setFixedPayments(data);
      } catch (error) {
        console.error('Error fetching fixed payments:', error);
      }
    };

    fetchFixedPayments();
  }, []);

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

  const handleSimulate = () => {
    const installmentValue = totalValue / (installments || 1);
    const daysArray = days.split(',').map(d => parseInt(d.trim(), 10)).filter(d => !isNaN(d));
    const today = new Date();
    
    const results: DebtCardInfo[] = daysArray.map(day => {
      const mainDate = new Date(today);
      mainDate.setDate(today.getDate() + day);
      mainDate.setHours(0, 0, 0, 0);

      const mainDateBoletos = boletos.filter(b => {
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
    const dates = new Set(boletos.map(b => {
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

  // Calculate values per day for color intensity
  const dayValues = useMemo(() => {
    const values = new Map<string, number>();
    
    // Add boleto values
    boletos.forEach(b => {
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

  const getTileClassName = ({ date, view }: { date: Date, view: string }) => {
    // Only apply logic for month view to avoid performance issues
    if (view !== 'month') return null;

    // Use UTC date string YYYY-MM-DD for comparison to match database format purely
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const dayValue = dayValues.get(dateStr);
    
    if (dayValue && dayValue > 0 && avgValue > 0) {
      // Calculate how many standard deviations away from the mean
      const deviationFromMean = (dayValue - avgValue) / (stdDeviation || 1);
      
      // Classification based on standard deviations:
      // Much below average (< -1 std dev): Very light orange
      // Below average (-1 to -0.5 std dev): Light orange
      // Near average (-0.5 to 0.5 std dev): Yellow/neutral
      // Above average (0.5 to 1 std dev): Light red
      // Well above average (1 to 1.5 std dev): Medium red
      // Much above average (> 1.5 std dev): Dark red
      
      if (deviationFromMean >= 1.5) return 'has-payment deviation-very-high';
      if (deviationFromMean >= 1.0) return 'has-payment deviation-high';
      if (deviationFromMean >= 0.5) return 'has-payment deviation-above-avg';
      if (deviationFromMean >= -0.5) return 'has-payment deviation-near-avg';
      if (deviationFromMean >= -1.0) return 'has-payment deviation-below-avg';
      return 'has-payment deviation-very-low';
    }
    
    return null;
  };

  const selectedDateBoletos = useMemo(() => {
    if (!selectedDate || Array.isArray(selectedDate)) return [];
    
    // Construct local date string from the selected calendar date
    const selectedD = selectedDate as Date;
    const year = selectedD.getFullYear();
    const month = String(selectedD.getMonth() + 1).padStart(2, '0');
    const day = String(selectedD.getDate()).padStart(2, '0');
    const selectedDateStr = `${year}-${month}-${day}`;

    const matchedBoletos = boletos.filter(b => {
      // Comparação direta de string 'YYYY-MM-DD'
      return b.due_date.split('T')[0] === selectedDateStr;
    });

    // Use fixed payments instead of fixed accounts
    const matchedFixedPayments = fixedPayments
      .filter(fp => fp.status === 'Pendente' && fp.dueDate === selectedDateStr)
      .map(fp => ({
        id: fp.id,
        supplierName: `[FIXA] ${fp.fixedAccountName}`,
        value: fp.value,
        due_date: fp.dueDate,
        status: 'Pendente' as any
      }));

    return [...matchedBoletos, ...matchedFixedPayments];
  }, [selectedDate, boletos, fixedPayments]);

  return (
    <div className="space-y-12 animate-in fade-in duration-700 pb-20">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter">Dias Comprometidos</h1>
          <p className="text-slate-500 dark:text-slate-400 font-bold italic text-sm">Controle de fluxo de caixa e compromissos futuros.</p>
        </div>
        <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/10 px-6 py-3 rounded-2xl border border-red-100 dark:border-red-900/30">
          <TrendingUp className="w-5 h-5 text-red-600 dark:text-red-400" />
          <span className="text-sm font-black text-red-700 dark:text-red-400 uppercase tracking-widest">Compromissos Ativos</span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* CALENDAR SECTION */}
        <section className="space-y-4">
          <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">Calendário de Pagamentos</h2>
          <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-xl transition-all duration-300 hover:shadow-2xl">
            <Calendar
              onChange={setSelectedDate}
              value={selectedDate}
              tileClassName={getTileClassName}
              className="w-full"
            />
          </div>
        </section>

        {/* DETAILS SECTION */}
        <section className="space-y-4">
          <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] ml-2">
            Detalhes: {selectedDate && !Array.isArray(selectedDate) 
              ? selectedDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' }) 
              : 'Selecione'}
          </h2>
          <div className="space-y-4 scrollbar-hide max-h-[460px] overflow-y-auto pr-2">
            {selectedDateBoletos.length > 0 ? (
              selectedDateBoletos.map(boleto => (
                <div key={boleto.id} className="group bg-white dark:bg-slate-900/50 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 flex justify-between items-center transition-all hover:border-red-200 dark:hover:border-red-900/50 hover:shadow-md">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl group-hover:scale-110 transition-transform">
                      <Receipt className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter text-lg">{boleto.supplierName}</p>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                        Vencimento em {boleto.due_date.split('T')[0].split('-').reverse().join('/')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-black text-xl text-red-600 dark:text-red-400">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(boleto.value)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-slate-50 dark:bg-slate-800/20 p-12 rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-slate-800 text-center flex flex-col items-center gap-4">
                <AlertCircle className="w-10 h-10 text-slate-300 dark:text-slate-700" />
                <p className="text-slate-400 dark:text-slate-500 font-bold uppercase text-[10px] tracking-widest">Nenhum compromisso para este dia.</p>
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
