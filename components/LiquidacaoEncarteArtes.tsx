import React, { useState, useRef, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import {
  htmlArteUnitaria,
  htmlPaginaEncarte,
  prepararImagensArte,
  renderizarHtmlParaCanvas,
  DIMENSOES_UNITARIO,
  DIMENSOES_A4
} from './encarteTemplates';
import {
  Image as ImageIcon,
  Sparkles,
  Download,
  Upload,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Printer,
  Copy,
  Check,
  Flame,
  FileText,
  Layers,
  Trash2,
  Share2,
  Package
} from 'lucide-react';
import { useToast } from './ToastContext';

export interface ItemLiquidacaoArte {
  id: string;
  produto_id: number;
  descricao: string;
  apresentacao?: string;
  ean?: string;
  categoria?: string;
  saldo_estoque: number;
  preco_custo: number;
  preco_normal: number;
  preco_promocional: number;
  desconto_percentual: number;
  data_inicio: string;
  data_termino: string;
  imagem_url?: string;
}

interface LiquidacaoEncarteArtesProps {
  itens: ItemLiquidacaoArte[];
  onAtualizarItens: () => void;
  dataInicioCampanha?: string;
  dataTerminoCampanha?: string;
}

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export const LiquidacaoEncarteArtes: React.FC<LiquidacaoEncarteArtesProps> = ({
  itens,
  onAtualizarItens,
  dataInicioCampanha = '2026-10-05',
  dataTerminoCampanha = '2026-10-31'
}) => {
  const { addToast } = useToast();

  // Sub-abas do Gerador
  const [subAba, setSubAba] = useState<'unitarias' | 'encarte' | 'fotos'>('unitarias');

  // Gestão de Fotos
  const [buscandoGeral, setBuscandoGeral] = useState(false);
  const [loadingProdId, setLoadingProdId] = useState<number | null>(null);
  const [filtroFoto, setFiltroFoto] = useState<'todos' | 'com_foto' | 'sem_foto'>('todos');
  const [termoBuscaFoto, setTermoBuscaFoto] = useState('');

  // Arte Unitária
  const [produtoIndex, setProdutoIndex] = useState(0);
  const [formatoUnitario, setFormatoUnitario] = useState<'story' | 'feed'>('story');
  const [gerandoDownload, setGerandoDownload] = useState(false);
  const [copiandoImagem, setCopiandoImagem] = useState(false);
  const [gerandoZip, setGerandoZip] = useState(false);
  const [progressoZip, setProgressoZip] = useState({ atual: 0, total: 0 });

  // Encarte Geral
  const [produtosPorPagina, setProdutosPorPagina] = useState<number>(8); // 8 produtos por página no A4
  const [paginaEncarteAtual, setPaginaEncarteAtual] = useState(1);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [gerandoPaginasPng, setGerandoPaginasPng] = useState(false);

  // Refs de renderização
  // Controle de recarga do preview quando as fotos recortadas ficam prontas
  const [imgVersion, setImgVersion] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetId, setUploadTargetId] = useState<number | null>(null);

  // Formatação de datas
  const inicioFmt = dataInicioCampanha.split('-').reverse().join('/');
  const terminoFmt = dataTerminoCampanha.split('-').reverse().join('/');

  // Filtro da lista de fotos
  const itensFiltradosFotos = itens.filter(it => {
    const matchTermo = termoBuscaFoto === '' || 
      it.descricao.toLowerCase().includes(termoBuscaFoto.toLowerCase()) ||
      String(it.produto_id).includes(termoBuscaFoto) ||
      (it.ean && it.ean.includes(termoBuscaFoto));
    
    if (!matchTermo) return false;
    if (filtroFoto === 'com_foto') return !!it.imagem_url;
    if (filtroFoto === 'sem_foto') return !it.imagem_url;
    return true;
  });

  const totalComFoto = itens.filter(i => !!i.imagem_url).length;

  // Produto atualmente selecionado para arte unitária
  const produtoAtual = itens[produtoIndex] || itens[0];

  // Paginação do Encarte Geral
  const totalPaginasEncarte = Math.ceil(itens.length / produtosPorPagina) || 1;
  const itensPaginaEncarte = itens.slice(
    (paginaEncarteAtual - 1) * produtosPorPagina,
    paginaEncarteAtual * produtosPorPagina
  );

  // ─── AÇÕES DE FOTOS ───

  const handleBuscarFotoAuto = async (item: ItemLiquidacaoArte) => {
    setLoadingProdId(item.produto_id);
    try {
      const res = await fetch('/api/liquidacao/buscar-imagem-auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produto_id: item.produto_id,
          ean: item.ean,
          descricao: item.descricao
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`Foto encontrada para "${item.descricao}"!`, 'success');
        onAtualizarItens();
      } else {
        addToast(`Nenhuma foto encontrada na web para este item. Você pode fazer upload manual.`, 'warning');
      }
    } catch (e) {
      addToast('Erro ao buscar foto na web.', 'error');
    } finally {
      setLoadingProdId(null);
    }
  };

  const handleBuscarTodasFotosAuto = async () => {
    setBuscandoGeral(true);
    addToast('Iniciando busca automática de fotos na web para os produtos sem imagem...', 'info');
    try {
      const res = await fetch('/api/liquidacao/buscar-todas-imagens-auto', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`Busca concluída! ${data.encontrados} novas fotos adicionadas ao catálogo.`, 'success');
        onAtualizarItens();
      } else {
        addToast('Falha na busca em lote.', 'error');
      }
    } catch (e) {
      addToast('Erro na conexão com o servidor.', 'error');
    } finally {
      setBuscandoGeral(false);
    }
  };

  const handleTriggerUpload = (produtoId: number) => {
    setUploadTargetId(produtoId);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTargetId) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        const res = await fetch('/api/liquidacao/salvar-imagem-manual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            produto_id: uploadTargetId,
            imagem_base64: base64
          })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          addToast('Foto atualizada com sucesso!', 'success');
          onAtualizarItens();
        } else {
          addToast('Erro ao salvar foto.', 'error');
        }
      } catch (err) {
        addToast('Falha no upload.', 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoverFoto = async (produtoId: number) => {
    if (!window.confirm('Deseja remover a foto deste produto?')) return;
    try {
      const res = await fetch('/api/liquidacao/remover-imagem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produto_id: produtoId })
      });
      if (res.ok) {
        addToast('Foto removida.', 'info');
        onAtualizarItens();
      }
    } catch (e) {
      addToast('Erro ao remover foto.', 'error');
    }
  };

  // ─── PREVIEW & EXPORTAÇÃO (fonte única: encarteTemplates.ts) ───

  const periodoArte = { inicio: inicioFmt, termino: terminoFmt };
  const colunasEncarte: 3 | 4 = produtosPorPagina === 6 ? 3 : 4;

  // Recorta o fundo das fotos (PNG transparente) e atualiza o preview quando terminar
  useEffect(() => {
    let cancelado = false;
    prepararImagensArte(itens).then(() => {
      if (!cancelado) setImgVersion(v => v + 1);
    });
    return () => { cancelado = true; };
  }, [itens]);

  const dimUnit = DIMENSOES_UNITARIO[formatoUnitario];
  const zoomUnit = formatoUnitario === 'story' ? 0.62 : 0.8;

  // imgVersion força o recálculo do HTML quando as imagens recortadas ficam prontas
  const htmlArteAtual = React.useMemo(
    () => (produtoAtual ? htmlArteUnitaria(produtoAtual, formatoUnitario, periodoArte) : ''),
    [produtoAtual, formatoUnitario, inicioFmt, terminoFmt, imgVersion]
  );
  const htmlEncartePaginaAtual = React.useMemo(
    () => htmlPaginaEncarte(itensPaginaEncarte, paginaEncarteAtual, totalPaginasEncarte, periodoArte, colunasEncarte),
    [itensPaginaEncarte, paginaEncarteAtual, totalPaginasEncarte, inicioFmt, terminoFmt, colunasEncarte, imgVersion]
  );

  const slugProduto = (desc: string) => desc.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);

  // ─── AÇÕES DE ARTE UNITÁRIA ───

  const handleBaixarArteUnitario = async () => {
    if (!produtoAtual) return;
    setGerandoDownload(true);
    try {
      await prepararImagensArte([produtoAtual]);
      const canvas = await renderizarHtmlParaCanvas(
        htmlArteUnitaria(produtoAtual, formatoUnitario, periodoArte), dimUnit.w, dimUnit.h, 2
      );
      const link = document.createElement('a');
      link.download = `BelaFarma_Liquidacao_${formatoUnitario}_${slugProduto(produtoAtual.descricao)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      addToast('Arte baixada com sucesso!', 'success');
    } catch (e) {
      console.error(e);
      addToast('Erro ao renderizar arte.', 'error');
    } finally {
      setGerandoDownload(false);
    }
  };

  const handleCopiarArteUnitario = async () => {
    if (!produtoAtual) return;
    setCopiandoImagem(true);
    try {
      await prepararImagensArte([produtoAtual]);
      const canvas = await renderizarHtmlParaCanvas(
        htmlArteUnitaria(produtoAtual, formatoUnitario, periodoArte), dimUnit.w, dimUnit.h, 2
      );
      canvas.toBlob(async (blob) => {
        if (blob) {
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            addToast('Imagem copiada para a área de transferência! Cole no WhatsApp ou Instagram.', 'success');
          } catch (clipErr) {
            addToast('Navegador não suportou cópia direta. Baixe a imagem pelo botão de download.', 'warning');
          }
        }
      });
    } catch (e) {
      addToast('Erro ao copiar imagem.', 'error');
    } finally {
      setCopiandoImagem(false);
    }
  };

  const handleBaixarTodasArtesZip = async () => {
    if (itens.length === 0) return;
    setGerandoZip(true);
    setProgressoZip({ atual: 0, total: itens.length });
    addToast(`Gerando arquivo ZIP com todas as ${itens.length} artes... Aguarde alguns instantes.`, 'info');

    const zip = new JSZip();
    const pasta = zip.folder(`Artes_Liquidacao_BelaFarma_${formatoUnitario.toUpperCase()}`);

    try {
      await prepararImagensArte(itens);
      for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        setProgressoZip({ atual: i + 1, total: itens.length });
        const canvas = await renderizarHtmlParaCanvas(
          htmlArteUnitaria(item, formatoUnitario, periodoArte), dimUnit.w, dimUnit.h, 2
        );
        const base64Data = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
        const fileName = `${String(i + 1).padStart(2, '0')}_${item.produto_id}_${slugProduto(item.descricao)}.png`;
        pasta?.file(fileName, base64Data, { base64: true });
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const downloadLink = document.createElement('a');
      downloadLink.href = URL.createObjectURL(zipBlob);
      downloadLink.download = `BelaFarma_Artes_Liquidacao_${formatoUnitario.toUpperCase()}_Completo.zip`;
      downloadLink.click();
      addToast(`🎉 Todas as ${itens.length} artes foram empacotadas no arquivo ZIP com sucesso!`, 'success');
    } catch (e) {
      console.error('Erro ao gerar ZIP:', e);
      addToast('Erro ao criar arquivo ZIP das artes.', 'error');
    } finally {
      setGerandoZip(false);
    }
  };

  // ─── AÇÕES DE ENCARTE GERAL ───

  const handleBaixarPaginaPng = async () => {
    setGerandoPaginasPng(true);
    try {
      await prepararImagensArte(itensPaginaEncarte);
      const canvas = await renderizarHtmlParaCanvas(
        htmlPaginaEncarte(itensPaginaEncarte, paginaEncarteAtual, totalPaginasEncarte, periodoArte, colunasEncarte),
        DIMENSOES_A4.w, DIMENSOES_A4.h, 2.5
      );
      const link = document.createElement('a');
      link.download = `BelaFarma_Encarte_Pagina_${paginaEncarteAtual}_de_${totalPaginasEncarte}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      addToast(`Página ${paginaEncarteAtual} do Encarte baixada com sucesso!`, 'success');
    } catch (e) {
      addToast('Erro ao gerar imagem do encarte.', 'error');
    } finally {
      setGerandoPaginasPng(false);
    }
  };

  const handleBaixarPdfCompleto = async () => {
    setGerandoPdf(true);
    addToast('Gerando Encarte Tablóide A4 completo em PDF de alta resolução...', 'info');

    try {
      await prepararImagensArte(itens);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      for (let p = 1; p <= totalPaginasEncarte; p++) {
        const itensDaPagina = itens.slice((p - 1) * produtosPorPagina, p * produtosPorPagina);
        const canvas = await renderizarHtmlParaCanvas(
          htmlPaginaEncarte(itensDaPagina, p, totalPaginasEncarte, periodoArte, colunasEncarte),
          DIMENSOES_A4.w, DIMENSOES_A4.h, 2
        );
        if (p > 1) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
      }

      pdf.save(`Encarte_Tabloide_BelaFarma_Completo.pdf`);
      addToast('🎉 Encarte Tablóide A4 em PDF gerado com sucesso!', 'success');
    } catch (e) {
      console.error(e);
      addToast('Erro ao gerar PDF do encarte.', 'error');
    } finally {
      setGerandoPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Input oculto para upload de arquivo manual */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* ─── NAVEGAÇÃO DE SUB-ABAS ─── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-2 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setSubAba('unitarias')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
              subAba === 'unitarias'
                ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-md shadow-red-500/20'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles size={15} />
            <span>Artes Unitárias (Stories & Feed)</span>
          </button>

          <button
            type="button"
            onClick={() => setSubAba('encarte')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
              subAba === 'encarte'
                ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-md shadow-red-500/20'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <FileText size={15} />
            <span>Encarte Geral Tablóide ({itens.length} Produtos)</span>
          </button>

          <button
            type="button"
            onClick={() => setSubAba('fotos')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
              subAba === 'fotos'
                ? 'bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-md shadow-red-500/20'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ImageIcon size={15} />
            <span>Catálogo de Fotos ({totalComFoto}/{itens.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 pr-2">
          <span>Identidade Visual:</span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 font-black text-[11px] border border-red-300">
            🎂 1º Aniversário Bela Farma Sul
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SUB-ABA 1: ARTES UNITÁRIAS (STORIES 9:16 & FEED 4:5)
      ═══════════════════════════════════════════════════════════════ */}
      {subAba === 'unitarias' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Coluna da Esquerda: Controles e Seletor de Produtos */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-orange-500" />
                  Gerador de Artes Promocionais Individuais
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Artes personalizadas com o template oficial para WhatsApp Status e Instagram.
                </p>
              </div>

              {/* Seletor de Formato */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setFormatoUnitario('story')}
                  className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    formatoUnitario === 'story'
                      ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span>📱 Story / Status (9:16)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormatoUnitario('feed')}
                  className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    formatoUnitario === 'feed'
                      ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span>🟦 Feed (4:5)</span>
                </button>
              </div>

              {/* Navegação entre os 48 produtos */}
              <div className="flex items-center justify-between border-t border-b border-slate-100 dark:border-slate-800 py-3">
                <button
                  type="button"
                  disabled={produtoIndex <= 0}
                  onClick={() => setProdutoIndex(p => Math.max(0, p - 1))}
                  className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 disabled:opacity-30 cursor-pointer"
                  title="Produto Anterior"
                >
                  <ChevronLeft size={18} />
                </button>

                <div className="text-center">
                  <span className="text-xs font-mono font-black text-slate-400">
                    PRODUTO {produtoIndex + 1} DE {itens.length}
                  </span>
                  <h4 className="text-xs font-black text-slate-900 dark:text-white truncate max-w-[200px]">
                    {produtoAtual?.descricao}
                  </h4>
                </div>

                <button
                  type="button"
                  disabled={produtoIndex >= itens.length - 1}
                  onClick={() => setProdutoIndex(p => Math.min(itens.length - 1, p + 1))}
                  className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 disabled:opacity-30 cursor-pointer"
                  title="Próximo Produto"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              {/* Botões de Ação da Arte Atual */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleBaixarArteUnitario}
                  disabled={gerandoDownload}
                  className="py-3 px-3 rounded-2xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-md shadow-red-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Download size={14} className={gerandoDownload ? 'animate-bounce' : ''} />
                  <span>{gerandoDownload ? 'Baixando...' : 'Baixar Imagem PNG'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopiarArteUnitario}
                  disabled={copiandoImagem}
                  className="py-3 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {copiandoImagem ? <RefreshCw size={14} className="animate-spin" /> : <Copy size={14} />}
                  <span>Copiar Imagem</span>
                </button>
              </div>

              {/* Botão Master: Baixar Todas em ZIP */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleBaixarTodasArtesZip}
                  disabled={gerandoZip}
                  className="w-full py-3.5 px-4 rounded-2xl bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-black flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {gerandoZip ? (
                    <>
                      <RefreshCw size={16} className="animate-spin text-amber-400" />
                      <span>Gerando {progressoZip.atual} de {progressoZip.total} artes...</span>
                    </>
                  ) : (
                    <>
                      <Package size={16} className="text-amber-400" />
                      <span>📦 Baixar Todas as 48 Artes em Arquivo ZIP</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Lista Rápida de Produtos para Troca Direta */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm max-h-[300px] overflow-y-auto space-y-1">
              <span className="text-[11px] font-black uppercase text-slate-400 block mb-2">
                Clique para selecionar o produto na arte:
              </span>
              {itens.map((it, idx) => (
                <div
                  key={it.id}
                  onClick={() => setProdutoIndex(idx)}
                  className={`p-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    produtoIndex === idx
                      ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border border-orange-300'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">#{idx + 1}</span>
                    <span className="truncate">{it.descricao}</span>
                  </div>
                  <span className="font-black text-red-600 dark:text-red-400 shrink-0 ml-2">
                    {fmt(it.preco_promocional)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Coluna da Direita: Preview Visual ao Vivo da Arte */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-950/60 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-inner">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <span>👁️</span> Pré-visualização da Arte ({formatoUnitario.toUpperCase()})
            </span>

            {/* Arte unitária (mesmo HTML usado na exportação), exibida em escala reduzida */}
            <div
              className="shrink-0 shadow-2xl bg-white select-none rounded-2xl overflow-hidden"
              style={{ width: dimUnit.w * zoomUnit, height: dimUnit.h * zoomUnit }}
            >
              <div
                style={{ width: dimUnit.w, height: dimUnit.h, transform: `scale(${zoomUnit})`, transformOrigin: 'top left' }}
                dangerouslySetInnerHTML={{ __html: htmlArteAtual }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SUB-ABA 2: ENCARTE GERAL TABLÓIDE A4 (TODOS OS 48 PRODUTOS)
      ═══════════════════════════════════════════════════════════════ */}
      {subAba === 'encarte' && (
        <div className="space-y-6">
          {/* Barra de Controles do Encarte */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-red-600" />
                Encarte Tablóide de Aniversário ({itens.length} Produtos)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Diagramado no padrão oficial de farmácia em folhas A4 com alta densidade e apelo de compra.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Seletor de Produtos por Página */}
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                <span>Por página:</span>
                <select
                  value={produtosPorPagina}
                  onChange={(e) => {
                    setProdutosPorPagina(Number(e.target.value));
                    setPaginaEncarteAtual(1);
                  }}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold cursor-pointer"
                >
                  <option value={6}>6 produtos (Super Destaque)</option>
                  <option value={8}>8 produtos (Padrão Equilibrado)</option>
                  <option value={12}>12 produtos (Alta Densidade)</option>
                </select>
              </div>

              {/* Botão Baixar Imagem da Página Atual */}
              <button
                type="button"
                onClick={handleBaixarPaginaPng}
                disabled={gerandoPaginasPng}
                className="px-4 py-2 rounded-xl text-xs font-black bg-orange-500 hover:bg-orange-600 text-white shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                <Download size={14} />
                <span>Baixar Página {paginaEncarteAtual} (PNG)</span>
              </button>

              {/* Botão Baixar PDF Completo */}
              <button
                type="button"
                onClick={handleBaixarPdfCompleto}
                disabled={gerandoPdf}
                className="px-4 py-2 rounded-xl text-xs font-black bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-600/20 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                {gerandoPdf ? <RefreshCw size={14} className="animate-spin" /> : <Printer size={14} />}
                <span>{gerandoPdf ? 'Gerando PDF...' : `Baixar Encarte Completo em PDF (${totalPaginasEncarte} Págs)`}</span>
              </button>
            </div>
          </div>

          {/* Navegação de Páginas do Encarte */}
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={paginaEncarteAtual <= 1}
              onClick={() => setPaginaEncarteAtual(p => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-30 cursor-pointer flex items-center gap-1"
            >
              <ChevronLeft size={14} /> Página Anterior
            </button>

            <span className="text-xs font-black text-slate-700 dark:text-slate-300">
              Página <strong>{paginaEncarteAtual}</strong> de <strong>{totalPaginasEncarte}</strong>
            </span>

            <button
              type="button"
              disabled={paginaEncarteAtual >= totalPaginasEncarte}
              onClick={() => setPaginaEncarteAtual(p => Math.min(totalPaginasEncarte, p + 1))}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-30 cursor-pointer flex items-center gap-1"
            >
              Próxima Página <ChevronRight size={14} />
            </button>
          </div>

          {/* Visualização da Página Atual do Encarte (mesmo HTML usado na exportação) */}
          <div className="flex justify-center overflow-x-auto p-4 bg-slate-200/80 dark:bg-slate-950/80 rounded-3xl">
            <div
              className="shrink-0 shadow-2xl bg-white select-none"
              style={{ width: DIMENSOES_A4.w * 0.9, height: DIMENSOES_A4.h * 0.9 }}
            >
              <div
                style={{ width: DIMENSOES_A4.w, height: DIMENSOES_A4.h, transform: 'scale(0.9)', transformOrigin: 'top left' }}
                dangerouslySetInnerHTML={{ __html: htmlEncartePaginaAtual }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SUB-ABA 3: GESTOR DE FOTOS DO CATÁLOGO (48 PRODUTOS)
      ═══════════════════════════════════════════════════════════════ */}
      {subAba === 'fotos' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-orange-500" />
                Catálogo de Fotos dos Produtos da Liquidação
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                O sistema busca automaticamente a foto oficial do remédio/cosmético pela internet. Você também pode subir fotos do computador.
              </p>
            </div>

            <button
              type="button"
              onClick={handleBuscarTodasFotosAuto}
              disabled={buscandoGeral}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-orange-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${buscandoGeral ? 'animate-spin' : ''}`} />
              <span>{buscandoGeral ? 'Buscando fotos na web...' : '⚡ Buscar Todas as Fotos Automaticamente'}</span>
            </button>
          </div>

          {/* Filtros e Busca de Fotos */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={termoBuscaFoto}
                onChange={(e) => setTermoBuscaFoto(e.target.value)}
                placeholder="Filtrar por nome ou código..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
              {[
                { id: 'todos', label: `Todos (${itens.length})` },
                { id: 'com_foto', label: `Com Foto (${totalComFoto})` },
                { id: 'sem_foto', label: `Sem Foto (${itens.length - totalComFoto})` }
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltroFoto(f.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    filtroFoto === f.id
                      ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Grid de Produtos e Fotos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {itensFiltradosFotos.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-orange-300 dark:hover:border-orange-700 bg-slate-50/50 dark:bg-slate-850/50 flex flex-col justify-between space-y-3 transition-all group"
              >
                <div>
                  {/* Miniatura da Foto */}
                  <div className="relative w-full h-32 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center p-2 overflow-hidden">
                    {item.imagem_url ? (
                      <img
                        src={item.imagem_url}
                        alt={item.descricao}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <div className="text-center text-slate-300 dark:text-slate-600 space-y-1">
                        <ImageIcon size={28} className="mx-auto opacity-40" />
                        <span className="text-[10px] font-bold block">Sem Foto</span>
                      </div>
                    )}

                    {item.imagem_url && (
                      <button
                        type="button"
                        onClick={() => handleRemoverFoto(item.produto_id)}
                        className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 transition-colors cursor-pointer"
                        title="Remover foto"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>

                  {/* Informações */}
                  <div className="mt-2">
                    <span className="font-mono text-[10px] font-black text-slate-400">#{item.produto_id}</span>
                    <h5 className="text-xs font-black text-slate-800 dark:text-white line-clamp-2 leading-snug">
                      {item.descricao}
                    </h5>
                    <div className="text-xs font-black text-red-600 dark:text-red-400 mt-1">
                      {fmt(item.preco_promocional)}
                    </div>
                  </div>
                </div>

                {/* Ações por Produto */}
                <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleBuscarFotoAuto(item)}
                    disabled={loadingProdId === item.produto_id}
                    className="py-1.5 px-2 rounded-xl text-[10px] font-black bg-orange-100 hover:bg-orange-200 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    title="Buscar foto automaticamente na internet"
                  >
                    <Search size={11} className={loadingProdId === item.produto_id ? 'animate-spin' : ''} />
                    <span>{loadingProdId === item.produto_id ? 'Buscando...' : 'Buscar Web'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTriggerUpload(item.produto_id)}
                    className="py-1.5 px-2 rounded-xl text-[10px] font-black bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-800 dark:text-slate-200 flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    title="Fazer upload de foto do computador ou celular"
                  >
                    <Upload size={11} />
                    <span>Subir Foto</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
