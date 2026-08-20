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
  ArrowUpRight
} from 'lucide-react';
import { User, CardMachineReceivable, CardMachineDashboard } from '../types';
import { useToast } from './ToastContext';

interface CardMachinesManagerProps {
  user: User;
}

export const CardMachinesManager: React.FC<CardMachinesManagerProps> = ({ user }) => {
  const { addToast } = useToast();
  
  const [receivables, setReceivables] = useState<CardMachineReceivable[]>([]);
  const [dashboard, setDashboard] = useState<CardMachineDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState<number>(now.getMonth() + 1);
  const [filterYear, setFilterYear] = useState<number>(now.getFullYear());
  const [filterStatus, setFilterStatus] = useState<'all' | 'Pendente' | 'Conferido'>('all');
  const [filterModality, setFilterModality] = useState<string>('all');
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
      let url = `/api/card-machine-receivables?month=${filterMonth}&year=${filterYear}`;
      if (filterStatus !== 'all') url += `&status=${filterStatus}`;
      if (filterModality !== 'all') url += `&modality=${encodeURIComponent(filterModality)}`;
      if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;

      let dashUrl = `/api/card-machine-receivables/dashboard?month=${filterMonth}&year=${filterYear}`;

      const [resList, resDash] = await Promise.all([
        fetch(url),
        fetch(dashUrl)
      ]);

      if (!resList.ok || !resDash.ok) throw new Error('Erro ao carregar dados');

      const dataList = await resList.json();
      const dataDash = await resDash.json();

      setReceivables(dataList);
      setDashboard(dataDash);
    } catch (err) {
      console.error('Erro ao carregar recebíveis de maquininha:', err);
      addToast('Erro ao carregar dados de maquininhas.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filterMonth, filterYear, filterStatus, filterModality, searchTerm]);

  // Open Reconcile Modal for a specific item
  const handleOpenReconcile = (item: CardMachineReceivable) => {
    setSelectedItemForReconcile(item);
    if (item.net_deposited_value !== null && item.net_deposited_value !== undefined) {
      setReconcileNetValue((item.net_deposited_value * 100).toFixed(0));
    } else {
      setReconcileNetValue('');
    }
    setReconcileNotes(item.notes || '');
    setIsReconcileModalOpen(true);
  };

  // Submit Reconcile
  const handleSaveReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemForReconcile) return;

    const netValue = parseCurrencyInput(reconcileNetValue);
    if (netValue <= 0) {
      addToast('Informe o valor que caiu na conta do banco.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/card-machine-receivables/${selectedItemForReconcile.id}/reconcile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          net_deposited_value: netValue,
          reconciled_by: user.name,
          notes: reconcileNotes
        })
      });

      if (!res.ok) throw new Error('Erro ao salvar conferência');
      const updated = await res.json();

      addToast(`Conferência salva! Taxa apurada: ${updated.fee_percent}% (${formatCurrency(updated.fee_value)})`, 'success');
      setIsReconcileModalOpen(false);
      setSelectedItemForReconcile(null);
      fetchData();
    } catch (err) {
      console.error('Erro ao salvar conferência:', err);
      addToast('Falha ao salvar conferência bancária.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create or Update Manual Item
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const grossVal = parseCurrencyInput(formData.gross_value);
    if (grossVal <= 0) {
      addToast('Informe um valor bruto válido.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingItem) {
        // Update
        const res = await fetch(`/api/card-machine-receivables/${editingItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sale_date: formData.sale_date,
            expected_payment_date: formData.expected_payment_date || null,
            modality: formData.modality,
            gross_value: grossVal,
            notes: formData.notes
          })
        });
        if (!res.ok) throw new Error('Erro ao atualizar');
        addToast('Lançamento atualizado com sucesso!', 'success');
      } else {
        // Create
        const res = await fetch('/api/card-machine-receivables', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sale_date: formData.sale_date,
            expected_payment_date: formData.expected_payment_date || null,
            modality: formData.modality,
            gross_value: grossVal,
            notes: formData.notes
          })
        });
        if (!res.ok) throw new Error('Erro ao criar');
        addToast('Lançamento avulso registrado com sucesso!', 'success');
      }

      setIsAddModalOpen(false);
      setEditingItem(null);
      setFormData({
        sale_date: new Date().toISOString().split('T')[0],
        expected_payment_date: '',
        modality: 'Débito',
        gross_value: '',
        notes: ''
      });
      fetchData();
    } catch (err) {
      console.error('Erro ao salvar:', err);
      addToast('Erro ao salvar lançamento.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (item: CardMachineReceivable) => {
    setEditingItem(item);
    setFormData({
      sale_date: item.sale_date,
      expected_payment_date: item.expected_payment_date,
      modality: item.modality,
      gross_value: (item.gross_value * 100).toFixed(0),
      notes: item.notes || ''
    });
    setIsAddModalOpen(true);
  };

  // Delete Item
  const handleDeleteItem = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este recebível de maquininha?')) return;

    try {
      const res = await fetch(`/api/card-machine-receivables/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Erro ao excluir');
      addToast('Lançamento excluído com sucesso.', 'success');
      fetchData();
    } catch (err) {
      console.error('Erro ao excluir:', err);
      addToast('Erro ao excluir recebível.', 'error');
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-gradient-to-tr from-indigo-500 to-purple-600 text-white rounded-2xl shadow-lg shadow-indigo-500/20">
            <CreditCard className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
              Controle de Maquininhas & Cartões
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Auditoria de Taxas
              </span>
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Conferência bancária dos repasses diários de cartão de crédito, débito e Pix com cálculo automático de taxas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="p-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 transition-colors"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          
          <button
            onClick={() => {
              setEditingItem(null);
              setFormData({
                sale_date: new Date().toISOString().split('T')[0],
                expected_payment_date: '',
                modality: 'Débito',
                gross_value: '',
                notes: ''
              });
              setIsAddModalOpen(true);
            }}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-sm rounded-2xl shadow-md shadow-indigo-500/20 flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            Novo Lançamento
          </button>
        </div>
      </div>

      {/* KPI Dashboard Cards */}
      {dashboard && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Bruto Esperado */}
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Bruto Maquininha</span>
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-800 dark:text-slate-100">
              {formatCurrency(dashboard.totalGross)}
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <span>{dashboard.totalPendingCount + dashboard.totalReconciledCount} lançamentos no período</span>
            </div>
          </div>

          {/* Card 2: Líquido Depositado */}
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Líquido Depositado</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-xl">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {formatCurrency(dashboard.totalNet)}
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">{dashboard.totalReconciledCount}</span> conferidos
              <span className="opacity-40">•</span>
              <span className="text-amber-500 font-bold">{dashboard.totalPendingCount}</span> pendentes
            </div>
          </div>

          {/* Card 3: Taxas Retidas (R$) */}
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-rose-500 uppercase tracking-wider">Taxas Retidas (R$)</span>
              <div className="p-2 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 rounded-xl">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
              {formatCurrency(dashboard.totalFees)}
            </div>
            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Descontado pela operadora nas conferências
            </div>
          </div>

          {/* Card 4: Média Geral das Taxas (%) */}
          <div className="p-5 rounded-3xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20 relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-black uppercase tracking-wider text-indigo-100">Média Geral de Taxa</span>
              <div className="p-2 bg-white/20 backdrop-blur-md rounded-xl text-white">
                <Percent className="w-4 h-4" />
              </div>
            </div>
            <div className="text-3xl font-black tracking-tight">
              {dashboard.avgFeePercent.toFixed(2)}%
            </div>
            <div className="mt-2 text-xs text-indigo-100/90 font-medium">
              Taxa média ponderada de administração
            </div>
          </div>
        </div>
      )}

      {/* Modality Breakdown Bar */}
      {dashboard && dashboard.byModality && (
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-indigo-500" />
            Taxas Médias por Modalidade:
          </span>
          <div className="flex flex-wrap items-center gap-4">
            {Object.entries(dashboard.byModality).map(([mod, stats]) => (
              <div key={mod} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{mod}:</span>
                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">
                  {stats.avgFeePercent > 0 ? `${stats.avgFeePercent.toFixed(2)}%` : '--'}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  ({formatCurrency(stats.gross)})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Mês */}
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(Number(e.target.value))}
            className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500"
          >
            {months.map(m => (
              <option key={m.num} value={m.num}>{m.name}</option>
            ))}
          </select>

          {/* Ano */}
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(Number(e.target.value))}
            className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500"
          >
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Status */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Todos os Status</option>
            <option value="Pendente">Apenas Pendentes</option>
            <option value="Conferido">Apenas Conferidos</option>
          </select>

          {/* Modalidade */}
          <select
            value={filterModality}
            onChange={(e) => setFilterModality(e.target.value)}
            className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Todas Modalidades</option>
            <option value="Débito">Débito</option>
            <option value="Crédito">Crédito</option>
            <option value="Pix Maquininha">Pix Maquininha</option>
          </select>
        </div>

        {/* Busca */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por notas ou modalidade..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Receivables Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                <th className="py-4 px-4">Data Venda</th>
                <th className="py-4 px-4">Previsto Banco</th>
                <th className="py-4 px-4">Modalidade</th>
                <th className="py-4 px-4 text-right">Valor Bruto</th>
                <th className="py-4 px-4 text-right">Líquido Depositado</th>
                <th className="py-4 px-4 text-right">Taxa (R$)</th>
                <th className="py-4 px-4 text-center">Taxa (%)</th>
                <th className="py-4 px-4 text-center">Status</th>
                <th className="py-4 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-400">
                    <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Carregando lançamentos de maquininha...
                  </td>
                </tr>
              ) : receivables.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-400">
                    <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-bold text-slate-600 dark:text-slate-300">Nenhum lançamento encontrado</p>
                    <p className="text-[11px] text-slate-400 mt-1">Os recebíveis são gerados automaticamente nos fechamentos de caixa ou inseridos manualmente.</p>
                  </td>
                </tr>
              ) : (
                receivables.map(item => {
                  const isReconciled = item.status === 'Conferido';
                  const feePercent = item.fee_percent || 0;

                  return (
                    <tr 
                      key={item.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Data Venda */}
                      <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                        {formatDate(item.sale_date)}
                      </td>

                      {/* Previsto */}
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatDate(item.expected_payment_date)}
                      </td>

                      {/* Modalidade */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider ${
                          item.modality.includes('Débito') 
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                            : item.modality.includes('Crédito')
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}>
                          {item.modality}
                        </span>
                      </td>

                      {/* Valor Bruto */}
                      <td className="py-3.5 px-4 text-right font-black text-slate-800 dark:text-slate-100 whitespace-nowrap">
                        {formatCurrency(item.gross_value)}
                      </td>

                      {/* Líquido Depositado */}
                      <td className="py-3.5 px-4 text-right font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {item.net_deposited_value !== null && item.net_deposited_value !== undefined 
                          ? formatCurrency(item.net_deposited_value)
                          : <span className="text-slate-400 font-normal italic">Pendente</span>
                        }
                      </td>

                      {/* Taxa R$ */}
                      <td className="py-3.5 px-4 text-right font-bold text-rose-500 whitespace-nowrap">
                        {item.fee_value !== null && item.fee_value !== undefined 
                          ? formatCurrency(item.fee_value)
                          : '-'
                        }
                      </td>

                      {/* Taxa % */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {item.fee_percent !== null && item.fee_percent !== undefined ? (
                          <span className={`px-2 py-0.5 rounded-md font-black text-xs ${
                            feePercent > 5 
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                              : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                          }`}>
                            {feePercent.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          isReconciled 
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                        }`}>
                          {isReconciled ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          {item.status}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenReconcile(item)}
                            className={`px-2.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 transition-all ${
                              isReconciled
                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200'
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-500/20'
                            }`}
                            title={isReconciled ? 'Revisar conferência' : 'Conferir valor que caiu no banco'}
                          >
                            <Check className="w-3.5 h-3.5" />
                            {isReconciled ? 'Revisar' : 'Conferir'}
                          </button>

                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            title="Editar lançamento"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                            title="Excluir lançamento"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* Modal: Conferência Individual */}
      {isReconcileModalOpen && selectedItemForReconcile && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95">
            <div className="p-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                  {selectedItemForReconcile.modality}
                </span>
                <h3 className="text-lg font-black mt-1">Conferir Depósito Bancário</h3>
              </div>
              <button 
                onClick={() => setIsReconcileModalOpen(false)}
                className="text-white/80 hover:text-white p-1.5 rounded-xl hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveReconcile} className="p-6 space-y-4">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Valor Bruto da Venda</span>
                  <span className="text-lg font-black text-slate-800 dark:text-slate-100">
                    {formatCurrency(selectedItemForReconcile.gross_value)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Data da Venda</span>
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    {formatDate(selectedItemForReconcile.sale_date)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  Valor Depositado na Conta (Líquido) *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="R$ 0,00"
                  autoFocus
                  value={reconcileNetValue ? formatCurrencyInputDisplay(reconcileNetValue) : ''}
                  onChange={(e) => setReconcileNetValue(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-4 py-3 text-lg font-black text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              {/* Real-time calculated fee */}
              {reconcileNetValue && (
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 block">Taxa de Administração</span>
                    <span className="text-sm font-black text-indigo-700 dark:text-indigo-300">
                      {selectedItemForReconcile.gross_value > 0 
                        ? `${(((Math.max(0, selectedItemForReconcile.gross_value - parseCurrencyInput(reconcileNetValue))) / selectedItemForReconcile.gross_value) * 100).toFixed(2)}%`
                        : '0%'
                      }
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Desconto R$</span>
                    <span className="text-sm font-black text-rose-600 dark:text-rose-400">
                      {formatCurrency(Math.max(0, selectedItemForReconcile.gross_value - parseCurrencyInput(reconcileNetValue)))}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  Observações (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Lote Cielo / PagBank depósito TED"
                  value={reconcileNotes}
                  onChange={(e) => setReconcileNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsReconcileModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-500/20 flex items-center gap-1.5"
                >
                  {isSubmitting ? 'Salvando...' : 'Confirmar e Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Adicionar / Editar Lançamento */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95">
            <div className="p-5 bg-gradient-to-r from-slate-800 to-indigo-900 text-white flex items-center justify-between">
              <h3 className="text-lg font-black">
                {editingItem ? 'Editar Lançamento' : 'Novo Lançamento Avulso'}
              </h3>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-white/80 hover:text-white p-1.5 rounded-xl hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Data da Venda *
                  </label>
                  <input
                    type="date"
                    value={formData.sale_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, sale_date: e.target.value }))}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                    Data Repasse Banco
                  </label>
                  <input
                    type="date"
                    value={formData.expected_payment_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, expected_payment_date: e.target.value }))}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Modalidade *
                </label>
                <select
                  value={formData.modality}
                  onChange={(e) => setFormData(prev => ({ ...prev, modality: e.target.value }))}
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                >
                  <option value="Débito">Débito</option>
                  <option value="Crédito">Crédito</option>
                  <option value="Pix Maquininha">Pix Maquininha</option>
                  <option value="Voucher / Convênio">Voucher / Convênio</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Valor Bruto (Maquininha) *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="R$ 0,00"
                  value={formData.gross_value ? formatCurrencyInputDisplay(formData.gross_value) : ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, gross_value: e.target.value.replace(/\D/g, '') }))}
                  className="w-full px-3 py-2.5 text-base font-black rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  Observações
                </label>
                <input
                  type="text"
                  placeholder="Ex: Operadora SafraPay / Rede"
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-500/20"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CardMachinesManager;
