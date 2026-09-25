import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  Calendar, 
  Clock, 
  Layers, 
  ArrowRight, 
  DollarSign, 
  ShoppingBag,
  Loader2,
  ChevronRight,
  Printer,
  Package,
  Building2,
  Tag
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { useToast } from './ToastContext';

interface CategoriaReport {
  categoria: string;
  total: number;
  quantidade: number;
}

interface HorarioReport {
  hora: number;
  total: number;
  vendas: number;
}

interface TicketDiarioReport {
  data: string;
  tickets: number;
  total: number;
}

interface SalesReportData {
  categorias: CategoriaReport[];
  horarios: HorarioReport[];
  ticketsDiarios?: TicketDiarioReport[];
}

export interface SoldProductItem {
  produtoId: number;
  produto: string;
  apresentacao: string;
  codBarras: string;
  qtdVendida: number;
  ultimoFornecedor: string;
  ultimoPreco: number;
}

export interface SoldCategoryGroup {
  categoria: string;
  totalProdutos: number;
  totalQtd: number;
  produtos: SoldProductItem[];
}

export interface SoldProductsReportData {
  period: { startDate: string; endDate: string };
  totalItens: number;
  totalQtdGeral: number;
  categorias: SoldCategoryGroup[];
  isOffline?: boolean;
}

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6', '#f43f5e', '#a855f7', '#64748b'];

export const SalesReport: React.FC = () => {
  const [data, setData] = useState<SalesReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'today' | '7days' | '30days' | 'month'>('month');
  
  // Custom date filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [usingCustomDates, setUsingCustomDates] = useState(false);

  // Sold Products by Category state
  const [soldData, setSoldData] = useState<SoldProductsReportData | null>(null);
  const [loadingSold, setLoadingSold] = useState(true);

  const { addToast } = useToast();

  const getDatesForPeriod = (selectedPeriod: typeof period) => {
    const today = new Date();
    const past = new Date();
    const pad = (num: number) => String(num).padStart(2, '0');
    
    let startStr = '';
    let endStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    if (selectedPeriod === 'today') {
      startStr = endStr;
    } else if (selectedPeriod === '7days') {
      past.setDate(today.getDate() - 7);
      startStr = `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}`;
    } else if (selectedPeriod === '30days') {
      past.setDate(today.getDate() - 30);
      startStr = `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}`;
    } else if (selectedPeriod === 'month') {
      startStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
    }

    return { startStr, endStr };
  };

  const fetchReportData = async (start?: string, end?: string) => {
    setLoading(true);
    setLoadingSold(true);
    try {
      let query = '';
      if (start && end) {
        query = `?startDate=${start}&endDate=${end}`;
      } else {
        const { startStr, endStr } = getDatesForPeriod(period);
        query = `?startDate=${startStr}&endDate=${endStr}`;
      }

      const [response, soldResponse] = await Promise.all([
        fetch(`/api/finance-agent/sales-report${query}`),
        fetch(`/api/finance-agent/sold-products-report${query}`).catch(() => null)
      ]);

      if (response.status === 503) {
        addToast('O servidor do Digifarma está Offline.', 'error');
        setData(null);
        setSoldData(null);
        return;
      }
      if (!response.ok) throw new Error('Falha ao buscar dados');
      
      const reportData = await response.json();
      if (reportData && reportData.isOffline) {
        addToast('O servidor do Digifarma está Offline.', 'error');
        setData(null);
        setSoldData(null);
        return;
      }
      setData(reportData);

      if (soldResponse && soldResponse.ok) {
        const soldJson = await soldResponse.json();
        setSoldData(soldJson);
      }
    } catch (err: any) {
      console.error(err);
      addToast('Erro ao carregar o relatório de vendas.', 'error');
    } finally {
      setLoading(false);
      setLoadingSold(false);
    }
  };

  useEffect(() => {
    if (!usingCustomDates) {
      fetchReportData();
    }
  }, [period, usingCustomDates]);

  const handleCustomDateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      addToast('Por favor, selecione ambas as datas.', 'warning');
      return;
    }
    setUsingCustomDates(true);
    fetchReportData(startDate, endDate);
  };

  const handleResetPeriod = (newPeriod: typeof period) => {
    setUsingCustomDates(false);
    setPeriod(newPeriod);
    setStartDate('');
    setEndDate('');
  };

  const handlePrintSoldProducts = () => {
    if (!soldData || !soldData.categorias || soldData.categorias.length === 0) {
      addToast('Não há produtos vendidos para imprimir no período selecionado.', 'warning');
      return;
    }

    const formatDateBr = (dateStr: string) => {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return dateStr;
    };

    const periodDates = soldData.period || getDatesForPeriod(period);
    const periodLabel = `${formatDateBr(periodDates.startDate || startDate || '')} a ${formatDateBr(periodDates.endDate || endDate || '')}`;
    const emissionDate = new Date().toLocaleString('pt-BR');

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      addToast('Por favor, permita pop-ups para imprimir o relatório.', 'error');
      return;
    }

    const categoriesHtml = soldData.categorias.map(cat => {
      const rowsHtml = cat.produtos.map((p, idx) => `
        <tr class="${idx % 2 === 0 ? 'even' : 'odd'}">
          <td class="text-center font-bold">${p.produtoId || ''}</td>
          <td>
            <div class="prod-name">${p.produto}</div>
            ${p.apresentacao ? `<div class="prod-desc">${p.apresentacao}</div>` : ''}
            ${p.codBarras ? `<div class="prod-ean">EAN: ${p.codBarras}</div>` : ''}
          </td>
          <td class="text-right font-bold qty-col">${Number(p.qtdVendida).toLocaleString('pt-BR')}</td>
          <td>${p.ultimoFornecedor || 'Não inf.'}</td>
          <td class="text-right font-bold price-col">R$ ${(Number(p.ultimoPreco) || 0).toFixed(2).replace('.', ',')}</td>
        </tr>
      `).join('');

      return `
        <div class="category-block">
          <div class="category-header">
            <span class="category-title">${cat.categoria}</span>
            <span class="category-summary">${cat.totalProdutos} produtos | ${cat.totalQtd.toLocaleString('pt-BR')} un vendidas</span>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 8%;" class="text-center">Cód.</th>
                <th style="width: 44%;">Produto</th>
                <th style="width: 14%;" class="text-right">Qtd. Vendida</th>
                <th style="width: 22%;">Último Fornecedor</th>
                <th style="width: 12%;" class="text-right">Último Preço</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      `;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Bela Farma - Relatório de Produtos Vendidos por Categoria</title>
          <meta charset="utf-8" />
          <style>
            @page {
              size: A4 portrait;
              margin: 8mm 10mm 8mm 10mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #0f172a;
              margin: 0;
              padding: 0;
              font-size: 9.5px;
              line-height: 1.25;
            }
            .report-header {
              border-bottom: 2px solid #0f172a;
              padding-bottom: 6px;
              margin-bottom: 10px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .pharmacy-title {
              font-size: 16px;
              font-weight: 900;
              color: #0f172a;
              text-transform: uppercase;
              letter-spacing: -0.5px;
            }
            .report-subtitle {
              font-size: 11px;
              font-weight: 700;
              color: #059669;
              text-transform: uppercase;
              margin-top: 1px;
            }
            .meta-info {
              text-align: right;
              font-size: 8.5px;
              color: #64748b;
            }
            .meta-info strong {
              color: #0f172a;
            }
            .kpi-summary {
              background: #f1f5f9;
              border: 1px solid #cbd5e1;
              border-radius: 4px;
              padding: 5px 10px;
              margin-bottom: 12px;
              display: flex;
              gap: 20px;
              font-size: 9px;
            }
            .kpi-item {
              display: flex;
              gap: 4px;
            }
            .kpi-label {
              color: #64748b;
              font-weight: 600;
            }
            .kpi-value {
              font-weight: 800;
              color: #0f172a;
            }
            .category-block {
              margin-bottom: 14px;
              page-break-inside: auto;
            }
            .category-header {
              background: #1e293b;
              color: #ffffff;
              padding: 4px 8px;
              border-radius: 4px 4px 0 0;
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 10px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              break-after: avoid;
            }
            .category-summary {
              font-size: 8.5px;
              font-weight: 600;
              color: #cbd5e1;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              border: 1px solid #cbd5e1;
              margin-bottom: 4px;
            }
            th {
              background: #e2e8f0;
              color: #1e293b;
              font-size: 8.5px;
              font-weight: 800;
              text-transform: uppercase;
              padding: 4px 6px;
              border: 1px solid #cbd5e1;
              text-align: left;
            }
            td {
              padding: 3.5px 6px;
              border: 1px solid #e2e8f0;
              font-size: 8.5px;
              vertical-align: middle;
            }
            tr.even {
              background: #ffffff;
            }
            tr.odd {
              background: #f8fafc;
            }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-bold { font-weight: 700; }
            .prod-name {
              font-weight: 700;
              color: #0f172a;
            }
            .prod-desc {
              color: #64748b;
              font-size: 8px;
            }
            .prod-ean {
              font-size: 7.5px;
              color: #94a3b8;
            }
            .qty-col {
              color: #0f172a;
              font-size: 9px;
            }
            .price-col {
              color: #047857;
            }
            .report-footer {
              margin-top: 14px;
              border-top: 1px solid #cbd5e1;
              padding-top: 4px;
              display: flex;
              justify-content: space-between;
              font-size: 7.5px;
              color: #94a3b8;
            }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .category-block { page-break-inside: auto; }
              tr { page-break-inside: avoid; }
              thead { display: table-header-group; }
            }
          </style>
        </head>
        <body>
          <div class="report-header">
            <div>
              <div class="pharmacy-title">Drogaria Bela Farma</div>
              <div class="report-subtitle">Relatório de Produtos Vendidos por Categoria</div>
            </div>
            <div class="meta-info">
              <div><strong>Período:</strong> ${periodLabel}</div>
              <div><strong>Emissão:</strong> ${emissionDate}</div>
            </div>
          </div>

          <div class="kpi-summary">
            <div class="kpi-item">
              <span class="kpi-label">Categorias:</span>
              <span class="kpi-value">${soldData.categorias.length}</span>
            </div>
            <div class="kpi-item">
              <span class="kpi-label">Total de Itens:</span>
              <span class="kpi-value">${soldData.totalItens.toLocaleString('pt-BR')}</span>
            </div>
            <div class="kpi-item">
              <span class="kpi-label">Total de Peças Vendidas:</span>
              <span class="kpi-value">${soldData.totalQtdGeral.toLocaleString('pt-BR')} un</span>
            </div>
          </div>

          ${categoriesHtml}

          <div class="report-footer">
            <span>Bela Farma Sistema Inteligente &copy; ${new Date().getFullYear()}</span>
            <span>Relatório Oficial de Produtos Vendidos</span>
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 250);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // KPI calculations
  const kpis = useMemo(() => {
    if (!data) return { totalVendas: 0, peakHour: 'N/D', topCategory: 'N/D', totalItems: 0, ticketMedio: 0 };

    const totalVendas = data.categorias.reduce((sum, c) => sum + c.total, 0);
    const totalItems = data.categorias.reduce((sum, c) => sum + c.quantidade, 0);
    
    const totalCupons = data.horarios.reduce((sum, h) => sum + h.vendas, 0);
    const ticketMedio = totalCupons > 0 ? totalVendas / totalCupons : 0;

    let maxHora = -1;
    let maxHoraVendas = 0;
    data.horarios.forEach(h => {
      if (h.total > maxHoraVendas) {
        maxHoraVendas = h.total;
        maxHora = h.hora;
      }
    });
    const peakHour = maxHora !== -1 ? `${String(maxHora).padStart(2, '0')}:00` : 'N/D';

    const topCategory = data.categorias.length > 0 ? data.categorias[0].categoria : 'N/D';

    return {
      totalVendas,
      peakHour,
      topCategory,
      totalItems,
      ticketMedio
    };
  }, [data]);

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const categoryChartData = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.categorias].sort((a, b) => b.total - a.total);
    if (sorted.length <= 8) return sorted;

    const top = sorted.slice(0, 7);
    const others = sorted.slice(7);
    const othersTotal = others.reduce((sum, item) => sum + item.total, 0);
    const othersQty = others.reduce((sum, item) => sum + item.quantidade, 0);

    return [
      ...top,
      { categoria: 'Outras', total: othersTotal, quantidade: othersQty }
    ];
  }, [data]);

  const hourlyChartData = useMemo(() => {
    if (!data) return [];
    const hourMap = new Map<number, HorarioReport>();
    data.horarios.forEach(h => hourMap.set(h.hora, h));

    const result = [];
    for (let h = 7; h <= 22; h++) {
      const item = hourMap.get(h);
      result.push({
        hora: `${String(h).padStart(2, '0')}h`,
        total: item ? item.total : 0,
        vendas: item ? item.vendas : 0
      });
    }
    return result;
  }, [data]);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-emerald-500" />
            Relatório de Vendas Detalhado
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-bold italic text-sm">
            Estatísticas do Digifarma sobre categorias de produtos e fluxo de horários.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl border-2 border-slate-200/40 dark:border-slate-700/40 shadow-inner">
          <button
            onClick={() => handleResetPeriod('today')}
            className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              period === 'today' && !usingCustomDates
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-md'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Hoje
          </button>
          <button
            onClick={() => handleResetPeriod('7days')}
            className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              period === '7days' && !usingCustomDates
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-md'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            7 Dias
          </button>
          <button
            onClick={() => handleResetPeriod('30days')}
            className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              period === '30days' && !usingCustomDates
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-md'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            30 Dias
          </button>
          <button
            onClick={() => handleResetPeriod('month')}
            className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              period === 'month' && !usingCustomDates
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-md'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Mês Atual
          </button>
        </div>
      </header>

      <form onSubmit={handleCustomDateSubmit} className="bg-white dark:bg-slate-900/90 rounded-[2rem] border-2 border-slate-100 dark:border-slate-800/80 p-6 flex flex-wrap items-center gap-4 shadow-sm">
        <span className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase flex items-center gap-2">
          <Calendar className="w-4 h-4" /> Personalizar Período:
        </span>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500"
          />
          <span className="text-xs font-bold text-slate-400">até</span>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500"
          />
        </div>
        <button
          type="submit"
          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 transition-all"
        >
          Aplicar Filtro
        </button>
      </form>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
          <p className="text-slate-500 font-bold">Carregando estatísticas do Digifarma...</p>
        </div>
      ) : !data ? (
        <div className="bg-amber-50 dark:bg-amber-950/20 border-2 border-amber-200 dark:border-amber-900 rounded-[2.5rem] p-12 text-center text-amber-700 dark:text-amber-400 font-bold">
          Nenhum dado encontrado para o período selecionado ou servidor offline.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800/80 rounded-[2rem] p-6 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Faturamento</p>
                <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{formatCurrency(kpis.totalVendas)}</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800/80 rounded-[2rem] p-6 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-rose-100 dark:bg-rose-950/30 text-rose-650 dark:text-rose-400 rounded-2xl flex items-center justify-center">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Ticket Médio</p>
                <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{formatCurrency(kpis.ticketMedio)}</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800/80 rounded-[2rem] p-6 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Unidades Vendidas</p>
                <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{kpis.totalItems} un</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800/80 rounded-[2rem] p-6 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 rounded-2xl flex items-center justify-center">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Hora de Pico</p>
                <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{kpis.peakHour}</p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800/80 rounded-[2rem] p-6 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-100 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Top Categoria</p>
                <p className="text-lg font-black text-slate-900 dark:text-slate-100 truncate w-40 uppercase">{kpis.topCategory}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800/80 rounded-[2.5rem] p-8 shadow-sm">
              <div className="mb-6">
                <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
                  Vendas por Categoria
                </h2>
                <p className="text-xs font-bold text-slate-400 italic">Principais divisões de estoque no período.</p>
              </div>
              
              <div style={{ width: '100%', height: '300px' }}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={categoryChartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" stroke="#94a3b8" fontSize={10} tickFormatter={(v) => `R$${v}`} />
                    <YAxis dataKey="categoria" type="category" stroke="#94a3b8" fontSize={9} width={90} />
                    <Tooltip
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', backgroundColor: '#fff', color: '#1e293b' }}
                      formatter={(value: number) => [formatCurrency(value), 'Total Vendas']}
                      itemStyle={{ fontWeight: 'bold', fontSize: '11px' }}
                    />
                    <Bar dataKey="total" radius={[0, 8, 8, 0]}>
                      {categoryChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800/80 rounded-[2.5rem] p-8 shadow-sm">
              <div className="mb-6">
                <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <div className="w-1.5 h-6 bg-blue-500 rounded-full" />
                  Fluxo de Vendas por Horário
                </h2>
                <p className="text-xs font-bold text-slate-400 italic">Horários com maior volume financeiro.</p>
              </div>

              <div style={{ width: '100%', height: '300px' }}>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={hourlyChartData} margin={{ left: 10, right: 10, top: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="hora" stroke="#94a3b8" fontSize={10} />
                    <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={(v) => `R$${v}`} />
                    <Tooltip
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', backgroundColor: '#fff', color: '#1e293b' }}
                      formatter={(value: number) => [formatCurrency(value), 'Faturamento']}
                      itemStyle={{ fontWeight: 'bold', fontSize: '11px' }}
                    />
                    <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={3.5} dot={{ r: 3, fill: '#3b82f6' }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Gráfico de Tickets Diários */}
          {data.ticketsDiarios && data.ticketsDiarios.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800/80 rounded-[2.5rem] p-8 shadow-sm my-8">
              <div className="mb-6">
                <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <div className="w-1.5 h-6 bg-indigo-500 rounded-full" />
                  Evolução Diária de Tickets Gerados
                </h2>
                <p className="text-xs font-bold text-slate-400 italic">Quantidade de cupons/vendas geradas dia a dia no período selecionado.</p>
              </div>

              <div style={{ width: '100%', height: '300px' }}>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.ticketsDiarios} margin={{ left: 10, right: 10, top: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis 
                      dataKey="data" 
                      stroke="#94a3b8" 
                      fontSize={10} 
                      tickFormatter={(str) => {
                        if (!str) return '';
                        const parts = str.split('-');
                        if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
                        return str;
                      }}
                    />
                    <YAxis stroke="#94a3b8" fontSize={10} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', backgroundColor: '#fff', color: '#1e293b' }}
                      formatter={(value: number) => [`${value} cupons`, 'Tickets Gerados']}
                      labelFormatter={(label) => {
                        if (!label) return '';
                        const parts = label.split('-');
                        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
                        return label;
                      }}
                      itemStyle={{ fontWeight: 'bold', fontSize: '11px' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="tickets" 
                      stroke="#6366f1" 
                      strokeWidth={3.5} 
                      dot={{ r: 3, fill: '#6366f1' }} 
                      activeDot={{ r: 6 }} 
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800/80 rounded-[2.5rem] shadow-sm overflow-hidden">
            <div className="p-6 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">Detalhamento por Categoria</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Posição</th>
                    <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Categoria</th>
                    <th className="px-8 py-4 text-right text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Qtd Itens</th>
                    <th className="px-8 py-4 text-right text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Total Vendas</th>
                    <th className="px-8 py-4 text-right text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Percentual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.categorias.map((item, idx) => {
                    const pct = kpis.totalVendas > 0 ? (item.total / kpis.totalVendas) * 100 : 0;
                    return (
                      <tr key={item.categoria} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                        <td className="px-8 py-4 font-black text-slate-400">#{idx + 1}</td>
                        <td className="px-8 py-4 font-black text-slate-800 dark:text-slate-200 uppercase">{item.categoria}</td>
                        <td className="px-8 py-4 text-right font-bold text-slate-500 dark:text-slate-400">{item.quantidade} un</td>
                        <td className="px-8 py-4 text-right font-black text-slate-800 dark:text-slate-200">{formatCurrency(item.total)}</td>
                        <td className="px-8 py-4 text-right font-black text-emerald-600 dark:text-emerald-400">{pct.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Nova Seção: Produtos Vendidos por Categoria com Último Fornecedor e Preço de Custo */}
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800/80 rounded-[2.5rem] shadow-sm overflow-hidden p-6 md:p-8 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <Package className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                    Produtos Vendidos por Categoria
                  </h2>
                </div>
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500">
                  Quantidade acumulada vendida, último fornecedor e preço de custo da última compra no período.
                </p>
              </div>

              <button
                onClick={handlePrintSoldProducts}
                disabled={loadingSold || !soldData || !soldData.categorias || soldData.categorias.length === 0}
                className="inline-flex items-center gap-2.5 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-emerald-600/20 transition-all active:scale-95 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Imprimir Lista (A4 / PDF)
              </button>
            </div>

            {loadingSold ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                <p className="text-xs font-bold uppercase tracking-wider">Carregando produtos vendidos por categoria...</p>
              </div>
            ) : !soldData || !soldData.categorias || soldData.categorias.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="text-sm font-bold">Nenhum produto vendido encontrado para o período selecionado.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Resumo rápido */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Categorias Ativas</p>
                      <p className="text-xl font-black text-slate-800 dark:text-slate-100">{soldData.categorias.length}</p>
                    </div>
                    <Layers className="w-6 h-6 text-slate-400" />
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Itens Distintos</p>
                      <p className="text-xl font-black text-slate-800 dark:text-slate-100">{soldData.totalItens.toLocaleString('pt-BR')}</p>
                    </div>
                    <Package className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Peças Vendidas</p>
                      <p className="text-xl font-black text-slate-800 dark:text-slate-100">{soldData.totalQtdGeral.toLocaleString('pt-BR')} un</p>
                    </div>
                    <ShoppingBag className="w-6 h-6 text-indigo-500" />
                  </div>
                </div>

                {/* Blocos de Categorias */}
                <div className="space-y-6">
                  {soldData.categorias.map((catGroup) => (
                    <div 
                      key={catGroup.categoria} 
                      className="border-2 border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs"
                    >
                      {/* Cabeçalho da Categoria */}
                      <div className="px-6 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                          <h3 className="text-sm font-black uppercase tracking-wider">{catGroup.categoria}</h3>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="bg-slate-800 text-slate-300 font-bold px-3 py-1 rounded-full text-[11px]">
                            {catGroup.totalProdutos} produtos
                          </span>
                          <span className="bg-emerald-500/20 text-emerald-300 font-black px-3 py-1 rounded-full text-[11px]">
                            {catGroup.totalQtd.toLocaleString('pt-BR')} un vendidas
                          </span>
                        </div>
                      </div>

                      {/* Tabela dos Produtos da Categoria */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                              <th className="px-6 py-3 text-center w-16">Cód.</th>
                              <th className="px-6 py-3">Produto</th>
                              <th className="px-6 py-3 text-right w-36">Qtd. Vendida</th>
                              <th className="px-6 py-3 w-64">Último Fornecedor</th>
                              <th className="px-6 py-3 text-right w-36">Último Preço (Custo)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {catGroup.produtos.map((prod, pIdx) => (
                              <tr 
                                key={prod.produtoId || pIdx} 
                                className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20 transition-colors"
                              >
                                <td className="px-6 py-3 text-center font-bold text-slate-400">
                                  #{prod.produtoId}
                                </td>
                                <td className="px-6 py-3">
                                  <div className="font-black text-slate-800 dark:text-slate-200">
                                    {prod.produto}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                                    {prod.apresentacao && <span>{prod.apresentacao}</span>}
                                    {prod.codBarras && (
                                      <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                        EAN: {prod.codBarras}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-3 text-right">
                                  <span className="inline-block px-3 py-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-black rounded-lg text-xs">
                                    {Number(prod.qtdVendida).toLocaleString('pt-BR')} un
                                  </span>
                                </td>
                                <td className="px-6 py-3 text-slate-700 dark:text-slate-300 font-bold truncate max-w-xs">
                                  <div className="flex items-center gap-1.5">
                                    <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span className="truncate">{prod.ultimoFornecedor || 'Não inf.'}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-3 text-right font-black text-slate-900 dark:text-slate-100">
                                  {formatCurrency(prod.ultimoPreco || 0)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SalesReport;
