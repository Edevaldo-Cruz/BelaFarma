import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare, Users, Search, RefreshCw, Package,
  AlertTriangle, CheckCircle, XCircle, Clock, ChevronRight,
  X, Phone, MapPin, ShoppingBag, Download, Filter, TrendingUp,
  Plus, RotateCw, Calendar, Eye
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
  is_continuous_use?: number;
  treatment_duration_days?: number;
  last_purchase_date?: string;
  next_reminder_date?: string;
  reminder_status?: 'pendente' | 'enviado' | 'ignorado';
  notified_arrival?: number;
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
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: '',
    status: 'comprado' as ProductHistory['status'],
    isContinuous: false,
    duration: 30,
    notes: ''
  });
  const { addToast } = useToast();

  const loadDetails = useCallback(() => {
    setLoading(true);
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

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

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

  const handleToggleContinuous = async (product: ProductHistory, isContinuous: boolean, duration: number) => {
    try {
      const response = await fetch(`/api/whatsapp/crm-products/${product.id}/continuous`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_continuous_use: isContinuous,
          treatment_duration_days: duration,
          last_purchase_date: product.last_purchase_date || new Date().toISOString().split('T')[0]
        })
      });
      if (response.ok) {
        addToast(isContinuous ? '🔄 Uso contínuo ativado!' : 'Uso contínuo desativado.', 'success');
        loadDetails();
      } else {
        addToast('Erro ao atualizar uso contínuo.', 'error');
      }
    } catch {
      addToast('Erro ao atualizar uso contínuo.', 'error');
    }
  };

  const handleRecordPurchase = async (productId: string) => {
    try {
      const response = await fetch(`/api/whatsapp/crm-products/${productId}/record-purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchase_date: new Date().toISOString().split('T')[0]
        })
      });
      if (response.ok) {
        addToast('✅ Nova compra registrada e lembrete recalculado!', 'success');
        loadDetails();
      } else {
        addToast('Erro ao registrar nova compra.', 'error');
      }
    } catch {
      addToast('Erro de conexão ao registrar nova compra.', 'error');
    }
  };

  const handleAddProductManual = async () => {
    if (!newProduct.name) {
      addToast('Digite o nome do produto.', 'warning');
      return;
    }
    try {
      const response = await fetch(`/api/whatsapp/crm-customers/${customerId}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: newProduct.name,
          status: newProduct.status,
          is_continuous_use: newProduct.isContinuous,
          treatment_duration_days: newProduct.duration,
          notes: newProduct.notes
        })
      });
      if (response.ok) {
        addToast('✅ Produto adicionado ao histórico!', 'success');
        setNewProduct({ name: '', status: 'comprado', isContinuous: false, duration: 30, notes: '' });
        setShowAddForm(false);
        loadDetails();
      } else {
        addToast('Erro ao adicionar produto.', 'error');
      }
    } catch {
      addToast('Erro ao adicionar produto.', 'error');
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

            {/* Tabs & Add Button */}
            <div className="flex items-center justify-between border-b dark:border-slate-700 px-4 bg-slate-50/50 dark:bg-slate-800/20">
              <div className="flex overflow-x-auto">
                {tabs.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => {
                      setActiveTab(tab.key as any);
                      setShowAddForm(false);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition ${
                      activeTab === tab.key && !showAddForm
                        ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                        : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    {tab.label}
                    <span className={`text-xs rounded-full px-1.5 py-0.5 ${
                      activeTab === tab.key && !showAddForm
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  showAddForm
                    ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/20 dark:text-red-400'
                    : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                {showAddForm ? 'Cancelar' : 'Produto'}
              </button>
            </div>

            {/* Product List or Manual Add Form */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/30 dark:bg-slate-900/30">
              {showAddForm ? (
                <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border dark:border-slate-700 shadow-md space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                  <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300">Adicionar Produto Manualmente</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-slate-400 font-semibold mb-1">Nome do Produto</label>
                      <input
                        type="text"
                        placeholder="Ex: Losartana 50mg"
                        value={newProduct.name}
                        onChange={e => setNewProduct(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-400 font-semibold mb-1">Status</label>
                        <select
                          value={newProduct.status}
                          onChange={e => setNewProduct(prev => ({ ...prev, status: e.target.value as any }))}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                        >
                          <option value="comprado">Comprado</option>
                          <option value="pesquisado">Pesquisado</option>
                          <option value="nao_encontrado">Não Encontrado</option>
                          <option value="cancelado">Cancelado</option>
                        </select>
                      </div>
                      
                      {newProduct.status === 'comprado' && (
                        <div>
                          <label className="block text-xs text-slate-400 font-semibold mb-1">Ciclo de Lembrete</label>
                          <select
                            value={newProduct.duration}
                            onChange={e => setNewProduct(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                            disabled={!newProduct.isContinuous}
                          >
                            <option value={30}>A cada 30 dias</option>
                            <option value={60}>A cada 60 dias</option>
                            <option value={90}>A cada 90 dias</option>
                          </select>
                        </div>
                      )}
                    </div>

                    {newProduct.status === 'comprado' && (
                      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 font-medium cursor-pointer py-1">
                        <input
                          type="checkbox"
                          checked={newProduct.isContinuous}
                          onChange={e => setNewProduct(prev => ({ ...prev, isContinuous: e.target.checked }))}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                        />
                        Marcar como Uso Contínuo (Lembrete automático)
                      </label>
                    )}

                    <div>
                      <label className="block text-xs text-slate-400 font-semibold mb-1">Observações (Opcional)</label>
                      <textarea
                        placeholder="Notas sobre o produto..."
                        value={newProduct.notes}
                        onChange={e => setNewProduct(prev => ({ ...prev, notes: e.target.value }))}
                        rows={2}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
                      />
                    </div>

                    <button
                      onClick={handleAddProductManual}
                      className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-bold text-sm hover:opacity-90 transition shadow-md"
                    >
                      Salvar Produto no Histórico
                    </button>
                  </div>
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>Nenhum produto nesta categoria</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map(product => {
                    const cfg = STATUS_CONFIG[product.status];
                    const Icon = cfg.icon;
                    const isContinuous = product.is_continuous_use === 1;

                    return (
                      <div
                        key={product.id}
                        className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 shadow-sm p-4 hover:shadow-md transition group space-y-3"
                      >
                        <div className="flex items-center justify-between">
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
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-semibold text-slate-800 dark:text-white">{product.product_name}</p>
                                {isContinuous && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-200/50" title="Uso Contínuo Ativo">
                                    Uso Contínuo
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-400">
                                Registrado: {product.interaction_date ? timeAgo(product.interaction_date) : timeAgo(product.created_at)}
                                {product.source && ` • via ${product.source}`}
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

                        {/* Controles de Lembrete de Uso Contínuo exclusivo para produtos comprados */}
                        {product.status === 'comprado' && (
                          <div className="pt-2 border-t border-slate-100 dark:border-slate-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                              <label className="flex items-center gap-1 cursor-pointer font-medium font-sans">
                                <input
                                  type="checkbox"
                                  checked={isContinuous}
                                  onChange={e => handleToggleContinuous(product, e.target.checked, product.treatment_duration_days || 30)}
                                  className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                                />
                                Uso Contínuo 🔄
                              </label>

                              {isContinuous && (
                                <select
                                  value={product.treatment_duration_days || 30}
                                  onChange={e => handleToggleContinuous(product, true, parseInt(e.target.value))}
                                  className="bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded px-1.5 py-0.5 text-slate-600 dark:text-slate-300 font-semibold"
                                >
                                  <option value={30}>30d</option>
                                  <option value={60}>60d</option>
                                  <option value={90}>90d</option>
                                </select>
                              )}
                            </div>

                            {isContinuous && (
                              <div className="flex items-center justify-between sm:justify-end gap-3 flex-1">
                                <div className="text-right text-[11px] text-slate-400">
                                  Próx: <span className="font-semibold text-purple-600 dark:text-purple-400 font-mono">{product.next_reminder_date || '—'}</span>
                                </div>
                                <button
                                  onClick={() => handleRecordPurchase(product.id)}
                                  className="flex items-center gap-1 px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-600 dark:bg-purple-950/30 dark:text-purple-400 dark:hover:bg-purple-900/30 rounded-lg font-bold transition shadow-sm border border-purple-200/50"
                                >
                                  <RotateCw className="w-3 h-3" />
                                  Nova Compra
                                </button>
                              </div>
                            )}
                          </div>
                        )}
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

  // Estados específicos de CRM Preditivo (Fase 1)
  const [mainTab, setMainTab] = useState<'clientes' | 'lembretes' | 'faltas_resolvidas'>('clientes');
  const [reminders, setReminders] = useState<any[]>([]);
  const [resolvedShortages, setResolvedShortages] = useState<any[]>([]);
  const [subLoading, setSubLoading] = useState(false);

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

  const loadReminders = async () => {
    setSubLoading(true);
    try {
      const res = await fetch('/api/whatsapp/crm-reminders');
      if (res.ok) {
        const data = await res.json();
        setReminders(data.reminders || []);
      }
    } catch {
      addToast('Erro ao carregar lembretes.', 'error');
    } finally {
      setSubLoading(false);
    }
  };

  const loadResolvedShortages = async () => {
    setSubLoading(true);
    try {
      const res = await fetch('/api/whatsapp/crm-shortages-resolved');
      if (res.ok) {
        const data = await res.json();
        setResolvedShortages(data.resolved || []);
      }
    } catch {
      addToast('Erro ao carregar faltas resolvidas.', 'error');
    } finally {
      setSubLoading(false);
    }
  };

  useEffect(() => {
    if (mainTab === 'clientes') {
      loadCustomers();
    } else if (mainTab === 'lembretes') {
      loadReminders();
    } else if (mainTab === 'faltas_resolvidas') {
      loadResolvedShortages();
    }
  }, [mainTab, loadCustomers]);

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

  const handleSendReminder = async (reminder: any) => {
    try {
      const msg = `Olá, ${reminder.customer_name}! Tudo bem? Esperamos que sim! Passando para te lembrar que o seu produto de uso contínuo *${reminder.product_name}* está próximo de acabar (restam poucos dias). Gostaria que deixássemos outra caixa separada para você retirar na BelaFarma ou prefere que façamos uma entrega?`;
      
      addToast('⏳ Enviando lembrete...', 'info');
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: reminder.phone,
          message: msg,
          type: 'lembrete_uso_continuo',
          customerName: reminder.customer_name,
          customerId: reminder.customer_id
        })
      });

      if (res.ok) {
        await fetch(`/api/whatsapp/crm-reminders/${reminder.history_id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'enviado' })
        });
        
        addToast('✅ Lembrete de uso contínuo enviado com sucesso!', 'success');
        loadReminders();
      } else {
        addToast('Erro ao enviar mensagem via WhatsApp.', 'error');
      }
    } catch {
      addToast('Erro de conexão ao enviar lembrete.', 'error');
    }
  };

  const handleIgnoreReminder = async (id: string) => {
    try {
      const res = await fetch(`/api/whatsapp/crm-reminders/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ignorado' })
      });
      if (res.ok) {
        addToast('Lembrete arquivado.', 'success');
        loadReminders();
      } else {
        addToast('Erro ao arquivar lembrete.', 'error');
      }
    } catch {
      addToast('Erro ao arquivar lembrete.', 'error');
    }
  };

  const handleNotifyShortage = async (item: any) => {
    try {
      const msg = `Olá, ${item.customer_name}! Boas notícias da BelaFarma! O produto *${item.product_name}* que você procurou recentemente e estava em falta acabou de chegar em nosso estoque! Deseja que reservemos para você retirar ou prefere receber via entrega?`;
      
      addToast('⏳ Enviando notificação...', 'info');
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: item.phone,
          message: msg,
          type: 'alerta_falta_chegou',
          customerName: item.customer_name,
          customerId: item.customer_id
        })
      });

      if (res.ok) {
        await fetch(`/api/whatsapp/crm-shortages-resolved/${item.history_id}/notified`, {
          method: 'POST'
        });
        
        addToast('✅ Notificação de chegada enviada com sucesso!', 'success');
        loadResolvedShortages();
      } else {
        addToast('Erro ao enviar mensagem via WhatsApp.', 'error');
      }
    } catch {
      addToast('Erro de conexão ao enviar notificação.', 'error');
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
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

      {/* ── CRM Preditivo Main Tabs ── */}
      <div className="flex border-b dark:border-slate-800 gap-1 overflow-x-auto">
        {[
          { id: 'clientes', label: 'Lista de Clientes', icon: Users, badge: customers.length },
          { id: 'lembretes', label: 'Lembretes de Uso Contínuo 🔄', icon: Clock, badge: reminders.length, badgeColor: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400' },
          { id: 'faltas_resolvidas', label: 'Chegada de Faltas 🚨', icon: AlertTriangle, badge: resolvedShortages.length, badgeColor: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setMainTab(t.id as any)}
            className={`flex items-center gap-2 px-5 py-3 border-b-2 font-bold text-sm whitespace-nowrap transition-all duration-200 ${
              mainTab === t.id
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50/20 dark:bg-emerald-950/10'
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.badge > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${t.badgeColor || 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Conteúdo das Abas ── */}
      {mainTab === 'clientes' && (
        <>
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

                    <div className="col-span-3 flex items-center">
                      <span className="text-sm text-slate-600 dark:text-slate-300 font-mono">
                        {formatPhone(customer.phone)}
                      </span>
                    </div>

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

                    <div className="col-span-2 flex items-center">
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{timeAgo(customer.last_product_interaction || customer.updatedAt)}</span>
                      </div>
                    </div>

                    <div className="col-span-1 flex items-center justify-end">
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition" />
                    </div>
                  </button>
                ))}
              </div>
            )}

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
        </>
      )}

      {mainTab === 'lembretes' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden animate-in fade-in duration-300">
          <div className="px-6 py-4 border-b dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-800 dark:text-white">Fila de Lembretes Ativos</h2>
              <p className="text-xs text-slate-400 mt-0.5">Pacientes de uso contínuo cujos remédios já devem ter terminado ou estão a menos de 5 dias do fim</p>
            </div>
            <button
              onClick={loadReminders}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition"
              title="Atualizar fila"
            >
              <RefreshCw className={`w-4 h-4 text-slate-600 dark:text-slate-300 ${subLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {subLoading ? (
            <div className="py-20 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              Carregando lembretes ativos...
            </div>
          ) : reminders.length === 0 ? (
            <div className="py-20 text-center text-slate-400 space-y-2">
              <Clock className="w-12 h-12 mx-auto opacity-30 text-purple-500 animate-pulse" />
              <p className="font-bold text-slate-700 dark:text-slate-300">Nenhum lembrete pendente para hoje!</p>
              <p className="text-xs">Os lembretes de uso contínuo aparecerão automaticamente conforme as datas planejadas de tratamento.</p>
            </div>
          ) : (
            <div className="divide-y dark:divide-slate-800">
              {reminders.map(rem => {
                const diff = Date.now() - new Date(rem.next_reminder_date).getTime();
                const daysLate = Math.floor(diff / 86400000);
                
                return (
                  <div key={rem.history_id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/30 dark:hover:bg-slate-800/10 transition">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-slate-800 dark:text-white">{rem.customer_name}</h4>
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-200/50">
                          {rem.treatment_duration_days}d
                        </span>
                        {daysLate > 0 ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200/50">
                            Atrasado {daysLate} {daysLate === 1 ? 'dia' : 'dias'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/50">
                            Hoje
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                        <Package className="w-4 h-4 text-purple-500" />
                        {rem.product_name}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span>Última Compra: <strong className="font-mono">{rem.last_purchase_date}</strong></span>
                        <span>Previsão de Fim: <strong className="font-mono text-purple-500">{rem.next_reminder_date}</strong></span>
                        <span className="font-mono text-slate-500">{formatPhone(rem.phone)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:self-center">
                      <button
                        onClick={() => handleIgnoreReminder(rem.history_id)}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl transition"
                      >
                        Ignorar
                      </button>
                      <button
                        onClick={() => handleSendReminder(rem)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold rounded-xl hover:opacity-90 shadow-md hover:shadow-purple-500/10 transition"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        Enviar WhatsApp
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {mainTab === 'faltas_resolvidas' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden animate-in fade-in duration-300">
          <div className="px-6 py-4 border-b dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-800 dark:text-white">Chegada de Faltas Resolvidas</h2>
              <p className="text-xs text-slate-400 mt-0.5">Cruzamento de clientes que procuraram um produto indisponível nos últimos 30 dias que agora já chegou</p>
            </div>
            <button
              onClick={loadResolvedShortages}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition"
              title="Atualizar fila"
            >
              <RefreshCw className={`w-4 h-4 text-slate-600 dark:text-slate-300 ${subLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {subLoading ? (
            <div className="py-20 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              Carregando faltas resolvidas...
            </div>
          ) : resolvedShortages.length === 0 ? (
            <div className="py-20 text-center text-slate-400 space-y-2">
              <AlertTriangle className="w-12 h-12 mx-auto opacity-30 text-emerald-500 animate-pulse" />
              <p className="font-bold text-slate-700 dark:text-slate-300">Nenhum cruzamento de faltas ativas!</p>
              <p className="text-xs">Quando um produto indisponível for comprado nas Faltas, o alerta de contato com o cliente aparecerá aqui.</p>
            </div>
          ) : (
            <div className="divide-y dark:divide-slate-800">
              {resolvedShortages.map(item => (
                <div key={item.history_id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/30 dark:hover:bg-slate-800/10 transition">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-slate-800 dark:text-white">{item.customer_name}</h4>
                      <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/50">
                        {item.purchased === 1 ? 'Chegou na Loja' : 'Encomendado'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-emerald-500" />
                      {item.product_name}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                      <span>Procurou em: <strong className="font-mono">{item.inquiry_date ? new Date(item.inquiry_date).toLocaleDateString('pt-BR') : '—'}</strong></span>
                      <span className="font-mono text-slate-500">{formatPhone(item.phone)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:self-center">
                    <button
                      onClick={async () => {
                        try {
                          await fetch(`/api/whatsapp/crm-shortages-resolved/${item.history_id}/notified`, { method: 'POST' });
                          addToast('Notificação marcada como resolvida (arquivada).', 'success');
                          loadResolvedShortages();
                        } catch {
                          addToast('Erro ao arquivar alerta.', 'error');
                        }
                      }}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl transition"
                    >
                      Dispensar
                    </button>
                    <button
                      onClick={() => handleNotifyShortage(item)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-bold rounded-xl hover:opacity-90 shadow-md hover:shadow-emerald-500/10 transition"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Avisar Cliente
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modal de Detalhe ── */}
      {selectedId && (
        <CustomerDetailModal
          customerId={selectedId}
          onClose={() => {
            setSelectedId(null);
            loadCustomers();
          }}
        />
      )}
    </div>
  );
}

export default WhatsAppCRM;
