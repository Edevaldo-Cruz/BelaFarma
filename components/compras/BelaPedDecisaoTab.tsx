import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  Sparkles,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  Zap,
  X,
  CheckSquare,
  Square,
  PackageCheck,
  FileSpreadsheet,
  Download,
  Printer,
  Lock,
  Unlock
} from 'lucide-react';
import { useToast } from '../ToastContext';

export interface CotacaoRealItem {
  distribuidora: string;
  preco: number;
  url_produto?: string | null;
  condicao_comercial?: string | null;
}

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
  nf_ult_compra?: string;
  qtd_ult_compra?: number | null;
  embalagem_ult_compra?: string;
  qtd_sugerida_7d: number;
  subtotal_7d: number;
  tipo_categoria: 'MEDICAMENTO' | 'PERFUMARIA';
  fornecedor_1?: string;
  preco_1?: number;
  url_produto_1?: string | null;
  fornecedor_2?: string;
  preco_2?: number;
  url_produto_2?: string | null;
  fornecedor_2_ref?: string | null;
  preco_2_ref?: number;
  todas_cotacoes_reais?: CotacaoRealItem[];
  prioridade?: 'P1' | 'P2' | 'P3' | 'P4';
  nao_cotar?: boolean;
  nao_carrinho?: boolean;
  is_adiado_proxima_semana?: boolean;
  is_enviado_carrinho_semana?: boolean;
  enviado_carrinho_ate?: string | null;
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

export interface GrupoDistribuidoraResumo {
  distribuidora: string;
  total: number;
  min: number;
  atingiuMinimo: boolean;
  faltaParaMinimo: number;
  itens: FaltaItem7d[];
}

interface Props {
  faltas: FaltaItem7d[];
  portais: PortalInfo[];
  itensSelecionados: Record<number, boolean>;
  setItensSelecionados: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  onAlterarQtd: (produtoId: number, novaQtd: number) => void;
  onEscolherFornecedor: (
    produtoId: number,
    posicao: 1 | 2,
    fornecedorOverride?: string,
    precoOverride?: number,
    urlOverride?: string | null
  ) => void;
  onAtualizarRegra: (
    item: FaltaItem7d, 
    campo: 'nao_cotar' | 'nao_carrinho' | 'motivo_justificativa' | 'adiar_ate', 
    valor: any
  ) => Promise<void>;
  onAbrirVerCarrinhos: () => void;
  onNavegarTab: (tab: any) => void;
  onRecarregarDados?: () => Promise<void> | void;
}

const MINIMOS_PADRAO_PORTAL: Record<string, number> = {
  'PROFARMA': 150,
  'DISTRIMED': 350,
  'DPC DISTRIBUIDORA': 300,
  'SOTON FARMA': 300,
  'DIVIMED': 400,
  'MARTINS ATACADO': 200,
  'ORIENTE FARMA': 150
};

function normalizarNomeDistribuidora(nome?: string): string {
  const u = (nome || '').toUpperCase().trim();
  if (u.includes('PROFARMA')) return 'PROFARMA';
  if (u.includes('DISTRIMED')) return 'DISTRIMED';
  if (u.includes('DPC')) return 'DPC DISTRIBUIDORA';
  if (u.includes('SOTON')) return 'SOTON FARMA';
  if (u.includes('DIVIMED')) return 'DIVIMED';
  if (u.includes('MARTINS')) return 'MARTINS ATACADO';
  if (u.includes('ORIENTE')) return 'ORIENTE FARMA';
  return u || 'OUTROS';
}

function obterEndpointsCarrinhoPortal(distribuidora: string): { postUrl: string; statusUrl: string } | null {
  const u = distribuidora.toUpperCase();
  if (u.includes('SOTON')) return { postUrl: '/api/belaped/montar-carrinho-soton', statusUrl: '/api/belaped/status-carrinho-soton' };
  if (u.includes('DIVIMED')) return { postUrl: '/api/belaped/montar-carrinho-divimed', statusUrl: '/api/belaped/status-carrinho-divimed' };
  if (u.includes('DISTRIMED')) return { postUrl: '/api/belaped/importar-carrinho-distrimed', statusUrl: '/api/belaped/status-carrinho-distrimed' };
  if (u.includes('DPC')) return { postUrl: '/api/belaped/montar-carrinho-dpc', statusUrl: '/api/belaped/status-carrinho-dpc' };
  if (u.includes('PROFARMA')) return { postUrl: '/api/belaped/montar-carrinho-profarma', statusUrl: '/api/belaped/status-carrinho-profarma' };
  if (u.includes('MARTINS')) return { postUrl: '/api/belaped/montar-carrinho-martins', statusUrl: '/api/belaped/status-carrinho-martins' };
  if (u.includes('ORIENTE')) return { postUrl: '/api/belaped/montar-carrinho-oriente', statusUrl: '/api/belaped/status-carrinho-oriente' };
  if (u.includes('PANPHARMA') || u.includes('PANFARMA')) return { postUrl: '/api/belaped/montar-carrinho-panpharma', statusUrl: '/api/belaped/status-carrinho-panpharma' };
  return null;
}

export function obterUrlConferenciaPortal(item: FaltaItem7d, colocacao: 1 | 2 = 1): string | null {
  const urlDireta = colocacao === 1 ? item.url_produto_1 : item.url_produto_2;
  if (urlDireta && typeof urlDireta === 'string' && urlDireta.startsWith('http')) {
    const urlsCruas = [
      'https://pedido.profarma.com.br/',
      'https://pedido.profarma.com.br',
      'https://inovacao.distrimed.com.br/produtos',
      'https://inovacao.distrimed.com.br/produtos/',
      'https://divimed.artpedidoweb.com.br/#/comprar',
      'https://divimed.artpedidoweb.com.br/#/',
      'https://divimed.artpedidoweb.com.br',
      'https://www.orientefarma.com.br/',
      'https://www.orientefarma.com.br'
    ];
    if (!urlsCruas.includes(urlDireta.trim())) {
      return urlDireta;
    }
  }

  const fornecedor = (colocacao === 1 ? item.fornecedor_1 : item.fornecedor_2 || '').toUpperCase();
  if (!fornecedor || fornecedor === 'NÃO COTADO' || fornecedor.includes('SEM ESTOQUE') || fornecedor.includes('AGUARDANDO')) {
    return null;
  }

  const termo = item.ean || encodeURIComponent(item.descricao);
  if (fornecedor.includes('PROFARMA')) return `https://pedido.profarma.com.br/novo-pedido?q=${termo}`;
  if (fornecedor.includes('SOTON')) return `https://sotonfarma.meuspedidos.com.br/?busca=${termo}`;
  if (fornecedor.includes('DPC')) return `https://dpcnet.com.br/catalogo?busca=${termo}&visualizacao=bloco-1&ordenacao=ordem-0`;
  if (fornecedor.includes('MARTINS')) return `https://www.martinsatacado.com.br/busca?q=${termo}`;
  if (fornecedor.includes('DISTRIMED')) return `https://inovacao.distrimed.com.br/produtos?pesquisa=${termo}`;
  if (fornecedor.includes('DIVIMED')) return `https://divimed.artpedidoweb.com.br/#/comprar?busca=${termo}`;
  if (fornecedor.includes('ORIENTE')) return `https://www.orientefarma.com.br/produtos?busca=${termo}`;
  return null;
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
  onNavegarTab,
  onRecarregarDados
}) => {
  const { addToast } = useToast();
  
  const [indexAtual, setIndexAtual] = useState<number>(0);
  const [confirmarModal, setConfirmarModal] = useState<FaltaItem7d | null>(null);
  const [copiadoEan, setCopiadoEan] = useState<string | null>(null);
  const [historico, setHistorico] = useState<number[]>([]);

  // Cache local de imagens buscadas sob demanda e controle de falhas
  const [imagensResolvidas, setImagensResolvidas] = useState<Record<number, string>>({});
  const [buscandoImagemIds, setBuscandoImagemIds] = useState<Record<number, boolean>>({});
  const [imagensComErro, setImagensComErro] = useState<Record<number, boolean>>({});
  const tentadosRef = useRef<Set<number>>(new Set());

  // Produtos confirmados no carrinho durante esta sessão (ocultados imediatamente dos cards da semana)
  const [idsAdicionadosSemanaSessao, setIdsAdicionadosSemanaSessao] = useState<Record<number, boolean>>({});

  // Modal de Finalizar Procedimento (Montagem de Carrinhos nos Portais + Sugestões de Pedido Mínimo)
  const [modalFinalizarOpen, setModalFinalizarOpen] = useState<boolean>(false);
  const [portaisMarcadosFinalizar, setPortaisMarcadosFinalizar] = useState<Record<string, boolean>>({});
  const [executandoCarrinhos, setExecutandoCarrinhos] = useState<boolean>(false);
  const [progressoPortais, setProgressoPortais] = useState<Record<string, {
    status: 'AGUARDANDO' | 'EXECUTANDO' | 'CONCLUIDO' | 'ERRO';
    atual: number;
    total: number;
    sucessos: number;
    erros: number;
    mensagem: string;
  }>>({});

  // Sugestões inteligentes de Curva A zerada (ERP Digifarma) para atingir pedido mínimo
  const [curvaASugestoesPorDist, setCurvaASugestoesPorDist] = useState<Record<string, Array<{
    produto_id: number;
    descricao: string;
    apresentacao?: string | null;
    ean: string;
    curva_abc: string;
    saldo: number;
    vmd_ponderado: number;
    preco_portal: number;
    fornecedor: string;
    url_produto?: string | null;
    qtd_sugerida: number;
    subtotal: number;
  }>>>({});
  const [carregandoCurvaA, setCarregandoCurvaA] = useState<Record<string, boolean>>({});
  const [abaSugestaoPorDist, setAbaSugestaoPorDist] = useState<Record<string, 'curva_a' | 'semanal'>>({});

  // Itens extras de Curva A incorporados aos carrinhos para atingir o pedido mínimo
  const [itensCurvaAAdicionados, setItensCurvaAAdicionados] = useState<Array<{
    produto_id: number;
    descricao: string;
    apresentacao?: string | null;
    ean: string;
    curva_abc: string;
    saldo: number;
    vmd_ponderado: number;
    distribuidora: string;
    quantidade: number;
    precoUnitario: number;
    subtotal: number;
    url_produto?: string | null;
  }>>([]);

  // Filtra itens com cotação ativa que não estão excluídos permanentemente, nem adiados, nem já enviados ao carrinho na semana atual
  const itens = useMemo(() => {
    return faltas
      .filter(f => {
        if (f.nao_cotar || f.is_adiado_proxima_semana || f.is_enviado_carrinho_semana || idsAdicionadosSemanaSessao[f.produto_id]) {
          return false;
        }
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
  }, [faltas, idsAdicionadosSemanaSessao]);

  const index = Math.min(Math.max(0, indexAtual), Math.max(0, itens.length - 1));
  const item = itens[index] || null;

  // Busca automática de imagens para o item atual e os próximos 3 itens da fila se não tiverem foto
  const solicitarBuscaImagem = async (alvo: FaltaItem7d, forcar = false) => {
    if (!alvo) return;
    if (!forcar && tentadosRef.current.has(alvo.produto_id)) return;
    tentadosRef.current.add(alvo.produto_id);
    setBuscandoImagemIds(prev => ({ ...prev, [alvo.produto_id]: true }));
    try {
      const res = await fetch('/api/belaped/buscar-imagem-produto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ean: alvo.ean,
          descricao: alvo.descricao,
          produto_id: alvo.produto_id,
          forcar
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.imagem_url) {
          setImagensResolvidas(prev => ({ ...prev, [alvo.produto_id]: `${data.imagem_url}?t=${Date.now()}` }));
          setImagensComErro(prev => ({ ...prev, [alvo.produto_id]: false }));
        }
      }
    } catch {
      // Silencioso em background
    } finally {
      setBuscandoImagemIds(prev => ({ ...prev, [alvo.produto_id]: false }));
    }
  };

  useEffect(() => {
    const janela = itens.slice(index, index + 4);
    janela.forEach(it => {
      const temUrl = Boolean(imagensResolvidas[it.produto_id] || (it.imagem_url && !imagensComErro[it.produto_id]));
      if (!temUrl) {
        solicitarBuscaImagem(it, false);
      }
    });
  }, [index, itens]);

  // Helper para obter o pedido mínimo de uma distribuidora
  const obterPedidoMinimoDist = (distNorm: string): number => {
    const cfg = portais.find(p => normalizarNomeDistribuidora(p.nome) === distNorm);
    if (cfg && Number(cfg.pedido_minimo) > 0) return Number(cfg.pedido_minimo);
    return MINIMOS_PADRAO_PORTAL[distNorm] || 300;
  };

  // Resumo da compra aprovada agrupada por distribuidora
  const resumo = useMemo(() => {
    let total = 0;
    let qtd = 0;
    const distMap: Record<string, GrupoDistribuidoraResumo> = {};

    faltas.forEach(f => {
      if (f.nao_cotar || f.nao_carrinho || f.is_adiado_proxima_semana || f.is_enviado_carrinho_semana || idsAdicionadosSemanaSessao[f.produto_id]) {
        return;
      }
      if (!itensSelecionados[f.produto_id]) return;
      if (!f.fornecedor_1 || f.fornecedor_1 === 'Não Cotado' || f.fornecedor_1 === 'Sem Estoque (Portais)' || !f.preco_1 || f.preco_1 <= 0) {
        return;
      }

      const preco = Number(f.preco_1) || 0;
      const qtdItem = Math.max(1, Number(f.qtd_sugerida_7d) || 1);
      const sub = Number((qtdItem * preco).toFixed(2));
      total += sub;
      qtd += 1;

      const dist = normalizarNomeDistribuidora(f.fornecedor_1);
      if (!distMap[dist]) {
        const min = obterPedidoMinimoDist(dist);
        distMap[dist] = {
          distribuidora: dist,
          total: 0,
          min,
          atingiuMinimo: false,
          faltaParaMinimo: min,
          itens: []
        };
      }
      distMap[dist].total = Number((distMap[dist].total + sub).toFixed(2));
      distMap[dist].itens.push(f);
      distMap[dist].atingiuMinimo = distMap[dist].min <= 0 || distMap[dist].total >= distMap[dist].min;
      distMap[dist].faltaParaMinimo = Math.max(0, Number((distMap[dist].min - distMap[dist].total).toFixed(2)));
    });

    // Incorpora complementos de Curva A adicionados para atingir o pedido mínimo
    itensCurvaAAdicionados.forEach(ca => {
      const dist = normalizarNomeDistribuidora(ca.distribuidora);
      if (!distMap[dist]) {
        const min = obterPedidoMinimoDist(dist);
        distMap[dist] = {
          distribuidora: dist,
          total: 0,
          min,
          atingiuMinimo: false,
          faltaParaMinimo: min,
          itens: []
        };
      }
      const jaExiste = distMap[dist].itens.some(it => it.produto_id === ca.produto_id);
      if (!jaExiste) {
        distMap[dist].total = Number((distMap[dist].total + ca.subtotal).toFixed(2));
        distMap[dist].itens.push({
          produto_id: ca.produto_id,
          descricao: ca.descricao,
          apresentacao: ca.apresentacao || '',
          ean: ca.ean,
          curva_abc: ca.curva_abc || 'A',
          saldo: ca.saldo || 0,
          vmd_ponderado: ca.vmd_ponderado || 0,
          vendas_30d: 0,
          dias_estoque_restante: 0,
          custo_unitario: ca.precoUnitario,
          preco_ult_compra: ca.precoUnitario,
          fornecedor_ult_compra: ca.distribuidora,
          data_ult_compra: new Date().toISOString().slice(0, 10),
          qtd_sugerida_7d: ca.quantidade,
          subtotal_7d: ca.subtotal,
          tipo_categoria: 'MEDICAMENTO',
          fornecedor_1: ca.distribuidora,
          preco_1: ca.precoUnitario,
          url_produto_1: ca.url_produto,
          prioridade: 'P1'
        } as FaltaItem7d);
        total += ca.subtotal;
        qtd += 1;
      }
      distMap[dist].atingiuMinimo = distMap[dist].min <= 0 || distMap[dist].total >= distMap[dist].min;
      distMap[dist].faltaParaMinimo = Math.max(0, Number((distMap[dist].min - distMap[dist].total).toFixed(2)));
    });

    return { 
      total: Number(total.toFixed(2)), 
      qtd, 
      distMap,
      grupos: Object.values(distMap) as GrupoDistribuidoraResumo[]
    };
  }, [faltas, itensSelecionados, portais, idsAdicionadosSemanaSessao, itensCurvaAAdicionados]);

  // Sugestões inteligentes de produtos já cotados para completar o pedido mínimo de cada distribuidora
  const sugestoesParaMinimoPorDist = useMemo(() => {
    const mapa: Record<string, Array<{
      item: FaltaItem7d;
      precoNaDist: number;
      urlNaDist?: string | null;
      subtotalNaDist: number;
      isPrimeiroColocado: boolean;
      jaSelecionadoOutraDist: boolean;
    }>> = {};

    resumo.grupos.forEach(grupo => {
      if (grupo.atingiuMinimo) return;
      const distAlvo = grupo.distribuidora;
      const candidatos: Array<{
        item: FaltaItem7d;
        precoNaDist: number;
        urlNaDist?: string | null;
        subtotalNaDist: number;
        isPrimeiroColocado: boolean;
        jaSelecionadoOutraDist: boolean;
      }> = [];

      faltas.forEach(f => {
        if (f.nao_cotar || f.nao_carrinho || f.is_adiado_proxima_semana || f.is_enviado_carrinho_semana || idsAdicionadosSemanaSessao[f.produto_id]) {
          return;
        }
        const jaSelecionado = Boolean(itensSelecionados[f.produto_id]);
        const distAtualItem = normalizarNomeDistribuidora(f.fornecedor_1);
        // Se já está selecionado nesta mesma distribuidora, já faz parte do total dela
        if (jaSelecionado && distAtualItem === distAlvo) return;

        // Procura cotação disponível nesta distribuidora (em todas_cotacoes_reais, fornecedor_1 ou fornecedor_2)
        let precoNaDist = 0;
        let urlNaDist: string | null | undefined = null;

        if (distAtualItem === distAlvo && f.preco_1 && f.preco_1 > 0) {
          precoNaDist = f.preco_1;
          urlNaDist = f.url_produto_1;
        } else if (normalizarNomeDistribuidora(f.fornecedor_2) === distAlvo && f.preco_2 && f.preco_2 > 0) {
          precoNaDist = f.preco_2;
          urlNaDist = f.url_produto_2;
        } else if (Array.isArray(f.todas_cotacoes_reais)) {
          const cot = f.todas_cotacoes_reais.find(c => normalizarNomeDistribuidora(c.distribuidora) === distAlvo && c.preco > 0);
          if (cot) {
            precoNaDist = cot.preco;
            urlNaDist = cot.url_produto;
          }
        }

        if (precoNaDist > 0) {
          const qtdSug = Math.max(1, Number(f.qtd_sugerida_7d) || 1);
          candidatos.push({
            item: f,
            precoNaDist,
            urlNaDist,
            subtotalNaDist: Number((qtdSug * precoNaDist).toFixed(2)),
            isPrimeiroColocado: distAtualItem === distAlvo,
            jaSelecionadoOutraDist: jaSelecionado && distAtualItem !== distAlvo
          });
        }
      });

      // Ordena: 1º não selecionados ainda -> 2º onde a distribuidora já é 1ª colocada -> 3º Prioridade P1..P4 -> 4º Maior Giro (VMD)
      const pesoPrio: Record<string, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };
      candidatos.sort((a, b) => {
        if (a.jaSelecionadoOutraDist !== b.jaSelecionadoOutraDist) return a.jaSelecionadoOutraDist ? 1 : -1;
        if (a.isPrimeiroColocado !== b.isPrimeiroColocado) return a.isPrimeiroColocado ? -1 : 1;
        const pA = pesoPrio[a.item.prioridade || 'P4'] || 5;
        const pB = pesoPrio[b.item.prioridade || 'P4'] || 5;
        if (pA !== pB) return pA - pB;
        return (b.item.vmd_ponderado || 0) - (a.item.vmd_ponderado || 0);
      });

      mapa[distAlvo] = candidatos.slice(0, 12);
    });

    return mapa;
  }, [faltas, resumo.distMap, itensSelecionados, idsAdicionadosSemanaSessao]);

  // Busca sugestões de Curva A zerada para complementar o pedido mínimo da distribuidora
  const carregarSugestoesCurvaA = async (dist: string, falta: number) => {
    setCarregandoCurvaA(prev => ({ ...prev, [dist]: true }));
    try {
      const res = await fetch(`/api/belaped/portais/${encodeURIComponent(dist)}/sugestoes-curva-a?falta=${falta}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.sugestoes)) {
        setCurvaASugestoesPorDist(prev => ({ ...prev, [dist]: data.sugestoes }));
      }
    } catch (err: any) {
      console.error(`Erro ao carregar sugestões Curva A para ${dist}:`, err);
    } finally {
      setCarregandoCurvaA(prev => ({ ...prev, [dist]: false }));
    }
  };

  // Abre modal de Finalizar Procedimento inicializando os checkboxes (apenas os que atingiram o mínimo)
  const handleAbrirModalFinalizar = () => {
    const inicial: Record<string, boolean> = {};
    resumo.grupos.forEach(g => {
      inicial[g.distribuidora] = g.atingiuMinimo;
      if (!g.atingiuMinimo) {
        carregarSugestoesCurvaA(g.distribuidora, g.faltaParaMinimo);
      }
    });
    setPortaisMarcadosFinalizar(inicial);
    setProgressoPortais({});
    setModalFinalizarOpen(true);
  };

  // Inclui um item de Curva A zerada para cobrir a falta do pedido mínimo
  const handleIncluirCurvaA = (distAlvo: string, sug: any) => {
    const itemEmFaltas = faltas.find(f => f.produto_id === sug.produto_id);
    if (itemEmFaltas) {
      onEscolherFornecedor(sug.produto_id, 1, distAlvo, sug.preco_portal, sug.url_produto);
      setItensSelecionados(prev => ({ ...prev, [sug.produto_id]: true }));
    } else {
      setItensCurvaAAdicionados(prev => {
        const semEle = prev.filter(x => !(x.produto_id === sug.produto_id && x.distribuidora === distAlvo));
        return [...semEle, {
          produto_id: sug.produto_id,
          descricao: sug.descricao,
          apresentacao: sug.apresentacao,
          ean: sug.ean,
          curva_abc: sug.curva_abc || 'A',
          saldo: sug.saldo || 0,
          vmd_ponderado: sug.vmd_ponderado || 0,
          distribuidora: distAlvo,
          quantidade: sug.qtd_sugerida,
          precoUnitario: sug.preco_portal,
          subtotal: sug.subtotal,
          url_produto: sug.url_produto
        }];
      });
    }

    const grupoAtual = resumo.distMap[distAlvo];
    if (grupoAtual && (grupoAtual.total + sug.subtotal) >= grupoAtual.min) {
      setPortaisMarcadosFinalizar(prev => ({ ...prev, [distAlvo]: true }));
    }
    addToast(`+ Curva A: "${sug.descricao}" (+R$ ${sug.subtotal.toFixed(2)}) incluído na ${distAlvo}`, 'success');
  };

  // Auto-completa uma distribuidora com produtos de Curva A zerados do Digifarma
  const handleAutoCompletarCurvaA = async (distAlvo: string) => {
    const grupo = resumo.distMap[distAlvo];
    if (!grupo) return;

    let sugs = curvaASugestoesPorDist[distAlvo];
    if (!sugs || sugs.length === 0) {
      setCarregandoCurvaA(prev => ({ ...prev, [distAlvo]: true }));
      try {
        const res = await fetch(`/api/belaped/portais/${encodeURIComponent(distAlvo)}/sugestoes-curva-a?falta=${grupo.faltaParaMinimo}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.sugestoes)) {
          sugs = data.sugestoes;
          setCurvaASugestoesPorDist(prev => ({ ...prev, [distAlvo]: data.sugestoes }));
        }
      } catch (e) {
        addToast(`Erro ao buscar sugestões Curva A para ${distAlvo}`, 'danger');
        setCarregandoCurvaA(prev => ({ ...prev, [distAlvo]: false }));
        return;
      }
      setCarregandoCurvaA(prev => ({ ...prev, [distAlvo]: false }));
    }

    if (!sugs || sugs.length === 0) {
      addToast(`Nenhum produto de Curva A com estoque zero disponível para ${distAlvo}.`, 'warning');
      return;
    }

    let acumulado = grupo.total;
    let adicionadosCount = 0;
    const novosCurvaA: any[] = [];
    const novosSelecionados: Record<number, boolean> = {};

    for (const sug of sugs) {
      if (acumulado >= grupo.min) break;
      const itemEmFaltas = faltas.find(f => f.produto_id === sug.produto_id);
      if (itemEmFaltas) {
        onEscolherFornecedor(sug.produto_id, 1, distAlvo, sug.preco_portal, sug.url_produto);
        novosSelecionados[sug.produto_id] = true;
      } else {
        novosCurvaA.push({
          produto_id: sug.produto_id,
          descricao: sug.descricao,
          apresentacao: sug.apresentacao,
          ean: sug.ean,
          curva_abc: sug.curva_abc || 'A',
          saldo: sug.saldo || 0,
          vmd_ponderado: sug.vmd_ponderado || 0,
          distribuidora: distAlvo,
          quantidade: sug.qtd_sugerida,
          precoUnitario: sug.preco_portal,
          subtotal: sug.subtotal,
          url_produto: sug.url_produto
        });
      }
      acumulado += sug.subtotal;
      adicionadosCount++;
    }

    if (Object.keys(novosSelecionados).length > 0) {
      setItensSelecionados(prev => ({ ...prev, ...novosSelecionados }));
    }
    if (novosCurvaA.length > 0) {
      setItensCurvaAAdicionados(prev => [...prev, ...novosCurvaA]);
    }

    if (adicionadosCount > 0) {
      if (acumulado >= grupo.min) {
        setPortaisMarcadosFinalizar(prev => ({ ...prev, [distAlvo]: true }));
      }
      addToast(`⚡ ${adicionadosCount} produto(s) Curva A incluídos na ${distAlvo}! Novo total: R$ ${acumulado.toFixed(2)}`, 'success');
    }
  };

  // Inclui um item sugerido para ajudar a atingir o pedido mínimo da distribuidora
  const handleIncluirSugestaoMinimo = (
    distAlvo: string,
    sug: { item: FaltaItem7d; precoNaDist: number; urlNaDist?: string | null; subtotalNaDist: number }
  ) => {
    onEscolherFornecedor(sug.item.produto_id, 1, distAlvo, sug.precoNaDist, sug.urlNaDist);
    setItensSelecionados(prev => ({ ...prev, [sug.item.produto_id]: true }));
    const grupoAtual = resumo.distMap[distAlvo];
    if (grupoAtual && (grupoAtual.total + sug.subtotalNaDist) >= grupoAtual.min) {
      setPortaisMarcadosFinalizar(prev => ({ ...prev, [distAlvo]: true }));
    }
    addToast(`+ "${sug.item.descricao}" incluído na ${distAlvo} (R$ ${sug.subtotalNaDist.toFixed(2)})`, 'success');
  };

  // Auto-completa uma distribuidora até atingir o pedido mínimo usando as melhores sugestões
  const handleAutoCompletarMinimo = (distAlvo: string) => {
    const grupo = resumo.distMap[distAlvo];
    const sugs = sugestoesParaMinimoPorDist[distAlvo] || [];
    if (!grupo || sugs.length === 0) return;

    let acumulado = grupo.total;
    let adicionadosCount = 0;
    const novosSelecionados: Record<number, boolean> = {};

    for (const sug of sugs) {
      if (acumulado >= grupo.min) break;
      onEscolherFornecedor(sug.item.produto_id, 1, distAlvo, sug.precoNaDist, sug.urlNaDist);
      novosSelecionados[sug.item.produto_id] = true;
      acumulado += sug.subtotalNaDist;
      adicionadosCount++;
    }

    if (adicionadosCount > 0) {
      setItensSelecionados(prev => ({ ...prev, ...novosSelecionados }));
      if (acumulado >= grupo.min) {
        setPortaisMarcadosFinalizar(prev => ({ ...prev, [distAlvo]: true }));
      }
      addToast(`⚡ ${adicionadosCount} produto(s) incluídos na ${distAlvo}! Novo total: R$ ${acumulado.toFixed(2)}`, 'success');
    }
  };

  // Executa a montagem real dos carrinhos nos portais marcados e oculta da semana os itens confirmados
  const handleExecutarFinalizacaoPortais = async () => {
    const gruposParaEnviar = resumo.grupos.filter(
      g => portaisMarcadosFinalizar[g.distribuidora] && g.itens.length > 0
    );

    if (gruposParaEnviar.length === 0) {
      addToast('Selecione pelo menos uma distribuidora para montar o carrinho.', 'warning');
      return;
    }

    // BLOQUEIO ESTRITO DE ENVIO DE PEDIDO ABAIXO DO MÍNIMO
    const deficientes = gruposParaEnviar.filter(g => !g.atingiuMinimo);
    if (deficientes.length > 0) {
      const nomes = deficientes.map(g => `${g.distribuidora} (faltam R$ ${g.faltaParaMinimo.toFixed(2)})`).join(', ');
      addToast(`🚫 Envio bloqueado: Distribuidora(s) abaixo do pedido mínimo: ${nomes}. Complete o pedido com Curva A para prosseguir.`, 'danger');
      return;
    }

    setExecutandoCarrinhos(true);
    const progInicial: typeof progressoPortais = {};
    gruposParaEnviar.forEach(g => {
      progInicial[g.distribuidora] = {
        status: 'AGUARDANDO',
        atual: 0,
        total: g.itens.length,
        sucessos: 0,
        erros: 0,
        mensagem: 'Na fila para iniciar...'
      };
    });
    setProgressoPortais(progInicial);

    let totalAdicionadosGeral = 0;
    let totalErrosGeral = 0;
    const produtosConfirmadosIds: number[] = [];

    for (const grupo of gruposParaEnviar) {
      const endpoints = obterEndpointsCarrinhoPortal(grupo.distribuidora);
      if (!endpoints) {
        setProgressoPortais(prev => ({
          ...prev,
          [grupo.distribuidora]: {
            ...prev[grupo.distribuidora],
            status: 'ERRO',
            mensagem: 'Portal sem robô de carrinho configurado.'
          }
        }));
        continue;
      }

      setProgressoPortais(prev => ({
        ...prev,
        [grupo.distribuidora]: {
          ...prev[grupo.distribuidora],
          status: 'EXECUTANDO',
          mensagem: 'Iniciando robô e limpando carrinho no portal...'
        }
      }));

      try {
        const payloadItens = grupo.itens.map(it => ({
          produto_id: it.produto_id,
          ean: it.ean,
          descricao: it.descricao,
          quantidade: Math.max(1, Number(it.qtd_sugerida_7d) || 1),
          preco_1: Number(it.preco_1) || 0,
          preco_ult_compra: Number(it.preco_ult_compra || it.custo_unitario || 0),
          fornecedor_2: it.fornecedor_2,
          preco_2: it.preco_2
        }));

        const startRes = await fetch(endpoints.postUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itens: payloadItens })
        });
        const startData = await startRes.json();

        if (!startRes.ok || !startData.success) {
          setProgressoPortais(prev => ({
            ...prev,
            [grupo.distribuidora]: {
              ...prev[grupo.distribuidora],
              status: 'ERRO',
              mensagem: startData.message || startData.error || 'Falha ao iniciar robô'
            }
          }));
          continue;
        }

        // Faz polling em statusUrl até emAndamento === false
        let finalizado = false;
        let tentativas = 0;
        while (!finalizado && tentativas < 240) {
          await new Promise(r => setTimeout(r, 1500));
          tentativas++;
          const stRes = await fetch(endpoints.statusUrl);
          if (!stRes.ok) continue;
          const stData = await stRes.json();
          const st = stData.status;
          if (!st) continue;

          const atual = Number(st.atual ?? (st.sucesso ? grupo.itens.length : 0));
          const total = Number(st.total || grupo.itens.length);
          const sucessos = Number(st.sucessos ?? (st.sucesso ? grupo.itens.length : 0));
          const erros = Number(st.erros || 0);
          const msg = st.ultimoItem || st.mensagem || `Processando ${atual}/${total}...`;

          setProgressoPortais(prev => ({
            ...prev,
            [grupo.distribuidora]: {
              status: st.emAndamento ? 'EXECUTANDO' : 'CONCLUIDO',
              atual,
              total,
              sucessos,
              erros,
              mensagem: st.emAndamento ? msg : `Concluído: ${sucessos} adicionados no carrinho`
            }
          }));

          if (!st.emAndamento) {
            finalizado = true;
            totalAdicionadosGeral += sucessos;
            totalErrosGeral += erros;

            // Identifica quais itens foram confirmados com status ADICIONADO
            const eansSucesso = new Set<string>();
            if (Array.isArray(st.itens)) {
              st.itens.forEach((ri: any) => {
                if (ri.status === 'ADICIONADO' && ri.ean) {
                  eansSucesso.add(String(ri.ean).trim());
                }
              });
            } else if (st.sucesso) {
              // Caso de importação por planilha (Distrimed)
              grupo.itens.forEach(gi => {
                if (gi.ean) eansSucesso.add(String(gi.ean).trim());
              });
            }

            grupo.itens.forEach(gi => {
              if (gi.ean && eansSucesso.has(String(gi.ean).trim())) {
                produtosConfirmadosIds.push(gi.produto_id);
              }
            });
          }
        }
      } catch (e: any) {
        setProgressoPortais(prev => ({
          ...prev,
          [grupo.distribuidora]: {
            ...prev[grupo.distribuidora],
            status: 'ERRO',
            mensagem: 'Erro de conexão: ' + (e.message || 'falha')
          }
        }));
      }
    }

    // Remove dos selecionados e oculta dos cards da semana atual apenas os produtos que realmente entraram nos carrinhos
    if (produtosConfirmadosIds.length > 0) {
      setIdsAdicionadosSemanaSessao(prev => {
        const next = { ...prev };
        produtosConfirmadosIds.forEach(id => { next[id] = true; });
        return next;
      });
      setItensSelecionados(prev => {
        const next = { ...prev };
        produtosConfirmadosIds.forEach(id => { next[id] = false; });
        return next;
      });
    }

    if (onRecarregarDados) {
      await onRecarregarDados();
    }

    setExecutandoCarrinhos(false);

    if (totalAdicionadosGeral > 0) {
      addToast(
        `✅ ${totalAdicionadosGeral} produto(s) adicionados aos carrinhos nos portais e ocultados da lista desta semana!`,
        'success'
      );
    } else if (totalErrosGeral > 0) {
      addToast(
        `⚠️ Nenhum item pôde ser adicionado (${totalErrosGeral} falha/sem estoque). Os itens permanecem nos cards para decisão.`,
        'warning'
      );
    }
  };

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

  const handleConferirNoPortal = (alvo: FaltaItem7d, colocacao: 1 | 2 = 1) => {
    const url = obterUrlConferenciaPortal(alvo, colocacao);
    if (alvo.ean) {
      try {
        navigator.clipboard.writeText(alvo.ean);
        setCopiadoEan(alvo.ean);
        setTimeout(() => setCopiadoEan(null), 2000);
      } catch {}
    }
    if (url) {
      addToast(`EAN ${alvo.ean || ''} copiado! Abrindo portal para conferência...`, 'info');
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      addToast('Link direto não disponível para esta distribuidora.', 'warning');
    }
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

  const handleBaixarPlanilhaPrioridades = async () => {
    try {
      addToast('Gerando download da planilha de prioridades...', 'info');
      const res = await fetch('/api/belaped/baixar-relatorio-prioridades');
      if (!res.ok) {
        throw new Error(`Erro no servidor (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'relatorio-prioridades-belaped.xlsx';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        } catch (e) {}
      }, 1500);
      addToast('✅ Download da planilha concluído!', 'success');
    } catch (err: any) {
      addToast('Erro ao baixar planilha: ' + err.message, 'error');
    }
  };

  // Atalhos de teclado (Seta Esquerda / Seta Direita)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (modalFinalizarOpen || confirmarModal) return;
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
  }, [index, itens.length, modalFinalizarOpen, confirmarModal]);

  // Gestos de toque lateral (Swipe) para smartphones
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
          <h3 className="text-base font-bold text-white">Todas as cotações da semana foram revisadas</h3>
          <p className="text-xs text-slate-400 mt-1">
            Nenhum produto pendente de decisão nesta semana (itens já enviados ao carrinho ficam ocultos até a próxima semana).
          </p>
        </div>
        <div className="pt-2 flex flex-wrap justify-center gap-3">
          {resumo.qtd > 0 && (
            <button
              onClick={handleAbrirModalFinalizar}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-emerald-950/50"
            >
              <PackageCheck className="w-4 h-4" />
              <span>Finalizar Procedimento ({resumo.qtd} itens • R$ {resumo.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</span>
            </button>
          )}
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

  const urlImagemExibida = imagensResolvidas[item.produto_id] || (!imagensComErro[item.produto_id] ? item.imagem_url : null);
  const estaBuscandoImagem = Boolean(buscandoImagemIds[item.produto_id]);
  const urlConferencia1 = obterUrlConferenciaPortal(item, 1);
  const urlConferencia2 = item.fornecedor_2 && preco2 > 0 ? obterUrlConferenciaPortal(item, 2) : null;

  return (
    <div className="max-w-3xl mx-auto space-y-3 pb-24 animate-in fade-in duration-200">
      
      {/* ─── TOPO: CONTADOR, RESUMO, VER CARRINHO E BOTÃO FINALIZAR PROCEDIMENTO ─── */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-300">
            Card <b className="text-cyan-400">{index + 1}</b> de {itens.length}
          </span>
          <span className="text-slate-600">•</span>
          <span className="text-slate-400">
            Selecionados: <b className="text-white">{resumo.qtd}</b> (<b className="text-emerald-400">R$ {resumo.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</b>)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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

          {resumo.qtd > 0 && (
            <button
              type="button"
              onClick={() => {
                setItensSelecionados({});
                setHistorico([]);
                addToast('Lista de compras limpa!', 'info');
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 font-semibold transition-all cursor-pointer border border-slate-800 hover:border-rose-700/60"
              title="Zerar itens selecionados na lista"
            >
              <X className="w-3.5 h-3.5" />
              <span>Limpar Lista</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleBaixarPlanilhaPrioridades}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 hover:text-emerald-100 font-semibold transition-all cursor-pointer border border-emerald-700/60 shadow-sm"
            title="Baixar planilha Excel (.xlsx) com a auditoria dos 51 produtos e status do radar"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Baixar Planilha (.xlsx)</span>
          </button>

          <button
            onClick={onAbrirVerCarrinhos}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white font-semibold transition-all cursor-pointer border border-slate-700"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Ver Lista ({resumo.qtd})</span>
          </button>

          <button
            type="button"
            onClick={handleAbrirModalFinalizar}
            disabled={resumo.qtd === 0}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black shadow-lg shadow-emerald-950/50 transition-all cursor-pointer active:scale-95"
            title="Revisar pedidos mínimos por distribuidora e montar carrinhos automaticamente nos portais"
          >
            <PackageCheck className="w-4 h-4 text-emerald-100" />
            <span>Finalizar Procedimento ({resumo.qtd})</span>
          </button>
        </div>
      </div>

      {/* Mini-linha clicável com status dos pedidos mínimos por distribuidora */}
      {resumo.grupos.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 text-[11px]">
          {resumo.grupos.map((d) => {
            const ok = d.atingiuMinimo;
            return (
              <button
                key={d.distribuidora}
                type="button"
                onClick={handleAbrirModalFinalizar}
                className={`shrink-0 px-2.5 py-1 rounded-lg border font-medium cursor-pointer transition-all flex items-center gap-1.5 ${
                  ok
                    ? 'border-emerald-600/50 text-emerald-300 bg-emerald-950/30 hover:bg-emerald-950/50'
                    : 'border-rose-600/50 text-rose-300 bg-rose-950/30 hover:bg-rose-950/50'
                }`}
                title={ok ? 'Pedido mínimo atingido' : `Bloqueado: Faltam R$ ${d.faltaParaMinimo.toFixed(0)} para atingir o mínimo`}
              >
                <span>{d.distribuidora}: <b>R$ {d.total.toFixed(0)}</b></span>
                {d.min > 0 && (
                  <span className="text-[10px] opacity-90 flex items-center gap-1">
                    {ok ? (
                      '✓ Mín. OK'
                    ) : (
                      <>
                        <Lock className="w-3 h-3 text-rose-400" />
                        <span>faltam R$ {d.faltaParaMinimo.toFixed(0)}</span>
                      </>
                    )}
                  </span>
                )}
              </button>
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
        
        {/* Bloco Superior: Tags discretas, EAN e Navegação Rápida no Topo */}
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

          <div className="flex items-center gap-2">
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
        </div>

        {/* Bloco Produto: Foto Real do Produto (25% do Card) + Informações */}
        <div className="flex items-start gap-3.5 sm:gap-4">
          <div className="w-[25%] aspect-square min-w-[95px] max-w-[160px] rounded-2xl bg-[#080d18] border border-slate-800/90 flex items-center justify-center p-2 shrink-0 overflow-hidden relative shadow-inner group">
            {urlImagemExibida ? (
              <img
                key={urlImagemExibida}
                src={urlImagemExibida}
                alt={item.descricao}
                className="w-full h-full object-contain p-0.5 drop-shadow-md bg-white/95 rounded-xl"
                loading="eager"
                onError={() => {
                  setImagensComErro(prev => ({ ...prev, [item.produto_id]: true }));
                  solicitarBuscaImagem(item, true);
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center w-full h-full text-slate-500">
                {estaBuscandoImagem ? (
                  <>
                    <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
                    <span className="text-[9px] uppercase font-bold tracking-wider mt-1.5 text-cyan-400">
                      Buscando foto...
                    </span>
                  </>
                ) : (
                  <>
                    {item.tipo_categoria === 'MEDICAMENTO' ? (
                      <Pill className="w-10 h-10 text-cyan-400 stroke-[1.75]" />
                    ) : (
                      <Sparkles className="w-10 h-10 text-purple-400 stroke-[1.75]" />
                    )}
                    <span className="text-[10px] uppercase font-bold tracking-wider mt-1.5 text-slate-500">
                      {item.tipo_categoria === 'MEDICAMENTO' ? 'Medicamento' : 'Perfumaria'}
                    </span>
                    <button
                      type="button"
                      onClick={() => solicitarBuscaImagem(item, true)}
                      className="mt-1 text-[9px] text-cyan-400 hover:underline cursor-pointer"
                    >
                      Buscar foto
                    </button>
                  </>
                )}
              </div>
            )}
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

        {/* Linha Minimalista de Estoque & Saídas */}
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

        {/* ─── COTAÇÃO DOS GANHADORES (1º E 2º COLOCADOS) + INFORMAÇÃO DA ÚLTIMA COMPRA ─── */}
        <div className="space-y-2 pt-1">
          {/* 1º Colocado */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-[#091222] border border-emerald-500/40">
            <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
              <DistribuidoraLogoClean nome={item.fornecedor_1} isWinner={true} />
              {economizou && (
                <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-400 font-semibold bg-emerald-950/60 border border-emerald-700/50 px-2 py-0.5 rounded-md">
                  <TrendingDown className="w-3 h-3" />
                  <span>-R$ {diferencaReais.toFixed(2)} ({Math.abs(diffPct)}%)</span>
                </span>
              )}
              {urlConferencia1 && (
                <button
                  type="button"
                  onClick={() => handleConferirNoPortal(item, 1)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 hover:text-white border border-cyan-700/60 text-[11px] font-bold transition-all cursor-pointer shadow-xs"
                  title={`Abrir página do produto na ${item.fornecedor_1} para conferência (copia o EAN automaticamente)`}
                >
                  <span>Conferir no Portal</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="text-right shrink-0">
              <span className="text-base sm:text-lg font-black text-emerald-300">
                R$ {preco1.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-500 block">/unidade (1º Colocado)</span>
            </div>
          </div>

          {/* 2º Colocado (Sempre visível com valor em destaque) */}
          {item.fornecedor_2 && item.fornecedor_2 !== '—' && preco2 > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 sm:px-3 rounded-xl bg-[#080f1e] border border-slate-700/80 text-xs">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-300 uppercase">
                  2º Colocado
                </span>
                <DistribuidoraLogoClean nome={item.fornecedor_2} isWinner={false} />
                {urlConferencia2 && (
                  <button
                    type="button"
                    onClick={() => handleConferirNoPortal(item, 2)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 border border-slate-700/80 text-[10px] font-semibold transition-colors cursor-pointer"
                    title={`Conferir produto no portal da ${item.fornecedor_2}`}
                  >
                    <span>Conferir</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleComprarSegundo(item)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-cyan-950 text-slate-200 hover:text-cyan-300 border border-slate-700 hover:border-cyan-700/60 text-[11px] font-bold cursor-pointer transition-all"
                  title={`Optar por comprar no 2º colocado (${item.fornecedor_2})`}
                >
                  <span>Optar pelo 2º</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              <div className="text-right shrink-0">
                <span className="text-sm sm:text-base font-black text-slate-200">
                  R$ {preco2.toFixed(2)}
                </span>
                <span className="text-[10px] text-amber-400/90 block font-medium">
                  {preco2 > preco1
                    ? `+R$ ${(preco2 - preco1).toFixed(2)} (+${diff2Colocado}% vs 1º)`
                    : '/unidade (2º Colocado)'}
                </span>
              </div>
            </div>
          ) : item.fornecedor_2_ref && (item.preco_2_ref || 0) > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 sm:px-3 rounded-xl bg-[#080d1a] border border-slate-800/90 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-[10px] font-bold text-slate-400 uppercase">
                  2º Colocado
                </span>
                <DistribuidoraLogoClean nome={item.fornecedor_2_ref} isWinner={false} />
                <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800/60 text-[10px] text-amber-300 font-semibold">
                  Sem estoque no momento
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-sm font-bold text-slate-300">
                  R$ {Number(item.preco_2_ref).toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-500 block">/un (ref. cotada)</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#080d1a] border border-slate-800/70 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-[10px] font-bold text-slate-400 uppercase">
                  2º Colocado
                </span>
                <span>Apenas 1 distribuidora com estoque cotado para este item</span>
              </div>
              <span className="font-semibold text-slate-500">Sem 2ª oferta</span>
            </div>
          )}

          {/* Bloco Completo: Informação da Última Compra (Digifarma / Nota Fiscal) */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 sm:px-3 rounded-xl bg-[#070c17] border border-slate-800/90 text-xs">
            <div className="space-y-0.5 min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                  Última Compra (NF / ERP)
                </span>
                {item.nf_ult_compra && (
                  <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono text-[10px] border border-slate-700">
                    {item.nf_ult_compra}
                  </span>
                )}
                {item.data_ult_compra && (
                  <span className="text-[10px] text-slate-400">
                    • {(() => {
                      const dStr = String(item.data_ult_compra).slice(0, 10);
                      const parts = dStr.split('-');
                      return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dStr;
                    })()}
                  </span>
                )}
                {item.qtd_ult_compra ? (
                  <span className="text-[10px] text-slate-400">
                    • Qtd: <b className="text-slate-300">{item.qtd_ult_compra} un</b>
                  </span>
                ) : null}
              </div>

              <div className="text-[11px] text-slate-300 font-medium truncate" title={item.fornecedor_ult_compra}>
                Fornecedor: <span className="text-white font-semibold">{item.fornecedor_ult_compra || 'Não registrado'}</span>
                {item.embalagem_ult_compra ? (
                  <span className="text-slate-500 text-[10px] ml-1.5">({item.embalagem_ult_compra})</span>
                ) : null}
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="text-sm font-black text-white">
                {precoUlt > 0 ? `R$ ${precoUlt.toFixed(2)}` : '—'}
              </span>
              {precoUlt > 0 && preco1 > 0 ? (
                <span className={`text-[10px] block font-semibold ${
                  preco1 < precoUlt
                    ? 'text-emerald-400'
                    : preco1 > precoUlt
                    ? 'text-amber-400'
                    : 'text-slate-400'
                }`}>
                  {preco1 < precoUlt
                    ? `Economia -R$ ${(precoUlt - preco1).toFixed(2)} (${diffPct}%)`
                    : preco1 > precoUlt
                    ? `+R$ ${(preco1 - precoUlt).toFixed(2)} (+${diffPct}% vs últ.)`
                    : 'Mesmo valor da últ. compra'}
                </span>
              ) : (
                <span className="text-[10px] text-slate-500 block">/un últ. compra</span>
              )}
            </div>
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

        {/* ─── BARRA DE NAVEGAÇÃO ANTERIOR / PRÓXIMO (ACIMA DOS BOTÕES PARA NUNCA COLIDIR COM O ROBÔ) ─── */}
        <div className="flex items-center justify-between py-2 px-2.5 rounded-xl bg-[#080e1b] border border-slate-800/90 text-xs">
          <button
            type="button"
            onClick={handleAnterior}
            disabled={index === 0}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/70 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all font-bold"
            title="Item anterior (ou tecla ←)"
          >
            <ChevronLeft className="w-4 h-4 text-cyan-400" />
            <span>Anterior</span>
          </button>

          <span className="text-xs text-slate-300 font-bold">
            Produto <span className="text-cyan-400">{index + 1}</span> de {itens.length}
          </span>

          <button
            type="button"
            onClick={handleProximo}
            disabled={index >= itens.length - 1}
            className="flex items-center gap-1.5 py-1.5 px-3.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 text-cyan-200 hover:text-white border border-cyan-700/70 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all font-bold shadow-sm"
            title="Próximo item (ou tecla →)"
          >
            <span>Próximo</span>
            <ChevronRight className="w-4 h-4 text-cyan-300" />
          </button>
        </div>

        {/* ─── BOTÕES DE AÇÃO: PRINCIPAL + PLANOS ──────────────────────────────── */}
        <div className="pt-1 space-y-2">
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
            <span>{jaSelecionado ? `✓ No Carrinho (${item.fornecedor_1?.split(' ')[0]}) - Avançar p/ Próximo` : `Comprar na ${item.fornecedor_1?.split(' ')[0] || '1ª'}`}</span>
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
      </div>

      {/* ─── MODAL: FINALIZAR PROCEDIMENTO & MONTAR CARRINHOS NOS PORTAIS ──────── */}
      {modalFinalizarOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#0b1220] border border-cyan-500/40 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl text-slate-100 overflow-hidden">
            {/* Cabeçalho */}
            <div className="p-4 bg-[#080e1a] border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                  <PackageCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black uppercase text-white">
                    Finalizar Procedimento & Montar Carrinhos nos Portais
                  </h3>
                  <p className="text-xs text-slate-400">
                    Confira o pedido mínimo de cada distribuidora. Os itens adicionados nos carrinhos não aparecerão novamente nesta semana.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !executandoCarrinhos && setModalFinalizarOpen(false)}
                disabled={executandoCarrinhos}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Lista de Distribuidoras e Sugestões de Pedido Mínimo */}
            <div className="p-4 overflow-y-auto flex-1 space-y-4 custom-scrollbar">
              {resumo.grupos.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Nenhum produto selecionado com cotação ativa para montar carrinho.
                </div>
              ) : (
                resumo.grupos.map(grupo => {
                  const marcado = Boolean(portaisMarcadosFinalizar[grupo.distribuidora]);
                  const sugs = sugestoesParaMinimoPorDist[grupo.distribuidora] || [];
                  const prog = progressoPortais[grupo.distribuidora];

                  return (
                    <div
                      key={grupo.distribuidora}
                      className={`rounded-2xl border p-3.5 space-y-3 transition-all ${
                        grupo.atingiuMinimo
                          ? 'bg-[#0d1628] border-emerald-500/40'
                          : 'bg-[#121420] border-amber-500/50'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            disabled={executandoCarrinhos || !grupo.atingiuMinimo}
                            onClick={() => {
                              if (!grupo.atingiuMinimo) return;
                              setPortaisMarcadosFinalizar(prev => ({
                                ...prev,
                                [grupo.distribuidora]: !prev[grupo.distribuidora]
                              }));
                            }}
                            className={`transition-colors ${
                              !grupo.atingiuMinimo
                                ? 'cursor-not-allowed opacity-60 text-slate-500'
                                : 'text-cyan-400 hover:text-cyan-300 cursor-pointer'
                            }`}
                            title={
                              !grupo.atingiuMinimo
                                ? `Envio Bloqueado: Faltam R$ ${grupo.faltaParaMinimo.toFixed(2)} para atingir o pedido mínimo de R$ ${grupo.min.toFixed(2)}.`
                                : 'Selecionar distribuidora para montagem do carrinho'
                            }
                          >
                            {!grupo.atingiuMinimo ? (
                              <Lock className="w-5 h-5 text-rose-500" />
                            ) : marcado ? (
                              <CheckSquare className="w-5 h-5 text-emerald-400" />
                            ) : (
                              <Square className="w-5 h-5 text-slate-500" />
                            )}
                          </button>
                          <DistribuidoraLogoClean nome={grupo.distribuidora} />
                          <span className="text-xs font-bold text-slate-300">
                            {grupo.itens.length} produto(s)
                          </span>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <div className="text-right">
                            <span className="text-sm font-black text-white block">
                              R$ {grupo.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                            <span className="text-[10px] text-slate-400 block">
                              Mínimo: R$ {grupo.min.toFixed(2)}
                            </span>
                          </div>

                          <span
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-black border flex items-center gap-1.5 ${
                              grupo.atingiuMinimo
                                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600/60'
                                : 'bg-rose-950/80 text-rose-300 border-rose-600/60 shadow-sm shadow-rose-950/40'
                            }`}
                          >
                            {grupo.atingiuMinimo ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span>✓ Mínimo Atingido</span>
                              </>
                            ) : (
                              <>
                                <Lock className="w-3.5 h-3.5 text-rose-400" />
                                <span>Envio Bloqueado (Faltam R$ ${grupo.faltaParaMinimo.toFixed(2)})</span>
                              </>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Progresso ao Vivo durante Execução do Robô */}
                      {prog && (
                        <div className="p-2.5 rounded-xl bg-[#070c16] border border-slate-800 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                              {prog.status === 'EXECUTANDO' && <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />}
                              {prog.status === 'CONCLUIDO' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                              {prog.status === 'ERRO' && <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />}
                              <span>{prog.mensagem}</span>
                            </span>
                            <span className="font-mono text-[11px] text-slate-400">
                              {prog.atual}/{prog.total} ({prog.sucessos} OK)
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${
                                prog.status === 'ERRO' ? 'bg-rose-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${prog.total > 0 ? Math.min(100, Math.round((prog.atual / prog.total) * 100)) : 0}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Painel de Sugestões de Produtos para Atingir o Pedido Mínimo */}
                      {!grupo.atingiuMinimo && !executandoCarrinhos && (
                        <div className="p-3 rounded-xl bg-[#090f1d] border border-amber-500/30 space-y-2.5">
                          {/* Seletor de Abas de Sugestão: Curva A Zerada vs Semanal */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setAbaSugestaoPorDist(prev => ({ ...prev, [grupo.distribuidora]: 'curva_a' }))}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                  (abaSugestaoPorDist[grupo.distribuidora] || 'curva_a') === 'curva_a'
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                                    : 'text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                                <span>🎯 Curva A Zerada ({curvaASugestoesPorDist[grupo.distribuidora]?.length || 0})</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setAbaSugestaoPorDist(prev => ({ ...prev, [grupo.distribuidora]: 'semanal' }))}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                  abaSugestaoPorDist[grupo.distribuidora] === 'semanal'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                                    : 'text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                <span>📋 Lista Semanal ({sugs.length})</span>
                              </button>
                            </div>

                            {(abaSugestaoPorDist[grupo.distribuidora] || 'curva_a') === 'curva_a' ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => carregarSugestoesCurvaA(grupo.distribuidora, grupo.faltaParaMinimo)}
                                  disabled={carregandoCurvaA[grupo.distribuidora]}
                                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
                                  title="Recarregar sugestões de Curva A"
                                >
                                  <RefreshCw className={`w-3.5 h-3.5 ${carregandoCurvaA[grupo.distribuidora] ? 'animate-spin' : ''}`} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAutoCompletarCurvaA(grupo.distribuidora)}
                                  disabled={carregandoCurvaA[grupo.distribuidora] || (curvaASugestoesPorDist[grupo.distribuidora]?.length || 0) === 0}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 disabled:opacity-40 text-white text-[11px] font-black transition-all cursor-pointer shadow-sm"
                                >
                                  <Zap className="w-3 h-3 text-yellow-300" />
                                  <span>Auto-completar com Curva A</span>
                                </button>
                              </div>
                            ) : (
                              sugs.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleAutoCompletarMinimo(grupo.distribuidora)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-black transition-all cursor-pointer shadow-sm"
                                >
                                  <Zap className="w-3 h-3" />
                                  <span>Auto-completar Mínimo</span>
                                </button>
                              )
                            )}
                          </div>

                          {/* Conteúdo da Aba Curva A Zerada */}
                          {(abaSugestaoPorDist[grupo.distribuidora] || 'curva_a') === 'curva_a' && (
                            <div>
                              {carregandoCurvaA[grupo.distribuidora] ? (
                                <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                                  <span>Buscando produtos Curva A zerados no Digifarma para {grupo.distribuidora}...</span>
                                </div>
                              ) : (curvaASugestoesPorDist[grupo.distribuidora]?.length || 0) === 0 ? (
                                <p className="text-[11px] text-slate-400 py-1">
                                  Nenhum produto de Curva A com estoque zerado e cotação ativa encontrado para esta distribuidora. Veja a aba "Lista Semanal" ao lado.
                                </p>
                              ) : (
                                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                                  {curvaASugestoesPorDist[grupo.distribuidora].map(sug => (
                                    <div
                                      key={sug.produto_id}
                                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#0d1526] border border-cyan-500/20 text-xs hover:border-cyan-500/40 transition-colors"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                                            Curva A
                                          </span>
                                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-950 text-rose-300 border border-rose-800/60">
                                            Estoque 0
                                          </span>
                                          <span className="font-bold text-white truncate">{sug.descricao}</span>
                                        </div>
                                        <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                                          <span>Giro: <b>{sug.vmd_ponderado}</b>/dia</span>
                                          <span>•</span>
                                          <span>Sugerido 7d: <b>{sug.qtd_sugerida} un</b> × R$ {sug.preco_portal.toFixed(2)}</span>
                                          {sug.ean && <span>• EAN: {sug.ean}</span>}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className="font-black text-emerald-300 text-xs">
                                          + R$ {sug.subtotal.toFixed(2)}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleIncluirCurvaA(grupo.distribuidora, sug)}
                                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black cursor-pointer transition-colors flex items-center gap-1 shadow-sm"
                                        >
                                          <Plus className="w-3 h-3" />
                                          <span>Incluir</span>
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Conteúdo da Aba Lista Semanal */}
                          {abaSugestaoPorDist[grupo.distribuidora] === 'semanal' && (
                            <div>
                              {sugs.length === 0 ? (
                                <p className="text-[11px] text-slate-400 py-1">
                                  Não há outros produtos cotados com estoque nesta distribuidora na lista semanal.
                                </p>
                              ) : (
                                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
                                  {sugs.map(sug => (
                                    <div
                                      key={sug.item.produto_id}
                                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#0d1526] border border-slate-800/90 text-xs"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                          {sug.item.prioridade && (
                                            <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-slate-800 text-cyan-300">
                                              {sug.item.prioridade}
                                            </span>
                                          )}
                                          <span className="font-bold text-white truncate">{sug.item.descricao}</span>
                                        </div>
                                        <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                                          <span>Est: {sug.item.saldo} un</span>
                                          <span>•</span>
                                          <span>Giro: {sug.item.vmd_ponderado}/dia</span>
                                          <span>•</span>
                                          <span>{sug.item.qtd_sugerida_7d} un × R$ {sug.precoNaDist.toFixed(2)}</span>
                                          {sug.jaSelecionadoOutraDist && (
                                            <span className="text-amber-400">(Atualmente em {sug.item.fornecedor_1?.split(' ')[0]})</span>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className="font-black text-emerald-300 text-xs">
                                          + R$ {sug.subtotalNaDist.toFixed(2)}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleIncluirSugestaoMinimo(grupo.distribuidora, sug)}
                                          className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-black cursor-pointer transition-colors flex items-center gap-1"
                                        >
                                          <Plus className="w-3 h-3" />
                                          <span>Incluir</span>
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Rodapé do Modal */}
            <div className="p-4 bg-[#080e1a] border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-400">
                Portais liberados e selecionados:{' '}
                <b className="text-emerald-400">
                  {resumo.grupos.filter(g => portaisMarcadosFinalizar[g.distribuidora] && g.atingiuMinimo).length}
                </b>{' '}
                de {resumo.grupos.length}
                {resumo.grupos.some(g => !g.atingiuMinimo) && (
                  <span className="text-rose-400 ml-2 font-medium">
                    (⚠️ {resumo.grupos.filter(g => !g.atingiuMinimo).length} portal(is) com envio bloqueado)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={executandoCarrinhos}
                  onClick={() => setModalFinalizarOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer disabled:opacity-40"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  disabled={
                    executandoCarrinhos ||
                    resumo.grupos.filter(g => portaisMarcadosFinalizar[g.distribuidora] && g.atingiuMinimo).length === 0 ||
                    resumo.grupos.some(g => portaisMarcadosFinalizar[g.distribuidora] && !g.atingiuMinimo)
                  }
                  onClick={handleExecutarFinalizacaoPortais}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black shadow-lg shadow-emerald-950/60 flex items-center gap-2 cursor-pointer transition-all"
                  title={
                    resumo.grupos.some(g => portaisMarcadosFinalizar[g.distribuidora] && !g.atingiuMinimo)
                      ? 'Envio bloqueado: Há distribuidoras selecionadas que não atingiram o pedido mínimo'
                      : 'Confirmar e montar carrinhos'
                  }
                >
                  {executandoCarrinhos ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Montando Carrinhos nos Portais...</span>
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-4 h-4" />
                      <span>Confirmar e Montar Carrinhos ({resumo.grupos.filter(g => portaisMarcadosFinalizar[g.distribuidora] && g.atingiuMinimo).length})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
