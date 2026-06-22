import React, { useState, useMemo } from 'react';
import { X, DollarSign, TrendingUp, AlertTriangle, CheckCircle, Info, Calendar, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import { Boleto, BoletoStatus, MonthlyLimit } from '../types';
import { calculateWeeklyBudgetsCascade, WeekPeriod, MonthBudgetStats } from '../utils';

interface BoletoBudgetSummaryModalProps {
  boletos: Boleto[];
  monthlyLimits: MonthlyLimit[];
  onClose: () => void;
}

const monthsOrder = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

const getStatusStyles = (status: 'safe' | 'warning' | 'danger' | 'no-budget') => {
  switch (status) {
    case 'safe':
      return {
        bg: 'bg-emerald-50 dark:bg-emerald-950/20',
        border: 'border-emerald-100 dark:border-emerald-900/30',
        text: 'text-emerald-700 dark:text-emerald-400',
        progressBg: 'bg-emerald-500',
        badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
        label: 'Margem Segura',
        weekBg: 'bg-emerald-50 dark:bg-emerald-950/10',
        weekBorder: 'border-emerald-200 dark:border-emerald-900/30',
      };
    case 'warning':
      return {
        bg: 'bg-amber-50 dark:bg-amber-950/20',
        border: 'border-amber-100 dark:border-amber-900/30',
        text: 'text-amber-700 dark:text-amber-400',
        progressBg: 'bg-amber-500',
        badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
        label: 'Limite Próximo',
        weekBg: 'bg-amber-50 dark:bg-amber-950/10',
        weekBorder: 'border-amber-200 dark:border-amber-900/30',
      };
    case 'danger':
      return {
        bg: 'bg-red-50 dark:bg-red-950/20',
        border: 'border-red-100 dark:border-red-900/30',
        text: 'text-red-700 dark:text-red-400',
        progressBg: 'bg-red-600',
        badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
        label: 'Estourou o Limite',
        weekBg: 'bg-red-50 dark:bg-red-950/10',
        weekBorder: 'border-red-200 dark:border-red-900/30',
      };
    case 'no-budget':
    default:
      return {
        bg: 'bg-slate-50 dark:bg-slate-800/40',
        border: 'border-slate-100 dark:border-slate-800',
        text: 'text-slate-500 dark:text-slate-400',
        progressBg: 'bg-slate-300 dark:bg-slate-700',
        badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        label: 'Sem Limite',
        weekBg: 'bg-slate-50 dark:bg-slate-800/20',
        weekBorder: 'border-slate-100 dark:border-slate-800',
      };
  }
};

interface WeekRowProps {
  week: WeekPeriod;
  monthIndex: number;
  year: number;
  isCurrentWeek: boolean;
}

const WeekRow: React.FC<WeekRowProps> = ({ week, monthIndex, year, isCurrentWeek }) => {
  const styles = getStatusStyles(week.status);
  const hasBudget = week.status !== 'no-budget';
  const isExceeded = week.available < 0;
  const refLimit = week.limit > 0 ? week.limit : 1;
  const pct = Math.min((week.spent / refLimit) * 100, 100);

  const pad = (n: number) => String(n).padStart(2, '0');
  const mStr = pad(monthIndex + 1);
  const label = `${pad(week.startDay)}/${mStr} – ${pad(week.endDay)}/${mStr}`;

  return (
    <div className={`
      flex flex-col gap-2 p-3 rounded-xl border
      ${styles.weekBg} ${styles.weekBorder}
      ${isCurrentWeek ? 'ring-2 ring-offset-1 ring-indigo-400 dark:ring-indigo-500' : ''}
      transition-all
    `}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isCurrentWeek && (
            <span className="px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 text-[9px] font-black uppercase tracking-wider">
              Atual
            </span>
          )}
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{label}</span>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${styles.badge}`}>
            {styles.label}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="text-right">
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 block">GASTO</span>
            <span className="font-extrabold text-slate-700 dark:text-slate-200">{formatCurrency(week.spent)}</span>
          </div>
          <div className="text-right">
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 block">
              {isExceeded ? 'EXCEDENTE' : 'DISPONÍVEL'}
            </span>
            <span className={`font-extrabold ${isExceeded ? 'text-red-600 dark:text-red-400' : hasBudget ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
              {hasBudget ? formatCurrency(Math.abs(week.available)) : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {hasBudget && (
        <div className="space-y-1">
          <div className="w-full bg-slate-200/60 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${styles.progressBg}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] font-bold text-slate-400">
            <span>{Math.round(pct)}% utilizado</span>
            <span>{formatCurrency(week.spent)} / {formatCurrency(week.limit)}</span>
          </div>
        </div>
      )}

      {isExceeded && (
        <div className="flex items-center gap-1 text-[9px] text-red-500 dark:text-red-400 font-semibold">
          <ArrowRight className="w-3 h-3" />
          <span>Excedente de {formatCurrency(Math.abs(week.available))} propagado para a semana seguinte</span>
        </div>
      )}
    </div>
  );
};



export const BoletoBudgetSummaryModal: React.FC<BoletoBudgetSummaryModalProps> = ({
  boletos,
  monthlyLimits,
  onClose
}) => {
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());

  // Calcula os orçamentos semanais em cascata para o ano selecionado
  const { monthlyStats, yearTotal, yearBudget } = useMemo(() => {
    interface MonthStat {
      monthIndex: number;
      monthName: string;
      totalSpent: number;
      budgetLimit: number;
      weeks: WeekPeriod[];
      excessToNextMonth: number;
      status: 'safe' | 'warning' | 'danger' | 'no-budget';
    }

    const earliestYear = monthlyLimits.length > 0
      ? Math.min(...monthlyLimits.map(l => l.year))
      : currentYear;

    const allStats = calculateWeeklyBudgetsCascade(
      boletos,
      monthlyLimits,
      Math.min(earliestYear, currentYear),
      currentYear,
      11 // Calcula o ano todo
    );

    const stats: MonthStat[] = Array.from({ length: 12 }, (_, index) => {
      const monthNumber = index + 1;
      const key = `${currentYear}-${monthNumber}`;
      const monthData = allStats[key];
      const limitObj = monthlyLimits.find(l => l.month === monthNumber && l.year === currentYear);
      const budgetLimit = limitObj ? limitObj.limit : 0;

      if (!monthData) {
        return {
          monthIndex: index,
          monthName: monthsOrder[index],
          totalSpent: 0,
          budgetLimit,
          weeks: [] as WeekPeriod[],
          excessToNextMonth: 0,
          status: 'no-budget' as const,
        };
      }

      // Status geral do mês (baseado na soma total vs. limite mensal)
      let status: 'safe' | 'warning' | 'danger' | 'no-budget' = 'no-budget';
      if (budgetLimit > 0) {
        const pct = (monthData.totalSpent / budgetLimit) * 100;
        if (pct < 80) status = 'safe';
        else if (pct <= 100) status = 'warning';
        else status = 'danger';
      }

      return {
        monthIndex: index,
        monthName: monthsOrder[index],
        totalSpent: monthData.totalSpent,
        budgetLimit,
        weeks: monthData.weeks as WeekPeriod[],
        excessToNextMonth: monthData.excessToNextMonth,
        status,
      };
    });

    const yearTotal = stats.reduce((sum, s) => sum + s.totalSpent, 0);
    const yearBudget = stats.reduce((sum, s) => sum + s.budgetLimit, 0);

    return { monthlyStats: stats, yearTotal, yearBudget };
  }, [boletos, monthlyLimits, currentYear]);



  const today = new Date();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-[2rem] shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="p-6 md:p-8 bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 relative">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-600 rounded-2xl shadow-lg shadow-red-600/30">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tight">Painel de Orçamentos</h2>
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mt-0.5">Visão consolidada mensal</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Seletor de Ano */}
            <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-xl">
              <Calendar className="w-4 h-4 text-slate-400" />
              <select
                value={currentYear}
                onChange={e => setCurrentYear(Number(e.target.value))}
                className="bg-transparent text-white font-bold text-sm focus:outline-none cursor-pointer"
              >
                {[2023, 2024, 2025, 2026].map(y => (
                  <option key={y} value={y} className="bg-slate-900 text-white font-semibold">
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={onClose}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-full transition-colors"
              title="Fechar"
            >
              <X className="w-5 h-5 text-slate-400 hover:text-white" />
            </button>
          </div>
        </div>

        {/* Resumo Anual */}
        <div className="px-8 py-4 bg-slate-50 dark:bg-slate-950/20 border-b border-slate-100 dark:border-slate-800 grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="p-3">
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Soma Total do Ano</p>
            <p className="text-lg font-black text-slate-800 dark:text-slate-100 mt-0.5">{formatCurrency(yearTotal)}</p>
          </div>
          <div className="p-3">
            <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-500 uppercase tracking-widest">Teto Orçado no Ano</p>
            <p className="text-lg font-black text-indigo-600 dark:text-indigo-400 mt-0.5">{yearBudget > 0 ? formatCurrency(yearBudget) : 'Não definido'}</p>
          </div>
          <div className="p-3">
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Saldo Anual</p>
            <p className={`text-lg font-black mt-0.5 ${yearTotal > yearBudget && yearBudget > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {yearBudget > 0 ? formatCurrency(yearBudget - yearTotal) : '—'}
            </p>
          </div>
        </div>

        {/* Listagem de Meses com Semanas */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-3">
          {monthlyStats
            .filter(stat => {
              if (currentYear !== today.getFullYear()) return true;
              return stat.monthIndex >= today.getMonth() - 1;
            })
            .map(stat => {
              const styles = getStatusStyles(stat.status);
              const hasBudget = stat.status !== 'no-budget';
              const isExpanded = expandedMonths.has(stat.monthIndex);
              const isCurrentMonth = currentYear === today.getFullYear() && stat.monthIndex === today.getMonth();
              const difference = Math.abs(stat.budgetLimit - stat.totalSpent);
              const isExceeded = stat.totalSpent > stat.budgetLimit && stat.budgetLimit > 0;

              return (
                <div
                  key={stat.monthIndex}
                  className={`rounded-[1.5rem] border ${styles.bg} ${styles.border} shadow-sm overflow-hidden transition-all duration-200`}
                >
                  {/* Cabeçalho do mês */}
                  <div
                    className="w-full p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 text-left"
                  >
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between md:justify-start gap-3">
                        <div className="flex items-center gap-2">
                          {isCurrentMonth && (
                            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 text-[10px] font-black uppercase tracking-wider">
                              Mês Atual
                            </span>
                          )}
                          <h3 className="text-base font-black text-slate-800 dark:text-slate-100 capitalize">
                            {stat.monthName}
                          </h3>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${styles.badge}`}>
                          {styles.label}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block">SOMA BOLETOS</span>
                          <span className="font-extrabold text-slate-700 dark:text-slate-200">{formatCurrency(stat.totalSpent)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block">LIMITE ORÇADO</span>
                          <span className="font-extrabold text-slate-700 dark:text-slate-200">
                            {hasBudget ? formatCurrency(stat.budgetLimit) : 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block">
                            {isExceeded ? 'EXCEDENTE' : 'RESTANTE'}
                          </span>
                          <span className={`font-extrabold ${isExceeded ? 'text-red-600 dark:text-red-400' : hasBudget ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                            {hasBudget ? formatCurrency(difference) : 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block">SEMANAS</span>
                          <span className="font-extrabold text-slate-700 dark:text-slate-200">
                            {stat.weeks.length > 0 ? `${stat.weeks.length} semanas` : '—'}
                          </span>
                        </div>
                      </div>

                      {hasBudget && (
                        <div className="space-y-1.5">
                          <div className="w-full bg-slate-200/60 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${styles.progressBg}`}
                              style={{ width: `${Math.min((stat.totalSpent / stat.budgetLimit) * 100, 100)}%` }}
                            />
                          </div>
                          <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                            <span>{Math.round((stat.totalSpent / stat.budgetLimit) * 100)}% utilizado</span>
                            <span>{formatCurrency(stat.totalSpent)} / {formatCurrency(stat.budgetLimit)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="hidden md:flex flex-shrink-0 items-center justify-center w-12 h-12 rounded-2xl bg-white/60 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 gap-2 flex-col">
                      {stat.status === 'safe' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                      {stat.status === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-500 animate-pulse" />}
                      {stat.status === 'danger' && <AlertTriangle className="w-5 h-5 text-red-500 animate-bounce" />}
                      {stat.status === 'no-budget' && <Info className="w-5 h-5 text-slate-400" />}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Footer */}
        <div className="p-5 bg-slate-50 dark:bg-slate-800/10 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400 font-bold">
          <span>* Semanas civis (Dom–Sáb) · Excessos não acumulam saldo positivo</span>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 rounded-xl transition-all active:scale-95 uppercase tracking-widest text-[10px] font-black"
          >
            Fechar Painel
          </button>
        </div>

      </div>
    </div>
  );
};
