import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Package,
  Calendar,
  Building2,
  DollarSign,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Layers,
  History,
  X,
  Eye,
  FileSpreadsheet,
  AlertCircle,
  HelpCircle,
  Search,
  RefreshCw
} from 'lucide-react';
import { useToast } from '../ToastContext';

interface NfeItemPreview {
  item_index: number;
  supplier_code: string;
  barcode: string;
  description: string;
  ncm: string;
  cest: string;
  unit_measure: string;
  quantity_bought: number;
  unit_cost: number;
  total_cost: number;
  lot_number?: string;
  expiration_date?: string;
  is_matched: boolean;
  product_code: string | null;
  current_stock: number;
  current_cost: number;
  current_sale_price: number;
  cost_variation_pct: number;
  conversion_factor: number;
  quantity_to_add: number;
  final_unit_cost: number;
  suggested_sale_price?: number;
}

interface DuplicataPreview {
  number: string;
  dueDate: string;
  value: number;
}

interface NfePreviewData {
  access_key: string;
  invoice_number: string;
  series: string;
  issue_date: string;
  supplier_cnpj: string;
  supplier_name: string;
  total_products: number;
  total_st: number;
  total_discount: number;
  total_invoice: number;
  duplicatas: DuplicataPreview[];
  items_count: number;
  items: NfeItemPreview[];
}

interface HistoricalInvoice {
  id: string;
  invoice_number: string;
  supplier_name: string;
  issue_date: string;
  total_value: number;
  status: string;
  created_at: string;
  created_by: string;
  access_key?: string;
  series?: string;
  total_items?: number;
  total_units?: number;
}

export const InboundInvoices: React.FC = () => {
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados principais
  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Preview da NF-e
  const [preview, setPreview] = useState<NfePreviewData | null>(null);
  const [xmlFileName, setXmlFileName] = useState<string>('');

  // Confirmação via Modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Histórico
  const [historyList, setHistoryList] = useState<HistoricalInvoice[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [selectedInvoiceDetail, setSelectedInvoiceDetail] = useState<any | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Carrega histórico quando muda de aba
  useEffect(() => {
    if (activeTab === 'history') {
      carregarHistorico();
    }
  }, [activeTab]);

  const carregarHistorico = async (query = '') => {
    setIsLoadingHistory(true);
    try {
      const url = `/api/erp/invoices?search=${encodeURIComponent(query || historySearch)}&limit=50`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setHistoryList(data.data);
      } else {
        setHistoryList([]);
      }
    } catch (err: any) {
      console.error('Erro ao buscar histórico de notas:', err);
      addToast('Não foi possível carregar o histórico de notas.', 'error');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.xml')) {
      addToast('Por favor selecione um arquivo válido no formato .xml de NF-e.', 'error');
      return;
    }

    setXmlFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const xmlString = e.target?.result as string;
      if (xmlString) {
        enviarPreviewXml(xmlString);
      }
    };
    reader.readAsText(file);
  };

  const enviarPreviewXml = async (xmlString: string) => {
    setIsLoadingPreview(true);
    try {
      const res = await fetch('/api/erp/invoices/preview-xml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml: xmlString })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao processar arquivo XML.');
      }

      // Prepara itens com sugestão inicial de preço se forem novos produtos
      const itemsComPreco = data.data.items.map((it: NfeItemPreview) => ({
        ...it,
        conversion_factor: it.conversion_factor || 1,
        quantity_to_add: it.quantity_bought * (it.conversion_factor || 1),
        final_unit_cost: it.unit_cost / (it.conversion_factor || 1),
        suggested_sale_price: it.current_sale_price > 0 
          ? it.current_sale_price 
          : Math.round(((it.unit_cost / (it.conversion_factor || 1)) * 1.45) * 100) / 100
      }));

      setPreview({
        ...data.data,
        items: itemsComPreco
      });

      addToast(`NF-e #${data.data.invoice_number} carregada para conferência!`, 'success');
    } catch (err: any) {
      console.error('Erro ao processar preview NF-e:', err);
      addToast(err.message || 'Falha ao analisar XML da NF-e.', 'error');
      setPreview(null);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleConversionFactorChange = (index: number, newFactorRaw: string) => {
    if (!preview) return;
    const factor = parseFloat(newFactorRaw) || 1;
    const safeFactor = factor <= 0 ? 1 : factor;

    const updatedItems = [...preview.items];
    const item = updatedItems[index];

    const qtdFinal = item.quantity_bought * safeFactor;
    const custoUnitConvertido = item.unit_cost / safeFactor;

    let variacao = 0;
    if (item.current_cost > 0 && custoUnitConvertido > 0) {
      variacao = Math.round(((custoUnitConvertido - item.current_cost) / item.current_cost) * 1000) / 10;
    }

    updatedItems[index] = {
      ...item,
      conversion_factor: safeFactor,
      quantity_to_add: Math.round(qtdFinal * 1000) / 1000,
      final_unit_cost: Math.round(custoUnitConvertido * 100) / 100,
      cost_variation_pct: variacao
    };

    setPreview({
      ...preview,
      items: updatedItems
    });
  };

  const handleSalePriceChange = (index: number, newPriceRaw: string) => {
    if (!preview) return;
    const price = parseFloat(newPriceRaw) || 0;
    const updatedItems = [...preview.items];
    updatedItems[index] = {
      ...updatedItems[index],
      suggested_sale_price: price
    };
    setPreview({
      ...preview,
      items: updatedItems
    });
  };

  const executarConfirmacaoImportacao = async () => {
    if (!preview) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/erp/invoices/confirm-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...preview,
          items: preview.items.map(it => ({
            ...it,
            sale_price: it.suggested_sale_price || it.current_sale_price
          }))
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao registrar entrada de estoque da NF-e.');
      }

      addToast(
        `Nota #${preview.invoice_number} importada! +${data.data.total_quantity_added} unidades adicionadas ao estoque.`,
        'success'
      );

      setShowConfirmModal(false);
      setPreview(null);
      setXmlFileName('');
      setActiveTab('history');
      carregarHistorico();
    } catch (err: any) {
      console.error('Erro ao confirmar NF-e:', err);
      addToast(err.message || 'Falha ao confirmar importação da NF-e.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const visualizarDetalhesNota = async (invoiceId: string) => {
    setIsLoadingDetail(true);
    try {
      const res = await fetch(`/api/erp/invoices/${encodeURIComponent(invoiceId)}`);
      const data = await res.json();
      if (data.success && data.data) {
        setSelectedInvoiceDetail(data.data);
      } else {
        addToast('Não foi possível obter os detalhes da nota.', 'error');
      }
    } catch (err: any) {
      console.error('Erro ao buscar detalhes da nota:', err);
      addToast('Erro ao carregar detalhes da nota fiscal.', 'error');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Contadores do preview
  const matchedCount = preview?.items.filter(i => i.is_matched).length || 0;
  const newProductsCount = (preview?.items.length || 0) - matchedCount;
  const totalUnitsToAdd = preview?.items.reduce((sum, i) => sum + i.quantity_to_add, 0) || 0;

  return (
    <div className="flex flex-col min-h-screen bg-slate-900 text-slate-100 p-4 lg:p-6 space-y-6">
      {/* 1. Header do Módulo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-950/40">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Entrada de Notas Fiscais
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  NF-e XML
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Alimentação de estoque nativo, conversão de caixas para unidades e recálculo de custo em milissegundos.
              </p>
            </div>
          </div>
        </div>

        {/* Abas e Ações Rápidas */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'upload'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/30'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            Importar XML
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'history'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/30'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <History className="w-4 h-4" />
            Histórico de Entradas
          </button>
        </div>
      </div>

      {/* 2. Conteúdo da Aba Upload / Preview */}
      {activeTab === 'upload' && (
        <div className="space-y-6">
          {/* Dropzone de Arquivo */}
          {!preview && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileSelect(e.dataTransfer.files[0]);
                }
              }}
              className={`border-2 border-dashed rounded-2xl p-8 lg:p-12 text-center transition-all flex flex-col items-center justify-center gap-4 ${
                isDragging
                  ? 'border-emerald-500 bg-emerald-950/20 shadow-xl shadow-emerald-950/30'
                  : 'border-slate-700 hover:border-slate-500 bg-slate-800/40'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xml"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />

              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-2">
                {isLoadingPreview ? (
                  <RefreshCw className="w-8 h-8 animate-spin" />
                ) : (
                  <UploadCloud className="w-8 h-8" />
                )}
              </div>

              <div>
                <h3 className="text-base lg:text-lg font-bold text-white">
                  {isLoadingPreview ? 'Processando XML da NF-e...' : 'Selecione ou Arraste o arquivo XML da NF-e'}
                </h3>
                <p className="text-xs lg:text-sm text-slate-400 mt-1 max-w-md mx-auto">
                  Compatível com notas fiscais de compra modelo 55 de qualquer distribuidora farmacêutica ou fornecedor comercial.
                </p>
              </div>

              <button
                type="button"
                disabled={isLoadingPreview}
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm shadow-lg shadow-emerald-900/40 transition-all flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                Escolher Arquivo XML
              </button>
            </div>
          )}

          {/* Painel de Conferência (Quando o XML é carregado) */}
          {preview && (
            <div className="space-y-6">
              {/* Header do Preview com Dados da Nota */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Fornecedor */}
                <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-4 flex flex-col justify-between">
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold mb-1">
                    <Building2 className="w-4 h-4 text-emerald-400" />
                    EMITENTE / FORNECEDOR
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white truncate" title={preview.supplier_name}>
                      {preview.supplier_name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">CNPJ: {preview.supplier_cnpj || 'Não inf.'}</p>
                  </div>
                </div>

                {/* Nota Fiscal */}
                <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-4 flex flex-col justify-between">
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold mb-1">
                    <FileText className="w-4 h-4 text-sky-400" />
                    IDENTIFICAÇÃO DA NOTA
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-white">NF #{preview.invoice_number}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300 font-mono">
                        Série {preview.series}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">Emissão: {preview.issue_date}</p>
                  </div>
                </div>

                {/* Valor Total */}
                <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-4 flex flex-col justify-between">
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold mb-1">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    VALOR TOTAL DA NOTA
                  </div>
                  <div>
                    <div className="text-xl font-bold text-emerald-400">
                      R$ {preview.total_invoice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Prod: R$ {preview.total_products.toFixed(2)} | ST: R$ {preview.total_st.toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Resumo de Estoque */}
                <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-4 flex flex-col justify-between">
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold mb-1">
                    <Package className="w-4 h-4 text-amber-400" />
                    CONFERÊNCIA DE ESTOQUE
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-xl font-bold text-white">
                        +{totalUnitsToAdd} <span className="text-xs font-normal text-slate-400">unidades</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {preview.items.length} itens ({matchedCount} casados, {newProductsCount} novos)
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setPreview(null);
                        setXmlFileName('');
                      }}
                      className="text-xs text-slate-400 hover:text-rose-400 transition-colors p-1"
                      title="Descartar XML atual"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Duplicatas / Boletos Detectados */}
              {preview.duplicatas && preview.duplicatas.length > 0 && (
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-3 flex flex-wrap items-center gap-3">
                  <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    Vencimentos Identificados (Contas a Pagar):
                  </span>
                  {preview.duplicatas.map((dup, i) => (
                    <div
                      key={i}
                      className="text-xs bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-md flex items-center gap-2"
                    >
                      <span className="text-slate-400">Parc. {dup.number || (i + 1)}:</span>
                      <span className="font-semibold text-white">{dup.dueDate}</span>
                      <span className="text-emerald-400 font-bold">R$ {dup.value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 3. Tabela de Alta Densidade de Itens da NF-e */}
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
                <div className="p-3 border-b border-slate-700 flex items-center justify-between bg-slate-800/90">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-bold text-white">Conferência dos Produtos da Nota</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                      {preview.items.length} itens
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowConfirmModal(true)}
                      disabled={isSubmitting}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-md shadow-emerald-950/40 transition-all flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Confirmar Entrada no Estoque
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-700 bg-slate-900/60 text-slate-400 font-semibold">
                        <th className="py-2.5 px-3 whitespace-nowrap text-center w-10">#</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">Código / EAN</th>
                        <th className="py-2.5 px-3 whitespace-nowrap min-w-[240px]">Descrição do Produto</th>
                        <th className="py-2.5 px-3 whitespace-nowrap text-center">Lote / Validade</th>
                        <th className="py-2.5 px-3 whitespace-nowrap text-center">Qtd NF</th>
                        <th className="py-2.5 px-3 whitespace-nowrap text-center">Fator Conv.</th>
                        <th className="py-2.5 px-3 whitespace-nowrap text-center text-emerald-400 font-bold">Qtd Final</th>
                        <th className="py-2.5 px-3 whitespace-nowrap text-right">Custo NF</th>
                        <th className="py-2.5 px-3 whitespace-nowrap text-right">Custo Un.</th>
                        <th className="py-2.5 px-3 whitespace-nowrap text-center">Variação</th>
                        <th className="py-2.5 px-3 whitespace-nowrap text-center">Status</th>
                        <th className="py-2.5 px-3 whitespace-nowrap text-right">Preço Venda</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {preview.items.map((item, idx) => {
                        const isCostUp = item.cost_variation_pct > 0;
                        const isCostDown = item.cost_variation_pct < 0;

                        return (
                          <tr key={idx} className="hover:bg-slate-700/30 transition-colors">
                            {/* # */}
                            <td className="py-2 px-3 text-center text-slate-500 font-mono">
                              {item.item_index}
                            </td>

                            {/* EAN / Código do Fornecedor */}
                            <td className="py-2 px-3 whitespace-nowrap">
                              <div className="font-mono text-slate-200">{item.barcode || 'S/ EAN'}</div>
                              <div className="text-[10px] text-slate-500">Ref: {item.supplier_code}</div>
                            </td>

                            {/* Descrição */}
                            <td className="py-2 px-3">
                              <div className="font-semibold text-white leading-tight">
                                {item.description}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                                {item.ncm && <span>NCM: {item.ncm}</span>}
                                {item.unit_measure && (
                                  <span className="px-1 rounded bg-slate-800 border border-slate-700">
                                    {item.unit_measure}
                                  </span>
                                )}
                                {item.is_matched && (
                                  <span className="text-slate-400">
                                    Estoque atual: <strong className="text-white">{item.current_stock}</strong>
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Lote / Validade */}
                            <td className="py-2 px-3 text-center whitespace-nowrap">
                              {item.lot_number ? (
                                <div className="inline-block text-left">
                                  <div className="font-mono text-slate-300 font-semibold">{item.lot_number}</div>
                                  <div className="text-[10px] text-slate-400">{item.expiration_date || 'Sem val.'}</div>
                                </div>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </td>

                            {/* Qtd Comprada na Nota */}
                            <td className="py-2 px-3 text-center font-bold text-slate-300 whitespace-nowrap">
                              {item.quantity_bought} {item.unit_measure}
                            </td>

                            {/* Fator de Conversão */}
                            <td className="py-2 px-3 text-center whitespace-nowrap">
                              <div className="inline-flex items-center gap-1">
                                <span className="text-slate-500 text-[10px]">x</span>
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={item.conversion_factor}
                                  onChange={(e) => handleConversionFactorChange(idx, e.target.value)}
                                  className="w-14 px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-center text-xs font-bold text-amber-400 focus:outline-none focus:border-amber-500"
                                  title="Se comprou caixa com 10 unidades, digite 10"
                                />
                              </div>
                            </td>

                            {/* Quantidade Final a entrar */}
                            <td className="py-2 px-3 text-center whitespace-nowrap font-bold text-emerald-400 bg-emerald-950/20">
                              +{item.quantity_to_add} un
                            </td>

                            {/* Custo Unitário na Nota */}
                            <td className="py-2 px-3 text-right whitespace-nowrap text-slate-300">
                              R$ {item.unit_cost.toFixed(2)}
                            </td>

                            {/* Custo Unitário Convertido */}
                            <td className="py-2 px-3 text-right whitespace-nowrap font-semibold text-white">
                              R$ {item.final_unit_cost.toFixed(2)}
                            </td>

                            {/* Variação de Custo */}
                            <td className="py-2 px-3 text-center whitespace-nowrap">
                              {item.is_matched && item.current_cost > 0 ? (
                                <span
                                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    isCostDown
                                      ? 'bg-emerald-500/20 text-emerald-400'
                                      : isCostUp
                                      ? 'bg-rose-500/20 text-rose-400'
                                      : 'bg-slate-800 text-slate-400'
                                  }`}
                                >
                                  {isCostDown && <TrendingDown className="w-3 h-3" />}
                                  {isCostUp && <TrendingUp className="w-3 h-3" />}
                                  {item.cost_variation_pct > 0 ? `+${item.cost_variation_pct}%` : `${item.cost_variation_pct}%`}
                                </span>
                              ) : (
                                <span className="text-slate-600 text-[10px]">Novo</span>
                              )}
                            </td>

                            {/* Status de Match */}
                            <td className="py-2 px-3 text-center whitespace-nowrap">
                              {item.is_matched ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                  Cadastrado
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                  Novo Produto
                                </span>
                              )}
                            </td>

                            {/* Preço de Venda */}
                            <td className="py-2 px-3 text-right whitespace-nowrap">
                              {item.is_matched ? (
                                <span className="text-slate-300 font-semibold">
                                  R$ {item.current_sale_price.toFixed(2)}
                                </span>
                              ) : (
                                <div className="inline-flex items-center gap-1 justify-end">
                                  <span className="text-slate-500 text-[10px]">R$</span>
                                  <input
                                    type="number"
                                    step="0.10"
                                    value={item.suggested_sale_price || 0}
                                    onChange={(e) => handleSalePriceChange(idx, e.target.value)}
                                    className="w-16 px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-right text-xs font-semibold text-emerald-400 focus:outline-none focus:border-emerald-500"
                                  />
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Conteúdo da Aba Histórico */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* Barra de Busca */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-800/60 p-3 rounded-xl border border-slate-700">
            <div className="relative w-full md:w-96">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por número da nota ou fornecedor..."
                value={historySearch}
                onChange={(e) => {
                  setHistorySearch(e.target.value);
                  carregarHistorico(e.target.value);
                }}
                className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <button
              onClick={() => carregarHistorico()}
              disabled={isLoadingHistory}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-semibold text-slate-300 flex items-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>

          {/* Tabela do Histórico */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-900/60 text-slate-400 font-semibold">
                    <th className="py-2.5 px-3 whitespace-nowrap">Nota / Série</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Fornecedor</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-center">Data Emissão</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-center">Itens / Unidades</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-right">Valor Total</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-center">Status</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-center w-20">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {isLoadingHistory ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
                        Carregando histórico de notas fiscais...
                      </td>
                    </tr>
                  ) : historyList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400">
                        Nenhuma nota fiscal encontrada.
                      </td>
                    </tr>
                  ) : (
                    historyList.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-700/30 transition-colors">
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="font-bold text-white">NF #{inv.invoice_number}</span>
                          <span className="text-slate-500 ml-1">Série {inv.series || '1'}</span>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-200">
                          {inv.supplier_name}
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-400 whitespace-nowrap">
                          {inv.issue_date}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <span className="text-slate-300 font-semibold">{inv.total_items || 0} itens</span>
                          <span className="text-slate-500 text-[10px] ml-1">({inv.total_units || 0} un)</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-400 whitespace-nowrap">
                          R$ {inv.total_value.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <button
                            onClick={() => visualizarDetalhesNota(inv.id)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                            title="Ver itens da nota"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modal de Confirmação da Importação */}
      {showConfirmModal && preview && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Confirmar Entrada da NF-e</h3>
                <p className="text-xs text-slate-400">Nota #{preview.invoice_number} - {preview.supplier_name}</p>
              </div>
            </div>

            <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-700/60 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Total de Produtos:</span>
                <span className="text-white font-bold">{preview.items.length} itens</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Unidades a entrar no estoque:</span>
                <span className="text-emerald-400 font-bold">+{totalUnitsToAdd} unidades</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Novos produtos a cadastrar:</span>
                <span className="text-amber-400 font-bold">{newProductsCount} produtos</span>
              </div>
              <div className="flex justify-between border-t border-slate-800 pt-1.5">
                <span className="text-slate-400">Valor Total da Nota:</span>
                <span className="text-white font-bold">R$ {preview.total_invoice.toFixed(2)}</span>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              O estoque físico será incrementado imediatamente e os preços de custo serão recalculados no catálogo.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={executarConfirmacaoImportacao}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-md shadow-emerald-950/40 transition-all flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Gravando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Confirmar Entrada
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Modal de Detalhes da Nota do Histórico */}
      {selectedInvoiceDetail && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            {/* Header Modal */}
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  Nota Fiscal #{selectedInvoiceDetail.invoice_number}
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedInvoiceDetail.supplier_name} • Emissão: {selectedInvoiceDetail.issue_date}
                </p>
              </div>
              <button
                onClick={() => setSelectedInvoiceDetail(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Itens da Nota */}
            <div className="flex-1 overflow-y-auto p-4">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 font-semibold">
                    <th className="py-2 px-3 whitespace-nowrap">Produto</th>
                    <th className="py-2 px-3 whitespace-nowrap text-center">EAN</th>
                    <th className="py-2 px-3 whitespace-nowrap text-center">Lote</th>
                    <th className="py-2 px-3 whitespace-nowrap text-center">Qtd Entrou</th>
                    <th className="py-2 px-3 whitespace-nowrap text-right">Custo Un.</th>
                    <th className="py-2 px-3 whitespace-nowrap text-right">Custo Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {selectedInvoiceDetail.items?.map((it: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-700/20">
                      <td className="py-2 px-3 font-semibold text-white">{it.product_name}</td>
                      <td className="py-2 px-3 text-center text-slate-400 font-mono">{it.barcode || '-'}</td>
                      <td className="py-2 px-3 text-center text-slate-400">{it.lot_number || '-'}</td>
                      <td className="py-2 px-3 text-center font-bold text-emerald-400">+{it.quantity}</td>
                      <td className="py-2 px-3 text-right text-slate-300">R$ {Number(it.unit_cost || 0).toFixed(2)}</td>
                      <td className="py-2 px-3 text-right font-semibold text-white">R$ {Number(it.total_cost || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-slate-700 flex items-center justify-between bg-slate-900/50">
              <span className="text-xs text-slate-400">
                Total da Nota: <strong className="text-emerald-400 font-bold">R$ {Number(selectedInvoiceDetail.total_value || 0).toFixed(2)}</strong>
              </span>
              <button
                onClick={() => setSelectedInvoiceDetail(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-semibold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
