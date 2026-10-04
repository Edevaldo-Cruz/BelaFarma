import React, { useState, useEffect, useMemo, useRef } from 'react';
import { jsPDF } from 'jspdf';
import {
  Printer,
  Download,
  Sparkles,
  Check,
  RotateCcw,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Eye,
  Layers,
  Palette,
  Type,
  Tag,
  Barcode,
  Grid,
  FileText,
  Package,
  X,
  Search,
  CheckCircle2,
  Copy,
  Plus,
  Minus,
  Move,
  AlertCircle
} from 'lucide-react';
import {
  FormatoEtiquetaId,
  FormatoEtiquetaConfig,
  FORMATOS_ETIQUETAS,
  EstiloEtiqueta,
  ESTILO_ETIQUETA_PADRAO,
  MODELOS_PRONTOS_ETIQUETA,
  htmlEtiqueta,
  htmlFolhaA4Etiquetas,
  ItemEtiqueta,
  calcularGradeA4Otima,
  CalculoGradeA4
} from './etiquetasTemplates';
import {
  renderizarHtmlParaCanvas,
  prepararImagensArte,
  FONTES_DISPONIVEIS
} from './encarteTemplates';
import { ItemLiquidacaoArte } from './LiquidacaoEncarteArtes';
import { useToast } from './ToastContext';

interface LiquidacaoEtiquetasTabProps {
  itens: ItemLiquidacaoArte[];
  dataTerminoCampanha?: string;
  onAtualizarItens: () => void;
  abrirModalImagem: (item: ItemLiquidacaoArte) => void;
  painelEditorAberto: boolean;
  setPainelEditorAberto: (aberto: boolean | ((prev: boolean) => boolean)) => void;
}

export const LiquidacaoEtiquetasTab: React.FC<LiquidacaoEtiquetasTabProps> = ({
  itens,
  dataTerminoCampanha = '2026-10-31',
  onAtualizarItens,
  abrirModalImagem,
  painelEditorAberto,
  setPainelEditorAberto
}) => {
  const { addToast } = useToast();

  // ─── ESTADOS PRINCIPAIS DE ETIQUETA ───
  const [formatoId, setFormatoId] = useState<FormatoEtiquetaId>('termica_60x40');
  const [tipoLayout, setTipoLayout] = useState<'folha_a4' | 'bobina_termica'>('folha_a4');
  const [estilo, setEstilo] = useState<EstiloEtiqueta>(() => {
    try {
      const salvo = localStorage.getItem('belafarma_etiqueta_estilo');
      if (salvo) return { ...ESTILO_ETIQUETA_PADRAO, ...JSON.parse(salvo) };
    } catch (e) {}
    return ESTILO_ETIQUETA_PADRAO;
  });

  // Quantidade de cópias por produto (default 1)
  const [copias, setCopias] = useState<Record<number, number>>({});
  // Conjunto de produtos selecionados
  const [selecionados, setSelecionados] = useState<Set<number>>(() => new Set(itens.map(i => i.produto_id)));
  // Índice do produto exibido no preview unitário
  const [produtoIndex, setProdutoIndex] = useState(0);
  // Visão em tela: 'individual' ou 'folha' (quando em formato A4)
  const [modoVisualizacao, setModoVisualizacao] = useState<'individual' | 'folha'>('folha');
  // Posição inicial do primeiro slot na folha A4 (1 a totalSlots)
  const [posicaoInicialA4, setPosicaoInicialA4] = useState<number>(1);
  // Página atual do preview da folha A4
  const [paginaA4Atual, setPaginaA4Atual] = useState<number>(1);
  // Busca na lista de produtos de etiquetas
  const [filtroTexto, setFiltroTexto] = useState('');

  // Estados de exportação
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [gerandoPdfProgress, setGerandoPdfProgress] = useState('');
  const [gerandoPng, setGerandoPng] = useState(false);

  // Sub-aba do editor visual
  const [abaEditor, setAbaEditor] = useState<'modelos' | 'cores' | 'tipografia' | 'elementos' | 'textos' | 'foto'>('modelos');

  const formatoConfig: FormatoEtiquetaConfig = FORMATOS_ETIQUETAS[formatoId];
  const dataValidadeFmt = dataTerminoCampanha.split('-').reverse().join('/');

  // Sincroniza seleção quando a lista de itens muda
  useEffect(() => {
    if (itens.length > 0 && selecionados.size === 0) {
      setSelecionados(new Set(itens.map(i => i.produto_id)));
    }
  }, [itens]);

  // Lista dos produtos filtrados para exibição na gaveta de seleção
  const itensFiltrados = useMemo(() => {
    if (!filtroTexto.trim()) return itens;
    const txt = filtroTexto.toLowerCase();
    return itens.filter(it => 
      it.descricao.toLowerCase().includes(txt) ||
      String(it.produto_id).includes(txt) ||
      (it.ean && it.ean.includes(txt))
    );
  }, [itens, filtroTexto]);

  // Itens selecionados com suas quantidades de cópias
  const itensEtiquetasSelecionados = useMemo(() => {
    return itens.filter(it => selecionados.has(it.produto_id));
  }, [itens, selecionados]);

  // Lista expandida com todas as repetições de etiquetas conforme as cópias solicitadas
  const listaExpandida: ItemEtiqueta[] = useMemo(() => {
    const list: ItemEtiqueta[] = [];
    itensEtiquetasSelecionados.forEach(it => {
      const q = copias[it.produto_id] ?? 1;
      for (let i = 0; i < q; i++) {
        list.push({
          id: it.id,
          produto_id: it.produto_id,
          descricao: it.descricao,
          apresentacao: it.apresentacao,
          ean: it.ean,
          preco_normal: it.preco_normal,
          preco_promocional: it.preco_promocional,
          desconto_percentual: it.desconto_percentual,
          imagem_url: it.imagem_url,
          quantidadeCopias: q
        });
      }
    });
    return list;
  }, [itensEtiquetasSelecionados, copias]);

  // Cálculo Inteligente de Grade A4 (evita qualquer corte físico no papel A4)
  const gradeA4Calculada: CalculoGradeA4 = useMemo(() => {
    return calcularGradeA4Otima(formatoConfig, listaExpandida.length);
  }, [formatoConfig, listaExpandida.length]);

  const totalSlotsPorFolhaA4 = gradeA4Calculada.etiquetasPorFolha;
  const slotsCompletosA4 = useMemo(() => {
    if (tipoLayout !== 'folha_a4') return [];
    const list: (ItemEtiqueta | null)[] = [];
    for (let i = 1; i < posicaoInicialA4; i++) {
      list.push(null);
    }
    listaExpandida.forEach(it => list.push(it));
    return list;
  }, [tipoLayout, posicaoInicialA4, listaExpandida]);

  const totalFolhasA4 = Math.ceil(slotsCompletosA4.length / totalSlotsPorFolhaA4) || 1;
  const slotsPaginaAtualA4 = useMemo(() => {
    if (tipoLayout !== 'folha_a4') return [];
    const start = (paginaA4Atual - 1) * totalSlotsPorFolhaA4;
    const pageItems = slotsCompletosA4.slice(start, start + totalSlotsPorFolhaA4);
    while (pageItems.length < totalSlotsPorFolhaA4) {
      pageItems.push(null);
    }
    return pageItems;
  }, [slotsCompletosA4, paginaA4Atual, totalSlotsPorFolhaA4, tipoLayout]);

  // Produto atual em foco para o preview unitário
  const produtoAtual: ItemEtiqueta | undefined = useMemo(() => {
    const it = itensEtiquetasSelecionados[produtoIndex] || itensEtiquetasSelecionados[0] || itens[0];
    if (!it) return undefined;
    return {
      id: it.id,
      produto_id: it.produto_id,
      descricao: it.descricao,
      apresentacao: it.apresentacao,
      ean: it.ean,
      preco_normal: it.preco_normal,
      preco_promocional: it.preco_promocional,
      desconto_percentual: it.desconto_percentual,
      imagem_url: it.imagem_url,
      quantidadeCopias: copias[it.produto_id] ?? 1
    };
  }, [itensEtiquetasSelecionados, produtoIndex, itens, copias]);

  // Controles de Seleção
  const handleToggleSelecionar = (id: number) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelecionarTodos = () => {
    setSelecionados(new Set(itens.map(i => i.produto_id)));
  };

  const handleDesmarcarTodos = () => {
    setSelecionados(new Set());
  };

  const handleSetCopias = (id: number, val: number) => {
    setCopias(prev => ({
      ...prev,
      [id]: Math.max(1, Math.min(999, val))
    }));
  };

  // Controles do Editor Visual
  const handleAplicarModeloPronto = (modeloKey: string) => {
    const mod = MODELOS_PRONTOS_ETIQUETA[modeloKey];
    if (!mod) return;
    setEstilo(prev => ({
      ...prev,
      modeloId: modeloKey,
      ...mod.estilo
    }));
    addToast(`Modelo "${mod.nome}" aplicado!`, 'info');
  };

  const handleSalvarAplicarATodas = () => {
    try {
      localStorage.setItem('belafarma_etiqueta_estilo', JSON.stringify(estilo));
      addToast('✅ Estilo de etiqueta salvo como padrão oficial!', 'success');
    } catch (e) {
      addToast('Erro ao salvar estilo localmente.', 'error');
    }
  };

  const handleRestaurarPadrao = () => {
    setEstilo(ESTILO_ETIQUETA_PADRAO);
    localStorage.removeItem('belafarma_etiqueta_estilo');
    addToast('Estilo de etiquetas restaurado para o padrão original.', 'info');
  };

  // ─── MODO ARRASTAR ELEMENTOS LIVREMENTE NA ETIQUETA ───
  const [modoArrastar, setModoArrastar] = useState(false);
  const dragRef = useRef<{
    elKey: string;
    startX: number;
    startY: number;
    initX: number;
    initY: number;
  } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!modoArrastar) return;
    const target = (e.target as HTMLElement).closest('[data-drag-el]') as HTMLElement | null;
    if (!target) return;
    const elKey = target.getAttribute('data-drag-el');
    if (!elKey) return;

    e.preventDefault();
    e.stopPropagation();

    const currPos = (estilo.posicoes as any)?.[elKey] || { x: 0, y: 0 };
    dragRef.current = {
      elKey,
      startX: e.clientX,
      startY: e.clientY,
      initX: currPos.x,
      initY: currPos.y
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const { elKey, initX, initY } = dragRef.current;

    setEstilo(prev => ({
      ...prev,
      posicoes: {
        ...prev.posicoes,
        [elKey]: {
          x: Math.round(initX + dx),
          y: Math.round(initY + dy)
        }
      }
    }));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (err) {}
      dragRef.current = null;
    }
  };

  const handleResetarPosicoes = () => {
    setEstilo(prev => ({ ...prev, posicoes: undefined }));
    addToast('Posições dos elementos da etiqueta restauradas para o alinhamento padrão.', 'info');
  };

  // ─── IMPRESSÃO NATIVA (WINDOW.PRINT) ───
  const handleImprimir = () => {
    if (listaExpandida.length === 0) {
      addToast('Selecione pelo menos um produto para imprimir etiquetas.', 'warning');
      return;
    }
    window.print();
  };

  // ─── IMPRESSÃO EM NOVA ABA HTML PURA (ALINHAMENTO 100% VETORIAL) ───
  const handleAbrirHtmlImpressao = () => {
    if (listaExpandida.length === 0) {
      addToast('Selecione pelo menos um produto para gerar folha de impressão HTML.', 'warning');
      return;
    }

    const win = window.open('', '_blank');
    if (!win) {
      addToast('Por favor, permita os pop-ups no seu navegador para abrir a página HTML de impressão.', 'warning');
      return;
    }

    let conteudoHtml = '';
    if (tipoLayout === 'folha_a4') {
      for (let p = 1; p <= totalFolhasA4; p++) {
        const start = (p - 1) * totalSlotsPorFolhaA4;
        const itensFolha = slotsCompletosA4.slice(start, start + totalSlotsPorFolhaA4);
        while (itensFolha.length < totalSlotsPorFolhaA4) itensFolha.push(null);
        conteudoHtml += htmlFolhaA4Etiquetas(itensFolha, formatoConfig, estilo, p, totalFolhasA4, dataValidadeFmt);
      }
    } else {
      listaExpandida.forEach(it => {
        conteudoHtml += htmlEtiqueta(it, formatoConfig, estilo, dataValidadeFmt);
      });
    }

    win.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <title>Impressão BelaFarma - Etiquetas A4</title>
          <style>
            @page {
              size: ${formatoConfig.tipo === 'folha_a4' ? 'A4 portrait' : `${formatoConfig.wMm}mm ${formatoConfig.hMm}mm`};
              margin: 0 !important;
            }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              box-sizing: border-box;
            }
            body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              font-family: sans-serif;
            }
          </style>
        </head>
        <body>
          ${conteudoHtml}
          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); }, 250);
            };
          </script>
        </body>
      </html>
    `);
    win.document.close();
    addToast('🎉 Folha HTML gerada em nova aba! Alinhamento vetorial perfeito.', 'success');
  };

  // ─── EXPORTAÇÃO EM PDF (ASSÍNCRONA SEM TRAVAMENTOS) ───
  const handleBaixarPdf = async () => {
    if (listaExpandida.length === 0) {
      addToast('Nenhum produto selecionado para exportar.', 'warning');
      return;
    }

    setGerandoPdf(true);
    setGerandoPdfProgress('Iniciando...');
    addToast(`Gerando PDF em formato "${formatoConfig.nome}"...`, 'info');

    try {
      await prepararImagensArte(itens);

      if (tipoLayout === 'folha_a4') {
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        for (let p = 1; p <= totalFolhasA4; p++) {
          setGerandoPdfProgress(`Folha ${p} de ${totalFolhasA4} (${Math.round((p / totalFolhasA4) * 100)}%)`);
          // Respiro para manter a interface de usuário 100% responsiva
          await new Promise(res => setTimeout(res, 20));

          const start = (p - 1) * totalSlotsPorFolhaA4;
          const itensFolha = slotsCompletosA4.slice(start, start + totalSlotsPorFolhaA4);
          while (itensFolha.length < totalSlotsPorFolhaA4) itensFolha.push(null);

          const htmlFolha = htmlFolhaA4Etiquetas(
            itensFolha,
            formatoConfig,
            estilo,
            p,
            totalFolhasA4,
            dataValidadeFmt
          );

          const canvas = await renderizarHtmlParaCanvas(htmlFolha, 794, 1123, 2);
          if (p > 1) pdf.addPage('a4', 'portrait');
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
        }
        pdf.save(`Etiquetas_BelaFarma_Folhas_A4_${formatoConfig.id}.pdf`);
      } else {
        // Modo Bobina Térmica (1 por etiqueta contínua)
        const isPaisagem = formatoConfig.wMm > formatoConfig.hMm;
        const pdf = new jsPDF({
          orientation: isPaisagem ? 'landscape' : 'portrait',
          unit: 'mm',
          format: [formatoConfig.wMm, formatoConfig.hMm]
        });

        for (let i = 0; i < listaExpandida.length; i++) {
          setGerandoPdfProgress(`Etiqueta ${i + 1} de ${listaExpandida.length} (${Math.round(((i + 1) / listaExpandida.length) * 100)}%)`);
          // Respiro para a thread principal do navegador não travar
          await new Promise(res => setTimeout(res, 15));

          const it = listaExpandida[i];
          const html = htmlEtiqueta(it, formatoConfig, estilo, dataValidadeFmt);
          const canvas = await renderizarHtmlParaCanvas(html, formatoConfig.wPx, formatoConfig.hPx, 2);
          if (i > 0) {
            pdf.addPage([formatoConfig.wMm, formatoConfig.hMm], isPaisagem ? 'landscape' : 'portrait');
          }
          pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, formatoConfig.wMm, formatoConfig.hMm);
        }
        pdf.save(`Etiquetas_BelaFarma_${formatoConfig.id}_${listaExpandida.length}unidades.pdf`);
      }

      addToast('🎉 PDF de etiquetas gerado com sucesso!', 'success');
    } catch (e) {
      console.error(e);
      addToast('Erro ao compilar o arquivo PDF de etiquetas.', 'error');
    } finally {
      setGerandoPdf(false);
      setGerandoPdfProgress('');
    }
  };

  // ─── EXPORTAÇÃO EM PNG (UNITÁRIA) ───
  const handleBaixarPng = async () => {
    if (!produtoAtual) return;
    setGerandoPng(true);
    try {
      const html = htmlEtiqueta(produtoAtual, formatoConfig, estilo, dataValidadeFmt);
      const canvas = await renderizarHtmlParaCanvas(html, formatoConfig.wPx, formatoConfig.hPx, 3);
      const link = document.createElement('a');
      link.download = `Etiqueta_${produtoAtual.produto_id}_${produtoAtual.descricao.substring(0, 25).replace(/\s+/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      addToast('Etiqueta salva em imagem PNG!', 'success');
    } catch (e) {
      console.error(e);
      addToast('Erro ao exportar etiqueta em imagem.', 'error');
    } finally {
      setGerandoPng(false);
    }
  };

  // HTML da etiqueta em foco
  const htmlEtiquetaEmFoco = produtoAtual
    ? htmlEtiqueta(produtoAtual, formatoConfig, estilo, dataValidadeFmt)
    : '';

  // HTML da folha A4 em foco
  const htmlFolhaEmFoco = formatoConfig.tipo === 'folha_a4'
    ? htmlFolhaA4Etiquetas(slotsPaginaAtualA4, formatoConfig, estilo, paginaA4Atual, totalFolhasA4, dataValidadeFmt)
    : '';

  return (
    <div className="space-y-6">
      {/* ── CSS DINÂMICO PARA IMPRESSÃO NATIVA (@MEDIA PRINT) ── */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            background: white !important;
            color: black !important;
          }
          body > #root *, 
          body > div * {
            visibility: hidden !important;
          }
          #printable-etiquetas-area, 
          #printable-etiquetas-area * {
            visibility: visible !important;
          }
          #printable-etiquetas-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .pagina-impressao-a4 {
            width: 210mm !important;
            height: 297mm !important;
            page-break-after: always !important;
            break-after: page !important;
            overflow: hidden !important;
          }
          .etiqueta-impressao-termica {
            width: ${formatoConfig.wMm}mm !important;
            height: ${formatoConfig.hMm}mm !important;
            page-break-after: always !important;
            break-after: page !important;
            overflow: hidden !important;
          }
          @page {
            size: ${
              formatoConfig.tipo === 'folha_a4'
                ? 'A4 portrait'
                : formatoConfig.tipo === 'cartaz'
                ? (formatoConfig.id === 'cartaz_a5' ? 'A5 portrait' : 'A6 portrait')
                : `${formatoConfig.wMm}mm ${formatoConfig.hMm}mm`
            };
            margin: 0 !important;
          }
        }
      `}} />

      {/* ─── BARRA DE CONTROLE SUPERIOR: FORMATO & AÇÕES RÁPIDAS ─── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        {/* Seletor de Formato & Layout */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="p-2.5 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400">
              <Tag size={18} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-black text-slate-900 dark:text-white whitespace-nowrap">
                Formato & Tamanho da Etiqueta:
              </span>
              <span className="text-[10px] text-slate-500 font-bold max-w-[220px] truncate">
                {formatoConfig.descricao}
              </span>
            </div>
          </div>

          <select
            value={formatoId}
            onChange={e => setFormatoId(e.target.value as FormatoEtiquetaId)}
            className="px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-black text-slate-800 dark:text-white cursor-pointer focus:ring-2 focus:ring-orange-500 shrink-0 max-w-xs"
          >
            <optgroup label="⭐ Folhas A4 Especiais de Oferta">
              <option value="a4_oferta_2x3">🎯 Folha A4 (6 etiquetas • Oferta Seta Foto)</option>
            </optgroup>
            <optgroup label="Tamanhos de Etiquetas Térmicas / Prateleira">
              <option value="termica_60x40">Térmica 60 x 40 mm (Padrão Farmácia)</option>
              <option value="termica_100x30">Térmica 100 x 30 mm (Gôndola Alongada)</option>
              <option value="termica_100x50">Térmica 100 x 50 mm (Destaque Grande)</option>
            </optgroup>
            <optgroup label="Folhas A4 Adesivas para Laser / Jato de Tinta (Pimaco)">
              <option value="a4_pimaco_3x10">Folha Pimaco 3x10 (30 etiquetas • 70 x 29.7 mm)</option>
              <option value="a4_pimaco_2x7">Folha Pimaco 2x7 (14 etiquetas • 101.6 x 38.1 mm)</option>
            </optgroup>
            <optgroup label="Cartazes de Gôndola e Ponto de Venda">
              <option value="cartaz_a6">Mini-Cartaz Gôndola A6 (105 x 148 mm)</option>
              <option value="cartaz_a5">Cartaz Ponta de Gôndola A5 (148 x 210 mm)</option>
            </optgroup>
          </select>

          {/* Seletor de Tipo de Layout (Folha A4 vs Bobina Térmica) */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl shrink-0">
            <button
              type="button"
              onClick={() => {
                setTipoLayout('folha_a4');
                setModoVisualizacao('folha');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
                tipoLayout === 'folha_a4'
                  ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title="Organiza várias etiquetas por folha A4 conforme o tamanho escolhido"
            >
              📄 Folha A4 ({totalSlotsPorFolhaA4}/folha)
            </button>

            <button
              type="button"
              onClick={() => {
                setTipoLayout('bobina_termica');
                setModoVisualizacao('individual');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
                tipoLayout === 'bobina_termica'
                  ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title="Impressão individual para rolo / bobina contínua"
            >
              🏷️ Rolo Térmico (1/pág)
            </button>
          </div>

          {tipoLayout === 'folha_a4' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-black" title="Cálculo milimétrico para folha A4 (210x297mm) garantindo 0 cortes">
              <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
              <span>{gradeA4Calculada.resumoTexto}</span>
            </span>
          )}
        </div>

        {/* Botões de Ação: Imprimir / Baixar PDF / Salvar PNG */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setPainelEditorAberto(p => !p)}
            className={`px-3.5 py-2 rounded-2xl text-xs font-black flex items-center gap-2 cursor-pointer transition-all shadow-xs ${
              painelEditorAberto
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
            }`}
          >
            <Palette size={14} />
            <span>{painelEditorAberto ? 'Fechar Editor' : '🎨 Personalizar Estilo'}</span>
          </button>

          <button
            type="button"
            onClick={handleImprimir}
            className="px-4 py-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-emerald-500/20 cursor-pointer active:scale-95 transition-all"
            title="Abre a janela nativa de impressão diretamente no navegador"
          >
            <Printer size={15} />
            <span>Imprimir ({listaExpandida.length} etiq.)</span>
          </button>

          <button
            type="button"
            onClick={handleAbrirHtmlImpressao}
            className="px-3.5 py-2 rounded-2xl bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all border border-blue-200 dark:border-blue-900/60"
            title="Abre uma nova aba com a folha HTML vetorial pura sem PDF para impressão perfeita"
          >
            <FileText size={14} />
            <span>Abrir HTML</span>
          </button>

          <button
            type="button"
            onClick={handleBaixarPdf}
            disabled={gerandoPdf}
            className="px-4 py-2 rounded-2xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white text-xs font-black flex items-center gap-2 shadow-md shadow-red-500/20 cursor-pointer active:scale-95 disabled:opacity-50 transition-all"
          >
            <Download size={14} className={gerandoPdf ? 'animate-spin' : ''} />
            <span>{gerandoPdf ? (gerandoPdfProgress || 'Compilando PDF...') : 'Baixar PDF'}</span>
          </button>

          <button
            type="button"
            onClick={handleBaixarPng}
            disabled={gerandoPng || !produtoAtual}
            className="px-3.5 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all"
            title="Baixar imagem individual em alta resolução (PNG)"
          >
            <Eye size={13} />
            <span>PNG</span>
          </button>
        </div>
      </div>

      {/* ─── PAINEL EXPANSÍVEL: ESTÚDIO VISUAL DAS ETIQUETAS ─── */}
      {painelEditorAberto && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-orange-200 dark:border-orange-900/60 p-5 shadow-xl space-y-5 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-2xl bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400">
                <SlidersHorizontal size={20} />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  Estúdio de Personalização de Etiquetas & Cartazes
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Edite modelos prontos, paleta de cores, tipografia, fotos e elementos com atualização em tempo real.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSalvarAplicarATodas}
                className="px-3.5 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm cursor-pointer transition-all active:scale-95"
              >
                <Check size={14} />
                <span>Salvar Estilo Padrão</span>
              </button>

              <button
                type="button"
                onClick={handleRestaurarPadrao}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw size={12} />
                <span>Restaurar</span>
              </button>

              <button
                type="button"
                onClick={() => setPainelEditorAberto(false)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-500 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Abas do Editor de Etiquetas */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl w-fit">
            {[
              { id: 'modelos', label: '🌟 Modelos Prontos' },
              { id: 'cores', label: '🌈 Cores & Paleta' },
              { id: 'tipografia', label: '🔤 Fontes & Preços' },
              { id: 'elementos', label: '🏷️ Elementos & Selos' },
              { id: 'textos', label: '✍️ Textos Promocionais' },
              { id: 'foto', label: '📦 Foto & Zoom' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAbaEditor(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  abaEditor === tab.id
                    ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ABA 1: Modelos Prontos de Etiquetas */}
          {abaEditor === 'modelos' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
              {Object.entries(MODELOS_PRONTOS_ETIQUETA).map(([key, mod]) => {
                const ativo = estilo.modeloId === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleAplicarModeloPronto(key)}
                    className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      ativo
                        ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/40 ring-2 ring-orange-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-orange-300 bg-white dark:bg-slate-850'
                    }`}
                  >
                    <div>
                      <h4 className="text-xs font-black text-slate-900 dark:text-white leading-snug">
                        {mod.nome}
                      </h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                        {mod.descricao}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <span className="w-4 h-4 rounded-full border border-black/10" style={{ background: mod.estilo.corFaixa }} />
                      <span className="w-4 h-4 rounded-full border border-black/10" style={{ background: mod.estilo.corPrecoPor }} />
                      <span className="w-4 h-4 rounded-full border border-black/10" style={{ background: mod.estilo.corFundo }} />
                      {ativo && (
                        <span className="ml-auto text-[10px] font-black text-orange-600 dark:text-orange-400">Ativo</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ABA 2: Cores & Paleta */}
          {abaEditor === 'cores' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
              {[
                { key: 'corFundo', label: 'Fundo da Etiqueta' },
                { key: 'corFaixa', label: 'Faixa do Cabeçalho' },
                { key: 'corTextoFaixa', label: 'Texto do Cabeçalho' },
                { key: 'corPrecoPor', label: 'Preço Promocional' },
                { key: 'corPrecoDe', label: 'Preço Original (De)' },
                { key: 'corBadge', label: 'Selo de Desconto %' }
              ].map(c => (
                <div key={c.key} className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 space-y-1.5">
                  <label className="text-[11px] font-black text-slate-700 dark:text-slate-300 block truncate">
                    {c.label}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={(estilo as any)[c.key]}
                      onChange={e => setEstilo(p => ({ ...p, [c.key]: e.target.value }))}
                      className="w-8 h-8 rounded-xl cursor-pointer border border-slate-300 dark:border-slate-700 p-0.5 bg-transparent"
                    />
                    <input
                      type="text"
                      value={(estilo as any)[c.key]}
                      onChange={e => setEstilo(p => ({ ...p, [c.key]: e.target.value }))}
                      className="flex-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold uppercase"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ABA 3: Tipografia & Preços */}
          {abaEditor === 'tipografia' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                  Família da Fonte dos Preços & Títulos
                </label>
                <select
                  value={estilo.fonteTitulo}
                  onChange={e => setEstilo(p => ({ ...p, fonteTitulo: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
                >
                  {FONTES_DISPONIVEIS.map(f => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-300">
                  <span>Tamanho do Preço Gigante</span>
                  <span className="text-orange-600 font-mono font-black">{Math.round(estilo.tamanhoPrecoMultiplicador * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="1.5"
                  step="0.05"
                  value={estilo.tamanhoPrecoMultiplicador}
                  onChange={e => setEstilo(p => ({ ...p, tamanhoPrecoMultiplicador: parseFloat(e.target.value) }))}
                  className="w-full accent-orange-600 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-300">
                  <span>Tamanho do Título & Faixa</span>
                  <span className="text-orange-600 font-mono font-black">{Math.round(estilo.tamanhoTituloMultiplicador * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="1.4"
                  step="0.05"
                  value={estilo.tamanhoTituloMultiplicador}
                  onChange={e => setEstilo(p => ({ ...p, tamanhoTituloMultiplicador: parseFloat(e.target.value) }))}
                  className="w-full accent-orange-600 cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* ABA 4: Elementos & Selos Visuais */}
          {abaEditor === 'elementos' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              {[
                { key: 'exibirFoto', label: 'Foto do Produto (se houver)' },
                { key: 'exibirCodigoBarras', label: 'Código de Barras (EAN SVG)' },
                { key: 'exibirDePor', label: 'Preço Original Riscado (De:)' },
                { key: 'exibirSeloDesconto', label: 'Selo de Desconto %' },
                { key: 'exibirValidade', label: 'Data de Validade da Oferta' },
                { key: 'exibirLogo', label: 'Mini Logotipo BelaFarma' },
                { key: 'exibirAvisoAvista', label: 'Aviso "À vista ou no cartão"' }
              ].map(item => {
                const ativo = (estilo as any)[item.key];
                return (
                  <label
                    key={item.key}
                    className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                      ativo
                        ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/40'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 opacity-60'
                    }`}
                  >
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200">{item.label}</span>
                    <input
                      type="checkbox"
                      checked={ativo}
                      onChange={e => setEstilo(p => ({ ...p, [item.key]: e.target.checked }))}
                      className="w-4 h-4 rounded accent-orange-600"
                    />
                  </label>
                );
              })}
            </div>
          )}

          {/* ABA 5: Textos Promocionais Customizados */}
          {abaEditor === 'textos' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                  Título da Faixa Superior:
                </label>
                <input
                  type="text"
                  value={estilo.tituloPromocional}
                  onChange={e => setEstilo(p => ({ ...p, tituloPromocional: e.target.value }))}
                  placeholder="Ex: SUPER OFERTA, QUEIMA DE ESTOQUE, PREÇO BAIXO"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold uppercase"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {['SUPER OFERTA', 'QUEIMA TOTAL', 'PREÇO BAIXO', 'OFERTA DO DIA', 'FESTIVAL FARMA'].map(sug => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setEstilo(p => ({ ...p, tituloPromocional: sug }))}
                      className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                  Texto de Aviso / Rodapé:
                </label>
                <input
                  type="text"
                  value={estilo.textoAviso}
                  onChange={e => setEstilo(p => ({ ...p, textoAviso: e.target.value }))}
                  placeholder="Ex: À vista ou no cartão, Aproveite enquanto durar o estoque"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
                />
              </div>
            </div>
          )}

          {/* ABA 6: Embalagem & Zoom da Foto */}
          {abaEditor === 'foto' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-300">
                  <span>Zoom da Embalagem</span>
                  <span className="text-orange-600 font-mono font-black">{Math.round(estilo.zoomFoto * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.7"
                  max="1.4"
                  step="0.05"
                  value={estilo.zoomFoto}
                  onChange={e => setEstilo(p => ({ ...p, zoomFoto: parseFloat(e.target.value) }))}
                  className="w-full accent-orange-600 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-300">
                  <span>Ajuste Vertical da Foto</span>
                  <span className="text-orange-600 font-mono font-black">{estilo.offsetYFoto}px</span>
                </div>
                <input
                  type="range"
                  min="-25"
                  max="25"
                  step="2"
                  value={estilo.offsetYFoto}
                  onChange={e => setEstilo(p => ({ ...p, offsetYFoto: parseInt(e.target.value) }))}
                  className="w-full accent-orange-600 cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── CORPO PRINCIPAL: SELETOR DE PRODUTOS & PREVIEW EM TEMPO REAL ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUNA ESQUERDA: LISTA DE PRODUTOS DA LIQUIDAÇÃO & QUANTIDADE DE CÓPIAS */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Package size={16} className="text-orange-500" />
                  Produtos para Impressão
                </h4>
                <p className="text-xs text-slate-500">
                  {itensEtiquetasSelecionados.length} de {itens.length} produtos marcados ({listaExpandida.length} etiquetas no total)
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleSelecionarTodos}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Marcar Todos
                </button>
                <button
                  type="button"
                  onClick={handleDesmarcarTodos}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-[11px] font-bold text-slate-500 cursor-pointer"
                >
                  Desmarcar
                </button>
              </div>
            </div>

            {/* Configuração de Posição Inicial para Folhas Adesivas A4 */}
            {formatoConfig.tipo === 'folha_a4' && (
              <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-center justify-between gap-3">
                <div className="text-xs">
                  <span className="font-black text-amber-900 dark:text-amber-300 block">
                    Reaproveitar Folha A4 Usada:
                  </span>
                  <span className="text-[11px] text-amber-700 dark:text-amber-400">
                    Começar no slot (1 a {totalSlotsPorFolhaA4}):
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={totalSlotsPorFolhaA4}
                    value={posicaoInicialA4}
                    onChange={e => setPosicaoInicialA4(Math.max(1, Math.min(totalSlotsPorFolhaA4, parseInt(e.target.value) || 1)))}
                    className="w-16 px-2 py-1.5 text-center font-black rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-xs"
                  />
                  <span className="text-[10px] text-amber-800 font-bold">º slot</span>
                </div>
              </div>
            )}

            {/* Busca Rápida na Lista */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={filtroTexto}
                onChange={e => setFiltroTexto(e.target.value)}
                placeholder="Filtrar produtos por nome ou código..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
              />
            </div>

            {/* Lista com Checkbox e Quantidade de Cópias */}
            <div className="max-h-[500px] overflow-y-auto space-y-2 pr-1">
              {itensFiltrados.map((it, idx) => {
                const marcado = selecionados.has(it.produto_id);
                const qtdCopias = copias[it.produto_id] ?? 1;
                const emFoco = produtoAtual?.produto_id === it.produto_id;

                return (
                  <div
                    key={it.id}
                    className={`p-2.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      emFoco
                        ? 'border-orange-500 bg-orange-50/40 dark:bg-orange-950/30 ring-1 ring-orange-500/20'
                        : marcado
                        ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850'
                        : 'border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => handleToggleSelecionar(it.produto_id)}
                        className="w-4 h-4 rounded text-orange-600 accent-orange-600 shrink-0 cursor-pointer"
                      />

                      <div
                        onClick={() => {
                          const idxOrig = itensEtiquetasSelecionados.findIndex(x => x.produto_id === it.produto_id);
                          if (idxOrig >= 0) setProdutoIndex(idxOrig);
                        }}
                        className="min-w-0 cursor-pointer flex-1"
                        title="Clique para ver na prévia"
                      >
                        <p className="text-xs font-black text-slate-800 dark:text-white truncate">
                          {it.descricao}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold">
                          <span className="text-red-600 dark:text-red-400 font-black">
                            R$ {it.preco_promocional.toFixed(2)}
                          </span>
                          <span>•</span>
                          <span>EAN: {it.ean || 'Sem EAN'}</span>
                          {it.imagem_url && (
                            <span className="text-emerald-600 font-bold">📸 com foto</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Controle de Cópias */}
                    <div className="flex items-center gap-1 shrink-0 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => handleSetCopias(it.produto_id, qtdCopias - 1)}
                        className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 cursor-pointer"
                      >
                        <Minus size={11} />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={999}
                        value={qtdCopias}
                        onChange={e => handleSetCopias(it.produto_id, parseInt(e.target.value) || 1)}
                        className="w-10 text-center font-black text-xs bg-transparent border-0 p-0"
                      />
                      <button
                        type="button"
                        onClick={() => handleSetCopias(it.produto_id, qtdCopias + 1)}
                        className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 cursor-pointer"
                      >
                        <Plus size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA: PRÉVIA EM TEMPO REAL DA ETIQUETA / FOLHA A4 */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400">
                  <Eye size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white">
                    Prévia em Tempo Real (WYSIWYG)
                  </h4>
                  <p className="text-xs text-slate-500">
                    O que você vê aqui é exatamente como sairá na impressora e no PDF.
                  </p>
                </div>
              </div>

              {/* Alternador de Visão para Formato Folha A4 */}
              {formatoConfig.tipo === 'folha_a4' && (
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setModoVisualizacao('individual')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      modoVisualizacao === 'individual'
                        ? 'bg-white dark:bg-slate-900 text-orange-600 shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    Etiqueta Unitária
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoVisualizacao('folha')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      modoVisualizacao === 'folha'
                        ? 'bg-white dark:bg-slate-900 text-orange-600 shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    Folha A4 Completa
                  </button>
                </div>
              )}
            </div>

            {/* NAVEGAÇÃO ENTRE PRODUTOS (QUANDO VISÃO INDIVIDUAL) */}
            {modoVisualizacao === 'individual' && itensEtiquetasSelecionados.length > 0 && (
              <div className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-850 p-2.5 rounded-2xl">
                <button
                  type="button"
                  disabled={produtoIndex <= 0}
                  onClick={() => setProdutoIndex(p => Math.max(0, p - 1))}
                  className="p-1.5 rounded-xl bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-200 disabled:opacity-30 cursor-pointer shadow-xs"
                >
                  <ChevronLeft size={16} />
                </button>

                <div className="text-center min-w-0 flex-1">
                  <span className="text-xs font-black text-slate-800 dark:text-white truncate block">
                    {produtoAtual?.descricao}
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold">
                    Produto {produtoIndex + 1} de {itensEtiquetasSelecionados.length} selecionados
                  </span>
                </div>

                <button
                  type="button"
                  disabled={produtoIndex >= itensEtiquetasSelecionados.length - 1}
                  onClick={() => setProdutoIndex(p => Math.min(itensEtiquetasSelecionados.length - 1, p + 1))}
                  className="p-1.5 rounded-xl bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-200 disabled:opacity-30 cursor-pointer shadow-xs"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}

            {/* NAVEGAÇÃO DE PÁGINAS A4 (QUANDO VISÃO FOLHA) */}
            {modoVisualizacao === 'folha' && formatoConfig.tipo === 'folha_a4' && (
              <div className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-850 p-2.5 rounded-2xl">
                <button
                  type="button"
                  disabled={paginaA4Atual <= 1}
                  onClick={() => setPaginaA4Atual(p => Math.max(1, p - 1))}
                  className="p-1.5 rounded-xl bg-white dark:bg-slate-800 text-slate-600 disabled:opacity-30 cursor-pointer shadow-xs"
                >
                  <ChevronLeft size={16} />
                </button>

                <div className="text-center">
                  <span className="text-xs font-black text-slate-800 dark:text-white">
                    Folha A4 {paginaA4Atual} de {totalFolhasA4}
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    {totalSlotsPorFolhaA4} etiquetas por folha ({formatoConfig.cols}x{formatoConfig.rows})
                  </span>
                </div>

                <button
                  type="button"
                  disabled={paginaA4Atual >= totalFolhasA4}
                  onClick={() => setPaginaA4Atual(p => Math.min(totalFolhasA4, p + 1))}
                  className="p-1.5 rounded-xl bg-white dark:bg-slate-800 text-slate-600 disabled:opacity-30 cursor-pointer shadow-xs"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}

            {/* Toolbar de Arrastar Elementos (Visão Individual) */}
            {modoVisualizacao === 'individual' && (
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-850 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModoArrastar(m => !m)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                    modoArrastar
                      ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-orange-500/30 ring-2 ring-orange-400'
                      : 'bg-white hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                  title="Ative para clicar e arrastar a foto, título, preço e código de barras livremente"
                >
                  <Move size={13} className={modoArrastar ? 'animate-spin' : ''} />
                  <span>{modoArrastar ? '✋ Modo Arrastar: ATIVO' : '✋ Ativar Modo Arrastar'}</span>
                </button>

                {estilo.posicoes && Object.keys(estilo.posicoes).length > 0 && (
                  <button
                    type="button"
                    onClick={handleResetarPosicoes}
                    className="px-2.5 py-1 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <RotateCcw size={11} />
                    <span>Resetar Posições</span>
                  </button>
                )}
              </div>
            )}

            <style dangerouslySetInnerHTML={{__html: `
              ${modoArrastar ? `
                [data-drag-el] {
                  cursor: grab !important;
                }
                [data-drag-el]:hover {
                  outline: 2px dashed #f97316 !important;
                  outline-offset: 3px !important;
                }
                [data-drag-el]:active {
                  cursor: grabbing !important;
                  outline: 2px solid #ea580c !important;
                }
              ` : ''}
            `}} />

            {/* CONTAINER DA PRÉVIA */}
            <div className="flex justify-center items-center overflow-x-auto p-6 bg-slate-100 dark:bg-slate-950 rounded-3xl min-h-[340px]">
              {modoVisualizacao === 'individual' ? (
                /* Prévia Individual da Etiqueta com Suporte a Drag & Drop */
                <div
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  className={`shadow-2xl rounded-sm overflow-hidden select-none bg-white transition-all ${
                    modoArrastar ? 'ring-4 ring-orange-500/40 ring-offset-4 ring-offset-slate-100 dark:ring-offset-slate-950' : 'hover:scale-[1.02]'
                  }`}
                  style={{
                    width: formatoConfig.wPx,
                    height: formatoConfig.hPx,
                    touchAction: 'none'
                  }}
                  dangerouslySetInnerHTML={{ __html: htmlEtiquetaEmFoco }}
                />
              ) : (
                /* Prévia da Folha A4 Completa com Escala */
                <div
                  className="shadow-2xl overflow-hidden select-none bg-white shrink-0"
                  style={{
                    width: 794 * 0.72,
                    height: 1123 * 0.72
                  }}
                >
                  <div
                    style={{
                      width: 794,
                      height: 1123,
                      transform: 'scale(0.72)',
                      transformOrigin: 'top left'
                    }}
                    dangerouslySetInnerHTML={{ __html: htmlFolhaEmFoco }}
                  />
                </div>
              )}
            </div>

            {/* Dica de Utilização */}
            <div className="text-center text-[11px] text-slate-400">
              💡 Dica: Para trocar a foto deste produto ou adicionar fundo transparente, use o botão no catálogo ou o Estúdio Visual.
            </div>
          </div>
        </div>
      </div>

      {/* ─── ELEMENTO OCULTO EXCLUSIVO PARA IMPRESSÃO EM TELA (@MEDIA PRINT) ─── */}
      <div id="printable-etiquetas-area" className="hidden print:block">
        {tipoLayout === 'folha_a4' ? (
          /* Renderização de todas as folhas A4 */
          Array.from({ length: totalFolhasA4 }).map((_, fIdx) => {
            const pageNum = fIdx + 1;
            const start = fIdx * totalSlotsPorFolhaA4;
            const itensDestaFolha = slotsCompletosA4.slice(start, start + totalSlotsPorFolhaA4);
            while (itensDestaFolha.length < totalSlotsPorFolhaA4) itensDestaFolha.push(null);

            return (
              <div
                key={fIdx}
                className="pagina-impressao-a4"
                dangerouslySetInnerHTML={{
                  __html: htmlFolhaA4Etiquetas(
                    itensDestaFolha,
                    formatoConfig,
                    estilo,
                    pageNum,
                    totalFolhasA4,
                    dataValidadeFmt
                  )
                }}
              />
            );
          })
        ) : (
          /* Renderização contínua de etiquetas térmicas ou cartazes */
          listaExpandida.map((it, idx) => (
            <div
              key={idx}
              className="etiqueta-impressao-termica"
              dangerouslySetInnerHTML={{
                __html: htmlEtiqueta(it, formatoConfig, estilo, dataValidadeFmt)
              }}
            />
          ))
        )}
      </div>
    </div>
  );
};
