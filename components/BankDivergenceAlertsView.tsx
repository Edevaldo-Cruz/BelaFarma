import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  CreditCard,
  ShoppingBag,
  QrCode,
  Building2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ArrowLeft,
  Search,
  RotateCcw,
  MessageSquareText,
  Layers,
  Check
} from 'lucide-react';
import { User, View } from '../types';
import { useToast } from './ToastContext';

interface BankDivergenceAlertsViewProps {
  user: User;
  onNavigate?: (view: View) => void;
}

type CategoryTab = 'ALL' | 'CREDITO' | 'DEBITO' | 'IFOOD' | 'PIX' | 'BANCO';
type StatusFilter = 'OPEN' | 'RESOLVED' | 'ALL';

interface DivergenceAlert {
  id: string;
  fingerprint: string;
  category: 'CREDITO' | 'DEBITO' | 'IFOOD' | 'PIX' | 'BANCO';
  severity: 'CRITICO' | 'ATENCAO';
  title: string;
  description: string;
  expected_value: number | null;
  actual_value: number | null;
  difference_value: number | null;
  reference_date: string | null;
  account_id: string | null;
  status: 'OPEN' | 'RESOLVED';
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CategoryCount {
  open: number;
  resolved: number;
}

export const BankDivergenceAlertsView: React.FC<BankDivergenceAlertsViewProps> = ({ user, onNavigate }) => {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<CategoryTab>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('OPEN');
  const [searchTerm, setSearchTerm] = useState('');
  const [alerts, setAlerts] = useState<DivergenceAlert[]>([]);
  const [counts, setCounts] = useState<Record<CategoryTab, CategoryCount>>({
    ALL: { open: 0, resolved: 0 },
    CREDITO: { open: 0, resolved: 0 },
    DEBITO: { open: 0, resolved: 0 },
    IFOOD: { open: 0, resolved: 0 },
    PIX: { open: 0, resolved: 0 },
    BANCO: { open: 0, resolved: 0 }
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [auditing, setAuditing] = useState<boolean>(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  const formatBRL = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '-';
    return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatDateBR = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    const clean = dateStr.substring(0, 10);
    const parts = clean.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : clean;
  };

  const formatDateTimeBR = (iso?: string | null) => {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return iso;
    }
  };

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/bank-conciliation/divergencias');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao carregar alertas de divergência.');
      }
      setAlerts(data.alerts || []);
      if (data.counts) {
        setCounts(data.counts);
      }
    } catch (err: any) {
      console.error(err);
      addToast(err?.message || 'Erro ao buscar alertas de divergência', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const handleAuditarAgora = async () => {
    try {
      setAuditing(true);
      const res = await fetch('/api/bank-conciliation/executar-rotina-diaria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enviarWhatsapp: false })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao executar auditoria.');
      }
      const qtd = Array.isArray(data.alertas) ? data.alertas.length : 0;
      addToast(
        qtd > 0
          ? `Auditoria concluída: ${qtd} divergência(s) identificada(s).`
          : 'Auditoria concluída: nenhuma nova divergência encontrada!',
        qtd > 0 ? 'warning' : 'success'
      );
      await fetchAlerts();
    } catch (err: any) {
      addToast(err?.message || 'Erro ao executar auditoria', 'error');
    } finally {
      setAuditing(false);
    }
  };

  const handleResolver = async (alert: DivergenceAlert) => {
    try {
      setSavingId(alert.id);
      const note = (notesById[alert.id] || '').trim();
      const res = await fetch(`/api/bank-conciliation/divergencias/${encodeURIComponent(alert.id)}/resolver`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolutionNote: note,
          userName: user.name || 'Administrador'
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao resolver alerta.');
      }
      addToast('Divergência marcada como resolvida!', 'success');
      await fetchAlerts();
    } catch (err: any) {
      addToast(err?.message || 'Erro ao resolver divergência', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const handleReabrir = async (alert: DivergenceAlert) => {
    try {
      setSavingId(alert.id);
      const res = await fetch(`/api/bank-conciliation/divergencias/${encodeURIComponent(alert.id)}/reabrir`, {
        method: 'PUT'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao reabrir alerta.');
      }
      addToast('Alerta reaberto para análise.', 'info');
      await fetchAlerts();
    } catch (err: any) {
      addToast(err?.message || 'Erro ao reabrir alerta', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const filteredAlerts = useMemo(() => {
    return alerts.filter(a => {
      if (activeTab !== 'ALL' && a.category !== activeTab) return false;
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const text = `${a.title} ${a.description} ${a.resolution_note || ''} ${a.reference_date || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [alerts, activeTab, statusFilter, searchTerm]);

  const tabs: { id: CategoryTab; label: string; icon: any }[] = [
    { id: 'ALL', label: 'Todas', icon: Layers },
    { id: 'CREDITO', label: 'Crédito', icon: CreditCard },
    { id: 'DEBITO', label: 'Débito', icon: CreditCard },
    { id: 'IFOOD', label: 'iFood', icon: ShoppingBag },
    { id: 'PIX', label: 'Pix', icon: QrCode },
    { id: 'BANCO', label: 'Banco / Tarifas', icon: Building2 }
  ];

  const getCategoryMeta = (cat: string) => {
    switch (cat) {
      case 'CREDITO':
        return { label: 'Crédito', badge: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-indigo-500/30' };
      case 'DEBITO':
        return { label: 'Débito', badge: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border-cyan-500/30' };
      case 'IFOOD':
        return { label: 'iFood', badge: 'bg-red-500/10 text-red-600 dark:text-red-300 border-red-500/30' };
      case 'PIX':
        return { label: 'Pix', badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30' };
      default:
        return { label: 'Banco / Tarifas', badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/30' };
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="bg-gradient-to-r from-slate-900 via-rose-950/60 to-slate-900 border border-rose-800/40 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold rounded-full inline-flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                Auditoria Bancária por Categoria
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Alertas de Divergência
            </h1>
            <p className="text-slate-300 text-sm mt-1">
              Analise diferenças encontradas entre caixa, maquininhas, iFood, Pix e extrato bancário, registre uma observação e marque como resolvido.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {onNavigate && (
              <button
                onClick={() => onNavigate('bank-conciliation')}
                className="px-3.5 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition flex items-center gap-2 text-xs font-semibold"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Bancos & Conciliação</span>
              </button>
            )}
            <button
              onClick={handleAuditarAgora}
              disabled={auditing}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow-lg shadow-rose-950/40 font-semibold text-xs flex items-center gap-2 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${auditing ? 'animate-spin' : ''}`} />
              <span>{auditing ? 'Auditando...' : 'Auditar Agora'}</span>
            </button>
          </div>
        </div>

        {/* Resumo Pendentes x Resolvidos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
            <span className="text-[11px] text-slate-400 block">Pendentes (Total)</span>
            <span className="text-xl font-extrabold text-amber-400">{counts.ALL.open}</span>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
            <span className="text-[11px] text-slate-400 block">Cartões (Crédito + Débito)</span>
            <span className="text-xl font-extrabold text-white">{counts.CREDITO.open + counts.DEBITO.open}</span>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
            <span className="text-[11px] text-slate-400 block">iFood + Pix</span>
            <span className="text-xl font-extrabold text-white">{counts.IFOOD.open + counts.PIX.open}</span>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
            <span className="text-[11px] text-slate-400 block">Resolvidos</span>
            <span className="text-xl font-extrabold text-emerald-400">{counts.ALL.resolved}</span>
          </div>
        </div>
      </div>

      {/* Guias por Categoria */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const openCount = counts[tab.id]?.open || 0;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-2 ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {openCount > 0 && (
                  <span className={`px-1.5 py-0.5 text-[10px] rounded-full font-bold ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                  }`}>
                    {openCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Filtros de Status e Busca */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar alerta..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48 sm:w-56"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="OPEN">Pendentes</option>
            <option value="RESOLVED">Resolvidos</option>
            <option value="ALL">Todos</option>
          </select>
        </div>
      </div>

      {/* Lista de Cards */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center text-slate-500 text-sm">
          Carregando alertas de divergência...
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
            Nenhum alerta encontrado nesta guia
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {statusFilter === 'OPEN'
              ? 'Tudo conferido e sem pendências de divergência por aqui.'
              : 'Altere o filtro de status ou execute uma nova auditoria.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredAlerts.map((alert) => {
            const catMeta = getCategoryMeta(alert.category);
            const isResolved = alert.status === 'RESOLVED';
            const hasNumericValues =
              alert.expected_value !== null ||
              alert.actual_value !== null ||
              alert.difference_value !== null;

            return (
              <div
                key={alert.id}
                className={`rounded-2xl border p-5 shadow-sm transition flex flex-col justify-between gap-4 ${
                  isResolved
                    ? 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 opacity-90'
                    : alert.severity === 'CRITICO'
                      ? 'bg-white dark:bg-slate-900 border-rose-300 dark:border-rose-800/60'
                      : 'bg-white dark:bg-slate-900 border-amber-300 dark:border-amber-800/60'
                }`}
              >
                <div className="space-y-3">
                  {/* Topo do Card */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${catMeta.badge}`}>
                        {catMeta.label}
                      </span>
                      {isResolved ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Resolvido
                        </span>
                      ) : (
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border inline-flex items-center gap-1 ${
                          alert.severity === 'CRITICO'
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                        }`}>
                          <AlertTriangle className="w-3 h-3" /> {alert.severity}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Ref.: {formatDateBR(alert.reference_date || alert.created_at)}
                    </span>
                  </div>

                  {/* Título e Descrição */}
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm md:text-base">
                      {alert.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      {alert.description}
                    </p>
                  </div>

                  {/* Mini-grid de Valores */}
                  {hasNumericValues && (
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-2.5 text-center">
                      <div>
                        <span className="block text-[10px] uppercase text-slate-400 font-semibold">Esperado</span>
                        <span className="text-xs font-bold font-mono text-slate-800 dark:text-slate-200">
                          {formatBRL(alert.expected_value)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase text-slate-400 font-semibold">No Banco</span>
                        <span className="text-xs font-bold font-mono text-slate-800 dark:text-slate-200">
                          {formatBRL(alert.actual_value)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase text-slate-400 font-semibold">Diferença</span>
                        <span className={`text-xs font-bold font-mono ${
                          (alert.difference_value || 0) < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {formatBRL(alert.difference_value)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Área de Resolução ou Resumo Resolvido */}
                {isResolved ? (
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-3 flex flex-col gap-2">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs">
                      <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300 mb-1">
                        <MessageSquareText className="w-3.5 h-3.5" />
                        <span>Observação registrada:</span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-200">
                        {alert.resolution_note || 'Sem observação adicional.'}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                        Resolvido por <strong>{alert.resolved_by || 'Administrador'}</strong> em {formatDateTimeBR(alert.resolved_at)}
                      </p>
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleReabrir(alert)}
                        disabled={savingId === alert.id}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-lg inline-flex items-center gap-1.5 transition"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reabrir</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2.5">
                    <textarea
                      rows={2}
                      value={notesById[alert.id] || ''}
                      onChange={(e) => setNotesById(prev => ({ ...prev, [alert.id]: e.target.value }))}
                      placeholder="Escreva uma observação sobre como foi conferido ou justificado..."
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleResolver(alert)}
                        disabled={savingId === alert.id}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition shadow-sm disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{savingId === alert.id ? 'Salvando...' : 'Marcar como Resolvido'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BankDivergenceAlertsView;
