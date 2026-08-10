import React, { useState, useEffect } from 'react';
import {
  Truck,
  DollarSign,
  XCircle,
  Percent,
  Sparkles,
  ArrowRight,
  HelpCircle
} from 'lucide-react';
import { DeliveryMetrics, View } from '../types';

interface DeliverySummaryChartProps {
  onNavigate?: (view: View) => void;
}

export const DeliverySummaryChart: React.FC<DeliverySummaryChartProps> = ({ onNavigate }) => {
  const [metrics, setMetrics] = useState<DeliveryMetrics>({
    totalContacts: 0,
    closedSalesCount: 0,
    closedSalesAmount: 0,
    unclosedSalesCount: 0,
    unclosedSalesAmount: 0,
    conversionRate: 0,
    averageTicket: 0,
    byPaymentMethod: {},
    byStatus: { Pendente: 0, 'Em Rota': 0, Entregue: 0, Nao_Fechado: 0, Cancelado: 0 },
    byUnclosedReason: {}
  });

  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch('/api/deliveries?period=month');
        if (res.ok) {
          const data = await res.json();
          if (data.metrics) {
            setMetrics(data.metrics);
          }
        }
      } catch (err) {
        console.error('[DeliverySummaryChart] Erro ao carregar métricas:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, []);

  const totalAmountAnalyzed = metrics.closedSalesAmount + metrics.unclosedSalesAmount;
  const closedPercent = totalAmountAnalyzed > 0 
    ? Math.round((metrics.closedSalesAmount / totalAmountAnalyzed) * 100) 
    : 0;
  const unclosedPercent = totalAmountAnalyzed > 0 
    ? 100 - closedPercent 
    : 0;

  const topLossReason = Object.entries(metrics.byUnclosedReason || {})
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Nenhum';

  return (
    <section className="glass-card rounded-3xl p-6 shadow-sm space-y-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-md shrink-0">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-slate-850 dark:text-slate-250 uppercase tracking-tight">
                🛵 Desempenho de Deliveries & Vendas Perdidas
              </h2>
              <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200 dark:border-emerald-800">
                <Sparkles size={10} /> IA Ativa
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Resumo financeiro das entregas fechadas vs orçamentos não convertidos (Este Mês)
            </p>
          </div>
        </div>

        {onNavigate && (
          <button
            onClick={() => onNavigate('deliveries')}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-black transition-all shadow-sm group cursor-pointer"
          >
            <span>Gestão Completa de Deliveries</span>
            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Faturamento Deliveries */}
        <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">
              Deliveries Fechados
            </span>
            <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-xl font-black text-emerald-950 dark:text-emerald-100 mt-2">
            R$ {metrics.closedSalesAmount.toFixed(2)}
          </p>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-1">
            {metrics.closedSalesCount} vendas confirmadas
          </p>
        </div>

        {/* Total Perdido */}
        <div className="p-4 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-rose-700 dark:text-rose-400 uppercase tracking-widest">
              Orçamentos Perdidos
            </span>
            <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <p className="text-xl font-black text-rose-950 dark:text-rose-100 mt-2">
            R$ {metrics.unclosedSalesAmount.toFixed(2)}
          </p>
          <p className="text-[10px] text-rose-600 dark:text-rose-400 font-bold mt-1">
            {metrics.unclosedSalesCount} consultas sem fechamento
          </p>
        </div>

        {/* Conversão */}
        <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-blue-700 dark:text-blue-400 uppercase tracking-widest">
              Taxa de Conversão
            </span>
            <Percent className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-xl font-black text-blue-950 dark:text-blue-100 mt-2">
            {metrics.conversionRate.toFixed(1)}%
          </p>
          <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold mt-1">
            {metrics.totalContacts} clientes em contato
          </p>
        </div>

        {/* Principal Motivo de Perda */}
        <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-widest">
              Top Motivo Perda
            </span>
            <HelpCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="text-sm font-black text-amber-950 dark:text-amber-100 mt-2 truncate">
            {topLossReason}
          </p>
          <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold mt-1">
            Maior gargalo de vendas
          </p>
        </div>
      </div>

      {/* Visual Comparison Bar */}
      <div className="space-y-2 pt-2">
        <div className="flex justify-between items-center text-xs font-bold">
          <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            Vendas Convertidas ({closedPercent}%)
          </span>
          <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
            Oportunidades Perdidas ({unclosedPercent}%)
          </span>
        </div>

        <div className="w-full h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
          <div
            style={{ width: `${closedPercent}%` }}
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-700"
            title={`Vendas Fechadas: R$ ${metrics.closedSalesAmount.toFixed(2)}`}
          />
          <div
            style={{ width: `${unclosedPercent}%` }}
            className="h-full bg-gradient-to-r from-rose-500 to-red-600 transition-all duration-700"
            title={`Vendas Não Fechadas: R$ ${metrics.unclosedSalesAmount.toFixed(2)}`}
          />
        </div>
      </div>
    </section>
  );
};
