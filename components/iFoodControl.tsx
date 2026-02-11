import React, { useState, useEffect, useMemo } from 'react';
import {
  ShoppingBag, DollarSign, Calendar, CheckCircle2, Clock,
  AlertTriangle, TrendingUp, Filter, ChevronDown, ChevronUp,
  RefreshCw, Trash2, Check, X, Bell, Percent, Search
} from 'lucide-react';
import { useToast } from './ToastContext';
import { User, iFoodSale, iFoodDashboard, iFoodNotification } from '../types';

interface IFoodControlProps {
  user: User;
  onLog: (action: string, details: string) => void;
}

export const IFoodControl: React.FC<IFoodControlProps> = ({ user, onLog }) => {
  const { addToast } = useToast();
  const [sales, setSales] = useState<iFoodSale[]>([]);
  const [dashboard, setDashboard] = useState<iFoodDashboard | null>(null);
  const [notifications, setNotifications] = useState<iFoodNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSales, setSelectedSales] = useState<Set<string>>(new Set());
  
  // View Mode & Pagination
  const [viewMode, setViewMode] = useState<'active' | 'archive'>('active');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const LIMIT = 50;

  // Existing filters, now mostly for archive mode
  const [filterStatus, setFilterStatus] = useState<'all' | 'Pendente' | 'Recebido'>('all'); 
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth()); 
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [viewMode, filterMonth, filterYear]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    sale_date: new Date().toISOString().split('T')[0],
    gross_value: '',
    operator_fee_percent: '6.5',
    description: '',
  });

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00Z');
    return d.toLocaleDateString('pt-BR');
  };

  const parseCurrency = (value: string): number => {
    const cleaned = value.replace(/\D/g, '');
    return (parseInt(cleaned, 10) || 0) / 100;
  };

  const handleCurrencyMask = (value: string): string => {
    let numeric = value.replace(/\D/g, '');
    if (!numeric) return '';
    const floatValue = parseInt(numeric, 10) / 100;
    return floatValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const months = useMemo(() => [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ], []);

  useEffect(() => {
    fetchData();
  }, [filterMonth, filterYear, viewMode, page]); // Add viewMode and page dependency

  const fetchData = async () => {
    setIsLoading(true);
    try {
      let url = `/api/ifood-sales?page=${page}&limit=${LIMIT}`;
      
      if (viewMode === 'active') {
        // Active mode: Show ALL pending sales (sorted by due date)
        url += `&status=Pendente`;
      } else {
        // Archive mode: Show received sales by month
        url += `&status=Recebido&month=${filterMonth + 1}&year=${filterYear}`;
      }

      const [salesRes, dashRes, notifRes] = await Promise.all([
        fetch(url),
        fetch('/api/ifood-sales/dashboard'),
        fetch('/api/ifood-sales/notifications'),
      ]);

      const salesData = await salesRes.json();
      const dashData = await dashRes.json();
      const notifData = await notifRes.json();

      if (salesData.pagination) {
        setSales(salesData.data);
        setTotalPages(salesData.pagination.totalPages);
      } else {
        // Fallback for older backend or direct array
        setSales(Array.isArray(salesData) ? salesData : []);
        setTotalPages(1);
      }
      
      setDashboard(dashData);
      setNotifications(notifData);
    } catch (err) {
      console.error('Error fetching iFood data:', err);
      addToast('Erro ao carregar dados do iFood.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch system settings for iFood fee
  useEffect(() => {
    fetch('/api/settings/ifood_fee_percent')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.value) {
          setFormData(prev => ({ ...prev, operator_fee_percent: data.value }));
        }
      })
      .catch(console.error);
  }, []);

  const handleAddSale = async () => {
    const grossValue = parseCurrency(formData.gross_value);
    if (grossValue <= 0) {
      addToast('Informe um valor válido!', 'warning');
      return;
    }

    try {
      const response = await fetch('/api/ifood-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sale_date: formData.sale_date,
          gross_value: grossValue,
          operator_fee_percent: parseFloat(formData.operator_fee_percent) || 0,
          description: formData.description,
          user_name: user.name,
        }),
      });

      if (!response.ok) throw new Error('Failed to create sale');

      const createdSale = await response.json();
      addToast(`Venda iFood de ${formatCurrency(grossValue)} registrada! Previsão de depósito: ${formatDate(createdSale.payment_due_date)}`, 'success');
      onLog('iFood', `Registrou venda iFood: ${formatCurrency(grossValue)}`);
      
      setFormData({
        sale_date: new Date().toISOString().split('T')[0],
        gross_value: '',
        operator_fee_percent: '6.5',
        description: '',
      });
      setShowAddForm(false);
      fetchData();
    } catch (err) {
      console.error('Error creating iFood sale:', err);
      addToast('Erro ao registrar venda iFood.', 'error');
    }
  };

  const handleReconcile = async (saleId: string) => {
    try {
      const response = await fetch(`/api/ifood-sales/${saleId}/reconcile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: user.name }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to reconcile');
      }

      const result = await response.json();
      addToast(result.message, 'success');
      onLog('iFood', `Conciliou venda iFood: ${formatCurrency(result.sale.net_value)}`);
      fetchData();
    } catch (err: any) {
      console.error('Error reconciling:', err);
      addToast(err.message || 'Erro ao conciliar venda.', 'error');
    }
  };

  const handleBatchReconcile = async () => {
    if (selectedSales.size === 0) {
      addToast('Selecione ao menos uma venda para conciliar.', 'warning');
      return;
    }

    try {
      const response = await fetch('/api/ifood-sales/batch-reconcile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleIds: Array.from(selectedSales),
          userName: user.name,
        }),
      });

      if (!response.ok) throw new Error('Failed to batch reconcile');

      const result = await response.json();
      addToast(result.message, 'success');
      onLog('iFood', `Conciliação em lote: ${selectedSales.size} venda(s)`);
      setSelectedSales(new Set());
      fetchData();
    } catch (err) {
      console.error('Error batch reconciling:', err);
      addToast('Erro na conciliação em lote.', 'error');
    }
  };

  const handleDelete = async (saleId: string) => {
    try {
      const response = await fetch(`/api/ifood-sales/${saleId}`, { method: 'DELETE' });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to delete');
      }
      addToast('Venda iFood excluída.', 'success');
      onLog('iFood', 'Excluiu venda iFood');
      fetchData();
    } catch (err: any) {
      addToast(err.message || 'Erro ao excluir venda.', 'error');
    }
  };

  const toggleSelectSale = (id: string) => {
    const newSet = new Set(selectedSales);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedSales(newSet);
  };

  const selectAllPending = () => {
    const pendingIds = sales.filter(s => s.status === 'Pendente').map(s => s.id);
    setSelectedSales(new Set(pendingIds));
  };

  const getDaysUntilDue = (dueDateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr + 'T00:00:00');
    const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const getStatusBadge = (sale: iFoodSale) => {
    if (sale.status === 'Recebido') {
      return (
        <span className="flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-black">
          <CheckCircle2 className="w-3 h-3" /> Recebido
        </span>
      );
    }
    const daysUntil = getDaysUntilDue(sale.payment_due_date);
    if (daysUntil < 0) {
      return (
        <span className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-black animate-pulse">
          <AlertTriangle className="w-3 h-3" /> {Math.abs(daysUntil)}d atrasado
        </span>
      );
    }
    if (daysUntil <= 3) {
      return (
        <span className="flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-black">
          <Clock className="w-3 h-3" /> {daysUntil === 0 ? 'Hoje!' : `${daysUntil}d`}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-black">
        <Calendar className="w-3 h-3" /> {daysUntil}d
      </span>
    );
  };

  const grossPreview = parseCurrency(formData.gross_value);
  const feePreview = grossPreview * ((parseFloat(formData.operator_fee_percent) || 0) / 100);
  const netPreview = grossPreview - feePreview;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg">
              <ShoppingBag className="w-6 h-6 text-white" />
            </div>
            Controle iFood
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-bold text-sm mt-1">
            Gerencie suas vendas e pagamentos do iFood
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-2xl font-black text-sm hover:from-red-600 hover:to-red-700 transition-all shadow-lg shadow-red-500/25 flex items-center gap-2"
          >
            <DollarSign className="w-4 h-4" />
            Nova Venda iFood
          </button>
          <button
            onClick={fetchData}
            className="p-3 bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-100 dark:border-slate-700 text-slate-500 hover:text-slate-700 transition-all"
            title="Atualizar"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Notifications Banner */}
      {notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map((notif, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-3 p-4 rounded-2xl border-2 ${
                notif.type === 'overdue'
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
              }`}
            >
              <Bell className={`w-5 h-5 flex-shrink-0 ${notif.type === 'overdue' ? 'text-red-600' : 'text-amber-600'}`} />
              <p className={`text-sm font-bold ${notif.type === 'overdue' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
                {notif.message}
              </p>
              <button
                onClick={() => handleReconcile(notif.sale.id)}
                className="ml-auto px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black hover:bg-emerald-700 transition-colors flex-shrink-0"
              >
                Marcar Recebido
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Dashboard Cards */}
      {dashboard && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border-2 border-slate-100 dark:border-slate-800 shadow-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-xl">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <span className="text-xs font-black text-slate-400 uppercase tracking-wider">A Receber</span>
            </div>
            <p className="text-2xl font-black text-amber-600">{formatCurrency(dashboard.totalPending)}</p>
            <p className="text-xs text-slate-500 font-bold mt-1">{dashboard.pendingCount} venda(s) pendente(s)</p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border-2 border-slate-100 dark:border-slate-800 shadow-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <span className="text-xs font-black text-slate-400 uppercase tracking-wider">Recebido</span>
            </div>
            <p className="text-2xl font-black text-emerald-600">{formatCurrency(dashboard.totalReceived)}</p>
            <p className="text-xs text-slate-500 font-bold mt-1">{dashboard.receivedCount} venda(s) conciliada(s)</p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border-2 border-slate-100 dark:border-slate-800 shadow-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-xs font-black text-slate-400 uppercase tracking-wider">Vencendo em Breve</span>
            </div>
            <p className="text-2xl font-black text-blue-600">{dashboard.dueSoon.length}</p>
            <p className="text-xs text-slate-500 font-bold mt-1">nos próximos 3 dias</p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border-2 border-slate-100 dark:border-slate-800 shadow-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-xl">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <span className="text-xs font-black text-slate-400 uppercase tracking-wider">Atrasados</span>
            </div>
            <p className="text-2xl font-black text-red-600">{dashboard.overdue.length}</p>
            <p className="text-xs text-slate-500 font-bold mt-1">pagamento(s) em atraso</p>
          </div>
        </div>
      )}

      {/* Add Sale Form */}
      {showAddForm && (
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border-2 border-red-100 dark:border-red-900/30 shadow-xl space-y-6 animate-in slide-in-from-top-4 duration-300">
          <h2 className="text-lg font-black text-red-600 uppercase flex items-center gap-2">
            <ShoppingBag className="w-5 h-5" /> Registrar Venda iFood
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-wider ml-2">Data da Venda</label>
              <input
                type="date"
                value={formData.sale_date}
                onChange={(e) => setFormData({ ...formData, sale_date: e.target.value })}
                className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:border-red-500 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-wider ml-2">Valor Bruto da Venda</label>
              <input
                type="text"
                placeholder="R$ 0,00"
                value={formData.gross_value}
                onChange={(e) => setFormData({ ...formData, gross_value: handleCurrencyMask(e.target.value) })}
                className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl font-black text-lg text-red-600 outline-none focus:border-red-500 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-wider ml-2 flex items-center gap-1">
                <Percent className="w-3 h-3" /> Taxa da Operadora (%)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.operator_fee_percent}
                  readOnly
                  className="w-full px-6 py-4 bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none text-slate-500 cursor-not-allowed transition-all"
                />
                <span className="absolute right-4 top-[18px] text-[10px] font-bold text-slate-400 bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">
                  Fixado em Configurações
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-wider ml-2">Descrição (Opcional)</label>
              <input
                type="text"
                placeholder="Ex: Pedidos do almoço..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:border-red-500 transition-all"
              />
            </div>
          </div>

          {/* Preview de cálculo */}
          {grossPreview > 0 && (
            <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-2xl space-y-3 border border-slate-200 dark:border-slate-700">
              <div className="flex justify-between text-sm">
                <span className="font-bold text-slate-500">Valor Bruto:</span>
                <span className="font-black text-slate-800 dark:text-white">{formatCurrency(grossPreview)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="font-bold text-slate-500">Taxa ({formData.operator_fee_percent}%):</span>
                <span className="font-black text-red-500">- {formatCurrency(feePreview)}</span>
              </div>
              <div className="flex justify-between text-sm pt-3 border-t-2 border-slate-200 dark:border-slate-700">
                <span className="font-black text-slate-600 uppercase text-xs">Valor Líquido a Receber:</span>
                <span className="font-black text-emerald-600 text-lg">{formatCurrency(netPreview)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span className="font-bold">Previsão de depósito:</span>
                <span className="font-black">
                  {(() => {
                    const d = new Date(formData.sale_date + 'T12:00:00Z');
                    d.setDate(d.getDate() + 30);
                    return formatDate(d.toISOString().split('T')[0]);
                  })()}
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-6 py-3 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl font-black text-sm hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleAddSale}
              className="px-8 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-2xl font-black text-sm hover:from-red-600 hover:to-red-700 transition-all shadow-lg shadow-red-500/25"
            >
              Registrar Venda
            </button>
          </div>
        </div>
      )}

      {/* Filters + Batch Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex gap-4">
              {/* View Mode Tabs */}
              <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setViewMode('active')}
                  className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${
                    viewMode === 'active'
                      ? 'bg-white dark:bg-slate-700 text-red-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  Pendentes / Atrasados
                </button>
                <button
                  onClick={() => setViewMode('archive')}
                  className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${
                    viewMode === 'archive'
                      ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  Arquivo Morto (Pagos)
                </button>
              </div>

              {viewMode === 'archive' && (
                <div className="flex bg-slate-100 dark:bg-slate-800 rounded-2xl p-1 border border-slate-200 dark:border-slate-700">
                  <div className="relative">
                    <select
                      value={filterMonth}
                      onChange={(e) => setFilterMonth(Number(e.target.value))}
                      className="appearance-none bg-transparent pl-4 pr-8 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
                    >
                      {months.map((m, i) => (
                        <option key={i} value={i}>{m}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                  <div className="w-px bg-slate-200 dark:bg-slate-700 my-2" />
                  <div className="relative">
                    <select
                      value={filterYear}
                      onChange={(e) => setFilterYear(Number(e.target.value))}
                      className="appearance-none bg-transparent pl-4 pr-8 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
                    >
                      {/* Generates years from 2024 to current + 1 */}
                      {(() => {
                        const currentYear = new Date().getFullYear();
                        const years = [];
                        for (let y = 2024; y <= currentYear + 1; y++) {
                          years.push(y);
                        }
                        return years.map(y => (
                          <option key={y} value={y}>{y}</option>
                        ));
                      })()}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}
            </div>
        {selectedSales.size > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-black text-slate-500 uppercase">
              {selectedSales.size} selecionada(s)
            </span>
            <button
              onClick={handleBatchReconcile}
              className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-lg shadow-emerald-600/25"
            >
              <Check className="w-4 h-4" /> Conciliar Selecionadas
            </button>
            <button
              onClick={() => setSelectedSales(new Set())}
              className="p-2.5 bg-slate-200 dark:bg-slate-700 rounded-xl text-slate-500 hover:text-slate-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {sales.filter(s => s.status === 'Pendente').length > 0 && selectedSales.size === 0 && (
          <button
            onClick={selectAllPending}
            className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-xl text-xs font-black hover:bg-blue-100 transition-colors border border-blue-200 dark:border-blue-800"
          >
            Selecionar Todas Pendentes
          </button>
        )}
      </div>

      {/* Sales List */}
      <div className="space-y-4">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider">
          Vendas por Dia ({sales.length})
        </h3>

        {isLoading ? (
          <div className="text-center py-12">
            <RefreshCw className="w-8 h-8 text-slate-300 animate-spin mx-auto mb-3" />
            <p className="text-slate-400 font-bold text-sm">Carregando...</p>
          </div>
        ) : sales.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-slate-100 dark:border-slate-800">
            <ShoppingBag className="w-12 h-12 text-slate-200 dark:text-slate-700 mx-auto mb-4" />
            <p className="text-slate-400 font-bold text-sm">Nenhuma venda iFood registrada neste período.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(
              sales.reduce((acc, sale) => {
                const date = sale.sale_date.split('T')[0];
                if (!acc[date]) acc[date] = [];
                acc[date].push(sale);
                return acc;
              }, {} as Record<string, iFoodSale[]>)
            ).sort((a, b) => b[0].localeCompare(a[0])) // Sort by date desc
             .map(([date, daySales]: [string, iFoodSale[]]) => {
                const totalGross = daySales.reduce((sum, s) => sum + s.gross_value, 0);
                const totalNet = daySales.reduce((sum, s) => sum + s.net_value, 0);
                const isAllPaid = daySales.every(s => s.status === 'Recebido');
                const hasPending = daySales.some(s => s.status === 'Pendente');
                const pendingIds = daySales.filter(s => s.status === 'Pendente').map(s => s.id);
                
                // Check overview status for coloring
                const firstPending = daySales.find(s => s.status === 'Pendente');
                let dayStatusColor = 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900';
                
                if (firstPending) {
                   const daysUntil = getDaysUntilDue(firstPending.payment_due_date);
                   if (daysUntil < 0) dayStatusColor = 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10';
                   else if (daysUntil <= 3) dayStatusColor = 'border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-900/10';
                } else if (isAllPaid) {
                   dayStatusColor = 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-900/10';
                }

                return (
                  <div key={date} className={`rounded-[1.5rem] border-2 overflow-hidden transition-all ${dayStatusColor}`}>
                    {/* Date Header */}
                    <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          <h4 className="text-lg font-black text-slate-800 dark:text-white capitalise">
                            {new Date(date + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                          </h4>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs font-bold text-slate-500">
                           <span>{daySales.length} venda(s)</span>
                           <span>•</span>
                           <span>Prev. Repasse: {formatDate(daySales[0].payment_due_date)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 justify-between sm:justify-end">
                         <div className="text-right">
                           <p className="text-[10px] font-black uppercase text-slate-400">Total Líquido</p>
                           <p className={`text-lg font-black ${isAllPaid ? 'text-emerald-600' : 'text-slate-800 dark:text-white'}`}>
                             {formatCurrency(totalNet)}
                           </p>
                         </div>

                         {hasPending && (
                            <button
                              onClick={() => {
                                const newSet = new Set(selectedSales);
                                pendingIds.forEach(id => newSet.add(id));
                                setSelectedSales(newSet);
                                // Trigger immediate reconcile if we want, or just select? 
                                // User asked to "mark all as paid", so let's use the batch reconcile logic directly or via selection
                                // Let's trigger batch reconcile directly for better UX
                                fetch('/api/ifood-sales/batch-reconcile', {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ saleIds: pendingIds, userName: user.name }),
                                }).then(async (res) => {
                                   if (res.ok) {
                                     const result = await res.json();
                                     addToast(result.message, 'success');
                                     onLog('iFood', `Conciliou dia ${date}: ${pendingIds.length} vendas`);
                                     fetchData();
                                   } else {
                                     addToast('Erro ao conciliar dia.', 'error');
                                   }
                                }).catch(() => addToast('Erro ao conciliar dia.', 'error'));
                              }}
                              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-black hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Receber Dia
                            </button>
                         )}
                      </div>
                    </div>

                    {/* Sales List within Date */}
                    <div className="border-t border-slate-100 dark:border-slate-700/50 bg-white/50 dark:bg-slate-900/50">
                      {daySales.map((sale) => {
                        const isExpanded = expandedCard === sale.id;
                        const isPending = sale.status === 'Pendente';
                        const isSelected = selectedSales.has(sale.id);
                        
                        const daysUntil = getDaysUntilDue(sale.payment_due_date);
                        const isOverdue = isPending && daysUntil < 0;
                        const isDueSoon = isPending && daysUntil >= 0 && daysUntil <= 3;
                        
                        // Subtle striping or styling for list items
                        const itemStatusClass = isOverdue ? 'text-red-600' : isDueSoon ? 'text-amber-600' : 'text-slate-500';

                        return (
                          <div
                            key={sale.id}
                            className={`border-b last:border-0 border-slate-100 dark:border-slate-800 transition-all ${
                              isSelected ? 'bg-emerald-50/30' : ''
                            }`}
                          >
                            <div className="flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                              {/* Checkbox */}
                              {isPending ? (
                                <button
                                  onClick={() => toggleSelectSale(sale.id)}
                                  className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                                    isSelected
                                      ? 'bg-emerald-600 border-emerald-600 text-white'
                                      : 'border-slate-300 dark:border-slate-600 hover:border-emerald-400 bg-white'
                                  }`}
                                >
                                  {isSelected && <Check className="w-3 h-3" />}
                                </button>
                              ) : (
                                <div className="w-5 h-5 flex items-center justify-center">
                                   <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                </div>
                              )}

                              {/* Sale Info */}
                              <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div className="flex items-center gap-2">
                                  <span className={`text-sm font-bold ${sale.status === 'Recebido' ? 'text-slate-400 decoration-slate-300' : 'text-slate-700 dark:text-slate-200'}`}>
                                    {sale.description || 'Venda iFood'}
                                  </span>
                                  {isOverdue && <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[10px] font-black rounded-full uppercase">Atrasado</span>}
                                  {isDueSoon && <span className="px-2 py-0.5 bg-amber-100 text-amber-600 text-[10px] font-black rounded-full uppercase">Vence Logo</span>}
                                </div>
                              </div>

                              {/* Values */}
                              <div className="text-right flex-shrink-0 flex items-center gap-4">
                                <div>
                                   <p className="text-xs font-bold text-slate-400">Bruto: {formatCurrency(sale.gross_value)}</p>
                                   <p className={`text-sm font-black ${isPending ? 'text-slate-800 dark:text-white' : 'text-emerald-600'}`}>
                                     Liq: {formatCurrency(sale.net_value)}
                                   </p>
                                </div>
                                
                                <button
                                  onClick={() => setExpandedCard(isExpanded ? null : sale.id)}
                                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>

                            {/* Expanded Details */}
                            {isExpanded && (
                              <div className="px-12 pb-4 pt-0 space-y-3 animate-in slide-in-from-top-1 duration-200">
                                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                                  <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase">Taxa Operadora</p>
                                    <p className="text-sm font-black text-red-500">-{formatCurrency(sale.operator_fee_value)} ({sale.operator_fee_percent}%)</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase">Registrado Por</p>
                                    <p className="text-sm font-black text-slate-600 capitalize">{sale.user_name}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase">Data Venda</p>
                                    <p className="text-sm font-black text-slate-600">{formatDate(sale.sale_date)}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase">Previsão Repasse</p>
                                    <p className="text-sm font-black text-slate-600">{formatDate(sale.payment_due_date)}</p>
                                  </div>
                                </div>
                                {isPending && (
                                  <div className="flex justify-end gap-2">
                                     <button
                                      onClick={() => handleDelete(sale.id)}
                                      className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-black hover:bg-red-100 flex items-center gap-1"
                                    >
                                      <Trash2 className="w-3 h-3" /> Excluir
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
             })}
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-4 mt-6">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-xs uppercase hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Anterior
            </button>
            <span className="text-sm font-black text-slate-600 dark:text-slate-400">
              Página {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-xs uppercase hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Próxima
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
