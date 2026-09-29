import React, { useState, useEffect, useCallback } from 'react';
import { 
  Flame, 
  Target, 
  DollarSign, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  RefreshCw, 
  Loader2, 
  Calendar, 
  Percent, 
  Sparkles, 
  Printer, 
  Copy, 
  Check, 
  RotateCcw, 
  Tag, 
  Package, 
  TrendingDown, 
  ShieldCheck, 
  Clock,
  X
} from 'lucide-react';
import { User } from '../types';
import { useToast } from './ToastContext';

interface ResumoData {
  dividaInicial: number;
  saldoRestanteDivida: number;
  percentualDividaPaga: number;
  campanha: {
    id: string;
    semana: string;
    dataInicio: string;
    dataFim: string;
    metaSemanal: number;
    totalResgatado: number;
    percentualMetaSemanal: number;
  };
  progressoSelecao: {
    aprovados: number;
    meta: number;
    completo: boolean;
    pulados: number;
  };
}

interface ProdutoCandidato {
  produto_id: number;
  descricao: string;
  apresentacao: string;
  cod_barras: string;
  categoria: string;
  saldo: number;
  preco_custo: number;
  preco_normal: number;
  preco_sugerido: number;
  desconto_reais: number;
  desconto_percentual: number;
  valor_total_parado: number;
  dias_parado: number;
  vigencia_padrao: {
    data_inicio: string;
    data_termino: string;
  };
}

interface ItemAtivo {
  id: string;
  produto_id: number;
  descricao: string;
  apresentacao: string;
  ean: string;
  categoria: string;
  saldo_estoque: number;
  preco_custo: number;
  preco_normal: number;
  preco_promocional: number;
  desconto_percentual: number;
  data_inicio: string;
  data_termino: string;
  status: string;
  sincronizado_digifarma: number;
  aprovado_em: string;
}

interface LiquidacaoCaixaProps {
  user: User;
}

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export const LiquidacaoCaixa: React.FC<LiquidacaoCaixaProps> = ({ user }) => {
  const { addToast } = useToast();

  const [resumo, setResumo] = useState<ResumoData | null>(null);
  const [candidato, setCandidato] = useState<ProdutoCandidato | null>(null);
  const [semCandidatos, setSemCandidatos] = useState(false);
  const [itensAtivos, setItensAtivos] = useState<ItemAtivo[]>([]);

  const [loadingResumo, setLoadingResumo] = useState(true);
  const [loadingItem, setLoadingItem] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [skippingItem, setSkippingItem] = useState(false);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  // Campos de edição do item atual
  const [customPrice, setCustomPrice] = useState<string>('');
  const [dataTermino, setDataTermino] = useState<string>('');

  // Modais de aceleração
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [copiedWhatsapp, setCopiedWhatsapp] = useState(false);
  const [loadingWhatsapp, setLoadingWhatsapp] = useState(false);

  // 1. Carrega Resumo e Itens Ativos
  const fetchResumo = useCallback(async () => {
    try {
      const res = await fetch('/api/liquidacao/resumo');
      if (res.ok) {
        const data = await res.json();
        setResumo(data);
      }
    } catch (e) {
      console.error('Erro ao buscar resumo da liquidação:', e);
    } finally {
      setLoadingResumo(false);
    }
  }, []);

  const fetchItensAtivos = useCallback(async () => {
    try {
      const res = await fetch('/api/liquidacao/itens-ativos');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.itens)) {
          setItensAtivos(data.itens);
        }
      }
    } catch (e) {
      console.error('Erro ao buscar itens ativos:', e);
    }
  }, []);

  // 2. Carrega Próximo Candidato
  const fetchProximoCandidato = useCallback(async () => {
    setLoadingItem(true);
    setSemCandidatos(false);
    try {
      const res = await fetch('/api/liquidacao/proximo-item');
      if (res.ok) {
        const data = await res.json();
        if (data.disponivel && data.produto) {
          setCandidato(data.produto);
          setCustomPrice(data.produto.preco_sugerido.toFixed(2));
          setDataTermino(data.produto.vigencia_padrao.data_termino);
        } else {
          setCandidato(null);
          setSemCandidatos(true);
        }
      }
    } catch (e) {
      console.error('Erro ao buscar candidato:', e);
    } finally {
      setLoadingItem(false);
    }
  }, []);

  useEffect(() => {
    fetchResumo();
    fetchItensAtivos();
    fetchProximoCandidato();
  }, [fetchResumo, fetchItensAtivos, fetchProximoCandidato]);

  // Ação: Aceitar & Enviar ao Digifarma
  const handleAceitar = async () => {
    if (!candidato) return;
    const finalPrice = parseFloat(customPrice.replace(',', '.'));
    if (isNaN(finalPrice) || finalPrice <= 0) {
      addToast('Por favor, informe um preço promocional válido.', 'error');
      return;
    }

    if (finalPrice < candidato.preco_custo) {
      const confirma = window.confirm(
        `Atenção: O valor de ${fmt(finalPrice)} é menor que o custo (${fmt(candidato.preco_custo)}). Deseja aplicar mesmo assim?`
      );
      if (!confirma) return;
    }

    setSavingItem(true);
    try {
      const res = await fetch('/api/liquidacao/aplicar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produto_id: candidato.produto_id,
          preco_promocional: finalPrice,
          data_inicio: candidato.vigencia_padrao.data_inicio,
          data_termino: dataTermino || candidato.vigencia_padrao.data_termino,
          aprovado_por: user.name
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addToast(
          `🔥 ${candidato.descricao} inserido por ${fmt(finalPrice)} no Digifarma!`,
          'success'
        );
        fetchResumo();
        fetchItensAtivos();
        fetchProximoCandidato();
      } else {
        addToast(data.error || 'Erro ao aplicar no Digifarma.', 'error');
      }
    } catch (e) {
      console.error('Erro ao aplicar promoção:', e);
      addToast('Falha na comunicação com o servidor.', 'error');
    } finally {
      setSavingItem(false);
    }
  };

  // Ação: Pular / Trocar Produto
  const handlePular = async () => {
    if (!candidato) return;
    setSkippingItem(true);
    try {
      const res = await fetch('/api/liquidacao/pular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produto_id: candidato.produto_id })
      });
      if (res.ok) {
        addToast(`Produto trocado com sucesso.`, 'info');
        fetchResumo();
        fetchProximoCandidato();
      }
    } catch (e) {
      console.error('Erro ao pular produto:', e);
    } finally {
      setSkippingItem(false);
    }
  };

  // Ação: Reverter Promoção
  const handleReverter = async (item: ItemAtivo) => {
    if (!window.confirm(`Deseja realmente encerrar a promoção de "${item.descricao}" no Digifarma?`)) {
      return;
    }

    setRevertingId(item.id);
    try {
      const res = await fetch('/api/liquidacao/reverter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produto_id: item.produto_id, itemId: item.id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`Promoção revertida no Digifarma!`, 'success');
        fetchResumo();
        fetchItensAtivos();
      } else {
        addToast(data.error || 'Erro ao reverter promoção.', 'error');
      }
    } catch (e) {
      console.error('Erro ao reverter:', e);
      addToast('Falha ao reverter promoção.', 'error');
    } finally {
      setRevertingId(null);
    }
  };

  // Ação: Copiar Mensagem de WhatsApp
  const handleCopiarWhatsApp = async () => {
    setLoadingWhatsapp(true);
    try {
      const res = await fetch('/api/liquidacao/texto-whatsapp');
      if (res.ok) {
        const data = await res.json();
        if (data.texto) {
          await navigator.clipboard.writeText(data.texto);
          setCopiedWhatsapp(true);
          addToast('📋 Mensagem de Ofertas copiada para o WhatsApp!', 'success');
          setTimeout(() => setCopiedWhatsapp(false), 4000);
        }
      }
    } catch (e) {
      console.error('Erro ao gerar texto para WhatsApp:', e);
    } finally {
      setLoadingWhatsapp(false);
    }
  };

  // Cálculo de desconto dinâmico com base no valor digitado
  const parsedPrice = parseFloat(customPrice.replace(',', '.')) || 0;
  const currentDiscountPercent = candidato && candidato.preco_normal > 0 && parsedPrice > 0
    ? Math.round(((candidato.preco_normal - parsedPrice) / candidato.preco_normal) * 100)
    : 0;
  const currentDiscountReais = candidato && parsedPrice > 0
    ? Math.max(0, candidato.preco_normal - parsedPrice)
    : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* ─── CABEÇALHO DO MÓDULO ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-red-600 via-orange-600 to-amber-600 p-6 md:p-8 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
          <Flame size={240} />
        </div>

        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-black uppercase tracking-wider text-amber-200">
            <Flame className="w-4 h-4 text-amber-300 fill-amber-300 animate-pulse" />
            Aceleração Financeira & Queima de Estoque
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-3">
            Liquidação & Resgate de Caixa
          </h1>
          <p className="text-sm text-white/90 max-w-2xl leading-relaxed">
            Selecione 20 produtos parados há mais de 90 dias por semana. O preço promocional é gravado 
            diretamente no <strong>Digifarma Firebird</strong> com vigência automática de 7 dias, transformando estoque 
            imobilizado em dinheiro limpo para <strong>zerar o Cheque Especial</strong>.
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap md:flex-col gap-2 shrink-0">
          <button
            onClick={() => { fetchResumo(); fetchItensAtivos(); fetchProximoCandidato(); }}
            disabled={loadingResumo || loadingItem}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 active:scale-95 transition-all rounded-2xl text-xs font-bold flex items-center justify-center gap-2 border border-white/20 backdrop-blur-md"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingResumo || loadingItem ? 'animate-spin' : ''}`} />
            Atualizar Dados
          </button>

          <button
            onClick={handleCopiarWhatsApp}
            disabled={loadingWhatsapp || itensAtivos.length === 0}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 transition-all text-white rounded-2xl text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30"
          >
            {copiedWhatsapp ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedWhatsapp ? 'Copiado!' : 'Copiar Ofertas WhatsApp'}
          </button>

          <button
            onClick={() => setShowPrintModal(true)}
            disabled={itensAtivos.length === 0}
            className="px-4 py-2.5 bg-amber-400 hover:bg-amber-500 active:scale-95 transition-all text-slate-950 rounded-2xl text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-amber-900/30"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir Etiquetas ({itensAtivos.length})
          </button>
        </div>
      </div>

      {/* ─── PAINEL DE METAS: TERMÔMETRO DA DÍVIDA & META DA SEMANA ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Termômetro da Dívida */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Termômetro da Dívida
            </span>
            <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
              <TrendingDown size={18} />
            </div>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {fmt(resumo?.saldoRestanteDivida ?? 3500)}
              </span>
              <span className="text-xs text-slate-400">restantes</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Meta principal: Zerar os <strong>R$ 3.500,00</strong> do Cheque Especial
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
              <span>Amortizado: {fmt(resumo?.campanha.totalResgatado || 0)}</span>
              <span>{resumo?.percentualDividaPaga || 0}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-red-500 to-emerald-500 transition-all duration-500 rounded-full"
                style={{ width: `${Math.max(5, resumo?.percentualDividaPaga || 0)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card 2: Meta Semanal */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Meta Semanal ({resumo?.campanha.semana || 'Semana'})
            </span>
            <div className="p-2 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400">
              <Target size={18} />
            </div>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {fmt(resumo?.campanha.totalResgatado || 0)}
              </span>
              <span className="text-xs text-slate-400">/ {fmt(resumo?.campanha.metaSemanal || 450)}</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Meta de R$ 450,00 por semana para zerar em até 60 dias
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
              <span>Progresso</span>
              <span>{resumo?.campanha.percentualMetaSemanal || 0}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-500 rounded-full"
                style={{ width: `${Math.max(5, resumo?.campanha.percentualMetaSemanal || 0)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card 3: Seleção dos 20 Itens */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Seleção da Semana
            </span>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
              <Sparkles size={18} />
            </div>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-amber-600 dark:text-amber-400">
                {resumo?.progressoSelecao.aprovados || 0}
              </span>
              <span className="text-sm font-bold text-slate-400">/ 20 produtos</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {resumo?.progressoSelecao.completo 
                ? '✅ Meta de 20 produtos da semana atingida!'
                : `Faltam ${20 - (resumo?.progressoSelecao.aprovados || 0)} itens para fechar o lote`}
            </p>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
            <span>Itens pulados: <strong>{resumo?.progressoSelecao.pulados || 0}</strong></span>
            <span>Ativos no Digifarma: <strong>{itensAtivos.length}</strong></span>
          </div>
        </div>
      </div>

      {/* ─── ÁREA CENTRAL: FLUXO DE APROVAÇÃO "UM A UM" ─── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-md p-6 md:p-8">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg md:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Tag className="w-5 h-5 text-orange-500" />
              Aprovação Rápida: Um a Um
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Analise a sugestão a Preço de Custo + Simples (7%), ajuste se necessário e envie com 1 clique para o Digifarma.
            </p>
          </div>

          <div className="text-xs font-bold px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            Item {((resumo?.progressoSelecao.aprovados || 0) + 1)} de 20
          </div>
        </div>

        {loadingItem ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            <span className="text-xs font-bold text-slate-400">Minerando próximo produto parado há mais de 90 dias...</span>
          </div>
        ) : semCandidatos || !candidato ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={32} />
            </div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Todos os produtos disponíveis foram analisados!
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Você já analisou ou pulou os produtos parados elegíveis. Acompanhe a venda dos itens ativos abaixo ou reinicie a campanha.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header do Card do Produto */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300">
                    +{candidato.dias_parado} dias sem venda
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    {candidato.categoria}
                  </span>
                  {candidato.cod_barras && (
                    <span className="text-[11px] font-mono font-medium text-slate-400">
                      EAN: {candidato.cod_barras}
                    </span>
                  )}
                </div>

                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  {candidato.descricao}
                </h3>
                {candidato.apresentacao && (
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                    {candidato.apresentacao}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-4 shrink-0 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saldo Parado</div>
                  <div className="text-lg font-black text-slate-900 dark:text-white">{candidato.saldo} un</div>
                </div>
                <div className="w-px h-8 bg-slate-200 dark:bg-slate-800" />
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Imobilizado</div>
                  <div className="text-lg font-black text-red-600 dark:text-red-400">{fmt(candidato.valor_total_parado)}</div>
                </div>
              </div>
            </div>

            {/* Comparativo de Preço: Custo -> Normal -> Sugerido */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Preço de Custo */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                  1. Preço de Custo (Base)
                </div>
                <div className="text-xl font-bold text-slate-700 dark:text-slate-300">
                  {fmt(candidato.preco_custo)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Valor pago ao distribuidor
                </div>
              </div>

              {/* Preço Normal de Venda */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                  2. Preço Normal Atual
                </div>
                <div className="text-xl font-bold text-slate-400 line-through">
                  {fmt(candidato.preco_normal)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Preço padrão cadastrado
                </div>
              </div>

              {/* Preço Sugerido: Custo + Simples (7%) */}
              <div className="p-4 rounded-2xl border-2 border-orange-500 bg-orange-50/50 dark:bg-orange-950/20 relative overflow-hidden">
                <div className="absolute top-2 right-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-500 text-white uppercase">
                    Queima Máxima
                  </span>
                </div>
                <div className="text-xs font-black text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-1">
                  3. Sugestão (Custo + Simples)
                </div>
                <div className="text-2xl font-black text-orange-600 dark:text-orange-400">
                  {fmt(candidato.preco_sugerido)}
                </div>
                <div className="text-[11px] font-bold text-orange-700 dark:text-orange-300 mt-1 flex items-center gap-1">
                  <Percent size={12} />
                  Economia de {fmt(candidato.desconto_reais)} ({candidato.desconto_percentual}% OFF)
                </div>
              </div>
            </div>

            {/* Painel de Edição & Vigência */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
              {/* Ajustar Preço Promocional */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Preço Promocional a Aplicar (R$):</span>
                  {currentDiscountPercent > 0 && (
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                      {currentDiscountPercent}% de Desconto (-{fmt(currentDiscountReais)})
                    </span>
                  )}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold">
                    R$
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-lg font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="0.00"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomPrice(candidato.preco_sugerido.toFixed(2))}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 transition-colors"
                  >
                    Resetar p/ Sugerido ({fmt(candidato.preco_sugerido)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomPrice((candidato.preco_custo * 1.15).toFixed(2))}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 transition-colors"
                  >
                    Custo + 15% ({fmt(candidato.preco_custo * 1.15)})
                  </button>
                </div>
              </div>

              {/* Ajustar Vigência */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Válido até (Reversão Automática no Digifarma):</span>
                  <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                    <Clock size={12} /> 23:59:59
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={dataTermino}
                    onChange={(e) => setDataTermino(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + 3);
                      setDataTermino(d.toISOString().split('T')[0]);
                    }}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 transition-colors"
                  >
                    3 dias
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + 7);
                      setDataTermino(d.toISOString().split('T')[0]);
                    }}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 transition-colors"
                  >
                    7 dias (Padrão)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + 15);
                      setDataTermino(d.toISOString().split('T')[0]);
                    }}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 transition-colors"
                  >
                    15 dias
                  </button>
                </div>
              </div>
            </div>

            {/* Botões de Ação Final */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handlePular}
                disabled={skippingItem || savingItem}
                className="w-full sm:w-auto px-6 py-3.5 rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-750 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                {skippingItem ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4 text-slate-400" />}
                Pular / Trocar Produto
              </button>

              <button
                type="button"
                onClick={handleAceitar}
                disabled={savingItem || skippingItem}
                className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-emerald-600 hover:from-orange-600 hover:via-amber-600 hover:to-emerald-700 text-white text-sm font-black shadow-lg shadow-orange-500/25 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                {savingItem ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Gravando no Digifarma...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    Aceitar & Enviar ao Digifarma
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── TABELA DE ITENS ATIVOS NA CAMPANHA ─── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 md:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Package className="w-5 h-5 text-emerald-500" />
              Ofertas Ativas no Digifarma ({itensAtivos.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Produtos que já estão com o preço promocional vigente no PDV da BelaFarma.
            </p>
          </div>

          {itensAtivos.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPrintModal(true)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 transition-colors flex items-center gap-1.5"
              >
                <Printer size={14} />
                Gerar Etiquetas
              </button>
              <button
                onClick={handleCopiarWhatsApp}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-colors flex items-center gap-1.5"
              >
                <Copy size={14} />
                WhatsApp
              </button>
            </div>
          )}
        </div>

        {itensAtivos.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400 font-semibold">
            Nenhuma oferta ativa no momento. Comece aprovando os produtos sugeridos acima!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase tracking-wider font-bold">
                  <th className="pb-3">Produto</th>
                  <th className="pb-3 text-right">Saldo</th>
                  <th className="pb-3 text-right">De (Normal)</th>
                  <th className="pb-3 text-right">Por (Promo)</th>
                  <th className="pb-3 text-right">Desconto</th>
                  <th className="pb-3 text-center">Válido até</th>
                  <th className="pb-3 text-center">Digifarma</th>
                  <th className="pb-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {itensAtivos.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 pr-2">
                      <div className="font-bold text-slate-900 dark:text-white truncate max-w-xs md:max-w-md">
                        {item.descricao}
                      </div>
                      {item.apresentacao && (
                        <div className="text-[11px] text-slate-400 truncate max-w-xs">
                          {item.apresentacao}
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-right font-bold text-slate-700 dark:text-slate-300">
                      {item.saldo_estoque} un
                    </td>
                    <td className="py-3 text-right text-slate-400 line-through">
                      {fmt(item.preco_normal)}
                    </td>
                    <td className="py-3 text-right font-black text-orange-600 dark:text-orange-400 text-sm">
                      {fmt(item.preco_promocional)}
                    </td>
                    <td className="py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      {item.desconto_percentual}% OFF
                    </td>
                    <td className="py-3 text-center text-slate-500 dark:text-slate-400">
                      {item.data_termino ? item.data_termino.split('-').reverse().join('/') : '-'}
                    </td>
                    <td className="py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                        <Check size={10} /> Ativo
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      <button
                        onClick={() => handleReverter(item)}
                        disabled={revertingId === item.id}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                        title="Encerrar promoção e voltar ao preço original"
                      >
                        {revertingId === item.id ? (
                          <Loader2 size={14} className="animate-spin text-red-600" />
                        ) : (
                          <X size={14} />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── CARD DE ALERTA DE CARIMBO FINANCEIRO ─── */}
      <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs text-amber-900 dark:text-amber-200">
          <p className="font-bold">
            🔒 Regra de Blindagem Financeira BelaFarma:
          </p>
          <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
            Todo o dinheiro recebido das vendas desses itens promocionais tem destinação exclusiva: 
            <strong> amortização do Cheque Especial</strong>. Deposite no banco nas segundas, quartas e sextas 
            para estancar os juros e não utilize esse valor em compras adicionais de estoque até atingir o colchão de segurança.
          </p>
        </div>
      </div>

      {/* ─── MODAL DE IMPRESSÃO DE ETIQUETAS DE OFERTA RELÂMPAGO ─── */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600">
                  <Flame size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    Etiquetas de Oferta Relâmpago ({itensAtivos.length} itens)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Visualização pronta para impressão em papel comum A4 ou folhas adesivas.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-5 py-2.5 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-orange-500/25 active:scale-95 transition-all cursor-pointer"
                >
                  <Printer size={15} />
                  Imprimir Agora
                </button>
                <button
                  onClick={() => setShowPrintModal(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body: Pré-visualização da folha de etiquetas */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-100 dark:bg-slate-950">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 print:grid-cols-3 print:gap-3">
                {itensAtivos.map((item) => (
                  <div 
                    key={item.id}
                    className="p-4 rounded-2xl border-2 border-dashed border-red-500 bg-white text-slate-900 shadow-sm flex flex-col justify-between space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-red-100 pb-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-red-600 flex items-center gap-1">
                        <Flame size={12} className="fill-red-600" />
                        Oferta Relâmpago
                      </span>
                      <span className="text-[9px] font-bold bg-amber-400 text-slate-950 px-1.5 py-0.5 rounded font-mono">
                        {item.desconto_percentual}% OFF
                      </span>
                    </div>

                    <div>
                      <h4 className="text-xs font-black line-clamp-2 leading-tight uppercase">
                        {item.descricao}
                      </h4>
                      {item.apresentacao && (
                        <p className="text-[10px] text-slate-500 font-semibold line-clamp-1 mt-0.5">
                          {item.apresentacao}
                        </p>
                      )}
                    </div>

                    <div className="bg-red-50 p-2.5 rounded-xl text-center space-y-0.5">
                      <div className="text-[10px] text-slate-400 line-through font-bold">
                        De: {fmt(item.preco_normal)}
                      </div>
                      <div className="text-xl font-black text-red-600 leading-tight">
                        {fmt(item.preco_promocional)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 border-t border-slate-100 pt-2">
                      <span>BelaFarma</span>
                      <span>Válido até: {item.data_termino ? item.data_termino.split('-').reverse().join('/') : '-'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
