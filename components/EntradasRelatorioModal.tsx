import React, { useState, useEffect } from 'react';
import {
  FileText,
  X,
  Search,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  Package,
  ArrowRight,
  Filter,
  RefreshCw,
  Loader2,
  Check,
  Building2,
  Tag,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ClipboardCheck
} from 'lucide-react';
import { User } from '../types';
import { useToast } from './ToastContext';

export interface ItemEntrada {
  itemId: number;
  produtoId: number;
  descricao: string;
  apresentacao: string;
  codBarras: string;
  quantidade: number;
  custoAtual: number;
  custoAnterior: number;
  variacaoReais: number;
  variacaoPercentual: number;
  variacaoTipo: 'aumento' | 'reducao' | 'estavel' | 'primeira_compra';
  precoVendaAtual: number;
  precoVendaSugerido: number;
  margemAtual: number;
  margemNovaSeManter: number;
  compraAnteriorDetalhes?: {
    data: string;
    nf: string;
    fornecedor: string;
    preco: number;
  } | null;
  faltaId?: string | null;
  faltaInfo?: {
    id: string;
    productName: string;
    type: string;
    clientInquiry: number;
    notes?: string;
    createdAt: string;
    userName: string;
  } | null;
}

export interface NotaEntrada {
  cabNotaId: number;
  notaFiscal: string;
  dataEmissao: string;
  fornecedorId: number;
  fornecedor: string;
  totalNota: number;
  totalItens: number;
  totalFaltasAtendidas: number;
  itens: ItemEntrada[];
}

interface EntradasRelatorioModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onShortagesUpdated?: () => void;
}

export const EntradasRelatorioModal: React.FC<EntradasRelatorioModalProps> = ({
  isOpen,
  onClose,
  user,
  onShortagesUpdated
}) => {
  const { addToast } = useToast();

  const [dias, setDias] = useState<number>(30);
  const [dataInicio, setDataInicio] = useState<string>('');
  const [dataFim, setDataFim] = useState<string>('');
  const [buscaNF, setBuscaNF] = useState<string>('');
  const [termoBuscaItem, setTermoBuscaItem] = useState<string>('');
  
  const [notas, setNotas] = useState<NotaEntrada[]>([]);
  const [totalFaltasGeral, setTotalFaltasGeral] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [expandedNotas, setExpandedNotas] = useState<Record<number, boolean>>({});
  const [isClearingBatch, setIsClearingBatch] = useState<boolean>(false);
  const [clearingItemIds, setClearingItemIds] = useState<Record<string, boolean>>({});

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

  const carregarEntradas = async () => {
    setIsLoading(true);
    try {
      let url = `/api/purchasing/entries?dias=${dias}`;
      if (buscaNF.trim()) {
        url += `&notaFiscal=${encodeURIComponent(buscaNF.trim())}`;
      } else if (dataInicio && dataFim) {
        url += `&dataInicio=${dataInicio}&dataFim=${dataFim}`;
      }

      const res = await fetch(url);
      const data = await res.json();

      if (data.success && Array.isArray(data.notas)) {
        setNotas(data.notas);
        setTotalFaltasGeral(data.totalFaltasAtendidas || 0);

        // Auto-expandir a primeira nota se tiver poucas
        if (data.notas.length > 0) {
          const initExpanded: Record<number, boolean> = {};
          data.notas.forEach((n: NotaEntrada, idx: number) => {
            if (idx === 0 || n.totalFaltasAtendidas > 0) {
              initExpanded[n.cabNotaId] = true;
            }
          });
          setExpandedNotas(initExpanded);
        }
      } else {
        setNotas([]);
        setTotalFaltasGeral(0);
      }
    } catch (err) {
      console.error('Erro ao carregar entradas:', err);
      addToast('Não foi possível carregar o relatório de entradas.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      carregarEntradas();
    }
  }, [isOpen, dias]);

  if (!isOpen) return null;

  const toggleExpand = (cabNotaId: number) => {
    setExpandedNotas(prev => ({
      ...prev,
      [cabNotaId]: !prev[cabNotaId]
    }));
  };

  // Coleta todos os IDs de faltas pendentes presentes nas notas exibidas
  const getAllShortageIds = () => {
    const ids: string[] = [];
    notas.forEach(n => {
      n.itens.forEach(item => {
        if (item.faltaId && !ids.includes(item.faltaId)) {
          ids.push(item.faltaId);
        }
      });
    });
    return ids;
  };

  // Dar baixa em todas as faltas atendidas
  const handleBaixarTodasFaltas = async () => {
    const shortageIds = getAllShortageIds();
    if (shortageIds.length === 0) {
      addToast('Nenhuma falta encontrada para dar baixa.', 'info');
      return;
    }

    setIsClearingBatch(true);
    try {
      const res = await fetch('/api/purchasing/entries/clear-shortages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shortageIds,
          userName: user.name || 'Administrador',
          details: `Baixa em lote de ${shortageIds.length} produtos via Relatório de Entradas`
        })
      });

      const data = await res.json();
      if (data.success) {
        addToast(`✅ ${data.updatedCount} produto(s) marcado(s) como comprado(s) com sucesso!`, 'success');
        if (onShortagesUpdated) onShortagesUpdated();
        carregarEntradas();
      } else {
        addToast(data.message || 'Erro ao dar baixa nas faltas.', 'error');
      }
    } catch (err) {
      console.error('Erro ao dar baixa em faltas:', err);
      addToast('Erro na requisição de baixa.', 'error');
    } finally {
      setIsClearingBatch(false);
    }
  };

  // Dar baixa em falta individual
  const handleBaixarFaltaIndividual = async (shortageId: string, produtoNome: string) => {
    setClearingItemIds(prev => ({ ...prev, [shortageId]: true }));
    try {
      const res = await fetch('/api/purchasing/entries/clear-shortages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shortageIds: [shortageId],
          userName: user.name || 'Administrador',
          details: `Baixa individual de ${produtoNome} via Relatório de Entradas`
        })
      });

      const data = await res.json();
      if (data.success) {
        addToast(`✅ "${produtoNome}" marcado como comprado!`, 'success');
        if (onShortagesUpdated) onShortagesUpdated();
        carregarEntradas();
      } else {
        addToast(data.message || 'Erro ao dar baixa na falta.', 'error');
      }
    } catch (err) {
      console.error('Erro ao dar baixa na falta:', err);
      addToast('Erro na requisição de baixa.', 'error');
    } finally {
      setClearingItemIds(prev => ({ ...prev, [shortageId]: false }));
    }
  };

  // Filtragem de notas por termo de busca de item ou NF
  const filteredNotas = notas.filter(nota => {
    if (!termoBuscaItem.trim()) return true;
    const term = termoBuscaItem.toLowerCase();
    const matchNF = nota.notaFiscal.toLowerCase().includes(term);
    const matchFornecedor = nota.fornecedor.toLowerCase().includes(term);
    const matchItem = nota.itens.some(i => 
      i.descricao.toLowerCase().includes(term) || 
      i.codBarras.includes(term) ||
      i.apresentacao.toLowerCase().includes(term)
    );
    return matchNF || matchFornecedor || matchItem;
  });

  const totalItensPeriodo = notas.reduce((sum, n) => sum + n.totalItens, 0);
  const totalValorPeriodo = notas.reduce((sum, n) => sum + n.totalNota, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-blue-500/10 dark:from-emerald-950/20 dark:via-teal-950/20 dark:to-blue-950/20">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-md text-white">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  Relatório de Entradas & Comparativo de Custos
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Digifarma Live
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Auditoria de notas fiscais de entrada, histórico de custos e baixa inteligente de faltas.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={carregarEntradas}
              disabled={isLoading}
              className="p-2.5 rounded-2xl text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all flex items-center gap-2 text-xs font-bold"
              title="Atualizar dados"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
            <button 
              onClick={onClose}
              className="p-2.5 rounded-2xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Barra de Filtros e Busca */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-wrap gap-4 items-center justify-between">
          {/* Período Rápido */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            {[
              { label: '7 dias', val: 7 },
              { label: '15 dias', val: 15 },
              { label: '30 dias', val: 30 },
              { label: '60 dias', val: 60 }
            ].map(p => (
              <button
                key={p.val}
                onClick={() => {
                  setDias(p.val);
                  setBuscaNF('');
                  setDataInicio('');
                  setDataFim('');
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  dias === p.val && !buscaNF && !dataInicio
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Campo de Busca Rápida por NF / Produto */}
          <div className="flex-1 min-w-[240px] max-w-md relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por produto, código de barras ou NF..."
              value={termoBuscaItem}
              onChange={(e) => setTermoBuscaItem(e.target.value)}
              className="w-full text-xs pl-10 pr-4 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {termoBuscaItem && (
              <button
                onClick={() => setTermoBuscaItem('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Banner de Destaque para Faltas Atendidas */}
        {totalFaltasGeral > 0 && (
          <div className="mx-6 mt-4 p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-emerald-500/15 border border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm animate-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Encontramos <b className="text-amber-600 dark:text-amber-400">{totalFaltasGeral}</b> produto(s) desta(s) nota(s) na sua Lista de Faltas!</span>
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Os produtos que chegaram podem ser marcados como comprados automaticamente agora.
                </p>
              </div>
            </div>

            <button
              onClick={handleBaixarTodasFaltas}
              disabled={isClearingBatch}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs shadow-md hover:shadow-emerald-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shrink-0"
            >
              {isClearingBatch ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Dando baixa...
                </>
              ) : (
                <>
                  <ClipboardCheck className="w-4 h-4" />
                  Dar Baixa em Todas as Faltas ({totalFaltasGeral})
                </>
              )}
            </button>
          </div>
        )}

        {/* Cards Resumo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 pt-4">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Notas de Entrada</div>
            <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{notas.length} NFs</div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Itens Recebidos</div>
            <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{totalItensPeriodo} un</div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Comprado</div>
            <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{formatMoney(totalValorPeriodo)}</div>
          </div>

          <div className="p-3 bg-amber-500/10 dark:bg-amber-950/20 rounded-2xl border border-amber-500/20">
            <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Faltas Atendidas</div>
            <div className="text-lg font-black text-amber-600 dark:text-amber-400 mt-0.5">{totalFaltasGeral} itens</div>
          </div>
        </div>

        {/* Lista de Notas Fiscais e Itens */}
        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar space-y-4">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
              <span className="text-xs font-bold">Consultando notas fiscais no Digifarma...</span>
            </div>
          ) : filteredNotas.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-500">
              <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400">
                <FileText className="w-10 h-10" />
              </div>
              <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">
                Nenhuma nota fiscal encontrada no período.
              </h3>
              <p className="text-xs max-w-sm">
                Tente selecionar outro intervalo de datas ou limpe o termo de busca.
              </p>
            </div>
          ) : (
            filteredNotas.map((nota) => {
              const isExpanded = expandedNotas[nota.cabNotaId];
              const dataFormatada = nota.dataEmissao ? new Date(nota.dataEmissao).toLocaleDateString('pt-BR') : '-';

              return (
                <div
                  key={nota.cabNotaId}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden transition-all"
                >
                  {/* Cabeçalho da Nota */}
                  <div
                    onClick={() => toggleExpand(nota.cabNotaId)}
                    className="p-4 bg-slate-50/80 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800/80 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors select-none"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xs text-slate-700 dark:text-slate-200">
                        <Building2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-black bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-800 dark:text-slate-100">
                            NF: {nota.notaFiscal}
                          </span>
                          <span className="text-xs font-bold text-slate-500">
                            Emissão: {dataFormatada}
                          </span>
                          {nota.totalFaltasAtendidas > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              {nota.totalFaltasAtendidas} falta{nota.totalFaltasAtendidas > 1 ? 's' : ''} nesta NF
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                          {nota.fornecedor}
                        </h4>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 self-end sm:self-center">
                      <div className="text-right">
                        <div className="text-[11px] font-bold text-slate-400">{nota.totalItens} itens</div>
                        <div className="text-sm font-black text-slate-900 dark:text-slate-100">
                          {formatMoney(nota.totalNota)}
                        </div>
                      </div>

                      <div className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </div>
                    </div>
                  </div>

                  {/* Tabela de Itens da Nota */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 dark:border-slate-800 overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                            <th className="py-3 px-4">Produto</th>
                            <th className="py-3 px-4 text-center">Qtd</th>
                            <th className="py-3 px-4 text-right">Custo Desta Nota</th>
                            <th className="py-3 px-4 text-right">Custo Anterior</th>
                            <th className="py-3 px-4 text-center">Variação %</th>
                            <th className="py-3 px-4 text-right">Venda Atual</th>
                            <th className="py-3 px-4 text-right">Venda Sugerida</th>
                            <th className="py-3 px-4 text-center">Lista de Faltas</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                          {nota.itens.map((item) => {
                            const hasFalta = !!item.faltaId;
                            const isClearingThis = item.faltaId ? clearingItemIds[item.faltaId] : false;

                            return (
                              <tr
                                key={item.itemId || item.produtoId}
                                className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors ${
                                  hasFalta ? 'bg-amber-500/5 dark:bg-amber-950/10' : ''
                                }`}
                              >
                                {/* Descrição */}
                                <td className="py-3 px-4 max-w-[280px]">
                                  <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                                    {item.descricao}
                                  </div>
                                  <div className="text-[11px] text-slate-400 truncate">
                                    {item.apresentacao} {item.codBarras ? `• EAN: ${item.codBarras}` : ''}
                                  </div>
                                </td>

                                {/* Quantidade */}
                                <td className="py-3 px-4 text-center font-bold text-slate-700 dark:text-slate-300">
                                  {item.quantidade}
                                </td>

                                {/* Custo Atual */}
                                <td className="py-3 px-4 text-right font-black text-slate-900 dark:text-white">
                                  {formatMoney(item.custoAtual)}
                                </td>

                                {/* Custo Anterior */}
                                <td className="py-3 px-4 text-right text-slate-500 dark:text-slate-400">
                                  {item.custoAnterior > 0 ? (
                                    formatMoney(item.custoAnterior)
                                  ) : (
                                    <span className="text-[10px] text-slate-400 italic">1ª compra</span>
                                  )}
                                </td>

                                {/* Variação % */}
                                <td className="py-3 px-4 text-center">
                                  {item.variacaoTipo === 'aumento' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                                      <TrendingUp className="w-3 h-3" />
                                      +{item.variacaoPercentual}%
                                    </span>
                                  ) : item.variacaoTipo === 'reducao' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                      <TrendingDown className="w-3 h-3" />
                                      {item.variacaoPercentual}%
                                    </span>
                                  ) : item.variacaoTipo === 'primeira_compra' ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                      Novo
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                      Estável
                                    </span>
                                  )}
                                </td>

                                {/* Preço Venda Atual */}
                                <td className="py-3 px-4 text-right font-bold text-slate-700 dark:text-slate-300">
                                  {formatMoney(item.precoVendaAtual)}
                                </td>

                                {/* Preço Venda Sugerido */}
                                <td className="py-3 px-4 text-right font-black text-emerald-600 dark:text-emerald-400">
                                  {formatMoney(item.precoVendaSugerido)}
                                </td>

                                {/* Status Lista de Faltas */}
                                <td className="py-3 px-4 text-center">
                                  {hasFalta ? (
                                    <div className="flex items-center justify-center gap-2">
                                      <button
                                        onClick={() => handleBaixarFaltaIndividual(item.faltaId!, item.descricao)}
                                        disabled={isClearingThis}
                                        className="px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-[10px] shadow-xs active:scale-95 transition-all flex items-center gap-1"
                                        title="Dar baixa nesta falta agora"
                                      >
                                        {isClearingThis ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <Check className="w-3 h-3" />
                                        )}
                                        Baixar Falta
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-slate-300 dark:text-slate-700">-</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between text-xs text-slate-500">
          <div>
            Exibindo <b className="text-slate-800 dark:text-slate-200">{filteredNotas.length}</b> notas fiscais ({totalItensPeriodo} produtos).
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-bold rounded-xl transition-all"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
