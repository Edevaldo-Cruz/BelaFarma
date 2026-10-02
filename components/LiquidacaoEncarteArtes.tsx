import React, { useState, useRef } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
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
  const arteUnitarioRef = useRef<HTMLDivElement>(null);
  const encartePaginaRef = useRef<HTMLDivElement>(null);
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

  // ─── AÇÕES DE ARTE UNITÁRIA ───

  const handleBaixarArteUnitario = async () => {
    if (!arteUnitarioRef.current || !produtoAtual) return;
    setGerandoDownload(true);
    try {
      const canvas = await html2canvas(arteUnitarioRef.current, {
        scale: 2.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const slug = produtoAtual.descricao.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
      link.download = `BelaFarma_1Ano_${formatoUnitario}_${slug}.png`;
      link.href = dataUrl;
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
    if (!arteUnitarioRef.current || !produtoAtual) return;
    setCopiandoImagem(true);
    try {
      const canvas = await html2canvas(arteUnitarioRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });
      canvas.toBlob(async (blob) => {
        if (blob) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
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
    const pasta = zip.folder(`Artes_1Ano_BelaFarma_${formatoUnitario.toUpperCase()}`);

    try {
      // Cria um container oculto para renderizar cada item com fidelidade
      const containerOculto = document.createElement('div');
      containerOculto.style.position = 'fixed';
      containerOculto.style.left = '-9999px';
      containerOculto.style.top = '0';
      containerOculto.style.width = formatoUnitario === 'story' ? '483px' : '674px';
      containerOculto.style.height = '674px';
      document.body.appendChild(containerOculto);

      for (let i = 0; i < itens.length; i++) {
        const item = itens[i];
        setProgressoZip({ atual: i + 1, total: itens.length });

        // Monta o HTML do card
        containerOculto.innerHTML = gerarHtmlArteUnitarioString(item, formatoUnitario);
        const cardEl = containerOculto.firstElementChild as HTMLElement;

        if (cardEl) {
          const canvas = await html2canvas(cardEl, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff'
          });
          const base64Data = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
          const slug = item.descricao.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
          const fileName = `${String(i + 1).padStart(2, '0')}_${item.produto_id}_${slug}.png`;
          pasta?.file(fileName, base64Data, { base64: true });
        }
      }

      document.body.removeChild(containerOculto);

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const downloadLink = document.createElement('a');
      downloadLink.href = URL.createObjectURL(zipBlob);
      downloadLink.download = `BelaFarma_Artes_1Aniversario_${formatoUnitario.toUpperCase()}_Completo.zip`;
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
    if (!encartePaginaRef.current) return;
    setGerandoPaginasPng(true);
    try {
      const canvas = await html2canvas(encartePaginaRef.current, {
        scale: 2.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `BelaFarma_Encarte_1Ano_Pagina_${paginaEncarteAtual}_de_${totalPaginasEncarte}.png`;
      link.href = dataUrl;
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
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const containerOculto = document.createElement('div');
      containerOculto.style.position = 'fixed';
      containerOculto.style.left = '-9999px';
      containerOculto.style.top = '0';
      containerOculto.style.width = '794px'; // ~A4 em 96dpi
      containerOculto.style.height = '1123px';
      document.body.appendChild(containerOculto);

      for (let p = 1; p <= totalPaginasEncarte; p++) {
        const itensDaPagina = itens.slice((p - 1) * produtosPorPagina, p * produtosPorPagina);
        containerOculto.innerHTML = gerarHtmlPaginaEncarteString(itensDaPagina, p, totalPaginasEncarte);
        const pageEl = containerOculto.firstElementChild as HTMLElement;

        if (pageEl) {
          const canvas = await html2canvas(pageEl, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff'
          });
          const imgData = canvas.toDataURL('image/jpeg', 0.95);
          if (p > 1) pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
        }
      }

      document.body.removeChild(containerOculto);
      pdf.save(`Encarte_Tabloide_1Ano_BelaFarma_Completo.pdf`);
      addToast('🎉 Encarte Tablóide A4 em PDF gerado com sucesso!', 'success');
    } catch (e) {
      console.error(e);
      addToast('Erro ao gerar PDF do encarte.', 'error');
    } finally {
      setGerandoPdf(false);
    }
  };

  // Helper para renderizar a string HTML de uma arte unitária para o ZIP
  const gerarHtmlArteUnitarioString = (item: ItemLiquidacaoArte, formato: 'story' | 'feed') => {
    const valNormal = item.preco_normal || item.preco_promocional;
    const valPromo = item.preco_promocional;
    const descPct = item.desconto_percentual || (valNormal > 0 ? Math.round(((valNormal - valPromo) / valNormal) * 100) : 0);
    const economiaReais = Math.max(0, valNormal - valPromo);
    const imgUrl = item.imagem_url || '/images/logo-icon.png';

    const isStory = formato === 'story';
    const w = isStory ? '483px' : '674px';
    const h = '674px';

    return `
      <div style="position: relative; width: ${w}; height: ${h}; background-color: #ffffff; background-image: url('/images/template-bela-farma.png'); background-size: cover; background-position: center; font-family: system-ui, -apple-system, sans-serif; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; padding: 20px 24px;">
        
        <!-- Topo: Selo Festivo de 1º Aniversário -->
        <div style="margin-top: 55px; display: flex; justify-content: center;">
          <div style="background: linear-gradient(135deg, #dc2626, #b91c1c); color: #fef08a; padding: 5px 16px; border-radius: 9999px; font-size: 11px; font-weight: 900; letter-spacing: 0.5px; border: 2px solid #facc15; box-shadow: 0 4px 12px rgba(220,38,38,0.3); display: inline-flex; align-items: center; gap: 6px;">
            <span>🎂</span> 1º ANIVERSÁRIO BELA FARMA SUL <span>🎉</span>
          </div>
        </div>

        <!-- Centro: Imagem e Dados do Produto -->
        <div style="display: flex; flex-direction: column; align-items: center; text-align: center; margin-top: 10px; flex: 1; justify-content: center;">
          
          <!-- Foto do Produto -->
          <div style="width: 175px; height: 175px; background: #ffffff; border-radius: 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); border: 2px solid #f1f5f9; display: flex; align-items: center; justify-content: center; padding: 12px; margin-bottom: 12px; box-sizing: border-box;">
            <img src="${imgUrl}" alt="${item.descricao}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
          </div>

          <!-- Nome do Medicamento -->
          <div style="font-size: 15px; font-weight: 900; color: #0f172a; line-height: 1.25; max-width: 380px; text-transform: uppercase;">
            ${item.descricao}
          </div>
          ${item.apresentacao ? `<div style="font-size: 12px; font-weight: 700; color: #64748b; margin-top: 2px;">${item.apresentacao}</div>` : ''}

          <!-- Box de Preço Varejo Farma -->
          <div style="margin-top: 10px; background: #fffbeb; border: 2px dashed #f59e0b; border-radius: 16px; padding: 8px 24px; display: inline-block;">
            <div style="font-size: 12px; font-weight: 800; color: #94a3b8; text-decoration: line-through;">
              DE: R$ ${valNormal.toFixed(2).replace('.', ',')}
            </div>
            <div style="display: flex; align-items: baseline; justify-content: center; gap: 4px; margin-top: -2px;">
              <span style="font-size: 14px; font-weight: 900; color: #dc2626;">POR:</span>
              <span style="font-size: 32px; font-weight: 900; color: #dc2626; letter-spacing: -1px; line-height: 1;">
                R$ ${valPromo.toFixed(2).replace('.', ',')}
              </span>
            </div>
            <div style="display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 3px;">
              <span style="background: #dc2626; color: #ffffff; font-size: 10px; font-weight: 900; padding: 2px 6px; border-radius: 4px;">
                -${descPct}% OFF
              </span>
              ${economiaReais > 0 ? `<span style="font-size: 10px; font-weight: 800; color: #b45309;">Economize R$ ${economiaReais.toFixed(2).replace('.', ',')}</span>` : ''}
            </div>
          </div>

          <!-- Vigência -->
          <div style="font-size: 10px; font-weight: 800; color: #475569; margin-top: 8px;">
            📅 Válido de <strong>${inicioFmt}</strong> até <strong>${terminoFmt}</strong>
          </div>
        </div>

        <!-- Rodapé do Encarte sobreposto à base do template -->
        <div style="margin-bottom: 35px; text-align: center;">
          <div style="font-size: 10px; font-weight: 900; color: #1e3a8a; letter-spacing: 0.2px;">
            ⚡ PEÇA PELO WHATSAPP: (32) 9822-8189 • ENTREGA RÁPIDA
          </div>
        </div>
      </div>
    `;
  };

  // Helper para renderizar a string HTML de uma página do Encarte Geral Tablóide
  const gerarHtmlPaginaEncarteString = (itensPagina: ItemLiquidacaoArte[], paginaNum: number, totalPags: number) => {
    const cardsHtml = itensPagina.map(it => {
      const vNorm = it.preco_normal || it.preco_promocional;
      const vProm = it.preco_promocional;
      const dPct = it.desconto_percentual || Math.round(((vNorm - vProm) / vNorm) * 100);
      const img = it.imagem_url || '/images/logo-icon.png';

      return `
        <div style="background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 8px; display: flex; flex-direction: column; justify-content: space-between; text-align: center; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
          <div style="height: 85px; display: flex; align-items: center; justify-content: center; margin-bottom: 4px;">
            <img src="${img}" style="max-height: 100%; max-width: 100%; object-fit: contain;" />
          </div>
          <div style="font-size: 10px; font-weight: 900; color: #0f172a; height: 26px; overflow: hidden; line-height: 1.2; text-transform: uppercase;">
            ${it.descricao}
          </div>
          <div style="background: #fefce8; border: 1px dashed #eab308; border-radius: 8px; padding: 4px; margin-top: 4px;">
            <div style="font-size: 9px; color: #94a3b8; text-decoration: line-through; font-weight: 700;">
              DE R$ ${vNorm.toFixed(2).replace('.', ',')}
            </div>
            <div style="font-size: 16px; font-weight: 900; color: #dc2626; line-height: 1; margin: 2px 0;">
              R$ ${vProm.toFixed(2).replace('.', ',')}
            </div>
            <div style="display: inline-block; background: #dc2626; color: #fff; font-size: 8px; font-weight: 900; padding: 1px 4px; border-radius: 3px;">
              -${dPct}% OFF
            </div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div style="position: relative; width: 794px; height: 1123px; background-color: #ffffff; background-image: url('/images/template-bela-farma.png'); background-size: cover; background-position: center; font-family: system-ui, -apple-system, sans-serif; box-sizing: border-box; padding: 30px 40px; display: flex; flex-direction: column; justify-content: space-between;">
        
        <!-- Header da Página -->
        <div style="margin-top: 75px; text-align: center;">
          <div style="display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #dc2626, #b91c1c); color: #fef08a; padding: 6px 20px; border-radius: 9999px; font-size: 14px; font-weight: 900; border: 2px solid #facc15; box-shadow: 0 4px 12px rgba(220,38,38,0.25);">
            <span>🎂</span> MEGA LIQUIDAÇÃO • 1º ANIVERSÁRIO BELA FARMA SUL <span>🎉</span>
          </div>
          <div style="font-size: 12px; font-weight: 800; color: #475569; margin-top: 6px;">
            Ofertas especiais válidas de <strong>${inicioFmt}</strong> até <strong>${terminoFmt}</strong> ou enquanto durar o estoque
          </div>
        </div>

        <!-- Grade de Produtos (4 colunas x 2 linhas = 8 produtos) -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 15px 0; flex: 1; align-content: center;">
          ${cardsHtml}
        </div>

        <!-- Footer da Página -->
        <div style="margin-bottom: 50px; display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-weight: 800; color: #1e3a8a; border-top: 1px solid #cbd5e1; padding-top: 6px;">
          <span>📍 Santa Luzia, Juiz de Fora - MG</span>
          <span style="font-size: 12px; font-weight: 900; color: #dc2626;">⚡ WhatsApp: (32) 9822-8189</span>
          <span>Página ${paginaNum} de ${totalPags}</span>
        </div>
      </div>
    `;
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
          SUB-ABA 1: ARTES UNITÁRIAS (STORIES 9:16 & FEED 1:1)
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
                  <span>🟦 Feed Quadrado (1:1)</span>
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

            {/* Canvas / Container da Arte Unitária com Template Oficial */}
            <div
              ref={arteUnitarioRef}
              className={`relative overflow-hidden bg-white shadow-2xl transition-all duration-300 flex flex-col justify-between select-none ${
                formatoUnitario === 'story'
                  ? 'w-[360px] h-[502px] rounded-3xl' // proporção 483 x 674 ajustada para preview
                  : 'w-[420px] h-[420px] rounded-3xl' // quadrado feed
              }`}
              style={{
                backgroundImage: "url('/images/template-bela-farma.png')",
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                boxSizing: 'border-box',
                padding: formatoUnitario === 'story' ? '20px 22px' : '16px 20px'
              }}
            >
              {/* Header: Selo de 1º Aniversário */}
              <div className={`${formatoUnitario === 'story' ? 'mt-11' : 'mt-8'} flex justify-center`}>
                <div className="bg-gradient-to-r from-red-600 to-red-700 text-yellow-200 px-3.5 py-1 rounded-full text-[10px] font-black tracking-wide border-2 border-yellow-400 shadow-md flex items-center gap-1.5 animate-pulse">
                  <span>🎂</span> 1º ANIVERSÁRIO BELA FARMA SUL <span>🎉</span>
                </div>
              </div>

              {/* Centro: Foto do Produto e Preço */}
              <div className="flex flex-col items-center text-center justify-center flex-1 my-1">
                {/* Foto do Produto */}
                <div className="w-28 h-28 bg-white/95 rounded-2xl shadow-md border border-slate-100 p-2 flex items-center justify-center mb-2">
                  <img
                    src={produtoAtual?.imagem_url || '/images/logo-icon.png'}
                    alt={produtoAtual?.descricao}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>

                {/* Nome do Produto */}
                <h4 className="font-black text-xs text-slate-900 leading-tight max-w-[280px] uppercase line-clamp-2">
                  {produtoAtual?.descricao}
                </h4>
                {produtoAtual?.apresentacao && (
                  <span className="text-[10px] font-bold text-slate-500 mt-0.5 truncate max-w-[260px]">
                    {produtoAtual.apresentacao}
                  </span>
                )}

                {/* Bloco de Preço */}
                <div className="mt-2 bg-amber-50/90 border-2 border-dashed border-amber-400 rounded-xl px-4 py-1.5 shadow-xs">
                  <div className="text-[10px] font-bold text-slate-400 line-through">
                    DE: {fmt(produtoAtual?.preco_normal || produtoAtual?.preco_promocional)}
                  </div>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-xs font-black text-red-600">POR:</span>
                    <span className="text-2xl font-black text-red-600 tracking-tight leading-none">
                      {fmt(produtoAtual?.preco_promocional)}
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 mt-0.5">
                    <span className="bg-red-600 text-white font-black text-[9px] px-1.5 py-0.2 rounded">
                      -{produtoAtual?.desconto_percentual}% OFF
                    </span>
                    {produtoAtual && (produtoAtual.preco_normal - produtoAtual.preco_promocional > 0) && (
                      <span className="text-[9px] font-extrabold text-amber-800">
                        Economize {fmt(produtoAtual.preco_normal - produtoAtual.preco_promocional)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Vigência */}
                <div className="text-[9px] font-bold text-slate-500 mt-1.5">
                  📅 Válido de <strong>{inicioFmt}</strong> até <strong>{terminoFmt}</strong>
                </div>
              </div>

              {/* Rodapé Complementar */}
              <div className={`${formatoUnitario === 'story' ? 'mb-8' : 'mb-6'} text-center`}>
                <div className="text-[9px] font-black text-blue-900 tracking-tight">
                  ⚡ WHATSAPP: (32) 9822-8189 • TELE-ENTREGA
                </div>
              </div>
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

          {/* Visualização da Página Atual do Encarte Tablóide */}
          <div className="flex justify-center overflow-x-auto p-4 bg-slate-200/80 dark:bg-slate-950/80 rounded-3xl">
            <div
              ref={encartePaginaRef}
              className="w-[794px] h-[1123px] bg-white shadow-2xl relative flex flex-col justify-between box-border p-8 select-none shrink-0"
              style={{
                backgroundImage: "url('/images/template-bela-farma.png')",
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
            >
              {/* Header da Página */}
              <div className="mt-16 text-center">
                <div className="inline-flex items-center gap-2 bg-gradient-to-r from-red-600 to-red-700 text-yellow-200 px-5 py-1.5 rounded-full text-xs font-black border-2 border-yellow-400 shadow-md">
                  <span>🎂</span> MEGA LIQUIDAÇÃO • 1º ANIVERSÁRIO BELA FARMA SUL <span>🎉</span>
                </div>
                <div className="text-[11px] font-bold text-slate-600 mt-1">
                  Ofertas especiais válidas de <strong>{inicioFmt}</strong> até <strong>{terminoFmt}</strong> ou enquanto durar o estoque
                </div>
              </div>

              {/* Grade de Produtos */}
              <div className={`grid gap-3 my-4 flex-1 align-content-center ${
                produtosPorPagina === 6 
                  ? 'grid-cols-3' 
                  : produtosPorPagina === 12 
                    ? 'grid-cols-4' 
                    : 'grid-cols-4'
              }`}>
                {itensPaginaEncarte.map((it) => {
                  const vNorm = it.preco_normal || it.preco_promocional;
                  const vProm = it.preco_promocional;
                  const dPct = it.desconto_percentual || Math.round(((vNorm - vProm) / vNorm) * 100);

                  return (
                    <div
                      key={it.id}
                      className="bg-white/95 border border-slate-200 rounded-xl p-2 flex flex-col justify-between text-center shadow-xs"
                    >
                      <div className="h-20 flex items-center justify-center mb-1">
                        <img
                          src={it.imagem_url || '/images/logo-icon.png'}
                          alt={it.descricao}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                      <div className="text-[10px] font-black text-slate-900 leading-tight h-6 overflow-hidden line-clamp-2 uppercase">
                        {it.descricao}
                      </div>
                      <div className="bg-amber-50/90 border border-dashed border-amber-400 rounded-lg p-1 mt-1">
                        <div className="text-[9px] text-slate-400 line-through font-bold">
                          DE {fmt(vNorm)}
                        </div>
                        <div className="text-base font-black text-red-600 leading-none my-0.5">
                          {fmt(vProm)}
                        </div>
                        <span className="inline-block bg-red-600 text-white text-[8px] font-black px-1 rounded">
                          -{dPct}% OFF
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Rodapé Oficial da Folha */}
              <div className="mb-11 flex items-center justify-between text-[11px] font-bold text-blue-900 border-t border-slate-300 pt-1.5">
                <span>📍 Santa Luzia, Juiz de Fora - MG</span>
                <span className="text-xs font-black text-red-600">⚡ WhatsApp: (32) 9822-8189</span>
                <span>Página {paginaEncarteAtual} de {totalPaginasEncarte}</span>
              </div>
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
