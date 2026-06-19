import React, { useState, useEffect } from 'react';
import { Target, TrendingUp, AlertTriangle, Trophy, X, DollarSign } from 'lucide-react';
import { CashClosingRecord, MonthlyLimit } from '../types';

interface GoalPopupProps {
  cashClosings: CashClosingRecord[];
  onClose: () => void;
}

export const GoalPopup: React.FC<GoalPopupProps> = ({ cashClosings, onClose }) => {
  const [monthlyGoal, setMonthlyGoal] = useState<number>(40000);
  const [loading, setLoading] = useState(true);
  const [budgetStatus, setBudgetStatus] = useState<'ok' | 'busted'>('ok');
  const [todaySales, setTodaySales] = useState<number>(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch goal
        const resSettings = await fetch('/api/settings/monthly_sales_goal');
        if (resSettings.ok) {
          const setting = await resSettings.json();
          if (setting && setting.value) {
            setMonthlyGoal(Number(setting.value));
          }
        }

        // Buscar faturamento de hoje em tempo real
        try {
          const resLive = await fetch('/api/finance-agent/live-closing');
          if (resLive.ok) {
            const liveData = await resLive.json();
            if (liveData && liveData.isOffline) {
              const saved = localStorage.getItem('belafarma_live_sales_cache');
              if (saved) {
                const cached = JSON.parse(saved);
                setTodaySales(cached.totalSales || 0);
              }
            } else {
              setTodaySales(liveData.totalSales || 0);
            }
          }
        } catch (errLive) {
          console.warn('[Goal Popup] Erro ao buscar vendas em tempo real de hoje:', errLive);
        }

        // Fetch limits and orders to calculate budget
        const resLimits = await fetch('/api/all-data');
        if (resLimits.ok) {
          const data = await resLimits.json();
          const limits: MonthlyLimit[] = data.monthlyLimits?.documents || [];
          const orders = data.orders?.documents || [];
          
          const now = new Date();
          const currentMonthName = now.toLocaleString('pt-BR', { month: 'long' });
          const currentLimit = limits.find(l => l.month === now.getMonth() + 1 && l.year === now.getFullYear());

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

          if (currentLimit && totalSpentThisMonth > currentLimit.limit) {
            setBudgetStatus('busted');
          }
        }
      } catch (err) {
        console.error('Error fetching data for goal popup:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return null;

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const dailyGoal = monthlyGoal / daysInMonth;

  // Filtra fechamentos do mês atual
  const monthClosings = cashClosings.filter(c => {
    if (!c.date) return false;
    const datePart = c.date.split('T')[0];
    const [yearStr, monthStr] = datePart.split('-');
    return parseInt(yearStr) === currentYear && (parseInt(monthStr) - 1) === currentMonth;
  });

  const totalSalesThisMonth = monthClosings.reduce((acc, curr) => acc + (curr.totalSales || 0), 0) + todaySales;
  const monthlyProgressPercent = Math.min((totalSalesThisMonth / monthlyGoal) * 100, 100);

  // Vendas de ontem
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yyyy = yesterday.getFullYear();
  const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
  const dd = String(yesterday.getDate()).padStart(2, '0');
  const yesterdayStr = `${yyyy}-${mm}-${dd}`;
  const yesterdayClosing = cashClosings.find(c => c.date && c.date.split('T')[0] === yesterdayStr);
  const yesterdaySales = yesterdayClosing ? (yesterdayClosing.totalSales || 0) : 0;
  
  const hitGoalYesterday = yesterdaySales >= dailyGoal;
  
  // Cálculo do provisionamento
  let provisionExtra = 0;
  if (hitGoalYesterday) {
    provisionExtra = 50; // Base para bater a meta
    const surplus = yesterdaySales - dailyGoal;
    if (surplus > 0) {
      const extraHundreds = Math.floor(surplus / 100);
      provisionExtra += extraHundreds * 10;
    }
  }

  // Se orçamento estourado, provisão vira zero
  const isBudgetBusted = budgetStatus === 'busted';
  if (isBudgetBusted) {
    provisionExtra = 0;
  }

  const yesterdayProgressPercent = Math.min((yesterdaySales / dailyGoal) * 100, 100);
  const hitGoalToday = todaySales >= dailyGoal;
  const todayProgressPercent = Math.min((todaySales / dailyGoal) * 100, 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[2rem] shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
          <X className="w-5 h-5 text-slate-500" />
        </button>

        <div className="p-8 pb-6 bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-md">
            <Trophy className="w-8 h-8 text-yellow-300 drop-shadow-md" />
          </div>
          <h2 className="text-3xl font-black uppercase tracking-tighter drop-shadow-md">Resumo das Metas</h2>
          <p className="text-blue-100 font-medium text-sm mt-1">Acompanhamento rumo ao crescimento!</p>
        </div>

        <div className="p-8 space-y-6">
          {/* Mês Atual */}
          <div className="space-y-3">
            <div className="flex justify-between items-end">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-blue-500" /> Meta Mensal
                </p>
                <p className="text-2xl font-black text-slate-800 dark:text-slate-100 leading-none mt-1">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSalesThisMonth)}
                </p>
              </div>
              <p className="text-xs font-bold text-slate-500">
                de {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(monthlyGoal)}
              </p>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
              <div 
                className="bg-blue-500 h-full rounded-full transition-all duration-1000 ease-out" 
                style={{ width: `${monthlyProgressPercent}%` }}
              />
            </div>
          </div>

          {/* Ontem & Hoje */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Ontem */}
            <div className="space-y-2.5 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> Vendas de Ontem
                </p>
                <p className={`text-xl font-black leading-none mt-1.5 ${hitGoalYesterday ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'}`}>
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(yesterdaySales)}
                </p>
              </div>
              <div className="space-y-2 mt-2">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                  <span>Meta Diária</span>
                  <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dailyGoal)}</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${hitGoalYesterday ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                    style={{ width: `${yesterdayProgressPercent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Hoje */}
            <div className="space-y-2.5 p-4 bg-blue-50/20 dark:bg-blue-950/10 rounded-2xl border border-blue-100/30 dark:border-blue-950/20 flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-1.5 animate-pulse">
                  <Target className="w-3.5 h-3.5 text-blue-500" /> Vendas de Hoje
                </p>
                <p className={`text-xl font-black leading-none mt-1.5 ${hitGoalToday ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'}`}>
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(todaySales)}
                </p>
              </div>
              <div className="space-y-2 mt-2">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                  <span>Meta Diária</span>
                  <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dailyGoal)}</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${hitGoalToday ? 'bg-emerald-500' : 'bg-blue-500'}`} 
                    style={{ width: `${todayProgressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Frase Motivacional */}
          <div className="text-center space-y-2">
            {hitGoalYesterday ? (
              isBudgetBusted ? (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-2xl border border-amber-200 dark:border-amber-800">
                  <p className="text-sm font-bold flex items-center justify-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4" /> Meta batida, mas orçamento estourado!
                  </p>
                  <p className="text-xs">Sem provisão extra para o prolabore hoje. Vamos segurar as compras e focar na liquidação de estoque para reequilibrar as contas!</p>
                </div>
              ) : (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                  <p className="text-sm font-bold flex items-center justify-center gap-2 mb-1">
                    <DollarSign className="w-4 h-4" /> 🚀 Parabéns! Meta de ontem destruída!
                  </p>
                  <p className="text-xs">R$ {provisionExtra.toFixed(2)} provisionados para os atrasados. Dica: foque nas promoções de encarte hoje para manter o ritmo forte!</p>
                </div>
              )
            ) : (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-2xl border border-blue-200 dark:border-blue-800">
                <p className="text-sm font-bold mb-1">💪 Faltou um pouco ontem, mas o jogo vira rápido!</p>
                <p className="text-xs">Lembre a equipe de oferecer vitaminas e combos no balcão. Bora focar nas vendas sugestivas para bater a meta hoje!</p>
              </div>
            )}
          </div>
          
          <button onClick={onClose} className="w-full py-4 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-black rounded-xl uppercase tracking-widest text-xs hover:bg-slate-800 dark:hover:bg-white transition-colors">
            Vamos Trabalhar!
          </button>
        </div>
      </div>
    </div>
  );
};
