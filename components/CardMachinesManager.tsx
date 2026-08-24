import React, { useState, useEffect, useMemo } from 'react';
import { 
  CreditCard, 
  DollarSign, 
  Percent, 
  TrendingDown, 
  Calendar, 
  Search, 
  Filter, 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Edit2, 
  Trash2, 
  RefreshCw, 
  ArrowDownRight, 
  ChevronRight, 
  Check, 
  X, 
  Building2, 
  Sparkles,
  Layers,
  ArrowUpRight,
  PieChart,
  BarChart3,
  SlidersHorizontal,
  FileSpreadsheet
} from 'lucide-react';
import { User, CardMachineReceivable, CardMachineDashboard, FeeAuditData } from '../types';
import { useToast } from './ToastContext';

interface CardMachinesManagerProps {
  user: User;
}

export const CardMachinesManager: React.FC<CardMachinesManagerProps> = ({ user }) => {
  const { addToast } = useToast();
  
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'reconcile' | 'rates'>('reconcile');

  const [receivables, setReceivables] = useState<CardMachineReceivable[]>([]);
  const [dashboard, setDashboard] = useState<CardMachineDashboard | null>(null);
  const [feeAudit, setFeeAudit] = useState<FeeAuditData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState<number>(now.getMonth() + 1);
  const [filterYear, setFilterYear] = useState<number>(now.getFullYear());
  const [filterStatus, setFilterStatus] = useState<'all' | 'Pendente' | 'Conferido'>('all');
  const [filterModality, setFilterModality] = useState<string>('all');
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterMachine, setFilterMachine] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState(false);
  const [selectedItemForReconcile, setSelectedItemForReconcile] = useState<CardMachineReceivable | null>(null);
  const [editingItem, setEditingItem] = useState<CardMachineReceivable | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    sale_date: new Date().toISOString().split('T')[0],
    expected_payment_date: '',
    modality: 'Débito',
    brand: 'Visa',
    machine_name: 'M1',
    gross_value: '',
    notes: ''
  });

  const [reconcileNetValue, setReconcileNetValue] = useState('');
  const [reconcileNotes, setReconcileNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const months = [
    { num: 1, name: 'Janeiro' },
    { num: 2, name: 'Fevereiro' },
    { num: 3, name: 'Março' },
    { num: 4, name: 'Abril' },
    { num: 5, name: 'Maio' },
    { num: 6, name: 'Junho' },
    { num: 7, name: 'Julho' },
    { num: 8, name: 'Agosto' },
    { num: 9, name: 'Setembro' },
    { num: 10, name: 'Outubro' },
    { num: 11, name: 'Novembro' },
    { num: 12, name: 'Dezembro' },
  ];

  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    const [y, m, d] = dateStr.split('T')[0].split('-');
    return `${d}/${m}/${y}`;
  };

  const parseCurrencyInput = (raw: string): number => {
    const cleaned = raw.replace(/\D/g, '');
    return (parseInt(cleaned, 10) || 0) / 100;
  };

  const formatCurrencyInputDisplay = (raw: string): string => {
    if (!raw) return '';
    const num = parseCurrencyInput(raw);
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams({
        month: String(filterMonth),
        year: String(filterYear),
      });

      if (filterStatus !== 'all') queryParams.append('status', filterStatus);
      if (filterModality !== 'all') queryParams.append('modality', filterModality);
      if (filterBrand !== 'all') queryParams.append('brand', filterBrand);
      if (filterMachine !== 'all') queryParams.append('machine', filterMachine);
      if (searchTerm) queryParams.append('search', searchTerm);

      const [resList, resDash, resAudit] = await Promise.all([
        fetch(`/api/card-machine-receivables?${queryParams.toString()}`),
        fetch(`/api/card-machine-receivables/dashboard?month=${filterMonth}&year=${filterYear}&machine=${filterMachine}`),
        fetch(`/api/card-machine-receivables/fee-audit?month=${filterMonth}&year=${filterYear}`)
      ]);

      if (!resList.ok || !resDash.ok) {
        throw new Error('Falha ao carregar dados de maquininha');
      }

      const listData = await resList.json();
      const dashData = await resDash.json();
      const auditData = resAudit.ok ? await resAudit.json() : null;

      setReceivables(listData);
      setDashboard(dashData);
      setFeeAudit(auditData);
    } catch (err: any) {
      console.error('[CardMachinesManager] Erro ao carregar dados:', err);
      addToast('Erro ao atualizar dados de maquininhas', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filterMonth, filterYear, filterStatus, filterModality, filterBrand, filterMachine, searchTerm]);

  // Handle manual creation / editing
  const handleOpenAddModal = (itemToEdit?: CardMachineReceivable) => {
    if (itemToEdit) {
      setEditingItem(itemToEdit);
      setFormData({
        sale_date: itemToEdit.sale_date,
        expected_payment_date: itemToEdit.expected_payment_date,
        modality: itemToEdit.modality,
        brand: itemToEdit.brand || 'Visa',
        machine_name: itemToEdit.machine_name || 'M1',
        gross_value: (itemToEdit.gross_value * 100).toFixed(0),
        notes: itemToEdit.notes || ''
      });
    } else {
      setEditingItem(null);
      setFormData({
        sale_date: new Date().toISOString().split('T')[0],
        expected_payment_date: '',
        modality: 'Débito',
        brand: 'Visa',
        machine_name: 'M1',
        gross_value: '',
        notes: ''
      });
    }
    setIsAddModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const grossNum = parseCurrencyInput(formData.gross_value);

    if (grossNum <= 0) {
      addToast('Informe um valor bruto válido maior que zero', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const url = editingItem
        ? `/api/card-machine-receivables/${editingItem.id}`
        : '/api/card-machine-receivables';
      
      const method = editingItem ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sale_date: formData.sale_date,
          expected_payment_date: formData.expected_payment_date || undefined,
          modality: formData.modality,
          brand: formData.brand,
          machine_name: formData.machine_name,
          gross_value: grossNum,
          notes: formData.notes,
          reconciled_by: user.name
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || err.error || 'Erro ao salvar registro');
      }

      addToast(editingItem ? 'Lançamento atualizado com sucesso!' : 'Lançamento adicionado com sucesso!', 'success');
      setIsAddModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('[CardMachinesManager] Erro ao salvar:', err);
      addToast(err.message || 'Falha ao salvar recebível', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle single reconciliation
  const handleOpenReconcileModal = (item: CardMachineReceivable) => {
    setSelectedItemForReconcile(item);
    setReconcileNetValue(item.net_deposited_value ? (item.net_deposited_value * 100).toFixed(0) : (item.gross_value * 100).toFixed(0));
    setReconcileNotes(item.notes || '');
    setIsReconcileModalOpen(true);
  };

  const handleReconcileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemForReconcile) return;

    const netNum = parseCurrencyInput(reconcileNetValue);
    if (netNum < 0) {
      addToast('Informe o valor líquido creditado', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/card-machine-receivables/${selectedItemForReconcile.id}/reconcile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          net_deposited_value: netNum,
          reconciled_by: user.name,
          notes: reconcileNotes
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || err.error || 'Erro ao conciliar');
      }

      addToast('Repasse conferido e taxas calculadas com sucesso!', 'success');
      setIsReconcileModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error('[CardMachinesManager] Erro ao conciliar:', err);
      addToast(err.message || 'Falha na conciliação', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este registro de recebível?')) {
      return;
    }

    try {
      const res = await fetch(`/api/card-machine-receivables/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Erro ao excluir');
      addToast('Registro removido!', 'success');
      fetchData();
    } catch (err: any) {
      console.error('[CardMachinesManager] Erro ao excluir:', err);
      addToast('Falha ao excluir registro', 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700/60 shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
            <CreditCard className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">
              Controle de Maquininhas & Taxas
            </h1>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Audite os depósitos bancários das operadoras de cartão, compare taxas e controle os repasses acumulados.
            </p>
          </div>
        </div>

        {/* Action Buttons & Tabs */}
        <div className="flex items-center space-x-3 flex-wrap gap-2">
          {/* Navegação entre as 2 Guias */}
          <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setActiveTab('reconcile')}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                activeTab === 'reconcile'
                  ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Conferência & Repasses</span>
            </button>

            <button
              onClick={() => setActiveTab('rates')}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                activeTab === 'rates'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Percent className="w-4 h-4" />
              <span>Auditoria de Taxas</span>
            </button>
          </div>

          <button
            onClick={() => handleOpenAddModal()}
            className="flex items-center space-x-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Lançamento</span>
          </button>
        </div>
      </div>

      {/* GUIA 1: CONFERÊNCIA & REPASSES */}
      {activeTab === 'reconcile' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-100 dark:border-slate-700/60 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Vendas Cartão</span>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                  {formatCurrency(dashboard?.totalGross)}
                </h3>
                <span className="text-[11px] font-bold text-slate-400 mt-1 block">Bruto consolidado</span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center">
                <DollarSign className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-100 dark:border-slate-700/60 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Líquido Depositado</span>
                <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {formatCurrency(dashboard?.totalNet)}
                </h3>
                <span className="text-[11px] font-bold text-slate-400 mt-1 block">
                  {dashboard?.totalReconciledCount || 0} repasses conferidos
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-100 dark:border-slate-700/60 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Taxas Retidas (R$)</span>
                <h3 className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
                  {formatCurrency(dashboard?.totalFees)}
                </h3>
                <span className="text-[11px] font-bold text-amber-600/80 mt-1 block">
                  Desconto da operadora
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center">
                <TrendingDown className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-100 dark:border-slate-700/60 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Repasses Pendentes</span>
                <h3 className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
                  {dashboard?.totalPendingCount || 0}
                </h3>
                <span className="text-[11px] font-bold text-slate-400 mt-1 block">
                  Aguardando conferência
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center">
                <Clock className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-3xl border border-slate-100 dark:border-slate-700/60 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-3 flex-wrap gap-2 w-full md:w-auto">
              <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-2xl border border-slate-200 dark:border-slate-700">
                <Calendar className="w-4 h-4 text-slate-400" />
                <select
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(Number(e.target.value))}
                  className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
                >
                  {months.map(m => (
                    <option key={m.num} value={m.num} className="dark:bg-slate-800">{m.name}</option>
                  ))}
                </select>
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(Number(e.target.value))}
                  className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer border-l border-slate-200 dark:border-slate-700 pl-2"
                >
                  {[2025, 2026, 2027].map(y => (
                    <option key={y} value={y} className="dark:bg-slate-800">{y}</option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="bg-slate-50 dark:bg-slate-900 px-4 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
              >
                <option value="all">Status: Todos</option>
                <option value="Pendente">Pendentes</option>
                <option value="Conferido">Conferidos</option>
              </select>

              {/* Modality Filter */}
              <select
                value={filterModality}
                onChange={(e) => setFilterModality(e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 px-4 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
              >
                <option value="all">Modalidade: Todas</option>
                <option value="Débito">Débito</option>
                <option value="Crédito à Vista">Crédito à Vista</option>
                <option value="Crédito Parcelado">Crédito Parcelado</option>
              </select>

              {/* Brand Filter */}
              <select
                value={filterBrand}
                onChange={(e) => setFilterBrand(e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 px-4 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
              >
                <option value="all">Bandeira: Todas</option>
                <option value="Visa">Visa</option>
                <option value="Master">Master</option>
                <option value="Elo">Elo</option>
                <option value="Outros">Outros</option>
              </select>

              {/* Machine Filter */}
              <select
                value={filterMachine}
                onChange={(e) => setFilterMachine(e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 px-4 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
              >
                <option value="all">Máquina: Todas</option>
                <option value="M1">Maquininha 1 (M1)</option>
                <option value="M2">Maquininha 2 (M2)</option>
              </select>
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar observações..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 transition-all"
              />
            </div>
          </div>

          {/* Receivables Table */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700/60 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/30 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <th className="py-4 px-6">Data da Venda</th>
                    <th className="py-4 px-6">Repasse Previsto</th>
                    <th className="py-4 px-6">Máquina & Modalidade</th>
                    <th className="py-4 px-6 text-right">Valor Bruto</th>
                    <th className="py-4 px-6 text-right">Líquido Depositado</th>
                    <th className="py-4 px-6 text-right">Taxa (R$ / %)</th>
                    <th className="py-4 px-6 text-center">Status</th>
                    <th className="py-4 px-6 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/40 text-xs font-medium">
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 font-bold">
                        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        Carregando lançamentos...
                      </td>
                    </tr>
                  ) : receivables.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 font-bold">
                        Nenhum lançamento encontrado para os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    receivables.map((item) => {
                      const isReconciled = item.status === 'Conferido';
                      const isWeekend = item.is_weekend_accumulated === 1;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/20 transition-all">
                          <td className="py-4 px-6">
                            <span className="font-bold text-slate-800 dark:text-slate-100">
                              {formatDate(item.sale_date)}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-bold text-slate-700 dark:text-slate-300">
                                {formatDate(item.expected_payment_date)}
                              </span>
                              {isWeekend && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800" title="Acumulado do Fim de Semana (Sexta, Sábado ou Domingo)">
                                  FDS
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <div className="flex items-center space-x-2">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                                item.machine_name === 'M2' 
                                  ? 'bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800' 
                                  : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                              }`}>
                                {item.machine_name || 'M1'}
                              </span>
                              <span className="font-black text-slate-800 dark:text-slate-100">
                                {item.modality}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                {item.brand || 'Outros'}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-right font-black text-slate-900 dark:text-white">
                            {formatCurrency(item.gross_value)}
                          </td>
                          <td className="py-4 px-6 text-right font-black text-emerald-600 dark:text-emerald-400">
                            {isReconciled ? formatCurrency(item.net_deposited_value) : '-'}
                          </td>
                          <td className="py-4 px-6 text-right">
                            {isReconciled && item.fee_value !== null ? (
                              <div className="flex flex-col items-end">
                                <span className="font-black text-amber-600 dark:text-amber-400">
                                  {formatCurrency(item.fee_value)}
                                </span>
                                <span className="text-[10px] font-bold text-slate-400">
                                  {item.fee_percent}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600">-</span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-center">
                            {isReconciled ? (
                              <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Conferido</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                                <Clock className="w-3.5 h-3.5" />
                                <span>Pendente</span>
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              {!isReconciled ? (
                                <button
                                  onClick={() => handleOpenReconcileModal(item)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all"
                                  title="Conferir Depósito"
                                >
                                  Conferir
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleOpenReconcileModal(item)}
                                  className="p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                                  title="Reconferir"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                              )}

                              <button
                                onClick={() => handleOpenAddModal(item)}
                                className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                title="Editar"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => handleDelete(item.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                                title="Excluir"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* GUIA 2: AUDITORIA DE TAXAS */}
      {activeTab === 'rates' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Top Rates KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-5 rounded-3xl text-white shadow-lg shadow-indigo-500/20 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Média Geral de Taxas</span>
                <h3 className="text-3xl font-black mt-1">
                  {feeAudit?.overallAvgFeePercent || 0}%
                </h3>
                <span className="text-[11px] font-medium text-indigo-100 mt-1 block">
                  Total Pago: {formatCurrency(feeAudit?.totalFeesPaid)}
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
                <Percent className="w-6 h-6 text-white" />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-100 dark:border-slate-700/60 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Média Débito</span>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                  {feeAudit?.byModality?.['Débito']?.avgFeePercent || 0}%
                </h3>
                <span className="text-[11px] font-bold text-slate-400 mt-1 block">
                  {formatCurrency(feeAudit?.byModality?.['Débito']?.gross)} transacionados
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center font-black text-xs">
                DÉB
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-100 dark:border-slate-700/60 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Média Crédito 1x</span>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                  {feeAudit?.byModality?.['Crédito à Vista']?.avgFeePercent || 0}%
                </h3>
                <span className="text-[11px] font-bold text-slate-400 mt-1 block">
                  {formatCurrency(feeAudit?.byModality?.['Crédito à Vista']?.gross)} transacionados
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center font-black text-xs">
                1X
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-5 rounded-3xl border border-slate-100 dark:border-slate-700/60 shadow-sm flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Média Parcelado</span>
                <h3 className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
                  {feeAudit?.byModality?.['Crédito Parcelado']?.avgFeePercent || 0}%
                </h3>
                <span className="text-[11px] font-bold text-slate-400 mt-1 block">
                  {formatCurrency(feeAudit?.byModality?.['Crédito Parcelado']?.gross)} transacionados
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center font-black text-xs">
                PARC
              </div>
            </div>
          </div>

          {/* Auditoria por Bandeiras (Visa, Master, Elo, Outros) */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700/60 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 flex items-center justify-center font-black">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 dark:text-white">Taxas por Bandeira de Cartão</h3>
                  <p className="text-xs text-slate-400">Desempenho e custos médios cobrados por cada operadora.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {['Visa', 'Master', 'Elo', 'Outros'].map(brand => {
                const data = feeAudit?.byBrand?.[brand] || { gross: 0, net: 0, fee: 0, avgFeePercent: 0, count: 0 };
                return (
                  <div key={brand} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black text-slate-800 dark:text-slate-100">{brand}</span>
                      <span className="text-xs font-black px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                        {data.avgFeePercent}% média
                      </span>
                    </div>

                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between text-slate-500">
                        <span>Total Bruto:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{formatCurrency(data.gross)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Total Líquido:</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(data.net)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Taxa Total (R$):</span>
                        <span className="font-bold text-amber-600 dark:text-amber-400">{formatCurrency(data.fee)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Histórico Detalhado de Taxas Auditadas */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700/60 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-800 dark:text-white">Extrato de Auditoria Diária de Taxas</h3>
                <p className="text-xs text-slate-400">Todos os repasses conferidos e o percentual efetivamente cobrado pela maquininha.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/30 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <th className="py-4 px-6">Data Repasse</th>
                    <th className="py-4 px-6">Data Venda</th>
                    <th className="py-4 px-6">Modalidade</th>
                    <th className="py-4 px-6">Bandeira</th>
                    <th className="py-4 px-6 text-right">Valor Bruto</th>
                    <th className="py-4 px-6 text-right">Líquido Depositado</th>
                    <th className="py-4 px-6 text-right">Taxa Cobrada</th>
                    <th className="py-4 px-6 text-center">% Efetiva</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/40 text-xs font-medium">
                  {!feeAudit?.recentAudits || feeAudit.recentAudits.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400 font-bold">
                        Nenhuma conferência realizada neste período para calcular taxas.
                      </td>
                    </tr>
                  ) : (
                    feeAudit.recentAudits.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/20 transition-all">
                        <td className="py-4 px-6 font-bold text-slate-800 dark:text-slate-200">
                          {formatDate(item.expected_payment_date)}
                        </td>
                        <td className="py-4 px-6 text-slate-500">
                          {formatDate(item.sale_date)}
                        </td>
                        <td className="py-4 px-6 font-black text-slate-800 dark:text-slate-100">
                          {item.modality}
                        </td>
                        <td className="py-4 px-6">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                            {item.brand || 'Outros'}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right font-black text-slate-900 dark:text-white">
                          {formatCurrency(item.gross_value)}
                        </td>
                        <td className="py-4 px-6 text-right font-black text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(item.net_deposited_value)}
                        </td>
                        <td className="py-4 px-6 text-right font-black text-amber-600 dark:text-amber-400">
                          {formatCurrency(item.fee_value)}
                        </td>
                        <td className="py-4 px-6 text-center">
                          <span className={`px-2 py-0.5 rounded-md font-black text-[11px] ${
                            item.fee_percent > 4 ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                          }`}>
                            {item.fee_percent}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CRIAR / EDITAR LANÇAMENTO MANUAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-up">
            <div className="px-6 py-5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <CreditCard className="w-6 h-6" />
                <h3 className="text-lg font-black tracking-tight">
                  {editingItem ? 'Editar Lançamento de Cartão' : 'Novo Lançamento de Maquininha'}
                </h3>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-white/80 hover:text-white rounded-xl hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-6 space-y-4 text-xs font-bold">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500 uppercase tracking-wider text-[10px]">Data da Venda</label>
                  <input
                    type="date"
                    value={formData.sale_date}
                    onChange={(e) => setFormData({ ...formData, sale_date: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-500 uppercase tracking-wider text-[10px]">Previsão Repasse</label>
                  <input
                    type="date"
                    value={formData.expected_payment_date}
                    onChange={(e) => setFormData({ ...formData, expected_payment_date: e.target.value })}
                    placeholder="Deixe em branco p/ calcular próx. dia útil"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-500 uppercase tracking-wider text-[10px]">Maquininha</label>
                  <select
                    value={formData.machine_name}
                    onChange={(e) => setFormData({ ...formData, machine_name: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none cursor-pointer"
                  >
                    <option value="M1">M1 (Maquininha 1)</option>
                    <option value="M2">M2 (Maquininha 2)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-500 uppercase tracking-wider text-[10px]">Modalidade</label>
                  <select
                    value={formData.modality}
                    onChange={(e) => setFormData({ ...formData, modality: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none cursor-pointer"
                  >
                    <option value="Débito">Débito</option>
                    <option value="Crédito à Vista">Crédito à Vista</option>
                    <option value="Crédito Parcelado">Crédito Parcelado</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-500 uppercase tracking-wider text-[10px]">Bandeira</label>
                  <select
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none cursor-pointer"
                  >
                    <option value="Visa">Visa</option>
                    <option value="Master">Master</option>
                    <option value="Elo">Elo</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 uppercase tracking-wider text-[10px]">Valor Bruto da Venda (R$)</label>
                <input
                  type="text"
                  placeholder="R$ 0,00"
                  value={formatCurrencyInputDisplay(formData.gross_value)}
                  onChange={(e) => setFormData({ ...formData, gross_value: e.target.value.replace(/\D/g, '') })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-base font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 uppercase tracking-wider text-[10px]">Observações / Lote</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Ex: Lote maquininha balcão 1, antecipação..."
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-black uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase tracking-wider shadow-md disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Salvar</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFERÊNCIA INDIVIDUAL */}
      {isReconcileModalOpen && selectedItemForReconcile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-up">
            <div className="px-6 py-5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <CheckCircle2 className="w-6 h-6" />
                <h3 className="text-lg font-black tracking-tight">Conferência de Repasse</h3>
              </div>
              <button 
                onClick={() => setIsReconcileModalOpen(false)}
                className="p-1.5 text-white/80 hover:text-white rounded-xl hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReconcileSubmit} className="p-6 space-y-4 text-xs font-bold">
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl space-y-2 border border-slate-200 dark:border-slate-700">
                <div className="flex justify-between">
                  <span className="text-slate-400">Modalidade & Bandeira:</span>
                  <span className="font-black text-slate-800 dark:text-white">
                    {selectedItemForReconcile.modality} ({selectedItemForReconcile.brand || 'Outros'})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Data da Venda:</span>
                  <span className="font-black text-slate-800 dark:text-white">{formatDate(selectedItemForReconcile.sale_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Previsão Depósito:</span>
                  <span className="font-black text-slate-800 dark:text-white">{formatDate(selectedItemForReconcile.expected_payment_date)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-slate-700 dark:text-slate-300">Valor Bruto:</span>
                  <span className="font-black text-slate-900 dark:text-white text-base">
                    {formatCurrency(selectedItemForReconcile.gross_value)}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-500 uppercase tracking-wider text-[10px]">
                  Valor Líquido Creditado na Conta (R$)
                </label>
                <input
                  type="text"
                  placeholder="R$ 0,00"
                  value={formatCurrencyInputDisplay(reconcileNetValue)}
                  onChange={(e) => setReconcileNetValue(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-base font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              {/* Cálculo dinâmico de taxa */}
              {parseCurrencyInput(reconcileNetValue) > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900/60 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase text-amber-700 dark:text-amber-400 block">Taxa Calculada</span>
                    <span className="text-sm font-black text-amber-800 dark:text-amber-300">
                      {formatCurrency(Math.max(0, selectedItemForReconcile.gross_value - parseCurrencyInput(reconcileNetValue)))}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase text-amber-700 dark:text-amber-400 block">% Taxa</span>
                    <span className="text-sm font-black text-amber-800 dark:text-amber-300">
                      {((Math.max(0, selectedItemForReconcile.gross_value - parseCurrencyInput(reconcileNetValue)) / selectedItemForReconcile.gross_value) * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-slate-500 uppercase tracking-wider text-[10px]">Observações da Conferência</label>
                <textarea
                  value={reconcileNotes}
                  onChange={(e) => setReconcileNotes(e.target.value)}
                  placeholder="Ex: Conferido extrato Itaú lote #1234"
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsReconcileModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-black uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase tracking-wider shadow-md disabled:opacity-50 flex items-center space-x-1.5"
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirmar Conferência</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
