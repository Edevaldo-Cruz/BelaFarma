import React, { useState, useEffect, useRef } from 'react';
import { 
  Printer, 
  Trash2, 
  Edit3, 
  Plus, 
  Upload, 
  FileText, 
  ChevronRight, 
  Search, 
  Check, 
  X, 
  Grid,
  FileCheck,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { User } from '../types';

interface QueuedLabel {
  id: string;
  product_name: string;
  price: number;
  original_price: number | null;
  barcode: string;
  quantity: number;
  status: 'Pendente' | 'Impresso' | 'Cancelado';
  source: string;
  phone: string | null;
  created_at: string;
}

interface StockProduct {
  code: string;
  name: string;
  sale_price: number;
  cost_price: number | null;
  stock_qty: number | null;
}

interface EtiquetasManagerProps {
  user: User;
}

// ──────────────────────────────────────────────────────────
// COMPONENTE GERADOR DE CÓDIGO DE BARRAS PURE SVG (CODE-39)
// Garante barras nítidas e 100% escaneáveis sem bibliotecas pesadas.
// ──────────────────────────────────────────────────────────
const Code39Barcode: React.FC<{ value: string }> = ({ value }) => {
  const cleanValue = value.toUpperCase().replace(/[^A-Z0-9\-\.\s\$\/\+\%]/g, '');
  if (!cleanValue) return <div className="text-[9px] text-slate-400">Sem EAN</div>;

  const alphabet: Record<string, string> = {
    '0': '101001101101', '1': '110100101011', '2': '101100101011', '3': '110110010101',
    '4': '101001101011', '5': '110100110101', '6': '101100110101', '7': '101001011011',
    '8': '110100101101', '9': '101100101101', 'A': '110101001011', 'B': '101101001011',
    'C': '110110100101', 'D': '101011001011', 'E': '110101100101', 'F': '101101100101',
    'G': '101010011011', 'H': '110101001101', 'I': '101101001101', 'J': '101011001101',
    'K': '110101010011', 'L': '101101010011', 'M': '110110101001', 'N': '101011010011',
    'O': '110101101001', 'P': '101101101001', 'Q': '101010110011', 'R': '110101011001',
    'S': '101101011001', 'T': '101011011001', 'U': '110010101011', 'V': '100110101011',
    'W': '110011010101', 'X': '100101101011', 'Y': '110010110101', 'Z': '100110110101',
    '-': '100101011011', '.': '110010101101', ' ': '100110101101', '*': '100101101101'
  };

  const codeStr = `*${cleanValue}*`;
  let fullEncoding = '';

  for (let i = 0; i < codeStr.length; i++) {
    const char = codeStr[i];
    const encoding = alphabet[char] || alphabet[' '];
    fullEncoding += encoding + '0'; // Adiciona espaço de intercaractere
  }

  const bars: JSX.Element[] = [];
  const barWidth = 1.8;
  const height = 28;

  for (let j = 0; j < fullEncoding.length; j++) {
    if (fullEncoding[j] === '1') {
      bars.push(
        <rect 
          key={j} 
          x={j * barWidth} 
          y={0} 
          width={barWidth} 
          height={height} 
          fill="black" 
        />
      );
    }
  }

  const totalWidth = fullEncoding.length * barWidth;

  return (
    <div className="flex flex-col items-center justify-center">
      <svg width={totalWidth} height={height} className="max-w-full">
        {bars}
      </svg>
      <span className="text-[8px] font-black text-slate-900 tracking-[0.25em] mt-0.5">{cleanValue}</span>
    </div>
  );
};

export const EtiquetasManager: React.FC<EtiquetasManagerProps> = ({ user }) => {
  // ── ESTADO GERAL ──────────────────────────────────────────
  const [queue, setQueue] = useState<QueuedLabel[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);

  // ── CONFIGURAÇÕES DA GRADE A4 ─────────────────────────────
  const [gridCols, setGridCols] = useState(3);
  const [gridRows, setGridRows] = useState(10);
  const [marginTop, setMarginTop] = useState(10);
  const [marginBottom, setMarginBottom] = useState(10);
  const [marginLeft, setMarginLeft] = useState(10);
  const [marginRight, setMarginRight] = useState(10);
  const [colGap, setColGap] = useState(2);
  const [rowGap, setRowGap] = useState(0);

  // Posição inicial de impressão (1-indexed)
  const [startPos, setStartPos] = useState(1);

  // ── CRIAÇÃO MANUAL & AUTOCOMPLETE ─────────────────────────
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [manualOriginalPrice, setManualOriginalPrice] = useState('');
  const [manualBarcode, setManualBarcode] = useState('');
  const [manualQty, setManualQty] = useState(1);
  const [showManualForm, setShowManualForm] = useState(false);

  const [stockQuery, setStockQuery] = useState('');
  const [stockSuggestions, setStockSuggestions] = useState<StockProduct[]>([]);
  const [searchingStock, setSearchingStock] = useState(false);

  // ── EDICÃO DE ETIQUETA ────────────────────────────────────
  const [editingLabel, setEditingLabel] = useState<QueuedLabel | null>(null);

  // ── UPLOAD DE ESTOQUE PDF ─────────────────────────────────
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusMsg, setUploadStatusMsg] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── CARREGAR FILA DE ETIQUETAS ───────────────────────────
  const fetchQueue = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/labels/queue');
      const data = await res.json();
      if (Array.isArray(data)) {
        setQueue(data);
      }
    } catch (err) {
      showToast('error', 'Falha ao carregar fila de etiquetas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  // ── BUSCA AUTOCOMPLETE DO ESTOQUE ─────────────────────────
  useEffect(() => {
    if (stockQuery.trim().length < 2) {
      setStockSuggestions([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setSearchingStock(true);
      try {
        const res = await fetch(`/api/labels/stock?q=${encodeURIComponent(stockQuery)}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setStockSuggestions(data);
        }
      } catch (err) {
        console.error('Erro ao buscar estoque:', err);
      } finally {
        setSearchingStock(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [stockQuery]);

  const selectSuggestion = (prod: StockProduct) => {
    setManualName(prod.name);
    setManualBarcode(prod.code);
    setManualPrice(prod.sale_price.toString());
    setStockQuery('');
    setStockSuggestions([]);
  };

  // ── OPERAÇÕES CUD ─────────────────────────────────────────
  const handleCreateLabel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName || !manualPrice) {
      showToast('error', 'Nome do produto e preço de venda são obrigatórios.');
      return;
    }

    try {
      const res = await fetch('/api/labels/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: manualName,
          price: parseFloat(manualPrice),
          originalPrice: manualOriginalPrice ? parseFloat(manualOriginalPrice) : null,
          barcode: manualBarcode,
          quantity: manualQty
        })
      });

      if (res.ok) {
        showToast('success', 'Etiqueta criada com sucesso.');
        setManualName('');
        setManualPrice('');
        setManualOriginalPrice('');
        setManualBarcode('');
        setManualQty(1);
        setShowManualForm(false);
        fetchQueue();
      } else {
        const errData = await res.json();
        showToast('error', errData.error || 'Erro ao criar etiqueta.');
      }
    } catch (err) {
      showToast('error', 'Erro de conexão com o servidor.');
    }
  };

  const handleUpdateLabel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLabel) return;

    try {
      const res = await fetch(`/api/labels/queue/${editingLabel.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingLabel)
      });

      if (res.ok) {
        showToast('success', 'Etiqueta atualizada com sucesso.');
        setEditingLabel(null);
        fetchQueue();
      } else {
        const errData = await res.json();
        showToast('error', errData.error || 'Erro ao atualizar.');
      }
    } catch (err) {
      showToast('error', 'Erro de rede.');
    }
  };

  const handleDeleteLabel = async (id: string) => {
    if (!confirm('Deseja realmente remover esta etiqueta da fila?')) return;
    try {
      const res = await fetch(`/api/labels/queue/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('success', 'Etiqueta removida.');
        fetchQueue();
        setSelectedIds(prev => prev.filter(x => x !== id));
      }
    } catch (err) {
      showToast('error', 'Erro de rede.');
    }
  };

  // ── UPLOAD DE ARQUIVO PDF DE ESTOQUE ──────────────────────
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      showToast('error', 'Por favor, selecione apenas arquivos PDF.');
      return;
    }

    const formData = new FormData();
    formData.append('stockPdf', file);

    setIsUploading(true);
    setUploadProgress(10);
    setUploadStatusMsg('Belinha está recebendo o PDF...');

    try {
      // Simula progresso da requisição
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 5;
        });
      }, 500);

      setUploadStatusMsg('Belinha está lendo e estruturando as páginas do estoque (isso pode demorar 15-30s)...');

      const res = await fetch('/api/labels/upload-stock-pdf', {
        method: 'POST',
        body: formData
      });

      clearInterval(progressInterval);

      const result = await res.json();

      if (res.ok) {
        setUploadProgress(100);
        setUploadStatusMsg('Concluído!');
        showToast('success', result.message || 'Catálogo de estoque atualizado com sucesso!');
        // Limpa o progresso de sucesso após 8 segundos
        setTimeout(() => {
          setUploadProgress(0);
          setUploadStatusMsg('');
        }, 8000);
      } else {
        throw new Error(result.error || 'Falha ao processar o PDF.');
      }
    } catch (err: any) {
      showToast('error', err.message);
      setUploadStatusMsg(`Erro: ${err.message}`);
      setUploadProgress(0);
      // Erro NÃO possui setTimeout para limpar de forma automática, garantindo visibilidade
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── SELEÇÃO DE ETIQUETAS EM LOTE ──────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllPendentes = () => {
    const pendenteIds = queue.filter(x => x.status === 'Pendente').map(x => x.id);
    setSelectedIds(pendenteIds);
  };

  const clearSelection = () => setSelectedIds([]);

  // ── IMPRESSÃO A4 (DIAGRAMAÇÃO E POSICIONAMENTO) ───────────
  const totalSlotsPerPage = gridCols * gridRows;
  
  // Lista expandida com a quantidade de cópias de cada etiqueta selecionada
  const selectedLabelsExpanded: QueuedLabel[] = [];
  queue.forEach(item => {
    if (selectedIds.includes(item.id)) {
      for (let c = 0; c < item.quantity; c++) {
        selectedLabelsExpanded.push(item);
      }
    }
  });

  // Calcula total de slots ocupados (vazios iniciais + etiquetas expandidas)
  const totalSlotsOcupados = (startPos - 1) + selectedLabelsExpanded.length;
  const totalPages = Math.ceil(totalSlotsOcupados / totalSlotsPerPage) || 1;

  // Monta a lista completa de slots de impressão para todas as páginas necessárias
  const allPrintSlots: (QueuedLabel | null)[] = [];
  
  // 1. Preenche os slots vazios que o usuário pulou (posição inicial)
  for (let empty = 0; empty < startPos - 1; empty++) {
    allPrintSlots.push(null);
  }

  // 2. Preenche com as etiquetas reais
  selectedLabelsExpanded.forEach(item => {
    allPrintSlots.push(item);
  });

  // 3. Preenche o restante da última folha com slots nulos para manter o grid simétrico
  const remainder = allPrintSlots.length % totalSlotsPerPage;
  if (remainder > 0) {
    const fillNeeded = totalSlotsPerPage - remainder;
    for (let f = 0; f < fillNeeded; f++) {
      allPrintSlots.push(null);
    }
  }

  // Divide os slots em folhas individuais
  const pages: (QueuedLabel | null)[][] = [];
  for (let p = 0; p < totalPages; p++) {
    pages.push(allPrintSlots.slice(p * totalSlotsPerPage, (p + 1) * totalSlotsPerPage));
  }

  const handlePrint = async () => {
    if (selectedIds.length === 0) {
      showToast('info', 'Por favor, selecione pelo menos uma etiqueta na fila.');
      return;
    }

    // Aciona a impressão nativa do navegador
    window.print();

    // Pergunta se as etiquetas saíram corretas na impressora
    if (confirm('A impressão das etiquetas foi realizada com sucesso? \n(Ao clicar em OK, estas etiquetas serão arquivadas da fila).')) {
      try {
        const res = await fetch('/api/labels/print-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selectedIds })
        });
        if (res.ok) {
          showToast('success', 'Fila de impressão atualizada.');
          setSelectedIds([]);
          fetchQueue();
        }
      } catch (err) {
        showToast('error', 'Erro ao sincronizar status no servidor.');
      }
    }
  };

  return (
    <div className="flex flex-col flex-1 p-6 md:p-8 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-screen">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          /* Habilita cores de fundo na impressão */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            background: white !important;
            color: black !important;
          }
          /* Esconde todo o resto do painel, sidebar, etc. */
          body > #root *, 
          body > div * {
            visibility: hidden;
          }
          /* Mostra apenas a área imprimível das etiquetas */
          #printable-area, #printable-area * {
            visibility: visible !important;
          }
          #printable-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            background: white !important;
          }
          /* Remove margens e textos padrão do cabeçalho/rodapé do navegador */
          @page {
            size: A4 portrait;
            margin: 0 !important;
          }
        }
      `}} />
      
      {/* ── TOAST NOTIFICATIONS ─────────────────────────────── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border transition-all duration-300 animate-slide-up ${
          toast.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/50' 
            : toast.type === 'error'
            ? 'bg-rose-50 dark:bg-rose-950/90 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-900/50'
            : 'bg-blue-50 dark:bg-blue-950/90 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-900/50'
        }`}>
          <AlertCircle size={20} className="shrink-0" />
          <span className="text-sm font-bold">{toast.message}</span>
        </div>
      )}

      {/* ── TELA DE IMPRESSÃO A4 (SÓ FICA VISÍVEL NO CTRL+P) ── */}
      <div id="printable-area" className="hidden print:block bg-white text-black">
        {pages.map((pageSlots, pageIdx) => (
          <div 
            key={pageIdx} 
            className="print-page bg-white"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
              gridTemplateRows: `repeat(${gridRows}, 1fr)`,
              columnGap: `${colGap}mm`,
              rowGap: `${rowGap}mm`,
              paddingTop: `${marginTop}mm`,
              paddingBottom: `${marginBottom}mm`,
              paddingLeft: `${marginLeft}mm`,
              paddingRight: `${marginRight}mm`,
              width: '210mm',
              height: '297mm',
              boxSizing: 'border-box',
              pageBreakAfter: 'always',
              overflow: 'hidden'
            }}
          >
            {pageSlots.map((label, slotIdx) => {
              if (!label) {
                return <div key={slotIdx} className="w-full h-full border border-transparent bg-transparent" />;
              }

              return (
                <div 
                  key={slotIdx} 
                  className="w-full h-full border border-dashed border-slate-200 p-2 flex flex-col justify-between items-center text-center bg-white overflow-hidden"
                  style={{ boxSizing: 'border-box' }}
                >
                  {/* Cabeçalho */}
                  <div className="text-[7px] font-black text-slate-500 uppercase tracking-wider leading-none">
                    Drogaria Bela Farma
                  </div>
                  
                  {/* Nome do Produto */}
                  <div className="text-[10px] font-black text-slate-900 uppercase leading-snug line-clamp-2 px-1">
                    {label.product_name}
                  </div>
                  
                  {/* Preço de Venda */}
                  <div className="flex flex-col leading-none items-center">
                    {label.original_price && (
                      <span className="text-[8px] text-slate-400 line-through font-bold">
                        De: R$ {label.original_price.toFixed(2)}
                      </span>
                    )}
                    <span className="text-lg font-black text-red-600 dark:text-red-700 tracking-tighter">
                      R$ {label.price.toFixed(2)}
                    </span>
                  </div>

                  {/* Código de Barras */}
                  {label.barcode ? (
                    <Code39Barcode value={label.barcode} />
                  ) : (
                    <div className="text-[7px] font-bold text-slate-400 italic">Sem código de barras</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── AREA PRINCIPAL (ESCONDIDA NO CTRL+P) ─────────────── */}
      <div className="print:hidden flex flex-col gap-6">
        
        {/* Cabeçalho de Página */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-600 rounded-2xl shadow-lg shadow-red-500/20 text-white">
              <Printer size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">Estação de Etiquetas</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                Crie, diagramação A4 personalizável e evite desperdícios
              </p>
            </div>
          </div>

          {/* Importação Inteligente de Estoque */}
          <div className="flex items-center gap-3">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handlePdfUpload} 
              accept=".pdf" 
              className="hidden" 
            />
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${
                isUploading 
                  ? 'bg-amber-600 text-white animate-pulse cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-[1.02] shadow-lg shadow-blue-500/25 active:scale-[0.98]'
              }`}
            >
              {isUploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload size={16} />}
              Importar PDF Estoque
            </button>
          </div>
        </div>

        {/* Notificação de Upload de Estoque */}
        {uploadStatusMsg && (
          <div className={`p-4 border rounded-2xl flex flex-col gap-3 transition-all ${
            uploadStatusMsg.startsWith('Erro:')
              ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40'
              : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/50'
          }`}>
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-2 ${
                uploadStatusMsg.startsWith('Erro:')
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-blue-700 dark:text-blue-400'
              }`}>
                {uploadStatusMsg.startsWith('Erro:') ? (
                  <AlertCircle size={20} className="stroke-[2.5]" />
                ) : (
                  <FileText size={20} className="animate-bounce" />
                )}
                <span className="text-sm font-black uppercase tracking-wider">{uploadStatusMsg}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-black ${
                  uploadStatusMsg.startsWith('Erro:') ? 'text-red-500' : 'text-blue-500'
                }`}>{uploadProgress}%</span>
                {(uploadStatusMsg.startsWith('Erro:') || uploadStatusMsg === 'Concluído!') && (
                  <button 
                    onClick={() => {
                      setUploadProgress(0);
                      setUploadStatusMsg('');
                    }}
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-all text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
            {!uploadStatusMsg.startsWith('Erro:') && (
              <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-blue-600 h-full transition-all duration-300" 
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* 🛠️ CONFIGURADOR DE GRADES E GRADE INTERATIVA */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Coluna da Esquerda: Configuração e Grade A4 */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {/* Bloco 1: Dimensões da Grade */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 p-6 rounded-3xl shadow-xl flex flex-col gap-4">
              <div className="flex items-center gap-2 text-slate-800 dark:text-white border-b border-slate-50 dark:border-slate-800 pb-3">
                <Grid className="w-5 h-5 text-red-600" />
                <h2 className="text-md font-black uppercase tracking-wider">Ajuste da Grade A4</h2>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Colunas</label>
                  <input 
                    type="number" 
                    value={gridCols} 
                    onChange={e => setGridCols(Math.max(1, parseInt(e.target.value) || 3))}
                    className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-center text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Linhas</label>
                  <input 
                    type="number" 
                    value={gridRows} 
                    onChange={e => setGridRows(Math.max(1, parseInt(e.target.value) || 10))}
                    className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-center text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Margem Top (mm)</label>
                  <input 
                    type="number" 
                    value={marginTop} 
                    onChange={e => setMarginTop(Math.max(0, parseInt(e.target.value) || 0))}
                    className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-center text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Margem Bottom (mm)</label>
                  <input 
                    type="number" 
                    value={marginBottom} 
                    onChange={e => setMarginBottom(Math.max(0, parseInt(e.target.value) || 0))}
                    className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-center text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Margem Esq. (mm)</label>
                  <input 
                    type="number" 
                    value={marginLeft} 
                    onChange={e => setMarginLeft(Math.max(0, parseInt(e.target.value) || 0))}
                    className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-center text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Margem Dir. (mm)</label>
                  <input 
                    type="number" 
                    value={marginRight} 
                    onChange={e => setMarginRight(Math.max(0, parseInt(e.target.value) || 0))}
                    className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-center text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Espaço Vert (Gap mm)</label>
                  <input 
                    type="number" 
                    value={rowGap} 
                    onChange={e => setRowGap(Math.max(0, parseInt(e.target.value) || 0))}
                    className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-center text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Espaço Horiz (Gap mm)</label>
                  <input 
                    type="number" 
                    value={colGap} 
                    onChange={e => setColGap(Math.max(0, parseInt(e.target.value) || 0))}
                    className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-center text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Bloco 2: Seletor Interativo de Posição Inicial */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 p-6 rounded-3xl shadow-xl flex flex-col gap-4">
              <div className="flex flex-col border-b border-slate-50 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2 text-slate-800 dark:text-white">
                  <FileCheck className="w-5 h-5 text-emerald-600" />
                  <h2 className="text-md font-black uppercase tracking-wider">Posição Inicial</h2>
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  Selecione onde começará a imprimir na folha
                </span>
              </div>

              <div 
                className="grid gap-1 bg-slate-100 dark:bg-slate-950 p-2 rounded-2xl max-w-full"
                style={{
                  gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                }}
              >
                {Array.from({ length: totalSlotsPerPage }).map((_, idx) => {
                  const position = idx + 1;
                  const isStart = startPos === position;
                  const isSkipped = position < startPos;

                  return (
                    <button
                      key={idx}
                      onClick={() => setStartPos(position)}
                      className={`aspect-square text-[10px] font-black rounded-lg transition-all border flex items-center justify-center ${
                        isStart 
                          ? 'bg-emerald-600 text-white border-emerald-500 scale-[1.08] shadow-md shadow-emerald-500/20' 
                          : isSkipped
                          ? 'bg-slate-200 dark:bg-slate-850 text-slate-400 dark:text-slate-600 border-slate-300 dark:border-slate-800 opacity-40 line-through'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-350'
                      }`}
                    >
                      {position}
                    </button>
                  );
                })}
              </div>
              
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider text-center mt-2">
                Começando na posição <span className="text-slate-800 dark:text-white font-black">{startPos}</span>
              </div>
            </div>
          </div>

          {/* Coluna da Direita: Lista de Etiquetas na Fila */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* Ações de Fila & Lote */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 p-6 rounded-3xl shadow-xl">
              <div className="flex flex-wrap items-center gap-3">
                <button 
                  onClick={selectAllPendentes}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-xs font-black uppercase tracking-wider rounded-xl transition-all"
                >
                  Selecionar Pendentes
                </button>
                {selectedIds.length > 0 && (
                  <button 
                    onClick={clearSelection}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-xs font-black uppercase tracking-wider rounded-xl transition-all"
                  >
                    Limpar Seleção ({selectedIds.length})
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  onClick={() => setShowManualForm(!showManualForm)}
                  className="flex items-center gap-1.5 px-5 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-black uppercase tracking-wider rounded-2xl transition-all"
                >
                  <Plus size={16} />
                  Criar Manual
                </button>
                
                <button
                  onClick={handlePrint}
                  disabled={selectedIds.length === 0}
                  className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${
                    selectedIds.length > 0
                      ? 'bg-red-600 hover:bg-red-700 text-white scale-[1.02] shadow-lg shadow-red-500/25 active:scale-[0.98]'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Printer size={16} />
                  Imprimir Selecionadas ({selectedIds.length})
                </button>
              </div>
            </div>

            {/* FORMULÁRIO MANUAL */}
            {showManualForm && (
              <form onSubmit={handleCreateLabel} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 p-6 rounded-3xl shadow-xl flex flex-col gap-4 transition-all">
                <div className="flex items-center justify-between border-b border-slate-50 dark:border-slate-800 pb-2">
                  <h3 className="text-sm font-black uppercase text-slate-800 dark:text-white">Criar Etiqueta Manual</h3>
                  <button type="button" onClick={() => setShowManualForm(false)} className="text-slate-400 hover:text-slate-600">
                    <X size={18} />
                  </button>
                </div>

                <div className="relative">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Busca Rápida no Estoque (PDF)</label>
                  <div className="flex items-center gap-2 mt-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl">
                    <Search size={16} className="text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Pesquisar por nome ou código..."
                      value={stockQuery}
                      onChange={e => setStockQuery(e.target.value)}
                      className="bg-transparent border-none outline-none text-sm w-full font-bold focus:ring-0"
                    />
                    {searchingStock && <RefreshCw size={14} className="animate-spin text-slate-400" />}
                  </div>

                  {/* Sugestões do catálogo de estoque */}
                  {stockSuggestions.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-h-60 overflow-y-auto custom-scrollbar">
                      {stockSuggestions.map((prod, pidx) => (
                        <button
                          key={pidx}
                          type="button"
                          onClick={() => selectSuggestion(prod)}
                          className="flex items-center justify-between w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-50 dark:border-slate-800 last:border-b-0 text-sm font-bold"
                        >
                          <div className="flex flex-col">
                            <span className="text-slate-900 dark:text-white font-black">{prod.name}</span>
                            <span className="text-xs text-slate-400">EAN: {prod.code}</span>
                          </div>
                          <span className="text-red-600 dark:text-red-500 font-black">R$ {prod.sale_price.toFixed(2)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Descrição do Produto</label>
                    <input 
                      type="text" 
                      value={manualName} 
                      onChange={e => setManualName(e.target.value)}
                      className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Código de Barras (EAN-13)</label>
                    <input 
                      type="text" 
                      value={manualBarcode} 
                      onChange={e => setManualBarcode(e.target.value)}
                      className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Preço de Venda</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={manualPrice} 
                      onChange={e => setManualPrice(e.target.value)}
                      className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Preço De (Riscado)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={manualOriginalPrice} 
                      onChange={e => setManualOriginalPrice(e.target.value)}
                      className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Quantidade de Cópias</label>
                    <input 
                      type="number" 
                      value={manualQty} 
                      onChange={e => setManualQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none"
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full mt-2 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
                >
                  Salvar na Fila
                </button>
              </form>
            )}

            {/* FORMULÁRIO DE EDIÇÃO MODAL/DRAWER */}
            {editingLabel && (
              <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <form 
                  onSubmit={handleUpdateLabel} 
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl shadow-2xl w-full max-w-lg flex flex-col gap-4 animate-scale-up"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                    <h3 className="text-md font-black uppercase text-slate-800 dark:text-white">Editar Etiqueta</h3>
                    <button type="button" onClick={() => setEditingLabel(null)} className="text-slate-400 hover:text-slate-650">
                      <X size={20} />
                    </button>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Descrição do Produto</label>
                    <input 
                      type="text" 
                      value={editingLabel.product_name} 
                      onChange={e => setEditingLabel({ ...editingLabel, product_name: e.target.value })}
                      className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Preço de Venda</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={editingLabel.price} 
                        onChange={e => setEditingLabel({ ...editingLabel, price: parseFloat(e.target.value) || 0 })}
                        className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none"
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Preço De (Riscado)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={editingLabel.original_price || ''} 
                        onChange={e => setEditingLabel({ ...editingLabel, original_price: e.target.value ? parseFloat(e.target.value) : null })}
                        className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Código de Barras (EAN)</label>
                      <input 
                        type="text" 
                        value={editingLabel.barcode} 
                        onChange={e => setEditingLabel({ ...editingLabel, barcode: e.target.value })}
                        className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Quantidade de Cópias</label>
                      <input 
                        type="number" 
                        value={editingLabel.quantity} 
                        onChange={e => setEditingLabel({ ...editingLabel, quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-red-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-4">
                    <button 
                      type="button" 
                      onClick={() => setEditingLabel(null)}
                      className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-350 rounded-2xl text-xs font-black uppercase tracking-wider transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-red-500/20"
                    >
                      Salvar Alterações
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* TABELA DE ETIQUETAS FILTRADA */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 rounded-3xl shadow-xl overflow-hidden">
              <div className="p-6 border-b border-slate-50 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Grid className="w-5 h-5 text-red-600" />
                  <h3 className="text-md font-black uppercase tracking-wider text-slate-800 dark:text-white">Fila de Impressão</h3>
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase bg-slate-50 dark:bg-slate-850 px-3 py-1 rounded-full">
                  {queue.length} pendentes
                </span>
              </div>

              {loading && queue.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                  <RefreshCw className="w-8 h-8 animate-spin" />
                  <span className="text-xs font-black uppercase tracking-widest">Carregando fila...</span>
                </div>
              ) : queue.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-6">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-full text-slate-400">
                    <Printer size={48} className="stroke-[1.5]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800 dark:text-white">A fila está limpa!</h3>
                    <p className="text-sm text-slate-400 max-w-sm mt-1 mx-auto leading-relaxed">
                      Não há nenhuma etiqueta pendente. Crie manualmente acima ou tire uma foto de produto no WhatsApp da <strong>Belinha</strong>!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-50 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                        <th className="py-4 px-6 w-12 text-center">Sel.</th>
                        <th className="py-4 px-6">Produto</th>
                        <th className="py-4 px-6">Preço</th>
                        <th className="py-4 px-6">Original De</th>
                        <th className="py-4 px-6">Cód. Barras (EAN)</th>
                        <th className="py-4 px-6 text-center">Cópias</th>
                        <th className="py-4 px-6 text-center w-24">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800/40 font-bold">
                      {queue.map((item) => {
                        const isSelected = selectedIds.includes(item.id);
                        return (
                          <tr 
                            key={item.id} 
                            onClick={() => toggleSelect(item.id)}
                            className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all cursor-pointer ${
                              isSelected ? 'bg-red-50/20 dark:bg-red-950/10' : ''
                            }`}
                          >
                            <td className="py-4 px-6 text-center" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => toggleSelect(item.id)}
                                className={`w-6 h-6 rounded-lg border transition-all flex items-center justify-center ${
                                  isSelected
                                    ? 'bg-red-600 border-red-500 text-white shadow-md shadow-red-500/20'
                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-350'
                                }`}
                              >
                                {isSelected && <Check size={14} />}
                              </button>
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex flex-col">
                                <span className="text-slate-900 dark:text-white font-black text-sm">{item.product_name}</span>
                                <span className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">
                                  Origem: {item.source === 'web' ? 'Painel Web' : item.source === 'whatsapp_audio' ? 'Áudio WA' : item.source === 'whatsapp_image' ? 'Imagem WA' : 'Texto WA'}
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-6 text-red-600 dark:text-red-400 font-black">
                              R$ {item.price.toFixed(2)}
                            </td>
                            <td className="py-4 px-6 text-slate-400 line-through">
                              {item.original_price ? `R$ ${item.original_price.toFixed(2)}` : '-'}
                            </td>
                            <td className="py-4 px-6 text-slate-500 font-mono text-xs">
                              {item.barcode || <span className="text-slate-300 dark:text-slate-750">Não cadastrado</span>}
                            </td>
                            <td className="py-4 px-6 text-center font-black">
                              {item.quantity}
                            </td>
                            <td className="py-4 px-6 text-center" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => setEditingLabel(item)}
                                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-all"
                                  title="Editar"
                                >
                                  <Edit3 size={16} />
                                </button>
                                <button
                                  onClick={() => handleDeleteLabel(item.id)}
                                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-all"
                                  title="Excluir"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>

        </div>

      </div>

    </div>
  );
};
