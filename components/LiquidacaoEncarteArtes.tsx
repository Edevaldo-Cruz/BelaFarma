import React, { useState, useRef, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import {
  htmlArteUnitaria,
  htmlPaginaEncarte,
  prepararImagensArte,
  renderizarHtmlParaCanvas,
  DIMENSOES_UNITARIO,
  DIMENSOES_A4,
  EstiloArte,
  ESTILO_PADRAO,
  TEMAS_PRONTOS,
  FONTES_DISPONIVEIS
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
  Package,
  Camera,
  SlidersHorizontal,
  Palette,
  Type,
  Link2,
  Globe,
  Sliders,
  X,
  ExternalLink,
  RotateCcw
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

  // Sub-abas principais do Gerador
  const [subAba, setSubAba] = useState<'unitarias' | 'encarte' | 'fotos'>('unitarias');

  // ─── ESTÚDIO VISUAL / EDITOR PROFISSIONAL DE ARTES ───
  const [painelEditorAberto, setPainelEditorAberto] = useState(false);
  const [abaEditor, setAbaEditor] = useState<'temas' | 'cores' | 'tipografia' | 'embalagem' | 'elementos'>('temas');
  const [estilo, setEstilo] = useState<EstiloArte>(() => {
    try {
      const salvo = localStorage.getItem('belafarma_arte_estilo');
      if (salvo) return { ...ESTILO_PADRAO, ...JSON.parse(salvo) };
    } catch (e) {}
    return ESTILO_PADRAO;
  });

  // ─── MODAL DE INSERÇÃO MANUAL DE IMAGEM (URL / NAPP / UPLOAD) ───
  const [modalImagemItem, setModalImagemItem] = useState<ItemLiquidacaoArte | null>(null);
  const [abaModalImagem, setAbaModalImagem] = useState<'url' | 'napp' | 'upload'>('url');
  const [urlInput, setUrlInput] = useState('');
  const [salvandoUrl, setSalvandoUrl] = useState(false);
  const [buscaNappInput, setBuscaNappInput] = useState('');
  const [resultadosNapp, setResultadosNapp] = useState<Array<{ ean: string; descricao: string; image_url: string; category?: string; brand?: string }>>([]);
  const [buscandoNapp, setBuscandoNapp] = useState(false);

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
  const [produtosPorPagina, setProdutosPorPagina] = useState<number>(8);
  const [paginaEncarteAtual, setPaginaEncarteAtual] = useState(1);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [gerandoPaginasPng, setGerandoPaginasPng] = useState(false);

  // Refs de renderização
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
  const produtoAtual = itens[produtoIndex] || itens[0];

  // Paginação do Encarte Geral
  const totalPaginasEncarte = Math.ceil(itens.length / produtosPorPagina) || 1;
  const itensPaginaEncarte = itens.slice(
    (paginaEncarteAtual - 1) * produtosPorPagina,
    paginaEncarteAtual * produtosPorPagina
  );

  // ─── AÇÕES DE FOTOS & MULTI-ORIGEM ───

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
        addToast(`Nenhuma foto encontrada automaticamente. Use o botão "Inserir Imagem" para colar um link ou buscar no Napp.`, 'warning');
      }
    } catch (e) {
      addToast('Erro ao buscar foto na web.', 'error');
    } finally {
      setLoadingProdId(null);
    }
  };

  const handleBuscarTodasFotosAuto = async () => {
    setBuscandoGeral(true);
    addToast('Consultando Cosmos CDN, Napp e Web para os produtos sem foto...', 'info');
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

  const abrirModalImagem = (item: ItemLiquidacaoArte) => {
    setModalImagemItem(item);
    setUrlInput('');
    setBuscaNappInput(item.descricao.split(' ')[0] || item.ean || '');
    setResultadosNapp([]);
    setModalImagemAbertoTrue();
  };

  const setModalImagemAbertoTrue = () => {
    // gatilho
  };

  const handleSalvarImagemPorUrl = async () => {
    if (!modalImagemItem || !urlInput.trim()) return;
    setSalvandoUrl(true);
    try {
      const res = await fetch('/api/liquidacao/salvar-imagem-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produto_id: modalImagemItem.produto_id,
          url: urlInput.trim()
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`Imagem salva com sucesso para ${modalImagemItem.descricao}!`, 'success');
        setModalImagemItem(null);
        onAtualizarItens();
      } else {
        addToast(data.error || 'Não foi possível baixar a imagem da URL.', 'error');
      }
    } catch (e) {
      addToast('Erro ao conectar com o servidor.', 'error');
    } finally {
      setSalvandoUrl(false);
    }
  };

  const handleBuscarNapp = async () => {
    if (!buscaNappInput.trim() || buscaNappInput.trim().length < 2) return;
    setBuscandoNapp(true);
    try {
      const res = await fetch(`/api/liquidacao/pesquisar-fotos-napp?q=${encodeURIComponent(buscaNappInput.trim())}`);
      const data = await res.json();
      if (res.ok) {
        setResultadosNapp(data.produtos || []);
        if ((data.produtos || []).length === 0) {
          addToast('Nenhuma imagem encontrada no catálogo Napp para este termo.', 'info');
        }
      }
    } catch (e) {
      addToast('Erro ao pesquisar catálogo Napp.', 'error');
    } finally {
      setBuscandoNapp(false);
    }
  };

  const handleAplicarFotoNapp = async (imageUrl: string) => {
    if (!modalImagemItem) return;
    setUrlInput(imageUrl);
    setSalvandoUrl(true);
    try {
      const res = await fetch('/api/liquidacao/salvar-imagem-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produto_id: modalImagemItem.produto_id,
          url: imageUrl
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`Foto da Napp aplicada com sucesso para ${modalImagemItem.descricao}!`, 'success');
        setModalImagemItem(null);
        onAtualizarItens();
      } else {
        addToast('Erro ao aplicar foto da Napp.', 'error');
      }
    } catch (e) {
      addToast('Erro ao salvar foto.', 'error');
    } finally {
      setSalvandoUrl(false);
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
          addToast('Foto do computador carregada com sucesso!', 'success');
          setModalImagemItem(null);
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

  // ─── AÇÕES DO ESTÚDIO VISUAL (TEMAS, FONTES, CORES) ───

  const handleAplicarTemaPronto = (temaKey: string) => {
    const tema = TEMAS_PRONTOS[temaKey];
    if (!tema) return;
    setEstilo(prev => ({
      ...prev,
      ...tema.estilo,
      temaId: temaKey
    }));
    addToast(`Tema "${tema.nome}" aplicado à prévia!`, 'info');
  };

  const handleAplicarEstiloATodos = () => {
    try {
      localStorage.setItem('belafarma_arte_estilo', JSON.stringify(estilo));
      addToast('✨ Estilo visual salvo e padronizado para todos os produtos da campanha!', 'success');
    } catch (e) {
      addToast('Erro ao salvar estilo.', 'error');
    }
  };

  const handleRestaurarPadrao = () => {
    setEstilo(ESTILO_PADRAO);
    localStorage.removeItem('belafarma_arte_estilo');
    addToast('Estilo visual restaurado para o padrão oficial da BelaFarma!', 'info');
  };

  // ─── PREVIEW & EXPORTAÇÃO ───

  const periodoArte = { inicio: inicioFmt, termino: terminoFmt };
  const colunasEncarte: 3 | 4 = produtosPorPagina === 6 ? 3 : 4;

  useEffect(() => {
    let cancelado = false;
    prepararImagensArte(itens).then(() => {
      if (!cancelado) setImgVersion(v => v + 1);
    });
    return () => { cancelado = true; };
  }, [itens]);

  const dimUnit = DIMENSOES_UNITARIO[formatoUnitario];
  const zoomUnit = formatoUnitario === 'story' ? 0.62 : 0.8;

  const htmlArteAtual = React.useMemo(
    () => (produtoAtual ? htmlArteUnitaria(produtoAtual, formatoUnitario, periodoArte, estilo) : ''),
    [produtoAtual, formatoUnitario, inicioFmt, terminoFmt, imgVersion, estilo]
  );

  const htmlEncartePaginaAtual = React.useMemo(
    () => htmlPaginaEncarte(itensPaginaEncarte, paginaEncarteAtual, totalPaginasEncarte, periodoArte, colunasEncarte, estilo),
    [itensPaginaEncarte, paginaEncarteAtual, totalPaginasEncarte, inicioFmt, terminoFmt, colunasEncarte, imgVersion, estilo]
  );

  const slugProduto = (desc: string) => desc.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);

  const handleBaixarArteUnitario = async () => {
    if (!produtoAtual) return;
    setGerandoDownload(true);
    try {
      await prepararImagensArte([produtoAtual]);
      const canvas = await renderizarHtmlParaCanvas(
        htmlArteUnitaria(produtoAtual, formatoUnitario, periodoArte, estilo), dimUnit.w, dimUnit.h, 2
      );
      const link = document.createElement('a');
      link.download = `BelaFarma_Arte_${formatoUnitario}_${slugProduto(produtoAtual.descricao)}.png`;
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
        htmlArteUnitaria(produtoAtual, formatoUnitario, periodoArte, estilo), dimUnit.w, dimUnit.h, 2
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
    addToast(`Gerando arquivo ZIP com todas as ${itens.length} artes personalizadas...`, 'info');

    const zip = new JSZip();
    const pasta = zip.folder(`Artes_Liquidacao_BelaFarma_${formatoUnitario.toUpperCase()}`);

    try {
      await prepararImagensArte(itens);
      for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        setProgressoZip({ atual: i + 1, total: itens.length });
        const canvas = await renderizarHtmlParaCanvas(
          htmlArteUnitaria(item, formatoUnitario, periodoArte, estilo), dimUnit.w, dimUnit.h, 2
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
      addToast(`🎉 Todas as ${itens.length} artes foram exportadas no ZIP com sucesso!`, 'success');
    } catch (e) {
      console.error('Erro ao gerar ZIP:', e);
      addToast('Erro ao criar arquivo ZIP das artes.', 'error');
    } finally {
      setGerandoZip(false);
    }
  };

  const handleBaixarPaginaPng = async () => {
    setGerandoPaginasPng(true);
    try {
      await prepararImagensArte(itensPaginaEncarte);
      const canvas = await renderizarHtmlParaCanvas(
        htmlPaginaEncarte(itensPaginaEncarte, paginaEncarteAtual, totalPaginasEncarte, periodoArte, colunasEncarte, estilo),
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
          htmlPaginaEncarte(itensDaPagina, p, totalPaginasEncarte, periodoArte, colunasEncarte, estilo),
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
      {/* Input oculto para upload de arquivo local */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* ─── NAVEGAÇÃO PRINCIPAL (SUB-ABAS) & IDENTIDADE ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-2.5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
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

        {/* Botão de Destaque: Abrir / Fechar Editor Visual */}
        <div className="flex items-center gap-2 pr-2">
          <button
            type="button"
            onClick={() => setPainelEditorAberto(p => !p)}
            className={`px-4 py-2 rounded-2xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95 ${
              painelEditorAberto
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20'
                : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:opacity-95 text-white shadow-purple-500/20'
            }`}
          >
            <Palette size={15} />
            <span>{painelEditorAberto ? 'Fechar Estúdio Visual' : '🎨 Abrir Estúdio & Editor Visual'}</span>
          </button>
        </div>
      </div>

      {/* Banner de Aviso de Fotos Ausentes */}
      {itens.length - totalComFoto > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-3xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 shrink-0">
              <Camera size={20} />
            </div>
            <div>
              <p className="text-xs font-black text-amber-950 dark:text-amber-200">
                Atenção: {itens.length - totalComFoto} {itens.length - totalComFoto === 1 ? 'produto ainda está' : 'produtos ainda estão'} sem foto oficial neste encarte ({totalComFoto}/{itens.length} com foto).
              </p>
              <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                O sistema consulta Cosmos CDN, Napp e farmácias para obter a foto e recortar o fundo automaticamente.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleBuscarTodasFotosAuto}
            disabled={buscandoGeral}
            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-orange-500/20 cursor-pointer disabled:opacity-50 transition-all shrink-0 active:scale-95"
          >
            <RefreshCw size={13} className={buscandoGeral ? 'animate-spin' : ''} />
            <span>{buscandoGeral ? 'Buscando fotos na web...' : '⚡ Buscar Fotos Automaticamente'}</span>
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          PAINEL EXPANSÍVEL: ESTÚDIO VISUAL & EDITOR PROFISSIONAL
      ═══════════════════════════════════════════════════════════════ */}
      {painelEditorAberto && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-indigo-200 dark:border-indigo-900/60 p-5 shadow-xl space-y-5 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-2xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                <SlidersHorizontal size={20} />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  Estúdio Visual BelaFarma (Editor WYSIWYG)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ajuste cores, fontes, tamanhos, embalagem e selos com atualização instantânea na arte.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAplicarEstiloATodos}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm cursor-pointer transition-all active:scale-95"
                title="Aplica e salva estas configurações visuais para todos os produtos da campanha"
              >
                <Check size={14} />
                <span>Aplicar a Todos os Produtos</span>
              </button>

              <button
                type="button"
                onClick={handleRestaurarPadrao}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                title="Restaura as cores e estilo oficial de aniversário"
              >
                <RotateCcw size={13} />
                <span>Restaurar Padrão</span>
              </button>

              <button
                type="button"
                onClick={() => setPainelEditorAberto(false)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-500 cursor-pointer"
                title="Fechar editor"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Abas do Editor */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl w-fit">
            {[
              { id: 'temas', label: '🎨 Temas Prontos' },
              { id: 'cores', label: '🌈 Cores & Paleta' },
              { id: 'tipografia', label: '🔤 Fontes & Textos' },
              { id: 'embalagem', label: '📦 Embalagem & Foto' },
              { id: 'elementos', label: '🏷️ Selos & Badges' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAbaEditor(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  abaEditor === tab.id
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Conteúdo da Aba 1: Temas Prontos */}
          {abaEditor === 'temas' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
              {Object.entries(TEMAS_PRONTOS).map(([key, t]) => {
                const selecionado = estilo.temaId === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleAplicarTemaPronto(key)}
                    className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer relative ${
                      selecionado
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-slate-850'
                    }`}
                  >
                    <div>
                      <h4 className="text-xs font-black text-slate-900 dark:text-white leading-snug">
                        {t.nome}
                      </h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                        {t.descricao}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <span className="w-4 h-4 rounded-full border border-black/10" style={{ background: t.estilo.corPrimaria }} />
                      <span className="w-4 h-4 rounded-full border border-black/10" style={{ background: t.estilo.corSecundaria }} />
                      <span className="w-4 h-4 rounded-full border border-black/10" style={{ background: t.estilo.corDestaque }} />
                      <span className="w-4 h-4 rounded-full border border-black/10" style={{ background: t.estilo.corFundo }} />
                      {selecionado && (
                        <span className="ml-auto text-[10px] font-black text-indigo-600 dark:text-indigo-400">Ativo</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Conteúdo da Aba 2: Cores e Paleta Customizada */}
          {abaEditor === 'cores' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pt-1">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                <label className="text-[11px] font-black text-slate-700 dark:text-slate-300 block">Fundo da Arte</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={estilo.corFundo}
                    onChange={e => setEstilo(p => ({ ...p, corFundo: e.target.value, temaId: 'custom' }))}
                    className="w-9 h-9 rounded-xl border border-slate-300 dark:border-slate-600 cursor-pointer"
                  />
                  <span className="text-xs font-mono font-bold">{estilo.corFundo}</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                <label className="text-[11px] font-black text-slate-700 dark:text-slate-300 block">Cor Primária (Ondas)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={estilo.corPrimaria}
                    onChange={e => setEstilo(p => ({ ...p, corPrimaria: e.target.value, temaId: 'custom' }))}
                    className="w-9 h-9 rounded-xl border border-slate-300 dark:border-slate-600 cursor-pointer"
                  />
                  <span className="text-xs font-mono font-bold">{estilo.corPrimaria}</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                <label className="text-[11px] font-black text-slate-700 dark:text-slate-300 block">Cor Secundária (Badge)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={estilo.corSecundaria}
                    onChange={e => setEstilo(p => ({ ...p, corSecundaria: e.target.value, temaId: 'custom' }))}
                    className="w-9 h-9 rounded-xl border border-slate-300 dark:border-slate-600 cursor-pointer"
                  />
                  <span className="text-xs font-mono font-bold">{estilo.corSecundaria}</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                <label className="text-[11px] font-black text-slate-700 dark:text-slate-300 block">Destaque (Selos / Off)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={estilo.corDestaque}
                    onChange={e => setEstilo(p => ({ ...p, corDestaque: e.target.value, temaId: 'custom' }))}
                    className="w-9 h-9 rounded-xl border border-slate-300 dark:border-slate-600 cursor-pointer"
                  />
                  <span className="text-xs font-mono font-bold">{estilo.corDestaque}</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                <label className="text-[11px] font-black text-slate-700 dark:text-slate-300 block">Preço "POR" (Números)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={estilo.corPrecoPor}
                    onChange={e => setEstilo(p => ({ ...p, corPrecoPor: e.target.value, temaId: 'custom' }))}
                    className="w-9 h-9 rounded-xl border border-slate-300 dark:border-slate-600 cursor-pointer"
                  />
                  <span className="text-xs font-mono font-bold">{estilo.corPrecoPor}</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                <label className="text-[11px] font-black text-slate-700 dark:text-slate-300 block">Nome do Produto</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={estilo.corTexto}
                    onChange={e => setEstilo(p => ({ ...p, corTexto: e.target.value, temaId: 'custom' }))}
                    className="w-9 h-9 rounded-xl border border-slate-300 dark:border-slate-600 cursor-pointer"
                  />
                  <span className="text-xs font-mono font-bold">{estilo.corTexto}</span>
                </div>
              </div>
            </div>
          )}

          {/* Conteúdo da Aba 3: Tipografia & Textos */}
          {abaEditor === 'tipografia' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 dark:text-slate-300">Família da Fonte de Destaque</label>
                <select
                  value={estilo.fonteTitulo}
                  onChange={e => setEstilo(p => ({ ...p, fonteTitulo: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-white"
                >
                  {FONTES_DISPONIVEIS.map(f => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 dark:text-slate-300">Título Principal da Campanha</label>
                <input
                  type="text"
                  value={estilo.tituloPrincipal}
                  onChange={e => setEstilo(p => ({ ...p, tituloPrincipal: e.target.value }))}
                  placeholder="Ex: MEGA LIQUIDAÇÃO"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 dark:text-slate-300">Chamada Superior (Faixa)</label>
                <input
                  type="text"
                  value={estilo.tituloCampanhaTopo}
                  onChange={e => setEstilo(p => ({ ...p, tituloCampanhaTopo: e.target.value }))}
                  placeholder="Ex: FESTIVAL DE ANIVERSÁRIO"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-white"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-300">
                  <span>Tamanho do Preço</span>
                  <span className="text-indigo-600 font-mono">{Math.round(estilo.tamanhoPrecoMultiplicador * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="1.3"
                  step="0.05"
                  value={estilo.tamanhoPrecoMultiplicador}
                  onChange={e => setEstilo(p => ({ ...p, tamanhoPrecoMultiplicador: parseFloat(e.target.value) }))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* Conteúdo da Aba 4: Embalagem & Foto */}
          {abaEditor === 'embalagem' && (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-1 items-center">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-300">
                  <span>Zoom da Embalagem</span>
                  <span className="text-indigo-600 font-mono">{Math.round(estilo.zoomProduto * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.7"
                  max="1.3"
                  step="0.05"
                  value={estilo.zoomProduto}
                  onChange={e => setEstilo(p => ({ ...p, zoomProduto: parseFloat(e.target.value) }))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-300">
                  <span>Posição Vertical</span>
                  <span className="text-indigo-600 font-mono">{estilo.offsetYProduto}px</span>
                </div>
                <input
                  type="range"
                  min="-30"
                  max="30"
                  step="2"
                  value={estilo.offsetYProduto}
                  onChange={e => setEstilo(p => ({ ...p, offsetYProduto: parseInt(e.target.value) }))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={estilo.exibirSombraProduto}
                    onChange={e => setEstilo(p => ({ ...p, exibirSombraProduto: e.target.checked }))}
                    className="w-4 h-4 rounded text-indigo-600 accent-indigo-600"
                  />
                  <span>Sombra suave de chão</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={estilo.usarRecorteTransparente}
                    onChange={e => setEstilo(p => ({ ...p, usarRecorteTransparente: e.target.checked }))}
                    className="w-4 h-4 rounded text-indigo-600 accent-indigo-600"
                  />
                  <span>Recorte automático (fundo transparente)</span>
                </label>
              </div>

              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => produtoAtual && abrirModalImagem(produtoAtual)}
                  className="px-3 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all active:scale-95"
                >
                  <Link2 size={13} />
                  <span>Trocar Foto deste Produto</span>
                </button>
              </div>
            </div>
          )}

          {/* Conteúdo da Aba 5: Elementos e Selos */}
          {abaEditor === 'elementos' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-1">
              {[
                { key: 'exibirSeloDesconto', label: 'Selo de Desconto %' },
                { key: 'exibirLogo', label: 'Logo BelaFarma' },
                { key: 'exibirValidade', label: 'Faixa de Validade' },
                { key: 'exibirRodape', label: 'Rodapé com WhatsApp' },
                { key: 'exibirFarmaceutica', label: 'Figura da Farmacêutica' }
              ].map(item => {
                const ativo = (estilo as any)[item.key];
                return (
                  <label
                    key={item.key}
                    className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                      ativo
                        ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 opacity-60'
                    }`}
                  >
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">{item.label}</span>
                    <input
                      type="checkbox"
                      checked={ativo}
                      onChange={e => setEstilo(p => ({ ...p, [item.key]: e.target.checked }))}
                      className="w-4 h-4 rounded accent-indigo-600"
                    />
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

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

              {/* Navegação entre os produtos */}
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

              {/* Card de Detalhes do Produto Atual */}
              {produtoAtual && (
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono font-black text-slate-400">
                        #{produtoAtual.produto_id} • EAN {produtoAtual.ean || 'S/N'}
                      </span>
                      <h5 className="text-xs font-black text-slate-800 dark:text-white leading-tight">
                        {produtoAtual.descricao}
                      </h5>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 text-[10px] font-black shrink-0">
                      -{produtoAtual.desconto_percentual}%
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between pt-1">
                    <div>
                      <span className="text-[10px] text-slate-400 line-through mr-1.5">
                        De {fmt(produtoAtual.preco_normal)}
                      </span>
                      <span className="text-base font-black text-red-600 dark:text-red-400">
                        Por {fmt(produtoAtual.preco_promocional)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => abrirModalImagem(produtoAtual)}
                        className="px-2.5 py-1 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 text-[10px] font-black flex items-center gap-1 cursor-pointer transition-all"
                        title="Subir arquivo, colar link ou pesquisar no Napp"
                      >
                        <ImageIcon size={11} />
                        <span>{produtoAtual.imagem_url ? 'Trocar Foto' : 'Inserir Foto'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Botões de Ação para a Arte Atual */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleBaixarArteUnitario}
                  disabled={gerandoDownload}
                  className="py-2.5 px-3 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-black flex items-center justify-center gap-2 shadow-md shadow-orange-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Download size={14} className={gerandoDownload ? 'animate-bounce' : ''} />
                  <span>{gerandoDownload ? 'Baixando...' : 'Baixar Imagem PNG'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopiarArteUnitario}
                  disabled={copiandoImagem}
                  className="py-2.5 px-3 rounded-2xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-black flex items-center justify-center gap-2 shadow-md shadow-slate-900/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  title="Copia a imagem direto para você colar no WhatsApp (Ctrl+V)"
                >
                  {copiandoImagem ? <RefreshCw size={14} className="animate-spin" /> : <Copy size={14} />}
                  <span>Copiar Imagem</span>
                </button>
              </div>

              {/* Exportação em Lote ZIP */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleBaixarTodasArtesZip}
                  disabled={gerandoZip}
                  className="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-red-600 via-orange-600 to-amber-600 hover:opacity-95 text-white text-xs font-black flex items-center justify-center gap-2 shadow-md shadow-orange-500/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Package size={14} className={gerandoZip ? 'animate-spin' : ''} />
                  <span>
                    {gerandoZip
                      ? `Gerando ZIP (${progressoZip.atual}/${progressoZip.total})...`
                      : `⚡ Baixar Todas as ${itens.length} Artes em ZIP`}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Coluna da Direita: Preview da Arte */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center bg-slate-200/80 dark:bg-slate-950/80 rounded-3xl p-6 min-h-[600px] overflow-hidden">
            <div
              className="shadow-2xl rounded-2xl overflow-hidden bg-white select-none transition-transform"
              style={{
                width: dimUnit.w * zoomUnit,
                height: dimUnit.h * zoomUnit
              }}
            >
              <div
                style={{
                  width: dimUnit.w,
                  height: dimUnit.h,
                  transform: `scale(${zoomUnit})`,
                  transformOrigin: 'top left'
                }}
                dangerouslySetInnerHTML={{ __html: htmlArteAtual }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SUB-ABA 2: ENCARTE GERAL TABLÓIDE (A4)
      ═══════════════════════════════════════════════════════════════ */}
      {subAba === 'encarte' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-orange-500" />
                Encarte Tablóide Varejista (Formato A4 para Impressão e PDF)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Diagramação profissional com Produto Estrela em destaque e grade harmoniosa.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleBaixarPaginaPng}
                disabled={gerandoPaginasPng}
                className="px-4 py-2 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-black flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Download size={14} />
                <span>{gerandoPaginasPng ? 'Baixando...' : 'Baixar Imagem PNG da Página'}</span>
              </button>

              <button
                type="button"
                onClick={handleBaixarPdfCompleto}
                disabled={gerandoPdf}
                className="px-4 py-2 rounded-2xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-red-500/20 cursor-pointer disabled:opacity-50"
              >
                <Printer size={14} className={gerandoPdf ? 'animate-spin' : ''} />
                <span>{gerandoPdf ? 'Gerando PDF Completo...' : '📄 Baixar Encarte Completo em PDF'}</span>
              </button>
            </div>
          </div>

          {/* Paginação do Encarte */}
          <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={paginaEncarteAtual <= 1}
              onClick={() => setPaginaEncarteAtual(p => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-xs font-black text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft size={14} /> Página Anterior
            </button>

            <span className="text-xs font-mono font-black text-slate-500">
              PÁGINA {paginaEncarteAtual} DE {totalPaginasEncarte} ({itensPaginaEncarte.length} produtos nesta página)
            </span>

            <button
              type="button"
              disabled={paginaEncarteAtual >= totalPaginasEncarte}
              onClick={() => setPaginaEncarteAtual(p => Math.min(totalPaginasEncarte, p + 1))}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-xs font-black text-slate-700 dark:text-slate-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
            >
              Próxima Página <ChevronRight size={14} />
            </button>
          </div>

          {/* Preview do Encarte A4 */}
          <div className="flex justify-center overflow-x-auto p-4 bg-slate-200/80 dark:bg-slate-950/80 rounded-3xl">
            <div
              className="shrink-0 shadow-2xl bg-white select-none"
              style={{
                width: DIMENSOES_A4.w * 0.9,
                height: DIMENSOES_A4.h * 0.9
              }}
            >
              <div
                style={{
                  width: DIMENSOES_A4.w,
                  height: DIMENSOES_A4.h,
                  transform: 'scale(0.9)',
                  transformOrigin: 'top left'
                }}
                dangerouslySetInnerHTML={{ __html: htmlEncartePaginaAtual }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SUB-ABA 3: GESTOR DE FOTOS DO CATÁLOGO
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
                Fotos oficiais capturadas via Cosmos CDN, Napp Solutions ou inseridas manualmente por link ou arquivo.
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
                    onClick={() => abrirModalImagem(item)}
                    className="py-1.5 px-2 rounded-xl text-[10px] font-black bg-indigo-100 hover:bg-indigo-200 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    title="Inserir por Link URL, Napp ou Upload"
                  >
                    <Link2 size={11} />
                    <span>Inserir Foto</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleBuscarFotoAuto(item)}
                    disabled={loadingProdId === item.produto_id}
                    className="py-1.5 px-2 rounded-xl text-[10px] font-black bg-orange-100 hover:bg-orange-200 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    title="Buscar foto automaticamente na internet (Cosmos/Web)"
                  >
                    <Search size={11} className={loadingProdId === item.produto_id ? 'animate-spin' : ''} />
                    <span>{loadingProdId === item.produto_id ? 'Buscando...' : 'Buscar Web'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          MODAL DE INSERÇÃO MANUAL DE IMAGEM (URL / NAPP / UPLOAD)
      ═══════════════════════════════════════════════════════════════ */}
      {modalImagemItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg overflow-hidden space-y-4 p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-orange-500" />
                  Inserir / Alterar Imagem do Produto
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-sm mt-0.5">
                  #{modalImagemItem.produto_id} - {modalImagemItem.descricao}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalImagemItem(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Abas do Modal */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
              <button
                type="button"
                onClick={() => setAbaModalImagem('url')}
                className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  abaModalImagem === 'url'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Globe size={13} />
                <span>Colar Link (URL)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAbaModalImagem('napp');
                  if (resultadosNapp.length === 0) handleBuscarNapp();
                }}
                className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  abaModalImagem === 'napp'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Layers size={13} />
                <span>Catálogo Napp</span>
              </button>

              <button
                type="button"
                onClick={() => setAbaModalImagem('upload')}
                className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  abaModalImagem === 'upload'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Upload size={13} />
                <span>Do Computador</span>
              </button>
            </div>

            {/* ABA 1: Colar Link (URL) */}
            {abaModalImagem === 'url' && (
              <div className="space-y-3 pt-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cole o endereço de qualquer foto encontrada na internet (ex.: Google Imagens, Drogasil, Ultrafarma). O sistema fará o download e recortará o fundo automaticamente.
                </p>

                <div className="space-y-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    placeholder="https://exemplo.com/imagem-produto.jpg"
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />

                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(modalImagemItem.ean ? `${modalImagemItem.ean} ${modalImagemItem.descricao}` : `${modalImagemItem.descricao} farmacia`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      <ExternalLink size={12} />
                      <span>Pesquisar no Google Imagens</span>
                    </a>

                    <button
                      type="button"
                      disabled={!urlInput.trim() || salvandoUrl}
                      onClick={handleSalvarImagemPorUrl}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-sm disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                    >
                      {salvandoUrl ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                      <span>{salvandoUrl ? 'Baixando...' : 'Salvar Imagem'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ABA 2: Buscar no Napp Solutions */}
            {abaModalImagem === 'napp' && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={buscaNappInput}
                    onChange={e => setBuscaNappInput(e.target.value)}
                    placeholder="Buscar por nome ou EAN no Napp..."
                    className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
                  />
                  <button
                    type="button"
                    onClick={handleBuscarNapp}
                    disabled={buscandoNapp}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <Search size={13} className={buscandoNapp ? 'animate-spin' : ''} />
                    <span>{buscandoNapp ? 'Buscando...' : 'Buscar'}</span>
                  </button>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {resultadosNapp.map((prod, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-400 bg-slate-50/50 dark:bg-slate-850/50 flex items-center justify-between gap-3 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={prod.image_url}
                          alt={prod.descricao}
                          className="w-12 h-12 object-contain rounded-lg bg-white p-1 border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-800 dark:text-white truncate">
                            {prod.descricao}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            EAN: {prod.ean} • {prod.category || 'Geral'}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAplicarFotoNapp(prod.image_url)}
                        disabled={salvandoUrl}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black shrink-0 cursor-pointer"
                      >
                        Usar Esta
                      </button>
                    </div>
                  ))}

                  {resultadosNapp.length === 0 && !buscandoNapp && (
                    <div className="text-center py-6 text-slate-400 text-xs">
                      Digite o nome ou código de barras e clique em Buscar para ver as fotos do catálogo Napp.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ABA 3: Upload do Computador */}
            {abaModalImagem === 'upload' && (
              <div className="space-y-4 pt-2 text-center">
                <div
                  onClick={() => handleTriggerUpload(modalImagemItem.produto_id)}
                  className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 rounded-3xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-850/50"
                >
                  <Upload size={32} className="text-indigo-500 mb-2" />
                  <p className="text-xs font-black text-slate-800 dark:text-white">
                    Clique aqui para escolher uma imagem do seu computador ou celular
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Formatos aceitos: JPG, PNG, WEBP (o fundo claro será removido automaticamente)
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
