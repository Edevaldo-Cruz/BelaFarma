import React, { useState, useMemo } from 'react';
import { 
  Sparkles, 
  ShoppingCart, 
  Check, 
  Calendar, 
  Ban, 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw, 
  Copy, 
  TrendingUp, 
  Building2, 
  Layers, 
  Package, 
  AlertTriangle, 
  CheckCircle2, 
  ExternalLink,
  Plus,
  Minus,
  HelpCircle,
  Eye,
  ArrowRight
} from 'lucide-react';
import { useToast } from '../ToastContext';

export interface FaltaItem7d {
  produto_id: number;
  descricao: string;
  apresentacao: string;
  ean: string;
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

// Visual de Logo e Cores Institucionais por Distribuidora
export const DistribuidoraBadge: React.FC<{ nome?: string; isVencedor?: boolean }> = ({ nome, isVencedor = false }) => {
  if (!nome || nome === '—' || /não cotado|aguardando/i.test(nome)) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">
        <Building2 className="w-3.5 h-3.5 text-slate-500" />
        <span>Aguardando Cotação</span>
      </span>
    );
  }

  const u = nome.toUpperCase();
  let estilo = 'bg-slate-800 text-slate-200 border-slate-700';
  let dotCor = 'bg-cyan-400';

  if (u.includes('PROFARMA')) {
    estilo = 'bg-gradient-to-r from-blue-950 via-slate-900 to-amber-950/70 text-blue-200 border-blue-500/80 shadow-sm';
    dotCor = 'bg-blue-400';
  } else if (u.includes('DPC')) {
    estilo = 'bg-gradient-to-r from-sky-950 via-slate-900 to-emerald-950/70 text-sky-200 border-sky-500/80 shadow-sm';
    dotCor = 'bg-emerald-400';
  } else if (u.includes('DISTRIMED')) {
    estilo = 'bg-gradient-to-r from-teal-950 via-slate-900 to-rose-950/70 text-teal-200 border-teal-500/80 shadow-sm';
    dotCor = 'bg-rose-400';
  } else if (u.includes('DIVIMED')) {
    estilo = 'bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950/70 text-purple-200 border-purple-500/80 shadow-sm';
    dotCor = 'bg-purple-400';
  } else if (u.includes('SOTON')) {
    estilo = 'bg-gradient-to-r from-cyan-950 via-slate-900 to-blue-950/70 text-cyan-200 border-cyan-500/80 shadow-sm';
    dotCor = 'bg-cyan-400';
  } else if (u.includes('MARTINS')) {
    estilo = 'bg-gradient-to-r from-red-950 via-slate-900 to-amber-950/70 text-red-200 border-red-500/80 shadow-sm';
    dotCor = 'bg-red-400';
  } else if (u.includes('ORIENTE')) {
    estilo = 'bg-gradient-to-r from-emerald-950 via-slate-900 to-yellow-950/70 text-emerald-200 border-emerald-500/80 shadow-sm';
    dotCor = 'bg-amber-400';
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-black uppercase tracking-wider ${estilo}`}>
      <span className={`w-2 h-2 rounded-full ${dotCor} ${isVencedor ? 'animate-pulse' : ''}`} />
      <span className="truncate max-w-[140px]">{nome}</span>
      {isVencedor && (
        <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-500/30 text-emerald-300 border border-emerald-500/50">
          1º Menor Preço
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
  
  // Índice do produto atual no Carrossel
  const [indexAtual, setIndexAtual] = useState<number>(0);
  const [confirmarNuncaCotarModal, setConfirmarNuncaCotarModal] = useState<FaltaItem7d | null>(null);
  const [copiadoEan, setCopiadoEan] = useState<string | null>(null);
  const [historicoAcoes, setHistoricoAcoes] = useState<Array<{
    produtoId: number;
    tipo: 'comprar' | 'pular' | 'nunca_cotar';
    estadoAnterior: any;
  }>>([]);

  // Filtragem dos itens para o Carrossel: produtos com cotação real, não excluídos permanentemente nem adiados
  const itensDecisao = useMemo(() => {
    return faltas
      .filter(f => {
        // Excluir se marcado como não cotar ou adiado para próxima semana
        if (f.nao_cotar || f.is_adiado_proxima_semana) return false;
        // Exigir cotação válida encontrada
        const temCotacao = Boolean(f.preco_1 && f.preco_1 > 0 && f.fornecedor_1 && f.fornecedor_1 !== 'Sem Estoque (Portais)' && f.fornecedor_1 !== 'Não Cotado');
        return temCotacao;
      })
      .sort((a, b) => {
        // Ordem de Prioridade: P1 > P2 > P3 > P4, depois ranking_posicao, depois giro
        const prioridades: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };
        const pA = prioridades[a.prioridade || 'P4'] || 5;
        const pB = prioridades[b.prioridade || 'P4'] || 5;
        if (pA !== pB) return pA - pB;
        if (a.ranking_posicao && b.ranking_posicao) return a.ranking_posicao - b.ranking_posicao;
        return (b.vmd_ponderado || 0) - (a.vmd_ponderado || 0);
      });
  }, [faltas]);

  // Se o índice estiver fora dos limites (ex: filtros mudaram)
  const indexSeguro = Math.min(Math.max(0, indexAtual), Math.max(0, itensDecisao.length - 1));
  const produtoAtual = itensDecisao[indexSeguro] || null;

  // Totais acumulados da lista de compras aprovadas
  const resumoDecisao = useMemo(() => {
    let totalR$ = 0;
    let qtdItens = 0;
    const porDistribuidora: Record<string, { total: number; itens: number; pedidoMinimo: number }> = {};

    faltas.forEach(f => {
      if (itensSelecionados[f.produto_id]) {
        const preco = f.preco_1 || f.preco_ult_compra || f.custo_unitario || 0;
        const subtotal = (f.qtd_sugerida_7d || 1) * preco;
        totalR$ += subtotal;
        qtdItens += 1;

        const dist = (f.fornecedor_1 || 'Outros').toUpperCase();
        if (!porDistribuidora[dist]) {
          const portalCfg = portais.find(p => p.nome.toUpperCase() === dist);
          porDistribuidora[dist] = { total: 0, itens: 0, pedidoMinimo: portalCfg?.pedido_minimo || 0 };
        }
        porDistribuidora[dist].total += subtotal;
        porDistribuidora[dist].itens += 1;
      }
    });

    return { totalR$, qtdItens, porDistribuidora };
  }, [faltas, itensSelecionados, portais]);

  // Navegação do Carrossel
  const handleAnterior = () => {
    if (indexSeguro > 0) setIndexAtual(indexSeguro - 1);
  };

  const handleProximo = () => {
    if (indexSeguro < itensDecisao.length - 1) setIndexAtual(indexSeguro + 1);
  };

  // Copiar EAN
  const handleCopiarEan = (ean: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!ean) return;
    try {
      navigator.clipboard.writeText(ean);
      setCopiadoEan(ean);
      addToast(`EAN ${ean} copiado!`, 'success');
      setTimeout(() => setCopiadoEan(null), 2000);
    } catch {}
  };

  // 1. AÇÃO: Colocar no Carrinho do 1º Colocado (Comprar)
  const handleComprarItem = (item: FaltaItem7d) => {
    setItensSelecionados(prev => ({
      ...prev,
      [item.produto_id]: true
    }));

    setHistoricoAcoes(prev => [
      ...prev,
      {
        produtoId: item.produto_id,
        tipo: 'comprar',
        estadoAnterior: { selecionado: Boolean(itensSelecionados[item.produto_id]) }
      }
    ]);

    addToast(`✓ "${item.descricao.slice(0, 26)}..." colocado na lista de compra!`, 'success');
    handleProximo();
  };

  // 2. AÇÃO: Comprar no 2º Colocado
  const handleComprarNoSegundoColocado = (item: FaltaItem7d) => {
    if (!item.fornecedor_2 || !item.preco_2) return;
    onEscolherFornecedor(item.produto_id, 2);
    setItensSelecionados(prev => ({
      ...prev,
      [item.produto_id]: true
    }));

    addToast(`✓ Comprando na 2ª colocada (${item.fornecedor_2})!`, 'info');
    handleProximo();
  };

  // 3. AÇÃO: Pular esta Semana
  const handlePularSemana = async (item: FaltaItem7d) => {
    const proximaSegunda = new Date();
    proximaSegunda.setDate(proximaSegunda.getDate() + ((1 + 7 - proximaSegunda.getDay()) % 7 || 7));
    const dataStr = proximaSegunda.toISOString().slice(0, 10);

    // Remove da seleção se estava selecionado
    if (itensSelecionados[item.produto_id]) {
      setItensSelecionados(prev => ({ ...prev, [item.produto_id]: false }));
    }

    setHistoricoAcoes(prev => [
      ...prev,
      {
        produtoId: item.produto_id,
        tipo: 'pular',
        estadoAnterior: { adiar_ate: item.is_adiado_proxima_semana }
      }
    ]);

    await onAtualizarRegra(item, 'adiar_ate', dataStr);
    addToast(`⏭️ "${item.descricao.slice(0, 24)}..." pulado para a próxima semana!`, 'info');
  };

  // 4. AÇÃO: Nunca Mais Cotar (Exclusão Permanente)
  const handleConfirmarNuncaCotar = async () => {
    if (!confirmarNuncaCotarModal) return;
    const item = confirmarNuncaCotarModal;
    setConfirmarNuncaCotarModal(null);

    if (itensSelecionados[item.produto_id]) {
      setItensSelecionados(prev => ({ ...prev, [item.produto_id]: false }));
    }

    await onAtualizarRegra(item, 'nao_cotar', true);
    addToast(`🚫 "${item.descricao.slice(0, 24)}..." excluído permanentemente das cotações futuras!`, 'error');
  };

  // 5. AÇÃO: Desfazer Última Ação (Undo)
  const handleDesfazerUltimaAcao = () => {
    if (historicoAcoes.length === 0) return;
    const ultima = historicoAcoes[historicoAcoes.length - 1];
    setHistoricoAcoes(prev => prev.slice(0, -1));

    if (ultima.tipo === 'comprar') {
      setItensSelecionados(prev => ({ ...prev, [ultima.produtoId]: ultima.estadoAnterior.selecionado }));
      addToast('↩️ Ação desfeita.', 'info');
    }
  };

  // Cálculos de comparação de preço do item atual
  const preco1 = produtoAtual?.preco_1 || 0;
  const preco2 = produtoAtual?.preco_2 || 0;
  const precoUlt = Number(produtoAtual?.preco_ult_compra ?? produtoAtual?.custo_unitario ?? 0);
  const economizou = preco1 > 0 && precoUlt > 0 && preco1 < precoUlt;
  const diferencaReais = preco1 > 0 && precoUlt > 0 ? Number((precoUlt - preco1).toFixed(2)) : 0;
  const diffPct = preco1 > 0 && precoUlt > 0 ? Number((((preco1 - precoUlt) / precoUlt) * 100).toFixed(1)) : 0;
  const diff2Colocado = (preco1 > 0 && preco2 > preco1) ? Number((((preco2 - preco1) / preco1) * 100).toFixed(1)) : 0;
  const isNoCarrinho = produtoAtual ? Boolean(itensSelecionados[produtoAtual.produto_id]) : false;

  return (
    <div className="space-y-4 max-w-5xl mx-auto animate-in fade-in duration-300">
      
      {/* ─── BARRA SUPERIOR: RESUMO EXECUTIVO E PROGRESSO DA DECISÃO ─────────── */}
      <div className="bg-[#0b1322] border border-cyan-800/60 rounded-2xl p-3 sm:p-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Esquerda: Contador de Posição & Progresso */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-amber-600 to-rose-600 text-white shadow-md shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black uppercase text-white tracking-wide">
                  Decisão de Compras
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-950 text-cyan-300 border border-cyan-700">
                  {itensDecisao.length > 0 ? `${indexSeguro + 1} de ${itensDecisao.length}` : '0 itens'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">
                Avalie produto a produto: compre pelo menor preço, pule a semana ou exclua das cotações.
              </p>
            </div>
          </div>

          {/* Direita: Total Acumulado e Botão Ver Lista / Carrinhos */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="bg-[#070e1c] px-3 py-1.5 rounded-xl border border-slate-700 text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Aprovado</span>
              <span className="text-xs sm:text-sm font-black text-emerald-400">
                R$ {resumoDecisao.totalR$.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                <span className="text-slate-400 font-normal ml-1 text-[11px]">({resumoDecisao.qtdItens} itens)</span>
              </span>
            </div>

            <button
              type="button"
              onClick={onAbrirVerCarrinhos}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-black shadow-lg shadow-cyan-950/60 transition-all cursor-pointer active:scale-95"
            >
              <ShoppingCart className="w-4 h-4 text-cyan-200" />
              <span>🛒 Ver Lista & Criar Carrinhos</span>
            </button>
          </div>
        </div>

        {/* Barra de Progresso em Gradiente */}
        {itensDecisao.length > 0 && (
          <div className="w-full bg-slate-800/80 h-1.5 rounded-full overflow-hidden mt-3">
            <div 
              className="h-full bg-gradient-to-r from-amber-500 via-cyan-400 to-emerald-400 transition-all duration-300"
              style={{ width: `${Math.round(((indexSeguro + 1) / itensDecisao.length) * 100)}%` }}
            />
          </div>
        )}

        {/* Chips de Pedido Mínimo das Distribuidoras com Compras Aprovadas */}
        {Object.keys(resumoDecisao.porDistribuidora).length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-3 border-t border-slate-800/70 mt-3">
            <span className="text-[10px] font-black uppercase text-slate-400 shrink-0">
              Pedidos Mínimos:
            </span>
            {Object.entries(resumoDecisao.porDistribuidora).map(([dist, dados]) => {
              const bateu = dados.pedidoMinimo <= 0 || dados.total >= dados.pedidoMinimo;
              const falta = Math.max(0, dados.pedidoMinimo - dados.total);
              return (
                <div 
                  key={dist} 
                  className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-bold ${
                    bateu 
                      ? 'bg-emerald-950/70 text-emerald-300 border-emerald-600/80 shadow-xs' 
                      : 'bg-amber-950/70 text-amber-300 border-amber-600/80'
                  }`}
                >
                  <span className="font-black">{dist}:</span>
                  <span>R$ {dados.total.toFixed(0)}</span>
                  {dados.pedidoMinimo > 0 && (
                    <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-black/40">
                      {bateu ? '✓ Mín. OK' : `Faltam R$ ${falta.toFixed(0)}`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── CORPO PRINCIPAL DO CARROSSEL ────────────────────────────────────── */}
      {itensDecisao.length === 0 ? (
        <div className="bg-[#0b1322] border border-slate-800 rounded-3xl p-10 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-950/80 border border-emerald-500/60 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-black uppercase text-white">Nenhum produto pendente de decisão</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Todos os produtos com cotações ativas já foram decididos, colocados nos carrinhos ou pulados para a próxima semana!
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={onAbrirVerCarrinhos}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-black shadow-lg cursor-pointer"
            >
              🛒 Ver Carrinhos & Finalizar Compras
            </button>
            <button
              onClick={() => onNavegarTab('faltas')}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
            >
              Ver Tabela Completa de Reposição
            </button>
          </div>
        </div>
      ) : produtoAtual && (
        <div className="relative">
          {/* CARD CENTRAL DE DECISÃO */}
          <div className={`bg-gradient-to-b from-[#0e172a] via-[#0b1322] to-[#080e1a] rounded-3xl border shadow-2xl p-4 sm:p-6 transition-all duration-300 relative ${
            isNoCarrinho 
              ? 'border-cyan-500/80 ring-2 ring-cyan-500/40 shadow-cyan-950/50' 
              : 'border-slate-800 hover:border-slate-700'
          }`}>
            
            {/* Topo do Card: Prioridades, Categoria e Botão Desfazer */}
            <div className="flex items-center justify-between gap-2 mb-3.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                {produtoAtual.prioridade && (
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider border ${
                    produtoAtual.prioridade === 'P1'
                      ? 'bg-rose-950 text-rose-300 border-rose-600 animate-pulse'
                      : produtoAtual.prioridade === 'P2'
                      ? 'bg-amber-950 text-amber-300 border-amber-600'
                      : produtoAtual.prioridade === 'P3'
                      ? 'bg-blue-950 text-blue-300 border-blue-600'
                      : 'bg-slate-900 text-slate-400 border-slate-800'
                  }`}>
                    {produtoAtual.prioridade === 'P1' ? '🚨 P1 Ruptura Crítica' : produtoAtual.prioridade}
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-black border ${
                  produtoAtual.curva_abc === 'A'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
                    : produtoAtual.curva_abc === 'B'
                    ? 'bg-blue-950 text-blue-300 border-blue-600'
                    : 'bg-slate-900 text-slate-400 border-slate-700'
                }`}>
                  Curva {produtoAtual.curva_abc}
                </span>
                <span className="text-[10px] font-bold uppercase text-slate-400 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800">
                  {produtoAtual.tipo_categoria === 'MEDICAMENTO' ? 'Medicamento' : 'Perfumaria'}
                </span>
                {produtoAtual.is_desejado && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-400 animate-pulse">
                    ⭐ Desejado
                  </span>
                )}
                {produtoAtual.ranking_posicao && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-950 text-cyan-300 border border-cyan-800">
                    #{produtoAtual.ranking_posicao} no Ranking
                  </span>
                )}
              </div>

              {/* Botão Desfazer (Undo) */}
              {historicoAcoes.length > 0 && (
                <button
                  type="button"
                  onClick={handleDesfazerUltimaAcao}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition-all cursor-pointer border border-slate-700"
                  title="Desfazer a última decisão"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="hidden sm:inline">Desfazer</span>
                </button>
              )}
            </div>

            {/* Linha Principal: Foto do Produto + Dados Comerciais */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 pb-4 border-b border-slate-800/80">
              {/* Foto do Produto */}
              <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl bg-[#070d18] border-2 border-slate-700/80 flex items-center justify-center overflow-hidden shrink-0 shadow-inner p-2 relative group">
                <img
                  src={`/uploads/produtos/${produtoAtual.produto_id}.jpg`}
                  alt={produtoAtual.descricao}
                  className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-110"
                  onError={(e) => {
                    // Fallback para ícone estilizado se a foto física não existir no disco
                    (e.target as HTMLElement).style.display = 'none';
                    const fallback = e.currentTarget.nextElementSibling;
                    if (fallback) (fallback as HTMLElement).style.display = 'flex';
                  }}
                />
                <div className="hidden flex-col items-center justify-center text-slate-500 w-full h-full">
                  <Package className="w-10 h-10 text-cyan-500/60 mb-1" />
                  <span className="text-[10px] uppercase font-bold text-slate-500">Sem Foto</span>
                </div>
              </div>

              {/* Título e Apresentação */}
              <div className="flex-1 text-center sm:text-left space-y-1.5">
                <h3 className="text-base sm:text-lg font-black text-white leading-snug">
                  {produtoAtual.descricao}
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  {produtoAtual.apresentacao || 'Sem apresentação cadastrada'}
                </p>

                {/* Código EAN com Cópia Rápida */}
                {produtoAtual.ean && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={(e) => handleCopiarEan(produtoAtual.ean, e)}
                      className="inline-flex items-center gap-1.5 font-mono text-xs text-cyan-400 hover:text-cyan-200 bg-[#06101d] px-2.5 py-1 rounded-xl border border-cyan-900/60 transition-colors cursor-pointer"
                      title="Copiar código de barras EAN"
                    >
                      {copiadoEan === produtoAtual.ean ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>EAN: {produtoAtual.ean}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Grade 4 Colunas: Métricas de Giro & Estoque da Farmácia */}
            <div className="grid grid-cols-4 gap-2 my-4">
              {/* Saldo */}
              <div className="p-2 sm:p-2.5 rounded-2xl bg-[#070e1c] border border-slate-800 text-center">
                <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 block">Estoque Atual</span>
                <span className={`text-sm sm:text-base font-black ${
                  produtoAtual.saldo <= 0 ? 'text-rose-400 animate-pulse' : 'text-amber-300'
                }`}>
                  {produtoAtual.saldo} un
                </span>
                <span className="text-[9px] text-slate-500 block">
                  {produtoAtual.saldo <= 0 ? '⚠️ Zerado' : 'Em Loja'}
                </span>
              </div>

              {/* Cobertura */}
              <div className="p-2 sm:p-2.5 rounded-2xl bg-[#070e1c] border border-slate-800 text-center">
                <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 block">Cobertura</span>
                <span className={`text-sm sm:text-base font-bold ${
                  produtoAtual.dias_estoque_restante <= 0 ? 'text-rose-400 font-black' : 'text-slate-200'
                }`}>
                  {produtoAtual.dias_estoque_restante <= 0 ? '0 dias' : `${produtoAtual.dias_estoque_restante}d`}
                </span>
                <span className="text-[9px] text-slate-500 block">Autonomia</span>
              </div>

              {/* VMD (Venda Média Diária) */}
              <div className="p-2 sm:p-2.5 rounded-2xl bg-[#070e1c] border border-slate-800 text-center">
                <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 block">Giro Diário</span>
                <span className="text-sm sm:text-base font-bold text-cyan-300">
                  {produtoAtual.vmd_ponderado}
                </span>
                <span className="text-[9px] text-slate-500 block">VMD Ponderado</span>
              </div>

              {/* Vendas 30d */}
              <div className="p-2 sm:p-2.5 rounded-2xl bg-[#070e1c] border border-slate-800 text-center">
                <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 block">Saída 30d</span>
                <span className="text-sm sm:text-base font-bold text-emerald-300">
                  {produtoAtual.vendas_30d} un
                </span>
                <span className="text-[9px] text-slate-500 block">Último Mês</span>
              </div>
            </div>

            {/* Comparativo de Cotação Multi-Portais com Logos Oficiais */}
            <div className="bg-[#081020] rounded-2xl border border-slate-800 p-3.5 sm:p-4 space-y-3 mb-4">
              <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800">
                <span className="font-black uppercase tracking-wider text-cyan-300">
                  Disputa de Preços nos Portais
                </span>
                <span className="text-slate-400 text-[11px]">
                  Última Compra: <b className="text-amber-300">R$ {precoUlt.toFixed(2)}</b> ({produtoAtual.fornecedor_ult_compra || 'ERP'})
                </span>
              </div>

              {/* 1º Colocado (Vencedor) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-gradient-to-r from-emerald-950/60 via-[#0a1f1a] to-[#071512] border-2 border-emerald-500/80 shadow-md">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shrink-0">
                    <span className="text-base font-black">1º</span>
                  </div>
                  <div>
                    <DistribuidoraBadge nome={produtoAtual.fornecedor_1} isVencedor={true} />
                    {economizou && (
                      <span className="text-[11px] font-bold text-emerald-300 block mt-1">
                        Economiza <b>R$ {diferencaReais.toFixed(2)}</b> ({Math.abs(diffPct)}%) vs. última compra
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[10px] font-black uppercase text-emerald-400 block">Menor Preço Cotado</span>
                  <span className="text-xl sm:text-2xl font-black text-emerald-300">
                    R$ {preco1.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400 block">unidade líquida</span>
                </div>
              </div>

              {/* 2º Colocado (Opção para Direcionar Compra) */}
              {produtoAtual.fornecedor_2 && preco2 > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 px-3 rounded-xl bg-[#091122] border border-slate-800/90 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-black text-slate-400 px-2 py-0.5 rounded bg-slate-800">2º</span>
                    <DistribuidoraBadge nome={produtoAtual.fornecedor_2} isVencedor={false} />
                    <span className="text-[11px] text-slate-400">
                      R$ <b>{preco2.toFixed(2)}</b> {diff2Colocado > 0 && <span className="text-amber-400">(+{diff2Colocado}%)</span>}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleComprarNoSegundoColocado(produtoAtual)}
                    className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs transition-all cursor-pointer border border-slate-700"
                    title={`Comprar de ${produtoAtual.fornecedor_2} para ajudar a atingir o pedido mínimo`}
                  >
                    <span>Comprar no 2º Colocado</span>
                    <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
                  </button>
                </div>
              )}
            </div>

            {/* Seletor de Quantidade a Comprar & Subtotal */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-cyan-950/40 p-3 rounded-2xl border border-cyan-800/60 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase text-cyan-300">
                  Quantidade a Pedir (7 Dias):
                </span>
                <div className="flex items-center bg-[#070e1c] rounded-xl border border-cyan-700/80 p-0.5">
                  <button
                    type="button"
                    onClick={() => onAlterarQtd(produtoAtual.produto_id, Math.max(1, (produtoAtual.qtd_sugerida_7d || 1) - 1))}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-12 text-center text-sm font-black text-white">
                    {produtoAtual.qtd_sugerida_7d || 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => onAlterarQtd(produtoAtual.produto_id, (produtoAtual.qtd_sugerida_7d || 1) + 1)}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className="text-xs text-slate-400">unidades</span>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Subtotal Calculado</span>
                <span className="text-base sm:text-lg font-black text-white">
                  R$ {((produtoAtual.qtd_sugerida_7d || 1) * preco1).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* BOTÕES DE AÇÃO PRINCIPAIS (TOUCH FRIENDLY / CELULAR & PC) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-800/80">
              {/* Botão Primário: Comprar */}
              <button
                type="button"
                onClick={() => handleComprarItem(produtoAtual)}
                className={`flex items-center justify-center gap-2 py-3 px-4 rounded-2xl text-xs sm:text-sm font-black uppercase tracking-wider shadow-lg transition-all cursor-pointer active:scale-95 ${
                  isNoCarrinho
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-2 border-emerald-400 ring-2 ring-emerald-500/40 shadow-emerald-950/60'
                    : 'bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-cyan-950/60'
                }`}
              >
                <ShoppingCart className="w-4 h-4 text-white" />
                <span>{isNoCarrinho ? '✓ Já no Carrinho (Confirmar)' : `🛒 Comprar (${produtoAtual.fornecedor_1?.split(' ')[0] || '1º'})`}</span>
              </button>

              {/* Botão Secundário: Pular Semana */}
              <button
                type="button"
                onClick={() => handlePularSemana(produtoAtual)}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-[#091122] hover:bg-slate-800 text-amber-300 border border-amber-600/60 text-xs sm:text-sm font-black uppercase tracking-wider transition-all cursor-pointer shadow-md"
                title="Pula este produto e adia para a próxima semana"
              >
                <Calendar className="w-4 h-4 text-amber-400" />
                <span>⏭️ Pular Esta Semana</span>
              </button>

              {/* Botão Secundário: Nunca Mais Cotar */}
              <button
                type="button"
                onClick={() => setConfirmarNuncaCotarModal(produtoAtual)}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-[#140b12] hover:bg-rose-950/60 text-rose-300 border border-rose-700/60 text-xs sm:text-sm font-black uppercase tracking-wider transition-all cursor-pointer shadow-md"
                title="Exclui este produto permanentemente das futuras cotações de compras"
              >
                <Ban className="w-4 h-4 text-rose-400" />
                <span>🚫 Nunca Mais Cotar</span>
              </button>
            </div>

            {/* NAVEGAÇÃO DE SETAS INFERIORES */}
            <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-800/80 text-xs text-slate-400">
              <button
                type="button"
                onClick={handleAnterior}
                disabled={indexSeguro === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Card Anterior</span>
              </button>

              <span className="font-bold text-slate-400">
                Produto <b>{indexSeguro + 1}</b> de <b>{itensDecisao.length}</b>
              </span>

              <button
                type="button"
                onClick={handleProximo}
                disabled={indexSeguro >= itensDecisao.length - 1}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <span>Próximo Card</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DE CONFIRMAÇÃO: NUNCA MAIS COTAR ─────────────────────────── */}
      {confirmarNuncaCotarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#0e1626] border-2 border-rose-600/80 rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-950 text-rose-400 border border-rose-600">
                <Ban className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase text-white">Nunca Mais Cotar?</h3>
                <p className="text-xs text-slate-400">Exclusão permanente das futuras cotações</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-[#080d18] p-3 rounded-xl border border-slate-800">
              Você tem certeza de que deseja marcar <b>"{confirmarNuncaCotarModal.descricao}"</b> como <b>NÃO COTAR</b>? Ele será removido permanentemente dos robôs do BelaPed e não aparecerá nas próximas semanas.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmarNuncaCotarModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarNuncaCotar}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase cursor-pointer shadow-lg shadow-rose-950/60"
              >
                Confirmar e Excluir
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default BelaPedDecisaoTab;
