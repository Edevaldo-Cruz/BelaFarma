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
  X,
  Eye,
  Filter
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
  preco_tabela?: number;
  preco_normal: number; // Preço vigente efetivo (R$ 5,00 se em promoção)
  tem_promocao_ativa?: boolean;
  preco_promocional_atual?: number;
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

// Helper para calcular último dia do mês que vem
const getFimMesQueVem = () => {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = agora.getMonth();
  const ultimoDia = new Date(ano, mes + 2, 0);
  const yyyy = ultimoDia.getFullYear();
  const mm = String(ultimoDia.getMonth() + 1).padStart(2, '0');
  const dd = String(ultimoDia.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

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

  // Filtro de Categoria
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('TODOS');

  // Controle de visualização da etiqueta
  const [mostrarEtiqueta, setMostrarEtiqueta] = useState<boolean>(true);

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

  // 2. Carrega Próximo Candidato com filtro opcional de categoria
  const fetchProximoCandidato = useCallback(async (cat?: string) => {
    setLoadingItem(true);
    setSemCandidatos(false);
    try {
      const categoriaAtiva = cat !== undefined ? cat : categoriaFiltro;
      const url = categoriaAtiva && categoriaAtiva !== 'TODOS'
        ? `/api/liquidacao/proximo-item?categoria=${encodeURIComponent(categoriaAtiva)}`
        : '/api/liquidacao/proximo-item';

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.disponivel && data.produto) {
          setCandidato(data.produto);
          setCustomPrice(data.produto.preco_sugerido.toFixed(2));
          setDataTermino(data.produto.vigencia_padrao.data_termino || getFimMesQueVem());
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
  }, [categoriaFiltro]);

  const handleTrocarCategoria = (novaCat: string) => {
    setCategoriaFiltro(novaCat);
    fetchProximoCandidato(novaCat);
  };

  // Impressão individual da etiqueta do produto atual
  const imprimirEtiquetaAtual = () => {
    if (!candidato) return;
    const printWindow = window.open('', '_blank', 'width=500,height=550');
    if (!printWindow) {
      window.print();
      return;
    }
    const valFinal = parseFloat(customPrice.replace(',', '.')) || candidato.preco_sugerido;
    const descPct = candidato.preco_normal > 0 ? Math.round(((candidato.preco_normal - valFinal) / candidato.preco_normal) * 100) : 0;
    const validadeFormatada = dataTermino ? dataTermino.split('-').reverse().join('/') : '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Etiqueta de Oferta - ${candidato.descricao}</title>
        <style>
          @page { size: auto; margin: 10mm; }
          body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 20px; display: flex; justify-content: center; }
          .tag-card {
            width: 320px;
            border: 3px solid #dc2626;
            border-radius: 14px;
            padding: 16px;
            text-align: center;
            box-sizing: border-box;
            background: #fff;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          }
          .tag-header {
            background: #dc2626;
            color: #fff;
            padding: 8px 10px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 12px;
          }
          .tag-title {
            font-size: 15px;
            font-weight: 900;
            color: #111827;
            line-height: 1.2;
            margin: 6px 0;
            text-transform: uppercase;
          }
          .tag-sub {
            font-size: 11px;
            font-weight: 600;
            color: #4b5563;
            margin-bottom: 8px;
          }
          .tag-box {
            background: #fef2f2;
            border-radius: 10px;
            padding: 12px;
            margin: 12px 0;
            border: 2px dashed #ef4444;
          }
          .tag-de {
            font-size: 13px;
            color: #6b7280;
            text-decoration: line-through;
            font-weight: bold;
          }
          .tag-por-label {
            font-size: 11px;
            font-weight: 900;
            color: #dc2626;
            text-transform: uppercase;
            margin-top: 4px;
          }
          .tag-por {
            font-size: 36px;
            font-weight: 900;
            color: #dc2626;
            line-height: 1;
            margin: 4px 0;
          }
          .tag-badge {
            display: inline-block;
            background: #f59e0b;
            color: #111827;
            font-weight: 900;
            font-size: 12px;
            padding: 3px 10px;
            border-radius: 6px;
            margin-top: 4px;
          }
          .tag-footer {
            border-top: 1px solid #e5e7eb;
            padding-top: 10px;
            font-size: 10px;
            color: #6b7280;
            display: flex;
            justify-content: space-between;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="tag-card">
          <div class="tag-header">🔥 OFERTA RELÂMPAGO 🔥</div>
          <div class="tag-title">${candidato.descricao}</div>
          ${candidato.apresentacao ? `<div class="tag-sub">${candidato.apresentacao}</div>` : ''}
          <div class="tag-box">
            <div class="tag-de">DE: R$ ${candidato.preco_normal.toFixed(2).replace('.', ',')}</div>
            <div class="tag-por-label">POR APENAS</div>
            <div class="tag-por">R$ ${valFinal.toFixed(2).replace('.', ',')}</div>
            ${descPct > 0 ? `<div class="tag-badge">${descPct}% DE DESCONTO</div>` : ''}
          </div>
          <div class="tag-footer">
            <span>DROGARIA BELAFARMA</span>
            <span>VÁLIDO ATÉ: ${validadeFormatada}</span>
          </div>
          ${candidato.cod_barras ? `<div style="font-size: 9px; color: #9ca3af; margin-top: 6px; font-family: monospace;">EAN: ${candidato.cod_barras} | CÓD: ${candidato.produto_id}</div>` : ''}
        </div>
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

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
            Selecione quantos produtos desejar para liquidar o estoque parado há mais de 90 dias (sem limite semanal).
            O preço promocional é gravado diretamente no <strong>Digifarma Firebird</strong> com vigência até o 
            <strong> último dia do mês que vem</strong>, transformando estoque imobilizado em dinheiro limpo para <strong>zerar o Cheque Especial</strong>.
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

        {/* Card 3: Seleção sem limite */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Produtos na Liquidação
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
              <span className="text-sm font-bold text-slate-400">produtos aprovados</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              🔥 Queima contínua sem limite semanal — liquide o máximo possível!
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg md:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Tag className="w-5 h-5 text-orange-500" />
              Aprovação Rápida: Um a Um
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Analise a sugestão a Preço de Custo + Simples (7%), ajuste se necessário e envie com 1 clique para o Digifarma.
            </p>
          </div>

          <div className="text-xs font-bold px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 self-start sm:self-auto">
            {resumo?.progressoSelecao.aprovados || 0} aprovados (Sem limite)
          </div>
        </div>

        {/* ─── BARRA DE FILTRO POR CATEGORIA ─── */}
        <div className="mb-6 pb-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Filtrar por Categoria:
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'TODOS', label: 'Todos os Produtos', icon: '📦' },
              { id: 'PERFUMARIA', label: 'Perfumaria & Higiene', icon: '🧴' },
              { id: 'GENERICO', label: 'Genéricos', icon: '💊' },
              { id: 'MARCA', label: 'Medicamentos Marca/Ref.', icon: '🏷️' },
              { id: 'SIMILAR', label: 'Similares', icon: '🔬' },
              { id: 'OUTROS', label: 'Outros', icon: '✨' },
            ].map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleTrocarCategoria(cat.id)}
                disabled={loadingItem}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  categoriaFiltro === cat.id
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25 scale-[1.02]'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
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

            {/* Comparativo de Preço: Custo -> Vigente (Promocional/Normal) -> Sugerido */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Preço de Custo Real Unitário */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                  1. Preço de Custo Unitário
                </div>
                <div className="text-xl font-bold text-slate-700 dark:text-slate-300">
                  {fmt(candidato.preco_custo)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Custo real por unidade/blister
                </div>
              </div>

              {/* Preço de Venda Vigente no Digifarma */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 relative">
                {candidato.tem_promocao_ativa && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Promoção Ativa
                  </span>
                )}
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                  2. Preço Vigente no Digifarma
                </div>
                <div className="text-xl font-black text-slate-800 dark:text-white">
                  {fmt(candidato.preco_normal)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
                  {candidato.preco_tabela && candidato.preco_tabela > candidato.preco_normal && (
                    <span>Tabela: <span className="line-through">{fmt(candidato.preco_tabela)}</span></span>
                  )}
                  <span>(Preço cobrado hoje no PDV)</span>
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
                  3. Nova Sugestão (Custo + Simples)
                </div>
                <div className="text-2xl font-black text-orange-600 dark:text-orange-400">
                  {fmt(candidato.preco_sugerido)}
                </div>
                <div className="text-[11px] font-bold text-orange-700 dark:text-orange-300 mt-1 flex items-center gap-1">
                  <Percent size={12} />
                  Economia de {fmt(candidato.desconto_reais)} ({candidato.desconto_percentual}% abaixo do preço atual)
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
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setDataTermino(getFimMesQueVem())}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 hover:bg-orange-200 transition-colors"
                  >
                    Fim do Mês que Vem (Padrão)
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
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + 30);
                      setDataTermino(d.toISOString().split('T')[0]);
                    }}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 transition-colors"
                  >
                    30 dias
                  </button>
                </div>
              </div>
            </div>

            {/* ─── PRÉ-VISUALIZAÇÃO DA ETIQUETA DE OFERTA / GÔNDOLA ─── */}
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600">
                    <Tag size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      Etiqueta de Preço de Gôndola / Balcão
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                        Ao Vivo
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Veja em tempo real como a etiqueta de oferta física será impressa para colar na prateleira ou produto.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMostrarEtiqueta(!mostrarEtiqueta)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Eye size={13} />
                    {mostrarEtiqueta ? 'Ocultar Prévia' : 'Ver Etiqueta'}
                  </button>

                  <button
                    type="button"
                    onClick={imprimirEtiquetaAtual}
                    className="px-4 py-1.5 rounded-xl text-xs font-black bg-amber-400 hover:bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer size={13} />
                    Imprimir Esta Etiqueta
                  </button>
                </div>
              </div>

              {mostrarEtiqueta && (
                <div className="flex justify-center p-4 bg-slate-200/60 dark:bg-slate-950 rounded-2xl">
                  {/* Cartão de Etiqueta Física */}
                  <div className="w-full max-w-sm bg-white text-slate-900 border-2 border-red-600 rounded-2xl shadow-xl p-5 text-center flex flex-col justify-between relative overflow-hidden transition-all duration-200">
                    <div className="bg-red-600 text-white py-1 px-3 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 mb-3">
                      <Flame size={14} className="fill-white animate-pulse" />
                      OFERTA RELÂMPAGO BELAFARMA
                    </div>

                    <div className="space-y-1 mb-3">
                      <h3 className="text-base font-black uppercase leading-tight line-clamp-2 text-slate-900">
                        {candidato.descricao}
                      </h3>
                      {candidato.apresentacao && (
                        <p className="text-xs font-semibold text-slate-500">
                          {candidato.apresentacao}
                        </p>
                      )}
                    </div>

                    <div className="bg-red-50/90 border border-red-200 rounded-xl p-3 my-2 space-y-1">
                      <div className="text-xs font-bold text-slate-400 line-through">
                        DE: {fmt(candidato.preco_normal)}
                      </div>
                      <div className="text-[10px] font-black uppercase text-red-600 tracking-wider">
                        POR APENAS:
                      </div>
                      <div className="text-3xl font-black text-red-600 tracking-tight">
                        {fmt(parsedPrice || candidato.preco_sugerido)}
                      </div>
                      {currentDiscountPercent > 0 && (
                        <div className="inline-block bg-amber-400 text-slate-950 text-[11px] font-black px-2.5 py-0.5 rounded-md mt-1">
                          ECONOMIZE {fmt(currentDiscountReais)} ({currentDiscountPercent}% OFF)
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] font-bold text-slate-500">
                      <span>DROGARIA BELAFARMA</span>
                      <span>ATÉ {dataTermino ? dataTermino.split('-').reverse().join('/') : '-'}</span>
                    </div>

                    {candidato.cod_barras && (
                      <div className="mt-2 text-[9px] font-mono text-slate-400 flex items-center justify-center gap-2">
                        <span>EAN: {candidato.cod_barras}</span>
                        <span>•</span>
                        <span>CÓD: #{candidato.produto_id}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
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
