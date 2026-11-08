import React, { useState, useEffect, useMemo } from 'react';
import {
  Tag,
  Zap,
  Calendar,
  Clock,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  X,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingDown,
  ShoppingBag,
  Sparkles,
  Layers,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { useToast } from '../ToastContext';

interface CommonPromotion {
  code: string;
  barcode: string;
  name: string;
  cost_price: number;
  sale_price: number;
  promo_price: number;
  desconto_reais: number;
  desconto_pct: number;
  promo_start_date: string | null;
  promo_end_date: string | null;
  promo_permanent: number;
  status: 'ATIVA' | 'EXPIRADA' | 'AGENDADA' | 'PERMANENTE';
  dias_restantes: number | null;
  is_vigente: boolean;
}

interface TieredPromotion {
  id: number;
  digifarma_id?: number | null;
  product_code: string;
  barcode: string;
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
  status: 'ATIVA' | 'EXPIRADA' | 'AGENDADA' | 'PERMANENTE' | 'PAUSADA';
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
  isOpen: boolean;
  onClose: () => void;
  onPromotionUpdated?: () => void;
}

export const PromotionsManagementModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onPromotionUpdated
}) => {
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<'TIERED' | 'COMMON'>('TIERED');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODAS' | 'ATIVAS' | 'EXPIRADAS'>('TODAS');

  // Dados
  const [tieredPromos, setTieredPromos] = useState<TieredPromotion[]>([]);
  const [commonPromos, setCommonPromos] = useState<CommonPromotion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Modal / Formulário de Criação
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Busca de produto no formulário
  const [productQuery, setProductQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProductSearchOption[]>([]);
  const [isSearchingProduct, setIsSearchingProduct] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchOption | null>(null);

  // Campos do formulário
  // Comum:
  const [promoPriceInput, setPromoPriceInput] = useState('');
  // Escalonada:
  const [tieredQtyInput, setTieredQtyInput] = useState('3');
  const [tieredPackagePriceInput, setTieredPackagePriceInput] = useState('');

  // Validade compartilhada:
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
  const loadData = async () => {
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
    } catch (err) {
      addToast('Erro ao carregar promoções.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

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
      } catch (e) {
        // Ignora
      } finally {
        setIsSearchingProduct(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [productQuery]);

  // Reset do formulário ao abrir
  const handleOpenCreate = () => {
    setSelectedProduct(null);
    setProductQuery('');
    setSearchResults([]);
    setPromoPriceInput('');
    setTieredQtyInput('3');
    setTieredPackagePriceInput('');
    setStartDate(getTodayStr());
    setValidityDays(7); // Padrão 7 dias de promoção
    setIsCreateOpen(true);
  };

  // Sincronizar Digifarma
  const handleSyncDigifarma = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/erp/pos/sync-tiered-pricing', { method: 'POST' });
      const json = await res.json();
      if (res.ok && json.success) {
        addToast(`✅ Regras escalonadas sincronizadas com o Digifarma! (${json.regras_salvas || 0} regras)`, 'success', 3500);
        await loadData();
        if (onPromotionUpdated) onPromotionUpdated();
      } else {
        addToast(json.error || 'Erro ao sincronizar com o Digifarma.', 'error');
      }
    } catch (err) {
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
          if (onPromotionUpdated) onPromotionUpdated();
        } else {
          addToast(json.error || 'Erro ao salvar promoção.', 'error');
        }
      } else {
        // TIERED
        const qtd = parseInt(tieredQtyInput, 10);
        const precoPacote = parseFloat(tieredPackagePriceInput.replace(',', '.'));

        if (isNaN(qtd) || qtd < 2) {
          addToast('Quantidade mínima para promoção escalonada deve ser no mínimo 2 unidades.', 'warning');
          setIsSaving(false);
          return;
        }
        if (isNaN(precoPacote) || precoPacote <= 0) {
          addToast('Informe o valor do pacote.', 'warning');
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
          if (onPromotionUpdated) onPromotionUpdated();
        } else {
          addToast(json.error || 'Erro ao salvar promoção escalonada.', 'error');
        }
      }
    } catch (e) {
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
        if (onPromotionUpdated) onPromotionUpdated();
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
        if (onPromotionUpdated) onPromotionUpdated();
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
        if (onPromotionUpdated) onPromotionUpdated();
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
        if (onPromotionUpdated) onPromotionUpdated();
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
          item.product_name.toLowerCase().includes(term) ||
          item.barcode?.toLowerCase().includes(term) ||
          item.product_code.toLowerCase().includes(term)
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
          item.name.toLowerCase().includes(term) ||
          item.barcode?.toLowerCase().includes(term) ||
          item.code.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [commonPromos, statusFilter, searchTerm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-5xl w-full h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
        
        {/* TOPO / CABEÇALHO */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-100 flex items-center gap-2">
                Central de Promoções & Descontos Escalonados
              </h2>
              <p className="text-xs text-slate-400">
                Gerencie validades, promoções "Leve Mais por Menos" e preços promocionais sincronizados com o Digifarma
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncDigifarma}
              disabled={isSyncing}
              className="px-3 py-1.5 rounded-xl bg-sky-950/80 hover:bg-sky-900 text-sky-300 border border-sky-800/80 text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-sm"
              title="Sincronizar regras diretamente com o Digifarma"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              Sincronizar Digifarma
            </button>

            <button
              onClick={handleOpenCreate}
              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-amber-500/20"
            >
              <Plus className="w-4 h-4" />
              Nova Promoção
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ABAS & FILTROS */}
        <div className="px-5 py-3 border-b border-slate-800/80 bg-slate-900/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Navegação entre Abas */}
          <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800">
            <button
              onClick={() => setActiveTab('TIERED')}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-2 transition ${
                activeTab === 'TIERED'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Preços Escalonados ({tieredPromos.length})
            </button>

            <button
              onClick={() => setActiveTab('COMMON')}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-2 transition ${
                activeTab === 'COMMON'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              Promoções De / Por ({commonPromos.length})
            </button>
          </div>

          {/* Filtros e Busca */}
          <div className="flex items-center gap-2 flex-1 max-w-md justify-end">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Filtrar por produto, EAN ou código..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e: any) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none"
            >
              <option value="TODAS">Todos os Status</option>
              <option value="ATIVAS">🟢 Apenas Ativas</option>
              <option value="EXPIRADAS">🔴 Apenas Expiradas</option>
            </select>
          </div>
        </div>

        {/* CONTEÚDO PRINCIPAL: TABELAS DE ALTA DENSIDADE */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="text-center py-20 text-slate-500 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-600" />
              Carregando promoções e validades...
            </div>
          ) : activeTab === 'TIERED' ? (
            /* TABELA ESCALONADAS */
            filteredTiered.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-xs">
                Nenhuma promoção escalonada encontrada com os filtros selecionados.
              </div>
            ) : (
              <div className="border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-[11px] font-black uppercase text-slate-400">
                      <th className="py-2.5 px-3 whitespace-nowrap">Produto</th>
                      <th className="py-2.5 px-3 text-center whitespace-nowrap">Condição Escalonada</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Preço Normal</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Economia Cliente</th>
                      <th className="py-2.5 px-3 text-center whitespace-nowrap">Validade / Vigência</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                    {filteredTiered.map((item) => (
                      <tr 
                        key={item.id} 
                        className={`hover:bg-slate-800/40 transition-colors ${
                          !item.is_vigente ? 'opacity-60 bg-rose-950/10' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-200 line-clamp-1">{item.product_name}</div>
                          <div className="text-[10px] text-slate-400 font-mono inline-flex items-center gap-2 mt-0.5">
                            <span>EAN: {item.barcode || 'S/N'}</span>
                            <span>• Cód: {item.product_code}</span>
                            {item.digifarma_id && (
                              <span className="text-sky-400">Digifarma #{item.digifarma_id}</span>
                            )}
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <span className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-black font-mono">
                            ⚡ {item.quantity} un por R$ {item.package_price.toFixed(2)}
                          </span>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            (R$ {item.unit_effective_price.toFixed(2)} / un)
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono text-slate-400">
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
                          {item.is_permanent === 1 ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-sky-950/70 text-sky-300 border border-sky-800/60">
                              Permanente
                            </span>
                          ) : item.status === 'EXPIRADA' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-950/80 text-rose-300 border border-rose-800">
                              🔴 Venceu em {item.end_date?.split('-').reverse().join('/')}
                            </span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                              item.dias_restantes !== null && item.dias_restantes <= 1
                                ? 'bg-amber-950/80 text-amber-300 border-amber-700 animate-pulse'
                                : 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60'
                            }`}>
                              🟢 Até {item.end_date?.split('-').reverse().join('/')}
                              {item.dias_restantes !== null && ` (${item.dias_restantes}d)`}
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {!item.is_permanent && item.status === 'EXPIRADA' && (
                              <button
                                onClick={() => handleExtendValidityTiered(item, 7)}
                                className="px-2 py-1 rounded-lg bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-800/60 text-[10px] font-bold transition"
                                title="Renovar por +7 dias"
                              >
                                +7 Dias
                              </button>
                            )}

                            <button
                              onClick={() => handleDeleteTiered(item.id, item.product_name)}
                              className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900 text-rose-300 border border-rose-800/60 transition"
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
              </div>
            )
          ) : (
            /* TABELA COMUNS (PREÇO DE / POR) */
            filteredCommon.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-xs">
                Nenhuma promoção comum encontrada com os filtros selecionados.
              </div>
            ) : (
              <div className="border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800 text-[11px] font-black uppercase text-slate-400">
                      <th className="py-2.5 px-3 whitespace-nowrap">Produto</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Preço Normal (De)</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Preço Promo (Por)</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Desconto</th>
                      <th className="py-2.5 px-3 text-center whitespace-nowrap">Validade / Vigência</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                    {filteredCommon.map((item) => (
                      <tr 
                        key={item.code} 
                        className={`hover:bg-slate-800/40 transition-colors ${
                          !item.is_vigente ? 'opacity-60 bg-rose-950/10' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-200 line-clamp-1">{item.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono inline-flex items-center gap-2 mt-0.5">
                            <span>EAN: {item.barcode || 'S/N'}</span>
                            <span>• Cód: {item.code}</span>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono text-slate-400 line-through">
                          R$ {item.sale_price.toFixed(2)}
                        </td>

                        <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono font-bold text-emerald-400">
                          R$ {item.promo_price.toFixed(2)}
                        </td>

                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <span className="font-mono font-bold text-amber-400">
                            -R$ {item.desconto_reais.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-amber-500 font-bold ml-1 font-mono">
                            ({item.desconto_pct}%)
                          </span>
                        </td>

                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {item.promo_permanent === 1 ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-sky-950/70 text-sky-300 border border-sky-800/60">
                              Permanente
                            </span>
                          ) : item.status === 'EXPIRADA' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-950/80 text-rose-300 border border-rose-800">
                              🔴 Venceu em {item.promo_end_date?.split('-').reverse().join('/')}
                            </span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                              item.dias_restantes !== null && item.dias_restantes <= 1
                                ? 'bg-amber-950/80 text-amber-300 border-amber-700 animate-pulse'
                                : 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60'
                            }`}>
                              🟢 Até {item.promo_end_date?.split('-').reverse().join('/')}
                              {item.dias_restantes !== null && ` (${item.dias_restantes}d)`}
                            </span>
                          )}
                        </td>

                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {item.promo_permanent !== 1 && item.status === 'EXPIRADA' && (
                              <button
                                onClick={() => handleExtendValidityCommon(item, 7)}
                                className="px-2 py-1 rounded-lg bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-800/60 text-[10px] font-bold transition"
                                title="Renovar por +7 dias"
                              >
                                +7 Dias
                              </button>
                            )}

                            <button
                              onClick={() => handleDeleteCommon(item.code, item.name)}
                              className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900 text-rose-300 border border-rose-800/60 transition"
                              title="Remover promoção (volta ao preço normal)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

        {/* MODAL / DRAWER INTERNO DE CRIAÇÃO DE NOVA PROMOÇÃO */}
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
                    {activeTab === 'TIERED' ? <Zap className="w-4 h-4" /> : <Tag className="w-4 h-4" />}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-100">
                      {activeTab === 'TIERED' ? 'Nova Promoção Escalonada' : 'Nova Promoção Comum (Preço De/Por)'}
                    </h3>
                    <p className="text-[11px] text-slate-400">Configure as condições e a validade de vigência</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsCreateOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 1. SELEÇÃO DO PRODUTO */}
              <div className="space-y-3 mb-4">
                <label className="text-xs font-bold text-slate-300">
                  1. Localize o Produto (Nome ou EAN):
                </label>

                {!selectedProduct ? (
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Digite o nome do medicamento ou bipe o EAN..."
                      value={productQuery}
                      onChange={(e) => setProductQuery(e.target.value)}
                      autoFocus
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />

                    {/* Resultados de autocomplete */}
                    {searchResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-slate-950 border border-slate-700 rounded-xl shadow-xl z-20 divide-y divide-slate-800 text-xs">
                        {searchResults.map((prod) => (
                          <div
                            key={prod.code}
                            onClick={() => {
                              setSelectedProduct(prod);
                              setProductQuery('');
                              setSearchResults([]);
                              if (activeTab === 'COMMON') {
                                setPromoPriceInput((prod.sale_price * 0.85).toFixed(2));
                              } else {
                                setTieredPackagePriceInput((prod.sale_price * 2.5).toFixed(2));
                              }
                            }}
                            className="p-2.5 hover:bg-slate-800 cursor-pointer flex justify-between items-center transition"
                          >
                            <div>
                              <div className="font-bold text-slate-200">{prod.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                EAN: {prod.barcode || 'S/N'} • Cód: {prod.code}
                              </div>
                            </div>
                            <div className="text-right font-mono">
                              <span className="font-bold text-emerald-400">R$ {prod.sale_price.toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                    <div>
                      <div className="font-black text-slate-100 text-xs">{selectedProduct.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        EAN: {selectedProduct.barcode || 'S/N'} • Preço Atual: <strong className="text-slate-200">R$ {selectedProduct.sale_price.toFixed(2)}</strong>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedProduct(null)}
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold"
                    >
                      Trocar
                    </button>
                  </div>
                )}
              </div>

              {/* 2. REGRAS FINANCEIRAS */}
              {activeTab === 'TIERED' ? (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Quantidade Gatilho:
                    </label>
                    <input
                      type="number"
                      min={2}
                      value={tieredQtyInput}
                      onChange={(e) => setTieredQtyInput(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono font-bold text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                    <span className="text-[10px] text-slate-500">Ex: 3 unidades</span>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Preço Total do Pacote (R$):
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 15.00"
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
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Novo Preço Promocional "Por" (R$):
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 9.90"
                    value={promoPriceInput}
                    onChange={(e) => setPromoPriceInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
                  />
                  {selectedProduct && promoPriceInput && (
                    <div className="text-[11px] text-amber-400 mt-1 font-mono">
                      Desconto de R$ {(selectedProduct.sale_price - parseFloat(promoPriceInput.replace(',', '.'))).toFixed(2)} ({Math.round(((selectedProduct.sale_price - parseFloat(promoPriceInput.replace(',', '.'))) / selectedProduct.sale_price) * 100)}%)
                    </div>
                  )}
                </div>
              )}

              {/* 3. CONTROLE DE VALIDADE DA PROMOÇÃO */}
              <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3 mb-5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    Validade da Promoção:
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 font-bold">
                    <input
                      type="checkbox"
                      checked={isPermanent}
                      onChange={(e) => setIsPermanent(e.target.checked)}
                      className="rounded accent-amber-500"
                    />
                    Permanente (Sem Validade)
                  </label>
                </div>

                {!isPermanent && (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-0.5">Data de Início:</span>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none"
                        />
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 block mb-0.5">Data de Término (Vencimento):</span>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Atalhos de vigência */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="text-[10px] text-slate-500 self-center mr-1">Atalhos:</span>
                      {[
                        { label: 'Hoje', days: 0 },
                        { label: 'Fim de Semana (3d)', days: 3 },
                        { label: '1 Semana (7d)', days: 7 },
                        { label: '15 Dias', days: 15 },
                        { label: '1 Mês (30d)', days: 30 }
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => setValidityDays(item.days)}
                          className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[10px] font-bold transition"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* BOTÕES DE AÇÃO */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-800"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  disabled={isSaving || !selectedProduct}
                  onClick={handleSavePromotion}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition cursor-pointer"
                >
                  {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>Salvar & Sincronizar Digifarma</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
