import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  MessageSquare, 
  Flame, 
  Search, 
  Filter, 
  TrendingDown, 
  TrendingUp, 
  ShoppingCart, 
  PackageCheck, 
  Sparkles, 
  Building2, 
  Phone, 
  ExternalLink, 
  Eye, 
  RefreshCw, 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  Layers, 
  DollarSign, 
  Clock, 
  FileText, 
  Image as ImageIcon, 
  Copy, 
  ChevronLeft, 
  ChevronRight,
  ShieldCheck,
  Zap,
  ArrowUpDown
} from 'lucide-react';
import { useToast } from '../ToastContext';

export interface PromocaoWhatsappItem {
  id: string;
  produto_nome: string;
  produto_id?: number | null;
  ean?: string | null;
  distribuidora: string;
  representante?: string | null;
  telefone?: string | null;
  preco_ofertado: number;
  preco_ult_compra: number;
  percentual_desconto: number;
  abaixo_ult_compra: number | boolean;
  saldo: number;
  curva_abc: string;
  vmd_ponderado: number;
  valor_estoque: number;
  comprar_suprir_semana: number;
  custo_unitario: number;
  ult_fornecedor?: string | null;
  data_oferta?: string | null;
  midia_tipo?: 'imagem' | 'texto' | null;
  midia_path?: string | null;
  confianca_ocr?: number | null;
  texto_original?: string | null;
  status?: string;
  tem_bonificacao?: boolean | number;
  bonificacao_detalhe?: any;
}

interface ResumoMetricas {
  total_promocoes: number;
  abaixo_ult_compra: number;
  curva_a_comprar: number;
  total_distribuidoras: number;
  novas_24h: number;
}

interface Props {
  onAdicionarAoCarrinho?: (item: PromocaoWhatsappItem) => void;
  onNovasCountChange?: (count: number) => void;
}

export const BelaPedPromocoesWhatsappTab: React.FC<Props> = ({
  onAdicionarAoCarrinho,
  onNovasCountChange
}) => {
  const { addToast } = useToast();

  // Estados de dados
  const [promocoes, setPromocoes] = useState<PromocaoWhatsappItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [totalItens, setTotalItens] = useState<number>(0);
  const [resumo, setResumo] = useState<ResumoMetricas>({
    total_promocoes: 0,
    abaixo_ult_compra: 0,
    curva_a_comprar: 0,
    total_distribuidoras: 0,
    novas_24h: 0
  });

  // Filtros
  const [termoBusca, setTermoBusca] = useState<string>('');
  const [buscaAplicada, setBuscaAplicada] = useState<string>('');
  const [distribuidoraFiltro, setDistribuidoraFiltro] = useState<string>('TODAS');
  const [curvaFiltro, setCurvaFiltro] = useState<'TODAS' | 'A' | 'B' | 'C'>('TODAS');
  const [apenasAbaixoUltCompra, setApenasAbaixoUltCompra] = useState<boolean>(true);
  const [apenasComprar, setApenasComprar] = useState<boolean>(false);
  const [midiaTipoFiltro, setMidiaTipoFiltro] = useState<'todos' | 'imagem' | 'texto'>('todos');
  const [ordenacao, setOrdenacao] = useState<string>('desconto_desc');
  const [pagina, setPagina] = useState<number>(1);
  const [itensPorPagina, setItensPorPagina] = useState<number>(50);

  // Modais
  const [modalItemDetalhe, setModalItemDetalhe] = useState<PromocaoWhatsappItem | null>(null);
  const [copiadoEanId, setCopiadoEanId] = useState<string | null>(null);

  // Lista de distribuidoras extraída para o filtro
  const [distribuidorasDisponiveis, setDistribuidorasDisponiveis] = useState<string[]>([]);

  // Carregar promoções do backend
  const carregarPromocoes = useCallback(async (silencioso = false) => {
    try {
      if (!silencioso) setLoading(true);

      const params = new URLSearchParams();
      if (buscaAplicada.trim()) params.append('busca', buscaAplicada.trim());
      if (distribuidoraFiltro !== 'TODAS') params.append('distribuidora', distribuidoraFiltro);
      if (curvaFiltro !== 'TODAS') params.append('curva_abc', curvaFiltro);
      if (apenasAbaixoUltCompra) params.append('apenas_abaixo_ult_compra', 'true');
      if (apenasComprar) params.append('apenas_comprar', 'true');
      if (midiaTipoFiltro !== 'todos') params.append('midia_tipo', midiaTipoFiltro);
      params.append('ordenar', ordenacao);
      params.append('limite', String(itensPorPagina));
      params.append('offset', String((pagina - 1) * itensPorPagina));

      const token = localStorage.getItem('token') || localStorage.getItem('belinha_token') || '';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/central-compras/promocoes-whatsapp?${params.toString()}`, {
        headers,
        credentials: 'include'
      });

      if (!res.ok) {
        throw new Error(`Falha na consulta (${res.status})`);
      }

      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setPromocoes(json.data);
        setTotalItens(json.total || 0);
        if (json.resumo) {
          setResumo(json.resumo);
          if (onNovasCountChange) {
            onNovasCountChange(json.resumo.novas_24h || 0);
          }
        }

        // Atualiza lista de distribuidoras se ainda estiver vazia
        setDistribuidorasDisponiveis(prev => {
          if (prev.length > 0) return prev;
          const dists = new Set<string>();
          json.data.forEach((p: PromocaoWhatsappItem) => {
            if (p.distribuidora && p.distribuidora.trim()) {
              dists.add(p.distribuidora.trim());
            }
          });
          return Array.from(dists).sort();
        });
      }
    } catch (err: any) {
      console.error('[BelaPedPromocoesWhatsappTab] Erro ao carregar promoções:', err);
      if (!silencioso) {
        addToast(`Erro ao carregar promoções do WhatsApp: ${err.message}`, 'error');
      }
    } finally {
      if (!silencioso) setLoading(false);
    }
  }, [buscaAplicada, distribuidoraFiltro, curvaFiltro, apenasAbaixoUltCompra, apenasComprar, midiaTipoFiltro, ordenacao, pagina, itensPorPagina, addToast, onNovasCountChange]);

  // Executa carregamento ao alterar filtros ou paginação
  useEffect(() => {
    carregarPromocoes();
  }, [carregarPromocoes]);

  // Atualiza última visualização ao abrir a aba
  useEffect(() => {
    try {
      localStorage.setItem('belaped_ult_view_promocoes_wpp', new Date().toISOString());
    } catch {}
  }, []);

  // Copiar EAN
  const handleCopiarEan = (ean: string, id: string) => {
    if (!ean) return;
    navigator.clipboard.writeText(ean);
    setCopiadoEanId(id);
    addToast(`EAN ${ean} copiado!`, 'success');
    setTimeout(() => setCopiadoEanId(null), 2500);
  };

  // Abrir WhatsApp do Representante
  const handleAbrirWhatsApp = (telefone?: string | null, produtoNome?: string, precoOfertado?: number) => {
    if (!telefone) {
      addToast('Telefone do representante não informado na mensagem.', 'info');
      return;
    }
    const cleanPhone = telefone.replace(/\D/g, '');
    const num = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const textoMsg = encodeURIComponent(
      `Olá! Tenho interesse na oferta minerada pela BelaFarma: ${produtoNome ? `*${produtoNome}*` : 'item'} ofertado por R$ ${precoOfertado ? precoOfertado.toFixed(2) : ''}. Como podemos fechar o pedido?`
    );
    window.open(`https://wa.me/${num}?text=${textoMsg}`, '_blank');
  };

  // Total de páginas
  const totalPaginas = Math.ceil(totalItens / itensPorPagina) || 1;

  return (
    <div className="flex-1 flex flex-col p-3 sm:p-4 max-w-7xl mx-auto w-full gap-3 pb-16">
      
      {/* ─── BANNER DE ALERTA DE NOVIDADES ─── */}
      {resumo.novas_24h > 0 && (
        <div className="bg-gradient-to-r from-amber-950/80 via-orange-950/60 to-slate-900 border border-amber-500/40 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg shadow-amber-950/20 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
              <Flame className="w-5 h-5 text-amber-400 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-black text-amber-200 flex items-center gap-2">
                <span>{resumo.novas_24h} Novas Promoções Mineradas no WhatsApp!</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/30 text-amber-300 border border-amber-400/50">
                  ÚLTIMAS 24H
                </span>
              </h3>
              <p className="text-xs text-amber-100/70 mt-0.5">
                Ofertas de encartes e mensagens de texto de fornecedores cruzadas com seu estoque atual e histórico de compras Digifarma.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setOrdenacao('data_desc');
              setPagina(1);
              carregarPromocoes();
            }}
            className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 shrink-0 cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Ver Mais Recentes</span>
          </button>
        </div>
      )}

      {/* ─── CARDS DE KPIS E RESUMO EXECUTIVO ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
        {/* Card 1: Total Promoções */}
        <div className="bg-[#0b1222] border border-slate-800 rounded-2xl p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-950/60 border border-cyan-800/60 flex items-center justify-center text-cyan-400 shrink-0">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 block truncate">Total Minerado</span>
            <span className="text-base sm:text-lg font-black text-white font-mono">{resumo.total_promocoes.toLocaleString('pt-BR')}</span>
          </div>
        </div>

        {/* Card 2: Abaixo da Última Compra */}
        <div className="bg-[#0b1222] border border-emerald-900/40 rounded-2xl p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center text-emerald-400 shrink-0">
            <TrendingDown className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-emerald-400 block truncate">Com Desconto Real</span>
            <span className="text-base sm:text-lg font-black text-emerald-300 font-mono">{resumo.abaixo_ult_compra.toLocaleString('pt-BR')}</span>
          </div>
        </div>

        {/* Card 3: Curva A Urgentes */}
        <div className="bg-[#0b1222] border border-amber-900/40 rounded-2xl p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-950/60 border border-amber-800/60 flex items-center justify-center text-amber-400 shrink-0">
            <PackageCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-amber-400 block truncate">Curva A Precisando</span>
            <span className="text-base sm:text-lg font-black text-amber-300 font-mono">{resumo.curva_a_comprar.toLocaleString('pt-BR')}</span>
          </div>
        </div>

        {/* Card 4: Distribuidoras */}
        <div className="bg-[#0b1222] border border-slate-800 rounded-2xl p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-950/60 border border-indigo-800/60 flex items-center justify-center text-indigo-400 shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 block truncate">Distribuidoras</span>
            <span className="text-base sm:text-lg font-black text-indigo-300 font-mono">{resumo.total_distribuidoras}</span>
          </div>
        </div>

        {/* Card 5: Novas 24h */}
        <div className="bg-[#0b1222] border border-orange-900/40 rounded-2xl p-3 col-span-2 lg:col-span-1 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-950/60 border border-orange-800/60 flex items-center justify-center text-orange-400 shrink-0">
            <Flame className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-orange-400 block truncate">Chegaram Hoje</span>
            <span className="text-base sm:text-lg font-black text-orange-300 font-mono">{resumo.novas_24h}</span>
          </div>
        </div>
      </div>

      {/* ─── BARRA DE FILTROS E PESQUISA ─── */}
      <div className="bg-[#0b1222] border border-slate-800 rounded-2xl p-3 flex flex-col gap-3">
        {/* Linha 1: Campo de Busca e Botão de Atualizar */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
            <input
              type="text"
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setBuscaAplicada(termoBusca);
                  setPagina(1);
                }
              }}
              placeholder="Buscar por produto, laboratório, EAN, distribuidora ou representante..."
              className="w-full bg-[#060a12] border border-slate-700 rounded-xl pl-10 pr-20 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
            />
            {termoBusca && (
              <button
                type="button"
                onClick={() => {
                  setTermoBusca('');
                  setBuscaAplicada('');
                  setPagina(1);
                }}
                className="absolute right-12 top-2.5 text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                title="Limpar busca"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setBuscaAplicada(termoBusca);
                setPagina(1);
              }}
              className="absolute right-1.5 top-1.5 px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-black uppercase cursor-pointer transition-all"
            >
              Buscar
            </button>
          </div>

          <button
            type="button"
            onClick={() => carregarPromocoes()}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-black uppercase flex items-center gap-1.5 shrink-0 transition-all cursor-pointer disabled:opacity-50"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>

        {/* Linha 2: Chips e Seletores Rápidos */}
        <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
          {/* Curva ABC */}
          <div className="flex items-center gap-1 bg-[#060a12] p-1 rounded-xl border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-500 px-2">Curva:</span>
            {(['TODAS', 'A', 'B', 'C'] as const).map(curva => (
              <button
                key={curva}
                type="button"
                onClick={() => {
                  setCurvaFiltro(curva);
                  setPagina(1);
                }}
                className={`px-2.5 py-1 rounded-lg font-black transition-all cursor-pointer ${
                  curvaFiltro === curva
                    ? curva === 'A'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : curva === 'B'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : curva === 'C'
                      ? 'bg-slate-600 text-white shadow-sm'
                      : 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                {curva}
              </button>
            ))}
          </div>

          {/* Tipo de Mídia */}
          <div className="flex items-center gap-1 bg-[#060a12] p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => { setMidiaTipoFiltro('todos'); setPagina(1); }}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                midiaTipoFiltro === 'todos' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Todas Mídias
            </button>
            <button
              type="button"
              onClick={() => { setMidiaTipoFiltro('imagem'); setPagina(1); }}
              className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-all cursor-pointer ${
                midiaTipoFiltro === 'imagem' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Apenas Encartes e Imagens OCR"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Encartes</span>
            </button>
            <button
              type="button"
              onClick={() => { setMidiaTipoFiltro('texto'); setPagina(1); }}
              className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-all cursor-pointer ${
                midiaTipoFiltro === 'texto' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Apenas Mensagens de Texto"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Texto</span>
            </button>
          </div>

          {/* Toggles Rápidos */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setApenasAbaixoUltCompra(prev => !prev);
                setPagina(1);
              }}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                apenasAbaixoUltCompra
                  ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300'
                  : 'bg-[#060a12] border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
              <span>&lt; Última Compra</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setApenasComprar(prev => !prev);
                setPagina(1);
              }}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                apenasComprar
                  ? 'bg-amber-950/80 border-amber-500/60 text-amber-300'
                  : 'bg-[#060a12] border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5 text-amber-400" />
              <span>Suprir 1 Semana &gt; 0</span>
            </button>

            {/* Ordenação */}
            <div className="flex items-center gap-1.5 bg-[#060a12] px-2.5 py-1 rounded-xl border border-slate-800">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={ordenacao}
                onChange={(e) => {
                  setOrdenacao(e.target.value);
                  setPagina(1);
                }}
                className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer"
              >
                <option value="desconto_desc" className="bg-[#0b1222] text-white">Maior Desconto (%)</option>
                <option value="comprar_desc" className="bg-[#0b1222] text-white">Mais Necessários (7d)</option>
                <option value="data_desc" className="bg-[#0b1222] text-white">Mais Recentes</option>
                <option value="preco_asc" className="bg-[#0b1222] text-white">Menor Preço Ofertado</option>
                <option value="saldo_asc" className="bg-[#0b1222] text-white">Menor Saldo Estoque</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ─── TABELA DE PROMOÇÕES CRUZADAS ─── */}
      <div className="bg-[#0b1222] border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cruzando ofertas mineradas com estoque Digifarma...</p>
          </div>
        ) : promocoes.length === 0 ? (
          <div className="py-16 px-4 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700 flex items-center justify-center text-slate-400">
              <MessageSquare className="w-6 h-6" />
            </div>
            <h4 className="text-base font-black text-white">Nenhuma promoção encontrada com os filtros atuais</h4>
            <p className="text-xs text-slate-400 max-w-md">
              Tente relaxar os filtros, desmarcar a opção &quot;&lt; Última Compra&quot; ou pesquisar por outro termo.
            </p>
            <button
              type="button"
              onClick={() => {
                setTermoBusca('');
                setBuscaAplicada('');
                setCurvaFiltro('TODAS');
                setApenasAbaixoUltCompra(false);
                setApenasComprar(false);
                setMidiaTipoFiltro('todos');
                setPagina(1);
              }}
              className="mt-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-black uppercase cursor-pointer"
            >
              Limpar Todos os Filtros
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#060a12] border-b border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  <th className="py-3 px-3 sm:px-4">Produto &amp; Identificação</th>
                  <th className="py-3 px-3">Distribuidora / Rep</th>
                  <th className="py-3 px-3 text-right">Ofertado WPP</th>
                  <th className="py-3 px-3 text-right">Última Compra</th>
                  <th className="py-3 px-3 text-center">Desconto</th>
                  <th className="py-3 px-3 text-right">Estoque Atual</th>
                  <th className="py-3 px-3 text-right">Valor em Estoque</th>
                  <th className="py-3 px-3 text-center">Suprir 1 Sem</th>
                  <th className="py-3 px-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {promocoes.map((item) => {
                  const isAbaixo = item.preco_ult_compra > 0 && item.preco_ofertado < item.preco_ult_compra;
                  const precisaComprar = item.comprar_suprir_semana > 0;
                  const descFormatado = item.percentual_desconto > 0 
                    ? `${item.percentual_desconto.toFixed(1)}%` 
                    : item.preco_ult_compra > 0 
                    ? `${(((item.preco_ult_compra - item.preco_ofertado) / item.preco_ult_compra) * 100).toFixed(1)}%` 
                    : '-';

                  return (
                    <tr 
                      key={item.id}
                      className="hover:bg-slate-850/50 transition-colors group"
                    >
                      {/* 1. Produto, EAN, Curva, Mídia */}
                      <td className="py-2.5 px-3 sm:px-4 min-w-[220px] max-w-[320px]">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {/* Curva ABC */}
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                              item.curva_abc === 'A' 
                                ? 'bg-amber-950 text-amber-300 border border-amber-600/60'
                                : item.curva_abc === 'B'
                                ? 'bg-blue-950 text-blue-300 border border-blue-600/60'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}>
                              {item.curva_abc}
                            </span>

                            {/* Badge Mídia */}
                            {item.midia_tipo === 'imagem' ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-700/60 flex items-center gap-1" title="Minerado de Encarte / Imagem OCR">
                                <ImageIcon className="w-3 h-3" /> Encarte
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/60 flex items-center gap-1" title="Minerado de Mensagem de Texto">
                                <FileText className="w-3 h-3" /> Texto
                              </span>
                            )}

                            {/* Bonificação */}
                            {Boolean(item.tem_bonificacao) && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-pink-950 text-pink-300 border border-pink-700/60 flex items-center gap-0.5">
                                <Sparkles className="w-2.5 h-2.5" /> Bonif.
                              </span>
                            )}
                          </div>

                          {/* Nome */}
                          <span className="font-bold text-white leading-tight line-clamp-2">
                            {item.produto_nome}
                          </span>

                          {/* EAN & ID */}
                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            {item.ean && (
                              <button
                                type="button"
                                onClick={() => handleCopiarEan(item.ean!, item.id)}
                                className="flex items-center gap-1 hover:text-cyan-300 transition-colors cursor-pointer"
                                title="Copiar EAN"
                              >
                                <span className="font-mono">{item.ean}</span>
                                {copiadoEanId === item.id ? (
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3 opacity-60 hover:opacity-100" />
                                )}
                              </button>
                            )}
                            {item.produto_id && (
                              <span className="text-[10px] text-slate-500 font-mono">
                                #{item.produto_id}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 2. Distribuidora / Rep / WhatsApp */}
                      <td className="py-2.5 px-3 min-w-[150px]">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-slate-200 truncate block">
                            {item.distribuidora || 'Distribuidora Parceira'}
                          </span>
                          {item.representante && (
                            <span className="text-[11px] text-slate-400 truncate block">
                              {item.representante}
                            </span>
                          )}
                          {item.telefone && (
                            <button
                              type="button"
                              onClick={() => handleAbrirWhatsApp(item.telefone, item.produto_nome, item.preco_ofertado)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors mt-0.5 cursor-pointer"
                              title="Abrir WhatsApp para negociar"
                            >
                              <Phone className="w-3 h-3" />
                              <span>{item.telefone}</span>
                              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* 3. Preço Ofertado */}
                      <td className="py-2.5 px-3 text-right">
                        <span className="font-mono font-black text-sm text-cyan-300 block">
                          R$ {item.preco_ofertado.toFixed(2)}
                        </span>
                        {item.data_oferta && (
                          <span className="text-[10px] text-slate-500 block">
                            {new Date(item.data_oferta).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </td>

                      {/* 4. Preço Última Compra Digifarma */}
                      <td className="py-2.5 px-3 text-right">
                        {item.preco_ult_compra > 0 ? (
                          <div>
                            <span className="font-mono text-xs text-slate-300 block">
                              R$ {item.preco_ult_compra.toFixed(2)}
                            </span>
                            {item.ult_fornecedor && (
                              <span className="text-[10px] text-slate-500 truncate block max-w-[120px] ml-auto" title={item.ult_fornecedor}>
                                {item.ult_fornecedor}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600 text-xs italic">Sem histórico</span>
                        )}
                      </td>

                      {/* 5. Percentual de Desconto */}
                      <td className="py-2.5 px-3 text-center">
                        {isAbaixo ? (
                          <span className="px-2 py-0.5 rounded-full font-black text-xs bg-emerald-950 text-emerald-300 border border-emerald-600/80 inline-flex items-center gap-0.5">
                            <TrendingDown className="w-3 h-3" />
                            {descFormatado}
                          </span>
                        ) : item.preco_ult_compra > 0 ? (
                          <span className="text-slate-500 text-xs font-mono">
                            0%
                          </span>
                        ) : (
                          <span className="text-slate-600 text-[11px]">-</span>
                        )}
                      </td>

                      {/* 6. Saldo Atual */}
                      <td className="py-2.5 px-3 text-right">
                        <span className={`font-mono font-bold text-xs ${item.saldo <= 0 ? 'text-red-400' : item.saldo < 5 ? 'text-amber-300' : 'text-slate-200'}`}>
                          {item.saldo} un
                        </span>
                        {item.vmd_ponderado > 0 && (
                          <span className="text-[10px] text-slate-500 block font-mono">
                            VMD: {item.vmd_ponderado}
                          </span>
                        )}
                      </td>

                      {/* 7. Valor em Estoque */}
                      <td className="py-2.5 px-3 text-right">
                        <span className="font-mono text-xs text-slate-300 block">
                          R$ {item.valor_estoque.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>

                      {/* 8. Suprir 1 Semana */}
                      <td className="py-2.5 px-3 text-center">
                        {precisaComprar ? (
                          <span className="px-2 py-0.5 rounded-lg font-black text-xs bg-amber-950/80 text-amber-300 border border-amber-600/80 font-mono inline-block">
                            +{Math.ceil(item.comprar_suprir_semana)} un
                          </span>
                        ) : (
                          <span className="text-slate-500 text-xs font-mono">
                            0 un
                          </span>
                        )}
                      </td>

                      {/* 9. Ações */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Visualizar Mensagem / Encarte */}
                          <button
                            type="button"
                            onClick={() => setModalItemDetalhe(item)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                            title="Ver mensagem/encarte original minerado"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Adicionar ao Carrinho / Cotação */}
                          <button
                            type="button"
                            onClick={() => {
                              if (onAdicionarAoCarrinho) {
                                onAdicionarAoCarrinho(item);
                              } else {
                                addToast(`Item ${item.produto_nome} pronto para inclusão no pedido!`, 'success');
                              }
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-1 transition-all shadow-sm active:scale-95 cursor-pointer shrink-0"
                            title="Comprar este item na cotação"
                          >
                            <ShoppingCart className="w-3 h-3" />
                            <span className="hidden xl:inline">Comprar</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ─── BARRA DE PAGINAÇÃO ─── */}
        <div className="bg-[#060a12] border-t border-slate-800 px-3 sm:px-4 py-2.5 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="text-slate-400">
            Exibindo <span className="font-bold text-white">{promocoes.length}</span> de <span className="font-bold text-white">{totalItens.toLocaleString('pt-BR')}</span> promoções encontradas
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-[11px] hidden sm:inline">Página {pagina} de {totalPaginas}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPagina(prev => Math.max(1, prev - 1))}
                disabled={pagina <= 1}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-40 disabled:hover:bg-slate-800 cursor-pointer"
                title="Página Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setPagina(prev => Math.min(totalPaginas, prev + 1))}
                disabled={pagina >= totalPaginas}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-40 disabled:hover:bg-slate-800 cursor-pointer"
                title="Próxima Página"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── MODAL DE DETALHES DA MENSAGEM / ENCARTE ─── */}
      {modalItemDetalhe && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[#0b1222] border border-cyan-500/40 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95">
            {/* Cabeçalho */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-700/60 flex items-center justify-center text-cyan-400">
                  {modalItemDetalhe.midia_tipo === 'imagem' ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Origem da Oferta Minerada</h3>
                  <span className="text-[11px] text-slate-400">
                    {modalItemDetalhe.distribuidora} • {modalItemDetalhe.data_oferta ? new Date(modalItemDetalhe.data_oferta).toLocaleString('pt-BR') : 'Data não informada'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalItemDetalhe(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo */}
            <div className="p-4 overflow-y-auto flex flex-col gap-3">
              {/* Card Resumo do Produto */}
              <div className="bg-[#060a12] border border-slate-800 rounded-xl p-3 flex flex-col gap-1.5">
                <span className="font-bold text-white text-sm">{modalItemDetalhe.produto_nome}</span>
                <div className="flex items-center gap-3 text-xs flex-wrap">
                  <span className="text-cyan-300 font-mono font-bold">Ofertado: R$ {modalItemDetalhe.preco_ofertado.toFixed(2)}</span>
                  {modalItemDetalhe.preco_ult_compra > 0 && (
                    <span className="text-slate-300 font-mono">Última compra: R$ {modalItemDetalhe.preco_ult_compra.toFixed(2)}</span>
                  )}
                  {modalItemDetalhe.saldo !== undefined && (
                    <span className="text-slate-400">Estoque: <b className="text-white">{modalItemDetalhe.saldo} un</b></span>
                  )}
                  <span className="text-amber-400 font-bold">Curva {modalItemDetalhe.curva_abc}</span>
                </div>
              </div>

              {/* Se houver imagem do encarte */}
              {modalItemDetalhe.midia_path && (
                <div className="border border-slate-800 rounded-xl overflow-hidden bg-black flex items-center justify-center p-2">
                  <img
                    src={modalItemDetalhe.midia_path.startsWith('http') || modalItemDetalhe.midia_path.startsWith('/') ? modalItemDetalhe.midia_path : `/uploads/${modalItemDetalhe.midia_path}`}
                    alt="Encarte da promoção"
                    className="max-h-64 object-contain rounded"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
              )}

              {/* Texto original da conversa / encarte OCR */}
              <div>
                <span className="text-xs uppercase font-bold text-slate-400 block mb-1">
                  Mensagem / Texto Original Minerado:
                </span>
                <div className="bg-[#060a12] border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-300 whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed select-text">
                  {modalItemDetalhe.texto_original || 'Nenhum texto original armazenado para esta mensagem.'}
                </div>
              </div>

              {/* Contato do Representante */}
              {modalItemDetalhe.telefone && (
                <div className="flex items-center justify-between bg-emerald-950/40 border border-emerald-800/40 rounded-xl p-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-emerald-400 block">Contato do Representante</span>
                    <span className="text-xs text-white font-bold">{modalItemDetalhe.representante || 'Representante'} • {modalItemDetalhe.telefone}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAbrirWhatsApp(modalItemDetalhe.telefone, modalItemDetalhe.produto_nome, modalItemDetalhe.preco_ofertado)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Abrir Conversa</span>
                  </button>
                </div>
              )}
            </div>

            {/* Rodapé */}
            <div className="p-3 border-t border-slate-800 flex items-center justify-end gap-2 bg-[#060a12] rounded-b-2xl">
              <button
                type="button"
                onClick={() => setModalItemDetalhe(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onAdicionarAoCarrinho && modalItemDetalhe) {
                    onAdicionarAoCarrinho(modalItemDetalhe);
                    setModalItemDetalhe(null);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white text-xs font-black uppercase flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Adicionar ao Pedido</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default BelaPedPromocoesWhatsappTab;
