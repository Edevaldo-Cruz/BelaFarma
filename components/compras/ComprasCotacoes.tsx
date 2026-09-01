import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calculator, 
  Award, 
  TrendingUp, 
  TrendingDown, 
  ShieldAlert, 
  PlusCircle, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  DollarSign, 
  Clock, 
  ChevronRight, 
  ChevronDown, 
  Layers, 
  Sliders, 
  ShoppingBag, 
  UserCheck, 
  Trash2, 
  Send,
  Sparkles,
  Percent,
  X,
  FileText
} from 'lucide-react';
import { Cotacao, CotacaoItem, CotacaoResposta, User } from '../../types';
import { useToast } from '../ToastContext';

interface ComprasCotacoesProps {
  user: User;
  theme: 'light' | 'dark';
  preselectedItems?: CotacaoItem[];
  onNavigateToTab?: (tab: string, preselectedItems?: any[]) => void;
}

export const ComprasCotacoes: React.FC<ComprasCotacoesProps> = ({
  user,
  theme,
  preselectedItems = [],
  onNavigateToTab
}) => {
  const { addToast } = useToast();
  const [cotacoes, setCotacoes] = useState<Cotacao[]>([]);
  const [selectedCotacao, setSelectedCotacao] = useState<Cotacao | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal: Nova Cotação
  const [isNovaCotacaoModalOpen, setIsNovaCotacaoModalOpen] = useState(false);
  const [novoTitulo, setNovoTitulo] = useState('');
  const [itensNovaCotacao, setItensNovaCotacao] = useState<CotacaoItem[]>([]);
  const [itemTemp, setItemTemp] = useState<{ produtoId: number; descricao: string; ean: string; quantidade: number }>({
    produtoId: 0,
    descricao: '',
    ean: '',
    quantidade: 10
  });

  // Modal: Registrar Resposta de Fornecedor
  const [isRespostaModalOpen, setIsRespostaModalOpen] = useState(false);
  const [respostaForm, setRespostaForm] = useState({
    fornecedorNome: '',
    fornecedorId: '',
    precoLiquido: 0,
    prazoDias: 28,
    condicaoPagamento: '28/35/42 dias',
    bonificacaoTexto: '',
    pontualidadeScore: 85,
    taxaQuebraPercent: 0,
    pedidoMinimoAtingido: true,
    valorTotalCotado: 0
  });

  // Modal: Quebra de Fornecedor
  const [isQuebraModalOpen, setIsQuebraModalOpen] = useState(false);
  const [quebraFornecedorId, setQuebraFornecedorId] = useState<string>('');
  const [quebraMotivo, setQuebraMotivo] = useState<string>('Falta no estoque da distribuidora');

  // Modal: Otimizador de Pedido Mínimo
  const [isOtimizacaoModalOpen, setIsOtimizacaoModalOpen] = useState(false);
  const [otimizacaoResultado, setOtimizacaoResultado] = useState<any>(null);

  const carregarCotacoes = async (cotacaoIdToSelect?: string) => {
    try {
      setLoading(true);
      const res = await fetch('/api/central-compras/cotacoes');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setCotacoes(data.data);
          if (data.data.length > 0) {
            const target = cotacaoIdToSelect 
              ? data.data.find((c: Cotacao) => c.id === cotacaoIdToSelect) 
              : selectedCotacao ? data.data.find((c: Cotacao) => c.id === selectedCotacao.id) : data.data[0];
            setSelectedCotacao(target || data.data[0]);
          }
        }
      }
    } catch (err: any) {
      addToast('Erro ao carregar cotações: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarCotacoes();
  }, []);

  // Preenche itens se recebidos de outra aba (ex: Dashboard ou Mineração)
  useEffect(() => {
    if (preselectedItems && preselectedItems.length > 0) {
      setItensNovaCotacao(preselectedItems);
      setNovoTitulo(`Cotação Faltas ${new Date().toLocaleDateString('pt-BR')}`);
      setIsNovaCotacaoModalOpen(true);
    }
  }, [preselectedItems]);

  const handleAddItemNovaCotacao = () => {
    if (!itemTemp.descricao.trim()) {
      addToast('Informe o nome do medicamento.', 'warning');
      return;
    }
    setItensNovaCotacao(prev => [...prev, { ...itemTemp }]);
    setItemTemp({ produtoId: 0, descricao: '', ean: '', quantidade: 10 });
  };

  const handleRemoveItemNovaCotacao = (index: number) => {
    setItensNovaCotacao(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleCriarCotacao = async () => {
    if (itensNovaCotacao.length === 0) {
      addToast('Adicione ao menos um produto para cotar.', 'warning');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch('/api/central-compras/cotacoes/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: novoTitulo || `Cotação ${new Date().toLocaleDateString('pt-BR')}`,
          itens: itensNovaCotacao,
          criadoPor: user.name,
          enfileirarAprovacao: true
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addToast('✅ Cotação criada com sucesso! Solicitações geradas e enviadas para a Fila de Aprovação.', 'success');
        setIsNovaCotacaoModalOpen(false);
        setItensNovaCotacao([]);
        setNovoTitulo('');
        carregarCotacoes(data.data?.cotacao?.id);
      } else {
        addToast('Erro ao criar cotação: ' + (data.error || 'Falha no servidor'), 'error');
      }
    } catch (err: any) {
      addToast('Falha na comunicação: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRegistrarResposta = async () => {
    if (!selectedCotacao) return;
    if (!respostaForm.fornecedorNome.trim() || respostaForm.precoLiquido <= 0) {
      addToast('Informe a distribuidora e o preço líquido válido.', 'warning');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`/api/central-compras/cotacoes/${selectedCotacao.id}/respostas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...respostaForm,
          valorTotalCotado: respostaForm.valorTotalCotado || (respostaForm.precoLiquido * (selectedCotacao.itens?.length || 1) * 10)
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addToast('✅ Resposta de fornecedor gravada e Ranking Ponderado recalculado!', 'success');
        setIsRespostaModalOpen(false);
        setRespostaForm({
          fornecedorNome: '',
          fornecedorId: '',
          precoLiquido: 0,
          prazoDias: 28,
          condicaoPagamento: '28/35/42 dias',
          bonificacaoTexto: '',
          pontualidadeScore: 85,
          taxaQuebraPercent: 0,
          pedidoMinimoAtingido: true,
          valorTotalCotado: 0
        });
        carregarCotacoes(selectedCotacao.id);
      } else {
        addToast('Erro ao registrar resposta: ' + (data.error || 'Falha no servidor'), 'error');
      }
    } catch (err: any) {
      addToast('Falha na comunicação: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTratarQuebra = async () => {
    if (!selectedCotacao || !quebraFornecedorId) return;

    try {
      setSaving(true);
      const res = await fetch(`/api/central-compras/cotacoes/${selectedCotacao.id}/quebra`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fornecedorId: quebraFornecedorId,
          motivo: quebraMotivo
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addToast('✅ Quebra processada! Itens reatribuídos para o 2º colocado global no ranking.', 'success');
        setIsQuebraModalOpen(false);
        carregarCotacoes(selectedCotacao.id);
      } else {
        addToast('Erro ao registrar quebra: ' + (data.error || 'Falha no servidor'), 'error');
      }
    } catch (err: any) {
      addToast('Falha na comunicação: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleGerarPedidoFormal = (respostaVencedora: CotacaoResposta) => {
    if (!selectedCotacao) return;

    if (onNavigateToTab) {
      onNavigateToTab('pedidos', [{
        cotacaoId: selectedCotacao.id,
        fornecedorId: respostaVencedora.fornecedorId,
        distribuidora: respostaVencedora.fornecedorNome,
        condicaoPagamento: respostaVencedora.condicaoPagamento || '28/35/42 dias',
        previsaoEntrega: '2 dias úteis',
        itens: (selectedCotacao.itens || []).map(it => ({
          codigoDigifarma: it.produtoId,
          ean: it.ean,
          descricao: it.descricao,
          quantidade: it.quantidade,
          precoUnitario: respostaVencedora.precoLiquido,
          subtotal: it.quantidade * respostaVencedora.precoLiquido
        }))
      }]);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Topo com Botão Nova Cotação e Informações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400">
              <Calculator className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">
              Central de Cotações & Ranking Ponderado
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Algoritmo de Score: <b>60% Menor Preço Líquido</b> + <b>25% Prazo de Pagamento</b> + <b>15% Histórico & Confiabilidade</b>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={async () => {
              try {
                setLoading(true);
                const res = await fetch('/api/central-compras/cotacoes/gerar-criticos', { method: 'POST' });
                const data = await res.json();
                if (res.ok && data.success) {
                  addToast('✅ Cotação com produtos críticos gerada com sucesso!', 'success');
                  carregarCotacoes(data.data?.id);
                } else {
                  addToast('Aviso: ' + (data.message || data.error || 'Falha ao gerar'), 'warning');
                }
              } catch (e: any) {
                addToast('Erro: ' + e.message, 'error');
              } finally {
                setLoading(false);
              }
            }}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-black uppercase tracking-wider shadow-md transition-all cursor-pointer active:scale-95"
          >
            <Sparkles className="w-4 h-4" />
            Cotar Faltas Críticas (Auto)
          </button>

          <button
            onClick={() => {
              setItensNovaCotacao([]);
              setNovoTitulo(`Cotação ${new Date().toLocaleDateString('pt-BR')}`);
              setIsNovaCotacaoModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider shadow-md transition-all cursor-pointer active:scale-95"
          >
            <PlusCircle className="w-4 h-4" />
            Nova Cotação
          </button>
        </div>
      </div>

      {/* Grid de Cotações (Lista Lateral + Detalhes Central) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna 1: Lista de Cotações */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">
              Cotações em Andamento ({cotacoes.length})
            </span>
            <button 
              onClick={() => carregarCotacoes()}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              title="Atualizar lista"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {cotacoes.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 text-xs font-bold space-y-3">
              <p>Nenhuma cotação criada ainda.</p>
              <button
                onClick={async () => {
                  try {
                    setLoading(true);
                    const res = await fetch('/api/central-compras/cotacoes/gerar-criticos', { method: 'POST' });
                    const data = await res.json();
                    if (res.ok && data.success) {
                      addToast('✅ Cotação gerada com sucesso!', 'success');
                      carregarCotacoes(data.data?.id);
                    }
                  } catch (e) {} finally { setLoading(false); }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-black uppercase"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Gerar com Faltas do Estoque
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {cotacoes.map(c => {
                const isSelected = selectedCotacao?.id === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCotacao(c)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-red-500 bg-red-50/60 dark:bg-red-950/30 shadow-sm'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-black text-slate-900 dark:text-white line-clamp-1">
                        {c.titulo}
                      </h4>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                        c.status === 'aberta' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' :
                        c.status === 'finalizada' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' :
                        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {c.status}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{c.itens?.length || 0} itens cotados</span>
                      <span>{c.respostas?.length || 0} propostas</span>
                    </div>

                    <div className="mt-1 text-[10px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(c.dataAbertura).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Coluna 2 e 3: Detalhes da Cotação & Ranking Ponderado */}
        <div className="lg:col-span-2 space-y-6">
          {selectedCotacao ? (
            <>
              {/* Header do Detalhe da Cotação */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    {selectedCotacao.titulo}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    ID: {selectedCotacao.id} • Criado por: {selectedCotacao.criadoPor} • Data: {new Date(selectedCotacao.dataAbertura).toLocaleDateString('pt-BR')}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsRespostaModalOpen(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Lançar Resposta
                  </button>

                  <button
                    onClick={() => setIsQuebraModalOpen(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    Registrar Quebra
                  </button>
                </div>
              </div>

              {/* Matriz de Ranking Ponderado de Fornecedores */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-amber-500" />
                    Matriz de Ranking Ponderado de Fornecedores
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">
                    Ordenação por Score Total
                  </span>
                </div>

                {(!selectedCotacao.respostas || selectedCotacao.respostas.length === 0) ? (
                  <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                    Aguardando respostas das distribuidoras no WhatsApp. Clique em "Lançar Resposta" para simular ou cadastrar preços recebidos.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedCotacao.respostas.map((resp, idx) => {
                      const ehOuro = idx === 0;
                      const ehPrata = idx === 1;
                      const ehBronze = idx === 2;

                      return (
                        <div
                          key={resp.id}
                          className={`p-4 rounded-2xl border transition-all ${
                            ehOuro 
                              ? 'border-amber-400/80 bg-gradient-to-r from-amber-50/60 to-orange-50/40 dark:from-amber-950/40 dark:to-orange-950/20 shadow-md ring-1 ring-amber-400/50' 
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            {/* Posicionamento & Nome */}
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 shadow-sm ${
                                ehOuro ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white text-base' :
                                ehPrata ? 'bg-slate-300 text-slate-800' :
                                ehBronze ? 'bg-amber-800 text-white' :
                                'bg-slate-100 dark:bg-slate-800 text-slate-500'
                              }`}>
                                {idx + 1}º
                              </div>

                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-black text-slate-900 dark:text-white">
                                    {resp.fornecedorNome}
                                  </span>
                                  {ehOuro && (
                                    <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 text-[10px] font-black uppercase tracking-wider">
                                      🥇 Vencedor Recomendado
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-slate-400 font-medium block">
                                  Condição: {resp.condicaoPagamento || `${resp.prazoDias} dias`} {resp.bonificacaoTexto ? `• ${resp.bonificacaoTexto}` : ''}
                                </span>
                              </div>
                            </div>

                            {/* Scores e Preço */}
                            <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 pt-2 md:pt-0 border-slate-100 dark:border-slate-800">
                              <div className="text-right">
                                <span className="text-[10px] font-bold text-slate-400 block">Preço Líquido:</span>
                                <span className="text-base font-black text-slate-900 dark:text-white">
                                  R$ {resp.precoLiquido?.toFixed(2)}
                                </span>
                              </div>

                              <div className="text-right">
                                <span className="text-[10px] font-bold text-slate-400 block">Score Geral:</span>
                                <span className="text-base font-black text-red-600 dark:text-red-400">
                                  {resp.scoreTotal?.toFixed(1) || '0.0'} pts
                                </span>
                              </div>

                              {ehOuro && (
                                <button
                                  onClick={() => handleGerarPedidoFormal(resp)}
                                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white text-xs font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer"
                                >
                                  <ShoppingBag className="w-3.5 h-3.5" />
                                  Gerar Pedido
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Detalhamento dos Critérios Ponderados */}
                          <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-3 gap-2 text-[10px]">
                            <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                              <span className="text-slate-400 font-bold block">Preço (60%):</span>
                              <span className="font-black text-slate-800 dark:text-slate-200">
                                {resp.scorePreco?.toFixed(1) || '100'} pts
                              </span>
                            </div>
                            <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                              <span className="text-slate-400 font-bold block">Prazo (25%):</span>
                              <span className="font-black text-slate-800 dark:text-slate-200">
                                {resp.scorePrazo?.toFixed(1) || '80'} pts
                              </span>
                            </div>
                            <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                              <span className="text-slate-400 font-bold block">Histórico (15%):</span>
                              <span className="font-black text-slate-800 dark:text-slate-200">
                                {resp.scoreHistorico?.toFixed(1) || '90'} pts
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Itens Solicitados na Cotação */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Grade de Medicamentos Cotados ({selectedCotacao.itens?.length || 0} itens)
                </span>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(selectedCotacao.itens || []).map((it, idx) => (
                    <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-black text-slate-800 dark:text-slate-200 block">
                          {it.descricao}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {it.ean ? `EAN: ${it.ean} • ` : ''} Código: #{it.produtoId || 'N/A'}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                        {it.quantidade} un
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 font-bold">
              Selecione uma cotação na lista lateral para ver os rankings e itens.
            </div>
          )}
        </div>
      </div>

      {/* Modal: Nova Cotação */}
      {isNovaCotacaoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl p-6 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 rounded-2xl">
                  <Calculator className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    Criar Nova Solicitação de Cotação
                  </h3>
                  <p className="text-xs text-slate-400 font-bold">
                    Os pedidos de cotação serão gerados e encaminhados para a Fila de Aprovação
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsNovaCotacaoModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">
                  Título da Cotação
                </label>
                <input
                  type="text"
                  value={novoTitulo}
                  onChange={(e) => setNovoTitulo(e.target.value)}
                  placeholder="Ex: Cotação Faltas e Rupturas - Segunda Feira"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white"
                />
              </div>

              {/* Formulário de Adição de Item */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <span className="text-xs font-black uppercase text-slate-600 dark:text-slate-300 block">
                  Adicionar Item à Cotação
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      placeholder="Nome / Descrição do medicamento"
                      value={itemTemp.descricao}
                      onChange={(e) => setItemTemp(p => ({ ...p, descricao: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="EAN (opcional)"
                      value={itemTemp.ean}
                      onChange={(e) => setItemTemp(p => ({ ...p, ean: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="1"
                      placeholder="Qtd"
                      value={itemTemp.quantidade}
                      onChange={(e) => setItemTemp(p => ({ ...p, quantidade: parseInt(e.target.value, 10) || 1 }))}
                      className="w-20 px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-center text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={handleAddItemNovaCotacao}
                      className="flex-1 px-3 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-black uppercase cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              {/* Lista de Itens Adicionados */}
              <div className="space-y-2">
                <span className="text-xs font-black uppercase text-slate-400 block">
                  Itens Selecionados ({itensNovaCotacao.length})
                </span>

                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {itensNovaCotacao.map((it, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs">
                      <div>
                        <span className="font-black text-slate-800 dark:text-slate-200 block">{it.descricao}</span>
                        <span className="text-[10px] text-slate-400">{it.ean ? `EAN: ${it.ean} • ` : ''}Qtd: {it.quantidade} un</span>
                      </div>
                      <button
                        onClick={() => handleRemoveItemNovaCotacao(idx)}
                        className="p-1 text-red-500 hover:text-red-700 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setIsNovaCotacaoModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black uppercase text-slate-600 dark:text-slate-400 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleCriarCotacao}
                disabled={saving || itensNovaCotacao.length === 0}
                className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Gerar e Enviar para Fila de Aprovação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Lançar Resposta de Fornecedor */}
      {isRespostaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              Registrar Resposta de Distribuidora
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Distribuidora / Fornecedor
                </label>
                <input
                  type="text"
                  placeholder="Ex: Santa Cruz, Profarma, GAM, Panpharma"
                  value={respostaForm.fornecedorNome}
                  onChange={(e) => setRespostaForm(p => ({ ...p, fornecedorNome: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Preço Líquido (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={respostaForm.precoLiquido}
                    onChange={(e) => setRespostaForm(p => ({ ...p, precoLiquido: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-black"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Prazo em Dias
                  </label>
                  <input
                    type="number"
                    value={respostaForm.prazoDias}
                    onChange={(e) => setRespostaForm(p => ({ ...p, prazoDias: parseInt(e.target.value, 10) || 28 }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Condição de Pagamento
                </label>
                <input
                  type="text"
                  placeholder="Ex: 28/35/42 dias boleto, à vista"
                  value={respostaForm.condicaoPagamento}
                  onChange={(e) => setRespostaForm(p => ({ ...p, condicaoPagamento: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Bonificação (se houver)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Compre 10 Ganhe 2"
                  value={respostaForm.bonificacaoTexto}
                  onChange={(e) => setRespostaForm(p => ({ ...p, bonificacaoTexto: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4">
              <button
                onClick={() => setIsRespostaModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black uppercase text-slate-600 dark:text-slate-400"
              >
                Cancelar
              </button>
              <button
                onClick={handleRegistrarResposta}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Salvar Resposta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Tratar Quebra */}
      {isQuebraModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400 rounded-2xl">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Registrar Quebra de Fornecedor
                </h3>
                <p className="text-xs text-slate-400 font-bold">
                  Reatribui automaticamente os itens para o 2º colocado no ranking
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Selecione o Fornecedor que Falhou
                </label>
                <select
                  value={quebraFornecedorId}
                  onChange={(e) => setQuebraFornecedorId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="">Selecione...</option>
                  {(selectedCotacao?.respostas || []).map(r => (
                    <option key={r.id} value={r.fornecedorId || r.id}>
                      {r.fornecedorNome} (R$ {r.precoLiquido?.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Motivo da Quebra / Falta
                </label>
                <input
                  type="text"
                  value={quebraMotivo}
                  onChange={(e) => setQuebraMotivo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4">
              <button
                onClick={() => setIsQuebraModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black uppercase text-slate-600 dark:text-slate-400"
              >
                Cancelar
              </button>
              <button
                onClick={handleTratarQuebra}
                disabled={saving || !quebraFornecedorId}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                Reatribuir para o 2º Lugar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
