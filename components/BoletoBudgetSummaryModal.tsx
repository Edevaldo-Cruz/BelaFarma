import React, { useState, useMemo } from 'react';
import { X, DollarSign, TrendingUp, AlertTriangle, CheckCircle, Info, Calendar } from 'lucide-react';
import { Boleto, BoletoStatus, MonthlyLimit } from '../types';

interface BoletoBudgetSummaryModalProps {
  boletos: Boleto[];
  monthlyLimits: MonthlyLimit[];
  onClose: () => void;
}

const monthsOrder = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const BoletoBudgetSummaryModal: React.FC<BoletoBudgetSummaryModalProps> = ({
  boletos,
  monthlyLimits,
  onClose
}) => {
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());

  // Agrupa e calcula as somas por mês para o ano selecionado
  const { monthlyStats, yearTotal, yearPaid, yearPending, yearBudget } = useMemo(() => {
    const stats = Array.from({ length: 12 }, (_, index) => {
      const monthNumber = index + 1; // 1-indexed (1 = Janeiro)
      
      // Filtra boletos deste mês e ano
      const monthBoletos = boletos.filter(b => {
        const d = new Date(b.due_date + 'T00:00:00');
        return d.getFullYear() === currentYear && (d.getMonth() + 1) === monthNumber;
      });

      const totalValue = monthBoletos.reduce((sum, b) => sum + b.value, 0);
      const paidValue = monthBoletos
        .filter(b => b.status === BoletoStatus.PAGO)
        .reduce((sum, b) => sum + b.value, 0);
      const pendingValue = totalValue - paidValue;

      const totalCount = monthBoletos.length;
      const paidCount = monthBoletos.filter(b => b.status === BoletoStatus.PAGO).length;
      const pendingCount = totalCount - paidCount;

      // Busca o limite correspondente
      const limitObj = monthlyLimits.find(l => l.month === monthNumber && l.year === currentYear);
      const budgetLimit = limitObj ? limitObj.limit : 0;

      // Determina o percentual de uso do orçamento e a cor correspondente
      let percentUsed = 0;
      let status: 'safe' | 'warning' | 'danger' | 'no-budget' = 'no-budget';

      if (budgetLimit > 0) {
        percentUsed = (totalValue / budgetLimit) * 100;
        if (percentUsed < 80) {
          status = 'safe';
        } else if (percentUsed <= 100) {
          status = 'warning';
        } else {
          status = 'danger';
        }
      }

      return {
        monthIndex: index,
        monthName: monthsOrder[index],
        totalValue,
        paidValue,
        pendingValue,
        totalCount,
        paidCount,
        pendingCount,
        budgetLimit,
        percentUsed,
        status
      };
    });

    const yearTotal = stats.reduce((sum, s) => sum + s.totalValue, 0);
    const yearPaid = stats.reduce((sum, s) => sum + s.paidValue, 0);
    const yearPending = stats.reduce((sum, s) => sum + s.pendingValue, 0);
    const yearBudget = stats.reduce((sum, s) => sum + s.budgetLimit, 0);

    return {
      monthlyStats: stats,
      yearTotal,
      yearPaid,
      yearPending,
      yearBudget
    };
  }, [boletos, monthlyLimits, currentYear]);

  // Retorna os estilos CSS adequados baseados no status do orçamento
  const getStatusStyles = (status: 'safe' | 'warning' | 'danger' | 'no-budget') => {
    switch (status) {
      case 'safe':
        return {
          bg: 'bg-emerald-50 dark:bg-emerald-950/20',
          border: 'border-emerald-100 dark:border-emerald-900/30',
          text: 'text-emerald-700 dark:text-emerald-400',
          progressBg: 'bg-emerald-500',
          badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
          label: 'Margem Segura'
        };
      case 'warning':
        return {
          bg: 'bg-amber-50 dark:bg-amber-950/20',
          border: 'border-amber-100 dark:border-amber-900/30',
          text: 'text-amber-700 dark:text-amber-400',
          progressBg: 'bg-amber-500',
          badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
          label: 'Limite Próximo'
        };
      case 'danger':
        return {
          bg: 'bg-red-50 dark:bg-red-950/20',
          border: 'border-red-100 dark:border-red-900/30',
          text: 'text-red-700 dark:text-red-400',
          progressBg: 'bg-red-600',
          badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
          label: 'Estourou o Limite'
        };
      case 'no-budget':
      default:
        return {
          bg: 'bg-slate-50 dark:bg-slate-800/40',
          border: 'border-slate-100 dark:border-slate-800',
          text: 'text-slate-500 dark:text-slate-400',
          progressBg: 'bg-slate-300 dark:bg-slate-700',
          badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
          label: 'Sem Limite'
        };
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

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
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mt-0.5">Somas de boletos por mês vs Orçamento estabelecido</p>
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
        <div className="px-8 py-4 bg-slate-50 dark:bg-slate-950/20 border-b border-slate-100 dark:border-slate-800 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3">
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Soma Total do Ano</p>
            <p className="text-lg font-black text-slate-800 dark:text-slate-100 mt-0.5">{formatCurrency(yearTotal)}</p>
          </div>
          <div className="p-3">
            <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-500 uppercase tracking-widest">Total Pago no Ano</p>
            <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{formatCurrency(yearPaid)}</p>
          </div>
          <div className="p-3">
            <p className="text-[10px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-widest">A Pagar no Ano</p>
            <p className="text-lg font-black text-amber-600 dark:text-amber-400 mt-0.5">{formatCurrency(yearPending)}</p>
          </div>
          <div className="p-3">
            <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-500 uppercase tracking-widest">Teto Orçado no Ano</p>
            <p className="text-lg font-black text-indigo-600 dark:text-indigo-400 mt-0.5">{yearBudget > 0 ? formatCurrency(yearBudget) : 'Não definido'}</p>
          </div>
        </div>

        {/* Listagem de Meses */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {monthlyStats.map(stat => {
              const styles = getStatusStyles(stat.status);
              const isExceeded = stat.status === 'danger';
              const hasBudget = stat.status !== 'no-budget';
              
              // Calcula diferença absoluta
              const difference = Math.abs(stat.budgetLimit - stat.totalValue);

              return (
                <div
                  key={stat.monthIndex}
                  className={`p-5 rounded-[1.5rem] border ${styles.bg} ${styles.border} transition-all hover:scale-[1.01] duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm`}
                >
                  <div className="flex-1 space-y-2.5">
                    {/* Linha superior: Nome do mês e badge de orçamento */}
                    <div className="flex items-center justify-between md:justify-start gap-3">
                      <h3 className="text-base font-black text-slate-800 dark:text-slate-100 capitalize">
                        {stat.monthName}
                      </h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${styles.badge}`}>
                        {styles.label}
                      </span>
                    </div>

                    {/* Linha do meio: Valores */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block">SOMA BOLETOS</span>
                        <span className="font-extrabold text-slate-700 dark:text-slate-200">{formatCurrency(stat.totalValue)}</span>
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
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 block">DOCUMENTOS</span>
                        <span className="font-extrabold text-slate-700 dark:text-slate-200">
                          {stat.totalCount > 0 ? (
                            <>
                              {stat.totalCount} <span className="text-[10px] text-slate-400 font-medium">({stat.paidCount} pagos, {stat.pendingCount} pend.)</span>
                            </>
                          ) : (
                            'Nenhum'
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Barra de Progresso */}
                    {hasBudget && (
                      <div className="space-y-1.5">
                        <div className="w-full bg-slate-200/60 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${styles.progressBg}`}
                            style={{ width: `${Math.min(stat.percentUsed, 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                          <span>{Math.round(stat.percentUsed)}% utilizado</span>
                          <span>{formatCurrency(stat.totalValue)} / {formatCurrency(stat.budgetLimit)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Ícone Lateral Informativo (Mobile-hidden ou lateral) */}
                  <div className="hidden md:flex flex-shrink-0 items-center justify-center w-12 h-12 rounded-2xl bg-white/60 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                    {stat.status === 'safe' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                    {stat.status === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-500 animate-pulse" />}
                    {stat.status === 'danger' && <AlertTriangle className="w-5 h-5 text-red-500 animate-bounce" />}
                    {stat.status === 'no-budget' && <Info className="w-5 h-5 text-slate-400" />}
                  </div>

                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 bg-slate-50 dark:bg-slate-800/10 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400 font-bold">
          <span>* Somas baseadas na data de vencimento dos boletos.</span>
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
