import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare, Users, Search, RefreshCw, Package,
  AlertTriangle, CheckCircle, XCircle, Clock, ChevronRight,
  X, Phone, MapPin, ShoppingBag, Download, Filter, TrendingUp
} from 'lucide-react';
import { useToast } from './ToastContext';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface WACCustomer {
  id: string;
  name: string;
  phone: string;
  whatsapp_name?: string;
  address?: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
  product_count: number;
  not_found_count: number;
  purchased_count: number;
  last_product_interaction?: string;
}

interface ProductHistory {
  id: string;
  phone: string;
  customer_id: string;
  product_name: string;
  status: 'comprado' | 'pesquisado' | 'nao_encontrado' | 'cancelado';
  interaction_date?: string;
  notes?: string;
  created_at: string;
}

interface CustomerDetail {
  customer: WACCustomer;
  productHistory: ProductHistory[];
  summary: {
    total: number;
    byStatus: {
      comprado: ProductHistory[];
      pesquisado: ProductHistory[];
      nao_encontrado: ProductHistory[];
      cancelado: ProductHistory[];
    };
  };
}

interface CRMStats {
  totalCustomers: number;
  totalProducts: number;
  totalNotFound: number;
  totalPurchased: number;
  totalShortagesFromWA: number;
  topNotFound: { product_name: string; times: number }[];
  topPurchased: { product_name: string; times: number }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  comprado: {
    label: 'Comprado',
    color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    icon: CheckCircle,
  },
  pesquisado: {
    label: 'Pesquisado',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    dot: 'bg-blue-500',
    icon: Search,
  },
  nao_encontrado: {
    label: 'Não Encontrado',
    color: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    dot: 'bg-red-500',
    icon: AlertTriangle,
  },
  cancelado: {
    label: 'Cancelado',
    color: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-400',
    dot: 'bg-slate-400',
    icon: XCircle,
  },
};

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, '');
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return phone;
}

function timeAgo(dateStr?: string) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  if (days < 30) return `${days} dias atrás`;
  const months = Math.floor(days / 30);
  return `${months} ${months === 1 ? 'mês' : 'meses'} atrás`;
}

// ─── Componente: Badge de Status ──────────────────────────────────────────────

function StatusBadge({ status }: { status: ProductHistory['status'] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Componente: Modal de Detalhe ─────────────────────────────────────────────

function CustomerDetailModal({
  customerId,
  onClose,
}: {
  customerId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'comprado' | 'pesquisado' | 'nao_encontrado' | 'cancelado'>('all');
  const { addToast } = useToast();

  useEffect(() => {
    fetch(`/api/whatsapp/crm-customers/${customerId}`)
      .then(r => r.json())
      .then(data => {
        setDetail(data);
        setLoading(false);
      })
      .catch(() => {
        addToast('Erro ao carregar detalhes do cliente.', 'error');
        setLoading(false);
      });
  }, [customerId]);

  const handleDeleteProduct = async (productId: string) => {
    try {
      await fetch(`/api/whatsapp/crm-customers/${customerId}/products/${productId}`, { method: 'DELETE' });
      setDetail(prev => {
        if (!prev) return prev;
        const newHistory = prev.productHistory.filter(p => p.id !== productId);
        return { ...prev, productHistory: newHistory };
      });
      addToast('Produto removido do histórico.', 'success');
    } catch {
      addToast('Erro ao remover produto.', 'error');
    }
  };

  const filtered = detail?.productHistory.filter(p =>
    activeTab === 'all' ? true : p.status === activeTab
  ) || [];

  const tabs = [
    { key: 'all', label: 'Todos', count: detail?.summary.total || 0 },
    { key: 'comprado', label: 'Comprados', count: detail?.summary.byStatus.comprado.length || 0 },
    { key: 'pesquisado', label: 'Pesquisados', count: detail?.summary.byStatus.pesquisado.length || 0 },
    { key: 'nao_encontrado', label: 'Não Encontrados', count: detail?.summary.byStatus.nao_encontrado.length || 0 },
    { key: 'cancelado', label: 'Cancelados', count: detail?.summary.byStatus.cancelado.length || 0 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b dark:border-slate-700 bg-gradient-to-r from-emerald-600 to-teal-600">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xl">
              {detail?.customer.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {loading ? '...' : detail?.customer.name}
              </h2>
              {detail?.customer.whatsapp_name && detail.customer.whatsapp_name !== detail.customer.name && (
                <p className="text-emerald-100 text-sm">WA: {detail.customer.whatsapp_name}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/20 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : detail ? (
          <>
            {/* Info */}
            <div className="p-5 grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/50 border-b dark:border-slate-700">
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <Phone className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>{formatPhone(detail.customer.phone)}</span>
              </div>
              {detail.customer.address ? (
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 col-span-2">
                  <MapPin className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span>{detail.customer.address}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500">
                  <MapPin className="w-4 h-4 flex-shrink-0" />
                  <span>Endereço não disponível</span>
                </div>
              )}
              <div className="col-span-2 flex gap-3 mt-1">
                {[
                  { label: 'Comprados', count: detail.summary.byStatus.comprado.length, color: 'text-emerald-600 dark:text-emerald-400' },
                  { label: 'Pesquisados', count: detail.summary.byStatus.pesquisado.length, color: 'text-blue-600 dark:text-blue-400' },
                  { label: 'Não Encontrados', count: detail.summary.byStatus.nao_encontrado.length, color: 'text-red-600 dark:text-red-400' },
                ].map(s => (
                  <div key={s.label} className="flex flex-col items-center bg-white dark:bg-slate-800 rounded-lg px-3 py-2 flex-1 shadow-sm">
                    <span className={`text-xl font-bold ${s.color}`}>{s.count}</span>
                    <span className="text-xs text-slate-500">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b dark:border-slate-700 px-4 overflow-x-auto">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition ${
                    activeTab === tab.key
                      ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  {tab.label}
                  <span className={`text-xs rounded-full px-1.5 py-0.5 ${
                    activeTab === tab.key
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Product List */}
            <div className="flex-1 overflow-y-auto p-4">
              {filtered.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>Nenhum produto nesta categoria</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map(product => {
                    const cfg = STATUS_CONFIG[product.status];
                    const Icon = cfg.icon;
                    return (
                      <div
                        key={product.id}
                        className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 shadow-sm hover:shadow-md transition group"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${
                            product.status === 'comprado' ? 'bg-emerald-50 dark:bg-emerald-900/30' :
                            product.status === 'pesquisado' ? 'bg-blue-50 dark:bg-blue-900/30' :
                            product.status === 'nao_encontrado' ? 'bg-red-50 dark:bg-red-900/30' :
                            'bg-slate-50 dark:bg-slate-700/30'
                          }`}>
                            <Icon className={`w-4 h-4 ${
                              product.status === 'comprado' ? 'text-emerald-600 dark:text-emerald-400' :
                              product.status === 'pesquisado' ? 'text-blue-600 dark:text-blue-400' :
                              product.status === 'nao_encontrado' ? 'text-red-600 dark:text-red-400' :
                              'text-slate-500'
                            }`} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800 dark:text-white">{product.product_name}</p>
                            <p className="text-xs text-slate-400">
                              {product.interaction_date ? timeAgo(product.interaction_date) : timeAgo(product.created_at)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={product.status} />
                          <button
                            onClick={() => handleDeleteProduct(product.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition rounded"
                            title="Remover"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export function WhatsAppCRM() {
  const { addToast } = useToast();
  const [customers, setCustomers] = useState<WACCustomer[]>([]);
  const [stats, setStats] = useState<CRMStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterStatus) params.set('product_status', filterStatus);

      const [customersRes, statsRes] = await Promise.all([
        fetch(`/api/whatsapp/crm-customers?${params}`),
        fetch('/api/whatsapp/crm-stats'),
      ]);

      if (customersRes.ok) {
        const data = await customersRes.json();
        setCustomers(data.customers || []);
      }
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
    } catch (err) {
      addToast('Erro ao carregar clientes.', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleImport = async () => {
    setImporting(true);
    addToast('⏳ Importação iniciada! Isso pode levar alguns minutos...', 'info');
    try {
      const res = await fetch('/api/whatsapp/import-customers', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const { stats: s } = data;
        addToast(
          `✅ Importação concluída! ${s.imported} novos, ${s.updated} atualizados, ${s.productsFound} produtos, ${s.shortagesAdded} faltas registradas.`,
          'success'
        );
        loadCustomers();
      } else {
        addToast('⚠️ Importação com erros: ' + (data.error || 'Verifique os logs.'), 'error');
      }
    } catch {
      addToast('Erro de conexão durante a importação.', 'error');
    } finally {
      setImporting(false);
    }
  };

  const filteredCustomers = customers.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return c.name?.toLowerCase().includes(s)
      || c.phone?.includes(s)
      || c.whatsapp_name?.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <MessageSquare className="w-7 h-7 text-emerald-500" />
            CRM WhatsApp
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            Clientes captados via WhatsApp com histórico de produtos e endereços
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowStats(!showStats)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition ${
              showStats
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-700 dark:text-indigo-300'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Estatísticas
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-medium text-sm hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition shadow-lg shadow-emerald-500/20"
          >
            {importing ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Importando...</>
            ) : (
              <><Download className="w-4 h-4" /> Importar do WhatsApp</>
            )}
          </button>
        </div>
      </div>

      {/* ── Stats Panel ── */}
      {showStats && stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Clientes', value: stats.totalCustomers, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20', icon: Users },
            { label: 'Produtos', value: stats.totalProducts, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20', icon: Package },
            { label: 'Comprados', value: stats.totalPurchased, color: 'text-teal-600', bg: 'bg-teal-50 dark:bg-teal-900/20', icon: CheckCircle },
            { label: 'Não Encontrados', value: stats.totalNotFound, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20', icon: AlertTriangle },
            { label: 'Faltas Adicionadas', value: stats.totalShortagesFromWA, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20', icon: ShoppingBag },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-3`}>
              <s.icon className={`w-6 h-6 ${s.color} flex-shrink-0`} />
              <div>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition"
          />
        </div>
        <div className="relative">
          <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 appearance-none cursor-pointer transition"
          >
            <option value="">Todos os status</option>
            <option value="comprado">Tem produto comprado</option>
            <option value="pesquisado">Pesquisou produto</option>
            <option value="nao_encontrado">Produto não encontrado</option>
            <option value="cancelado">Produto cancelado</option>
          </select>
        </div>
        <button
          onClick={loadCustomers}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* ── Tabela ── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {/* Header da tabela */}
        <div className="grid grid-cols-12 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b dark:border-slate-700 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          <span className="col-span-4">Cliente</span>
          <span className="col-span-3">Telefone</span>
          <span className="col-span-2 text-center">Produtos</span>
          <span className="col-span-2">Última Interação</span>
          <span className="col-span-1"></span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mr-3" />
            Carregando clientes...
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <MessageSquare className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-medium">Nenhum cliente encontrado</p>
            <p className="text-sm mt-1">
              {customers.length === 0
                ? 'Clique em "Importar do WhatsApp" para começar'
                : 'Tente ajustar os filtros de busca'}
            </p>
          </div>
        ) : (
          <div className="divide-y dark:divide-slate-700/50">
            {filteredCustomers.map(customer => (
              <button
                key={customer.id}
                onClick={() => setSelectedId(customer.id)}
                className="w-full grid grid-cols-12 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition text-left group"
              >
                {/* Nome */}
                <div className="col-span-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {customer.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 dark:text-white text-sm truncate">
                      {customer.name}
                    </p>
                    {customer.whatsapp_name && customer.whatsapp_name !== customer.name && (
                      <p className="text-xs text-slate-400 truncate">WA: {customer.whatsapp_name}</p>
                    )}
                  </div>
                </div>

                {/* Telefone */}
                <div className="col-span-3 flex items-center">
                  <span className="text-sm text-slate-600 dark:text-slate-300 font-mono">
                    {formatPhone(customer.phone)}
                  </span>
                </div>

                {/* Produtos */}
                <div className="col-span-2 flex items-center justify-center gap-2">
                  {customer.purchased_count > 0 && (
                    <span className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-1.5 py-0.5 rounded-full font-medium">
                      {customer.purchased_count}✓
                    </span>
                  )}
                  {customer.not_found_count > 0 && (
                    <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-1.5 py-0.5 rounded-full font-medium">
                      {customer.not_found_count}✗
                    </span>
                  )}
                  {customer.product_count === 0 && (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </div>

                {/* Última Interação */}
                <div className="col-span-2 flex items-center">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{timeAgo(customer.last_product_interaction || customer.updatedAt)}</span>
                  </div>
                </div>

                {/* Ação */}
                <div className="col-span-1 flex items-center justify-end">
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition" />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Footer */}
        {!loading && filteredCustomers.length > 0 && (
          <div className="px-4 py-3 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 text-xs text-slate-400 flex items-center justify-between">
            <span>
              {filteredCustomers.length} de {customers.length} clientes
              {filterStatus || search ? ' (filtrado)' : ''}
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Comprado
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Não Encontrado
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal de Detalhe ── */}
      {selectedId && (
        <CustomerDetailModal
          customerId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

export default WhatsAppCRM;
