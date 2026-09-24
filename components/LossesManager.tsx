import React, { useState, useEffect, useRef } from 'react';
import { 
  Trash2, 
  Search, 
  Plus, 
  AlertTriangle, 
  CheckCircle2, 
  History, 
  Calendar, 
  User as UserIcon, 
  DollarSign, 
  Package, 
  ShieldAlert, 
  X, 
  FileText, 
  Printer, 
  RotateCcw, 
  Loader2, 
  ChevronRight,
  Info,
  ShieldCheck,
  Pill
} from 'lucide-react';
import { User, MotivoPerda, ItemLotePerda, LotePerda } from '../types';
import { useToast } from './ToastContext';

interface LossesManagerProps {
  user: User;
  theme?: 'light' | 'dark';
}

interface ProductSearchResult {
  produto_id: number;
  codigo_barras: string;
  descricao: string;
  saldo: number;
  preco_custo: number;
  preco_venda: number;
  is_especial: boolean;
  is_controlado: boolean;
  is_antibiotico: boolean;
  tipo_especial: string | null;
}

interface SpecialAlertInfo {
  produto: string;
  tipo: string;
}

export const LossesManager: React.FC<LossesManagerProps> = ({ user, theme = 'light' }) => {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'nova-baixa' | 'historico'>('nova-baixa');

  // Estado da Sessão Atual de Baixa
  const [items, setItems] = useState<ItemLotePerda[]>([]);
  const [observacaoGeral, setObservacaoGeral] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Busca e bip de produtos
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [specialAlert, setSpecialAlert] = useState<SpecialAlertInfo | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Estado da aba Histórico
  const [historicoLotes, setHistoricoLotes] = useState<LotePerda[]>([]);
  const [historicoTotais, setHistoricoTotais] = useState({
    total_lotes: 0,
    total_itens: 0,
    total_custo: 0,
    total_venda: 0
  });
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim, setFiltroDataFim] = useState('');
  const [filtroBusca, setFiltroBusca] = useState('');
  const [selectedLoteDetails, setSelectedLoteDetails] = useState<{ lote: LotePerda; itens: ItemLotePerda[] } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Busca de produtos com debounce
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/perdas/buscar-produto?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
          setShowDropdown(true);
        }
      } catch (err) {
        console.error('Erro ao buscar produtos:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Função para adicionar produto ao lote atual
  const handleSelectProduct = (prod: ProductSearchResult) => {
    // 🛡️ Alerta imediato no Belinha para produtos especiais (Controlados e Antibióticos)
    if (prod.is_especial) {
      const tipoNome = prod.tipo_especial || (prod.is_controlado ? 'Controlado (Portaria 344/SNGPC)' : 'Antibiótico / Antimicrobiano');
      setSpecialAlert({
        produto: prod.descricao,
        tipo: tipoNome
      });
      addToast(`⚠️ ATENÇÃO: "${prod.descricao}" é ${tipoNome}. Prejuízo contabilizado no BelaFarma, mas o estoque NÃO será baixado no Digifarma!`, 'warning');
    } else {
      setSpecialAlert(null);
    }

    // Verifica se já está na lista
    const existingIndex = items.findIndex(
      it => (it.produto_id && it.produto_id === prod.produto_id) || (it.codigo_barras && it.codigo_barras === prod.codigo_barras)
    );

    if (existingIndex >= 0) {
      // Incrementa quantidade
      const updated = [...items];
      updated[existingIndex].quantidade += 1;
      setItems(updated);
      addToast(`Quantidade de "${prod.descricao}" incrementada (+1).`, 'info');
    } else {
      const newItem: ItemLotePerda = {
        produto_id: prod.produto_id,
        codigo_barras: prod.codigo_barras,
        descricao: prod.descricao,
        quantidade: 1,
        motivo: 'Vencido',
        preco_custo: prod.preco_custo,
        preco_venda: prod.preco_venda,
        saldo_anterior_digifarma: prod.saldo,
        is_especial: prod.is_especial,
        is_controlado: prod.is_controlado,
        is_antibiotico: prod.is_antibiotico,
        tipo_especial: prod.tipo_especial || undefined,
        observacao: prod.is_especial ? `(${prod.tipo_especial} - Estoque mantido no Digifarma)` : ''
      };
      setItems([newItem, ...items]);
      if (!prod.is_especial) {
        addToast(`"${prod.descricao}" adicionado à sessão de descarte.`, 'success');
      }
    }

    setSearchQuery('');
    setShowDropdown(false);
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  // Tratar leitura rápida de leitor de código de barras (Enter)
  const handleKeyDownSearch = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = searchQuery.trim();
      if (!q) return;

      if (searchResults.length === 1) {
        handleSelectProduct(searchResults[0]);
        return;
      }

      try {
        setIsSearching(true);
        const res = await fetch(`/api/perdas/buscar-produto?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data: ProductSearchResult[] = await res.json();
          if (data.length > 0) {
            const exact = data.find(p => p.codigo_barras === q);
            if (exact) {
              handleSelectProduct(exact);
            } else {
              handleSelectProduct(data[0]);
            }
          } else {
            addToast(`Produto não localizado com o código: ${q}`, 'warning');
          }
        }
      } catch (err) {
        console.error('Erro na leitura rápida:', err);
      } finally {
        setIsSearching(false);
      }
    }
  };

  // Atualizar campo de um item do lote
  const handleUpdateItem = (index: number, field: keyof ItemLotePerda, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  // Remover item do lote
  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // Limpar todo o lote
  const handleClearBatch = () => {
    if (items.length === 0) return;
    if (window.confirm('Deseja realmente limpar todos os itens desta sessão de descarte?')) {
      setItems([]);
      setObservacaoGeral('');
      setSpecialAlert(null);
    }
  };

  // Cálculos consolidados da sessão atual
  const totalItensContados = items.reduce((acc, it) => acc + (Number(it.quantidade) || 0), 0);
  const totalPrejuizoCusto = items.reduce((acc, it) => acc + ((Number(it.quantidade) || 0) * (it.preco_custo || 0)), 0);
  const totalPotencialVenda = items.reduce((acc, it) => acc + ((Number(it.quantidade) || 0) * (it.preco_venda || 0)), 0);
  const qtdItensEspeciais = items.filter(it => it.is_especial).length;
  const qtdItensComuns = items.filter(it => !it.is_especial).length;

  // Confirmação e envio da baixa ao backend e Digifarma
  const handleConfirmDisposal = async () => {
    if (items.length === 0) {
      addToast('Adicione pelo menos um item à sessão antes de confirmar.', 'warning');
      return;
    }

    for (const it of items) {
      if (!it.quantidade || it.quantidade <= 0) {
        addToast(`A quantidade do item "${it.descricao}" deve ser maior que 0.`, 'error');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = {
        usuario_id: user.id,
        usuario_nome: user.name,
        observacao_geral: observacaoGeral.trim(),
        itens: items.map(it => ({
          produto_id: it.produto_id,
          codigo_barras: it.codigo_barras,
          descricao: it.descricao,
          quantidade: it.quantidade,
          motivo: it.motivo,
          preco_custo: it.preco_custo,
          preco_venda: it.preco_venda,
          is_especial: it.is_especial,
          tipo_especial: it.tipo_especial,
          observacao: it.observacao
        }))
      };

      const res = await fetch('/api/perdas/lotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao processar baixa de perdas no servidor.');
      }

      const msgEspeciais = qtdItensEspeciais > 0 ? ` (${qtdItensEspeciais} especiais sem baixa no Digifarma)` : '';
      addToast(`✅ Lote de perdas registrado com sucesso! ${qtdItensComuns} itens baixados no estoque Digifarma${msgEspeciais}.`, 'success');
      setItems([]);
      setObservacaoGeral('');
      setSpecialAlert(null);
      setShowConfirmModal(false);
      fetchHistorico();
      setActiveTab('historico');
    } catch (err: any) {
      console.error('Erro ao confirmar baixa:', err);
      addToast(err.message || 'Erro ao comunicar com o servidor.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Carregar histórico de baixas
  const fetchHistorico = async () => {
    setLoadingHistorico(true);
    try {
      const params = new URLSearchParams();
      if (filtroDataInicio) params.append('data_inicio', filtroDataInicio);
      if (filtroDataFim) params.append('data_fim', filtroDataFim);
      if (filtroBusca) params.append('search', filtroBusca);

      const res = await fetch(`/api/perdas/lotes?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setHistoricoLotes(data.lotes || []);
        setHistoricoTotais(data.totais || { total_lotes: 0, total_itens: 0, total_custo: 0, total_venda: 0 });
      }
    } catch (err) {
      console.error('Erro ao carregar histórico:', err);
      addToast('Não foi possível carregar o histórico de perdas.', 'error');
    } finally {
      setLoadingHistorico(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'historico') {
      fetchHistorico();
    }
  }, [activeTab]);

  // Carregar detalhes de um lote específico
  const handleOpenLoteDetails = async (loteId: string) => {
    setLoadingDetails(true);
    try {
      const res = await fetch(`/api/perdas/lotes/${loteId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedLoteDetails(data);
      } else {
        addToast('Erro ao carregar detalhes do lote.', 'error');
      }
    } catch (err) {
      console.error('Erro ao abrir detalhes:', err);
      addToast('Falha na comunicação com o servidor.', 'error');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handlePrintLote = () => {
    window.print();
  };

  const isDark = theme === 'dark';

  return (
    <div className={`p-4 md:p-6 min-h-screen ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      {/* Cabeçalho Principal */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-rose-600/10 text-rose-600 rounded-lg">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Perdas, Vencidos e Avarias</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Registro de descarte, perdas de estoque e baixa contábil integrada ao ERP Digifarma
              </p>
            </div>
          </div>
        </div>

        {/* Alternador de Abas */}
        <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('nova-baixa')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'nova-baixa'
                ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Plus className="w-4 h-4" />
            Nova Baixa em Lote
            {items.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-rose-500 text-white rounded-full">
                {items.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('historico')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'historico'
                ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <History className="w-4 h-4" />
            Histórico de Baixas
          </button>
        </div>
      </div>

      {/* AVISO DO BELINHA AO BIPAR PRODUTO ESPECIAL (Controlado ou Antibiótico) */}
      {specialAlert && (
        <div className="mb-6 p-4 bg-amber-500/10 border-2 border-amber-500/40 rounded-2xl flex items-start justify-between gap-3 shadow-sm animate-fadeIn">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl mt-0.5 shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-xs font-black bg-amber-500 text-white rounded-md uppercase tracking-wider">
                  Aviso do Belinha
                </span>
                <h4 className="font-bold text-base text-amber-800 dark:text-amber-300">
                  {specialAlert.tipo} Identificado
                </h4>
              </div>
              <p className="text-sm text-amber-700 dark:text-amber-300/90 mt-1 leading-relaxed">
                O produto <strong className="underline">{specialAlert.produto}</strong> foi adicionado à lista.
                <strong className="block mt-0.5 text-amber-900 dark:text-amber-200">
                  O prejuízo financeiro será contabilizado no BelaFarma, mas a baixa no estoque do Digifarma NÃO será realizada por se tratar de um produto especial.
                </strong>
                O saldo físico no Digifarma permanece preservado para que a escrituração e o descarte sejam realizados pelo procedimento oficial (SNGPC / Livro de Psicotrópicos).
              </p>
            </div>
          </div>
          <button
            onClick={() => setSpecialAlert(null)}
            className="text-amber-600 hover:text-amber-800 p-1.5 rounded-lg hover:bg-amber-500/20 transition-colors"
            title="Fechar aviso"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* ABA 1: NOVA BAIXA EM LOTE */}
      {activeTab === 'nova-baixa' && (
        <div className="space-y-6">
          {/* Card de Busca / Bip de Código de Barras */}
          <div className={`p-4 md:p-6 rounded-2xl border shadow-sm ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="max-w-3xl">
              <label className="block text-sm font-semibold mb-2 flex items-center justify-between">
                <span>Bipar Código de Barras ou Pesquisar Produto</span>
                <span className="text-xs font-normal text-slate-500">Pressione Enter após bipar</span>
              </label>
              <div className="relative">
                <Search className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDownSearch}
                  placeholder="Bipe o código de barras ou digite o nome do medicamento/produto..."
                  className={`w-full pl-11 pr-10 py-3 rounded-xl border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-rose-500 transition-all ${
                    isDark ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                  }`}
                  autoFocus
                />
                {isSearching && (
                  <Loader2 className="absolute right-3.5 top-3.5 w-5 h-5 text-rose-500 animate-spin" />
                )}

                {/* Dropdown de Resultados de Busca */}
                {showDropdown && searchResults.length > 0 && (
                  <div className={`absolute z-30 left-0 right-0 mt-2 max-h-80 overflow-y-auto rounded-xl border shadow-xl ${
                    isDark ? 'bg-slate-800 border-slate-700 divide-slate-700' : 'bg-white border-slate-200 divide-slate-100'
                  } divide-y`}>
                    {searchResults.map((prod) => (
                      <div
                        key={`${prod.produto_id}_${prod.codigo_barras}`}
                        onClick={() => handleSelectProduct(prod)}
                        className={`p-3 cursor-pointer flex items-center justify-between gap-3 transition-colors ${
                          prod.is_especial 
                            ? (isDark ? 'hover:bg-amber-950/40 bg-amber-950/20' : 'hover:bg-amber-50 bg-amber-50/50')
                            : (isDark ? 'hover:bg-slate-700/60' : 'hover:bg-slate-100')
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm truncate">{prod.descricao}</span>
                            {prod.is_especial && (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500 text-white rounded-md tracking-wider uppercase flex items-center gap-1">
                                <ShieldAlert className="w-3 h-3" />
                                {prod.tipo_especial || 'Produto Especial'} (Sem baixa no Digifarma)
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-4 mt-1">
                            <span>EAN: {prod.codigo_barras || 'S/N'}</span>
                            <span>Estoque Atual: <strong className={prod.saldo <= 0 ? 'text-rose-500' : 'text-emerald-500'}>{prod.saldo}</strong></span>
                            <span>Custo: R$ {prod.preco_custo.toFixed(2)}</span>
                            <span>Venda: R$ {prod.preco_venda.toFixed(2)}</span>
                          </div>
                        </div>
                        <div>
                          <button className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1 shadow-sm text-white ${
                            prod.is_especial ? 'bg-amber-600 hover:bg-amber-700' : 'bg-rose-600 hover:bg-rose-700'
                          }`}>
                            <Plus className="w-3.5 h-3.5" /> Adicionar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tabela de Itens da Sessão Atual */}
          <div className={`rounded-2xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-rose-500" />
                <h3 className="font-bold text-base">Itens na Sessão de Descarte ({items.length})</h3>
                {qtdItensEspeciais > 0 && (
                  <span className="px-2.5 py-0.5 text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-full flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" />
                    {qtdItensEspeciais} especial(is) sem baixa de estoque
                  </span>
                )}
              </div>
              {items.length > 0 && (
                <button
                  onClick={handleClearBatch}
                  className="text-xs font-semibold text-rose-500 hover:text-rose-700 flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Limpar Lista
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <Trash2 className="w-12 h-12 mx-auto mb-3 opacity-30 text-rose-500" />
                <p className="font-semibold text-base">Nenhum produto adicionado à sessão de descarte.</p>
                <p className="text-sm mt-1">Bipe o código de barras ou pesquise o produto no campo acima para começar.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className={`text-xs uppercase font-semibold border-b ${
                    isDark ? 'bg-slate-900/60 border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}>
                    <tr>
                      <th className="p-3">Produto</th>
                      <th className="p-3 w-32">Estoque Digifarma</th>
                      <th className="p-3 w-40">Motivo</th>
                      <th className="p-3 w-28">Qtd Perda</th>
                      <th className="p-3 w-32">Custo Unit.</th>
                      <th className="p-3 w-32">Prejuízo (Custo)</th>
                      <th className="p-3 w-32">Perda (Venda)</th>
                      <th className="p-3">Observação</th>
                      <th className="p-3 w-12 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {items.map((it, idx) => {
                      const custoTotalItem = (it.quantidade || 0) * (it.preco_custo || 0);
                      const vendaTotalItem = (it.quantidade || 0) * (it.preco_venda || 0);

                      return (
                        <tr key={idx} className={isDark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50'}>
                          <td className="p-3">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">{it.descricao}</div>
                            <div className="text-xs text-slate-500">EAN: {it.codigo_barras || 'S/N'}</div>
                            {it.is_especial && (
                              <div className="mt-1">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                  <ShieldAlert className="w-3 h-3 text-amber-500" />
                                  {it.tipo_especial || 'Produto Especial'} • Estoque mantido no Digifarma
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="p-3 font-medium">
                            <div className="flex flex-col">
                              <span className={Number(it.saldo_anterior_digifarma) <= 0 ? 'text-rose-500' : 'text-slate-700 dark:text-slate-300'}>
                                Saldo: {it.saldo_anterior_digifarma ?? 0}
                              </span>
                              {it.is_especial ? (
                                <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-tight">
                                  (Não será baixado)
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                  (Será baixado)
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <select
                              value={it.motivo}
                              onChange={(e) => handleUpdateItem(idx, 'motivo', e.target.value as MotivoPerda)}
                              className={`w-full p-1.5 text-xs rounded-lg border font-medium focus:ring-1 focus:ring-rose-500 ${
                                isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'
                              }`}
                            >
                              <option value="Vencido">Vencido</option>
                              <option value="Avariado">Avariado / Quebra</option>
                              <option value="Furto/Roubo">Furto / Roubo</option>
                              <option value="Uso Interno/Descarte">Uso Interno / Descarte</option>
                            </select>
                          </td>
                          <td className="p-3">
                            <input
                              type="number"
                              min="1"
                              value={it.quantidade}
                              onChange={(e) => handleUpdateItem(idx, 'quantidade', Math.max(1, parseFloat(e.target.value) || 1))}
                              className={`w-20 p-1.5 text-xs font-bold text-center rounded-lg border focus:ring-1 focus:ring-rose-500 ${
                                isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'
                              }`}
                            />
                          </td>
                          <td className="p-3 text-slate-600 dark:text-slate-400">
                            R$ {(it.preco_custo || 0).toFixed(2)}
                          </td>
                          <td className="p-3 font-bold text-rose-600 dark:text-rose-400">
                            R$ {custoTotalItem.toFixed(2)}
                          </td>
                          <td className="p-3 text-amber-600 dark:text-amber-400 font-medium">
                            R$ {vendaTotalItem.toFixed(2)}
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={it.observacao || ''}
                              onChange={(e) => handleUpdateItem(idx, 'observacao', e.target.value)}
                              placeholder="Opcional: lote, motivo..."
                              className={`w-full p-1.5 text-xs rounded-lg border focus:ring-1 focus:ring-rose-500 ${
                                isDark ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-600' : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400'
                              }`}
                            />
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleRemoveItem(idx)}
                              title="Remover produto da lista"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Card Resumo e Confirmação da Sessão */}
          {items.length > 0 && (
            <div className={`p-6 rounded-2xl border shadow-sm ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-xs font-semibold text-slate-500 uppercase">Total de Itens</span>
                  <div className="text-2xl font-black mt-1 text-slate-800 dark:text-slate-100">{totalItensContados}</div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {qtdItensComuns} com baixa • {qtdItensEspeciais} especiais
                  </div>
                </div>

                <div className={`p-4 rounded-xl border ${isDark ? 'bg-rose-950/30 border-rose-800/40' : 'bg-rose-50 border-rose-200'}`}>
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase">Prejuízo Real (Custo)</span>
                  <div className="text-2xl font-black mt-1 text-rose-600 dark:text-rose-400">
                    R$ {totalPrejuizoCusto.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-rose-500/80 mt-1">100% Contabilizado no Financeiro</div>
                </div>

                <div className={`p-4 rounded-xl border ${isDark ? 'bg-amber-950/30 border-amber-800/40' : 'bg-amber-50 border-amber-200'}`}>
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase">Venda Perdida (Balcão)</span>
                  <div className="text-2xl font-black mt-1 text-amber-600 dark:text-amber-400">
                    R$ {totalPotencialVenda.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-amber-500/80 mt-1">Faturamento Potencial</div>
                </div>

                <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-xs font-semibold text-slate-500 uppercase">Responsável</span>
                  <div className="text-base font-bold mt-1 text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5">
                    <UserIcon className="w-4 h-4 text-slate-400" />
                    {user.name}
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Observações Gerais da Sessão de Baixa (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={observacaoGeral}
                  onChange={(e) => setObservacaoGeral(e.target.value)}
                  placeholder="Ex: Descarte quinzenal do armário de vencidos / Danos por vazamento de água..."
                  className={`w-full p-2.5 text-sm rounded-xl border focus:ring-2 focus:ring-rose-500 ${
                    isDark ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-600' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                  }`}
                />
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>
                    Produtos comuns terão o saldo abatido no Digifarma. Controlados e antibióticos terão apenas o prejuízo contabilizado.
                  </span>
                </div>

                <button
                  onClick={() => setShowConfirmModal(true)}
                  disabled={isSubmitting || items.length === 0}
                  className="w-full sm:w-auto px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Confirmar Baixa e Contabilizar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ABA 2: HISTÓRICO DE BAIXAS */}
      {activeTab === 'historico' && (
        <div className="space-y-6">
          {/* Cards de Resumo Geral do Histórico */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`p-4 rounded-2xl border shadow-sm ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200'}`}>
              <span className="text-xs font-semibold text-slate-500 uppercase">Lotes Realizados</span>
              <div className="text-2xl font-black mt-1 text-slate-800 dark:text-slate-100">{historicoTotais.total_lotes}</div>
            </div>
            <div className={`p-4 rounded-2xl border shadow-sm ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200'}`}>
              <span className="text-xs font-semibold text-slate-500 uppercase">Itens Descartados</span>
              <div className="text-2xl font-black mt-1 text-slate-800 dark:text-slate-100">{historicoTotais.total_itens}</div>
            </div>
            <div className={`p-4 rounded-2xl border shadow-sm ${isDark ? 'bg-slate-800/80 border-rose-900/30' : 'bg-white border-rose-100'}`}>
              <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase">Prejuízo Total (Custo)</span>
              <div className="text-2xl font-black mt-1 text-rose-600 dark:text-rose-400">
                R$ {(historicoTotais.total_custo || 0).toFixed(2)}
              </div>
            </div>
            <div className={`p-4 rounded-2xl border shadow-sm ${isDark ? 'bg-slate-800/80 border-amber-900/30' : 'bg-white border-amber-100'}`}>
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase">Venda Perdida (Balcão)</span>
              <div className="text-2xl font-black mt-1 text-amber-600 dark:text-amber-400">
                R$ {(historicoTotais.total_venda || 0).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Filtros */}
          <div className={`p-4 rounded-2xl border shadow-sm flex flex-col md:flex-row items-center gap-3 ${
            isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200'
          }`}>
            <div className="flex-1 w-full relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={filtroBusca}
                onChange={(e) => setFiltroBusca(e.target.value)}
                placeholder="Buscar por responsável ou observação..."
                className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border focus:ring-2 focus:ring-rose-500 ${
                  isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'
                }`}
              />
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <input
                type="date"
                value={filtroDataInicio}
                onChange={(e) => setFiltroDataInicio(e.target.value)}
                className={`p-2 text-xs rounded-xl border focus:ring-2 focus:ring-rose-500 ${
                  isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'
                }`}
              />
              <span className="text-xs text-slate-400">até</span>
              <input
                type="date"
                value={filtroDataFim}
                onChange={(e) => setFiltroDataFim(e.target.value)}
                className={`p-2 text-xs rounded-xl border focus:ring-2 focus:ring-rose-500 ${
                  isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'
                }`}
              />
              <button
                onClick={fetchHistorico}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
              >
                Filtrar
              </button>
            </div>
          </div>

          {/* Tabela do Histórico */}
          <div className={`rounded-2xl border shadow-sm overflow-hidden ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200'}`}>
            {loadingHistorico ? (
              <div className="p-12 text-center text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-rose-500" />
                <p className="mt-2 text-sm">Carregando histórico de baixas...</p>
              </div>
            ) : historicoLotes.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <History className="w-10 h-10 mx-auto opacity-30 text-slate-500" />
                <p className="mt-2 font-semibold">Nenhum registro de baixa localizado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className={`text-xs uppercase font-semibold border-b ${
                    isDark ? 'bg-slate-900/60 border-slate-700 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}>
                    <tr>
                      <th className="p-3.5">Data / Hora</th>
                      <th className="p-3.5">Responsável</th>
                      <th className="p-3.5 text-center">Itens</th>
                      <th className="p-3.5">Prejuízo (Custo)</th>
                      <th className="p-3.5">Perda (Venda)</th>
                      <th className="p-3.5">Observação</th>
                      <th className="p-3.5 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {historicoLotes.map((lote) => {
                      const dataFmt = new Date(lote.data_hora).toLocaleString('pt-BR');
                      return (
                        <tr key={lote.id} className={isDark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50'}>
                          <td className="p-3.5 font-medium whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-slate-400" />
                              <span>{dataFmt}</span>
                            </div>
                          </td>
                          <td className="p-3.5">
                            <div className="flex items-center gap-2 font-medium">
                              <UserIcon className="w-4 h-4 text-slate-400" />
                              <span>{lote.usuario_nome}</span>
                            </div>
                          </td>
                          <td className="p-3.5 text-center font-bold">
                            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                              {lote.total_itens}
                            </span>
                          </td>
                          <td className="p-3.5 font-bold text-rose-600 dark:text-rose-400">
                            R$ {(lote.total_custo || 0).toFixed(2)}
                          </td>
                          <td className="p-3.5 text-amber-600 dark:text-amber-400 font-medium">
                            R$ {(lote.total_venda || 0).toFixed(2)}
                          </td>
                          <td className="p-3.5 text-xs text-slate-500 max-w-xs truncate">
                            {lote.observacao_geral || '-'}
                          </td>
                          <td className="p-3.5 text-center">
                            <button
                              onClick={() => handleOpenLoteDetails(lote.id)}
                              className="px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors inline-flex items-center gap-1"
                            >
                              <FileText className="w-3.5 h-3.5" /> Detalhes
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DA BAIXA */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className={`w-full max-w-lg rounded-2xl border shadow-2xl p-6 ${
            isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <AlertTriangle className="w-7 h-7" />
              <h3 className="text-xl font-bold">Confirmar Baixa e Contabilização</h3>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">
              Você está prestes a efetivar o registro de <strong>{totalItensContados} produto(s)</strong>.
            </p>

            {qtdItensEspeciais > 0 && (
              <div className="mb-4 p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs leading-relaxed flex items-start gap-2">
                <ShieldAlert className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
                <div>
                  <strong>Atenção ({qtdItensEspeciais} Produto(s) Especial(is)):</strong>
                  <p className="mt-0.5">
                    O prejuízo de medicamentos controlados e antibióticos será somado ao valor contábil, mas o saldo no Digifarma <strong>NÃO</strong> será alterado para preservar a escrituração oficial do SNGPC.
                  </p>
                </div>
              </div>
            )}

            <div className={`p-4 rounded-xl border mb-5 space-y-2 text-sm ${
              isDark ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex justify-between">
                <span className="text-slate-500">Prejuízo Real (Custo de Compra):</span>
                <strong className="text-rose-600 dark:text-rose-400 font-black">R$ {totalPrejuizoCusto.toFixed(2)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Valor de Venda Perdido:</span>
                <strong className="text-amber-600 dark:text-amber-400 font-bold">R$ {totalPotencialVenda.toFixed(2)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Itens com baixa no Digifarma:</span>
                <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">{qtdItensComuns} produto(s)</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Responsável pelo registro:</span>
                <strong className="text-slate-700 dark:text-slate-300 font-semibold">{user.name}</strong>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDisposal}
                disabled={isSubmitting}
                className="px-6 py-2.5 text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Confirmar e Contabilizar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE DETALHES DO LOTE (HISTÓRICO) */}
      {selectedLoteDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl p-6 ${
            isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700 mb-4">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <FileText className="w-5 h-5 text-rose-500" />
                  Comprovante de Baixa de Perdas #{selectedLoteDetails.lote.id.substring(0, 16)}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Registrado em {new Date(selectedLoteDetails.lote.data_hora).toLocaleString('pt-BR')} por {selectedLoteDetails.lote.usuario_nome}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintLote}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" /> Imprimir
                </button>
                <button
                  onClick={() => setSelectedLoteDetails(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Totais do Lote */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] uppercase font-semibold text-slate-500">Itens Descartados</span>
                <div className="text-lg font-black mt-0.5">{selectedLoteDetails.lote.total_itens}</div>
              </div>
              <div className={`p-3 rounded-xl border ${isDark ? 'bg-rose-950/30 border-rose-800/40' : 'bg-rose-50 border-rose-200'}`}>
                <span className="text-[10px] uppercase font-semibold text-rose-600 dark:text-rose-400">Prejuízo a Custo</span>
                <div className="text-lg font-black mt-0.5 text-rose-600 dark:text-rose-400">
                  R$ {(selectedLoteDetails.lote.total_custo || 0).toFixed(2)}
                </div>
              </div>
              <div className={`p-3 rounded-xl border ${isDark ? 'bg-amber-950/30 border-amber-800/40' : 'bg-amber-50 border-amber-200'}`}>
                <span className="text-[10px] uppercase font-semibold text-amber-600 dark:text-amber-400">Preço de Venda</span>
                <div className="text-lg font-black mt-0.5 text-amber-600 dark:text-amber-400">
                  R$ {(selectedLoteDetails.lote.total_venda || 0).toFixed(2)}
                </div>
              </div>
              <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <span className="text-[10px] uppercase font-semibold text-slate-500">Observação</span>
                <div className="text-xs text-slate-700 dark:text-slate-300 truncate mt-0.5">
                  {selectedLoteDetails.lote.observacao_geral || 'Nenhuma'}
                </div>
              </div>
            </div>

            {/* Tabela dos Itens Baixados */}
            <div className={`rounded-xl border overflow-hidden mb-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
              <table className="w-full text-left text-xs">
                <thead className={`uppercase font-semibold border-b ${
                  isDark ? 'bg-slate-900/80 border-slate-700 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                }`}>
                  <tr>
                    <th className="p-2.5">Produto</th>
                    <th className="p-2.5">Motivo</th>
                    <th className="p-2.5 text-center">Qtd</th>
                    <th className="p-2.5">Custo Unit.</th>
                    <th className="p-2.5">Custo Total</th>
                    <th className="p-2.5">Venda Total</th>
                    <th className="p-2.5">Saldo ERP</th>
                    <th className="p-2.5">Baixa no Digifarma</th>
                    <th className="p-2.5">Obs.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {selectedLoteDetails.itens.map((it, idx) => (
                    <tr key={idx} className={isDark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50'}>
                      <td className="p-2.5 font-medium">
                        <div>{it.descricao}</div>
                        <div className="text-[10px] text-slate-500">EAN: {it.codigo_barras || 'S/N'}</div>
                        {it.is_especial ? (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 text-[9px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded">
                            {it.tipo_especial || 'Produto Especial'}
                          </span>
                        ) : null}
                      </td>
                      <td className="p-2.5">
                        <span className="px-2 py-0.5 rounded-md font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400">
                          {it.motivo}
                        </span>
                      </td>
                      <td className="p-2.5 text-center font-bold">{it.quantidade}</td>
                      <td className="p-2.5 text-slate-500">R$ {(it.preco_custo || 0).toFixed(2)}</td>
                      <td className="p-2.5 font-bold text-rose-600 dark:text-rose-400">
                        R$ {((it.quantidade || 0) * (it.preco_custo || 0)).toFixed(2)}
                      </td>
                      <td className="p-2.5 text-amber-600 dark:text-amber-400">
                        R$ {((it.quantidade || 0) * (it.preco_venda || 0)).toFixed(2)}
                      </td>
                      <td className="p-2.5 text-slate-500">{it.saldo_anterior_digifarma ?? '-'}</td>
                      <td className="p-2.5">
                        {it.is_especial ? (
                          <span className="text-amber-600 dark:text-amber-400 font-bold text-[11px] flex items-center gap-1">
                            <ShieldAlert className="w-3.5 h-3.5" /> Não baixado (Especial)
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            -{it.saldo_baixado_digifarma ?? it.quantidade} baixado
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-slate-500 max-w-xs truncate">{it.observacao || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setSelectedLoteDetails(null)}
                className="px-5 py-2 text-sm font-semibold bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-xl transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
