import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Sparkles,
  Zap,
  Tag,
  Search,
  Plus,
  RefreshCw,
  Trash2,
  Calendar,
  Clock,
  ArrowRight,
  TrendingDown,
  CheckCircle2,
  AlertCircle,
  X,
  Pencil,
  Check,
  Package
} from 'lucide-react';
import { useToast } from '../ToastContext';
import { User } from '../../types';

export interface TieredPromotion {
  id: number;
  digifarma_id?: number | null;
  product_code: string;
  product_id?: number | null;
  barcode: string | null;
  product_name: string;
  quantity: number;
  package_price: number;
  unit_effective_price: number;
  unit_normal_price: number;
  economia_reais: number;
  economia_pct: number;
  active: number;
  start_date: string | null;
  end_date: string | null;
  is_permanent: number;
  status: 'ATIVA' | 'AGENDADA' | 'EXPIRADA' | 'PERMANENTE';
  dias_restantes: number | null;
  is_vigente: boolean;
}

export interface CommonPromotion {
  code: string;
  barcode: string | null;
  name: string;
  presentation?: string;
  sale_price: number;
  cost_price: number;
  promo_price: number;
  economia_reais: number;
  economia_pct: number;
  promo_start_date: string | null;
  promo_end_date: string | null;
  promo_permanent: number;
  status: 'ATIVA' | 'AGENDADA' | 'EXPIRADA' | 'PERMANENTE';
  dias_restantes: number | null;
  is_vigente: boolean;
}

interface ProductSearchOption {
  code: string;
  barcode: string;
  name: string;
  sale_price: number;
  promo_price: number;
  cost_price: number;
  stock_qty: number;
}

interface Props {
  user?: User;
}

export const PromotionsManagerPage: React.FC<Props> = ({ user }) => {
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<'TIERED' | 'COMMON'>('TIERED');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODAS' | 'ATIVAS' | 'EXPIRADAS'>('TODAS');

  // Dados
  const [tieredPromos, setTieredPromos] = useState<TieredPromotion[]>([]);
  const [commonPromos, setCommonPromos] = useState<CommonPromotion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Modal de Criação / Edição
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Busca de produto no formulário
  const [productQuery, setProductQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProductSearchOption[]>([]);
  const [isSearchingProduct, setIsSearchingProduct] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchOption | null>(null);

  // Campos do formulário
  const [promoPriceInput, setPromoPriceInput] = useState('');
  const [tieredQtyInput, setTieredQtyInput] = useState('3');
  const [tieredPackagePriceInput, setTieredPackagePriceInput] = useState('');

  // Validade compartilhada
  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const [isPermanent, setIsPermanent] = useState(false);
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState('');

  // Atalhos de Validade
  const setValidityDays = (days: number) => {
    setIsPermanent(false);
    const d = new Date();
    d.setDate(d.getDate() + days);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setEndDate(dateStr);
  };

  // Carregar dados
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [resTiered, resCommon] = await Promise.all([
        fetch('/api/erp/promotions/tiered'),
        fetch('/api/erp/promotions/common')
      ]);

      if (resTiered.ok) {
        const jsonTiered = await resTiered.json();
        setTieredPromos(jsonTiered.items || []);
      }
      if (resCommon.ok) {
        const jsonCommon = await resCommon.json();
        setCommonPromos(jsonCommon.items || []);
      }
    } catch {
      addToast('Erro ao carregar dados de promoções.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Busca rápida de produtos no formulário
  useEffect(() => {
    if (!productQuery || productQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingProduct(true);
      try {
        const res = await fetch(`/api/erp/products?q=${encodeURIComponent(productQuery.trim())}&limit=8`);
        if (res.ok) {
          const json = await res.json();
          setSearchResults(json.products || []);
        }
      } catch {
        // silencioso
      } finally {
        setIsSearchingProduct(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [productQuery]);

  const handleOpenCreate = () => {
    setSelectedProduct(null);
    setProductQuery('');
    setPromoPriceInput('');
    setTieredQtyInput('3');
    setTieredPackagePriceInput('');
    setIsPermanent(true);
    setStartDate(getTodayStr());
    setEndDate('');
    setIsCreateOpen(true);
  };

  // Sincronização em 1 clique com o Digifarma
  const handleSyncDigifarma = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/erp/pos/sync-tiered-pricing', { method: 'POST' });
      const json = await res.json();
      if (res.ok && json.success) {
        addToast(`✅ Regras escalonadas sincronizadas com o Digifarma! (${json.regras_salvas || 0} regras)`, 'success', 3500);
        await loadData();
      } else {
        addToast(json.error || 'Erro ao sincronizar com o Digifarma.', 'error');
      }
    } catch {
      addToast('Erro de conexão ao sincronizar com o Digifarma.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Salvar Promoção
  const handleSavePromotion = async () => {
    if (!selectedProduct) {
      addToast('Selecione um produto para a promoção.', 'warning');
      return;
    }

    if (!isPermanent && !endDate) {
      addToast('Informe a data de validade (término) ou marque como Permanente.', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      if (activeTab === 'COMMON') {
        const preco = parseFloat(promoPriceInput.replace(',', '.'));
        if (isNaN(preco) || preco <= 0) {
          addToast('Informe um preço promocional válido.', 'warning');
          setIsSaving(false);
          return;
        }

        const res = await fetch('/api/erp/promotions/common', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_code: selectedProduct.code,
            promo_price: preco,
            start_date: startDate,
            end_date: isPermanent ? null : endDate,
            is_permanent: isPermanent
          })
        });

        const json = await res.json();
        if (res.ok && json.success) {
          addToast(`🏷️ Promoção para "${selectedProduct.name}" cadastrada com sucesso!`, 'success');
          setIsCreateOpen(false);
          await loadData();
        } else {
          addToast(json.error || 'Erro ao salvar promoção.', 'error');
        }
      } else {
        // TIERED
        const qtd = parseInt(tieredQtyInput, 10);
        const precoPacote = parseFloat(tieredPackagePriceInput.replace(',', '.'));

        if (isNaN(qtd) || qtd < 2) {
          addToast('A quantidade deve ser no mínimo 2 unidades.', 'warning');
          setIsSaving(false);
          return;
        }
        if (isNaN(precoPacote) || precoPacote <= 0) {
          addToast('Informe o valor total do pacote.', 'warning');
          setIsSaving(false);
          return;
        }

        const res = await fetch('/api/erp/promotions/tiered', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_code: selectedProduct.code,
            quantity: qtd,
            package_price: precoPacote,
            start_date: startDate,
            end_date: isPermanent ? null : endDate,
            is_permanent: isPermanent,
            active: 1
          })
        });

        const json = await res.json();
        if (res.ok && json.success) {
          addToast(`⚡ Promoção escalonada (${qtd} por R$ ${precoPacote.toFixed(2)}) cadastrada!`, 'success');
          setIsCreateOpen(false);
          await loadData();
        } else {
          addToast(json.error || 'Erro ao salvar promoção escalonada.', 'error');
        }
      }
    } catch {
      addToast('Erro ao comunicar com o servidor.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Excluir Promoção
  const handleDeleteTiered = async (id: number, name: string) => {
    try {
      const res = await fetch(`/api/erp/promotions/tiered/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (res.ok && json.success) {
        addToast(`Regra de "${name}" removida com sucesso!`, 'success');
        await loadData();
      } else {
        addToast(json.error || 'Erro ao remover regra.', 'error');
      }
    } catch {
      addToast('Erro ao remover regra escalonada.', 'error');
    }
  };

  const handleDeleteCommon = async (code: string, name: string) => {
    try {
      const res = await fetch(`/api/erp/promotions/common/${encodeURIComponent(code)}`, { method: 'DELETE' });
      const json = await res.json();
      if (res.ok && json.success) {
        addToast(`Promoção de "${name}" removida (voltou ao preço normal).`, 'success');
        await loadData();
      } else {
        addToast(json.error || 'Erro ao remover promoção.', 'error');
      }
    } catch {
      addToast('Erro ao remover promoção comum.', 'error');
    }
  };

  // Prorrogar validade em +7 ou +30 dias
  const handleExtendValidityTiered = async (promo: TieredPromotion, days: number) => {
    try {
      const refDate = promo.end_date && new Date(promo.end_date) > new Date() ? new Date(promo.end_date) : new Date();
      refDate.setDate(refDate.getDate() + days);
      const newEnd = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, '0')}-${String(refDate.getDate()).padStart(2, '0')}`;

      const res = await fetch('/api/erp/promotions/tiered', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: promo.id,
          product_code: promo.product_code,
          quantity: promo.quantity,
          package_price: promo.package_price,
          start_date: promo.start_date || getTodayStr(),
          end_date: newEnd,
          is_permanent: false,
          active: 1
        })
      });
      if (res.ok) {
        addToast(`Validade prorrogada até ${newEnd.split('-').reverse().join('/')}!`, 'success');
        await loadData();
      }
    } catch {
      addToast('Erro ao estender validade.', 'error');
    }
  };

  const handleExtendValidityCommon = async (promo: CommonPromotion, days: number) => {
    try {
      const refDate = promo.promo_end_date && new Date(promo.promo_end_date) > new Date() ? new Date(promo.promo_end_date) : new Date();
      refDate.setDate(refDate.getDate() + days);
      const newEnd = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, '0')}-${String(refDate.getDate()).padStart(2, '0')}`;

      const res = await fetch('/api/erp/promotions/common', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_code: promo.code,
          promo_price: promo.promo_price,
          start_date: promo.promo_start_date || getTodayStr(),
          end_date: newEnd,
          is_permanent: false
        })
      });
      if (res.ok) {
        addToast(`Validade prorrogada até ${newEnd.split('-').reverse().join('/')}!`, 'success');
        await loadData();
      }
    } catch {
      addToast('Erro ao estender validade.', 'error');
    }
  };

  // Filtros aplicados
  const filteredTiered = useMemo(() => {
    return tieredPromos.filter(item => {
      if (statusFilter === 'ATIVAS' && !item.is_vigente) return false;
      if (statusFilter === 'EXPIRADAS' && item.status !== 'EXPIRADA') return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        return (
          (item.product_name && item.product_name.toLowerCase().includes(term)) ||
          (item.barcode && item.barcode.toLowerCase().includes(term)) ||
          (item.product_code && item.product_code.toLowerCase().includes(term)) ||
          (item.product_id && String(item.product_id).includes(term))
        );
      }
      return true;
    });
  }, [tieredPromos, statusFilter, searchTerm]);

  const filteredCommon = useMemo(() => {
    return commonPromos.filter(item => {
      if (statusFilter === 'ATIVAS' && !item.is_vigente) return false;
      if (statusFilter === 'EXPIRADAS' && item.status !== 'EXPIRADA') return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        return (
          (item.name && item.name.toLowerCase().includes(term)) ||
          (item.barcode && item.barcode.toLowerCase().includes(term)) ||
          (item.code && item.code.toLowerCase().includes(term))
        );
      }
      return true;
    });
  }, [commonPromos, statusFilter, searchTerm]);

  // Estatísticas calculadas
  const stats = useMemo(() => {
    const totalEscalonadas = tieredPromos.length;
    const totalComuns = commonPromos.length;
    const ativasEscalonadas = tieredPromos.filter(t => t.is_vigente).length;
    const ativasComuns = commonPromos.filter(c => c.is_vigente).length;
    const mediaEconomiaPct = totalEscalonadas > 0
      ? Math.round(tieredPromos.reduce((acc, t) => acc + (t.economia_pct || 0), 0) / totalEscalonadas)
      : 0;

    return {
      totalEscalonadas,
      totalComuns,
      totalAtivas: ativasEscalonadas + ativasComuns,
      mediaEconomiaPct
    };
  }, [tieredPromos, commonPromos]);

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] bg-slate-900 text-slate-100 p-3 sm:p-5 overflow-y-auto">
      {/* 1. CABEÇALHO DA PÁGINA */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-sm mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center font-bold shadow-inner">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-100 flex items-center gap-2">
              Gestão de Promoções & Preços Escalonados
            </h1>
            <p className="text-xs text-slate-400">
              Controle completo de ofertas "Leve Mais por Menos", preços promocionais e validades sincronizadas com o Digifarma
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncDigifarma}
            disabled={isSyncing}
            className="px-3.5 py-2 rounded-xl bg-sky-950/80 hover:bg-sky-900 text-sky-300 border border-sky-800/80 text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-sm"
            title="Sincronizar regras diretamente com o Digifarma Firebird"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sincronizar Digifarma</span>
          </button>

          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-amber-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Promoção</span>
          </button>
        </div>
      </div>

      {/* 2. CARDS DE RESUMO E MÉTRICAS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3.5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400">Regras Escalonadas</p>
            <p className="text-lg font-black text-amber-400 mt-0.5">{stats.totalEscalonadas}</p>
            <p className="text-[10px] text-slate-400 font-mono">Leve X por R$ Y</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <Zap className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3.5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400">Promoções De / Por</p>
            <p className="text-lg font-black text-emerald-400 mt-0.5">{stats.totalComuns}</p>
            <p className="text-[10px] text-slate-400 font-mono">Descontos unitários</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <Tag className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3.5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400">Ofertas Ativas</p>
            <p className="text-lg font-black text-sky-400 mt-0.5">{stats.totalAtivas}</p>
            <p className="text-[10px] text-emerald-400 font-mono">Vigência garantida</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-3.5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400">Economia Média</p>
            <p className="text-lg font-black text-purple-400 mt-0.5">{stats.mediaEconomiaPct}%</p>
            <p className="text-[10px] text-purple-300 font-mono">Vantagem ao cliente</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
            <TrendingDown className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* 3. BARRA DE FILTROS & ABAS */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 shadow-sm mb-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Navegação entre Abas */}
        <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('TIERED')}
            className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'TIERED'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Preços Escalonados ({tieredPromos.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('COMMON')}
            className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'COMMON'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Promoções De / Por ({commonPromos.length})</span>
          </button>
        </div>

        {/* Campo de Busca & Filtro de Status */}
        <div className="flex items-center gap-2 flex-1 max-w-lg justify-end">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por descrição, código ou código de barras..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-bold"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 font-bold focus:outline-none"
          >
            <option value="TODAS">Todos os Status</option>
            <option value="ATIVAS">🟢 Apenas Ativas</option>
            <option value="EXPIRADAS">🔴 Apenas Expiradas</option>
          </select>
        </div>
      </div>

      {/* 4. TABELA DE ALTA DENSIDADE */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl shadow-sm overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          {isLoading ? (
            <div className="text-center py-20 text-slate-500 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
              <span className="font-bold">Carregando promoções e validades...</span>
            </div>
          ) : activeTab === 'TIERED' ? (
            /* TABELA DE PREÇOS ESCALONADOS */
            filteredTiered.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-xs font-bold">
                Nenhuma promoção escalonada encontrada com os filtros selecionados.
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-slate-400 font-black uppercase text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 whitespace-nowrap w-24">Código</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Produto / Apresentação</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-center w-48">Condição Escalonada</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-right w-28">Preço Normal</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-right w-32">Economia Cliente</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-center w-40">Validade / Vigência</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-right w-36">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/60">
                  {filteredTiered.map((item) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-900/60 transition-colors ${
                        !item.is_vigente ? 'opacity-60 bg-rose-950/10' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-400 whitespace-nowrap">
                        {item.product_code}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-100">{item.product_name}</span>
                          {item.barcode && (
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                              {item.barcode}
                            </span>
                          )}
                          {item.digifarma_id && (
                            <span className="text-[10px] text-sky-400 font-mono">
                              Digi #{item.digifarma_id}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-black font-mono inline-block">
                          ⚡ {item.quantity} un por R$ {item.package_price.toFixed(2)}
                        </span>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          (R$ {item.unit_effective_price.toFixed(2)} / un)
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono text-slate-400 font-semibold">
                        R$ {item.unit_normal_price.toFixed(2)}
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <span className="font-mono font-bold text-emerald-400">
                          -R$ {item.economia_reais.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-emerald-500 font-bold ml-1 font-mono">
                          ({item.economia_pct}%)
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {item.is_permanent ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-black">
                            PERMANENTE
                          </span>
                        ) : item.status === 'EXPIRADA' ? (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[10px] font-black">
                            EXPIRADA
                          </span>
                        ) : (
                          <div>
                            <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30 text-[10px] font-black">
                              {item.dias_restantes !== null ? `${item.dias_restantes} dias restantes` : 'ATIVA'}
                            </span>
                            {item.end_date && (
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                até {item.end_date.split('-').reverse().join('/')}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleExtendValidityTiered(item, 7)}
                            className="px-2 py-1 rounded-lg bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-800/60 text-[10px] font-bold transition cursor-pointer"
                            title="Prorrogar validade por mais 7 dias"
                          >
                            +7d
                          </button>

                          <button
                            onClick={() => handleExtendValidityTiered(item, 30)}
                            className="px-2 py-1 rounded-lg bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-800/60 text-[10px] font-bold transition cursor-pointer"
                            title="Prorrogar validade por mais 30 dias"
                          >
                            +30d
                          </button>

                          <button
                            onClick={() => handleDeleteTiered(item.id, item.product_name)}
                            className="p-1 rounded-lg bg-rose-950/40 hover:bg-rose-900 text-rose-300 border border-rose-800/60 transition cursor-pointer"
                            title="Remover esta regra escalonada"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            /* TABELA DE PROMOÇÕES COMUNS DE/POR */
            filteredCommon.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-xs font-bold">
                Nenhuma promoção comum encontrada com os filtros selecionados.
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 text-slate-400 font-black uppercase text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 whitespace-nowrap w-24">Código</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Produto</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-right w-28">Preço Normal</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-right w-28">Preço Promocional</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-right w-28">Desconto</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-center w-40">Validade</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-right w-36">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/60">
                  {filteredCommon.map((item) => (
                    <tr
                      key={item.code}
                      className={`hover:bg-slate-900/60 transition-colors ${
                        !item.is_vigente ? 'opacity-60 bg-rose-950/10' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-400 whitespace-nowrap">
                        {item.code}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-100">{item.name}</span>
                          {item.barcode && (
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                              {item.barcode}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono text-slate-400 line-through">
                        R$ {item.sale_price.toFixed(2)}
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono font-black text-emerald-400">
                        R$ {item.promo_price.toFixed(2)}
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <span className="font-mono font-bold text-emerald-400">
                          -R$ {item.economia_reais.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-emerald-500 font-bold ml-1 font-mono">
                          ({item.economia_pct}%)
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {item.promo_permanent === 1 ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-black">
                            PERMANENTE
                          </span>
                        ) : item.status === 'EXPIRADA' ? (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[10px] font-black">
                            EXPIRADA
                          </span>
                        ) : (
                          <div>
                            <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30 text-[10px] font-black">
                              {item.dias_restantes !== null ? `${item.dias_restantes} dias restantes` : 'ATIVA'}
                            </span>
                            {item.promo_end_date && (
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                até {item.promo_end_date.split('-').reverse().join('/')}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleExtendValidityCommon(item, 7)}
                            className="px-2 py-1 rounded-lg bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-800/60 text-[10px] font-bold transition cursor-pointer"
                            title="Prorrogar por mais 7 dias"
                          >
                            +7d
                          </button>

                          <button
                            onClick={() => handleExtendValidityCommon(item, 30)}
                            className="px-2 py-1 rounded-lg bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-800/60 text-[10px] font-bold transition cursor-pointer"
                            title="Prorrogar por mais 30 dias"
                          >
                            +30d
                          </button>

                          <button
                            onClick={() => handleDeleteCommon(item.code, item.name)}
                            className="p-1 rounded-lg bg-rose-950/40 hover:bg-rose-900 text-rose-300 border border-rose-800/60 transition cursor-pointer"
                            title="Remover promoção comum"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
      </div>

      {/* 5. MODAL DE CRIAÇÃO / EDIÇÃO DE PROMOÇÃO */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
                  {activeTab === 'TIERED' ? <Zap className="w-4 h-4" /> : <Tag className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-100">
                    {activeTab === 'TIERED' ? 'Nova Promoção Escalonada' : 'Nova Promoção Comum (De/Por)'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {activeTab === 'TIERED' ? 'Ex: Leve 3 por R$ 9,99' : 'Ex: De R$ 15,00 por R$ 9,99'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* SELEÇÃO DO PRODUTO */}
            <div className="mb-4">
              <label className="block text-xs font-black text-slate-300 mb-1">
                1. Localizar Produto
              </label>
              {!selectedProduct ? (
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Digite o nome, código ou código de barras..."
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 font-bold"
                    autoFocus
                  />
                  {isSearchingProduct && (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin absolute right-3 top-3 text-amber-400" />
                  )}

                  {searchResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-slate-950 border border-slate-800 rounded-xl max-h-48 overflow-y-auto z-10 shadow-xl divide-y divide-slate-800/80">
                      {searchResults.map((prod) => (
                        <button
                          key={prod.code}
                          type="button"
                          onClick={() => {
                            setSelectedProduct(prod);
                            setSearchResults([]);
                            if (activeTab === 'COMMON') {
                              setPromoPriceInput((prod.sale_price * 0.85).toFixed(2));
                            } else {
                              setTieredPackagePriceInput((prod.sale_price * 2.5).toFixed(2));
                            }
                          }}
                          className="w-full text-left p-2.5 hover:bg-slate-800/70 transition flex items-center justify-between text-xs cursor-pointer"
                        >
                          <div>
                            <div className="font-bold text-slate-200">{prod.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              Cód: {prod.code} • EAN: {prod.barcode || 'S/N'}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold text-amber-400">
                              R$ {prod.sale_price.toFixed(2)}
                            </div>
                            <div className="text-[10px] text-slate-500">Estoque: {prod.stock_qty}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-950 border border-slate-700 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-100 text-xs">{selectedProduct.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      Cód: {selectedProduct.code} • EAN: {selectedProduct.barcode || 'S/N'} • Preço Atual: R$ {selectedProduct.sale_price.toFixed(2)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(null)}
                    className="p-1 text-slate-400 hover:text-rose-400 transition"
                    title="Trocar produto"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* REGRAS FINANCEIRAS */}
            {activeTab === 'TIERED' ? (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-xs font-black text-slate-300 mb-1">
                    Quantidade Mínima
                  </label>
                  <input
                    type="number"
                    min={2}
                    value={tieredQtyInput}
                    onChange={(e) => setTieredQtyInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono font-bold text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                  <span className="text-[10px] text-slate-400">Ex: 3 unidades</span>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-300 mb-1">
                    Preço Total do Pacote (R$)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 9.99"
                    value={tieredPackagePriceInput}
                    onChange={(e) => setTieredPackagePriceInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono font-bold text-emerald-400 focus:outline-none focus:border-amber-500"
                  />
                  {selectedProduct && tieredPackagePriceInput && (
                    <span className="text-[10px] text-emerald-400 font-mono">
                      (~R$ {(parseFloat(tieredPackagePriceInput.replace(',', '.')) / (parseInt(tieredQtyInput, 10) || 1)).toFixed(2)}/un)
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="mb-4">
                <label className="block text-xs font-black text-slate-300 mb-1">
                  Preço Promocional (R$)
                </label>
                <input
                  type="text"
                  placeholder="Ex: 9.99"
                  value={promoPriceInput}
                  onChange={(e) => setPromoPriceInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
                />
                {selectedProduct && promoPriceInput && (
                  <div className="text-[10px] text-emerald-400 font-mono mt-1">
                    De R$ {selectedProduct.sale_price.toFixed(2)} Por R$ {promoPriceInput}
                  </div>
                )}
              </div>
            )}

            {/* CONFIGURAÇÃO DE VALIDADE */}
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-slate-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  Validade da Promoção
                </span>
                <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={isPermanent}
                    onChange={(e) => setIsPermanent(e.target.checked)}
                    className="rounded text-amber-500 focus:ring-0"
                  />
                  <span className="font-bold text-slate-300">Permanente</span>
                </label>
              </div>

              {!isPermanent && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-[10px] text-slate-400">Atalhos:</span>
                    <button
                      type="button"
                      onClick={() => setValidityDays(7)}
                      className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold cursor-pointer"
                    >
                      +7 dias
                    </button>
                    <button
                      type="button"
                      onClick={() => setValidityDays(15)}
                      className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold cursor-pointer"
                    >
                      +15 dias
                    </button>
                    <button
                      type="button"
                      onClick={() => setValidityDays(30)}
                      className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold cursor-pointer"
                    >
                      +30 dias
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-400 block mb-0.5">Início:</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block mb-0.5">Término:</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* BOTÕES DE AÇÃO */}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSavePromotion}
                disabled={isSaving || !selectedProduct}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition disabled:opacity-50 cursor-pointer shadow-md shadow-amber-500/20"
              >
                {isSaving ? 'Salvando...' : 'Salvar Promoção'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
