import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Filter,
  Pencil,
  Save,
  Search,
  ChevronLeft,
  ChevronRight,
  Info,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  PlusCircle
} from 'lucide-react';
import { User } from '../types';
import { useToast } from './ToastContext';
import { LiquidacaoEncarteArtes } from './LiquidacaoEncarteArtes';

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
  cod_barras?: string;
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
  dias_parado?: number;
  sugestao_desconto?: number;
  motivo_sugestao?: string;
  selecionado?: boolean;
  imagem_url?: string;
}

interface LiquidacaoCaixaProps {
  user: User;
}

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// Helper para calcular último dia deste mês
const getFimDesteMes = () => {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = agora.getMonth();
  const ultimoDia = new Date(ano, mes + 1, 0);
  const yyyy = ultimoDia.getFullYear();
  const mm = String(ultimoDia.getMonth() + 1).padStart(2, '0');
  const dd = String(ultimoDia.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const LiquidacaoCaixa: React.FC<LiquidacaoCaixaProps> = ({ user }) => {
  const { addToast } = useToast();

  const [resumo, setResumo] = useState<ResumoData | null>(null);
  const [itensAtivos, setItensAtivos] = useState<ItemAtivo[]>([]);
  const [abaModulo, setAbaModulo] = useState<'ofertas' | 'artes'>('ofertas');

  const [loadingResumo, setLoadingResumo] = useState(true);
  const [loadingItens, setLoadingItens] = useState(false);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  // Filtros & Busca Instantânea
  const [termoBusca, setTermoBusca] = useState<string>('');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('TODOS');
  const [filtroDias, setFiltroDias] = useState<string>('TODOS');
  const [itensPorPagina, setItensPorPagina] = useState<number>(50);
  const [paginaAtual, setPaginaAtual] = useState<number>(1);
  const [carregandoTodos45d, setCarregandoTodos45d] = useState<boolean>(false);

  // Modais e opções de impressão
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [modoImpressao, setModoImpressao] = useState<'tabela_a4' | 'termica'>('tabela_a4');
  const [tipoQtdImpressao, setTipoQtdImpressao] = useState<'preencher' | '1' | '2' | '3'>('preencher');
  const [copiedWhatsapp, setCopiedWhatsapp] = useState(false);
  const [loadingWhatsapp, setLoadingWhatsapp] = useState(false);

  // Estados para edição direta na lista de ofertas ativas
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editPreco, setEditPreco] = useState<string>('');
  const [editDataTermino, setEditDataTermino] = useState<string>('');
  const [savingEditId, setSavingEditId] = useState<string | null>(null);

  // 3 Faixas de Descontos Padrões Personalizáveis (editáveis pela Nayane)
  const [faixa1Pct, setFaixa1Pct] = useState<number>(30); // 45 a 90 dias (Giro Rápido)
  const [faixa2Pct, setFaixa2Pct] = useState<number>(50); // 91 a 180 dias (Resgate de Caixa)
  const [faixa3Pct, setFaixa3Pct] = useState<number>(70); // > 180 dias (Queima Total 1º Aniversário)

  // Gravação e Reset em lote
  const [gravandoLote, setGravandoLote] = useState<boolean>(false);
  const [resetandoLote, setResetandoLote] = useState<boolean>(false);

  // Sinalização de cores de alerta e legenda oculta/recolhível
  const [mostrarLegenda, setMostrarLegenda] = useState<boolean>(false);
  const [detalheItemJustificativa, setDetalheItemJustificativa] = useState<string | null>(null);

  // Inclusão Avulsa Livre de Produtos do Estoque
  const [showModalIncluirAvulso, setShowModalIncluirAvulso] = useState<boolean>(false);
  const [termoBuscaEstoque, setTermoBuscaEstoque] = useState<string>('');
  const [resultadosBuscaEstoque, setResultadosBuscaEstoque] = useState<any[]>([]);
  const [buscandoEstoque, setBuscandoEstoque] = useState<boolean>(false);
  const [produtoSelecionadoParaInclusao, setProdutoSelecionadoParaInclusao] = useState<any | null>(null);
  const [avulsoDescontoPct, setAvulsoDescontoPct] = useState<number>(30);
  const [avulsoPrecoPromo, setAvulsoPrecoPromo] = useState<string>('');
  const [avulsoDataInicio, setAvulsoDataInicio] = useState<string>('2026-10-05');
  const [avulsoDataTermino, setAvulsoDataTermino] = useState<string>('2026-10-31');
  const [avulsoSincronizarDigifarma, setAvulsoSincronizarDigifarma] = useState<boolean>(true);
  const [salvandoAvulso, setSalvandoAvulso] = useState<boolean>(false);

  // Debounce para busca no estoque
  useEffect(() => {
    if (!showModalIncluirAvulso || produtoSelecionadoParaInclusao) return;
    const q = termoBuscaEstoque.trim();
    if (q.length < 2) {
      setResultadosBuscaEstoque([]);
      return;
    }

    const timer = setTimeout(async () => {
      setBuscandoEstoque(true);
      try {
        const res = await fetch(`/api/liquidacao/pesquisar-estoque?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setResultadosBuscaEstoque(data.produtos || []);
        }
      } catch (err) {
        console.error('Erro ao pesquisar produto no estoque:', err);
      } finally {
        setBuscandoEstoque(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [termoBuscaEstoque, showModalIncluirAvulso, produtoSelecionadoParaInclusao]);

  const handleSelecionarProdutoEstoque = (prod: any) => {
    setProdutoSelecionadoParaInclusao(prod);
    const precoNormal = Number(prod.preco_normal) || Number(prod.preco_tabela) || 0;
    const precoCusto = Number(prod.preco_custo) || (precoNormal * 0.6);
    const pct = 30;
    const precoCalc = Math.round(precoNormal * (1 - pct / 100) * 100) / 100;
    const precoFinal = Math.max(precoCusto, precoCalc);
    const descReal = precoNormal > 0 ? Math.max(0, Math.round(((precoNormal - precoFinal) / precoNormal) * 100)) : pct;

    setAvulsoDescontoPct(descReal);
    setAvulsoPrecoPromo(precoFinal.toFixed(2));
    setAvulsoDataInicio(resumo?.campanha?.dataInicio || '2026-10-05');
    setAvulsoDataTermino(resumo?.campanha?.dataFim || '2026-10-31');
  };

  const handleMudarDescontoAvulso = (novoPct: number) => {
    setAvulsoDescontoPct(novoPct);
    if (!produtoSelecionadoParaInclusao) return;
    const precoNormal = Number(produtoSelecionadoParaInclusao.preco_normal) || Number(produtoSelecionadoParaInclusao.preco_tabela) || 0;
    const precoCusto = Number(produtoSelecionadoParaInclusao.preco_custo) || 0;
    const precoCalc = Math.round(precoNormal * (1 - novoPct / 100) * 100) / 100;
    const precoFinal = Math.max(precoCusto, precoCalc);
    setAvulsoPrecoPromo(precoFinal.toFixed(2));
  };

  const handleMudarPrecoPromoAvulso = (novoPrecoStr: string) => {
    setAvulsoPrecoPromo(novoPrecoStr);
    if (!produtoSelecionadoParaInclusao) return;
    const precoNormal = Number(produtoSelecionadoParaInclusao.preco_normal) || Number(produtoSelecionadoParaInclusao.preco_tabela) || 0;
    const val = parseFloat(novoPrecoStr.replace(',', '.'));
    if (!isNaN(val) && val > 0 && precoNormal > 0) {
      const descReal = Math.max(0, Math.round(((precoNormal - val) / precoNormal) * 100));
      setAvulsoDescontoPct(descReal);
    }
  };

  const handleSalvarProdutoAvulso = async () => {
    if (!produtoSelecionadoParaInclusao) return;
    const precoVal = parseFloat(avulsoPrecoPromo.replace(',', '.'));
    if (isNaN(precoVal) || precoVal <= 0) {
      addToast('Informe um preço promocional válido.', 'warning');
      return;
    }

    const precoCusto = Number(produtoSelecionadoParaInclusao.preco_custo) || 0;
    if (precoCusto > 0 && precoVal < precoCusto) {
      const confirmAbaixoCusto = window.confirm(
        `Atenção: O preço promocional (${fmt(precoVal)}) é inferior ao custo de cadastro (${fmt(precoCusto)}).\nDeseja incluir mesmo assim com margem negativa?`
      );
      if (!confirmAbaixoCusto) return;
    }

    setSalvandoAvulso(true);
    try {
      const res = await fetch('/api/liquidacao/incluir-avulso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produto_id: produtoSelecionadoParaInclusao.produto_id,
          preco_promocional: precoVal,
          desconto_percentual: avulsoDescontoPct,
          data_inicio: avulsoDataInicio || '2026-10-05',
          data_termino: avulsoDataTermino || '2026-10-31',
          sincronizar_digifarma: avulsoSincronizarDigifarma
        })
      });

      const data = await res.json();
      if (res.ok && data.success && data.item) {
        addToast(`🔥 ${data.message}`, 'success');
        
        // Garante coerência de tipos numéricos no estado local
        const itemFormatado = {
          ...data.item,
          saldo_estoque: Number(data.item.saldo_estoque) || 0,
          preco_custo: Number(data.item.preco_custo) || 0,
          preco_normal: Number(data.item.preco_normal) || 0,
          preco_promocional: Number(data.item.preco_promocional) || precoVal,
          desconto_percentual: Number(data.item.desconto_percentual) || avulsoDescontoPct,
          dias_parado: Number(data.item.dias_parado) || 0,
          selecionado: true
        };

        setItensAtivos(prev => {
          const index = prev.findIndex(i => Number(i.produto_id) === Number(itemFormatado.produto_id));
          if (index >= 0) {
            const copia = [...prev];
            copia[index] = { ...copia[index], ...itemFormatado };
            return copia;
          } else {
            return [itemFormatado, ...prev];
          }
        });

        await fetchResumo();
        await fetchItensAtivos();
        setPaginaAtual(1);

        // Reseta busca para permitir incluir outros produtos sem fechar
        setProdutoSelecionadoParaInclusao(null);
        setTermoBuscaEstoque('');
        setResultadosBuscaEstoque([]);
      } else {
        addToast(data.error || 'Erro ao incluir produto.', 'error');
      }
    } catch (e) {
      console.error('Erro ao incluir produto avulso:', e);
      addToast('Falha na comunicação com o servidor.', 'error');
    } finally {
      setSalvandoAvulso(false);
    }
  };

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
    setLoadingItens(true);
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
    } finally {
      setLoadingItens(false);
    }
  }, []);

  // Recarregar toda a base com produtos parados há 45+ dias
  const handleCarregarTodos45d = async () => {
    const confirma = window.confirm(
      'Deseja carregar todos os produtos do estoque parados há 45 dias ou mais? Os produtos mais críticos virão no topo da lista.'
    );
    if (!confirma) return;

    setCarregandoTodos45d(true);
    try {
      const res = await fetch('/api/liquidacao/carregar-todos-45d', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`🔥 ${data.message}`, 'success');
        await fetchItensAtivos();
        await fetchResumo();
        setPaginaAtual(1);
      } else {
        addToast(data.error || 'Erro ao carregar produtos parados.', 'error');
      }
    } catch (e) {
      console.error('Erro ao recarregar produtos 45d:', e);
      addToast('Falha na comunicação com o servidor.', 'error');
    } finally {
      setCarregandoTodos45d(false);
    }
  };

  const handleTrocarCategoria = (novaCat: string) => {
    setFiltroCategoria(novaCat);
    setPaginaAtual(1);
  };

  // ─── ETIQUETAS FÍSICAS 39x39mm (ALTO CONTRASTE ATACADO & 1º ANIVERSÁRIO) ───
  interface DadosEtiqueta39 {
    descricao: string;
    apresentacao?: string;
    preco_normal: number;
    preco_promocional: number;
    desconto_percentual?: number;
    cod_barras?: string;
    ean?: string;
    produto_id?: number;
    data_termino?: string;
  }

  // Gera o CSS base unificado para 39x39mm
  const getCssBase39mm = () => `
    * {
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      margin: 0;
      padding: 0;
    }
    .tag-39mm {
      position: relative;
      width: 39mm;
      height: 39mm;
      max-width: 39mm;
      max-height: 39mm;
      box-sizing: border-box;
      padding: 1.0mm 1.0mm 0.6mm 1.0mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      border-radius: 1.2mm;
      text-align: center;
      background: #ffffff;
      overflow: hidden;
      font-family: Arial, Helvetica, sans-serif;
    }
    .tag-watermark {
      position: absolute;
      top: 52%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-28deg);
      font-size: 3.8mm;
      font-weight: 900;
      color: rgba(0, 0, 0, 0.08);
      text-transform: uppercase;
      white-space: nowrap;
      pointer-events: none;
      z-index: 1;
      letter-spacing: 0.2mm;
      line-height: 1;
    }
    .tag-header {
      position: relative;
      z-index: 2;
      color: #ffffff;
      padding: 0.35mm 0.7mm;
      border-radius: 0.5mm;
      display: flex;
      align-items: center;
      justify-content: space-between;
      line-height: 1;
    }
    .tag-brand-name {
      font-size: 2.1mm;
      font-weight: 900;
      letter-spacing: 0.15mm;
      text-transform: uppercase;
    }
    .tag-anniv-pill {
      font-size: 1.5mm;
      font-weight: 900;
      background: rgba(255, 255, 255, 0.28);
      padding: 0.2mm 0.5mm;
      border-radius: 0.4mm;
      letter-spacing: 0.1mm;
      text-transform: uppercase;
    }
    .tag-title {
      position: relative;
      z-index: 2;
      font-size: 2.1mm;
      font-weight: 900;
      color: #0f172a;
      line-height: 1.12;
      max-height: 5.0mm;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      text-transform: uppercase;
      margin: 0.15mm 0;
      word-break: break-word;
    }
    .tag-box {
      position: relative;
      z-index: 2;
      border-radius: 0.8mm;
      padding: 0.35mm 0.6mm;
      margin: 0.1mm 0;
    }
    .tag-box-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 1.7mm;
      line-height: 1;
    }
    .tag-de {
      color: #64748b;
      text-decoration: line-through;
      font-weight: 700;
    }
    .tag-econ {
      font-weight: 900;
      font-size: 1.6mm;
      text-transform: uppercase;
      letter-spacing: -0.05mm;
    }
    .tag-por-container {
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: 0.5mm;
      margin-top: 0.15mm;
      line-height: 1;
    }
    .tag-por-label {
      font-size: 2.0mm;
      font-weight: 900;
    }
    .tag-por-val {
      font-size: 5.2mm;
      font-weight: 900;
      letter-spacing: -0.25mm;
      line-height: 1;
    }
    .tag-footer {
      position: relative;
      z-index: 2;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 0.2mm solid #e2e8f0;
      padding-top: 0.3mm;
      line-height: 1;
    }
    .tag-badge {
      padding: 0.2mm 0.6mm;
      border-radius: 0.4mm;
      font-size: 1.9mm;
      font-weight: 900;
      letter-spacing: 0.1mm;
      text-transform: uppercase;
    }
    .tag-validade {
      font-size: 1.6mm;
      font-weight: 800;
      color: #475569;
    }
    .tag-ean {
      position: relative;
      z-index: 2;
      font-size: 1.4mm;
      font-family: monospace;
      color: #94a3b8;
      line-height: 1;
      margin-top: 0.15mm;
      white-space: nowrap;
      overflow: hidden;
    }
  `;

  // Gera o HTML interno de uma etiqueta 39x39mm com cores dinâmicas e marca d'água
  const gerarTagHtml = (item: DadosEtiqueta39) => {
    const valNormal = item.preco_normal || 0;
    const valPromo = item.preco_promocional || 0;
    const descPct = item.desconto_percentual || (valNormal > 0 ? Math.round(((valNormal - valPromo) / valNormal) * 100) : 0);
    const economiaReais = Math.max(0, valNormal - valPromo);
    const validadeFormatada = item.data_termino ? item.data_termino.split('-').reverse().join('/') : '';
    const eanLimpo = item.ean ? item.ean.trim() : (item.cod_barras ? item.cod_barras.trim() : '');

    // Cores dinâmicas por faixa de desconto (Atacado / Alto Contraste)
    let corTema = '#ca8a04'; // Amarelo/Ouro p/ Giro Rápido
    let corBorda = '#ca8a04';
    let corFundoBox = '#fefce8';
    let corBadge = '#f59e0b';
    let corBadgeTexto = '#000000';

    if (descPct >= 60) {
      corTema = '#dc2626'; // Vermelho Queima Total 1º Aniversário
      corBorda = '#dc2626';
      corFundoBox = '#fef2f2';
      corBadge = '#dc2626';
      corBadgeTexto = '#fef08a';
    } else if (descPct >= 40) {
      corTema = '#ea580c'; // Laranja Metade do Preço
      corBorda = '#ea580c';
      corFundoBox = '#fff7ed';
      corBadge = '#ea580c';
      corBadgeTexto = '#ffffff';
    }

    return `
      <div class="tag-39mm" style="border: 0.5mm solid ${corBorda};">
        <div class="tag-watermark">1 ANO BELAFARMA</div>

        <div class="tag-header" style="background: ${corTema};">
          <span class="tag-brand-name">BELAFARMA</span>
          <span class="tag-anniv-pill">1º ANIVERSÁRIO</span>
        </div>

        <div class="tag-title">${item.descricao}${item.apresentacao ? ' ' + item.apresentacao : ''}</div>

        <div class="tag-box" style="background: ${corFundoBox}; border: 0.3mm dashed ${corTema};">
          <div class="tag-box-top">
            <span class="tag-de">DE: R$ ${valNormal.toFixed(2).replace('.', ',')}</span>
            ${economiaReais > 0 ? `<span class="tag-econ" style="color: ${corTema};">ECONOMIZE R$ ${economiaReais.toFixed(2).replace('.', ',')}</span>` : ''}
          </div>
          <div class="tag-por-container">
            <span class="tag-por-label" style="color: ${corTema};">POR:</span>
            <span class="tag-por-val" style="color: ${corTema};">R$ ${valPromo.toFixed(2).replace('.', ',')}</span>
          </div>
        </div>

        <div class="tag-footer">
          <span class="tag-badge" style="background: ${corBadge}; color: ${corBadgeTexto};">
            ${descPct > 0 ? `-${descPct}% OFF` : 'OFERTA'}
          </span>
          <span class="tag-validade">ATÉ ${validadeFormatada || '-'}</span>
        </div>

        ${eanLimpo ? `<div class="tag-ean">EAN: ${eanLimpo} | ID: ${item.produto_id || ''}</div>` : `<div class="tag-ean">ID: ${item.produto_id || ''}</div>`}
      </div>
    `;
  };

  // Impressão individual da etiqueta 39x39mm
  const imprimirEtiqueta39x39 = (dadosCustom?: DadosEtiqueta39) => {
    let dados: DadosEtiqueta39;

    if (dadosCustom) {
      dados = dadosCustom;
    } else {
      if (itensAtivos.length === 0) return;
      const first = itensAtivos[0];
      dados = {
        descricao: first.descricao,
        apresentacao: first.apresentacao,
        preco_normal: first.preco_normal,
        preco_promocional: first.preco_promocional,
        cod_barras: first.ean,
        ean: first.ean,
        produto_id: first.produto_id,
        data_termino: first.data_termino
      };
    }

    const printWindow = window.open('', '_blank', 'width=450,height=450');
    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Etiqueta 39x39mm - ${dados.descricao}</title>
        <meta charset="utf-8" />
        <style>
          @page {
            size: 39mm 39mm;
            margin: 0mm;
          }
          html, body {
            margin: 0;
            padding: 0;
            width: 39mm;
            height: 39mm;
            max-width: 39mm;
            max-height: 39mm;
            overflow: hidden;
            background: #fff;
          }
          ${getCssBase39mm()}
        </style>
      </head>
      <body>
        ${gerarTagHtml(dados)}
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Helper para expandir quantidade de etiquetas para folha completa
  const expandirItensPorQtd = (itens: ItemAtivo[], modoQtd: 'preencher' | '1' | '2' | '3') => {
    if (!itens || itens.length === 0) return [];
    if (modoQtd === '1') return [...itens];
    if (modoQtd === '2') return itens.flatMap(it => [it, it]);
    if (modoQtd === '3') return itens.flatMap(it => [it, it, it]);
    
    // 'preencher': preenche múltiplos exatos de 35 (folha A4 completa 5 colunas x 7 linhas)
    const porFolha = 35;
    const totalFolhas = Math.max(1, Math.ceil(itens.length / porFolha));
    const totalDesejado = totalFolhas * porFolha;
    const resultado: ItemAtivo[] = [];
    let i = 0;
    while (resultado.length < totalDesejado) {
      resultado.push(itens[i % itens.length]);
      i++;
    }
    return resultado;
  };

  // Impressão em Folha A4 em formato de TABELA com até 35 etiquetas de 39x39mm por folha
  const imprimirTabelaFolhaA4 = (itensOriginais: ItemAtivo[], modoQtd: 'preencher' | '1' | '2' | '3') => {
    if (!itensOriginais || itensOriginais.length === 0) return;

    const printWindow = window.open('', '_blank', 'width=950,height=950');
    if (!printWindow) {
      window.print();
      return;
    }

    const listaFinal = expandirItensPorQtd(itensOriginais, modoQtd);
    const itensPorFolha = 35; // 5 colunas x 7 linhas
    const totalFolhas = Math.ceil(listaFinal.length / itensPorFolha);
    const folhasHtml: string[] = [];

    for (let f = 0; f < totalFolhas; f++) {
      const itensDestaFolha = listaFinal.slice(f * itensPorFolha, (f + 1) * itensPorFolha);
      let trsHtml = '';

      for (let r = 0; r < 7; r++) {
        let tdsHtml = '';
        for (let c = 0; c < 5; c++) {
          const idx = r * 5 + c;
          const item = itensDestaFolha[idx];
          if (item) {
            tdsHtml += `<td class="celula-39mm">${gerarTagHtml(item)}</td>`;
          } else {
            tdsHtml += `<td class="celula-39mm celula-vazia"><div class="vazia-guia">39×39mm</div></td>`;
          }
        }
        trsHtml += `<tr class="linha-39mm">${tdsHtml}</tr>`;
      }

      folhasHtml.push(`
        <div class="folha-a4">
          <table class="tabela-folha">
            <tbody>
              ${trsHtml}
            </tbody>
          </table>
        </div>
      `);
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Tabela de Etiquetas 39x39mm (Folha A4) - BelaFarma</title>
        <meta charset="utf-8" />
        <style>
          @page {
            size: A4 portrait;
            margin: 10mm 7.5mm 10mm 7.5mm;
          }
          html, body {
            margin: 0;
            padding: 0;
            background: #fff;
            font-family: Arial, Helvetica, sans-serif;
          }
          .folha-a4 {
            width: 195mm;
            height: 273mm;
            max-width: 195mm;
            max-height: 273mm;
            margin: 0 auto;
            page-break-after: always;
            break-after: page;
            box-sizing: border-box;
            overflow: hidden;
          }
          .folha-a4:last-child {
            page-break-after: avoid;
            break-after: avoid;
          }
          .tabela-folha {
            width: 195mm;
            height: 273mm;
            border-collapse: collapse;
            table-layout: fixed;
            margin: 0;
            padding: 0;
          }
          .linha-39mm {
            height: 39mm;
            max-height: 39mm;
          }
          .celula-39mm {
            width: 39mm;
            height: 39mm;
            max-width: 39mm;
            max-height: 39mm;
            min-width: 39mm;
            min-height: 39mm;
            box-sizing: border-box;
            padding: 0.4mm;
            vertical-align: middle;
            border: 0.15mm dashed #cbd5e1;
          }
          .celula-vazia {
            border: 0.15mm dashed #e2e8f0;
            background: #f8fafc;
            text-align: center;
          }
          .vazia-guia {
            font-size: 1.5mm;
            color: #cbd5e1;
            font-family: monospace;
          }
          .celula-39mm .tag-39mm {
            width: 38.2mm;
            height: 38.2mm;
            max-width: 38.2mm;
            max-height: 38.2mm;
            margin: 0 auto;
          }
          ${getCssBase39mm()}
        </style>
      </head>
      <body>
        ${folhasHtml.join('')}
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Impressão em rolo térmico (1 por página 39x39mm)
  const imprimirLoteTermica = (itens: ItemAtivo[]) => {
    if (!itens || itens.length === 0) return;

    const printWindow = window.open('', '_blank', 'width=500,height=600');
    if (!printWindow) {
      window.print();
      return;
    }

    const tagsHtml = itens.map(item => `
      <div class="tag-page">
        ${gerarTagHtml(item)}
      </div>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Etiquetas 39x39mm (${itens.length} itens) - BelaFarma</title>
        <meta charset="utf-8" />
        <style>
          @page {
            size: 39mm 39mm;
            margin: 0mm;
          }
          html, body {
            margin: 0;
            padding: 0;
            background: #fff;
            font-family: Arial, Helvetica, sans-serif;
          }
          .tag-page {
            width: 39mm;
            height: 39mm;
            max-width: 39mm;
            max-height: 39mm;
            overflow: hidden;
            page-break-after: always;
            break-after: page;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          ${getCssBase39mm()}
        </style>
      </head>
      <body>
        ${tagsHtml}
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
  }, [fetchResumo, fetchItensAtivos]);

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

  // Ação: Iniciar Edição Direta na Lista
  const handleIniciarEdicao = (item: ItemAtivo) => {
    setEditingItemId(item.id);
    setEditPreco(item.preco_promocional.toFixed(2));
    setEditDataTermino(item.data_termino || getFimDesteMes());
  };

  // Ação: Cancelar Edição
  const handleCancelarEdicao = () => {
    setEditingItemId(null);
    setEditPreco('');
    setEditDataTermino('');
  };

  // Ação: Salvar Edição Direta no Digifarma
  const handleSalvarEdicao = async (item: ItemAtivo) => {
    const finalPrice = parseFloat(editPreco.replace(',', '.'));
    if (isNaN(finalPrice) || finalPrice <= 0) {
      addToast('Por favor, informe um preço promocional válido.', 'error');
      return;
    }

    if (!editDataTermino) {
      addToast('Por favor, selecione uma data de término válida.', 'error');
      return;
    }

    if (item.preco_custo > 0 && finalPrice < item.preco_custo) {
      addToast(`Bloqueado: O valor de ${fmt(finalPrice)} não pode ficar abaixo do preço de custo (${fmt(item.preco_custo)}).`, 'error');
      return;
    }

    setSavingEditId(item.id);
    try {
      const res = await fetch('/api/liquidacao/atualizar-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          produto_id: item.produto_id,
          preco_promocional: finalPrice,
          data_termino: editDataTermino
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`✅ Oferta de "${item.descricao}" atualizada para ${fmt(finalPrice)} até ${editDataTermino.split('-').reverse().join('/')} no Digifarma!`, 'success');
        setItensAtivos(prev => prev.map(it => {
          if (it.id === item.id) {
            return {
              ...it,
              preco_promocional: finalPrice,
              desconto_percentual: data.desconto_percentual !== undefined ? data.desconto_percentual : it.desconto_percentual,
              data_termino: editDataTermino
            };
          }
          return it;
        }));
        setEditingItemId(null);
        fetchResumo();
      } else {
        addToast(data.error || 'Erro ao atualizar no Digifarma.', 'error');
      }
    } catch (e) {
      console.error('Erro ao atualizar oferta:', e);
      addToast('Falha na comunicação com o servidor.', 'error');
    } finally {
      setSavingEditId(null);
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

  // ─── ESTRATÉGIA DE MARKETING & JUSTIFICATIVA PERSUASIVA (1º ANIVERSÁRIO) ───
  const getSugestaoParaDias = (dias: number) => {
    if (dias > 180) return { pct: faixa3Pct, faixaNum: 3, label: 'Queima Total (+180d)' };
    if (dias >= 91) return { pct: faixa2Pct, faixaNum: 2, label: 'Resgate de Caixa (91-180d)' };
    return { pct: faixa1Pct, faixaNum: 1, label: 'Giro Rápido (45-90d)' };
  };

  // Gera o texto persuasivo de marketing e finanças de varejo farma
  const gerarJustificativaMarketing = (item: ItemAtivo, pctAtual: number, dias: number, sugestaoPct: number) => {
    const meses = Math.max(1, Math.round(dias / 30));
    const pisoCusto = Number(item.preco_custo) || 0;
    const precoCalculado = Math.round(item.preco_normal * (1 - sugestaoPct / 100) * 100) / 100;
    
    // REGRA DE BLINDAGEM: Sugestão NUNCA pode ficar abaixo do preço de custo
    const precoSugeridoNum = Math.max(pisoCusto, precoCalculado);
    const precoSugerido = precoSugeridoNum.toFixed(2);
    const sugestaoRealPct = item.preco_normal > 0 ? Math.max(0, Math.round(((item.preco_normal - precoSugeridoNum) / item.preco_normal) * 100)) : sugestaoPct;
    const travouNoCusto = precoCalculado < pisoCusto;

    const economiaAtual = Math.max(0, item.preco_normal - item.preco_promocional);
    const totalParado = item.preco_custo * (item.saldo_estoque || 1);

    if (pctAtual >= sugestaoRealPct) {
      return {
        status: 'aprovado',
        icone: '🎯',
        titulo: 'Decisão Comercial Estratégica (1º Aniversário)',
        badge: 'Recomendação Assertiva',
        badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300',
        texto: `Excelente escolha, Nayane! Com ${pctAtual}% de desconto, este produto parado há ${dias} dias (${meses} meses) ganha forte apelo de compra por impulso na celebração de 1º Aniversário BelaFarma. O cliente economiza ${fmt(economiaAtual)} na hora, e a farmácia resgata ${fmt(item.preco_promocional * item.saldo_estoque)} em dinheiro vivo para estancar os juros do cheque especial e eliminar de vez o risco de vencimento! ${travouNoCusto ? `(Preço blindado no Custo de ${fmt(pisoCusto)} para garantir zero prejuízo).` : ''}`
      };
    } else {
      return {
        status: 'alerta',
        icone: '⚠️',
        titulo: 'Alerta de Risco Financeiro & Perda por Vencimento',
        badge: 'Desconto Insuficiente p/ Giro',
        badgeClass: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border-red-300',
        texto: `Atenção, Nayane: Este produto já acumula ${dias} dias (${meses} meses) sem venda. Um desconto tímido de apenas ${pctAtual}% não gera o choque visual necessário para compra por impulso, com grande chance de continuar encalhado até vencer — o que significará perda total de 100% do custo (${fmt(totalParado)} jogados fora) enquanto a conta bancária continua acumulando juros de cheque especial. A recomendação profissional é aplicar pelo menos ${sugestaoRealPct}% (venda por ${fmt(Number(precoSugerido))}) para transformar esse produto em dinheiro agora! ${travouNoCusto ? `(Sugestão limitada ao Preço de Custo de ${fmt(pisoCusto)} para não vender no prejuízo).` : ''}`
      };
    }
  };

  // Ação: Aplica desconto rápido em um produto específico da lista
  const aplicarDescontoRapido = (item: ItemAtivo, pct: number) => {
    const precoCalculado = Math.round(item.preco_normal * (1 - pct / 100) * 100) / 100;
    const pisoCusto = Number(item.preco_custo) || 0;
    // REGRA DE BLINDAGEM: Preço NUNCA abaixo do custo
    const novoPreco = Math.max(pisoCusto, precoCalculado);
    const descReal = item.preco_normal > 0 ? Math.max(0, Math.round(((item.preco_normal - novoPreco) / item.preco_normal) * 100)) : pct;
    const travouNoCusto = precoCalculado < pisoCusto;

    setItensAtivos(prev => prev.map(it => {
      if (it.id === item.id) {
        return {
          ...it,
          preco_promocional: novoPreco,
          desconto_percentual: descReal,
          sincronizado_digifarma: 0
        };
      }
      return it;
    }));
    // Se estava editando, atualiza os campos de edição
    if (editingItemId === item.id) {
      setEditPreco(novoPreco.toFixed(2));
    }

    if (travouNoCusto) {
      addToast(`🛡️ ${item.descricao}: Preço limitado a Preço de Custo (${fmt(pisoCusto)} - ${descReal}% OFF) para evitar prejuízo!`, 'warning');
    } else {
      addToast(`Desconto de ${descReal}% selecionado para "${item.descricao}". Preço: ${fmt(novoPreco)}.`, 'info');
    }
  };

  // Ação: Aplica desconto em lote para todos os produtos de uma faixa
  const aplicarFaixaLote = (faixa: 1 | 2 | 3) => {
    const pct = faixa === 3 ? faixa3Pct : faixa === 2 ? faixa2Pct : faixa1Pct;
    let afetados = 0;
    let travadosNoCusto = 0;

    setItensAtivos(prev => prev.map(it => {
      const d = it.dias_parado || 45;
      const match = (faixa === 3 && d > 180) ||
                    (faixa === 2 && d >= 91 && d <= 180) ||
                    (faixa === 1 && d <= 90);
      if (match) {
        afetados++;
        const precoCalculado = Math.round(it.preco_normal * (1 - pct / 100) * 100) / 100;
        const pisoCusto = Number(it.preco_custo) || 0;
        const novoPreco = Math.max(pisoCusto, precoCalculado);
        if (precoCalculado < pisoCusto) travadosNoCusto++;
        const descReal = it.preco_normal > 0 ? Math.max(0, Math.round(((it.preco_normal - novoPreco) / it.preco_normal) * 100)) : pct;

        return {
          ...it,
          preco_promocional: novoPreco,
          desconto_percentual: descReal,
          sincronizado_digifarma: 0
        };
      }
      return it;
    }));

    addToast(
      `⚡ Desconto da Faixa ${faixa} aplicado em ${afetados} produtos! ${travadosNoCusto > 0 ? `(${travadosNoCusto} produtos travados no Preço de Custo para não gerar prejuízo).` : ''}`,
      'success'
    );
  };

  // Ação: Aplica a sugestão inteligente em todos os produtos da lista de acordo com os dias parados
  const aplicarTodasSugestoes = () => {
    let travadosNoCusto = 0;
    setItensAtivos(prev => prev.map(it => {
      const d = it.dias_parado || 45;
      const pct = d > 180 ? faixa3Pct : (d >= 91 ? faixa2Pct : faixa1Pct);
      const precoCalculado = Math.round(it.preco_normal * (1 - pct / 100) * 100) / 100;
      const pisoCusto = Number(it.preco_custo) || 0;
      const novoPreco = Math.max(pisoCusto, precoCalculado);
      if (precoCalculado < pisoCusto) travadosNoCusto++;
      const descReal = it.preco_normal > 0 ? Math.max(0, Math.round(((it.preco_normal - novoPreco) / it.preco_normal) * 100)) : pct;

      return {
        ...it,
        preco_promocional: novoPreco,
        desconto_percentual: descReal,
        sincronizado_digifarma: 0
      };
    }));

    addToast(
      `⚡ Sugestões inteligentes aplicadas em todos os ${itensAtivos.length} produtos! ${travadosNoCusto > 0 ? `(${travadosNoCusto} produtos mantidos no Preço de Custo sem prejuízo).` : ''}`,
      'success'
    );
  };

  // Ação: Gravar Ofertas Selecionadas no Digifarma Firebird
  const handleGravarTodasNoDigifarma = async () => {
    const itensParaGravar = itensAtivos.filter(it => it.selecionado);
    if (itensParaGravar.length === 0) {
      addToast('⚠️ Nenhum produto checado! Marque no botão de check (✓) os produtos que deseja gravar no Digifarma.', 'warning');
      return;
    }
    const confirma = window.confirm(
      `Confirma a gravação de ${itensParaGravar.length} ofertas promocionais SELECIONADAS diretamente no Digifarma Firebird com vigência até ${getFimDesteMes().split('-').reverse().join('/')}?`
    );
    if (!confirma) return;

    setGravandoLote(true);
    try {
      const res = await fetch('/api/liquidacao/gravar-lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: itensParaGravar })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`🚀 ${data.message}`, 'success');
        const gravadosIds = new Set(itensParaGravar.map(it => it.id));
        setItensAtivos(prev => prev.map(it => gravadosIds.has(it.id) ? { ...it, sincronizado_digifarma: 1 } : it));
        fetchResumo();
      } else {
        addToast(data.error || 'Erro ao gravar ofertas no Digifarma.', 'error');
      }
    } catch (e) {
      console.error('Erro ao gravar lote:', e);
      addToast('Falha na comunicação ao gravar no Digifarma.', 'error');
    } finally {
      setGravandoLote(false);
    }
  };

  // Ação: Resetar todos os preços no Digifarma voltando aos preços normais de tabela
  const handleResetarTodasDigifarma = async () => {
    const confirma = window.confirm(
      'ATENÇÃO: Deseja redefinir todos os produtos no Digifarma Firebird de volta aos preços normais de tabela (removendo as promoções)?\n\nA lista continuará na tela para você reavaliar e ajustar os descontos quando quiser.'
    );
    if (!confirma) return;

    setResetandoLote(true);
    try {
      const res = await fetch('/api/liquidacao/reset-digifarma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`🔄 ${data.message}`, 'info');
        setItensAtivos(prev => prev.map(it => ({ ...it, sincronizado_digifarma: 0 })));
        fetchResumo();
      } else {
        addToast(data.error || 'Erro ao resetar no Digifarma.', 'error');
      }
    } catch (e) {
      console.error('Erro ao resetar no Digifarma:', e);
      addToast('Falha na comunicação ao resetar Digifarma.', 'error');
    } finally {
      setResetandoLote(false);
    }
  };

  // Filtro e paginação da lista de produtos parados há 45+ dias
  const itensFiltrados = useMemo(() => {
    return itensAtivos.filter(item => {
      // 1. Busca textual (ID, Descrição, EAN, Apresentação)
      if (termoBusca.trim()) {
        const busca = termoBusca.toLowerCase().trim();
        const idMatch = String(item.produto_id || '').toLowerCase().includes(busca);
        const descMatch = (item.descricao || '').toLowerCase().includes(busca);
        const eanMatch = (item.ean || '').toLowerCase().includes(busca);
        const apresMatch = (item.apresentacao || '').toLowerCase().includes(busca);
        if (!idMatch && !descMatch && !eanMatch && !apresMatch) return false;
      }

      // 2. Filtro Categoria
      if (filtroCategoria !== 'TODOS') {
        const cat = (item.categoria || '').toUpperCase();
        if (filtroCategoria === 'PERFUMARIA') {
          if (!cat.includes('PERFUMARIA') && !cat.includes('HIGIENE') && !cat.includes('COSMETICO')) return false;
        } else if (filtroCategoria === 'GENERICO') {
          if (!cat.includes('GENERICO')) return false;
        } else if (filtroCategoria === 'MARCA') {
          if (!cat.includes('MARCA') && !cat.includes('REFERENCIA') && !cat.includes('ETICO')) return false;
        } else if (filtroCategoria === 'SIMILAR') {
          if (!cat.includes('SIMILAR')) return false;
        } else if (filtroCategoria === 'OUTROS') {
          if (cat.includes('GENERICO') || cat.includes('PERFUMARIA') || cat.includes('MARCA') || cat.includes('SIMILAR')) return false;
        }
      }

      // 3. Filtro Faixa de Dias
      const dias = Number(item.dias_parado) || 45;
      if (filtroDias === 'FAIXA1') {
        if (dias < 45 || dias > 90) return false;
      } else if (filtroDias === 'FAIXA2') {
        if (dias < 91 || dias > 180) return false;
      } else if (filtroDias === 'FAIXA3') {
        if (dias <= 180) return false;
      }

      return true;
    });
  }, [itensAtivos, termoBusca, filtroCategoria, filtroDias]);

  const totalPaginas = itensPorPagina === 0 ? 1 : Math.max(1, Math.ceil(itensFiltrados.length / itensPorPagina));
  const paginaAjustada = Math.min(Math.max(1, paginaAtual), totalPaginas);

  const itensPaginados = useMemo(() => {
    if (itensPorPagina === 0) return itensFiltrados;
    const inicio = (paginaAjustada - 1) * itensPorPagina;
    return itensFiltrados.slice(inicio, inicio + itensPorPagina);
  }, [itensFiltrados, paginaAjustada, itensPorPagina]);

  // Itens Selecionados (Checados para aplicar promoção e gerar etiqueta)
  const itensSelecionados = useMemo(() => {
    return itensAtivos.filter(it => it.selecionado);
  }, [itensAtivos]);

  const idsPaginaAtual = useMemo(() => {
    return itensPaginados.map(it => it.id);
  }, [itensPaginados]);

  const todosDaPaginaSelecionados = useMemo(() => {
    if (itensPaginados.length === 0) return false;
    return itensPaginados.every(it => it.selecionado);
  }, [itensPaginados]);

  const algunsDaPaginaSelecionados = useMemo(() => {
    return itensPaginados.some(it => it.selecionado);
  }, [itensPaginados]);

  // Ação: Alterna seleção de um único produto
  const handleToggleItemSelecionado = async (itemId: string) => {
    const item = itensAtivos.find(it => it.id === itemId);
    if (!item) return;
    const novoStatus = !item.selecionado;

    // Atualização otimista imediata na interface
    setItensAtivos(prev => prev.map(it => it.id === itemId ? { ...it, selecionado: novoStatus } : it));

    try {
      await fetch('/api/liquidacao/toggle-selecionado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, selecionado: novoStatus })
      });
    } catch (e) {
      console.error('Erro ao salvar seleção:', e);
    }
  };

  // Ação: Selecionar ou desmarcar todos os produtos da página atual
  const toggleSelecionarTodosPagina = async () => {
    const novoStatus = !todosDaPaginaSelecionados;
    const targetIds = new Set(idsPaginaAtual);

    setItensAtivos(prev => prev.map(it => targetIds.has(it.id) ? { ...it, selecionado: novoStatus } : it));

    try {
      await fetch('/api/liquidacao/selecionar-todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsPaginaAtual, selecionado: novoStatus ? 1 : 0 })
      });
    } catch (e) {
      console.error('Erro ao selecionar todos da página:', e);
    }
  };

  // Ação: Marcar ou desmarcar todos os produtos da campanha ativa
  const handleMarcarTodosGeral = async (marcar: boolean) => {
    setItensAtivos(prev => prev.map(it => ({ ...it, selecionado: marcar })));

    try {
      await fetch('/api/liquidacao/selecionar-todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selecionado: marcar ? 1 : 0 })
      });
    } catch (e) {
      console.error('Erro ao marcar/desmarcar todos:', e);
    }
  };

  // Simulação de Totais em Tempo Real baseada nos parâmetros atuais e preços promocionais cadastrados
  const simulacaoTotais = useMemo(() => {
    let totalBrutoOriginal = 0;
    let totalCustoEstoque = 0;
    let totalVendaProjetada = 0;
    let totalVendaSimulada = 0;
    let totalUnidades = 0;
    let itensTravadosNoCusto = 0;

    for (const item of itensAtivos) {
      const qtd = Number(item.saldo_estoque) || 0;
      const normal = Number(item.preco_normal) || 0;
      const custo = Number(item.preco_custo) || 0;
      const promo = Number(item.preco_promocional) || 0;
      const dias = Number(item.dias_parado) || 45;

      const pct = dias > 180 ? faixa3Pct : (dias >= 91 ? faixa2Pct : faixa1Pct);
      const precoCalculado = Math.round(normal * (1 - pct / 100) * 100) / 100;
      const precoFaixa = Math.max(custo, precoCalculado);

      if (precoCalculado < custo) {
        itensTravadosNoCusto++;
      }

      // Preço Real: se o item já possui preço promocional cadastrado, respeita ele; senão usa a sugestão da faixa
      const precoReal = promo > 0 ? promo : precoFaixa;

      totalUnidades += qtd;
      totalBrutoOriginal += normal * qtd;
      totalCustoEstoque += custo * qtd;
      totalVendaProjetada += precoReal * qtd;
      totalVendaSimulada += precoFaixa * qtd;
    }

    const totalDescontoConcedido = Math.max(0, totalBrutoOriginal - totalVendaProjetada);
    const margemLucroReais = totalVendaProjetada - totalCustoEstoque;
    const percentualMargem = totalVendaProjetada > 0 ? (margemLucroReais / totalVendaProjetada) * 100 : 0;
    const descontoMedioPct = totalBrutoOriginal > 0 ? (totalDescontoConcedido / totalBrutoOriginal) * 100 : 0;

    return {
      totalVendaProjetada,
      totalVendaSimulada,
      totalCustoEstoque,
      totalBrutoOriginal,
      totalDescontoConcedido,
      margemLucroReais,
      percentualMargem,
      descontoMedioPct,
      totalUnidades,
      itensTravadosNoCusto
    };
  }, [itensAtivos, faixa1Pct, faixa2Pct, faixa3Pct]);

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
            Aceleração Financeira & Queima de Estoque (45+ Dias)
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-3">
            Liquidação & Resgate de Caixa
          </h1>
          <p className="text-sm text-white/90 max-w-2xl leading-relaxed">
            Todos os produtos parados há <strong>45 dias ou mais sem movimentação recente</strong> listados em uma visão única,
            com sugestões de desconto calculadas para acelerar a conversão em caixa e <strong>zerar o Cheque Especial</strong>.
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap md:flex-col gap-2 shrink-0">
          <button
            onClick={() => setAbaModulo(prev => prev === 'ofertas' ? 'artes' : 'ofertas')}
            className={`px-4 py-2.5 active:scale-95 transition-all rounded-2xl text-xs font-black flex items-center justify-center gap-2 shadow-lg cursor-pointer ${
              abaModulo === 'artes'
                ? 'bg-yellow-300 text-slate-950 shadow-yellow-900/40'
                : 'bg-white/20 hover:bg-white/30 text-white border border-white/30 backdrop-blur-md'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            {abaModulo === 'artes' ? 'Voltar para Tabela' : '🎨 Gerar Encartes & Artes'}
          </button>

          <button
            onClick={() => {
              setShowModalIncluirAvulso(true);
              setTermoBuscaEstoque('');
              setResultadosBuscaEstoque([]);
              setProdutoSelecionadoParaInclusao(null);
            }}
            className="px-4 py-2.5 bg-white text-orange-600 hover:bg-orange-50 active:scale-95 transition-all rounded-2xl text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-black/10 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4 text-orange-600" />
            Inserir Manualmente
          </button>

          <button
            onClick={() => { fetchResumo(); fetchItensAtivos(); }}
            disabled={loadingResumo || loadingItens}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 active:scale-95 transition-all rounded-2xl text-xs font-bold flex items-center justify-center gap-2 border border-white/20 backdrop-blur-md cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingResumo || loadingItens ? 'animate-spin' : ''}`} />
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

      {/* ─── ABAS PRINCIPAIS DO MÓDULO ─── */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 w-fit">
        <button
          type="button"
          onClick={() => setAbaModulo('ofertas')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            abaModulo === 'ofertas'
              ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
          }`}
        >
          <Package size={15} />
          <span>Gestão de Preços & Ofertas ({itensAtivos.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setAbaModulo('artes')}
          className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
            abaModulo === 'artes'
              ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
          }`}
        >
          <Sparkles size={15} className={abaModulo === 'artes' ? 'text-yellow-200' : 'text-amber-500'} />
          <span>🎨 Encartes & Artes Promocionais (1º Aniversário)</span>
        </button>
      </div>

      {abaModulo === 'artes' ? (
        <LiquidacaoEncarteArtes
          itens={itensAtivos}
          onAtualizarItens={fetchItensAtivos}
          dataInicioCampanha={resumo?.campanha?.dataInicio || '2026-10-05'}
          dataTerminoCampanha={resumo?.campanha?.dataFim || '2026-10-31'}
        />
      ) : (
        <>
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

        {/* Card 3: Produtos Parados 45+ Dias */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Estoque Parado (45+ Dias)
            </span>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
              <Sparkles size={18} />
            </div>
          </div>

          <div className="my-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-amber-600 dark:text-amber-400">
                {itensAtivos.length}
              </span>
              <span className="text-sm font-bold text-slate-400">produtos elegíveis</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              🔥 Visão completa ordenada por criticidade (dias sem venda e capital imobilizado).
            </p>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
            <span>No Digifarma: <strong>{itensAtivos.filter(i => i.sincronizado_digifarma === 1).length}</strong></span>
            <span>Pendentes: <strong>{itensAtivos.filter(i => i.sincronizado_digifarma !== 1).length}</strong></span>
          </div>
        </div>
      </div>

      {/* ─── 3 CARDS DE DESCONTOS PADRÕES PERSONALIZÁVEIS ─── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Faixas de Desconto Padrões (1º Aniversário BelaFarma)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5 mt-0.5">
              <span>Quanto mais tempo parado sem venda, maior a agressividade sugerida.</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                <ShieldCheck size={11} /> Piso no Custo: Sugestões nunca ficam abaixo do preço de custo
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCarregarTodos45d}
              disabled={carregandoTodos45d}
              className="px-3.5 py-2 rounded-xl text-xs font-black bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 shadow-sm active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Recarrega do estoque todos os produtos parados há 45 dias ou mais sem movimentação recente"
            >
              {carregandoTodos45d ? <Loader2 size={14} className="animate-spin text-amber-400" /> : <RefreshCw size={14} />}
              <span>⚡ Recarregar Base 45+ Dias</span>
            </button>

            <button
              type="button"
              onClick={aplicarTodasSugestoes}
              className="px-3.5 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md shadow-orange-500/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
              title="Aplica 30%, 50% ou 70% automaticamente baseado no tempo parado de cada produto"
            >
              <Sparkles size={14} />
              <span>⚡ Sugestões Automáticas em Todos</span>
            </button>

            <button
              type="button"
              onClick={handleGravarTodasNoDigifarma}
              disabled={gravandoLote || itensSelecionados.length === 0}
              className="px-4 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/25 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Grava os produtos checados diretamente no Digifarma Firebird"
            >
              {gravandoLote ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span>🚀 Gravar Selecionados no Digifarma ({itensSelecionados.length})</span>
            </button>

            <button
              type="button"
              onClick={handleResetarTodasDigifarma}
              disabled={resetandoLote || itensAtivos.length === 0}
              className="px-3 py-2 rounded-xl text-xs font-bold border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Retorna todos os produtos aos preços normais antes da promoção no Digifarma"
            >
              {resetandoLote ? <Loader2 size={14} className="animate-spin text-red-600" /> : <RotateCcw size={14} />}
              <span>Desfazer Todas no Digifarma</span>
            </button>
          </div>
        </div>

        {/* Cards Editáveis de Desconto + Card de Projeção em Tempo Real */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Card 1: Giro Rápido (45 a 90 dias) */}
          <div className="p-5 rounded-3xl border-2 border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200">
                  Faixa 1 • 45 a 90 dias
                </span>
                <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                  {itensAtivos.filter(i => (i.dias_parado || 45) <= 90).length} produtos
                </span>
              </div>

              <h4 className="text-base font-black text-amber-950 dark:text-white mt-2 flex items-center gap-1.5">
                <span>⚡</span> Giro Rápido
              </h4>
              <p className="text-xs text-amber-800/90 dark:text-amber-300/80 mt-1 leading-relaxed">
                Acelera a saída de produtos com menos tempo de casa preservando uma margem saudável.
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-amber-200/80 dark:border-amber-800/60">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-amber-900 dark:text-amber-200">Desconto Padrão:</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="5"
                    max="95"
                    value={faixa1Pct}
                    onChange={(e) => setFaixa1Pct(Number(e.target.value) || 0)}
                    className="w-16 px-2 py-1 text-center font-black text-sm bg-white dark:bg-slate-900 border-2 border-amber-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-amber-950 dark:text-white"
                  />
                  <span className="font-black text-amber-900 dark:text-amber-200 text-sm">%</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => aplicarFaixaLote(1)}
                className="w-full py-2 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Aplicar {faixa1Pct}% nos 45-90 dias ({itensAtivos.filter(i => (i.dias_parado || 45) <= 90).length})</span>
              </button>
            </div>
          </div>

          {/* Card 2: Resgate de Caixa (91 a 180 dias) */}
          <div className="p-5 rounded-3xl border-2 border-orange-300 dark:border-orange-800 bg-orange-50/70 dark:bg-orange-950/20 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-200 dark:bg-orange-900/60 text-orange-900 dark:text-orange-200">
                  Faixa 2 • 91 a 180 dias
                </span>
                <span className="text-xs font-bold text-orange-800 dark:text-orange-300">
                  {itensAtivos.filter(i => (i.dias_parado || 45) >= 91 && (i.dias_parado || 45) <= 180).length} produtos
                </span>
              </div>

              <h4 className="text-base font-black text-orange-950 dark:text-white mt-2 flex items-center gap-1.5">
                <span>💰</span> Resgate de Caixa (Metade do Preço)
              </h4>
              <p className="text-xs text-orange-800/90 dark:text-orange-300/80 mt-1 leading-relaxed">
                Gatilho psicológico irresistível de <strong>50% OFF</strong> para provocar compras por impulso e recuperar capital.
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-orange-200/80 dark:border-orange-800/60">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-orange-900 dark:text-orange-200">Desconto Padrão:</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="5"
                    max="95"
                    value={faixa2Pct}
                    onChange={(e) => setFaixa2Pct(Number(e.target.value) || 0)}
                    className="w-16 px-2 py-1 text-center font-black text-sm bg-white dark:bg-slate-900 border-2 border-orange-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-orange-950 dark:text-white"
                  />
                  <span className="font-black text-orange-900 dark:text-orange-200 text-sm">%</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => aplicarFaixaLote(2)}
                className="w-full py-2 rounded-xl text-xs font-black bg-orange-500 hover:bg-orange-600 active:scale-95 text-white shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Aplicar {faixa2Pct}% nos 91-180 dias ({itensAtivos.filter(i => (i.dias_parado || 45) >= 91 && (i.dias_parado || 45) <= 180).length})</span>
              </button>
            </div>
          </div>

          {/* Card 3: Queima Total 1º Aniversário (+180 dias) */}
          <div className="p-5 rounded-3xl border-2 border-red-400 dark:border-red-800 bg-red-50/70 dark:bg-red-950/25 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-200 dark:bg-red-900/60 text-red-900 dark:text-red-200">
                  Faixa 3 • Mais de 180 dias
                </span>
                <span className="text-xs font-bold text-red-800 dark:text-red-300">
                  {itensAtivos.filter(i => (i.dias_parado || 45) > 180).length} produtos
                </span>
              </div>

              <h4 className="text-base font-black text-red-950 dark:text-white mt-2 flex items-center gap-1.5">
                <span>🔥</span> Queima Total 1º Aniversário
              </h4>
              <p className="text-xs text-red-800/90 dark:text-red-300/80 mt-1 leading-relaxed">
                Liquidação agressiva para evitar perda total por vencimento e juros corrosivos do cheque especial.
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-red-200/80 dark:border-red-800/60">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-red-900 dark:text-red-200">Desconto Padrão:</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="5"
                    max="95"
                    value={faixa3Pct}
                    onChange={(e) => setFaixa3Pct(Number(e.target.value) || 0)}
                    className="w-16 px-2 py-1 text-center font-black text-sm bg-white dark:bg-slate-900 border-2 border-red-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-red-950 dark:text-white"
                  />
                  <span className="font-black text-red-900 dark:text-red-200 text-sm">%</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => aplicarFaixaLote(3)}
                className="w-full py-2 rounded-xl text-xs font-black bg-red-600 hover:bg-red-700 active:scale-95 text-white shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Aplicar {faixa3Pct}% nos +180 dias ({itensAtivos.filter(i => (i.dias_parado || 45) > 180).length})</span>
              </button>
            </div>
          </div>

          {/* Card 4: Total se Vendido com Preços da Campanha */}
          <div className="p-5 rounded-3xl border-2 border-emerald-400 dark:border-emerald-600 bg-gradient-to-br from-emerald-50 via-teal-50/50 to-emerald-100/60 dark:from-slate-900 dark:via-emerald-950/25 dark:to-slate-900 flex flex-col justify-between space-y-4 shadow-sm">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-200 dark:bg-emerald-900/60 text-emerald-950 dark:text-emerald-200 flex items-center gap-1">
                  <Sparkles size={11} className="text-emerald-700 dark:text-emerald-300" />
                  Preços da Campanha
                </span>
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  {simulacaoTotais.totalUnidades} un no total
                </span>
              </div>

              <h4 className="text-base font-black text-emerald-950 dark:text-white mt-2 flex items-center gap-1.5">
                <span>💎</span> Total se Vendido (Resgate)
              </h4>
              <p className="text-xs text-emerald-800/90 dark:text-emerald-300/80 mt-1 leading-relaxed">
                Valor real estimado no caixa se todos os {itensAtivos.length} produtos forem vendidos pelos preços da liquidação.
              </p>
              
              <div className="mt-3 p-3 rounded-2xl bg-white/80 dark:bg-slate-800/80 border border-emerald-200 dark:border-emerald-800/60 shadow-xs">
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                  {fmt(simulacaoTotais.totalVendaProjetada)}
                </div>
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-0.5 flex items-center justify-between">
                  <span>De original: <span className="line-through">{fmt(simulacaoTotais.totalBrutoOriginal)}</span></span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-black">
                    {simulacaoTotais.descontoMedioPct.toFixed(0)}% OFF Médio
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-emerald-200/80 dark:border-emerald-800/60 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400 font-semibold">Custo Total:</span>
                <span className="font-black text-blue-600 dark:text-blue-400">{fmt(simulacaoTotais.totalCustoEstoque)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400 font-semibold">Margem Bruta Real:</span>
                <span className="font-black text-emerald-700 dark:text-emerald-400">
                  +{fmt(simulacaoTotais.margemLucroReais)} ({simulacaoTotais.percentualMargem.toFixed(0)}%)
                </span>
              </div>
              {Math.abs(simulacaoTotais.totalVendaSimulada - simulacaoTotais.totalVendaProjetada) > 0.05 && (
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-emerald-200/50">
                  <span>Simulação pelas Faixas:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">{fmt(simulacaoTotais.totalVendaSimulada)}</span>
                </div>
              )}
              {simulacaoTotais.itensTravadosNoCusto > 0 && (
                <div className="text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-100/80 dark:bg-blue-950/70 px-2 py-1 rounded-lg flex items-center gap-1 border border-blue-200 dark:border-blue-800">
                  <span>🔒</span> {simulacaoTotais.itensTravadosNoCusto} produtos no piso de Custo
                </div>
              )}

              <button
                type="button"
                onClick={aplicarTodasSugestoes}
                className="w-full py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
                title="Aplica exatamente essas faixas nos produtos da tabela"
              >
                <Sparkles size={13} />
                <span>Aplicar em Todos ({itensAtivos.length})</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── BARRA DE BUSCA, FILTROS E PAGINAÇÃO ─── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Campo de Busca Rápida */}
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={termoBusca}
              onChange={(e) => { setTermoBusca(e.target.value); setPaginaAtual(1); }}
              placeholder="Buscar por Cód. ID (ex: 123), Nome do Produto ou EAN..."
              className="w-full pl-10 pr-9 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            {termoBusca && (
              <button
                type="button"
                onClick={() => { setTermoBusca(''); setPaginaAtual(1); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filtro por Faixa de Dias */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl shrink-0 overflow-x-auto">
            {[
              { id: 'TODOS', label: `Todos (${itensAtivos.length})` },
              { id: 'FAIXA1', label: `45-90d (${itensAtivos.filter(i => (i.dias_parado || 45) <= 90).length})` },
              { id: 'FAIXA2', label: `91-180d (${itensAtivos.filter(i => (i.dias_parado || 45) >= 91 && (i.dias_parado || 45) <= 180).length})` },
              { id: 'FAIXA3', label: `+180d (${itensAtivos.filter(i => (i.dias_parado || 45) > 180).length})` },
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => { setFiltroDias(f.id); setPaginaAtual(1); }}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition-all cursor-pointer whitespace-nowrap ${
                  filtroDias === f.id
                    ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Seletor de Itens por Página */}
          <div className="flex items-center gap-2 shrink-0 text-xs">
            <span className="text-slate-400 font-bold hidden sm:inline">Exibir:</span>
            <select
              value={itensPorPagina}
              onChange={(e) => { setItensPorPagina(Number(e.target.value)); setPaginaAtual(1); }}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
            >
              <option value={25}>25 por página</option>
              <option value={50}>50 por página</option>
              <option value={100}>100 por página</option>
              <option value={200}>200 por página</option>
              <option value={0}>Todos ({itensFiltrados.length})</option>
            </select>
          </div>
        </div>

        {/* Filtros Rápidos de Categorias */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-t border-slate-100 dark:border-slate-800">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0 mr-1 flex items-center gap-1">
            <Filter size={11} className="text-orange-500" />
            Categoria:
          </span>
          {[
            { id: 'TODOS', label: 'Todas', icon: '📦' },
            { id: 'PERFUMARIA', label: 'Perfumaria & Higiene', icon: '🧴' },
            { id: 'GENERICO', label: 'Genéricos', icon: '💊' },
            { id: 'MARCA', label: 'Medicamento Marca', icon: '🏷️' },
            { id: 'SIMILAR', label: 'Similares', icon: '🔬' },
            { id: 'OUTROS', label: 'Outros', icon: '✨' },
          ].map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleTrocarCategoria(cat.id)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
                filtroCategoria === cat.id
                  ? 'bg-orange-500 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
          <span className="ml-auto text-[11px] font-bold text-slate-400 shrink-0">
            Mostrando <strong>{itensFiltrados.length}</strong> de {itensAtivos.length}
          </span>
        </div>
      </div>

      {/* ─── TABELA DE ITENS ATIVOS NA CAMPANHA ─── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 md:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Package className="w-5 h-5 text-emerald-500" />
              Ofertas da Liquidação ({itensAtivos.length} produtos mantidos para revisão)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Revise e altere os preços promocionais. Linhas sinalizadas com cores de alerta visual.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowModalIncluirAvulso(true);
                setTermoBuscaEstoque('');
                setResultadosBuscaEstoque([]);
                setProdutoSelecionadoParaInclusao(null);
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 active:scale-95 text-white shadow-md shadow-orange-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
              title="Pesquisar livremente qualquer produto do estoque do Digifarma e incluir com desconto na liquidação"
            >
              <PlusCircle size={15} />
              <span>Inserir Produto Manualmente</span>
            </button>

            {itensAtivos.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setMostrarLegenda(prev => !prev)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    mostrarLegenda
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                  title="Exibir / ocultar legenda de cores das linhas"
                >
                  <HelpCircle size={14} />
                  <span>Legenda</span>
                  {mostrarLegenda ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>

                <button
                  onClick={() => {
                    if (itensSelecionados.length === 0) {
                      addToast('⚠️ Nenhum produto checado! Marque no botão de check (✓) os produtos que deseja gerar etiquetas.', 'warning');
                      return;
                    }
                    setShowPrintModal(true);
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Gera etiquetas térmicas ou A4 para os produtos checados"
                >
                  <Printer size={14} />
                  <span>Gerar Etiquetas ({itensSelecionados.length})</span>
                </button>
                <button
                  onClick={handleCopiarWhatsApp}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy size={14} />
                  WhatsApp
                </button>
              </>
            )}
          </div>
        </div>

        {/* ─── BARRA INFORMATIVA DE PRODUTOS CHECADOS PARA LIQUIDAÇÃO & ETIQUETAS ─── */}
        {itensSelecionados.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 px-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 text-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span className="font-bold text-emerald-900 dark:text-emerald-200">
                <strong>{itensSelecionados.length}</strong> {itensSelecionados.length === 1 ? 'produto checado' : 'produtos checados'} para aplicar promoção e gerar etiquetas
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleMarcarTodosGeral(false)}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer"
              >
                Desmarcar todos
              </button>
              <button
                type="button"
                onClick={() => handleMarcarTodosGeral(true)}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer"
              >
                Marcar todos ({itensAtivos.length})
              </button>
            </div>
          </div>
        )}

        {/* ─── PAINEL DE LEGENDA RECOLHÍVEL / OCULTA ─── */}
        {mostrarLegenda && (
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Cores de Alerta da Linha:
              </span>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0"></span>
                <span className="font-bold text-slate-700 dark:text-slate-200">Verde:</span>
                <span className="text-slate-500">Desconto Assertivo (Recomendado para giro rápido)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-500 shrink-0"></span>
                <span className="font-bold text-slate-700 dark:text-slate-200">Vermelho:</span>
                <span className="text-slate-500">Desconto Tímido (Risco de continuar encalhado até vencer)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0"></span>
                <span className="font-bold text-slate-700 dark:text-slate-200">Azul (🔒):</span>
                <span className="text-slate-500">Preço Travado no Custo (Proteção contra prejuízo)</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMostrarLegenda(false)}
              className="text-[11px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer ml-auto"
            >
              Fechar Legenda ✕
            </button>
          </div>
        )}

        {itensAtivos.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400 font-semibold">
            Nenhuma oferta na lista no momento.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[11px] font-black">
                  {/* Coluna Master de Seleção */}
                  <th className="py-2.5 px-2 text-center w-10 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={toggleSelecionarTodosPagina}
                      className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors inline-flex items-center justify-center cursor-pointer"
                      title={todosDaPaginaSelecionados ? "Desmarcar todos desta página" : "Selecionar todos desta página"}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                        todosDaPaginaSelecionados 
                          ? 'bg-emerald-600 border-emerald-600 text-white' 
                          : algunsDaPaginaSelecionados 
                            ? 'bg-emerald-100 border-emerald-500 text-emerald-700' 
                            : 'border-slate-400 bg-white dark:bg-slate-800'
                      }`}>
                        {todosDaPaginaSelecionados && <Check size={12} strokeWidth={3} />}
                        {!todosDaPaginaSelecionados && algunsDaPaginaSelecionados && <span className="w-2 h-0.5 bg-emerald-600 block"></span>}
                      </div>
                    </button>
                  </th>
                  <th className="py-2.5 px-2 text-center w-14 whitespace-nowrap">Cód.</th>
                  <th className="py-2.5 px-2 text-left whitespace-nowrap">Produto</th>
                  <th className="py-2.5 px-2 text-right w-16 whitespace-nowrap">Saldo</th>
                  <th className="py-2.5 px-2 text-right w-20 text-blue-600 dark:text-blue-400 font-black whitespace-nowrap">Custo</th>
                  <th className="py-2.5 px-2 text-right w-22 whitespace-nowrap">De (Orig.)</th>
                  <th className="py-2.5 px-2 text-center w-28 whitespace-nowrap">Por (Promo)</th>
                  <th className="py-2.5 px-2 text-right w-28 whitespace-nowrap">Desconto</th>
                  <th className="py-2.5 px-2 text-center w-24 whitespace-nowrap">Válido até</th>
                  <th className="py-2.5 px-2 text-center w-20 whitespace-nowrap">Digifarma</th>
                  <th className="py-2.5 px-2 text-center w-20 whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {itensPaginados.map((item) => {
                  const isEditing = editingItemId === item.id;
                  const isSaving = savingEditId === item.id;
                  const dias = Number(item.dias_parado) || 45;
                  const sugestao = getSugestaoParaDias(dias);

                  // Desconto calculado em tempo real durante a edição ou seleção
                  const tempPrice = isEditing ? (parseFloat(editPreco.replace(',', '.')) || 0) : item.preco_promocional;
                  const tempDescPct = item.preco_normal > 0 && tempPrice > 0
                    ? Math.max(0, Math.round(((item.preco_normal - tempPrice) / item.preco_normal) * 100))
                    : (item.desconto_percentual || 0);

                  const economiaReais = Math.max(0, item.preco_normal - (tempPrice || item.preco_promocional));
                  const justificativa = gerarJustificativaMarketing(item, tempDescPct, dias, sugestao.pct);
                  const atingiuCusto = item.preco_custo > 0 && (tempPrice || item.preco_promocional) <= item.preco_custo + 0.001;

                  return (
                    <React.Fragment key={item.id}>
                      <tr 
                        className={`transition-colors border-l-4 ${
                          isEditing 
                            ? 'bg-amber-50/90 dark:bg-amber-950/40 ring-2 ring-amber-400 dark:ring-amber-500/70 z-10 border-l-amber-500' 
                            : atingiuCusto
                              ? 'border-l-blue-500 bg-blue-50/20 dark:bg-blue-950/15 hover:bg-blue-50/40'
                              : justificativa.status === 'aprovado'
                                ? 'border-l-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/10 hover:bg-emerald-50/40'
                                : 'border-l-red-500 bg-red-50/30 dark:bg-red-950/20 hover:bg-red-50/50'
                        } ${item.selecionado ? 'ring-1 ring-inset ring-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/10' : ''}`}
                      >
                        {/* Coluna 0: Botão de Check / Seleção para Promoção & Etiqueta */}
                        <td className="py-2 px-2 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleToggleItemSelecionado(item.id)}
                            className={`w-6 h-6 rounded-md flex items-center justify-center transition-all cursor-pointer ${
                              item.selecionado
                                ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-500/40 hover:bg-emerald-700 active:scale-90'
                                : 'border-2 border-slate-300 dark:border-slate-600 hover:border-emerald-500 text-transparent hover:text-emerald-500/40 active:scale-90'
                            }`}
                            title={
                              item.selecionado
                                ? '✓ Selecionado para Promoção e Etiqueta (Clique para desmarcar)'
                                : 'Clique para selecionar este produto (para aplicar promoção e gerar etiqueta)'
                            }
                          >
                            <Check size={14} strokeWidth={3} className={item.selecionado ? 'opacity-100' : 'opacity-0'} />
                          </button>
                        </td>

                        {/* Coluna 1: Código Interno Digifarma */}
                        <td className="py-2 px-2 text-center font-mono font-black text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          #{item.produto_id}
                        </td>

                        <td className="py-2 px-2 max-w-xs md:max-w-sm lg:max-w-md">
                          <div className="font-bold text-slate-900 dark:text-white truncate" title={item.descricao}>
                            {item.descricao}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5 truncate">
                            {dias > 180 ? (
                              <span className="px-1.5 py-0.2 rounded font-black bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 inline-flex items-center gap-0.5 shrink-0">
                                <Flame size={10} /> {dias}d
                              </span>
                            ) : dias >= 91 ? (
                              <span className="px-1.5 py-0.2 rounded font-black bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 inline-flex items-center gap-0.5 shrink-0">
                                <AlertTriangle size={10} /> {dias}d
                              </span>
                            ) : dias >= 45 ? (
                              <span className="px-1.5 py-0.2 rounded font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 inline-flex items-center gap-0.5 shrink-0">
                                <Clock size={10} /> {dias}d
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded font-black bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 inline-flex items-center gap-0.5 shrink-0" title="Item avulso incluído livremente do estoque">
                                <Sparkles size={10} /> Avulso
                              </span>
                            )}
                            {item.categoria && <span className="truncate">{item.categoria}</span>}
                            {item.apresentacao && <span className="truncate">• {item.apresentacao}</span>}
                            {item.ean && <span className="font-mono text-[9px] shrink-0">• EAN {item.ean}</span>}
                          </div>
                        </td>

                        <td className="py-2 px-2 text-right font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {item.saldo_estoque} un
                        </td>

                        {/* Coluna: Valor de Custo do Produto (em negrito e azul) */}
                        <td className="py-2 px-2 text-right font-black text-blue-600 dark:text-blue-400 whitespace-nowrap">
                          {fmt(item.preco_custo)}
                        </td>

                        <td className="py-2 px-2 text-right text-slate-400 line-through whitespace-nowrap">
                          {fmt(item.preco_normal)}
                        </td>

                        {/* Coluna: Por (Promo) com Botões Rápidos de Desconto */}
                        <td className="py-2 px-2 text-center whitespace-nowrap">
                          <div className="flex flex-col items-center gap-1">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-xs font-bold text-slate-400">R$</span>
                                <input
                                  type="text"
                                  autoFocus
                                  value={editPreco}
                                  onChange={(e) => setEditPreco(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSalvarEdicao(item);
                                    if (e.key === 'Escape') handleCancelarEdicao();
                                  }}
                                  className="w-18 px-1.5 py-0.5 text-center font-black text-xs text-orange-600 dark:text-orange-400 bg-white dark:bg-slate-800 border-2 border-orange-400 rounded-md shadow-inner focus:outline-none"
                                  placeholder="0,00"
                                />
                              </div>
                            ) : (
                              <div
                                onClick={() => handleIniciarEdicao(item)}
                                className="group/price flex items-center justify-center gap-1 cursor-pointer font-black text-orange-600 dark:text-orange-400 text-sm hover:underline"
                                title="Clique para editar valor manualmente"
                              >
                                <span>{fmt(item.preco_promocional)}</span>
                                <Pencil size={10} className="text-slate-400 opacity-0 group-hover/price:opacity-100 transition-opacity" />
                              </div>
                            )}

                            {/* 3 Botões Rápidos de Desconto com badge de Sugestão e trava de custo */}
                            <div className="flex items-center gap-1">
                              {[
                                { pct: faixa1Pct, label: `${faixa1Pct}%`, isSug: sugestao.pct === faixa1Pct },
                                { pct: faixa2Pct, label: `${faixa2Pct}%`, isSug: sugestao.pct === faixa2Pct },
                                { pct: faixa3Pct, label: `${faixa3Pct}%`, isSug: sugestao.pct === faixa3Pct },
                              ].map(btn => {
                                const precoComDesc = Math.round(item.preco_normal * (1 - btn.pct / 100) * 100) / 100;
                                const atingiuCustoBtn = item.preco_custo > 0 && precoComDesc < item.preco_custo;

                                return (
                                  <button
                                    key={btn.pct}
                                    type="button"
                                    onClick={() => aplicarDescontoRapido(item, btn.pct)}
                                    className={`px-1 py-0.5 rounded text-[9px] font-black transition-all cursor-pointer flex items-center gap-0.5 ${
                                      tempDescPct === btn.pct
                                        ? 'bg-slate-900 text-white shadow-xs scale-105'
                                        : btn.isSug
                                          ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border border-amber-400 font-extrabold ring-1 ring-amber-400/50'
                                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                                    }`}
                                    title={atingiuCustoBtn 
                                      ? `🛡️ Limitado ao Preço de Custo (${fmt(item.preco_custo)}) para não gerar prejuízo` 
                                      : (btn.isSug ? `⭐ Desconto Recomendado para ${dias} dias sem venda` : `Aplicar ${btn.pct}%`)}
                                  >
                                    {btn.isSug && <span className="text-amber-500">⭐</span>}
                                    <span>{btn.label}</span>
                                    {atingiuCustoBtn && <span className="text-[8px]" title="Limitado ao Custo">🔒</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </td>

                        {/* Coluna: Desconto recalculado dinamicamente & Economia */}
                        <td className="py-2 px-2 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1 font-black text-emerald-600 dark:text-emerald-400">
                            <span>{tempDescPct}% OFF</span>
                            {economiaReais > 0 && (
                              <span className="text-[10px] font-semibold text-slate-400">
                                (-{fmt(economiaReais)})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-end gap-1 mt-0.5">
                            {atingiuCusto ? (
                              <span 
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-black bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800 cursor-help"
                                title={justificativa.texto}
                              >
                                🔒 Custo
                              </span>
                            ) : justificativa.status === 'aprovado' ? (
                              <span 
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 cursor-help"
                                title={justificativa.texto}
                              >
                                🎯 Ideal
                              </span>
                            ) : (
                              <span 
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-black bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800 cursor-help"
                                title={justificativa.texto}
                              >
                                ⚠️ Tímido
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => setDetalheItemJustificativa(prev => prev === item.id ? null : item.id)}
                              className={`p-0.5 rounded transition-colors cursor-pointer ${
                                detalheItemJustificativa === item.id
                                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                              title={detalheItemJustificativa === item.id ? "Ocultar justificativa" : "Ver justificativa detalhada"}
                            >
                              <Info size={11} />
                            </button>
                          </div>
                        </td>

                        {/* Coluna: Válido até com seletor de data inline */}
                        <td className="py-2 px-2 text-center whitespace-nowrap">
                          {isEditing ? (
                            <input
                              type="date"
                              value={editDataTermino}
                              onChange={(e) => setEditDataTermino(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSalvarEdicao(item);
                                if (e.key === 'Escape') handleCancelarEdicao();
                              }}
                              className="px-1.5 py-0.5 text-xs font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border-2 border-orange-400 rounded-md shadow-inner focus:outline-none"
                            />
                          ) : (
                            <div
                              onClick={() => handleIniciarEdicao(item)}
                              className="group/date inline-flex items-center justify-center gap-1 cursor-pointer text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:underline"
                              title="Clique para editar data de vencimento"
                            >
                              <span>{item.data_termino ? item.data_termino.split('-').reverse().join('/') : '-'}</span>
                              <Pencil size={10} className="text-slate-400 opacity-0 group-hover/date:opacity-100 transition-opacity" />
                            </div>
                          )}
                        </td>

                        {/* Coluna: Status Digifarma */}
                        <td className="py-2 px-2 text-center whitespace-nowrap">
                          {item.sincronizado_digifarma === 1 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800" title="Preço promocional ativo no Digifarma Firebird">
                              <Check size={10} /> Ativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800" title="Aguardando envio para o Digifarma Firebird">
                              <Clock size={10} /> Pendente
                            </span>
                          )}
                        </td>

                        {/* Coluna: Ações / Edição */}
                        <td className="py-2 px-2 text-center whitespace-nowrap">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleSalvarEdicao(item)}
                                disabled={isSaving}
                                className="p-1.5 rounded-lg text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                                title="Salvar alterações no Digifarma"
                              >
                                {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                              </button>
                              <button
                                onClick={handleCancelarEdicao}
                                disabled={isSaving}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                                title="Cancelar edição"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleIniciarEdicao(item)}
                                className="p-1.5 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-all active:scale-95 cursor-pointer shadow-xs"
                                title="Editar valor ou data de vencimento direto na lista"
                              >
                                <Pencil size={13} />
                              </button>

                              <button
                                onClick={() => handleReverter(item)}
                                disabled={revertingId === item.id}
                                className="p-1.5 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/60 transition-all active:scale-95 cursor-pointer shadow-xs disabled:opacity-50"
                                title="Desfazer alteração e voltar ao preço original no Digifarma"
                              >
                                {revertingId === item.id ? (
                                  <Loader2 size={13} className="animate-spin text-red-600" />
                                ) : (
                                  <RotateCcw size={13} />
                                )}
                              </button>

                              <button
                                onClick={() => imprimirEtiqueta39x39({
                                  descricao: item.descricao,
                                  apresentacao: item.apresentacao,
                                  preco_normal: item.preco_normal,
                                  preco_promocional: item.preco_promocional,
                                  desconto_percentual: item.desconto_percentual,
                                  cod_barras: item.ean || item.cod_barras,
                                  ean: item.ean,
                                  produto_id: item.produto_id,
                                  data_termino: item.data_termino
                                })}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-xs cursor-pointer"
                                title="Imprimir Etiqueta 39x39mm deste item"
                              >
                                <Printer size={13} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* ─── BOX DE JUSTIFICATIVA PERSUASIVA (EXIBIDA SOB DEMANDA PARA O PRODUTO) ─── */}
                      {detalheItemJustificativa === item.id && (
                        <tr className="border-b-2 border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 animate-in fade-in duration-200">
                          <td colSpan={11} className="py-2.5 px-4">
                            <div className={`p-3 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs ${
                              atingiuCusto
                                ? 'bg-blue-50/90 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200'
                                : justificativa.status === 'aprovado'
                                  ? 'bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                                  : 'bg-red-50/80 dark:bg-red-950/20 border-red-200 dark:border-red-800/60 text-red-900 dark:text-red-200'
                            }`}>
                              <div className="flex items-start gap-2.5">
                                <span className="text-base shrink-0 mt-0.5">{atingiuCusto ? '🔒' : justificativa.icone}</span>
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-black uppercase tracking-wider text-[11px]">
                                      {atingiuCusto ? 'BLINDAGEM FINANCEIRA ATIVA' : justificativa.titulo}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${justificativa.badgeClass}`}>
                                      {atingiuCusto ? '🔒 Preço Travado no Custo' : justificativa.badge}
                                    </span>
                                  </div>
                                  <p className="leading-relaxed font-normal opacity-95">
                                    {justificativa.texto}
                                  </p>
                                </div>
                              </div>

                              {/* Botões de Ação Imediata & Fechar */}
                              <div className="flex items-center gap-2 shrink-0 self-start md:self-center">
                                {justificativa.status === 'alerta' && (
                                  <button
                                    type="button"
                                    onClick={() => aplicarDescontoRapido(item, sugestao.pct)}
                                    className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 shadow-sm transition-all cursor-pointer flex items-center gap-1"
                                  >
                                    <Sparkles size={12} />
                                    <span>⚡ Aplicar Sugestão ({sugestao.pct}%)</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setDetalheItemJustificativa(null)}
                                  className="text-[11px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-2 py-1 cursor-pointer"
                                >
                                  Fechar ✕
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ─── CONTROLES DE PAGINAÇÃO RÁPIDA ─── */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="text-slate-500 dark:text-slate-400 font-semibold">
              Mostrando <strong>{itensPaginados.length}</strong> de <strong>{itensFiltrados.length}</strong> produtos
              {itensFiltrados.length < itensAtivos.length && ` (filtrado de ${itensAtivos.length} total)`}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaginaAtual(prev => Math.max(1, prev - 1))}
                disabled={paginaAjustada <= 1}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-750 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft size={14} />
                <span>Anterior</span>
              </button>

              <div className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 font-black text-slate-800 dark:text-slate-200">
                Página {paginaAjustada} de {totalPaginas}
              </div>

              <button
                type="button"
                onClick={() => setPaginaAtual(prev => Math.min(totalPaginas, prev + 1))}
                disabled={paginaAjustada >= totalPaginas}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-750 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 cursor-pointer"
              >
                <span>Próxima</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          </>
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
      </>
      )}

      {/* ─── MODAL DE IMPRESSÃO: TABELA EM FOLHA A4 (35 POR FOLHA) & ROLO TÉRMICO ─── */}
      {showPrintModal && (() => {
        const baseParaImprimir = itensSelecionados.length > 0 ? itensSelecionados : itensPaginados;
        const listaParaImprimir = expandirItensPorQtd(baseParaImprimir, tipoQtdImpressao);
        const totalPorFolha = 35;
        const totalFolhasA4 = Math.max(1, Math.ceil(listaParaImprimir.length / totalPorFolha));

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
            <div className="bg-white dark:bg-slate-900 w-full max-w-6xl max-h-[94vh] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Modal Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-orange-100 dark:bg-orange-950/60 text-orange-600">
                    <Flame size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                      Impressão de Etiquetas (39mm × 39mm)
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                        {itensSelecionados.length > 0 ? `${itensSelecionados.length} itens checados` : 'Todos da página'} • {modoImpressao === 'tabela_a4' ? 'Tabela: 35 por Folha A4' : 'Rolo Térmico'}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {modoImpressao === 'tabela_a4'
                        ? 'Agrupa o máximo de etiquetas na mesma folha: 5 colunas × 7 linhas = 35 etiquetas de 39×39mm com linhas de corte.'
                        : 'Formato contínuo de 1 etiqueta por página para impressoras térmicas (Argox, Zebra, Elgin).'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    onClick={() => {
                      if (modoImpressao === 'tabela_a4') {
                        imprimirTabelaFolhaA4(baseParaImprimir, tipoQtdImpressao);
                      } else {
                        imprimirLoteTermica(listaParaImprimir);
                      }
                    }}
                    className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-orange-500/25 active:scale-95 transition-all cursor-pointer"
                  >
                    <Printer size={16} />
                    {modoImpressao === 'tabela_a4' 
                      ? `Imprimir Tabela Folha A4 (${listaParaImprimir.length} etiquetas)` 
                      : `Imprimir Rolo Térmico (${listaParaImprimir.length} etiquetas)`}
                  </button>
                  <button
                    onClick={() => setShowPrintModal(false)}
                    className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Barra de Controles: Formato & Quantidade */}
              <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
                {/* Seletor de Modo */}
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-500 uppercase tracking-wider text-[11px]">Tipo:</span>
                  <div className="inline-flex rounded-xl bg-slate-200/80 dark:bg-slate-800 p-1">
                    <button
                      type="button"
                      onClick={() => setModoImpressao('tabela_a4')}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                        modoImpressao === 'tabela_a4'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      📄 Folha A4 em Tabela (35 por folha)
                    </button>
                    <button
                      type="button"
                      onClick={() => setModoImpressao('termica')}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                        modoImpressao === 'termica'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      🏷️ Rolo Térmico Contínuo
                    </button>
                  </div>
                </div>

                {/* Seletor de Quantidade / Distribuição */}
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-500 uppercase tracking-wider text-[11px]">Distribuição:</span>
                  <div className="inline-flex rounded-xl bg-slate-200/80 dark:bg-slate-800 p-1">
                    <button
                      type="button"
                      onClick={() => setTipoQtdImpressao('preencher')}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 ${
                        tipoQtdImpressao === 'preencher'
                          ? 'bg-emerald-500 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                      title="Preenche a folha completa (35 etiquetas) sem desperdiçar papel"
                    >
                      <Sparkles size={12} />
                      Preencher Folha (35 un)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTipoQtdImpressao('1')}
                      className={`px-2.5 py-1.5 rounded-lg font-bold transition-all ${
                        tipoQtdImpressao === '1'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      1 de cada
                    </button>
                    <button
                      type="button"
                      onClick={() => setTipoQtdImpressao('2')}
                      className={`px-2.5 py-1.5 rounded-lg font-bold transition-all ${
                        tipoQtdImpressao === '2'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      2 de cada
                    </button>
                    <button
                      type="button"
                      onClick={() => setTipoQtdImpressao('3')}
                      className={`px-2.5 py-1.5 rounded-lg font-bold transition-all ${
                        tipoQtdImpressao === '3'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      3 de cada
                    </button>
                  </div>
                </div>

                {/* Badge Informativo de Rendimento */}
                <div className="text-[11px] text-slate-600 dark:text-slate-300 font-semibold flex items-center gap-2">
                  <span className="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-md font-bold">
                    {listaParaImprimir.length} etiquetas
                  </span>
                  {modoImpressao === 'tabela_a4' && (
                    <span className="text-slate-500">
                      ({totalFolhasA4} folha{totalFolhasA4 > 1 ? 's' : ''} A4 de 35 un)
                    </span>
                  )}
                </div>
              </div>

              {/* Modal Body: Pré-visualização da Folha com Tabela 5x7 */}
              <div className="flex-1 overflow-y-auto p-6 bg-slate-200/70 dark:bg-slate-950 flex flex-col items-center">
                {modoImpressao === 'tabela_a4' ? (
                  <div className="space-y-6 w-full max-w-4xl flex flex-col items-center">
                    <div className="text-center space-y-1">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        📄 Pré-visualização da Folha A4 (Tabela 5 colunas × 7 linhas = 35 etiquetas de 39×39mm)
                      </span>
                    </div>

                    {/* Simulação da Folha A4 em formato de Tabela */}
                    <div className="bg-white text-slate-900 rounded-2xl shadow-xl p-4 border border-slate-300 overflow-x-auto w-full flex justify-center">
                      <table className="border-collapse table-fixed w-full max-w-[850px]">
                        <tbody>
                          {Array.from({ length: 7 }).map((_, row) => (
                            <tr key={row} className="h-[120px]">
                              {Array.from({ length: 5 }).map((_, col) => {
                                const idx = row * 5 + col;
                                const item = listaParaImprimir[idx];
                                const eanLimpo = item ? (item.ean ? item.ean.trim() : (item.cod_barras ? item.cod_barras.trim() : '')) : '';

                                return (
                                  <td
                                    key={col}
                                    className="p-1 border border-dashed border-slate-300 align-top w-1/5"
                                  >
                                    {item ? (() => {
                                      const valNormal = item.preco_normal || 0;
                                      const valPromo = item.preco_promocional || 0;
                                      const desc = item.desconto_percentual || (valNormal > 0 ? Math.round(((valNormal - valPromo) / valNormal) * 100) : 0);
                                      const econ = Math.max(0, valNormal - valPromo);
                                      const corTema = desc >= 60 ? '#dc2626' : desc >= 40 ? '#ea580c' : '#ca8a04';
                                      const corFundoBox = desc >= 60 ? '#fef2f2' : desc >= 40 ? '#fff7ed' : '#fefce8';
                                      const corBadge = desc >= 60 ? '#dc2626' : desc >= 40 ? '#ea580c' : '#f59e0b';
                                      const corBadgeTexto = desc >= 60 ? '#fef08a' : desc >= 40 ? '#ffffff' : '#000000';

                                      return (
                                        <div 
                                          style={{ borderColor: corTema }}
                                          className="h-full bg-white text-slate-900 border-2 rounded p-1 text-center flex flex-col justify-between overflow-hidden select-none shadow-xs text-[8px] relative"
                                        >
                                          {/* Marca d'água 1º Aniversário */}
                                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.08] font-black text-[9px] -rotate-30 uppercase whitespace-nowrap select-none">
                                            1 ANO BELAFARMA
                                          </div>

                                          <div 
                                            style={{ background: corTema }} 
                                            className="text-white py-0.5 px-1 rounded text-[7px] font-black uppercase tracking-wider flex items-center justify-between relative z-10"
                                          >
                                            <span className="truncate font-black">BELAFARMA</span>
                                            <span className="text-[5.5px] bg-white/30 px-1 rounded font-extrabold">1º ANO</span>
                                          </div>

                                          <div className="my-0.5 relative z-10">
                                            <h5 className="text-[7.5px] font-black uppercase leading-tight line-clamp-2 text-slate-900">
                                              {item.descricao}
                                            </h5>
                                            {item.apresentacao && (
                                              <p className="text-[6.5px] font-semibold text-slate-500 line-clamp-1">
                                                {item.apresentacao}
                                              </p>
                                            )}
                                          </div>

                                          <div 
                                            style={{ background: corFundoBox, borderColor: corTema }} 
                                            className="border border-dashed rounded p-0.5 my-0.5 relative z-10"
                                          >
                                            <div className="flex items-center justify-between text-[6px] leading-none">
                                              <span className="text-slate-400 font-bold line-through">DE: {fmt(valNormal)}</span>
                                              {econ > 0 && (
                                                <span style={{ color: corTema }} className="font-black uppercase text-[5.5px]">
                                                  ECON. {fmt(econ)}
                                                </span>
                                              )}
                                            </div>
                                            <div className="flex items-baseline justify-center gap-0.5 leading-tight mt-0.5">
                                              <span style={{ color: corTema }} className="text-[6.5px] font-black">POR:</span>
                                              <span style={{ color: corTema }} className="text-[11px] font-black tracking-tight">
                                                {fmt(valPromo)}
                                              </span>
                                            </div>
                                          </div>

                                          <div className="border-t border-slate-200 pt-0.5 flex items-center justify-between text-[6.5px] font-bold text-slate-500 leading-none relative z-10">
                                            <span 
                                              style={{ background: corBadge, color: corBadgeTexto }} 
                                              className="px-1 rounded font-black text-[6.5px]"
                                            >
                                              {desc > 0 ? `-${desc}% OFF` : 'OFERTA'}
                                            </span>
                                            <span className="text-[6px]">ATÉ {item.data_termino ? item.data_termino.split('-').reverse().join('/') : '-'}</span>
                                          </div>

                                          {eanLimpo && (
                                            <div className="text-[5.5px] font-mono text-slate-400 truncate mt-0.5 relative z-10">
                                              EAN: {eanLimpo}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })() : (
                                      <div className="h-full rounded border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-[8px] text-slate-300 font-mono">
                                        39×39mm
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  /* Modo Térmico / Cartões Individuais */
                  <div className="flex flex-wrap gap-4 items-center justify-center">
                    {listaParaImprimir.map((item, idx) => {
                      const eanLimpo = item.ean ? item.ean.trim() : (item.cod_barras ? item.cod_barras.trim() : '');
                      const valNormal = item.preco_normal || 0;
                      const valPromo = item.preco_promocional || 0;
                      const desc = item.desconto_percentual || (valNormal > 0 ? Math.round(((valNormal - valPromo) / valNormal) * 100) : 0);
                      const econ = Math.max(0, valNormal - valPromo);
                      const corTema = desc >= 60 ? '#dc2626' : desc >= 40 ? '#ea580c' : '#ca8a04';
                      const corFundoBox = desc >= 60 ? '#fef2f2' : desc >= 40 ? '#fff7ed' : '#fefce8';
                      const corBadge = desc >= 60 ? '#dc2626' : desc >= 40 ? '#ea580c' : '#f59e0b';
                      const corBadgeTexto = desc >= 60 ? '#fef08a' : desc >= 40 ? '#ffffff' : '#000000';

                      return (
                        <div 
                          key={idx}
                          style={{ width: '156px', height: '156px', borderColor: corTema }}
                          className="bg-white text-slate-900 border-2 rounded-xl shadow-md p-2 text-center flex flex-col justify-between overflow-hidden select-none relative group"
                        >
                          {/* Marca d'água 1º Aniversário */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.08] font-black text-xs -rotate-30 uppercase whitespace-nowrap select-none">
                            1 ANO BELAFARMA
                          </div>

                          <div 
                            style={{ background: corTema }}
                            className="text-white py-0.5 px-1.5 rounded text-[8px] font-black uppercase tracking-wider flex items-center justify-between relative z-10"
                          >
                            <span className="truncate font-black">BELAFARMA</span>
                            <span className="text-[6px] bg-white/30 px-1 rounded font-extrabold">1º ANIVERSÁRIO</span>
                          </div>

                          <div className="my-0.5 relative z-10">
                            <h4 className="text-[9px] font-black uppercase leading-tight line-clamp-2 text-slate-900">
                              {item.descricao}
                            </h4>
                            {item.apresentacao && (
                              <p className="text-[7.5px] font-semibold text-slate-500 line-clamp-1">
                                {item.apresentacao}
                              </p>
                            )}
                          </div>

                          <div 
                            style={{ background: corFundoBox, borderColor: corTema }}
                            className="border border-dashed rounded p-1 my-0.5 relative z-10"
                          >
                            <div className="flex items-center justify-between text-[7px] leading-tight">
                              <span className="text-slate-400 font-bold line-through">DE: {fmt(valNormal)}</span>
                              {econ > 0 && (
                                <span style={{ color: corTema }} className="font-black uppercase text-[6.5px]">
                                  ECONOMIZE {fmt(econ)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-baseline justify-center gap-1 leading-tight mt-0.5">
                              <span style={{ color: corTema }} className="text-[8px] font-black uppercase">POR:</span>
                              <span style={{ color: corTema }} className="text-[17px] font-black tracking-tight">
                                {fmt(valPromo)}
                              </span>
                            </div>
                          </div>

                          <div className="pt-1 border-t border-slate-200 flex items-center justify-between text-[7.5px] font-bold text-slate-500 leading-tight relative z-10">
                            <span 
                              style={{ background: corBadge, color: corBadgeTexto }}
                              className="px-1.5 py-0.5 rounded font-black text-[7.5px]"
                            >
                              {desc > 0 ? `-${desc}% OFF` : 'OFERTA'}
                            </span>
                            <span>ATÉ {item.data_termino ? item.data_termino.split('-').reverse().join('/') : '-'}</span>
                          </div>

                          {eanLimpo && (
                            <div className="text-[6.5px] font-mono text-slate-400 truncate mt-0.5 relative z-10">
                              EAN: {eanLimpo} | ID: {item.produto_id}
                            </div>
                          )}

                          <button
                            onClick={() => imprimirEtiqueta39x39({
                              descricao: item.descricao,
                              apresentacao: item.apresentacao,
                              preco_normal: item.preco_normal,
                              preco_promocional: item.preco_promocional,
                              desconto_percentual: item.desconto_percentual,
                              cod_barras: eanLimpo,
                              ean: item.ean,
                              produto_id: item.produto_id,
                              data_termino: item.data_termino
                            })}
                            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-white/90 hover:bg-white text-slate-700 p-1 rounded shadow transition-opacity cursor-pointer z-20"
                            title="Imprimir somente esta etiqueta 39x39mm"
                          >
                            <Printer size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── MODAL: INCLUIR PRODUTO AVULSO DO ESTOQUE ─── */}
      {showModalIncluirAvulso && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-orange-50 via-amber-50 to-white dark:from-slate-850 dark:to-slate-900">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-orange-500 text-white shadow-md shadow-orange-500/30">
                  <PlusCircle size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Inserir Produto na Liquidação (Manual)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Digite o código interno do Digifarma ou nome do produto para definir o preço promocional (validade até 31/10/2026).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowModalIncluirAvulso(false);
                  setProdutoSelecionadoParaInclusao(null);
                  setTermoBuscaEstoque('');
                  setResultadosBuscaEstoque([]);
                }}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {!produtoSelecionadoParaInclusao ? (
                /* Etapa 1: Busca de Produto no Estoque */
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                      Pesquisar no Catálogo / Estoque da Loja:
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        autoFocus
                        value={termoBuscaEstoque}
                        onChange={(e) => setTermoBuscaEstoque(e.target.value)}
                        placeholder="Digite o Nome do Medicamento, Cód. Digifarma ou EAN..."
                        className="w-full pl-10 pr-9 py-3 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-orange-500 focus:bg-white dark:focus:bg-slate-900 transition-all"
                      />
                      {termoBuscaEstoque && (
                        <button
                          type="button"
                          onClick={() => { setTermoBuscaEstoque(''); setResultadosBuscaEstoque([]); }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      Dica: Digite pelo menos 2 letras ou o código numérico (ex: &quot;DIPIRONA&quot;, &quot;NEO&quot;, &quot;123&quot; ou código de barras).
                    </span>
                  </div>

                  {/* Lista de Resultados */}
                  <div className="min-h-[220px]">
                    {buscandoEstoque ? (
                      <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                        <span className="text-xs font-bold">Consultando catálogo do estoque...</span>
                      </div>
                    ) : termoBuscaEstoque.trim().length >= 2 && resultadosBuscaEstoque.length === 0 ? (
                      <div className="py-12 text-center text-xs text-slate-400 font-semibold space-y-1">
                        <p>Nenhum produto encontrado com &quot;<strong>{termoBuscaEstoque}</strong>&quot; no catálogo.</p>
                        <p className="text-[11px] text-slate-400">Tente buscar por parte do nome, princípio ativo ou código de barras.</p>
                      </div>
                    ) : resultadosBuscaEstoque.length > 0 ? (
                      <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
                        <div className="text-[11px] font-bold text-slate-400 mb-1 flex items-center justify-between">
                          <span>{resultadosBuscaEstoque.length} produtos encontrados:</span>
                          <span>Clique para selecionar</span>
                        </div>
                        {resultadosBuscaEstoque.map((prod) => (
                          <div
                            key={prod.produto_id}
                            onClick={() => handleSelecionarProdutoEstoque(prod)}
                            className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-orange-400 hover:bg-orange-50/40 dark:hover:bg-orange-950/20 transition-all flex items-center justify-between gap-3 cursor-pointer group"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-black text-slate-500 dark:text-slate-400">
                                  #{prod.produto_id}
                                </span>
                                <h4 className="text-xs font-black text-slate-900 dark:text-white truncate group-hover:text-orange-600 transition-colors">
                                  {prod.descricao}
                                </h4>
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                                {prod.apresentacao && <span className="truncate">{prod.apresentacao}</span>}
                                {prod.ean && <span className="font-mono truncate">• EAN {prod.ean}</span>}
                                <span className="truncate">• {prod.categoria}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 text-right">
                              <div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                  prod.saldo > 0 
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                }`}>
                                  {prod.saldo} un
                                </span>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold mt-1">
                                  {fmt(prod.preco_normal)}
                                </div>
                                <div className="text-[10px] font-black text-blue-600 dark:text-blue-400">
                                  Custo: {fmt(prod.preco_custo)}
                                </div>
                              </div>

                              <button
                                type="button"
                                className="px-3 py-1.5 rounded-xl text-xs font-black bg-orange-500 hover:bg-orange-600 text-white shadow-xs group-hover:scale-105 transition-all cursor-pointer"
                              >
                                Selecionar
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-12 text-center text-slate-400 space-y-2">
                        <Package className="w-10 h-10 mx-auto opacity-30 text-orange-500" />
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                          Digite o nome ou código de qualquer produto para pesquisar no estoque.
                        </p>
                        <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                          Mesmo produtos novos ou que tiveram venda recente podem ser incluídos livremente com o desconto desejado.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Etapa 2: Configuração do Desconto e Preço Promocional */
                <div className="space-y-5 animate-in fade-in duration-150">
                  <button
                    type="button"
                    onClick={() => setProdutoSelecionadoParaInclusao(null)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 cursor-pointer"
                  >
                    <ChevronLeft size={14} /> Voltar para a pesquisa
                  </button>

                  {/* Card do Produto Selecionado */}
                  <div className="p-4 rounded-2xl bg-orange-50/60 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/60 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-black text-orange-700 dark:text-orange-400">
                            #{produtoSelecionadoParaInclusao.produto_id}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-200 dark:bg-orange-900 text-orange-900 dark:text-orange-200">
                            {produtoSelecionadoParaInclusao.categoria}
                          </span>
                        </div>
                        <h4 className="text-sm font-black text-slate-900 dark:text-white mt-1">
                          {produtoSelecionadoParaInclusao.descricao}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {produtoSelecionadoParaInclusao.apresentacao} {produtoSelecionadoParaInclusao.ean ? `• EAN: ${produtoSelecionadoParaInclusao.ean}` : ''}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Estoque Atual</span>
                        <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                          {produtoSelecionadoParaInclusao.saldo} un
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-orange-200/80 dark:border-orange-800/40 text-xs">
                      <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-orange-100 dark:border-slate-800">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Preço Normal Atual (De)</span>
                        <span className="text-sm font-black text-slate-700 dark:text-slate-300">
                          {fmt(produtoSelecionadoParaInclusao.preco_normal)}
                        </span>
                      </div>

                      <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-blue-200 dark:border-blue-900">
                        <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase block flex items-center gap-1">
                          <ShieldCheck size={11} /> Preço de Custo (Piso)
                        </span>
                        <span className="text-sm font-black text-blue-600 dark:text-blue-400">
                          {fmt(produtoSelecionadoParaInclusao.preco_custo)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Configuração da Promoção */}
                  <div className="space-y-4">
                    <h5 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Flame size={14} className="text-orange-500" />
                      Definir Desconto e Preço de Liquidação
                    </h5>

                    {/* Atalhos Rápidos de % */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">Atalhos:</span>
                      {[20, 30, 40, 50, 70].map(pct => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => handleMudarDescontoAvulso(pct)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                            avulsoDescontoPct === pct
                              ? 'bg-orange-500 text-white shadow-sm'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                          }`}
                        >
                          {pct}% OFF
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const custo = Number(produtoSelecionadoParaInclusao.preco_custo) || 0;
                          handleMudarPrecoPromoAvulso(custo.toFixed(2));
                        }}
                        className="px-3 py-1.5 rounded-xl text-xs font-black bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 hover:bg-blue-200 transition-all cursor-pointer"
                        title="Vender a preço de custo (sem lucro e sem prejuízo)"
                      >
                        🔒 No Custo (Piso)
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Desconto % */}
                      <div>
                        <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1">
                          Desconto Desejado (%):
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="1"
                            max="99"
                            value={avulsoDescontoPct}
                            onChange={(e) => handleMudarDescontoAvulso(Number(e.target.value) || 0)}
                            className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-black text-slate-800 dark:text-white focus:outline-none focus:border-orange-500"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 font-black text-slate-400 text-sm">%</span>
                        </div>
                      </div>

                      {/* Preço Promocional R$ */}
                      <div>
                        <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1">
                          Preço Promocional (Por R$):
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-slate-400 text-xs">R$</span>
                          <input
                            type="text"
                            value={avulsoPrecoPromo}
                            onChange={(e) => handleMudarPrecoPromoAvulso(e.target.value)}
                            placeholder="0,00"
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-orange-400 dark:border-orange-500 bg-white dark:bg-slate-800 text-sm font-black text-orange-600 dark:text-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Alerta de Custo se bater no piso */}
                    {(() => {
                      const precoDigitado = parseFloat(avulsoPrecoPromo.replace(',', '.')) || 0;
                      const custo = Number(produtoSelecionadoParaInclusao.preco_custo) || 0;
                      if (custo > 0 && precoDigitado <= custo + 0.001) {
                        return (
                          <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 text-blue-800 dark:text-blue-300 text-xs font-bold flex items-center gap-2">
                            <ShieldCheck size={16} className="shrink-0 text-blue-600" />
                            <span>Blindagem ativada: O preço está no piso de Custo ({fmt(custo)}). Protegido contra prejuízo!</span>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Datas da Promoção: Início e Término */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                        <label className="block text-xs font-black text-slate-800 dark:text-slate-200 mb-1.5 flex items-center gap-1.5">
                          <Calendar size={13} className="text-orange-600 dark:text-orange-400" />
                          <span>Início da Promoção:</span>
                        </label>
                        <input
                          type="date"
                          value={avulsoDataInicio}
                          onChange={(e) => setAvulsoDataInicio(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:border-orange-500 shadow-inner"
                        />
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-1 block">
                          Padrão da Campanha: <strong>05/10/2026</strong>
                        </span>
                      </div>

                      <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                        <label className="block text-xs font-black text-slate-800 dark:text-slate-200 mb-1.5 flex items-center gap-1.5">
                          <Clock size={13} className="text-orange-600 dark:text-orange-400" />
                          <span>Válido até (Término):</span>
                        </label>
                        <input
                          type="date"
                          value={avulsoDataTermino}
                          onChange={(e) => setAvulsoDataTermino(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:border-orange-500 shadow-inner"
                        />
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-1 block">
                          Padrão: Último dia do mês (<strong>31/10/2026</strong>)
                        </span>
                      </div>
                    </div>

                    {/* Card de Blindagem de Vigência e Preço Antigo */}
                    <div className="p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 text-xs flex items-start gap-2.5">
                      <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5 text-blue-900 dark:text-blue-200">
                        <span className="font-black">🔒 Blindagem de Vigência & Preço Original Salvo:</span>
                        <p className="text-[11px] text-blue-800 dark:text-blue-300 leading-snug">
                          O preço atual deste produto (<strong>{fmt(Number(produtoSelecionadoParaInclusao.preco_normal) || Number(produtoSelecionadoParaInclusao.preco_tabela) || 0)}</strong>) fica salvo permanentemente no banco. 
                          Se a data de início for agendada para <strong>{avulsoDataInicio ? avulsoDataInicio.split('-').reverse().join('/') : '05/10/2026'}</strong>, o caixa do Digifarma continuará cobrando o preço normal até a data de início. Ao término da validade, o preço antigo é restaurado automaticamente.
                        </p>
                      </div>
                    </div>

                    {/* Opção de Sincronização Imediata com Digifarma */}
                    <div className="flex items-center gap-2 pt-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={avulsoSincronizarDigifarma}
                          onChange={(e) => setAvulsoSincronizarDigifarma(e.target.checked)}
                          className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 cursor-pointer"
                        />
                        <span>Gravar imediatamente no Digifarma Firebird</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
              <button
                type="button"
                onClick={() => {
                  setShowModalIncluirAvulso(false);
                  setProdutoSelecionadoParaInclusao(null);
                  setTermoBuscaEstoque('');
                  setResultadosBuscaEstoque([]);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              {produtoSelecionadoParaInclusao && (
                <button
                  type="button"
                  onClick={handleSalvarProdutoAvulso}
                  disabled={salvandoAvulso}
                  className="px-5 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 active:scale-95 text-white shadow-lg shadow-orange-500/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {salvandoAvulso ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check size={16} strokeWidth={3} />}
                  <span>{salvandoAvulso ? 'Incluindo...' : 'Adicionar à Liquidação'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
