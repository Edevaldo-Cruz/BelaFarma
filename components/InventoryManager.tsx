import React, { useState, useEffect, useRef } from 'react';
import { 
  Barcode, ClipboardList, Check, RefreshCw, X, Play, 
  AlertTriangle, AlertCircle, ShoppingCart, ArrowLeft, Loader2, Save
} from 'lucide-react';
import { User, UserRole } from '../types';
import { useToast } from './ToastContext';

interface InventoryItem {
  codigo_barras: string;
  descricao: string;
  quantidade_contada: number;
  quantidade_vendida: number;
  data_hora_bip: string;
}

interface ReportItem {
  codigo_barras: string;
  descricao: string;
  quantidade_contada: number;
  vendas_periodo: number;
  estoque_corrigido: number;
  giro_30d: number;
  media_diaria: number;
  dias_cobertura: number;
  status_estoque: 'Crítico' | 'Normal' | 'Sobrando' | string;
  sincronizado: boolean;
  erro_sinc?: string;
}

interface InventorySession {
  id: string;
  data_inicio: string;
  data_fim?: string;
  status: 'aberto' | 'finalizado';
}

interface InventoryManagerProps {
  user: User;
}

export const InventoryManager: React.FC<InventoryManagerProps> = ({ user }) => {
  const [session, setSession] = useState<InventorySession | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingBip, setIsSubmittingBip] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  
  // Modais
  const [isConfirmFinalizeOpen, setIsConfirmFinalizeOpen] = useState(false);
  const [isUnknownProductOpen, setIsUnknownProductOpen] = useState(false);
  const [unknownBarcode, setUnknownBarcode] = useState('');
  const [unknownName, setUnknownName] = useState('');
  
  // Novos Estados
  const [isTestMode, setIsTestMode] = useState(false);
  const [isSyncingCache, setIsSyncingCache] = useState(false);
  const [qtyMultiplier, setQtyMultiplier] = useState(1);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  
  // Edição inline
  const [editingBarcode, setEditingBarcode] = useState<string | null>(null);
  const [editingQty, setEditingQty] = useState('');
  
  // Relatórios pós-finalização
  const [report, setReport] = useState<ReportItem[] | null>(null);
  const [finishedSessionId, setFinishedSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'adjustments' | 'unscanned'>('adjustments');
  const [unscannedItems, setUnscannedItems] = useState<any[]>([]);
  const [isLoadingUnscanned, setIsLoadingUnscanned] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  // Carrega a sessão ativa na montagem do componente
  useEffect(() => {
    fetchSessionStatus();
  }, []);

  // Força o foco contínuo no input de código de barras
  useEffect(() => {
    if (session && session.status === 'aberto' && !isUnknownProductOpen && !isConfirmFinalizeOpen && !isConfirmResetOpen && !editingBarcode && !isSubmittingBip) {
      const focusInput = () => {
        barcodeInputRef.current?.focus();
      };
      
      focusInput();
      
      // Reconecta o foco se o usuário clicar em qualquer lugar da tela
      document.addEventListener('click', focusInput);
      return () => document.removeEventListener('click', focusInput);
    }
  }, [session, isUnknownProductOpen, isConfirmFinalizeOpen, isConfirmResetOpen, editingBarcode, isSubmittingBip]);

  const fetchSessionStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/inventario/status');
      if (res.ok) {
        const data = await res.json();
        if (data.active) {
          setSession(data.session);
          setItems(data.items);
        } else {
          setSession(null);
          setItems([]);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar status do inventário:', err);
      addToast('❌ Falha ao carregar status do inventário.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSyncCache = async () => {
    setIsSyncingCache(true);
    try {
      const res = await fetch('/api/inventario/sincronizar-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`✔ Sincronização concluída! ${data.count} produtos salvos localmente.`, 'success');
      } else {
        addToast(`❌ ${data.error || 'Erro ao sincronizar banco local.'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      addToast('❌ Erro de conexão ao sincronizar banco local.', 'error');
    } finally {
      setIsSyncingCache(false);
    }
  };

  const handleStartInventory = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/inventario/iniciar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo_teste: isTestMode })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSession(data.session);
        setItems([]);
        setReport(null);
        setFinishedSessionId(null);
        if (isTestMode) {
          addToast('🚀 Sessão de inventário iniciada no MODO DE TESTE!', 'warning');
        } else {
          addToast('🚀 Sessão de inventário iniciada com a loja aberta!', 'success');
        }
      } else {
        addToast(`❌ ${data.error || 'Erro ao iniciar inventário.'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      addToast('❌ Erro de conexão ao iniciar inventário.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetInventory = async () => {
    if (!session) return;
    setIsResetting(true);
    try {
      const res = await fetch('/api/inventario/resetar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessao_id: session.id })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setItems([]);
        setIsConfirmResetOpen(false);
        addToast('🧹 Contagem limpa com sucesso!', 'success');
      } else {
        addToast(`❌ ${data.error || 'Erro ao resetar contagem.'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      addToast('❌ Erro de conexão ao resetar contagem.', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  const handleUpdateItemQty = async (barcode: string, qty: number) => {
    if (!session) return;
    try {
      const res = await fetch('/api/inventario/item/quantidade', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessao_id: session.id,
          codigo_barras: barcode,
          quantidade: qty
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setItems(prev => prev.map(item => 
          item.codigo_barras === barcode ? { ...item, quantidade_contada: qty } : item
        ));
        setEditingBarcode(null);
        addToast('✔ Quantidade atualizada!', 'success');
      } else {
        addToast(`❌ ${data.error || 'Erro ao atualizar quantidade.'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      addToast('❌ Erro de conexão ao atualizar quantidade.', 'error');
    }
  };

  const handleDeleteItem = async (barcode: string) => {
    if (!session) return;
    try {
      const res = await fetch('/api/inventario/item', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessao_id: session.id,
          codigo_barras: barcode
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setItems(prev => prev.filter(item => item.codigo_barras !== barcode));
        addToast('✔ Item removido da contagem!', 'success');
      } else {
        addToast(`❌ ${data.error || 'Erro ao remover item.'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      addToast('❌ Erro de conexão ao remover item.', 'error');
    }
  };

  const fetchUnscannedItems = async (sessId: string) => {
    setIsLoadingUnscanned(true);
    try {
      const res = await fetch(`/api/inventario/nao-bipados?sessao_id=${sessId}`);
      if (res.ok) {
        const data = await res.json();
        setUnscannedItems(data.items || []);
      }
    } catch (err) {
      console.error('Erro ao buscar não bipados:', err);
      addToast('❌ Falha ao buscar lista de produtos não encontrados.', 'error');
    } finally {
      setIsLoadingUnscanned(false);
    }
  };

  const handleExportCSV = () => {
    if (unscannedItems.length === 0) return;
    
    // Header
    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += 'Código Barras;Descrição;Estoque Atual Digifarma;Preço Venda\r\n';
    
    unscannedItems.forEach(item => {
      csvContent += `"${item.codigo_barras || ''}";"${item.descricao || ''}";"${String(item.estoque_atual || 0).replace('.', ',')}";"${String(item.preco_venda || 0).replace('.', ',')}"\r\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `produtos_nao_encontrados_sessao_${finishedSessionId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const barcode = barcodeInput.trim();
    if (!barcode || !session) return;

    setBarcodeInput('');
    setIsSubmittingBip(true);

    try {
      const res = await fetch('/api/inventario/bip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          codigo_barras: barcode, 
          sessao_id: session.id,
          quantidade: qtyMultiplier
        })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        const { item } = data;
        
        if (item.isUnknown) {
          // Abre modal de vinculação de produto desconhecido
          setUnknownBarcode(item.codigo_barras);
          setUnknownName('');
          setIsUnknownProductOpen(true);
        } else {
          // Atualiza lista em tempo real
          setItems(prevItems => {
            const index = prevItems.findIndex(i => i.codigo_barras === item.codigo_barras);
            if (index > -1) {
              const updated = [...prevItems];
              updated[index] = { 
                ...updated[index], 
                quantidade_contada: item.quantidade_contada, 
                data_hora_bip: item.data_hora_bip 
              };
              // Reordena para o mais recente no topo
              return updated.sort((a, b) => new Date(b.data_hora_bip).getTime() - new Date(a.data_hora_bip).getTime());
            } else {
              return [{
                codigo_barras: item.codigo_barras,
                descricao: item.descricao,
                quantidade_contada: qtyMultiplier,
                quantidade_vendida: 0,
                data_hora_bip: item.data_hora_bip
              }, ...prevItems];
            }
          });
          
          addToast(`✔ ${item.descricao} bipado! Total contada: ${item.quantidade_contada}`, 'success');
        }
      } else {
        addToast(`❌ ${data.error || 'Erro ao registrar bip.'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      addToast('❌ Erro de conexão ao enviar bip.', 'error');
    } finally {
      setIsSubmittingBip(false);
      setQtyMultiplier(1); // Reset
    }
  };

  const handleUnknownProductSave = async () => {
    if (!unknownName.trim() || !session) return;

    try {
      const res = await fetch('/api/inventario/item/descricao', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sessao_id: session.id, 
          codigo_barras: unknownBarcode, 
          descricao: unknownName.trim() 
        })
      });

      if (res.ok) {
        // Adiciona ou atualiza na lista local
        setItems(prevItems => {
          const index = prevItems.findIndex(i => i.codigo_barras === unknownBarcode);
          const nowStr = new Date().toISOString();
          if (index > -1) {
            const updated = [...prevItems];
            updated[index] = { ...updated[index], descricao: unknownName.trim(), data_hora_bip: nowStr };
            return updated.sort((a, b) => new Date(b.data_hora_bip).getTime() - new Date(a.data_hora_bip).getTime());
          } else {
            return [{
              codigo_barras: unknownBarcode,
              descricao: unknownName.trim(),
              quantidade_contada: qtyMultiplier,
              quantidade_vendida: 0,
              data_hora_bip: nowStr
            }, ...prevItems];
          }
        });

        setIsUnknownProductOpen(false);
        addToast('✔ Produto desconhecido cadastrado temporariamente.', 'success');
      } else {
        addToast('❌ Falha ao salvar descrição do produto.', 'error');
      }
    } catch (err) {
      console.error(err);
      addToast('❌ Erro de conexão ao salvar descrição.', 'error');
    } finally {
      setQtyMultiplier(1); // Reset
    }
  };

  const handleFinalizeInventory = async () => {
    if (!session) return;
    const isTest = session.modo_teste === 1;
    setIsConfirmFinalizeOpen(false);
    setIsFinalizing(true);

    try {
      const res = await fetch('/api/inventario/finalizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessao_id: session.id })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setReport(data.relatorio);
        setFinishedSessionId(data.sessao_id || session.id);
        setActiveTab('adjustments');
        fetchUnscannedItems(data.sessao_id || session.id);
        
        setSession(null);
        setItems([]);
        if (isTest) {
          addToast('🎉 Inventário simulado finalizado! (Nenhuma alteração feita no Digifarma)', 'success');
        } else {
          addToast('🎉 Inventário finalizado e estoques sincronizados no Digifarma!', 'success');
        }
      } else {
        addToast(`❌ ${data.error || 'Erro ao finalizar inventário.'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      addToast('❌ Erro de conexão ao finalizar contagem.', 'error');
    } finally {
      setIsFinalizing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-10 h-10 text-red-500 animate-spin" />
        <span className="text-sm font-bold text-slate-500">Buscando status de sessões...</span>
      </div>
    );
  }

  // Visualização de Relatório Concluído (Pós-finalização)
  if (report) {
    return (
      <div className="flex flex-col gap-5 p-4 md:p-6 bg-slate-50 dark:bg-zinc-950 rounded-2xl min-h-screen">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Check className="w-6 h-6 text-green-500" /> Relatório de Sincronização do Inventário
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-zinc-400">
              Estoque corrigido descontando as vendas que ocorreram no PDV durante a contagem.
            </p>
          </div>
          <button
            onClick={() => setReport(null)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all text-sm shadow-sm"
          >
            <Play className="w-4 h-4" /> Iniciar Novo Inventário
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-slate-200 dark:border-zinc-800 gap-4 text-sm font-bold">
          <button
            onClick={() => setActiveTab('adjustments')}
            className={`pb-3.5 transition-all relative ${
              activeTab === 'adjustments' 
                ? 'text-red-500 dark:text-red-400 border-b-2 border-red-500' 
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700'
            }`}
          >
            Relatório de Ajustes ({report.length})
          </button>
          <button
            onClick={() => setActiveTab('unscanned')}
            className={`pb-3.5 transition-all relative ${
              activeTab === 'unscanned' 
                ? 'text-red-500 dark:text-red-400 border-b-2 border-red-500' 
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700'
            }`}
          >
            Produtos Não Encontrados ({unscannedItems.length})
          </button>
        </div>

        {activeTab === 'adjustments' ? (
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-zinc-800/50 text-slate-600 dark:text-zinc-300 text-xs font-bold uppercase border-b border-slate-200 dark:border-zinc-800">
                    <th className="p-4">Produto</th>
                    <th className="p-4 text-center">Contado</th>
                    <th className="p-4 text-center">Vendas PDV</th>
                    <th className="p-4 text-center">Final Corrigido</th>
                    <th className="p-4 text-center">Giro (30d)</th>
                    <th className="p-4 text-center">Dias Cobertura</th>
                    <th className="p-4 text-center">Status Giro</th>
                    <th className="p-4 text-center">Sincronização</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80 text-sm text-slate-700 dark:text-zinc-200 font-medium">
                  {report.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/20">
                      <td className="p-4">
                        <div className="font-bold text-slate-800 dark:text-white">{item.descricao}</div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">{item.codigo_barras}</div>
                      </td>
                      <td className="p-4 text-center font-bold">{item.quantidade_contada}</td>
                      <td className="p-4 text-center text-amber-600 font-bold">-{item.vendas_periodo}</td>
                      <td className="p-4 text-center text-green-600 dark:text-green-400 font-bold text-base bg-green-50/20 dark:bg-green-500/5">
                        {item.estoque_corrigido}
                      </td>
                      <td className="p-4 text-center">{item.giro_30d}</td>
                      <td className="p-4 text-center">
                        {item.dias_cobertura === 999 ? '∞' : `${item.dias_cobertura} dias`}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-1 text-xs rounded-full font-bold ${
                          item.status_estoque === 'Crítico' 
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' 
                            : item.status_estoque === 'Sobrando'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                              : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        }`}>
                          {item.status_estoque}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        {item.sincronizado ? (
                          <span className="text-green-600 dark:text-green-400 font-bold flex items-center justify-center gap-1">
                            <Check className="w-4 h-4" /> OK
                          </span>
                        ) : (
                          <span className="text-red-500 font-bold flex flex-col items-center justify-center" title={item.erro_sinc}>
                            <span className="flex items-center gap-1 text-xs"><X className="w-3.5 h-3.5" /> Erro</span>
                            <span className="text-[10px] text-red-400 font-normal max-w-[120px] truncate">{item.erro_sinc}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center bg-white dark:bg-zinc-900 p-4 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm gap-2">
              <span className="text-sm font-medium text-slate-500 dark:text-zinc-400">
                Produtos cadastrados no Digifarma que não foram encontrados (não bipados) durante esta sessão.
              </span>
              {unscannedItems.length > 0 && (
                <button
                  onClick={handleExportCSV}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 self-start sm:self-auto"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-spreadsheet"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/><path d="M10 10h4v12h-4z"/></svg>
                  Exportar Excel/CSV
                </button>
              )}
            </div>

            {isLoadingUnscanned ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl">
                <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
                <span className="text-xs text-slate-400">Carregando lista de não bipados...</span>
              </div>
            ) : unscannedItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl text-slate-400">
                <Check className="w-10 h-10 text-green-500" />
                <span className="text-sm font-bold">Todos os produtos do catálogo foram bipados!</span>
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-zinc-800/50 text-slate-600 dark:text-zinc-300 text-xs font-bold uppercase border-b border-slate-200 dark:border-zinc-800 sticky top-0 z-10">
                        <th className="p-4">Código Barras</th>
                        <th className="p-4">Descrição</th>
                        <th className="p-4 text-center">Estoque Atual Digifarma</th>
                        <th className="p-4 text-center">Preço Venda</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80 text-sm text-slate-700 dark:text-zinc-200 font-medium">
                      {unscannedItems.map((item, index) => (
                        <tr key={index} className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/20">
                          <td className="p-4 font-mono text-xs">{item.codigo_barras}</td>
                          <td className="p-4 font-bold text-slate-800 dark:text-white">{item.descricao}</td>
                          <td className="p-4 text-center text-red-500 font-bold bg-red-50/10">{item.estoque_atual}</td>
                          <td className="p-4 text-center">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.preco_venda || 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Interface de Início
  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] p-4 md:p-6 bg-slate-50 dark:bg-zinc-950 rounded-2xl">
        <div className="max-w-md w-full text-center bg-white dark:bg-zinc-900 p-6 md:p-8 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-lg flex flex-col items-center gap-5">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500">
            <ClipboardList className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-white">Inventário Rotativo</h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2">
              Faça a contagem e acerto do seu estoque com a farmácia aberta. O sistema compensará as vendas do PDV realizadas durante o período.
            </p>
          </div>
          
          <div className="w-full flex flex-col gap-4">
            <button
              type="button"
              onClick={() => setIsTestMode(!isTestMode)}
              className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left shadow-sm ${
                isTestMode 
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400' 
                  : 'bg-slate-50 dark:bg-zinc-800/40 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300'
              }`}
            >
              <div className="flex flex-col">
                <span className="text-sm font-bold flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${isTestMode ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'}`} />
                  Modo de Teste (Simulação)
                </span>
                <span className="text-[11px] text-slate-400 dark:text-zinc-500 font-medium mt-0.5">
                  {isTestMode ? 'Nenhuma alteração de estoque no Digifarma' : 'Grava alterações reais no Digifarma'}
                </span>
              </div>
              <div className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-all ${isTestMode ? 'bg-amber-500' : 'bg-slate-300 dark:bg-zinc-700'}`}>
                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-all duration-300 ${isTestMode ? 'translate-x-6' : ''}`} />
              </div>
            </button>
            
            <button
              onClick={handleStartInventory}
              className="w-full flex items-center justify-center gap-2 py-3 bg-red-500 text-white font-bold rounded-2xl hover:bg-red-600 shadow-md hover:shadow-lg transition-all"
            >
              <Play className="w-5 h-5 fill-white" /> Iniciar Nova Contagem
            </button>
            
            <div className="border-t border-slate-150 dark:border-zinc-800/50 my-1"></div>
            
            <button
              onClick={handleSyncCache}
              disabled={isSyncingCache}
              className="w-full flex items-center justify-center gap-2 py-3.5 border border-slate-200 dark:border-zinc-850 hover:bg-slate-50 dark:hover:bg-zinc-800/30 text-slate-700 dark:text-zinc-200 font-bold rounded-2xl transition-all disabled:opacity-50 text-sm shadow-sm"
            >
              {isSyncingCache ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-red-500" /> Sincronizando catálogo...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 text-slate-550" /> Sincronizar Banco Local
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Interface de Contagem Ativa
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 bg-slate-50 dark:bg-zinc-950 rounded-2xl min-h-screen">
      {session.modo_teste === 1 && (
        <div className="bg-amber-500/10 border-2 border-amber-500/35 text-amber-800 dark:text-amber-400 p-4 rounded-3xl flex items-center justify-between text-sm font-bold shadow-sm">
          <span className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-500 animate-bounce" />
            Modo de Teste / Simulação Ativo (As alterações NÃO serão enviadas ao Digifarma)
          </span>
          <span className="bg-amber-500 text-white px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider animate-pulse">
            Simulação
          </span>
        </div>
      )}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-50 dark:bg-green-500/10 rounded-xl flex items-center justify-center text-green-500 animate-pulse">
            <Barcode className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              Inventário em Progresso...
              {session.modo_teste === 1 && (
                <span className="text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-black animate-pulse uppercase tracking-wider">
                  Modo Teste
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Sessão iniciada às {new Date(session.data_inicio).toLocaleTimeString('pt-BR')} — Loja Aberta
            </p>
          </div>
        </div>
        
        <div className="flex w-full md:w-auto gap-3 items-center">
          <button
            onClick={() => setIsConfirmResetOpen(true)}
            className="px-4 py-2.5 border border-slate-200 dark:border-zinc-800 bg-white hover:bg-slate-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/50 text-slate-700 dark:text-zinc-200 rounded-xl font-bold transition-all text-sm flex items-center justify-center gap-1.5 shadow-sm"
          >
            <RefreshCw className="w-4 h-4 text-slate-400" /> Limpar Contagem
          </button>
          
          <button
            onClick={() => setIsConfirmFinalizeOpen(true)}
            className="px-5 py-2.5 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 shadow-md hover:shadow-lg transition-all text-sm flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" /> {session.modo_teste === 1 ? 'Finalizar Simulação' : 'Finalizar e Compensar'}
          </button>
        </div>
      </div>

      {/* Input de Captura de Código de Barras (Scanner) */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 md:p-6 shadow-sm flex flex-col items-center justify-center gap-4">
        <div className="text-center">
          <span className="text-xs font-bold text-red-500 flex items-center gap-1.5 justify-center mb-1">
            <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping"></span>
            SCANNER ATIVO
          </span>
          <h2 className="text-base font-bold text-slate-700 dark:text-zinc-200">Aponte o leitor de código de barras para o produto</h2>
        </div>

        {/* Painel do Multiplicador */}
        <div className="flex flex-wrap gap-2 items-center justify-center p-3 bg-slate-50 dark:bg-zinc-850/30 rounded-2xl border border-slate-100 dark:border-zinc-800/60 max-w-lg w-full">
          <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">Multiplicar bip:</span>
          <input
            type="number"
            min="1"
            className="w-16 px-2.5 py-1 text-center bg-white dark:bg-zinc-900 border border-slate-250 dark:border-zinc-800 rounded-lg font-bold text-slate-800 dark:text-white focus:outline-none focus:border-red-500 text-sm"
            value={qtyMultiplier}
            onChange={(e) => setQtyMultiplier(Math.max(1, parseInt(e.target.value) || 1))}
          />
          <div className="flex gap-1.5">
            {[2, 5, 10, 20, 50].map(val => (
              <button
                key={val}
                type="button"
                onClick={() => setQtyMultiplier(val)}
                className={`px-2.5 py-1 rounded-lg text-xs font-black border transition-all ${
                  qtyMultiplier === val
                    ? 'bg-red-500 border-red-500 text-white'
                    : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-850'
                }`}
              >
                x{val}
              </button>
            ))}
            {qtyMultiplier > 1 && (
              <button
                type="button"
                onClick={() => setQtyMultiplier(1)}
                className="px-2 py-1 text-xs font-bold text-red-500 hover:underline ml-1"
              >
                Limpar
              </button>
            )}
          </div>
        </div>
        
        <form onSubmit={handleBarcodeSubmit} className="w-full max-w-lg relative">
          <input
            ref={barcodeInputRef}
            type="text"
            className="w-full px-6 py-4 bg-slate-50 dark:bg-zinc-800/50 border-2 border-slate-200 dark:border-zinc-800 rounded-2xl font-mono text-center text-lg md:text-xl font-bold outline-none focus:border-red-500 transition-all text-slate-800 dark:text-white"
            placeholder={qtyMultiplier > 1 ? `Bipar ${qtyMultiplier} unidades...` : "Aguardando bip..."}
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            disabled={isSubmittingBip}
            autoComplete="off"
          />
          {isSubmittingBip && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
            </div>
          )}
        </form>
        <p className="text-slate-400 dark:text-zinc-500 text-[11px] text-center max-w-sm">
          Foco do cursor mantido automaticamente nesta caixa. Não utilize o mouse para bipar consecutivamente.
        </p>
      </div>

      {/* Grid de Itens Bipados */}
      <div className="flex flex-col bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-sm overflow-hidden flex-1">
        <div className="p-4 border-b border-slate-100 dark:border-zinc-800 flex justify-between items-center bg-slate-50/50 dark:bg-zinc-800/30">
          <span className="text-sm font-bold text-slate-800 dark:text-white">Produtos Contados ({items.length})</span>
          <span className="text-xs bg-slate-200 dark:bg-zinc-800 px-2 py-1 rounded-lg font-bold text-slate-600 dark:text-zinc-300">
            Total Bipado: {items.reduce((sum, item) => sum + item.quantidade_contada, 0)} un
          </span>
        </div>

        <div className="overflow-x-auto flex-1">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 gap-2">
              <Barcode className="w-12 h-12 stroke-[1.2] text-slate-350" />
              <span className="text-sm font-bold">Nenhum produto bipado nesta sessão.</span>
              <span className="text-xs text-slate-450">Bipe o primeiro código de barras para iniciar a listagem.</span>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/30 dark:bg-zinc-800/20 text-slate-500 dark:text-zinc-400 text-xs font-bold uppercase border-b border-slate-100 dark:border-zinc-800/80">
                  <th className="p-4">Código / Produto</th>
                  <th className="p-4 text-center">Contagem</th>
                  <th className="p-4 text-center">Compensação Vendas (PDV)</th>
                  <th className="p-4 text-center">Último Bip</th>
                  <th className="p-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80 text-sm text-slate-700 dark:text-zinc-200 font-medium">
                {items.map((item, index) => (
                  <tr key={index} className={`hover:bg-slate-50/50 dark:hover:bg-zinc-800/10 ${index === 0 ? 'bg-green-50/20 dark:bg-green-500/5 animate-fade-in' : ''}`}>
                    <td className="p-4">
                      <div className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                        {item.descricao}
                        {item.descricao === 'Produto Desconhecido' && (
                          <button
                            onClick={() => {
                              setUnknownBarcode(item.codigo_barras);
                              setUnknownName('');
                              setIsUnknownProductOpen(true);
                            }}
                            className="text-[10px] bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 px-1.5 py-0.5 rounded font-bold hover:underline"
                          >
                            Nomear
                          </button>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">{item.codigo_barras}</div>
                    </td>
                    <td className="p-4 text-center font-bold text-base text-slate-800 dark:text-white">
                      {editingBarcode === item.codigo_barras ? (
                        <input
                          type="number"
                          min="0"
                          className="w-20 px-2 py-1 text-center bg-slate-50 dark:bg-zinc-800 border-2 border-red-500 rounded-lg font-bold text-sm text-slate-900 dark:text-white focus:outline-none"
                          value={editingQty}
                          onChange={(e) => setEditingQty(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleUpdateItemQty(item.codigo_barras, parseFloat(editingQty) || 0);
                            } else if (e.key === 'Escape') {
                              setEditingBarcode(null);
                            }
                          }}
                        />
                      ) : (
                        item.quantidade_contada
                      )}
                    </td>
                    <td className="p-4 text-center font-bold text-amber-600">
                      <span className="flex items-center justify-center gap-1">
                        <ShoppingCart className="w-3.5 h-3.5" /> -{item.quantidade_vendida}
                      </span>
                    </td>
                    <td className="p-4 text-center text-xs text-slate-400 font-mono">
                      {new Date(item.data_hora_bip).toLocaleTimeString('pt-BR')}
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {editingBarcode === item.codigo_barras ? (
                          <>
                            <button
                              onClick={() => handleUpdateItemQty(item.codigo_barras, parseFloat(editingQty) || 0)}
                              className="p-1 bg-green-500 hover:bg-green-600 text-white rounded-md transition-colors"
                              title="Salvar"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingBarcode(null)}
                              className="p-1 bg-slate-300 hover:bg-slate-400 text-slate-700 rounded-md transition-colors"
                              title="Cancelar"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditingBarcode(item.codigo_barras);
                                setEditingQty(String(item.quantidade_contada));
                              }}
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-800 text-blue-500 dark:text-blue-400 rounded-lg transition-colors"
                              title="Editar quantidade"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pencil"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Deseja remover "${item.descricao}" do inventário?`)) {
                                  handleDeleteItem(item.codigo_barras);
                                }
                              }}
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-800 text-red-500 rounded-lg transition-colors"
                              title="Excluir produto da lista"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal 1: Vinculação de Produto Desconhecido */}
      {isUnknownProductOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 max-w-md w-full rounded-3xl p-6 shadow-xl flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-1.5 text-red-500">
                <AlertCircle className="w-5 h-5" /> Produto Não Cadastrado
              </h3>
              <button 
                onClick={() => setIsUnknownProductOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="text-sm text-slate-500 dark:text-zinc-400">
              <p>O código de barras <strong className="font-mono text-slate-700 dark:text-white">{unknownBarcode}</strong> não foi encontrado no Digifarma.</p>
              <p className="mt-1">Digite o nome ou descrição do produto abaixo para incluí-lo na contagem:</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-600 dark:text-zinc-300">Descrição do Produto:</label>
              <input
                type="text"
                className="px-4 py-3 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-800 rounded-xl outline-none focus:border-red-500 font-bold text-slate-800 dark:text-white"
                placeholder="Ex: Cimegripe 20 caps"
                value={unknownName}
                onChange={(e) => setUnknownName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex gap-3 justify-end mt-2">
              <button
                onClick={() => setIsUnknownProductOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleUnknownProductSave}
                disabled={!unknownName.trim()}
                className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-all text-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" /> Salvar Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Confirmação de Finalização e Compensação */}
      {isConfirmFinalizeOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 max-w-md w-full rounded-3xl p-6 shadow-xl flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-1.5 text-amber-500">
                <AlertTriangle className="w-5 h-5" /> Confirmar Finalização e Ajuste
              </h3>
              <button 
                onClick={() => setIsConfirmFinalizeOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="text-sm text-slate-500 dark:text-zinc-400 flex flex-col gap-2">
              <p>Você está finalizando a contagem com a **loja aberta**.</p>
              <p className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl text-amber-700 dark:text-amber-300 font-medium">
                <strong>Regra de Compensação:</strong> Quaisquer vendas efetuadas no PDV dos itens contados após o bip correspondente serão subtraídas da contagem final para evitar furos de estoque.
              </p>
              {session.modo_teste === 1 ? (
                <p className="font-bold text-amber-600">
                  Aviso: O Modo de Teste está ATIVO. Esta finalização apenas gerará o relatório e NÃO atualizará o saldo no Digifarma.
                </p>
              ) : (
                <p className="font-bold text-red-500">
                  Esta ação atualizará diretamente o estoque no banco de dados Firebird do Digifarma!
                </p>
              )}
            </div>

            <div className="flex gap-3 justify-end mt-2">
              <button
                onClick={() => setIsConfirmFinalizeOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all text-sm"
              >
                Voltar à Contagem
              </button>
              <button
                onClick={handleFinalizeInventory}
                className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-all text-sm flex items-center gap-1.5 shadow-sm"
              >
                {isFinalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Confirmar e Ajustar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Confirmar Reset (Limpar Tudo) */}
      {isConfirmResetOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 max-w-md w-full rounded-3xl p-6 shadow-xl flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-1.5 text-red-500">
                <AlertTriangle className="w-5 h-5" /> Confirmar Limpeza Total
              </h3>
              <button 
                onClick={() => setIsConfirmResetOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="text-sm text-slate-500 dark:text-zinc-400">
              <p>Tem certeza de que deseja **apagar todas as contagens** já realizadas nesta sessão?</p>
              <p className="mt-1.5 text-red-500 font-bold">Esta ação não pode ser desfeita, mas a sessão continuará aberta para recomeçar.</p>
            </div>

            <div className="flex gap-3 justify-end mt-2">
              <button
                onClick={() => setIsConfirmResetOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleResetInventory}
                disabled={isResetting}
                className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-all text-sm flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {isResetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Limpar Tudo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
