import React, { useState, useEffect, useRef, useId, useCallback } from 'react';
import {
  Truck,
  Store,
  X,
  RefreshCw,
  Printer,
  MapPin,
  Clock,
  Calendar,
  TrendingUp,
  Package,
  CreditCard,
  MessageCircle
} from 'lucide-react';
import { useToast } from '../ToastContext';

interface DeliveryAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialStartDate?: string;
  initialEndDate?: string;
}

interface AnalyticsData {
  period: { dataInicio: string; dataFim: string };
  comparison: {
    delivery: { count: number; total: number; avgTicket: number; shareCountPct: number; shareRevenuePct: number };
    local: { count: number; total: number; avgTicket: number; shareCountPct: number; shareRevenuePct: number };
    grandTotal: number;
    grandCount: number;
  };
  byNeighborhood: Array<{
    neighborhood: string;
    count: number;
    total: number;
    units: number;
    avgTicket: number;
    shareCountPct: number;
    shareRevenuePct: number;
  }>;
  byHour: Array<{ hour: number; label: string; count: number; total: number }>;
  byWeekday: Array<{ day: number; label: string; count: number; total: number }>;
  byChannel: Array<{ channel: string; count: number; total: number; avgTicket: number; sharePct: number }>;
  byPayment: Array<{ method: string; count: number; total: number; sharePct: number }>;
  topProducts: Array<{ code: string; name: string; total_qty: number; orders_count: number; total_revenue: number }>;
  deliveries: Array<{
    id: string;
    sale_date: string;
    sale_time: string;
    total_value: number;
    payment_method: string;
    customer_name: string;
    seller_name: string;
    neighborhood: string;
    channel: string;
    total_units: number;
  }>;
}

function getTodayYMD() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtMoney(v: number) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDateBR(ymd: string) {
  return ymd ? ymd.split('-').reverse().join('/') : '--/--/----';
}

const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  TELEFONE: 'Telefone',
  BALCAO: 'Balcão',
  IFOOD: 'iFood'
};

export const DeliveryAnalyticsModal: React.FC<DeliveryAnalyticsModalProps> = ({
  isOpen,
  onClose,
  initialStartDate,
  initialEndDate
}) => {
  const { addToast } = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const uid = useId();

  const [preset, setPreset] = useState<'HOJE' | 'ONTEM' | '7DIAS' | 'MES' | 'CUSTOM'>('HOJE');
  const [startDate, setStartDate] = useState<string>(initialStartDate || getTodayYMD());
  const [endDate, setEndDate] = useState<string>(initialEndDate || getTodayYMD());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (isOpen) {
      if (!dlg.open) {
        try {
          dlg.showModal();
        } catch {}
      }
    } else if (dlg.open) {
      dlg.close();
    }
  }, [isOpen]);

  const fetchAnalytics = useCallback(async (sDate: string, eDate: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ dataInicio: sDate, dataFim: eDate });
      const res = await fetch(`/api/erp/sales/delivery-analytics?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setData(json.data);
          return;
        }
      }
      addToast('Não foi possível carregar os dados analíticos de entregas.', 'error');
    } catch {
      addToast('Erro de conexão ao carregar relatório de entregas.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (!isOpen) return;
    const s = initialStartDate || getTodayYMD();
    const e = initialEndDate || s;
    setStartDate(s);
    setEndDate(e);
    fetchAnalytics(s, e);
  }, [isOpen, initialStartDate, initialEndDate, fetchAnalytics]);

  const applyPreset = (p: 'HOJE' | 'ONTEM' | '7DIAS' | 'MES') => {
    setPreset(p);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    let s = fmt(now);
    let e = fmt(now);
    if (p === 'ONTEM') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      s = fmt(y);
      e = fmt(y);
    } else if (p === '7DIAS') {
      const w = new Date(now);
      w.setDate(w.getDate() - 6);
      s = fmt(w);
    } else if (p === 'MES') {
      s = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    }
    setStartDate(s);
    setEndDate(e);
    fetchAnalytics(s, e);
  };

  const handlePrintReport = () => {
    if (!data) return;
    const { comparison, byNeighborhood, byChannel, byPayment, topProducts, deliveries } = data;

    const bairroRows = byNeighborhood
      .map(
        (b, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${b.neighborhood}</strong></td>
          <td style="text-align:center;">${b.count} (${b.shareCountPct}%)</td>
          <td style="text-align:right;">${fmtMoney(b.total)}</td>
          <td style="text-align:right;">${fmtMoney(b.avgTicket)}</td>
        </tr>`
      )
      .join('');

    const prodRows = topProducts
      .slice(0, 10)
      .map(
        (p, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${p.name}</td>
          <td style="text-align:center;">${p.total_qty}</td>
          <td style="text-align:right;">${fmtMoney(p.total_revenue)}</td>
        </tr>`
      )
      .join('');

    const delivRows = deliveries
      .map(
        (d, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>#${d.id}</td>
          <td>${fmtDateBR(d.sale_date)} ${d.sale_time}</td>
          <td><strong>${d.neighborhood}</strong></td>
          <td>${CHANNEL_LABELS[d.channel] || d.channel}</td>
          <td>${d.customer_name}</td>
          <td>${d.payment_method}</td>
          <td style="text-align:right;font-weight:700;">${fmtMoney(d.total_value)}</td>
        </tr>`
      )
      .join('');

    const win = window.open('', '_blank', 'width=980,height=760');
    if (!win) {
      addToast('Permita pop-ups para imprimir o Relatório Gerencial de Entregas.', 'warning');
      return;
    }

    win.document.write(`<!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Relatório Gerencial de Entregas — BelaFarma</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #0f172a; font-size: 12px; }
          h1 { margin: 0 0 4px; font-size: 20px; }
          h2 { margin: 18px 0 6px; font-size: 14px; text-transform: uppercase; color: #334155; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
          .meta { font-size: 11px; color: #475569; margin-bottom: 14px; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
          .box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; background: #f8fafc; }
          .box small { display: block; font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; }
          .box strong { font-size: 16px; display: block; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin-top: 6px; }
          th, td { border-bottom: 1px solid #e2e8f0; padding: 6px; text-align: left; }
          th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <h1>Relatório Gerencial de Entregas — Drogaria BelaFarma</h1>
        <div class="meta">Período: ${fmtDateBR(startDate)} até ${fmtDateBR(endDate)} • Emitido em ${new Date().toLocaleString('pt-BR')}</div>
        <div class="grid">
          <div class="box"><small>Total de Entregas</small><strong>${comparison.delivery.count} (${comparison.delivery.shareCountPct}%)</strong></div>
          <div class="box"><small>Faturamento Entregas</small><strong>${fmtMoney(comparison.delivery.total)} (${comparison.delivery.shareRevenuePct}%)</strong></div>
          <div class="box"><small>Ticket Médio Entrega</small><strong>${fmtMoney(comparison.delivery.avgTicket)}</strong></div>
          <div class="box"><small>Ticket Médio Local</small><strong>${fmtMoney(comparison.local.avgTicket)} (${comparison.local.count} vendas)</strong></div>
        </div>
        <h2>Ranking por Bairro</h2>
        <table>
          <thead><tr><th>#</th><th>Bairro</th><th style="text-align:center;">Entregas</th><th style="text-align:right;">Faturamento</th><th style="text-align:right;">Ticket Médio</th></tr></thead>
          <tbody>${bairroRows || '<tr><td colspan="5">Sem dados</td></tr>'}</tbody>
        </table>
        <h2>Canais & Pagamentos</h2>
        <p><strong>Canais:</strong> ${byChannel.map(c => `${CHANNEL_LABELS[c.channel] || c.channel}: ${c.count} (${fmtMoney(c.total)})`).join(' • ') || '-'}</p>
        <p><strong>Pagamentos:</strong> ${byPayment.map(p => `${p.method}: ${p.count} (${fmtMoney(p.total)})`).join(' • ') || '-'}</p>
        <h2>Top 10 Produtos Mais Pedidos em Entregas</h2>
        <table>
          <thead><tr><th>#</th><th>Produto</th><th style="text-align:center;">Qtd</th><th style="text-align:right;">Faturamento</th></tr></thead>
          <tbody>${prodRows || '<tr><td colspan="4">Sem dados</td></tr>'}</tbody>
        </table>
        <h2>Entregas do Período (${deliveries.length})</h2>
        <table>
          <thead><tr><th>#</th><th>Cupom</th><th>Data/Hora</th><th>Bairro</th><th>Canal</th><th>Cliente</th><th>Pagamento</th><th style="text-align:right;">Valor</th></tr></thead>
          <tbody>${delivRows || '<tr><td colspan="8">Nenhuma entrega no período</td></tr>'}</tbody>
        </table>
        <script>window.onload = () => { window.print(); };</script>
      </body>
      </html>`);
    win.document.close();
  };

  const maxHourCount = Math.max(1, ...(data?.byHour || []).map(h => h.count));
  const maxWeekdayCount = Math.max(1, ...(data?.byWeekday || []).map(w => w.count));

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${uid}-title`}
      onCancel={e => {
        e.preventDefault();
        onClose();
      }}
      onClose={e => {
        e.currentTarget.returnValue = '';
        if (isOpen) onClose();
      }}
      className="controlled-recipe-dialog m-auto w-[97vw] max-w-6xl max-h-[93dvh] p-0 rounded-2xl border-2 border-orange-500/60 bg-slate-950 text-slate-100 shadow-2xl overflow-hidden"
    >
      {/* Cabeçalho */}
      <div className="px-5 py-3.5 bg-gradient-to-r from-slate-900 via-orange-950/70 to-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-orange-500/20 border border-orange-400/40 text-orange-300">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h1 id={`${uid}-title`} className="text-base font-black text-white">
              Painel Gerencial & Relatório de Entregas
            </h1>
            <p className="text-xs text-slate-400">
              Ranking por bairro, horários/dias de pico, comparativo Local x Entrega, canais e produtos mais pedidos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrintReport}
            disabled={!data || loading}
            className="px-3.5 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir Relatório</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar Painel de Entregas"
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-300 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Filtros de Período */}
      <div className="px-5 py-2.5 bg-slate-900/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {([
            { id: 'HOJE', label: 'Hoje' },
            { id: 'ONTEM', label: 'Ontem' },
            { id: '7DIAS', label: '7 Dias' },
            { id: 'MES', label: 'Este Mês' }
          ] as const).map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                preset === p.id
                  ? 'bg-orange-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg">
            <span className="text-slate-400 font-bold">De:</span>
            <input
              type="date"
              value={startDate}
              onChange={e => {
                setStartDate(e.target.value);
                setPreset('CUSTOM');
              }}
              className="bg-transparent text-slate-100 font-mono text-xs focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg">
            <span className="text-slate-400 font-bold">Até:</span>
            <input
              type="date"
              value={endDate}
              onChange={e => {
                setEndDate(e.target.value);
                setPreset('CUSTOM');
              }}
              className="bg-transparent text-slate-100 font-mono text-xs focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => fetchAnalytics(startDate, endDate)}
            disabled={loading}
            className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Corpo com Scroll */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {loading && !data ? (
          <div className="py-16 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-orange-400" />
            <span>Carregando inteligência de entregas...</span>
          </div>
        ) : !data ? (
          <div className="py-16 text-center text-slate-500 text-sm">Sem dados para exibir.</div>
        ) : (
          <>
            {/* 1. COMPARATIVO VENDA LOCAL vs ENTREGA */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-orange-950/25 border-2 border-orange-500/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-orange-300 flex items-center gap-1.5">
                    <Truck className="w-4 h-4" /> Entregas no Período
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-200 text-[11px] font-black">
                    {data.comparison.delivery.shareRevenuePct}% do faturamento
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <strong className="text-2xl font-black font-mono text-orange-400">
                    {fmtMoney(data.comparison.delivery.total)}
                  </strong>
                  <span className="text-xs text-slate-300 font-bold">
                    {data.comparison.delivery.count} entregas ({data.comparison.delivery.shareCountPct}%) • Ticket Médio:{' '}
                    <strong className="text-white font-mono">{fmtMoney(data.comparison.delivery.avgTicket)}</strong>
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                    <Store className="w-4 h-4" /> Venda Local (Balcão)
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 text-[11px] font-black">
                    {data.comparison.local.shareRevenuePct}% do faturamento
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <strong className="text-2xl font-black font-mono text-emerald-400">
                    {fmtMoney(data.comparison.local.total)}
                  </strong>
                  <span className="text-xs text-slate-300 font-bold">
                    {data.comparison.local.count} vendas ({data.comparison.local.shareCountPct}%) • Ticket Médio:{' '}
                    <strong className="text-white font-mono">{fmtMoney(data.comparison.local.avgTicket)}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* 2. RANKING POR BAIRRO + CANAIS & PAGAMENTOS */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Ranking por Bairro */}
              <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <h2 className="text-xs font-black uppercase tracking-wider text-orange-300 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" /> Ranking por Bairro ({data.byNeighborhood.length})
                </h2>
                {data.byNeighborhood.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">
                    Nenhuma entrega registrada neste período.
                  </p>
                ) : (
                  <div className="overflow-x-auto max-h-72 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-400">
                          <th className="py-2 pr-2 whitespace-nowrap">Bairro</th>
                          <th className="py-2 px-2 text-center whitespace-nowrap">Entregas</th>
                          <th className="py-2 px-2 text-right whitespace-nowrap">Faturamento</th>
                          <th className="py-2 pl-2 text-right whitespace-nowrap">Ticket Médio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {data.byNeighborhood.map(b => (
                          <tr key={b.neighborhood} className="hover:bg-slate-800/40">
                            <td className="py-2 pr-2">
                              <div className="font-bold text-white">{b.neighborhood}</div>
                              <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1 overflow-hidden">
                                <div
                                  className="bg-orange-500 h-full rounded-full"
                                  style={{ width: `${Math.min(100, Math.max(4, b.shareCountPct))}%` }}
                                />
                              </div>
                            </td>
                            <td className="py-2 px-2 text-center font-mono whitespace-nowrap">
                              <strong className="text-orange-300">{b.count}</strong>{' '}
                              <span className="text-[10px] text-slate-400">({b.shareCountPct}%)</span>
                            </td>
                            <td className="py-2 px-2 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                              {fmtMoney(b.total)}
                            </td>
                            <td className="py-2 pl-2 text-right font-mono text-slate-300 whitespace-nowrap">
                              {fmtMoney(b.avgTicket)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Canais & Formas de Pagamento */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                  <h2 className="text-xs font-black uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                    <MessageCircle className="w-4 h-4" /> Desempenho por Canal
                  </h2>
                  {data.byChannel.length === 0 ? (
                    <p className="text-xs text-slate-500">Sem entregas no período.</p>
                  ) : (
                    <div className="space-y-2">
                      {data.byChannel.map(c => (
                        <div key={c.channel} className="flex items-center justify-between text-xs bg-slate-950/70 px-3 py-2 rounded-xl border border-slate-800">
                          <div>
                            <strong className="text-white">{CHANNEL_LABELS[c.channel] || c.channel}</strong>
                            <span className="text-[10px] text-slate-400 ml-2">
                              {c.count} ({c.sharePct}%) • Ticket {fmtMoney(c.avgTicket)}
                            </span>
                          </div>
                          <strong className="font-mono text-sky-300">{fmtMoney(c.total)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                  <h2 className="text-xs font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4" /> Pagamentos nas Entregas
                  </h2>
                  {data.byPayment.length === 0 ? (
                    <p className="text-xs text-slate-500">Sem entregas no período.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {data.byPayment.map(p => (
                        <div key={p.method} className="flex items-center justify-between text-xs">
                          <span className="text-slate-300 font-semibold">
                            {p.method} <span className="text-slate-500">({p.count})</span>
                          </span>
                          <span className="font-mono font-bold text-emerald-300">
                            {fmtMoney(p.total)} <span className="text-[10px] text-slate-400">({p.sharePct}%)</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 3. MAPA DE DEMANDA: HORÁRIOS DE PICO + DIAS DA SEMANA */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <h2 className="text-xs font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                  <Clock className="w-4 h-4" /> Horários de Pico das Entregas
                </h2>
                <div className="grid grid-cols-8 sm:grid-cols-15 gap-1.5 items-end h-32 pt-4">
                  {data.byHour.map(h => {
                    const heightPct = h.count > 0 ? Math.max(12, Math.round((h.count / maxHourCount) * 100)) : 4;
                    const isPeak = h.count > 0 && h.count === maxHourCount;
                    return (
                      <div
                        key={h.hour}
                        className="flex flex-col items-center justify-end h-full gap-1"
                        title={`${h.label}: ${h.count} entrega(s) • ${fmtMoney(h.total)}`}
                      >
                        <span className="text-[9px] font-mono font-bold text-slate-400">
                          {h.count > 0 ? h.count : ''}
                        </span>
                        <div
                          className={`w-full rounded-t-md transition-all ${
                            isPeak ? 'bg-orange-500' : h.count > 0 ? 'bg-amber-500/70' : 'bg-slate-800'
                          }`}
                          style={{ height: `${heightPct}%` }}
                        />
                        <span className="text-[9px] font-mono text-slate-400">{h.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <h2 className="text-xs font-black uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" /> Entregas por Dia da Semana
                </h2>
                <div className="space-y-1.5">
                  {data.byWeekday.map(w => {
                    const pct = w.count > 0 ? Math.max(6, Math.round((w.count / maxWeekdayCount) * 100)) : 0;
                    return (
                      <div key={w.day} className="flex items-center gap-2 text-xs">
                        <span className="w-8 font-bold text-slate-300">{w.label}</span>
                        <div className="flex-1 bg-slate-800 h-2.5 rounded-full overflow-hidden">
                          <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-24 text-right font-mono text-[11px] text-slate-300 shrink-0">
                          <strong>{w.count}</strong> • {fmtMoney(w.total)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 4. TOP PRODUTOS MAIS PEDIDOS EM ENTREGAS */}
            {data.topProducts.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <h2 className="text-xs font-black uppercase tracking-wider text-teal-300 flex items-center gap-1.5">
                  <Package className="w-4 h-4" /> Top Produtos Mais Pedidos em Entregas
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-400">
                        <th className="py-1.5 pr-2 whitespace-nowrap">Produto</th>
                        <th className="py-1.5 px-2 text-center whitespace-nowrap">Pedidos</th>
                        <th className="py-1.5 px-2 text-center whitespace-nowrap">Qtd Un.</th>
                        <th className="py-1.5 pl-2 text-right whitespace-nowrap">Faturamento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {data.topProducts.map(p => (
                        <tr key={`${p.code}-${p.name}`}>
                          <td className="py-1.5 pr-2 font-semibold text-slate-200">{p.name}</td>
                          <td className="py-1.5 px-2 text-center font-mono text-slate-400">{p.orders_count}</td>
                          <td className="py-1.5 px-2 text-center font-mono font-bold text-teal-300">{p.total_qty}</td>
                          <td className="py-1.5 pl-2 text-right font-mono font-bold text-emerald-400">
                            {fmtMoney(p.total_revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 5. LISTA DETALHADA DAS ENTREGAS */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2.5">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-orange-400" /> Entregas Realizadas no Período ({data.deliveries.length})
              </h2>
              {data.deliveries.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  Nenhuma entrega marcada no PDV dentro deste período.
                </p>
              ) : (
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-900">
                      <tr className="border-b border-slate-800 text-[10px] font-black uppercase text-slate-400">
                        <th className="py-1.5 px-2 whitespace-nowrap">Cupom</th>
                        <th className="py-1.5 px-2 whitespace-nowrap">Data/Hora</th>
                        <th className="py-1.5 px-2 whitespace-nowrap">Bairro</th>
                        <th className="py-1.5 px-2 whitespace-nowrap">Canal</th>
                        <th className="py-1.5 px-2 whitespace-nowrap">Cliente / Vendedor</th>
                        <th className="py-1.5 px-2 whitespace-nowrap">Pagamento</th>
                        <th className="py-1.5 px-2 text-right whitespace-nowrap">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {data.deliveries.map(d => (
                        <tr key={d.id} className="hover:bg-slate-800/40">
                          <td className="py-1.5 px-2 font-mono font-bold text-slate-200 whitespace-nowrap">#{d.id}</td>
                          <td className="py-1.5 px-2 font-mono text-slate-400 whitespace-nowrap">
                            {fmtDateBR(d.sale_date).slice(0, 5)} {d.sale_time}
                          </td>
                          <td className="py-1.5 px-2 font-bold text-orange-300 whitespace-nowrap">{d.neighborhood}</td>
                          <td className="py-1.5 px-2 text-sky-300 whitespace-nowrap">
                            {CHANNEL_LABELS[d.channel] || d.channel}
                          </td>
                          <td className="py-1.5 px-2 text-slate-300 truncate max-w-[180px]">
                            {d.customer_name} <span className="text-slate-500">({d.seller_name})</span>
                          </td>
                          <td className="py-1.5 px-2 text-slate-300 whitespace-nowrap">{d.payment_method}</td>
                          <td className="py-1.5 px-2 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                            {fmtMoney(d.total_value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </dialog>
  );
};

export default DeliveryAnalyticsModal;
