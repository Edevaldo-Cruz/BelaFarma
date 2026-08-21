import React, { useState, useEffect } from 'react';
import { 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Package, 
  TrendingDown, 
  Sparkles, 
  X, 
  ChevronRight, 
  Send, 
  Calendar, 
  FileText, 
  ShieldAlert, 
  Filter, 
  DollarSign, 
  Layers, 
  Tag, 
  ArrowRight,
  Loader2,
  Check
} from 'lucide-react';
import { User, UserRole, Task, Boleto, BoletoStatus } from '../types';
import { useToast } from './ToastContext';

export interface MuralProdutoParado {
  id: string;
  user_id: string;
  user_name: string;
  produto_id: number;
  descricao: string;
  cod_barras: string;
  apresentacao: string;
  categoria: 'GENERICO' | 'SIMILAR' | 'MARCA' | 'PERFUMARIA' | string;
  saldo: number;
  preco_venda: number;
  preco_compra: number;
  valor_total_parado: number;
  dias_parado: number;
  data_atribuicao: string;
  status: 'pendente' | 'resolvido' | 'ignorado';
  acao_tomada?: string;
  acao_detalhe?: string;
  data_resolucao?: string;
  resolvido_por?: string;
}

interface MuralModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  tasks?: Task[];
  boletos?: Boleto[];
  pendingReviewCount?: number;
  anvisaAlertCount?: number;
  onNavigate?: (view: string) => void;
  onRefreshPending?: () => void;
}

export const MuralModal: React.FC<MuralModalProps> = ({
  isOpen,
  onClose,
  user,
  tasks = [],
  boletos = [],
  pendingReviewCount = 0,
  anvisaAlertCount = 0,
  onNavigate,
  onRefreshPending
}) => {
  const { addToast } = useToast();
  const isAdmin = user.role === UserRole.ADM;

  const [activeTab, setActiveTab] = useState<'produtos' | 'tarefas' | 'boletos' | 'alertas'>('produtos');
  const [produtos, setProdutos] = useState<MuralProdutoParado[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Estados dos formulários de ação por item
  const [selectedActions, setSelectedActions] = useState<Record<string, string>>({});
  const [customActions, setCustomActions] = useState<Record<string, string>>({});

  const carregarPendencias = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/mural/pendencias?userId=${encodeURIComponent(user.id)}&userName=${encodeURIComponent(user.name)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.produtosParados)) {
        setProdutos(data.produtosParados);
      }
    } catch (err) {
      console.error('Erro ao carregar pendências do mural:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      carregarPendencias();
    }
  }, [isOpen, user.id, user.name]);

  if (!isOpen) return null;

  // Filtrar tarefas pendentes do usuário
  const userPendingTasks = tasks.filter(t => 
    t.status !== 'Concluída' && 
    t.status !== 'Cancelada' && 
    !t.isArchived &&
    (isAdmin || t.assignedUser === user.id || t.creator === user.id)
  );

  // Boletos vencidos / vencendo
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const overdueBoletos = isAdmin ? boletos.filter(b => {
    const dueDate = new Date(b.due_date + 'T00:00:00');
    return b.status === BoletoStatus.PENDENTE && dueDate < now;
  }) : [];

  const handleSelectAction = (itemId: string, actionName: string) => {
    setSelectedActions(prev => ({ ...prev, [itemId]: actionName }));
  };

  const handleCustomActionChange = (itemId: string, text: string) => {
    setCustomActions(prev => ({ ...prev, [itemId]: text }));
  };

  const handleSalvarAcao = async (item: MuralProdutoParado) => {
    const acao = selectedActions[item.id];
    if (!acao) {
      addToast('Selecione uma ação para o produto antes de salvar.', 'error');
      return;
    }

    if (acao === 'Outros' && !customActions[item.id]?.trim()) {
      addToast('Por favor, descreva a ação tomada no campo de texto.', 'error');
      return;
    }

    setSavingId(item.id);
    try {
      const res = await fetch('/api/mural/resolver-produto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          acao_tomada: acao,
          acao_detalhe: acao === 'Outros' ? customActions[item.id]?.trim() : '',
          resolvido_por: user.name
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`✅ Ação registrada: "${acao}" para ${item.descricao}!`, 'success');
        // Remove item da lista local
        setProdutos(prev => prev.filter(p => p.id !== item.id));
        if (onRefreshPending) onRefreshPending();
      } else {
        addToast(data.error || 'Erro ao salvar ação do produto.', 'error');
      }
    } catch (err) {
      console.error('Erro ao resolver produto no mural:', err);
      addToast('Falha na comunicação com o servidor.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  // Regras de exibição de ações por categoria do produto
  const getOpcoesAcoes = (categoria: string) => {
    const catUpper = (categoria || '').toUpperCase();
    const isMedicamentoRestrito = catUpper === 'GENERICO' || catUpper === 'SIMILAR' || catUpper === 'MARCA';

    const acoes = [
      { id: 'Alterar produtos semelhantes', label: 'Alterar produtos semelhantes' },
      { id: 'Diminuir preço', label: 'Diminuir preço' }
    ];

    // Mudar localização: NÃO aparece para Genérico, Similar e Marca/Referência
    if (!isMedicamentoRestrito) {
      acoes.push({ id: 'Mudar localização', label: 'Mudar localização' });
    }

    acoes.push({ id: 'Aumentar a indicação', label: 'Aumentar a indicação' });

    // Anunciar: NÃO aparece para Genérico, Similar e Marca/Referência
    if (!isMedicamentoRestrito) {
      acoes.push({ id: 'Anunciar', label: 'Anunciar' });
    }

    acoes.push({ id: 'Outros', label: 'Outros (especificar)' });

    return acoes;
  };

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

  const getCategoryBadgeClass = (categoria: string) => {
    const cat = (categoria || '').toUpperCase();
    if (cat === 'GENERICO') return 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800';
    if (cat === 'SIMILAR') return 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800';
    if (cat === 'MARCA') return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800';
    if (cat === 'PERFUMARIA') return 'bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-950/40 dark:text-pink-400 dark:border-pink-800';
    return 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  };

  const totalMinhasPendencias = produtos.length + userPendingTasks.length + overdueBoletos.length + pendingReviewCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Top Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 dark:from-amber-950/20 dark:via-orange-950/20 dark:to-red-950/20">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl shadow-md text-white">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  Mural de Pendências
                </h2>
                {totalMinhasPendencias > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-red-500 text-white shadow-sm animate-bounce">
                    {totalMinhasPendencias} pendente{totalMinhasPendencias > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Olá, <span className="font-bold text-slate-700 dark:text-slate-200">{user.name}</span>! Aqui estão suas ações prioritárias para hoje.
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-2.5 rounded-2xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Fechar mural"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas */}
        <div className="px-6 pt-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('produtos')}
            className={`px-4 py-3 text-xs font-bold rounded-t-2xl border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'produtos'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400 bg-white dark:bg-slate-900 shadow-sm'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Package className="w-4 h-4" />
            Produtos Parados (+90d)
            {produtos.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300">
                {produtos.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('tarefas')}
            className={`px-4 py-3 text-xs font-bold rounded-t-2xl border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'tarefas'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400 bg-white dark:bg-slate-900 shadow-sm'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            Tarefas Pendentes
            {userPendingTasks.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                {userPendingTasks.length}
              </span>
            )}
          </button>

          {isAdmin && (
            <button
              onClick={() => setActiveTab('boletos')}
              className={`px-4 py-3 text-xs font-bold rounded-t-2xl border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'boletos'
                  ? 'border-orange-500 text-orange-600 dark:text-orange-400 bg-white dark:bg-slate-900 shadow-sm'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              Boletos Vencidos
              {overdueBoletos.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
                  {overdueBoletos.length}
                </span>
              )}
            </button>
          )}

          <button
            onClick={() => setActiveTab('alertas')}
            className={`px-4 py-3 text-xs font-bold rounded-t-2xl border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'alertas'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400 bg-white dark:bg-slate-900 shadow-sm'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            Alertas & Auditoria
            {(pendingReviewCount > 0 || anvisaAlertCount > 0) && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                {pendingReviewCount + anvisaAlertCount}
              </span>
            )}
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
          
          {/* ABA 1: PRODUTOS PARADOS */}
          {activeTab === 'produtos' && (
            <div>
              <div className="mb-5 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 dark:text-amber-200">
                  <span className="font-black">Rotina Diária Limpa Estoque:</span> Esta lista contém produtos parados há mais de 90 dias sem saída com maior valor acumulado. Escolha uma ação para cada item e clique em <b>Salvar Ação</b>. A lista é acumulativa se não for concluída.
                </div>
              </div>

              {isLoading ? (
                <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                  <span className="text-xs font-bold">Carregando produtos parados...</span>
                </div>
              ) : produtos.length === 0 ? (
                <div className="py-16 text-center flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-500">
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-full text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                    Parabéns! Todas as pendências de produtos foram resolvidas.
                  </h3>
                  <p className="text-xs max-w-md">
                    Você não possui produtos parados pendentes de ação no momento. Nova lista será gerada no próximo dia útil.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {produtos.map((prod) => {
                    const opcoes = getOpcoesAcoes(prod.categoria);
                    const acaoAtual = selectedActions[prod.id] || '';
                    const isOutros = acaoAtual === 'Outros';
                    const isSaving = savingId === prod.id;

                    return (
                      <div 
                        key={prod.id}
                        className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm hover:border-orange-300 dark:hover:border-orange-900/50 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        {/* Info Produto */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider ${getCategoryBadgeClass(prod.categoria)}`}>
                              {prod.categoria || 'Geral'}
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">
                              Cód: {prod.produto_id} {prod.cod_barras ? `| EAN: ${prod.cod_barras}` : ''}
                            </span>
                            <span className="ml-auto md:ml-0 text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-md">
                              +90 dias sem venda
                            </span>
                          </div>

                          <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 truncate">
                            {prod.descricao}
                          </h4>
                          {prod.apresentacao && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {prod.apresentacao}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                            <div>
                              Saldo: <span className="font-bold text-slate-900 dark:text-white">{prod.saldo} un</span>
                            </div>
                            <div className="text-slate-300 dark:text-slate-700">•</div>
                            <div>
                              Preço Venda: <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(prod.preco_venda)}</span>
                            </div>
                            <div className="text-slate-300 dark:text-slate-700">•</div>
                            <div>
                              Valor Total Parado: <span className="font-black text-red-600 dark:text-red-400">{formatMoney(prod.valor_total_parado)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Seletor de Ação e Botão */}
                        <div className="w-full md:w-80 flex flex-col gap-2 shrink-0">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Ação a ser tomada:
                          </label>
                          <select
                            value={acaoAtual}
                            onChange={(e) => handleSelectAction(prod.id, e.target.value)}
                            className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                          >
                            <option value="">Selecione uma ação...</option>
                            {opcoes.map(opt => (
                              <option key={opt.id} value={opt.id}>{opt.label}</option>
                            ))}
                          </select>

                          {isOutros && (
                            <input
                              type="text"
                              placeholder="Descreva a ação tomada..."
                              value={customActions[prod.id] || ''}
                              onChange={(e) => handleCustomActionChange(prod.id, e.target.value)}
                              className="w-full text-xs px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500 animate-in fade-in duration-150"
                            />
                          )}

                          <button
                            onClick={() => handleSalvarAcao(prod)}
                            disabled={!acaoAtual || isSaving}
                            className={`w-full py-2 px-4 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                              !acaoAtual
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                                : 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-md hover:shadow-orange-500/20 active:scale-[0.98]'
                            }`}
                          >
                            {isSaving ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Salvando...
                              </>
                            ) : (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                Salvar Ação
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ABA 2: TAREFAS */}
          {activeTab === 'tarefas' && (
            <div className="space-y-3">
              {userPendingTasks.length === 0 ? (
                <div className="py-16 text-center flex flex-col items-center justify-center gap-2 text-slate-400">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Nenhuma tarefa pendente no momento.</span>
                </div>
              ) : (
                userPendingTasks.map(t => (
                  <div key={t.id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{t.title}</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{t.description}</p>
                      <div className="flex items-center gap-2 mt-2 text-[11px] font-semibold text-slate-400">
                        <span>Prazo: {t.dueDate || 'Sem prazo'}</span>
                        <span>•</span>
                        <span className="text-orange-500">Prioridade: {t.priority}</span>
                      </div>
                    </div>
                    {onNavigate && (
                      <button 
                        onClick={() => { onClose(); onNavigate('agenda'); }}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1"
                      >
                        Ver na Agenda <ChevronRight size={14} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* ABA 3: BOLETOS */}
          {activeTab === 'boletos' && isAdmin && (
            <div className="space-y-3">
              {overdueBoletos.length === 0 ? (
                <div className="py-16 text-center flex flex-col items-center justify-center gap-2 text-slate-400">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Nenhum boleto vencido! Tudo em dia.</span>
                </div>
              ) : (
                overdueBoletos.map(b => (
                  <div key={b.id} className="p-4 rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50/40 dark:bg-red-950/20 flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-red-900 dark:text-red-200">{b.beneficiary || 'Fornecedor'}</h4>
                      <p className="text-xs text-red-700 dark:text-red-400">Vencimento: {b.due_date} • Valor: {formatMoney(b.amount)}</p>
                    </div>
                    {onNavigate && (
                      <button 
                        onClick={() => { onClose(); onNavigate('financial'); }}
                        className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1"
                      >
                        Ver no Financeiro <ChevronRight size={14} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* ABA 4: ALERTAS */}
          {activeTab === 'alertas' && (
            <div className="space-y-3">
              {pendingReviewCount > 0 && (
                <div className="p-4 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20 flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">Revisões de Pedidos & Entregas WhatsApp</h4>
                    <p className="text-xs text-amber-700 dark:text-amber-400">{pendingReviewCount} comprovantes de entrega aguardam sua conferência e baixa.</p>
                  </div>
                  {onNavigate && (
                    <button 
                      onClick={() => { onClose(); onNavigate('deliveries'); }}
                      className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1"
                    >
                      Revisar Agora <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              )}

              {anvisaAlertCount > 0 && (
                <div className="p-4 rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50/40 dark:bg-red-950/20 flex items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-bold text-red-900 dark:text-red-200">Alertas Sanitários ANVISA</h4>
                    <p className="text-xs text-red-700 dark:text-red-400">{anvisaAlertCount} produtos em estoque foram recolhidos ou suspensos por resolução sanitária.</p>
                  </div>
                  {onNavigate && (
                    <button 
                      onClick={() => { onClose(); onNavigate('anvisa-alerts'); }}
                      className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1"
                    >
                      Ver Alertas <ChevronRight size={14} />
                    </button>
                  )}
                </div>
              )}

              {pendingReviewCount === 0 && anvisaAlertCount === 0 && (
                <div className="py-16 text-center flex flex-col items-center justify-center gap-2 text-slate-400">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Nenhum alerta crítico ativo no momento.</span>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 font-medium">
            💡 Dica: Você pode reabrir este mural a qualquer momento clicando no botão do topo.
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black hover:opacity-90 transition-opacity"
          >
            Fechar Mural
          </button>
        </div>

      </div>
    </div>
  );
};
