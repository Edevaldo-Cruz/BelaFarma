import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  TableProperties,
  Upload,
  ClipboardPaste,
  Copy,
  Download,
  Save,
  History,
  ShoppingCart,
  Trash2,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Package,
  DollarSign,
  TrendingUp,
  X,
  Eye,
  EyeOff,
  RefreshCw,
  Send,
  SlidersHorizontal,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { useToast } from './ToastContext';
import { ReplenishmentItem, User } from '../types';

interface AnaliseReposicaoProps {
  user?: User;
  onNavigate?: (view: any) => void;
}

interface SavedAnalysisSummary {
  id: string;
  title: string;
  total_items: number;
  total_pedir: number;
  total_valor: number;
  created_at: string;
  created_by?: string;
}

export function AnaliseReposicao({ user, onNavigate }: AnaliseReposicaoProps) {
  const { addToast } = useToast();

  // Dados da tabela atual
  const [items, setItems] = useState<ReplenishmentItem[]>(() => {
    try {
      const saved = localStorage.getItem('belafarma_reposicao_items');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [analysisTitle, setAnalysisTitle] = useState<string>(() => {
    return localStorage.getItem('belafarma_reposicao_title') || 'Minha Reposição';
  });

  // Modais
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteRawText, setPasteRawText] = useState('');
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyList, setHistoryList] = useState<SavedAnalysisSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveTitleInput, setSaveTitleInput] = useState('');
  const [isSendingToCompras, setIsSendingToCompras] = useState(false);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCurva, setFilterCurva] = useState<string>('ALL');
  const [filterCategoria, setFilterCategoria] = useState<string>('ALL');
  const [filterFabricante, setFilterFabricante] = useState<string>('ALL');
  const [filterSituacao, setFilterSituacao] = useState<'ALL' | 'COM_PEDIDO' | 'SEM_PEDIDO'>('ALL');
  const [filterSaldo, setFilterSaldo] = useState<'ALL' | 'RUPTURA' | 'POSITIVO'>('ALL');
  
  // Preferência do usuário: omitir informações não essenciais para a compra por padrão
  const [showSecondaryColumns, setShowSecondaryColumns] = useState(false);

  // Ordenação
  const [sortField, setSortField] = useState<keyof ReplenishmentItem>('valorTotalEstimado');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Input de arquivo invisível
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Salvar no localStorage sempre que os itens mudarem
  useEffect(() => {
    try {
      localStorage.setItem('belafarma_reposicao_items', JSON.stringify(items));
      localStorage.setItem('belafarma_reposicao_title', analysisTitle);
    } catch (e) {
      console.warn('Falha ao salvar no localStorage (limite excedido?):', e);
    }
  }, [items, analysisTitle]);

  // Função para parse de números do padrão brasileiro (vírgula como decimal)
  const parseBrazilianNumber = (val: any): number => {
    if (val === undefined || val === null) return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    let str = String(val).trim();
    if (!str || str === '-' || str === '.') return 0;
    // Remove pontos de milhar e troca vírgula por ponto
    str = str.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Normalização de Código de Barras (EAN em notação científica)
  const formatBarcode = (val: any): string => {
    if (!val) return '';
    let str = String(val).trim();
    if (str.includes('E+') || str.includes('e+')) {
      const num = Number(str.replace(',', '.'));
      if (!isNaN(num)) {
        return num.toLocaleString('fullwide', { useGrouping: false });
      }
    }
    return str;
  };

  // Processamento de dados brutos (linhas tabuladas ou CSV)
  const parseRawTabularData = (rawText: string) => {
    const lines = rawText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) {
      addToast('Nenhum dado encontrado para processar.', 'warning');
      return;
    }

    // Detectar separador (Tab ou ponto-e-vírgula ou vírgula)
    const firstLine = lines[0];
    let separator = '\t';
    if (firstLine.includes('\t')) {
      separator = '\t';
    } else if (firstLine.includes(';')) {
      separator = ';';
    } else if (firstLine.includes(',')) {
      separator = ',';
    }

    // Identificar colunas do cabeçalho
    const headerRow = lines[0].split(separator).map(h => h.trim().toLowerCase());
    
    // Verifica se a primeira linha é cabeçalho
    const hasHeader = headerRow.some(h => 
      h.includes('código') || h.includes('codigo') || h.includes('produto') || h.includes('saldo') || h.includes('pedir')
    );

    const startIndex = hasHeader ? 1 : 0;

    // Mapeamento de índices
    let colCodigo = headerRow.findIndex(h => h.includes('código') || h.includes('codigo') || h === 'cod');
    let colProduto = headerRow.findIndex(h => h.includes('produto') || h.includes('descrição') || h.includes('nome'));
    let colApresentacao = headerRow.findIndex(h => h.includes('apresentação') || h.includes('apresentacao'));
    let colSaldo = headerRow.findIndex(h => h.includes('saldo') && !h.includes('equiv'));
    let colEstMin = headerRow.findIndex(h => h.includes('mín') || h.includes('min') || h.includes('est.'));
    let colSaldoEquiv = headerRow.findIndex(h => h.includes('equiv'));
    let colTotalVenda = headerRow.findIndex(h => h.includes('total venda') || h.includes('venda'));
    let colMedia = headerRow.findIndex(h => h.includes('média') || h.includes('media'));
    let colCiclo = headerRow.findIndex(h => h.includes('ciclo'));
    let colCurvaAbc = headerRow.findIndex(h => h.includes('curva') || h.includes('abc'));
    let colLucro = headerRow.findIndex(h => h.includes('lucro'));
    let colPedir = headerRow.findIndex(h => h.includes('pedir') || h.includes('sugestão') || h.includes('sugestao'));
    let colUltimaCompra = headerRow.findIndex(h => h.includes('última compra') || h.includes('ultima compra'));
    let colUltimoPrLiquido = headerRow.findIndex(h => h.includes('líquido') || h.includes('liquido') || h.includes('custo') || h.includes('pr.'));
    let colFabricante = headerRow.findIndex(h => h.includes('fabricante') || h.includes('laboratório') || h.includes('laboratorio'));
    let colCategoria = headerRow.findIndex(h => h.includes('categoria') || h.includes('grupo'));
    let colCodBarras = headerRow.findIndex(h => (h.includes('barras') || h.includes('ean')) && !h.includes('hosp'));
    let colCodBarrasHosp = headerRow.findIndex(h => h.includes('hosp'));
    let colUltimoFornecedor = headerRow.findIndex(h => h.includes('fornecedor'));

    // Se não tiver cabeçalho explícito, assumir a ordem padrão informada no prompt
    if (!hasHeader) {
      colCodigo = 0;
      colProduto = 1;
      colApresentacao = 2;
      colSaldo = 3;
      colEstMin = 4;
      colSaldoEquiv = 5;
      colTotalVenda = 6;
      colMedia = 7;
      colCiclo = 8;
      colCurvaAbc = 9;
      colLucro = 10;
      colPedir = 11;
      colUltimaCompra = 12;
      colUltimoPrLiquido = 13;
      colFabricante = 14;
      colCategoria = 15;
      colCodBarras = 16;
      colCodBarrasHosp = 17;
      colUltimoFornecedor = 18;
    }

    const parsedItems: ReplenishmentItem[] = [];

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const cols = line.split(separator).map(c => c.trim());

      const codigo = (colCodigo >= 0 && cols[colCodigo]) ? cols[colCodigo] : `item_${i}`;
      const produto = (colProduto >= 0 && cols[colProduto]) ? cols[colProduto] : (cols[0] || 'Produto sem nome');
      const apresentacao = (colApresentacao >= 0 && cols[colApresentacao]) ? cols[colApresentacao] : '';
      const saldo = colSaldo >= 0 ? parseBrazilianNumber(cols[colSaldo]) : 0;
      const estMin = colEstMin >= 0 ? parseBrazilianNumber(cols[colEstMin]) : 0;
      const saldoEquiv = colSaldoEquiv >= 0 ? parseBrazilianNumber(cols[colSaldoEquiv]) : 0;
      const totalVenda = colTotalVenda >= 0 ? parseBrazilianNumber(cols[colTotalVenda]) : 0;
      const media = colMedia >= 0 ? parseBrazilianNumber(cols[colMedia]) : 0;
      const ciclo = colCiclo >= 0 ? parseBrazilianNumber(cols[colCiclo]) : 0;
      const curvaAbc = (colCurvaAbc >= 0 && cols[colCurvaAbc]) ? cols[colCurvaAbc].toUpperCase().trim() : 'B';
      const lucroObtido = colLucro >= 0 ? parseBrazilianNumber(cols[colLucro]) : 0;
      const pedir = colPedir >= 0 ? parseBrazilianNumber(cols[colPedir]) : 0;
      const rawUltimaCompra = (colUltimaCompra >= 0 && cols[colUltimaCompra]) ? parseBrazilianNumber(cols[colUltimaCompra]) : 0;
      const rawUltimoPrLiquido = colUltimoPrLiquido >= 0 ? parseBrazilianNumber(cols[colUltimoPrLiquido]) : 0;
      const ultimoPrLiquido = rawUltimoPrLiquido > 0 ? rawUltimoPrLiquido : rawUltimaCompra;
      const ultimaCompra = (colUltimaCompra >= 0 && cols[colUltimaCompra]) ? cols[colUltimaCompra] : '';
      const fabricante = (colFabricante >= 0 && cols[colFabricante]) ? cols[colFabricante] : 'OUTROS';
      const categoria = (colCategoria >= 0 && cols[colCategoria]) ? cols[colCategoria] : 'OUTROS';
      const codBarras = colCodBarras >= 0 ? formatBarcode(cols[colCodBarras]) : '';
      const codBarrasHospitalar = colCodBarrasHosp >= 0 ? formatBarcode(cols[colCodBarrasHosp]) : '';
      const ultimoFornecedor = (colUltimoFornecedor >= 0 && cols[colUltimoFornecedor]) ? cols[colUltimoFornecedor] : '';

      parsedItems.push({
        id: `rep_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 4)}`,
        codigo,
        produto,
        apresentacao,
        saldo,
        estMin,
        saldoEquiv,
        totalVenda,
        media,
        ciclo,
        curvaAbc,
        lucroObtido,
        pedir,
        ultimaCompra,
        ultimoPrLiquido,
        valorTotalEstimado: Number((pedir * ultimoPrLiquido).toFixed(2)),
        fabricante,
        categoria,
        codBarras,
        codBarrasHospitalar,
        ultimoFornecedor
      });
    }

    if (parsedItems.length > 0) {
      setItems(parsedItems);
      setIsPasteModalOpen(false);
      setPasteRawText('');
      addToast(`Importado com sucesso! ${parsedItems.length} itens extraídos.`, 'success');
    } else {
      addToast('Não foi possível identificar itens válidos na tabela colada.', 'error');
    }
  };

  // Manipulador de upload de arquivo Excel / CSV
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const reader = new FileReader();

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      reader.onload = (evt) => {
        try {
          const binaryStr = evt.target?.result;
          const workbook = XLSX.read(binaryStr, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          // Converter para texto separado por tabs
          const tsv = XLSX.utils.sheet_to_csv(worksheet, { FS: '\t' });
          parseRawTabularData(tsv);
          setAnalysisTitle(file.name.replace(/\.[^/.]+$/, ''));
        } catch (err: any) {
          console.error('Erro ao ler Excel:', err);
          addToast('Erro ao processar arquivo Excel: ' + err.message, 'error');
        }
      };
      reader.readAsBinaryString(file);
    } else {
      // CSV ou TXT
      reader.onload = (evt) => {
        try {
          const text = evt.target?.result as string;
          parseRawTabularData(text);
          setAnalysisTitle(file.name.replace(/\.[^/.]+$/, ''));
        } catch (err: any) {
          console.error('Erro ao ler arquivo de texto:', err);
          addToast('Erro ao ler arquivo de texto: ' + err.message, 'error');
        }
      };
      reader.readAsText(file);
    }

    // Limpar o input para permitir selecionar o mesmo arquivo novamente se quiser
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Edição inline da quantidade a pedir
  const handleUpdatePedir = (id: string, newQtd: number) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        const pedir = Math.max(0, newQtd);
        return {
          ...item,
          pedir,
          valorTotalEstimado: Number((pedir * item.ultimoPrLiquido).toFixed(2))
        };
      }
      return item;
    }));
  };

  // Copiar lista formatada para WhatsApp
  const handleCopyForWhatsApp = () => {
    const itensParaPedir = filteredItems.filter(it => it.pedir > 0);
    if (itensParaPedir.length === 0) {
      addToast('Nenhum item com quantidade a pedir (Pedir > 0) na lista atual.', 'warning');
      return;
    }

    const valorTotal = itensParaPedir.reduce((acc, it) => acc + it.valorTotalEstimado, 0);
    const qtdTotal = itensParaPedir.reduce((acc, it) => acc + it.pedir, 0);

    let text = `📦 *PEDIDO DE REPOSIÇÃO - BELAFARMA*\n`;
    text += `📅 Data: ${new Date().toLocaleDateString('pt-BR')}\n`;
    text += `📊 Itens: ${itensParaPedir.length} | Qtd Total: ${qtdTotal} un\n`;
    text += `💰 Valor Est.: R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n`;
    text += `*ITENS SOLICITADOS:*\n`;

    itensParaPedir.forEach((item, index) => {
      text += `${index + 1}. [${item.codigo}] *${item.produto}* ${item.apresentacao ? `(${item.apresentacao})` : ''} - *Qtd: ${item.pedir}*\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
      addToast(`Lista com ${itensParaPedir.length} itens copiada para o WhatsApp!`, 'success');
    }).catch(() => {
      addToast('Não foi possível copiar automaticamente.', 'error');
    });
  };

  // Exportar para Excel (.xlsx)
  const handleExportExcel = () => {
    if (filteredItems.length === 0) {
      addToast('Nenhum item para exportar.', 'warning');
      return;
    }

    const exportRows = filteredItems.map(item => ({
      'Código': item.codigo,
      'Produto': item.produto,
      'Apresentação': item.apresentacao,
      'Saldo Atual': item.saldo,
      'Estoque Mínimo': item.estMin,
      'Venda Total': item.totalVenda,
      'Média Venda': item.media,
      'Curva ABC': item.curvaAbc,
      'Qtd a Pedir': item.pedir,
      'Último Pr. Líquido': item.ultimoPrLiquido,
      'Valor Total Estimado (R$)': item.valorTotalEstimado,
      'Lucro Obtido (ABC)': item.lucroObtido,
      'Fabricante': item.fabricante,
      'Categoria': item.categoria,
      'Código de Barras': item.codBarras
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reposição');
    XLSX.writeFile(workbook, `Reposicao_BelaFarma_${new Date().toISOString().slice(0, 10)}.xlsx`);
    addToast('Planilha Excel baixada com sucesso!', 'success');
  };

  // Salvar análise no banco de dados SQLite
  const handleSaveToDatabase = async () => {
    if (items.length === 0) {
      addToast('Não há itens para salvar.', 'warning');
      return;
    }

    try {
      const totalPedir = items.reduce((acc, it) => acc + (it.pedir || 0), 0);
      const totalValor = items.reduce((acc, it) => acc + (it.valorTotalEstimado || 0), 0);

      const res = await fetch('/api/replenishment/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: saveTitleInput.trim() || analysisTitle,
          items,
          totalItems: items.length,
          totalPedir,
          totalValor,
          user: user?.name || 'Administrador'
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao salvar no banco');
      }

      addToast('Análise salva no banco de dados com sucesso!', 'success');
      setIsSaveModalOpen(false);
      if (saveTitleInput.trim()) {
        setAnalysisTitle(saveTitleInput.trim());
      }
    } catch (err: any) {
      addToast('Erro ao salvar no banco: ' + err.message, 'error');
    }
  };

  // Carregar histórico de análises salvas
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/replenishment/analyses');
      const data = await res.json();
      if (res.ok && data.success) {
        setHistoryList(data.data || []);
      }
    } catch (err: any) {
      console.error('Erro ao buscar histórico:', err);
      addToast('Erro ao buscar histórico do banco.', 'error');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleOpenHistory = () => {
    setIsHistoryModalOpen(true);
    fetchHistory();
  };

  const handleLoadAnalysis = async (id: string) => {
    try {
      const res = await fetch(`/api/replenishment/analyses/${id}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao carregar análise');
      }

      if (data.data && Array.isArray(data.data.items)) {
        setItems(data.data.items);
        setAnalysisTitle(data.data.title || 'Análise Recuperada');
        setIsHistoryModalOpen(false);
        addToast(`Análise "${data.data.title}" carregada com sucesso! (${data.data.items.length} itens)`, 'success');
      }
    } catch (err: any) {
      addToast('Erro ao carregar análise: ' + err.message, 'error');
    }
  };

  const handleDeleteAnalysis = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Deseja realmente excluir esta análise salva?')) return;

    try {
      const res = await fetch(`/api/replenishment/analyses/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Erro ao excluir');
      addToast('Análise excluída do histórico.', 'info');
      setHistoryList(prev => prev.filter(h => h.id !== id));
    } catch (err: any) {
      addToast('Erro ao excluir: ' + err.message, 'error');
    }
  };

  // Enviar para Central de Compras
  const handleSendToCentralCompras = async () => {
    const itensParaPedir = filteredItems.filter(it => it.pedir > 0);
    if (itensParaPedir.length === 0) {
      addToast('Nenhum item com quantidade a pedir (Pedir > 0).', 'warning');
      return;
    }

    if (!confirm(`Deseja enviar ${itensParaPedir.length} itens para a Central de Compras da BelaFarma?`)) {
      return;
    }

    setIsSendingToCompras(true);
    try {
      const res = await fetch('/api/replenishment/send-to-central-compras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: itensParaPedir,
          distribuidora: 'Importação Digifarma',
          usuario: user?.name || 'Administrador'
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falha ao enviar para Central de Compras');
      }

      addToast(data.message || 'Itens enviados para a fila de compras com sucesso!', 'success');
    } catch (err: any) {
      addToast('Erro ao enviar para compras: ' + err.message, 'error');
    } finally {
      setIsSendingToCompras(false);
    }
  };

  // Limpar tabela
  const handleClearData = () => {
    if (items.length === 0) return;
    if (confirm('Tem certeza de que deseja limpar a tabela atual? Os dados não salvos no banco serão perdidos.')) {
      setItems([]);
      setAnalysisTitle('Nova Reposição');
      localStorage.removeItem('belafarma_reposicao_items');
      localStorage.removeItem('belafarma_reposicao_title');
      addToast('Tabela limpa.', 'info');
    }
  };

  // Opções para os dropdowns de filtro
  const categoriasDisponiveis = useMemo(() => {
    const set = new Set<string>();
    items.forEach(it => {
      if (it.categoria) set.add(it.categoria.trim());
    });
    return Array.from(set).sort();
  }, [items]);

  const fabricantesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    items.forEach(it => {
      if (it.fabricante) set.add(it.fabricante.trim());
    });
    return Array.from(set).sort();
  }, [items]);

  // Itens filtrados
  const filteredItems = useMemo(() => {
    let result = [...items];

    // Busca textual
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter(item => 
        item.produto.toLowerCase().includes(term) ||
        item.codigo.toLowerCase().includes(term) ||
        item.apresentacao.toLowerCase().includes(term) ||
        item.fabricante.toLowerCase().includes(term) ||
        item.codBarras.includes(term)
      );
    }

    // Curva ABC
    if (filterCurva !== 'ALL') {
      result = result.filter(item => item.curvaAbc === filterCurva);
    }

    // Categoria
    if (filterCategoria !== 'ALL') {
      result = result.filter(item => item.categoria.toLowerCase() === filterCategoria.toLowerCase());
    }

    // Fabricante
    if (filterFabricante !== 'ALL') {
      result = result.filter(item => item.fabricante.toLowerCase() === filterFabricante.toLowerCase());
    }

    // Situação de Pedido
    if (filterSituacao === 'COM_PEDIDO') {
      result = result.filter(item => item.pedir > 0);
    } else if (filterSituacao === 'SEM_PEDIDO') {
      result = result.filter(item => item.pedir === 0);
    }

    // Saldo em Estoque
    if (filterSaldo === 'RUPTURA') {
      result = result.filter(item => item.saldo <= 0);
    } else if (filterSaldo === 'POSITIVO') {
      result = result.filter(item => item.saldo > 0);
    }

    // Ordenação
    result.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (typeof valA === 'string') {
        valA = (valA as string).toLowerCase();
        valB = (valB as string || '').toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [items, searchTerm, filterCurva, filterCategoria, filterFabricante, filterSituacao, filterSaldo, sortField, sortDirection]);

  // Totalizadores dinâmicos recalculados em tempo real sobre os itens exibidos
  const totals = useMemo(() => {
    let totalItems = filteredItems.length;
    let totalPedirQtd = 0;
    let totalValorEstimado = 0;
    let totalRupturas = 0; // saldo <= 0
    let totalLucroAbc = 0;

    let curvaA = { count: 0, valor: 0, pedirQtd: 0 };
    let curvaB = { count: 0, valor: 0, pedirQtd: 0 };
    let curvaC = { count: 0, valor: 0, pedirQtd: 0 };

    const categoriaTotals: Record<string, { count: number, valor: number }> = {};

    filteredItems.forEach(item => {
      const pedir = item.pedir || 0;
      const valor = item.valorTotalEstimado || 0;

      totalPedirQtd += pedir;
      totalValorEstimado += valor;
      totalLucroAbc += (item.lucroObtido || 0);

      if (item.saldo <= 0) {
        totalRupturas++;
      }

      if (item.curvaAbc === 'A') {
        curvaA.count++;
        curvaA.valor += valor;
        curvaA.pedirQtd += pedir;
      } else if (item.curvaAbc === 'B') {
        curvaB.count++;
        curvaB.valor += valor;
        curvaB.pedirQtd += pedir;
      } else {
        curvaC.count++;
        curvaC.valor += valor;
        curvaC.pedirQtd += pedir;
      }

      const cat = item.categoria || 'OUTROS';
      if (!categoriaTotals[cat]) {
        categoriaTotals[cat] = { count: 0, valor: 0 };
      }
      categoriaTotals[cat].count++;
      categoriaTotals[cat].valor += valor;
    });

    return {
      totalItems,
      totalPedirQtd,
      totalValorEstimado,
      totalRupturas,
      totalLucroAbc,
      curvaA,
      curvaB,
      curvaC,
      categoriaTotals
    };
  }, [filteredItems]);

  const handleSort = (field: keyof ReplenishmentItem) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  return (
    <div className="space-y-5 animate-fade-in pb-12">
      {/* Input de arquivo invisível */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".xlsx,.xls,.csv,.tsv,.txt"
        className="hidden"
      />

      {/* Cabeçalho da Página */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
            <TableProperties className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
                Análise de Reposição & Compras
              </h1>
              <span className="text-xs px-2.5 py-0.5 font-semibold rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                Digifarma / Excel
              </span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {analysisTitle} • Importe planilhas ou cole tabelas para calcular totais, filtrar rupturas e gerar pedidos.
            </p>
          </div>
        </div>

        {/* Botões de Ação Principais */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* BOTÃO IMPORTAR PLANILHA EM DESTAQUE */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium rounded-xl shadow-sm transition-all text-sm cursor-pointer"
            title="Importar arquivo Excel (.xlsx, .xls) ou CSV"
          >
            <Upload className="w-4 h-4" />
            <span>Importar Planilha</span>
          </button>

          {/* BOTÃO COLAR DADOS */}
          <button
            onClick={() => setIsPasteModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-sm transition-all text-sm cursor-pointer"
            title="Colar tabela copiada do Digifarma ou Excel (Ctrl+V)"
          >
            <ClipboardPaste className="w-4 h-4" />
            <span>Colar Tabela</span>
          </button>

          {/* COPIAR WHATSAPP */}
          {items.length > 0 && (
            <button
              onClick={handleCopyForWhatsApp}
              className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium rounded-xl transition-all text-sm"
              title="Copiar lista com quantidades formatada para WhatsApp"
            >
              <Copy className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Copiar WhatsApp</span>
            </button>
          )}

          {/* EXPORTAR EXCEL */}
          {items.length > 0 && (
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium rounded-xl transition-all text-sm"
              title="Baixar dados filtrados em formato Excel (.xlsx)"
            >
              <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Exportar</span>
            </button>
          )}

          {/* SALVAR NO BANCO */}
          {items.length > 0 && (
            <button
              onClick={() => {
                setSaveTitleInput(analysisTitle);
                setIsSaveModalOpen(true);
              }}
              className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium rounded-xl transition-all text-sm"
              title="Salvar esta análise no banco de dados para consultar depois"
            >
              <Save className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Salvar</span>
            </button>
          )}

          {/* HISTÓRICO */}
          <button
            onClick={handleOpenHistory}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium rounded-xl transition-all text-sm"
            title="Ver análises salvas anteriormente no banco"
          >
            <History className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>Histórico</span>
          </button>

          {/* ENVIAR P/ CENTRAL DE COMPRAS */}
          {items.length > 0 && (
            <button
              onClick={handleSendToCentralCompras}
              disabled={isSendingToCompras}
              className="flex items-center gap-2 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-all text-sm disabled:opacity-50"
              title="Enviar itens sugeridos para a Central de Compras da farmácia"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>{isSendingToCompras ? 'Enviando...' : 'P/ Central Compras'}</span>
            </button>
          )}

          {/* LIMPAR TABELA */}
          {items.length > 0 && (
            <button
              onClick={handleClearData}
              className="p-2.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
              title="Limpar tabela atual"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Se não houver itens, mostra cartão instrutivo amigável */}
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-center space-y-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
            <TableProperties className="w-12 h-12" />
          </div>
          <div className="max-w-md">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">
              Nenhuma tabela carregada ainda
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Clique em <strong>"Importar Planilha"</strong> para carregar um arquivo Excel/CSV ou clique em <strong>"Colar Tabela"</strong> para colar diretamente o relatório copiado do Digifarma.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl shadow-sm transition-all"
            >
              <Upload className="w-4 h-4" />
              <span>Importar Arquivo (.xlsx / .csv)</span>
            </button>
            <button
              onClick={() => setIsPasteModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-sm transition-all"
            >
              <ClipboardPaste className="w-4 h-4" />
              <span>Colar do Digifarma (Ctrl+V)</span>
            </button>
          </div>
        </div>
      )}

      {/* DASHBOARD DE KPIS E TOTALIZADORES DINÂMICOS */}
      {items.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {/* 1. Total de Itens Exibidos */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col justify-between">
              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Itens Filtrados</span>
                <Package className="w-4 h-4 text-blue-500" />
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-slate-800 dark:text-white">
                  {totals.totalItems}
                </span>
                <span className="text-xs text-slate-400 ml-1.5">
                  de {items.length} totais
                </span>
              </div>
            </div>

            {/* 2. Quantidade Total a Pedir */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col justify-between">
              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Unidades a Pedir</span>
                <ShoppingCart className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                  {totals.totalPedirQtd.toLocaleString('pt-BR')}
                </span>
                <span className="text-xs text-slate-400 ml-1.5">unidades</span>
              </div>
            </div>

            {/* 3. Valor Total Estimado do Pedido */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col justify-between">
              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Pedido (R$)</span>
                <DollarSign className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  R$ {totals.totalValorEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <div className="text-xs text-slate-400">pedir × custo líq.</div>
              </div>
            </div>

            {/* 4. Rupturas / Estoque Crítico (Saldo <= 0) */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col justify-between">
              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Rupturas (Saldo ≤ 0)</span>
                <AlertTriangle className="w-4 h-4 text-rose-500" />
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                  {totals.totalRupturas}
                </span>
                <span className="text-xs text-slate-400 ml-1.5">itens zerados/neg.</span>
              </div>
            </div>

            {/* 5. Lucro Obtido (ABC) Acumulado */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col justify-between">
              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">Lucro Obtido (ABC)</span>
                <TrendingUp className="w-4 h-4 text-purple-500" />
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  R$ {totals.totalLucroAbc.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <div className="text-xs text-slate-400">margem histórica</div>
              </div>
            </div>
          </div>

          {/* BADGES DE DISTRIBUIÇÃO CURVA ABC & RESUMO DE CATEGORIAS */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-600 dark:text-slate-300 mr-1">Curva ABC:</span>
              <button
                onClick={() => setFilterCurva(filterCurva === 'A' ? 'ALL' : 'A')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-all ${
                  filterCurva === 'A' 
                    ? 'bg-emerald-600 text-white shadow-xs' 
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-200'
                }`}
              >
                <span className="font-bold">A:</span> {totals.curvaA.count} itens (R$ {totals.curvaA.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
              </button>
              <button
                onClick={() => setFilterCurva(filterCurva === 'B' ? 'ALL' : 'B')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-all ${
                  filterCurva === 'B' 
                    ? 'bg-blue-600 text-white shadow-xs' 
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 hover:bg-blue-200'
                }`}
              >
                <span className="font-bold">B:</span> {totals.curvaB.count} itens (R$ {totals.curvaB.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
              </button>
              <button
                onClick={() => setFilterCurva(filterCurva === 'C' ? 'ALL' : 'C')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-all ${
                  filterCurva === 'C' 
                    ? 'bg-slate-600 text-white shadow-xs' 
                    : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-300 hover:bg-slate-300'
                }`}
              >
                <span className="font-bold">C:</span> {totals.curvaC.count} itens (R$ {totals.curvaC.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
              </button>
            </div>

            {/* Toggle de Colunas Não Essenciais */}
            <button
              onClick={() => setShowSecondaryColumns(prev => !prev)}
              className="flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 transition-all font-medium"
            >
              {showSecondaryColumns ? <EyeOff className="w-3.5 h-3.5 text-slate-400" /> : <Eye className="w-3.5 h-3.5 text-blue-500" />}
              <span>{showSecondaryColumns ? 'Ocultar Colunas Secundárias' : 'Ver Colunas Completas (EAN, Ciclo, etc.)'}</span>
            </button>
          </div>

          {/* BARRA DE FILTROS AVANÇADOS */}
          <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Campo de Busca Rápida */}
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por código, produto, apresentação, fabricante..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filtro Curva ABC */}
              <select
                value={filterCurva}
                onChange={(e) => setFilterCurva(e.target.value)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="ALL">Curva ABC: Todas</option>
                <option value="A">Curva A</option>
                <option value="B">Curva B</option>
                <option value="C">Curva C</option>
              </select>

              {/* Filtro Categoria */}
              <select
                value={filterCategoria}
                onChange={(e) => setFilterCategoria(e.target.value)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-300 focus:outline-none max-w-[200px]"
              >
                <option value="ALL">Categorias: Todas</option>
                {categoriasDisponiveis.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              {/* Filtro Fabricante */}
              <select
                value={filterFabricante}
                onChange={(e) => setFilterFabricante(e.target.value)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-300 focus:outline-none max-w-[200px]"
              >
                <option value="ALL">Fabricantes: Todos</option>
                {fabricantesDisponiveis.map(fab => (
                  <option key={fab} value={fab}>{fab}</option>
                ))}
              </select>

              {/* Filtro Situação de Pedido */}
              <select
                value={filterSituacao}
                onChange={(e) => setFilterSituacao(e.target.value as any)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="ALL">Pedido: Todos os Itens</option>
                <option value="COM_PEDIDO">Apenas com Pedir &gt; 0</option>
                <option value="SEM_PEDIDO">Sem Sugestão (Pedir = 0)</option>
              </select>

              {/* Filtro Saldo / Ruptura */}
              <select
                value={filterSaldo}
                onChange={(e) => setFilterSaldo(e.target.value as any)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="ALL">Estoque: Todos os Saldos</option>
                <option value="RUPTURA">Apenas Ruptura (Saldo ≤ 0)</option>
                <option value="POSITIVO">Apenas Saldo Positivo (&gt; 0)</option>
              </select>

              {/* Limpar Filtros */}
              {(searchTerm || filterCurva !== 'ALL' || filterCategoria !== 'ALL' || filterFabricante !== 'ALL' || filterSituacao !== 'ALL' || filterSaldo !== 'ALL') && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setFilterCurva('ALL');
                    setFilterCategoria('ALL');
                    setFilterFabricante('ALL');
                    setFilterSituacao('ALL');
                    setFilterSaldo('ALL');
                  }}
                  className="px-3 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Limpar Filtros
                </button>
              )}
            </div>
          </div>

          {/* TABELA DE DADOS FOCADA EM COMPRAS */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-[650px] relative">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-900/80 sticky top-0 z-10 text-slate-600 dark:text-slate-300 uppercase font-semibold text-[11px] border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th onClick={() => handleSort('curvaAbc')} className="p-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors w-16 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span>ABC</span>
                        {sortField === 'curvaAbc' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th onClick={() => handleSort('codigo')} className="p-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors w-24">
                      <div className="flex items-center gap-1">
                        <span>Código</span>
                        {sortField === 'codigo' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th onClick={() => handleSort('produto')} className="p-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors min-w-[220px]">
                      <div className="flex items-center gap-1">
                        <span>Produto / Apresentação</span>
                        {sortField === 'produto' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th onClick={() => handleSort('saldo')} className="p-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors text-right w-24">
                      <div className="flex items-center justify-end gap-1">
                        <span>Saldo</span>
                        {sortField === 'saldo' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th onClick={() => handleSort('estMin')} className="p-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors text-right w-20">
                      <div className="flex items-center justify-end gap-1">
                        <span>Est. Mín</span>
                        {sortField === 'estMin' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th onClick={() => handleSort('totalVenda')} className="p-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors text-right w-24">
                      <div className="flex items-center justify-end gap-1">
                        <span>Venda / Média</span>
                        {sortField === 'totalVenda' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th onClick={() => handleSort('ultimoPrLiquido')} className="p-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors text-right w-28">
                      <div className="flex items-center justify-end gap-1">
                        <span>Últ. Pr. Custo</span>
                        {sortField === 'ultimoPrLiquido' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th onClick={() => handleSort('pedir')} className="p-3 cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-950/40 transition-colors text-center w-32 bg-indigo-50/70 dark:bg-indigo-950/30">
                      <div className="flex items-center justify-center gap-1 text-indigo-700 dark:text-indigo-300 font-bold">
                        <span>Pedir (Ajustável)</span>
                        {sortField === 'pedir' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th onClick={() => handleSort('valorTotalEstimado')} className="p-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors text-right w-32">
                      <div className="flex items-center justify-end gap-1 text-emerald-700 dark:text-emerald-400 font-bold">
                        <span>Total Est. (R$)</span>
                        {sortField === 'valorTotalEstimado' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th onClick={() => handleSort('categoria')} className="p-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors w-28">
                      <div className="flex items-center gap-1">
                        <span>Categoria</span>
                        {sortField === 'categoria' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>
                    <th onClick={() => handleSort('fabricante')} className="p-3 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors w-32">
                      <div className="flex items-center gap-1">
                        <span>Fabricante</span>
                        {sortField === 'fabricante' && (sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </div>
                    </th>

                    {/* COLUNAS SECUNDÁRIAS (Opcionais) */}
                    {showSecondaryColumns && (
                      <>
                        <th onClick={() => handleSort('ciclo')} className="p-3 cursor-pointer text-right w-20">Ciclo (dias)</th>
                        <th onClick={() => handleSort('lucroObtido')} className="p-3 cursor-pointer text-right w-28">Lucro Obtido</th>
                        <th onClick={() => handleSort('codBarras')} className="p-3 cursor-pointer w-32">Cód. Barras</th>
                        <th onClick={() => handleSort('ultimoFornecedor')} className="p-3 cursor-pointer w-32">Últ. Fornecedor</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {filteredItems.map((item, idx) => {
                    const isRuptura = item.saldo <= 0;
                    const hasPedido = item.pedir > 0;

                    return (
                      <tr
                        key={item.id || idx}
                        className={`hover:bg-blue-50/40 dark:hover:bg-slate-700/40 transition-colors ${
                          isRuptura ? 'bg-rose-50/20 dark:bg-rose-950/10' : idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50'
                        }`}
                      >
                        {/* Curva ABC */}
                        <td className="p-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-md font-bold text-[10px] ${
                            item.curvaAbc === 'A' 
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300' 
                              : item.curvaAbc === 'B'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300'
                              : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                          }`}>
                            {item.curvaAbc || 'B'}
                          </span>
                        </td>

                        {/* Código */}
                        <td className="p-3 font-mono text-slate-500 dark:text-slate-400">
                          {item.codigo}
                        </td>

                        {/* Produto e Apresentação */}
                        <td className="p-3 font-medium text-slate-800 dark:text-slate-200">
                          <div className="font-semibold line-clamp-1" title={item.produto}>
                            {item.produto}
                          </div>
                          {item.apresentacao && (
                            <div className="text-[11px] text-slate-400 dark:text-slate-400 line-clamp-1">
                              {item.apresentacao}
                            </div>
                          )}
                        </td>

                        {/* Saldo Atual */}
                        <td className="p-3 text-right font-semibold">
                          <span className={`px-2 py-0.5 rounded ${
                            isRuptura 
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300' 
                              : 'text-slate-700 dark:text-slate-300'
                          }`}>
                            {item.saldo}
                          </span>
                        </td>

                        {/* Estoque Mínimo */}
                        <td className="p-3 text-right text-slate-500 dark:text-slate-400">
                          {item.estMin}
                        </td>

                        {/* Venda e Média */}
                        <td className="p-3 text-right">
                          <span className="font-medium text-slate-700 dark:text-slate-300">{item.totalVenda}</span>
                          <span className="text-[10px] text-slate-400 ml-1">({item.media}/d)</span>
                        </td>

                        {/* Preço de Custo Líquido */}
                        <td className="p-3 text-right text-slate-600 dark:text-slate-300">
                          R$ {item.ultimoPrLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Pedir (EDITÁVEL INLINE!) */}
                        <td className="p-2 text-center bg-indigo-50/40 dark:bg-indigo-950/20">
                          <input
                            type="number"
                            min="0"
                            value={item.pedir}
                            onChange={(e) => handleUpdatePedir(item.id, parseInt(e.target.value, 10) || 0)}
                            className={`w-20 px-2 py-1 text-center font-bold text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                              hasPedido 
                                ? 'bg-indigo-600 text-white border-indigo-600' 
                                : 'bg-white dark:bg-slate-900 text-slate-400 border-slate-300 dark:border-slate-600'
                            }`}
                          />
                        </td>

                        {/* Subtotal Estimado da Compra */}
                        <td className="p-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          R$ {item.valorTotalEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Categoria */}
                        <td className="p-3">
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 font-medium">
                            {item.categoria}
                          </span>
                        </td>

                        {/* Fabricante */}
                        <td className="p-3 text-slate-500 dark:text-slate-400 truncate max-w-[140px]" title={item.fabricante}>
                          {item.fabricante}
                        </td>

                        {/* Colunas Opcionais */}
                        {showSecondaryColumns && (
                          <>
                            <td className="p-3 text-right text-slate-500">{item.ciclo}d</td>
                            <td className="p-3 text-right text-purple-600 font-medium">
                              R$ {item.lucroObtido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-3 font-mono text-slate-400 text-[10px]">{item.codBarras}</td>
                            <td className="p-3 text-slate-500 text-[11px]">{item.ultimoFornecedor || '-'}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Rodapé Fixo da Tabela com Totalizadores do Filtro Atual */}
            <div className="bg-slate-100 dark:bg-slate-900 p-4 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <div className="flex items-center gap-4">
                <span>Exibindo <strong>{filteredItems.length}</strong> de <strong>{items.length}</strong> itens</span>
                <span>•</span>
                <span>Rupturas no filtro: <strong className="text-rose-600">{totals.totalRupturas}</strong></span>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div>
                  Qtd a Pedir: <strong className="text-indigo-600 dark:text-indigo-400 text-base">{totals.totalPedirQtd} un</strong>
                </div>
                <div>
                  Total da Compra: <strong className="text-emerald-600 dark:text-emerald-400 text-base">R$ {totals.totalValorEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* MODAL DE COLAR TABELA (Ctrl+V) */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4 animate-scale-up">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <ClipboardPaste className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                  Colar Tabela do Digifarma ou Excel
                </h3>
              </div>
              <button
                onClick={() => setIsPasteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-500 dark:text-slate-400">
              Copie as linhas da tabela (Ctrl+C) no Digifarma ou Excel e cole (Ctrl+V) na caixa de texto abaixo. As colunas e valores com vírgula serão identificados automaticamente.
            </p>

            <textarea
              rows={10}
              placeholder="Cole aqui a tabela com as colunas: Código, Produto, Apresentação, Saldo, Est. Mín., Venda, Média, Curva ABC, Pedir, Último Pr. Líquido..."
              value={pasteRawText}
              onChange={(e) => setPasteRawText(e.target.value)}
              className="w-full p-3 font-mono text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
            />

            <div className="flex justify-between items-center pt-2">
              <span className="text-xs text-slate-400">
                {pasteRawText.split(/\r?\n/).filter(l => l.trim()).length} linhas coladas
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsPasteModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => parseRawTabularData(pasteRawText)}
                  disabled={!pasteRawText.trim()}
                  className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-sm transition-all disabled:opacity-50"
                >
                  Processar Tabela
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE SALVAR NO BANCO */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Save className="w-5 h-5 text-amber-600" />
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                  Salvar Análise no Banco
                </h3>
              </div>
              <button
                onClick={() => setIsSaveModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-500 dark:text-slate-400">
              Dê um nome para identificar esta análise e salvá-la no banco de dados da BelaFarma.
            </p>

            <input
              type="text"
              placeholder="Ex: Reposição Segunda-feira 26/09"
              value={saveTitleInput}
              onChange={(e) => setSaveTitleInput(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-800 dark:text-slate-200"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsSaveModalOpen(false)}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveToDatabase}
                className="px-5 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl shadow-sm transition-all"
              >
                Salvar Análise
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE HISTÓRICO */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-purple-600" />
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                  Histórico de Análises Salvas
                </h3>
              </div>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-1">
              {loadingHistory && (
                <div className="text-center py-8 text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                  <span>Carregando histórico...</span>
                </div>
              )}

              {!loadingHistory && historyList.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  Nenhuma análise salva encontrada no banco de dados.
                </div>
              )}

              {!loadingHistory && historyList.map(item => (
                <div
                  key={item.id}
                  onClick={() => handleLoadAnalysis(item.id)}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-purple-500 dark:hover:border-purple-500 bg-slate-50 dark:bg-slate-900/50 hover:bg-purple-50/30 dark:hover:bg-purple-950/20 cursor-pointer transition-all flex justify-between items-center"
                >
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-white text-sm">
                      {item.title}
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(item.created_at).toLocaleString('pt-BR')} • por {item.created_by || 'Administrador'}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-600 dark:text-slate-300 font-medium">
                      <span>{item.total_items} itens</span>
                      <span>•</span>
                      <span>{item.total_pedir} un a pedir</span>
                      <span>•</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                        R$ {Number(item.total_valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => handleDeleteAnalysis(item.id, e)}
                      className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
                      title="Excluir do banco"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
