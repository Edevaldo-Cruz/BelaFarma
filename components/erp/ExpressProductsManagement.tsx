import React, { useState, useEffect, useCallback } from 'react';
import { 
  Tag, 
  Search, 
  Plus, 
  Pencil, 
  Trash2, 
  RefreshCw, 
  UploadCloud, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ArrowLeft,
  X,
  ExternalLink,
  ShieldCheck,
  Package
} from 'lucide-react';
import { useToast } from '../ToastContext';
import { User } from '../../types';

export interface ExpressTask {
  id: number;
  product_code: string;
  barcode_read: string;
  product_name: string;
  sale_price: number;
  cost_price: number;
  ncm_provisional: string;
  ncm_definitive?: string | null;
  cest_definitive?: string | null;
  category: string;
  status: 'PENDENTE' | 'SANEADO' | 'IGNORADO';
  digifarma_synced: number;
  digifarma_product_id?: number | null;
  sale_id?: string | null;
  created_at: string;
  updated_at: string;
  validated_at?: string | null;
  validated_by?: string | null;
  notes?: string | null;
}

interface ExpressProductsManagementProps {
  user?: User;
  onNavigate?: (view: string) => void;
}

export const ExpressProductsManagement: React.FC<ExpressProductsManagementProps> = ({ user, onNavigate }) => {
  const { addToast } = useToast();

  const [tasks, setTasks] = useState<ExpressTask[]>([]);
  const [summary, setSummary] = useState<{ total: number; pendentes: number; saneados: number }>({
    total: 0,
    pendentes: 0,
    saneados: 0
  });
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'PENDENTE' | 'SANEADO'>('TODOS');

  // Modal de Edição / Saneamento e Envio ao Digifarma
  const [editingTask, setEditingTask] = useState<ExpressTask | null>(null);
  const [editName, setEditName] = useState('');
  const [editBarcode, setEditBarcode] = useState('');
  const [editSalePrice, setEditSalePrice] = useState<number>(0);
  const [editCostPrice, setEditCostPrice] = useState<number>(0);
  const [editNcm, setEditNcm] = useState('');
  const [editCest, setEditCest] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [syncToDigifarma, setSyncToDigifarma] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal de Novo Produto Expresso
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBarcode, setNewBarcode] = useState('');
  const [newSalePrice, setNewSalePrice] = useState<number>(0);
  const [newCategory, setNewCategory] = useState<'cosmetico' | 'acessorio' | 'medicamento'>('cosmetico');

  // Modal de Exclusão
  const [deletingTask, setDeletingTask] = useState<ExpressTask | null>(null);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const qParam = encodeURIComponent(searchQuery.trim());
      const res = await fetch(`/api/erp/sanitization/tasks?status=${statusFilter}&q=${qParam}&limit=300`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.tasks)) {
          setTasks(json.tasks);
        }
      }

      // Busca resumo
      const resSum = await fetch('/api/erp/sanitization/tasks/summary');
      if (resSum.ok) {
        const sumJson = await resSum.json();
        if (sumJson.success && sumJson.summary) {
          setSummary(sumJson.summary);
        }
      }
    } catch (err: any) {
      addToast('Erro ao carregar lista de produtos expressos.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, statusFilter, addToast]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Abre modal de edição
  const handleOpenEdit = (task: ExpressTask) => {
    setEditingTask(task);
    setEditName(task.product_name);
    setEditBarcode(task.barcode_read || '');
    setEditSalePrice(task.sale_price);
    setEditCostPrice(task.cost_price || 0);
    setEditNcm(task.ncm_definitive || task.ncm_provisional || '');
    setEditCest(task.cest_definitive || '');
    setEditCategory(task.category || 'Geral');
    setSyncToDigifarma(task.status === 'PENDENTE');
  };

  // Salva edição e opcionalmente grava no Digifarma
  const handleSaveEdit = async () => {
    if (!editingTask) return;
    if (!editName.trim()) {
      addToast('O nome do produto é obrigatório.', 'warning');
      return;
    }
    if (editSalePrice <= 0) {
      addToast('O preço de venda deve ser maior que zero.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      if (syncToDigifarma) {
        // Envia para o endpoint de saneamento com inserção no Digifarma
        const cleanNcm = editNcm.replace(/\D/g, '');
        if (cleanNcm.length !== 8) {
          addToast('Para cadastrar no Digifarma, informe um NCM válido de 8 dígitos.', 'warning');
          setIsSubmitting(false);
          return;
        }

        const res = await fetch(`/api/erp/sanitization/tasks/${editingTask.id}/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_name: editName.trim().toUpperCase(),
            sale_price: editSalePrice,
            cost_price: editCostPrice,
            ncm_definitive: cleanNcm,
            cest_definitive: editCest.replace(/\D/g, '') || null,
            sync_to_digifarma: true,
            user_name: user?.name || 'Gerente'
          })
        });

        const json = await res.json();
        if (res.ok && json.success) {
          if (json.digifarma?.success) {
            addToast(`✅ Produto #${json.product_code} cadastrado no Digifarma com ID ${json.digifarma.digifarma_product_id}!`, 'success', 5000);
          } else {
            addToast(`⚠️ Salvo no ERP Belinha, mas falhou no Digifarma: ${json.digifarma?.error || 'Erro'}`, 'warning', 6000);
          }
          setEditingTask(null);
          fetchTasks();
        } else {
          addToast(json.error || 'Erro ao cadastrar no Digifarma.', 'error');
        }
      } else {
        // Atualização simples no SQLite
        const res = await fetch(`/api/erp/sanitization/tasks/${editingTask.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_name: editName.trim().toUpperCase(),
            barcode_read: editBarcode.trim(),
            sale_price: editSalePrice,
            cost_price: editCostPrice,
            ncm_definitive: editNcm.replace(/\D/g, '') || null,
            cest_definitive: editCest.replace(/\D/g, '') || null,
            category: editCategory
          })
        });

        const json = await res.json();
        if (res.ok && json.success) {
          addToast('✅ Produto expresso atualizado com sucesso!', 'success');
          setEditingTask(null);
          fetchTasks();
        } else {
          addToast(json.error || 'Erro ao atualizar dados.', 'error');
        }
      }
    } catch (err: any) {
      addToast('Erro na requisição: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cadastra novo produto expresso
  const handleCreateNew = async () => {
    if (!newName.trim()) {
      addToast('Informe a descrição do produto.', 'warning');
      return;
    }
    if (newSalePrice <= 0) {
      addToast('O preço de venda deve ser maior que zero.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/erp/sanitization/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim().toUpperCase(),
          sale_price: newSalePrice,
          barcode_read: newBarcode.trim(),
          category: newCategory,
          user_name: user?.name || 'Caixa'
        })
      });

      const json = await res.json();
      if (res.ok && json.success) {
        addToast(`✅ Produto provisório criado com código ${json.product?.code}!`, 'success', 4000);
        setIsNewModalOpen(false);
        setNewName('');
        setNewBarcode('');
        setNewSalePrice(0);
        fetchTasks();
      } else {
        addToast(json.error || 'Erro ao criar produto expresso.', 'error');
      }
    } catch (e: any) {
      addToast('Erro ao criar: ' + e.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirma exclusão
  const handleConfirmDelete = async () => {
    if (!deletingTask) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/erp/sanitization/tasks/${deletingTask.id}`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (res.ok && json.success) {
        addToast('🗑️ Produto provisório excluído com sucesso!', 'info');
        setDeletingTask(null);
        fetchTasks();
      } else {
        addToast(json.error || 'Erro ao excluir.', 'error');
      }
    } catch (e: any) {
      addToast('Erro na exclusão: ' + e.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-3 sm:p-5 overflow-y-auto">
      {/* 1. CABEÇALHO */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm mb-4">
        <div>
          <div className="flex items-center gap-2">
            {onNavigate && (
              <button
                onClick={() => onNavigate('belinha-pdv')}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 transition-colors mr-1 cursor-pointer"
                title="Voltar ao Caixa / PDV"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <Tag className="w-6 h-6 text-emerald-600" />
              Produtos Bipados & Cadastrados no PDV
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Itens que não estavam no Digifarma e foram incluídos no balcão do PDV Belinha para validação e cadastro definitivo
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onNavigate && (
            <button
              onClick={() => onNavigate('belinha-pdv')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <Package className="w-4 h-4" />
              <span>Ir ao PDV</span>
            </button>
          )}

          <button
            onClick={() => setIsNewModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Cadastro Expresso</span>
          </button>

          <button
            onClick={fetchTasks}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* 2. CARDS DE INDICADORES */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase text-slate-400">Total Bipados no PDV</p>
            <p className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-0.5">
              {summary.total}
            </p>
            <p className="text-[10px] text-slate-500 font-bold mt-0.5">Itens provisórios cadastrados</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center font-bold">
            <Tag className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/40 rounded-2xl p-3.5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400">Pendentes no Digifarma</p>
            <p className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400 mt-0.5">
              {summary.pendentes}
            </p>
            <p className="text-[10px] text-amber-600/80 font-bold mt-0.5">Aguardando cadastro no Firebird</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/40 rounded-2xl p-3.5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">Integrados no Digifarma</p>
            <p className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
              {summary.saneados}
            </p>
            <p className="text-[10px] text-emerald-600/80 font-bold mt-0.5">Já possuem PRODUTO_ID definitivo</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. FILTROS E BUSCA */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Abas de Status */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setStatusFilter('TODOS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'TODOS'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Todos ({summary.total})
          </button>
          <button
            onClick={() => setStatusFilter('PENDENTE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'PENDENTE'
                ? 'bg-amber-500 text-slate-950 shadow-sm font-black'
                : 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Pendentes ({summary.pendentes})
          </button>
          <button
            onClick={() => setStatusFilter('SANEADO')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'SANEADO'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Integrados ({summary.saneados})
          </button>
        </div>

        {/* Input de Busca */}
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por descrição, código ou EAN..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* 4. TABELA DE ALTA DENSIDADE (DIRETRIZ UI/UX) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 font-mono">
                <th className="py-2.5 px-3 whitespace-nowrap w-24">Status</th>
                <th className="py-2.5 px-3 whitespace-nowrap w-36">Cód. / EAN</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Descrição do Produto</th>
                <th className="py-2.5 px-3 whitespace-nowrap w-32">Categoria</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right w-24">Preço (R$)</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-right w-24">Custo (R$)</th>
                <th className="py-2.5 px-3 whitespace-nowrap w-28">NCM</th>
                <th className="py-2.5 px-3 whitespace-nowrap w-36">Data / Hora</th>
                <th className="py-2.5 px-3 whitespace-nowrap text-center w-28">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-sans">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-500" />
                    Carregando produtos cadastrados no PDV...
                  </td>
                </tr>
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-sans">
                    Nenhum produto provisório encontrado {statusFilter !== 'TODOS' ? `no filtro "${statusFilter}"` : ''}.
                  </td>
                </tr>
              ) : (
                tasks.map((t) => {
                  const isPendente = t.status === 'PENDENTE';
                  const isSaneado = t.status === 'SANEADO';
                  return (
                    <tr 
                      key={t.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                    >
                      {/* Status */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        {isPendente ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60">
                            <Clock className="w-3 h-3" />
                            Pendente
                          </span>
                        ) : isSaneado ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60">
                            <CheckCircle2 className="w-3 h-3" />
                            Digi #{t.digifarma_product_id || 'OK'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-600 border border-slate-300">
                            Ignorado
                          </span>
                        )}
                      </td>

                      {/* Código / EAN em 1 linha compacta */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-[11px]">
                          <strong className="text-slate-900 dark:text-white font-bold">{t.product_code}</strong>
                          {t.barcode_read && t.barcode_read !== t.product_code && (
                            <span className="text-[10px] text-slate-400">| {t.barcode_read}</span>
                          )}
                        </div>
                      </td>

                      {/* Descrição */}
                      <td className="py-2 px-3 font-sans">
                        <div className="font-bold text-slate-900 dark:text-white truncate max-w-md group-hover:text-emerald-600 transition-colors">
                          {t.product_name}
                        </div>
                      </td>

                      {/* Categoria */}
                      <td className="py-2 px-3 whitespace-nowrap text-slate-500 text-[11px] font-sans truncate max-w-[130px]">
                        {t.category || 'Geral'}
                      </td>

                      {/* Preço de Venda */}
                      <td className="py-2 px-3 whitespace-nowrap text-right font-black text-emerald-600 dark:text-emerald-400">
                        R$ {t.sale_price.toFixed(2)}
                      </td>

                      {/* Preço de Custo */}
                      <td className="py-2 px-3 whitespace-nowrap text-right text-slate-500 font-bold">
                        R$ {(t.cost_price || 0).toFixed(2)}
                      </td>

                      {/* NCM */}
                      <td className="py-2 px-3 whitespace-nowrap text-[11px] text-slate-500">
                        {t.ncm_definitive || t.ncm_provisional || '-'}
                      </td>

                      {/* Data / Hora */}
                      <td className="py-2 px-3 whitespace-nowrap text-[11px] text-slate-400">
                        {t.created_at ? new Date(t.created_at).toLocaleString('pt-BR') : '-'}
                      </td>

                      {/* Ações Enxutas por Ícone (Diretriz UI/UX) */}
                      <td className="py-2 px-3 whitespace-nowrap text-center">
                        <div className="inline-flex items-center gap-1">
                          {isPendente && (
                            <button
                              onClick={() => handleOpenEdit(t)}
                              className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60 transition-colors cursor-pointer"
                              title="Cadastrar Definitivo no Digifarma (Firebird)"
                            >
                              <UploadCloud className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => handleOpenEdit(t)}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                            title="Editar Dados do Produto"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setDeletingTask(t)}
                            className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-700 dark:text-rose-300 transition-colors cursor-pointer"
                            title="Excluir Produto Provisório"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: EDITAR / CADASTRAR NO DIGIFARMA */}
      {/* ========================================================================= */}
      {editingTask && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                  <UploadCloud className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    {syncToDigifarma ? 'Cadastrar Produto no Digifarma' : 'Editar Produto Expresso'}
                  </h3>
                  <p className="text-xs text-slate-500">Código Provisório: #{editingTask.product_code}</p>
                </div>
              </div>
              <button 
                onClick={() => setEditingTask(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição Completa do Produto:
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Código de Barras (EAN):
                  </label>
                  <input
                    type="text"
                    value={editBarcode}
                    onChange={(e) => setEditBarcode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Categoria:
                  </label>
                  <input
                    type="text"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Preço de Venda (R$):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editSalePrice}
                    onChange={(e) => setEditSalePrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-black font-mono text-emerald-600 dark:text-emerald-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Preço de Custo (R$):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={editCostPrice}
                    onChange={(e) => setEditCostPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    NCM (8 dígitos):
                  </label>
                  <input
                    type="text"
                    maxLength={8}
                    value={editNcm}
                    onChange={(e) => setEditNcm(e.target.value.replace(/\D/g, ''))}
                    placeholder="Ex: 33049990"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    CEST (Opcional):
                  </label>
                  <input
                    type="text"
                    maxLength={7}
                    value={editCest}
                    onChange={(e) => setEditCest(e.target.value.replace(/\D/g, ''))}
                    placeholder="Ex: 2000100"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Opção de Sincronizar com o Digifarma */}
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/60 mt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncToDigifarma}
                    onChange={(e) => setSyncToDigifarma(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-0"
                  />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white block">
                      Gravar no Banco Firebird do Digifarma Agora
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                      Cria o cadastro mestre com o próximo PRODUTO_ID e autoriza o produto na farmácia inteira
                    </span>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800 mt-4">
              <button
                onClick={() => setEditingTask(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-md transition cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>{syncToDigifarma ? 'Gravar no Digifarma' : 'Salvar Alterações'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: NOVO CADASTRO EXPRESSO */}
      {/* ========================================================================= */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">Novo Produto Expresso</h3>
                  <p className="text-xs text-slate-500">Cadastrar item para liberação imediata no PDV</p>
                </div>
              </div>
              <button 
                onClick={() => setIsNewModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição / Nome do Produto:
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: ESCOVA DENTAL IMPORTADA MACIA"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Código de Barras (Opcional ou lido pelo scanner):
                </label>
                <input
                  type="text"
                  value={newBarcode}
                  onChange={(e) => setNewBarcode(e.target.value)}
                  placeholder="Ex: 7891234567890"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Preço de Venda no Balcão (R$):
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newSalePrice || ''}
                  onChange={(e) => setNewSalePrice(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-black font-mono text-emerald-600 dark:text-emerald-400 focus:outline-none focus:border-emerald-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Categoria Provisória:
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="cosmetico">Perfumaria / Cosméticos / Higiene (NCM 33049990)</option>
                  <option value="acessorio">Acessórios / Cutelaria / Plásticos (NCM 39269090)</option>
                  <option value="medicamento">Medicamento / Outros Produtos (NCM 30049099)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800 mt-4">
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateNew}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-md transition cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>Cadastrar Expresso</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CONFIRMAR EXCLUSÃO */}
      {/* ========================================================================= */}
      {deletingTask && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-sm w-full p-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">Excluir Produto Provisório?</h3>
                <p className="text-xs text-slate-500">#{deletingTask.product_code}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mb-4">
              Tem certeza que deseja excluir <strong>{deletingTask.product_name}</strong>? Este item será removido da lista de pendências e do catálogo provisório do PDV.
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setDeletingTask(null)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition cursor-pointer disabled:opacity-50"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
