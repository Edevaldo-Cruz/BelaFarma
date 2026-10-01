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
  ChevronRight
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
  const [itensAtivos, setItensAtivos] = useState<ItemAtivo[]>([]);

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
    setEditDataTermino(item.data_termino || getFimMesQueVem());
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

    if (finalPrice < item.preco_custo) {
      const confirma = window.confirm(
        `Atenção: O valor de ${fmt(finalPrice)} é menor que o custo (${fmt(item.preco_custo)}). Deseja salvar mesmo assim?`
      );
      if (!confirma) return;
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
    const precoSugerido = (item.preco_normal * (1 - sugestaoPct / 100)).toFixed(2);
    const economiaAtual = Math.max(0, item.preco_normal - item.preco_promocional);
    const totalParado = item.preco_custo * (item.saldo_estoque || 1);

    if (pctAtual >= sugestaoPct) {
      return {
        status: 'aprovado',
        icone: '🎯',
        titulo: 'Decisão Comercial Estratégica (1º Aniversário)',
        badge: 'Recomendação Assertiva',
        badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300',
        texto: `Excelente escolha, Nayane! Com ${pctAtual}% de desconto, este produto parado há ${dias} dias (${meses} meses) ganha forte apelo de compra por impulso na celebração de 1º Aniversário BelaFarma. O cliente economiza ${fmt(economiaAtual)} na hora, e a farmácia resgata ${fmt(item.preco_promocional * item.saldo_estoque)} em dinheiro vivo para estancar os juros do cheque especial e eliminar de vez o risco de vencimento!`
      };
    } else {
      return {
        status: 'alerta',
        icone: '⚠️',
        titulo: 'Alerta de Risco Financeiro & Perda por Vencimento',
        badge: 'Desconto Insuficiente p/ Giro',
        badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300',
        texto: `Atenção, Nayane: Este produto já acumula ${dias} dias (${meses} meses) sem venda. Um desconto tímido de apenas ${pctAtual}% não gera o choque visual necessário para compra por impulso, com grande chance de continuar encalhado até vencer — o que significará perda total de 100% do custo (${fmt(totalParado)} jogados fora) enquanto a conta bancária continua acumulando juros de cheque especial. A recomendação profissional é aplicar pelo menos ${sugestaoPct}% (venda por ${fmt(Number(precoSugerido))}) para transformar esse produto em dinheiro agora!`
      };
    }
  };

  // Ação: Aplica desconto rápido em um produto específico da lista
  const aplicarDescontoRapido = (item: ItemAtivo, pct: number) => {
    const novoPreco = Math.max(0.1, Math.round(item.preco_normal * (1 - pct / 100) * 100) / 100);
    setItensAtivos(prev => prev.map(it => {
      if (it.id === item.id) {
        return {
          ...it,
          preco_promocional: novoPreco,
          desconto_percentual: pct,
          sincronizado_digifarma: 0
        };
      }
      return it;
    }));
    // Se estava editando, atualiza os campos de edição
    if (editingItemId === item.id) {
      setEditPreco(novoPreco.toFixed(2));
    }
    addToast(`Desconto de ${pct}% selecionado para "${item.descricao}". Preço: ${fmt(novoPreco)}.`, 'info');
  };

  // Ação: Aplica desconto em lote para todos os produtos de uma faixa
  const aplicarFaixaLote = (faixa: 1 | 2 | 3) => {
    const pct = faixa === 3 ? faixa3Pct : faixa === 2 ? faixa2Pct : faixa1Pct;
    let afetados = 0;
    setItensAtivos(prev => prev.map(it => {
      const d = it.dias_parado || 45;
      const match = (faixa === 3 && d > 180) ||
                    (faixa === 2 && d >= 91 && d <= 180) ||
                    (faixa === 1 && d <= 90);
      if (match) {
        afetados++;
        const novoPreco = Math.max(0.1, Math.round(it.preco_normal * (1 - pct / 100) * 100) / 100);
        return {
          ...it,
          preco_promocional: novoPreco,
          desconto_percentual: pct,
          sincronizado_digifarma: 0
        };
      }
      return it;
    }));
    addToast(`⚡ Desconto de ${pct}% aplicado em ${afetados} produtos da Faixa ${faixa}! Clique em 'Gravar Todas no Digifarma' para sincronizar.`, 'success');
  };

  // Ação: Aplica a sugestão inteligente em todos os produtos da lista de acordo com os dias parados
  const aplicarTodasSugestoes = () => {
    setItensAtivos(prev => prev.map(it => {
      const d = it.dias_parado || 45;
      const pct = d > 180 ? faixa3Pct : (d >= 91 ? faixa2Pct : faixa1Pct);
      const novoPreco = Math.max(0.1, Math.round(it.preco_normal * (1 - pct / 100) * 100) / 100);
      return {
        ...it,
        preco_promocional: novoPreco,
        desconto_percentual: pct,
        sincronizado_digifarma: 0
      };
    }));
    addToast(`⚡ Sugestões inteligentes (${faixa1Pct}%, ${faixa2Pct}%, ${faixa3Pct}%) aplicadas em todos os ${itensAtivos.length} produtos!`, 'success');
  };

  // Ação: Gravar Todas as Ofertas em Lote no Digifarma Firebird
  const handleGravarTodasNoDigifarma = async () => {
    if (itensAtivos.length === 0) return;
    const confirma = window.confirm(
      `Confirma a gravação de ${itensAtivos.length} ofertas promocionais diretamente no Digifarma Firebird com vigência até ${getFimMesQueVem().split('-').reverse().join('/')}?`
    );
    if (!confirma) return;

    setGravandoLote(true);
    try {
      const res = await fetch('/api/liquidacao/gravar-lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: itensAtivos })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`🚀 ${data.message}`, 'success');
        setItensAtivos(prev => prev.map(it => ({ ...it, sincronizado_digifarma: 1 })));
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
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Quanto mais tempo parado sem venda, maior a agressividade sugerida para resgatar o caixa e evitar perda por vencimento.
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
              disabled={gravandoLote || itensAtivos.length === 0}
              className="px-4 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/25 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Grava todos os preços promocionais diretamente no Digifarma Firebird"
            >
              {gravandoLote ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              <span>🚀 Gravar Todas no Digifarma ({itensAtivos.length})</span>
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

        {/* 3 Cards Editáveis de Desconto (Faixas de 45 a 90d, 91 a 180d e +180d) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              Revise e altere os preços promocionais com auxílio da justificativa persuasiva do sistema.
            </p>
          </div>

          {itensAtivos.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPrintModal(true)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Printer size={14} />
                Gerar Etiquetas (39x39mm)
              </button>
              <button
                onClick={handleCopiarWhatsApp}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Copy size={14} />
                WhatsApp
              </button>
            </div>
          )}
        </div>

        {itensAtivos.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400 font-semibold">
            Nenhuma oferta na lista no momento.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase tracking-wider font-bold">
                  <th className="pb-3 text-center w-16">Cód. ID</th>
                  <th className="pb-3">Produto & Tempo Parado</th>
                  <th className="pb-3 text-right">Saldo</th>
                  <th className="pb-3 text-right text-blue-600 dark:text-blue-400 font-black">Custo</th>
                  <th className="pb-3 text-right">De (Original)</th>
                  <th className="pb-3 text-center">Por (Promo) & Atalhos</th>
                  <th className="pb-3 text-right">Desconto & Econ.</th>
                  <th className="pb-3 text-center">Válido até</th>
                  <th className="pb-3 text-center">Digifarma</th>
                  <th className="pb-3 text-center">Ações</th>
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

                  return (
                    <React.Fragment key={item.id}>
                      <tr 
                        className={`transition-colors ${
                          isEditing 
                            ? 'bg-amber-50/90 dark:bg-amber-950/40 ring-2 ring-amber-400 dark:ring-amber-500/70 z-10' 
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        {/* Coluna 1: Código Interno Digifarma */}
                        <td className="py-3 px-2 text-center font-mono font-black text-xs text-slate-700 dark:text-slate-300">
                          #{item.produto_id}
                        </td>

                        <td className="py-3 pr-2">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            {dias > 180 ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 flex items-center gap-1">
                                <Flame size={11} /> {dias} dias sem venda
                              </span>
                            ) : dias >= 91 ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 flex items-center gap-1">
                                <AlertTriangle size={11} /> {dias} dias sem venda
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 flex items-center gap-1">
                                <Clock size={11} /> {dias} dias sem venda
                              </span>
                            )}
                            <span className="text-[10px] font-semibold text-slate-400">
                              {item.categoria}
                            </span>
                          </div>

                          <div className="font-bold text-slate-900 dark:text-white truncate max-w-xs md:max-w-md">
                            {item.descricao}
                          </div>
                          {item.apresentacao && (
                            <div className="text-[11px] text-slate-400 truncate max-w-xs">
                              {item.apresentacao}
                            </div>
                          )}
                          {item.ean && (
                            <div className="text-[10px] font-mono text-slate-400">
                              EAN: {item.ean}
                            </div>
                          )}
                        </td>

                        <td className="py-3 text-right font-bold text-slate-700 dark:text-slate-300">
                          {item.saldo_estoque} un
                        </td>

                        {/* Coluna: Valor de Custo do Produto (em negrito e azul) */}
                        <td className="py-3 text-right font-black text-blue-600 dark:text-blue-400">
                          {fmt(item.preco_custo)}
                        </td>

                        <td className="py-3 text-right text-slate-400 line-through">
                          {fmt(item.preco_normal)}
                        </td>

                        {/* Coluna: Por (Promo) com Botões Rápidos de Desconto */}
                        <td className="py-3 text-center">
                          <div className="flex flex-col items-center gap-1.5">
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
                                  className="w-20 px-2 py-1 text-center font-black text-xs text-orange-600 dark:text-orange-400 bg-white dark:bg-slate-800 border-2 border-orange-400 rounded-lg shadow-inner focus:outline-none focus:ring-2 focus:ring-orange-500"
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
                                <Pencil size={11} className="text-slate-400 opacity-0 group-hover/price:opacity-100 transition-opacity" />
                              </div>
                            )}

                            {/* 3 Botões Rápidos de Desconto com badge de Sugestão */}
                            <div className="flex items-center gap-1">
                              {[
                                { pct: faixa1Pct, label: `${faixa1Pct}%`, isSug: sugestao.pct === faixa1Pct },
                                { pct: faixa2Pct, label: `${faixa2Pct}%`, isSug: sugestao.pct === faixa2Pct },
                                { pct: faixa3Pct, label: `${faixa3Pct}%`, isSug: sugestao.pct === faixa3Pct },
                              ].map(btn => (
                                <button
                                  key={btn.pct}
                                  type="button"
                                  onClick={() => aplicarDescontoRapido(item, btn.pct)}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-black transition-all cursor-pointer flex items-center gap-0.5 ${
                                    tempDescPct === btn.pct
                                      ? 'bg-slate-900 text-white shadow-xs scale-105'
                                      : btn.isSug
                                        ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border border-amber-400 font-extrabold ring-1 ring-amber-400/50'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                                  }`}
                                  title={btn.isSug ? `⭐ Desconto Recomendado para ${dias} dias sem venda` : `Aplicar ${btn.pct}%`}
                                >
                                  {btn.isSug && <span className="text-amber-500">⭐</span>}
                                  <span>{btn.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </td>

                        {/* Coluna: Desconto recalculado dinamicamente & Economia */}
                        <td className="py-3 text-right">
                          <div className="font-black text-emerald-600 dark:text-emerald-400">
                            {tempDescPct}% OFF
                          </div>
                          {economiaReais > 0 && (
                            <div className="text-[10px] font-semibold text-slate-400">
                              Econ. {fmt(economiaReais)}
                            </div>
                          )}
                        </td>

                        {/* Coluna: Válido até com seletor de data inline */}
                        <td className="py-3 text-center">
                          {isEditing ? (
                            <input
                              type="date"
                              value={editDataTermino}
                              onChange={(e) => setEditDataTermino(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSalvarEdicao(item);
                                if (e.key === 'Escape') handleCancelarEdicao();
                              }}
                              className="px-2 py-1 text-xs font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border-2 border-orange-400 rounded-lg shadow-inner focus:outline-none focus:ring-2 focus:ring-orange-500"
                            />
                          ) : (
                            <div
                              onClick={() => handleIniciarEdicao(item)}
                              className="group/date inline-flex items-center justify-center gap-1 cursor-pointer text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:underline"
                              title="Clique para editar data de vencimento"
                            >
                              <span>{item.data_termino ? item.data_termino.split('-').reverse().join('/') : '-'}</span>
                              <Pencil size={11} className="text-slate-400 opacity-0 group-hover/date:opacity-100 transition-opacity" />
                            </div>
                          )}
                        </td>

                        {/* Coluna: Status Digifarma */}
                        <td className="py-3 text-center">
                          {item.sincronizado_digifarma === 1 ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800" title="Preço promocional ativo no Digifarma Firebird">
                              <Check size={11} /> No Digifarma
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800" title="Aguardando envio para o Digifarma Firebird">
                              <Clock size={11} /> Pendente
                            </span>
                          )}
                        </td>

                        {/* Coluna: Ações / Edição */}
                        <td className="py-3 text-center">
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleSalvarEdicao(item)}
                                disabled={isSaving}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/30 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                                title="Salvar alterações no Digifarma"
                              >
                                {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                <span>Salvar</span>
                              </button>
                              <button
                                onClick={handleCancelarEdicao}
                                disabled={isSaving}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                                title="Cancelar edição"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleIniciarEdicao(item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-all active:scale-95 cursor-pointer shadow-xs"
                                title="Editar valor ou data de vencimento direto na lista"
                              >
                                <Pencil size={12} />
                                <span>Editar</span>
                              </button>

                              <button
                                onClick={() => handleReverter(item)}
                                disabled={revertingId === item.id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/60 transition-all active:scale-95 cursor-pointer shadow-xs disabled:opacity-50"
                                title="Desfazer alteração e voltar ao preço original no Digifarma"
                              >
                                {revertingId === item.id ? (
                                  <>
                                    <Loader2 size={12} className="animate-spin text-red-600" />
                                    <span>Desfazendo...</span>
                                  </>
                                ) : (
                                  <>
                                    <RotateCcw size={12} />
                                    <span>Desfazer</span>
                                  </>
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
                                className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-xs cursor-pointer"
                                title="Imprimir Etiqueta 39x39mm deste item"
                              >
                                <Printer size={13} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* ─── BOX DE JUSTIFICATIVA PERSUASIVA (MARKETING & FINANÇAS) ─── */}
                      <tr className="border-b-2 border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
                        <td colSpan={10} className="py-2.5 px-4">
                          <div className={`p-3 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs ${
                            justificativa.status === 'aprovado'
                              ? 'bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                              : 'bg-amber-50/80 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
                          }`}>
                            <div className="flex items-start gap-2.5">
                              <span className="text-base shrink-0 mt-0.5">{justificativa.icone}</span>
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-black uppercase tracking-wider text-[11px]">
                                    {justificativa.titulo}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${justificativa.badgeClass}`}>
                                    {justificativa.badge}
                                  </span>
                                </div>
                                <p className="leading-relaxed font-normal opacity-95">
                                  {justificativa.texto}
                                </p>
                              </div>
                            </div>

                            {/* Botão de Correção Imediata caso Nayane tenha reduzido o desconto abaixo da sugestão */}
                            {justificativa.status === 'alerta' && (
                              <button
                                type="button"
                                onClick={() => aplicarDescontoRapido(item, sugestao.pct)}
                                className="shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-black bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 shadow-sm transition-all cursor-pointer flex items-center gap-1 self-start md:self-center"
                              >
                                <Sparkles size={12} />
                                <span>⚡ Aplicar Sugestão ({sugestao.pct}%)</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
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

      {/* ─── MODAL DE IMPRESSÃO: TABELA EM FOLHA A4 (35 POR FOLHA) & ROLO TÉRMICO ─── */}
      {showPrintModal && (() => {
        const listaParaImprimir = expandirItensPorQtd(itensAtivos, tipoQtdImpressao);
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
                        {modoImpressao === 'tabela_a4' ? 'Tabela: 35 por Folha A4' : 'Rolo Térmico'}
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
                        imprimirTabelaFolhaA4(itensAtivos, tipoQtdImpressao);
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
    </div>
  );
};
