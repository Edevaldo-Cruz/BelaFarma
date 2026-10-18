import React, { useState, useMemo, useEffect } from 'react';
import { 
  ShoppingCart, 
  Check, 
  Calendar, 
  Ban, 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw, 
  Copy, 
  CheckCircle2, 
  Plus, 
  Minus, 
  ArrowRight,
  TrendingDown,
  Pill,
  Sparkles
} from 'lucide-react';
import { useToast } from '../ToastContext';

export interface FaltaItem7d {
  produto_id: number;
  descricao: string;
  apresentacao: string;
  ean: string;
  imagem_url?: string | null;
  curva_abc: string;
  saldo: number;
  vmd_ponderado: number;
  vendas_30d: number;
  dias_estoque_restante: number;
  custo_unitario: number;
  preco_ult_compra?: number;
  fornecedor_ult_compra: string;
  data_ult_compra: string;
  qtd_sugerida_7d: number;
  subtotal_7d: number;
  tipo_categoria: 'MEDICAMENTO' | 'PERFUMARIA';
  fornecedor_1?: string;
  preco_1?: number;
  url_produto_1?: string | null;
  fornecedor_2?: string;
  preco_2?: number;
  url_produto_2?: string | null;
  prioridade?: 'P1' | 'P2' | 'P3' | 'P4';
  nao_cotar?: boolean;
  nao_carrinho?: boolean;
  is_adiado_proxima_semana?: boolean;
  is_desejado?: boolean;
  ranking_posicao?: number;
  score_ranking?: number;
  falta_balcao_belinha?: any;
}

interface PortalInfo {
  id: string;
  nome: string;
  pedido_minimo: number;
  prazo_dias_padrao: number;
  prazos_boleto?: string;
}

interface Props {
  faltas: FaltaItem7d[];
  portais: PortalInfo[];
  itensSelecionados: Record<number, boolean>;
  setItensSelecionados: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  onAlterarQtd: (produtoId: number, novaQtd: number) => void;
  onEscolherFornecedor: (produtoId: number, posicao: 1 | 2) => void;
  onAtualizarRegra: (
    item: FaltaItem7d, 
    campo: 'nao_cotar' | 'nao_carrinho' | 'motivo_justificativa' | 'adiar_ate', 
    valor: any
  ) => Promise<void>;
  onAbrirVerCarrinhos: () => void;
  onNavegarTab: (tab: any) => void;
}

// Logo/Badge Visual das Distribuidoras (PROFARMA, DISTRIMED, DPC, SOTON, DIVIMED, MARTINS, ORIENTE)
export const DistribuidoraLogoClean: React.FC<{ nome?: string; isWinner?: boolean }> = ({ nome, isWinner = false }) => {
  if (!nome || nome === '—' || /não cotado|aguardando/i.test(nome)) {
    return <span className="text-xs text-slate-500 font-medium">— Sem cotação</span>;
  }

  const u = nome.toUpperCase();
  let brandName = nome;
  let bgIcon = 'bg-slate-700 text-white';
  let badgeBorder = 'border-slate-700 bg-slate-900/60 text-slate-200';
  let iconSvg = (
    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  );

  if (u.includes('PROFARMA')) {
    brandName = 'PROFARMA';
    bgIcon = 'bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-emerald-950/60';
    badgeBorder = 'border-emerald-500/50 bg-emerald-950/40 text-emerald-200';
    iconSvg = (
      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
        <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3z" />
      </svg>
    );
  } else if (u.includes('DISTRIMED')) {
    brandName = 'DISTRIMED';
    bgIcon = 'bg-gradient-to-br from-purple-500 to-indigo-700 text-white shadow-purple-950/60';
    badgeBorder = 'border-purple-500/50 bg-purple-950/40 text-purple-200';
    iconSvg = (
      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
        <path d="M4 3h8a9 9 0 0 1 9 9 9 9 0 0 1-9 9H4V3zm4 4v10h4a5 5 0 0 0 5-5 5 5 0 0 0-5-5H8z" />
      </svg>
    );
  } else if (u.includes('DPC')) {
    brandName = 'DPC DISTRIBUIDORA';
    bgIcon = 'bg-gradient-to-br from-blue-500 to-cyan-700 text-white shadow-blue-950/60';
    badgeBorder = 'border-blue-500/50 bg-blue-950/40 text-blue-200';
    iconSvg = (
      <svg className="w-3.5 h-3.5 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M3.6 9h16.8M3.6 15h16.8" />
      </svg>
    );
  } else if (u.includes('SOTON')) {
    brandName = 'SOTON FARMA';
    bgIcon = 'bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-black shadow-amber-950/60';
    badgeBorder = 'border-amber-500/50 bg-amber-950/40 text-amber-200';
    iconSvg = (
      <span className="text-[11px] font-black leading-none tracking-tighter">S</span>
    );
  } else if (u.includes('DIVIMED')) {
    brandName = 'DIVIMED';
    bgIcon = 'bg-gradient-to-br from-cyan-500 to-teal-700 text-white shadow-cyan-950/60';
    badgeBorder = 'border-cyan-500/50 bg-cyan-950/40 text-cyan-200';
    iconSvg = (
      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
        <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm1 12h-2v-3H8V9h3V6h2v3h3v2h-3v3z" />
      </svg>
    );
  } else if (u.includes('MARTINS')) {
    brandName = 'MARTINS ATACADO';
    bgIcon = 'bg-gradient-to-br from-orange-500 to-rose-600 text-white font-black shadow-orange-950/60';
    badgeBorder = 'border-orange-500/50 bg-orange-950/40 text-orange-200';
    iconSvg = (
      <span className="text-[10px] font-black leading-none tracking-tighter">M</span>
    );
  } else if (u.includes('ORIENTE')) {
    brandName = 'ORIENTE FARMA';
    bgIcon = 'bg-gradient-to-br from-indigo-500 to-violet-700 text-white shadow-indigo-950/60';
    badgeBorder = 'border-indigo-500/50 bg-indigo-950/40 text-indigo-200';
    iconSvg = (
      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2" />
      </svg>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl border ${badgeBorder} shadow-sm transition-all`}>
      <div className={`w-5 h-5 rounded-lg ${bgIcon} flex items-center justify-center shrink-0 shadow-sm`}>
        {iconSvg}
      </div>
      <span className="font-extrabold uppercase tracking-tight text-xs">
        {brandName}
      </span>
      {isWinner && (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
          <span>👑</span>
          <span className="hidden sm:inline">1º Menor</span>
        </span>
      )}
    </div>
  );
};

export const BelaPedDecisaoTab: React.FC<Props> = ({
  faltas,
  portais,
  itensSelecionados,
  setItensSelecionados,
  onAlterarQtd,
  onEscolherFornecedor,
  onAtualizarRegra,
  onAbrirVerCarrinhos,
  onNavegarTab
}) => {
  const { addToast } = useToast();
  
  const [indexAtual, setIndexAtual] = useState<number>(0);
  const [confirmarModal, setConfirmarModal] = useState<FaltaItem7d | null>(null);
  const [copiadoEan, setCopiadoEan] = useState<string | null>(null);
  const [historico, setHistorico] = useState<number[]>([]);

  // Filtra itens com cotação ativa que não estão excluídos permanentemente nem adiados
  const itens = useMemo(() => {
    return faltas
      .filter(f => {
        if (f.nao_cotar || f.is_adiado_proxima_semana) return false;
        return Boolean(f.preco_1 && f.preco_1 > 0 && f.fornecedor_1 && f.fornecedor_1 !== 'Sem Estoque (Portais)' && f.fornecedor_1 !== 'Não Cotado');
      })
      .sort((a, b) => {
        const prioridades: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };
        const pA = prioridades[a.prioridade || 'P4'] || 5;
        const pB = prioridades[b.prioridade || 'P4'] || 5;
        if (pA !== pB) return pA - pB;
        if (a.ranking_posicao && b.ranking_posicao) return a.ranking_posicao - b.ranking_posicao;
        return (b.vmd_ponderado || 0) - (a.vmd_ponderado || 0);
      });
  }, [faltas]);

  const index = Math.min(Math.max(0, indexAtual), Math.max(0, itens.length - 1));
  const item = itens[index] || null;

  // Resumo da compra aprovada
  const resumo = useMemo(() => {
    let total = 0;
    let qtd = 0;
    const distMap: Record<string, { total: number; min: number }> = {};

    faltas.forEach(f => {
      if (itensSelecionados[f.produto_id]) {
        const preco = f.preco_1 || f.preco_ult_compra || f.custo_unitario || 0;
        const sub = (f.qtd_sugerida_7d || 1) * preco;
        total += sub;
        qtd += 1;

        const dist = (f.fornecedor_1 || 'Outros').toUpperCase();
        if (!distMap[dist]) {
          const cfg = portais.find(p => p.nome.toUpperCase() === dist);
          distMap[dist] = { total: 0, min: cfg?.pedido_minimo || 0 };
        }
        distMap[dist].total += sub;
      }
    });

    return { total, qtd, distMap };
  }, [faltas, itensSelecionados, portais]);

  const handleProximo = () => {
    if (index < itens.length - 1) setIndexAtual(index + 1);
  };

  const handleAnterior = () => {
    if (index > 0) setIndexAtual(index - 1);
  };

  const handleCopiarEan = (ean: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!ean) return;
    try {
      navigator.clipboard.writeText(ean);
      setCopiadoEan(ean);
      addToast(`EAN ${ean} copiado!`, 'success');
      setTimeout(() => setCopiadoEan(null), 1800);
    } catch {}
  };

  const handleComprar = (alvo: FaltaItem7d) => {
    setItensSelecionados(prev => ({ ...prev, [alvo.produto_id]: true }));
    setHistorico(prev => [...prev, alvo.produto_id]);
    addToast(`✓ Item adicionado à lista de compras`, 'success');
    handleProximo();
  };

  const handleComprarSegundo = (alvo: FaltaItem7d) => {
    if (!alvo.fornecedor_2 || !alvo.preco_2) return;
    onEscolherFornecedor(alvo.produto_id, 2);
    setItensSelecionados(prev => ({ ...prev, [alvo.produto_id]: true }));
    setHistorico(prev => [...prev, alvo.produto_id]);
    addToast(`✓ Selecionado 2º colocado (${alvo.fornecedor_2})`, 'info');
    handleProximo();
  };

  const handlePular = async (alvo: FaltaItem7d) => {
    const proxSeg = new Date();
    proxSeg.setDate(proxSeg.getDate() + ((1 + 7 - proxSeg.getDay()) % 7 || 7));
    if (itensSelecionados[alvo.produto_id]) {
      setItensSelecionados(prev => ({ ...prev, [alvo.produto_id]: false }));
    }
    await onAtualizarRegra(alvo, 'adiar_ate', proxSeg.toISOString().slice(0, 10));
    addToast(`⏭️ Pulado para próxima semana`, 'info');
  };

  const handleNuncaCotarConfirmado = async () => {
    if (!confirmarModal) return;
    const alvo = confirmarModal;
    setConfirmarModal(null);
    if (itensSelecionados[alvo.produto_id]) {
      setItensSelecionados(prev => ({ ...prev, [alvo.produto_id]: false }));
    }
    await onAtualizarRegra(alvo, 'nao_cotar', true);
    addToast(`🚫 Excluído permanentemente de cotações`, 'error');
  };

  const handleDesfazer = () => {
    if (historico.length === 0) return;
    const ultimoId = historico[historico.length - 1];
    setHistorico(prev => prev.slice(0, -1));
    setItensSelecionados(prev => ({ ...prev, [ultimoId]: false }));
    addToast('↩️ Ação desfeita', 'info');
  };

  // Atalhos de teclado (Seta Esquerda / Seta Direita)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight') {
        if (index < itens.length - 1) setIndexAtual(prev => Math.min(prev + 1, itens.length - 1));
      } else if (e.key === 'ArrowLeft') {
        if (index > 0) setIndexAtual(prev => Math.max(prev - 1, 0));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [index, itens.length]);

  // Gestos de toque lateral (Swipe) para smartphones (ex: Galaxy S21)
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    if (diff > 50) {
      handleProximo();
    } else if (diff < -50) {
      handleAnterior();
    }
    setTouchStartX(null);
  };

  if (itens.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-12 px-6 text-center space-y-4 bg-[#0a0f1d] border border-slate-800 rounded-2xl">
        <div className="w-12 h-12 mx-auto rounded-full bg-emerald-950 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white">Todas as cotações foram revisadas</h3>
          <p className="text-xs text-slate-400 mt-1">
            Nenhum produto pendente de decisão nesta semana.
          </p>
        </div>
        <div className="pt-2 flex justify-center gap-3">
          <button
            onClick={onAbrirVerCarrinhos}
            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all cursor-pointer"
          >
            Ver Carrinhos ({resumo.qtd} itens)
          </button>
          <button
            onClick={() => onNavegarTab('faltas')}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
          >
            Ver Lista Geral
          </button>
        </div>
      </div>
    );
  }

  if (!item) return null;

  const preco1 = item.preco_1 || 0;
  const preco2 = item.preco_2 || 0;
  const precoUlt = Number(item.preco_ult_compra ?? item.custo_unitario ?? 0);
  const economizou = preco1 > 0 && precoUlt > 0 && preco1 < precoUlt;
  const diferencaReais = preco1 > 0 && precoUlt > 0 ? Number((precoUlt - preco1).toFixed(2)) : 0;
  const diffPct = preco1 > 0 && precoUlt > 0 ? Number((((preco1 - precoUlt) / precoUlt) * 100).toFixed(1)) : 0;
  const diff2Colocado = (preco1 > 0 && preco2 > preco1) ? Number((((preco2 - preco1) / preco1) * 100).toFixed(1)) : 0;
  const jaSelecionado = Boolean(itensSelecionados[item.produto_id]);

  return (
    <div className="max-w-3xl mx-auto space-y-3 pb-6 animate-in fade-in duration-200">
      
      {/* ─── TOPO MINIMALISTA: CONTADOR, RESUMO E AÇÃO DE CARRINHO ────────────── */}
      <div className="flex items-center justify-between px-1 py-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-300">
            {index + 1} de {itens.length}
          </span>
          <span className="text-slate-600">•</span>
          <span className="text-slate-400">
            Aprovados: <b className="text-white">{resumo.qtd}</b> (<b className="text-emerald-400">R$ {resumo.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b>)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {historico.length > 0 && (
            <button
              onClick={handleDesfazer}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer transition-colors px-2 py-1"
              title="Desfazer última decisão"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Desfazer</span>
            </button>
          )}

          <button
            onClick={onAbrirVerCarrinhos}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white font-semibold transition-all cursor-pointer border border-slate-700"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Ver Carrinho ({resumo.qtd})</span>
          </button>
        </div>
      </div>

      {/* Mini-linha com status dos pedidos mínimos (se houver seleções) */}
      {Object.keys(resumo.distMap).length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 text-[11px]">
          {Object.entries(resumo.distMap).map(([dist, d]) => {
            const ok = d.min <= 0 || d.total >= d.min;
            return (
              <span
                key={dist}
                className={`shrink-0 px-2 py-0.5 rounded-md border font-medium ${
                  ok
                    ? 'border-emerald-600/40 text-emerald-300 bg-emerald-950/20'
                    : 'border-slate-800 text-slate-400 bg-slate-900/40'
                }`}
              >
                {dist}: <b>R$ {d.total.toFixed(0)}</b> {d.min > 0 && (ok ? '✓' : `(faltam R$ ${(d.min - d.total).toFixed(0)})`)}
              </span>
            );
          })}
        </div>
      )}

      {/* Barra de Progresso Fina Minimalista */}
      <div className="w-full h-1 bg-slate-800/80 rounded-full overflow-hidden">
        <div 
          className="h-full bg-cyan-500 transition-all duration-300 ease-out"
          style={{ width: `${itens.length > 0 ? Math.round(((index + 1) / itens.length) * 100) : 0}%` }}
        />
      </div>

      {/* ─── CARD CENTRAL LIMPO & MINIMALISTA ─────────────────────────────────── */}
      <div 
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`bg-[#0c1322] border rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl transition-all ${
          jaSelecionado ? 'border-cyan-500/60 ring-1 ring-cyan-500/30' : 'border-slate-800'
        }`}
      >
        
        {/* Bloco Superior: Tags discretas e Categoria */}
        <div className="flex items-center justify-between text-[11px] gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {item.prioridade && (
              <span className={`px-2 py-0.5 rounded-md font-bold uppercase tracking-wide ${
                item.prioridade === 'P1'
                  ? 'bg-rose-950/80 text-rose-300 border border-rose-800/80'
                  : item.prioridade === 'P2'
                  ? 'bg-amber-950/80 text-amber-300 border border-amber-800/80'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}>
                {item.prioridade === 'P1' ? 'Crítico (P1)' : item.prioridade}
              </span>
            )}
            <span className="px-2 py-0.5 rounded-md font-semibold bg-slate-800/80 text-slate-300 border border-slate-700/60">
              Curva {item.curva_abc}
            </span>
            <span className="text-slate-500">
              {item.tipo_categoria === 'MEDICAMENTO' ? 'Medicamento' : 'Perfumaria'}
            </span>
          </div>

          {item.ean && (
            <button
              onClick={(e) => handleCopiarEan(item.ean, e)}
              className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
              title="Copiar código EAN"
            >
              {copiadoEan === item.ean ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{item.ean}</span>
            </button>
          )}
        </div>

        {/* Bloco Produto: Foto Real do Produto (25% do Card) + Informações */}
        <div className="flex items-start gap-3.5 sm:gap-4">
          <div className="w-[25%] aspect-square min-w-[95px] max-w-[160px] rounded-2xl bg-[#080d18] border border-slate-800/90 flex items-center justify-center p-2 shrink-0 overflow-hidden relative shadow-inner">
            {item.imagem_url ? (
              <img
                src={item.imagem_url}
                alt={item.descricao}
                className="w-full h-full object-contain p-0.5 drop-shadow-md"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                  const fb = e.currentTarget.nextElementSibling;
                  if (fb) (fb as HTMLElement).style.display = 'flex';
                }}
              />
            ) : null}
            <div className={`${item.imagem_url ? 'hidden' : 'flex'} flex-col items-center justify-center w-full h-full text-slate-500`}>
              {item.tipo_categoria === 'MEDICAMENTO' ? (
                <Pill className="w-10 h-10 text-cyan-400 stroke-[1.75]" />
              ) : (
                <Sparkles className="w-10 h-10 text-purple-400 stroke-[1.75]" />
              )}
              <span className="text-[10px] uppercase font-bold tracking-wider mt-1.5 text-slate-500">
                {item.tipo_categoria === 'MEDICAMENTO' ? 'Medicamento' : 'Perfumaria'}
              </span>
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            <h2 className="text-sm sm:text-base font-bold text-white leading-snug line-clamp-2">
              {item.descricao}
            </h2>
            <p className="text-xs text-slate-400 truncate">
              {item.apresentacao || 'Sem apresentação cadastrada'}
            </p>
            {item.ranking_posicao && (
              <span className="inline-block text-[10px] text-slate-500 font-medium">
                Giro/Ruptura #{item.ranking_posicao}
              </span>
            )}
          </div>
        </div>

        {/* Linha Minimalista de Estoque & Saídas (Sem caixas pesadas) */}
        <div className="grid grid-cols-4 gap-2 py-2 px-3 rounded-xl bg-[#080e1b] border border-slate-800/80 text-center text-xs">
          <div>
            <span className="text-[10px] text-slate-500 block uppercase">Estoque</span>
            <span className={`font-bold ${item.saldo <= 0 ? 'text-rose-400' : 'text-slate-200'}`}>
              {item.saldo} un
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block uppercase">Cobertura</span>
            <span className={`font-bold ${item.dias_estoque_restante <= 0 ? 'text-rose-400' : 'text-slate-200'}`}>
              {item.dias_estoque_restante}d
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block uppercase">Giro Diário</span>
            <span className="font-bold text-slate-200">
              {item.vmd_ponderado}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block uppercase">Vendas 30d</span>
            <span className="font-bold text-slate-200">
              {item.vendas_30d} un
            </span>
          </div>
        </div>

        {/* ─── COTAÇÃO DOS GANHADORES (DESIGN LIMPO) ───────────────────────────── */}
        <div className="space-y-2 pt-1">
          {/* 1º Colocado */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-[#091222] border border-emerald-500/40">
            <div className="flex items-center gap-2.5 min-w-0">
              <DistribuidoraLogoClean nome={item.fornecedor_1} isWinner={true} />
              {economizou && (
                <span className="hidden sm:inline-flex items-center gap-0.5 text-[11px] text-emerald-400 font-medium">
                  <TrendingDown className="w-3 h-3" />
                  <span>-R$ {diferencaReais.toFixed(2)} ({Math.abs(diffPct)}%)</span>
                </span>
              )}
            </div>

            <div className="text-right shrink-0">
              <span className="text-base sm:text-lg font-black text-emerald-300">
                R$ {preco1.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-500 block">/unidade</span>
            </div>
          </div>

          {/* 2º Colocado (Discreto) */}
          {item.fornecedor_2 && preco2 > 0 && (
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#080d1a] border border-slate-800/80 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 uppercase">2º:</span>
                <DistribuidoraLogoClean nome={item.fornecedor_2} isWinner={false} />
                <span className="text-slate-400 font-medium">
                  R$ {preco2.toFixed(2)} {diff2Colocado > 0 && <span className="text-slate-500">(+{diff2Colocado}%)</span>}
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleComprarSegundo(item)}
                className="text-xs text-slate-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer transition-colors font-medium"
                title={`Direcionar compra para ${item.fornecedor_2}`}
              >
                <span>Optar por este</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Referência Última Compra */}
          <div className="flex items-center justify-between px-1 text-[11px] text-slate-500">
            <span>Última Compra no ERP:</span>
            <span>
              {precoUlt > 0 ? `R$ ${precoUlt.toFixed(2)}` : '—'} {item.fornecedor_ult_compra ? `(${item.fornecedor_ult_compra})` : ''}
            </span>
          </div>
        </div>

        {/* ─── CONTROLE DE QUANTIDADE & VALOR ──────────────────────────────────── */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Pedir (7d):</span>
            <div className="flex items-center bg-[#080e1b] rounded-lg border border-slate-700/80 p-0.5">
              <button
                type="button"
                onClick={() => onAlterarQtd(item.produto_id, Math.max(1, (item.qtd_sugerida_7d || 1) - 1))}
                className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-10 text-center font-bold text-white text-xs">
                {item.qtd_sugerida_7d || 1}
              </span>
              <button
                type="button"
                onClick={() => onAlterarQtd(item.produto_id, (item.qtd_sugerida_7d || 1) + 1)}
                className="p-1 rounded text-slate-400 hover:text-white cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <span className="text-slate-500 text-[11px]">un</span>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-500 block uppercase">Subtotal</span>
            <span className="text-sm font-bold text-white">
              R$ {((item.qtd_sugerida_7d || 1) * preco1).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* ─── BOTÕES DE AÇÃO: PRINCIPAL + PLANOS ──────────────────────────────── */}
        <div className="pt-2 space-y-2">
          {/* Botão de Comprar */}
          <button
            type="button"
            onClick={() => handleComprar(item)}
            className={`w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.99] ${
              jaSelecionado
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-950/40'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>{jaSelecionado ? `✓ No Carrinho (${item.fornecedor_1?.split(' ')[0]}) - Confirmar` : `Comprar na ${item.fornecedor_1?.split(' ')[0] || '1ª'}`}</span>
          </button>

          {/* Botões Secundários Planos */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => handlePular(item)}
              className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              title="Adia o produto para próxima semana"
            >
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>Pular Semana</span>
            </button>

            <button
              type="button"
              onClick={() => setConfirmarModal(item)}
              className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-800/50 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              title="Exclui permanentemente das futuras cotações"
            >
              <Ban className="w-3.5 h-3.5 text-rose-400" />
              <span>Nunca Cotar</span>
            </button>
          </div>
        </div>

        {/* ─── NAVEGAÇÃO DE SETAS MINIMALISTA ──────────────────────────────────── */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs text-slate-400">
          <button
            type="button"
            onClick={handleAnterior}
            disabled={index === 0}
            className="flex items-center gap-1 py-1 px-2 rounded-lg hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            title="Item anterior (ou tecla ←)"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Anterior</span>
            <span className="hidden sm:inline text-[10px] text-slate-600 font-mono">←</span>
          </button>

          <span className="text-[11px] text-slate-500 font-medium">
            {index + 1} de {itens.length}
          </span>

          <button
            type="button"
            onClick={handleProximo}
            disabled={index >= itens.length - 1}
            className="flex items-center gap-1 py-1 px-2 rounded-lg hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            title="Próximo item (ou tecla →)"
          >
            <span className="hidden sm:inline text-[10px] text-slate-600 font-mono">→</span>
            <span>Próximo</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ─── MODAL DISCRETA: NUNCA MAIS COTAR ─────────────────────────────────── */}
      {confirmarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#0c1322] border border-slate-700 rounded-2xl p-5 max-w-sm w-full space-y-3 text-slate-100 shadow-2xl">
            <h3 className="text-sm font-bold text-white">Nunca mais cotar este item?</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              <b>"{confirmarModal.descricao}"</b> será removido permanentemente das futuras cotações automáticas.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmarModal(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleNuncaCotarConfirmado}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default BelaPedDecisaoTab;
