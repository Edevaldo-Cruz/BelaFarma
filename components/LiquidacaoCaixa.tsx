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

  // Impressão individual da etiqueta com medida estrita de 39x39mm
  interface DadosEtiqueta39 {
    descricao: string;
    apresentacao?: string;
    preco_normal: number;
    preco_promocional: number;
    cod_barras?: string;
    produto_id?: number;
    data_termino?: string;
  }

  const imprimirEtiqueta39x39 = (dadosCustom?: DadosEtiqueta39) => {
    let dados: DadosEtiqueta39;

    if (dadosCustom) {
      dados = dadosCustom;
    } else {
      if (!candidato) return;
      const valFinal = parseFloat(customPrice.replace(',', '.')) || candidato.preco_sugerido;
      dados = {
        descricao: candidato.descricao,
        apresentacao: candidato.apresentacao,
        preco_normal: candidato.preco_normal,
        preco_promocional: valFinal,
        cod_barras: candidato.cod_barras,
        produto_id: candidato.produto_id,
        data_termino: dataTermino || candidato.vigencia_padrao?.data_termino
      };
    }

    const printWindow = window.open('', '_blank', 'width=450,height=450');
    if (!printWindow) {
      window.print();
      return;
    }

    const valNormal = dados.preco_normal || 0;
    const valPromo = dados.preco_promocional || 0;
    const descPct = valNormal > 0 ? Math.round(((valNormal - valPromo) / valNormal) * 100) : 0;
    const validadeFormatada = dados.data_termino ? dados.data_termino.split('-').reverse().join('/') : '';
    const eanLimpo = dados.cod_barras ? dados.cod_barras.trim() : '';

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
          * {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html, body {
            margin: 0;
            padding: 0;
            width: 39mm;
            height: 39mm;
            max-width: 39mm;
            max-height: 39mm;
            overflow: hidden;
            font-family: Arial, Helvetica, sans-serif;
            background: #fff;
          }
          .tag-39mm {
            width: 39mm;
            height: 39mm;
            max-width: 39mm;
            max-height: 39mm;
            box-sizing: border-box;
            padding: 1.2mm 1.2mm 0.8mm 1.2mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            border: 0.4mm solid #dc2626;
            border-radius: 1.2mm;
            text-align: center;
            background: #fff;
            overflow: hidden;
          }
          .tag-header {
            background: #dc2626;
            color: #ffffff;
            font-size: 2.1mm;
            font-weight: 900;
            padding: 0.4mm 0.6mm;
            border-radius: 0.6mm;
            text-transform: uppercase;
            letter-spacing: 0.2mm;
            line-height: 1;
          }
          .tag-title {
            font-size: 2.3mm;
            font-weight: 900;
            color: #0f172a;
            line-height: 1.15;
            max-height: 5.5mm;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            text-transform: uppercase;
            margin: 0.3mm 0;
            word-break: break-word;
          }
          .tag-box {
            background: #fff1f2;
            border: 0.3mm dashed #ef4444;
            border-radius: 1mm;
            padding: 0.5mm 0.8mm;
            margin: 0.2mm 0;
          }
          .tag-de {
            font-size: 1.9mm;
            color: #64748b;
            text-decoration: line-through;
            font-weight: 700;
            line-height: 1;
          }
          .tag-por-container {
            display: flex;
            align-items: baseline;
            justify-content: center;
            gap: 0.6mm;
            margin-top: 0.2mm;
            line-height: 1;
          }
          .tag-por-label {
            font-size: 2mm;
            font-weight: 900;
            color: #dc2626;
          }
          .tag-por-val {
            font-size: 5mm;
            font-weight: 900;
            color: #dc2626;
            letter-spacing: -0.2mm;
            line-height: 1;
          }
          .tag-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 0.2mm solid #e2e8f0;
            padding-top: 0.4mm;
            font-size: 1.7mm;
            font-weight: 800;
            color: #475569;
            line-height: 1;
          }
          .tag-badge {
            background: #f59e0b;
            color: #000;
            padding: 0.2mm 0.6mm;
            border-radius: 0.5mm;
            font-size: 1.8mm;
            font-weight: 900;
          }
          .tag-ean {
            font-size: 1.5mm;
            font-family: monospace;
            color: #94a3b8;
            line-height: 1;
            margin-top: 0.2mm;
            white-space: nowrap;
            overflow: hidden;
          }
        </style>
      </head>
      <body>
        <div class="tag-39mm">
          <div class="tag-header">BELAFARMA OFERTA</div>
          <div class="tag-title">${dados.descricao}${dados.apresentacao ? ' ' + dados.apresentacao : ''}</div>
          <div class="tag-box">
            <div class="tag-de">DE: R$ ${valNormal.toFixed(2).replace('.', ',')}</div>
            <div class="tag-por-container">
              <span class="tag-por-label">POR:</span>
              <span class="tag-por-val">R$ ${valPromo.toFixed(2).replace('.', ',')}</span>
            </div>
          </div>
          <div class="tag-footer">
            ${descPct > 0 ? `<span class="tag-badge">${descPct}% OFF</span>` : '<span>OFERTA</span>'}
            <span>ATÉ ${validadeFormatada}</span>
          </div>
          ${eanLimpo ? `<div class="tag-ean">EAN: ${eanLimpo} | CÓD: ${dados.produto_id || ''}</div>` : ''}
        </div>
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Impressão em lote de todas as etiquetas com medida estrita de 39x39mm
  const imprimirLote39x39 = (itens: ItemAtivo[]) => {
    if (!itens || itens.length === 0) return;

    const printWindow = window.open('', '_blank', 'width=500,height=600');
    if (!printWindow) {
      window.print();
      return;
    }

    const tagsHtml = itens.map(item => {
      const valNormal = item.preco_normal || 0;
      const valPromo = item.preco_promocional || 0;
      const descPct = item.desconto_percentual || (valNormal > 0 ? Math.round(((valNormal - valPromo) / valNormal) * 100) : 0);
      const validadeFormatada = item.data_termino ? item.data_termino.split('-').reverse().join('/') : '';
      const eanLimpo = item.ean ? item.ean.trim() : (item.cod_barras ? item.cod_barras.trim() : '');

      return `
        <div class="tag-page">
          <div class="tag-39mm">
            <div class="tag-header">BELAFARMA OFERTA</div>
            <div class="tag-title">${item.descricao}${item.apresentacao ? ' ' + item.apresentacao : ''}</div>
            <div class="tag-box">
              <div class="tag-de">DE: R$ ${valNormal.toFixed(2).replace('.', ',')}</div>
              <div class="tag-por-container">
                <span class="tag-por-label">POR:</span>
                <span class="tag-por-val">R$ ${valPromo.toFixed(2).replace('.', ',')}</span>
              </div>
            </div>
            <div class="tag-footer">
              ${descPct > 0 ? `<span class="tag-badge">${descPct}% OFF</span>` : '<span>OFERTA</span>'}
              <span>ATÉ ${validadeFormatada}</span>
            </div>
            ${eanLimpo ? `<div class="tag-ean">EAN: ${eanLimpo} | CÓD: ${item.produto_id || ''}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

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
          * {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
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
          .tag-39mm {
            width: 39mm;
            height: 39mm;
            max-width: 39mm;
            max-height: 39mm;
            box-sizing: border-box;
            padding: 1.2mm 1.2mm 0.8mm 1.2mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            border: 0.4mm solid #dc2626;
            border-radius: 1.2mm;
            text-align: center;
            background: #fff;
            overflow: hidden;
          }
          .tag-header {
            background: #dc2626;
            color: #ffffff;
            font-size: 2.1mm;
            font-weight: 900;
            padding: 0.4mm 0.6mm;
            border-radius: 0.6mm;
            text-transform: uppercase;
            letter-spacing: 0.2mm;
            line-height: 1;
          }
          .tag-title {
            font-size: 2.3mm;
            font-weight: 900;
            color: #0f172a;
            line-height: 1.15;
            max-height: 5.5mm;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            text-transform: uppercase;
            margin: 0.3mm 0;
            word-break: break-word;
          }
          .tag-box {
            background: #fff1f2;
            border: 0.3mm dashed #ef4444;
            border-radius: 1mm;
            padding: 0.5mm 0.8mm;
            margin: 0.2mm 0;
          }
          .tag-de {
            font-size: 1.9mm;
            color: #64748b;
            text-decoration: line-through;
            font-weight: 700;
            line-height: 1;
          }
          .tag-por-container {
            display: flex;
            align-items: baseline;
            justify-content: center;
            gap: 0.6mm;
            margin-top: 0.2mm;
            line-height: 1;
          }
          .tag-por-label {
            font-size: 2mm;
            font-weight: 900;
            color: #dc2626;
          }
          .tag-por-val {
            font-size: 5mm;
            font-weight: 900;
            color: #dc2626;
            letter-spacing: -0.2mm;
            line-height: 1;
          }
          .tag-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 0.2mm solid #e2e8f0;
            padding-top: 0.4mm;
            font-size: 1.7mm;
            font-weight: 800;
            color: #475569;
            line-height: 1;
          }
          .tag-badge {
            background: #f59e0b;
            color: #000;
            padding: 0.2mm 0.6mm;
            border-radius: 0.5mm;
            font-size: 1.8mm;
            font-weight: 900;
          }
          .tag-ean {
            font-size: 1.5mm;
            font-family: monospace;
            color: #94a3b8;
            line-height: 1;
            margin-top: 0.2mm;
            white-space: nowrap;
            overflow: hidden;
          }
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

            {/* ─── PRÉ-VISUALIZAÇÃO DA ETIQUETA DE OFERTA / GÔNDOLA (39x39mm) ─── */}
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600">
                    <Tag size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      Etiqueta de Gôndola (39mm × 39mm)
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300">
                        Medida Exata 39×39mm
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Formato calibrado rigorosamente para 39×39mm, não ultrapassa o limite da etiqueta de prateleira.
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
                    onClick={() => imprimirEtiqueta39x39()}
                    className="px-4 py-1.5 rounded-xl text-xs font-black bg-amber-400 hover:bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer size={13} />
                    Imprimir Etiqueta (39x39mm)
                  </button>
                </div>
              </div>

              {mostrarEtiqueta && (
                <div className="flex flex-col items-center justify-center p-6 bg-slate-200/60 dark:bg-slate-950 rounded-2xl gap-3">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <span>📏 Pré-visualização da Etiqueta Física (39mm × 39mm):</span>
                  </div>

                  {/* Cartão de Etiqueta Física 39x39mm (Proporção Exata 1:1) */}
                  <div 
                    style={{ width: '156px', height: '156px' }}
                    className="bg-white text-slate-900 border-2 border-red-600 rounded-lg shadow-xl p-2 text-center flex flex-col justify-between overflow-hidden select-none"
                  >
                    <div className="bg-red-600 text-white py-0.5 px-1 rounded text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1">
                      <Flame size={10} className="fill-white" />
                      BELAFARMA OFERTA
                    </div>

                    <div className="my-0.5">
                      <h3 className="text-[9px] font-black uppercase leading-tight line-clamp-2 text-slate-900">
                        {candidato.descricao}
                      </h3>
                      {candidato.apresentacao && (
                        <p className="text-[7.5px] font-semibold text-slate-500 line-clamp-1">
                          {candidato.apresentacao}
                        </p>
                      )}
                    </div>

                    <div className="bg-red-50/90 border border-dashed border-red-300 rounded p-1 my-0.5">
                      <div className="text-[8px] font-bold text-slate-400 line-through leading-tight">
                        DE: {fmt(candidato.preco_normal)}
                      </div>
                      <div className="flex items-baseline justify-center gap-1 leading-tight">
                        <span className="text-[8px] font-black text-red-600 uppercase">POR:</span>
                        <span className="text-[17px] font-black text-red-600 tracking-tight">
                          {fmt(parsedPrice || candidato.preco_sugerido)}
                        </span>
                      </div>
                    </div>

                    <div className="pt-1 border-t border-slate-200 flex items-center justify-between text-[7.5px] font-bold text-slate-500 leading-tight">
                      {currentDiscountPercent > 0 ? (
                        <span className="bg-amber-400 text-slate-950 px-1 rounded font-black text-[7.5px]">
                          {currentDiscountPercent}% OFF
                        </span>
                      ) : (
                        <span>OFERTA</span>
                      )}
                      <span>ATÉ {dataTermino ? dataTermino.split('-').reverse().join('/') : '-'}</span>
                    </div>

                    {candidato.cod_barras && (
                      <div className="text-[6.5px] font-mono text-slate-400 truncate mt-0.5">
                        EAN: {candidato.cod_barras} | ID: {candidato.produto_id}
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
                  <th className="pb-3 text-center">Desfazer Preço / Ações</th>
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
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleReverter(item)}
                          disabled={revertingId === item.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/60 transition-all active:scale-95 cursor-pointer shadow-sm disabled:opacity-50"
                          title="Desfazer alteração e voltar ao preço original no Digifarma"
                        >
                          {revertingId === item.id ? (
                            <>
                              <Loader2 size={13} className="animate-spin text-red-600" />
                              <span>Desfazendo...</span>
                            </>
                          ) : (
                            <>
                              <RotateCcw size={13} />
                              <span>Desfazer Preço</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => imprimirEtiqueta39x39({
                            descricao: item.descricao,
                            apresentacao: item.apresentacao,
                            preco_normal: item.preco_normal,
                            preco_promocional: item.preco_promocional,
                            cod_barras: item.ean || item.cod_barras,
                            produto_id: item.produto_id,
                            data_termino: item.data_termino
                          })}
                          className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-sm cursor-pointer"
                          title="Imprimir Etiqueta 39x39mm deste item"
                        >
                          <Printer size={14} />
                        </button>
                      </div>
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

      {/* ─── MODAL DE IMPRESSÃO DE ETIQUETAS DE GÔNDOLA (39x39mm) ─── */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-5xl max-h-[90vh] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600">
                  <Flame size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                    Etiquetas de Gôndola (39mm × 39mm)
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300">
                      Medida Estrita 39×39mm
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    {itensAtivos.length} etiqueta(s) calibrada(s) exatamente para 39×39mm. Não ultrapassa a prateleira.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => imprimirLote39x39(itensAtivos)}
                  className="px-5 py-2.5 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-orange-500/25 active:scale-95 transition-all cursor-pointer"
                >
                  <Printer size={15} />
                  Imprimir Todas (39x39mm)
                </button>
                <button
                  onClick={() => setShowPrintModal(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body: Pré-visualização das etiquetas 39x39mm */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-100 dark:bg-slate-950">
              <div className="flex flex-wrap gap-4 items-center justify-center">
                {itensAtivos.map((item) => {
                  const eanLimpo = item.ean ? item.ean.trim() : (item.cod_barras ? item.cod_barras.trim() : '');
                  return (
                    <div 
                      key={item.id}
                      style={{ width: '160px', height: '160px' }}
                      className="bg-white text-slate-900 border-2 border-red-600 rounded-lg shadow-md p-2 text-center flex flex-col justify-between overflow-hidden select-none relative group"
                    >
                      <div className="bg-red-600 text-white py-0.5 px-1 rounded text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1">
                        <Flame size={9} className="fill-white" />
                        BELAFARMA OFERTA
                      </div>

                      <div className="my-0.5">
                        <h4 className="text-[9px] font-black uppercase leading-tight line-clamp-2 text-slate-900">
                          {item.descricao}
                        </h4>
                        {item.apresentacao && (
                          <p className="text-[7.5px] font-semibold text-slate-500 line-clamp-1">
                            {item.apresentacao}
                          </p>
                        )}
                      </div>

                      <div className="bg-red-50/90 border border-dashed border-red-300 rounded p-1 my-0.5">
                        <div className="text-[8px] font-bold text-slate-400 line-through leading-tight">
                          DE: {fmt(item.preco_normal)}
                        </div>
                        <div className="flex items-baseline justify-center gap-1 leading-tight">
                          <span className="text-[8px] font-black text-red-600 uppercase">POR:</span>
                          <span className="text-[16px] font-black text-red-600 tracking-tight">
                            {fmt(item.preco_promocional)}
                          </span>
                        </div>
                      </div>

                      <div className="pt-1 border-t border-slate-200 flex items-center justify-between text-[7.5px] font-bold text-slate-500 leading-tight">
                        <span className="bg-amber-400 text-slate-950 px-1 rounded font-black text-[7.5px]">
                          {item.desconto_percentual}% OFF
                        </span>
                        <span>ATÉ {item.data_termino ? item.data_termino.split('-').reverse().join('/') : '-'}</span>
                      </div>

                      {eanLimpo && (
                        <div className="text-[6.5px] font-mono text-slate-400 truncate mt-0.5">
                          EAN: {eanLimpo} | ID: {item.produto_id}
                        </div>
                      )}

                      {/* Botão de impressão unitária no hover */}
                      <button
                        onClick={() => imprimirEtiqueta39x39({
                          descricao: item.descricao,
                          apresentacao: item.apresentacao,
                          preco_normal: item.preco_normal,
                          preco_promocional: item.preco_promocional,
                          cod_barras: eanLimpo,
                          produto_id: item.produto_id,
                          data_termino: item.data_termino
                        })}
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-white/90 hover:bg-white text-slate-700 p-1 rounded shadow transition-opacity"
                        title="Imprimir somente esta etiqueta 39x39mm"
                      >
                        <Printer size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
