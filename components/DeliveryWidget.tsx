import React, { useState, useEffect } from 'react';
import {
  Truck,
  DollarSign,
  Package,
  CheckCircle,
  Clock,
  Sparkles,
  RefreshCw,
  Search,
  Plus,
  Edit2,
  Trash2,
  Phone,
  MapPin,
  MessageSquare,
  X,
  Save,
  Filter,
  TrendingUp,
  AlertCircle,
  Users,
  Percent,
  XCircle,
  HelpCircle,
  Send,
  Calendar
} from 'lucide-react';
import { useToast } from './ToastContext';
import { Delivery, DeliveryMetrics, DeliveryStatus } from '../types';

interface DeliveryWidgetProps {
  onOpenChat?: (phone: string) => void;
}

export const DeliveryWidget: React.FC<DeliveryWidgetProps> = ({ onOpenChat }) => {
  const { addToast } = useToast();

  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [metrics, setMetrics] = useState<DeliveryMetrics>({
    totalContacts: 0,
    closedSalesCount: 0,
    closedSalesAmount: 0,
    unclosedSalesCount: 0,
    unclosedSalesAmount: 0,
    conversionRate: 0,
    averageTicket: 0,
    byPaymentMethod: {},
    byStatus: { Pendente: 0, 'Em Rota': 0, Entregue: 0, Nao_Fechado: 0, Cancelado: 0 },
    byUnclosedReason: {}
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [scanning, setScanning] = useState<boolean>(false);
  const [period, setPeriod] = useState<'today' | '7days' | '30days' | 'month' | 'prev_month' | 'all' | string>('month');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [filterClosed, setFilterClosed] = useState<'all' | 'closed' | 'unclosed'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingDelivery, setEditingDelivery] = useState<Partial<Delivery> | null>(null);

  const fetchDeliveries = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        period,
        status: selectedStatus,
        filterClosed,
        search: searchQuery
      });
      const res = await fetch(`/api/deliveries?${query.toString()}`);
      if (!res.ok) throw new Error('Falha ao carregar relatório de entregas e atendimentos.');
      const data = await res.json();
      if (data.success) {
        setDeliveries(data.deliveries || []);
        if (data.metrics) {
          setMetrics(data.metrics);
        }
      }
    } catch (err: any) {
      console.error('[DeliveryWidget] Erro ao carregar:', err);
      addToast(err.message || 'Erro ao carregar relatório.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveries();
  }, [period, selectedStatus, filterClosed, searchQuery]);

  // Executar Varredura por IA (do Mês Atual ou Período)
  const handleTriggerAIScan = async (scanCurrentMonth: boolean = false) => {
    setScanning(true);
    const msg = scanCurrentMonth
      ? '📅 IA analisando TODAS as conversas do MÊS ATUAL...'
      : '🤖 IA auditando conversas do WhatsApp...';
    addToast(msg, 'info');

    try {
      const res = await fetch('/api/deliveries/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scanCurrentMonth,
          hours: period === 'today' ? 24 : period === '7days' ? 168 : 720
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const { stats } = data;
        addToast(
          `✅ Auditoria do Mês Concluída! Vendas Fechadas: ${stats.closedSalesCount} (R$ ${stats.closedSalesAmount.toFixed(2)}), Não Fechadas: ${stats.unclosedSalesCount}.`,
          'success'
        );
        fetchDeliveries();
      } else {
        throw new Error(data.error || 'Erro ao processar auditoria por IA.');
      }
    } catch (err: any) {
      console.error('[DeliveryWidget] Erro na varredura:', err);
      addToast(err.message || 'Falha ao executar auditoria por IA.', 'error');
    } finally {
      setScanning(false);
    }
  };

  // Alteração rápida de Status
  const handleStatusChange = async (deliveryId: string, newStatus: DeliveryStatus) => {
    try {
      const isClosed = (newStatus === 'Pendente' || newStatus === 'Em Rota' || newStatus === 'Entregue') ? 1 : 0;
      const res = await fetch(`/api/deliveries/${deliveryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, sale_closed: isClosed })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`Status do atendimento alterado para ${newStatus}.`, 'success');
        fetchDeliveries();
      } else {
        throw new Error(data.error || 'Erro ao atualizar status.');
      }
    } catch (err: any) {
      addToast(err.message || 'Falha ao alterar status.', 'error');
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDelivery || !editingDelivery.phone) {
      addToast('Telefone do cliente é obrigatório.', 'warning');
      return;
    }

    try {
      const isEdit = !!editingDelivery.id;
      const url = isEdit ? `/api/deliveries/${editingDelivery.id}` : '/api/deliveries';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingDelivery)
      });
      const data = await res.json();

      if (res.ok && data.success) {
        addToast(`Atendimento ${isEdit ? 'atualizado' : 'cadastrado'} com sucesso!`, 'success');
        setIsModalOpen(false);
        setEditingDelivery(null);
        fetchDeliveries();
      } else {
        throw new Error(data.error || 'Erro ao salvar.');
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao salvar.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja remover este registro?')) return;
    try {
      const res = await fetch(`/api/deliveries/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast('Registro excluído.', 'info');
        fetchDeliveries();
      } else {
        throw new Error(data.error || 'Erro ao excluir.');
      }
    } catch (err: any) {
      addToast(err.message || 'Erro ao excluir registro.', 'error');
    }
  };

  const getStatusBadge = (status: DeliveryStatus) => {
    switch (status) {
      case 'Pendente':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      case 'Em Rota':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      case 'Entregue':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'Nao_Fechado':
        return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
      case 'Cancelado':
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const currentMonthName = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 text-slate-100">
      {/* ── HEADER DA SEÇÃO ───────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
            <Truck className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-bold tracking-tight text-white">
                Auditoria de Pedidos & Perdas do Mês ({currentMonthName})
              </h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Sparkles className="w-3.5 h-3.5" /> Varredura Auto (30m) 🔄
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Auditoria completa de conversas do mês atual: Entregas/Vendas Fechadas (R$) vs Orçamentos Não Fechados
            </p>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-wrap items-center space-x-2 w-full md:w-auto justify-end">
          <button
            onClick={() => handleTriggerAIScan(true)}
            disabled={scanning}
            className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium rounded-xl text-xs transition shadow-lg shadow-emerald-900/30 disabled:opacity-50"
          >
            <Calendar className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
            <span>{scanning ? 'Analisando Mês...' : 'Varredura Mês Atual (IA)'}</span>
          </button>

          <button
            onClick={() => {
              setEditingDelivery({
                phone: '',
                customer_name: '',
                delivery_address: '',
                items: '',
                total_amount: 0,
                payment_method: 'Pix',
                status: 'Pendente',
                sale_closed: 1
              });
              setIsModalOpen(true);
            }}
            className="flex items-center space-x-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium rounded-xl text-xs transition"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span>Novo Atendimento</span>
          </button>
        </div>
      </div>

      {/* ── BANNER RESUMO DO MÊS ATUAL (EXIGIDO PELO USUÁRIO) ────────────────────── */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-emerald-500/30 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-400" /> Resumo Consolidado do Mês Atual ({currentMonthName})
          </span>
          <span className="text-[11px] text-slate-400 font-medium">
            Total de conversas analisadas: <strong className="text-white">{metrics.totalContacts}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
          {/* Faturamento em Pedidos */}
          <div className="bg-slate-900/80 border border-emerald-500/20 rounded-xl p-3.5">
            <span className="text-[11px] font-semibold uppercase text-emerald-400 tracking-wider">🟢 Faturamento Pedidos</span>
            <div className="text-2xl font-black text-emerald-400 mt-1">
              R$ {metrics.closedSalesAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {metrics.closedSalesCount} vendas fechadas no mês
            </div>
          </div>

          {/* Valor Perdido no Mês */}
          <div className="bg-slate-900/80 border border-rose-500/20 rounded-xl p-3.5">
            <span className="text-[11px] font-semibold uppercase text-rose-400 tracking-wider">🔴 Total Perdido / Não Fechado</span>
            <div className="text-2xl font-black text-rose-400 mt-1">
              R$ {metrics.unclosedSalesAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {metrics.unclosedSalesCount} atendimentos sem conversão
            </div>
          </div>

          {/* Taxa de Conversão do Mês */}
          <div className="bg-slate-900/80 border border-blue-500/20 rounded-xl p-3.5">
            <span className="text-[11px] font-semibold uppercase text-blue-400 tracking-wider">📊 Taxa de Conversão do Mês</span>
            <div className="text-2xl font-black text-blue-300 mt-1">
              {metrics.conversionRate.toFixed(1)}%
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Ticket Médio: R$ {metrics.averageTicket.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* ── BARRA DE FILTROS E PESQUISA ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
        {/* Seletor de Período */}
        <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-lg border border-slate-800 w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setPeriod('today')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition ${
              period === 'today' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Hoje
          </button>
          <button
            onClick={() => setPeriod('month')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition ${
              period === 'month' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Este Mês
          </button>
          <button
            onClick={() => setPeriod('prev_month')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition ${
              period === 'prev_month' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Mês Anterior
          </button>
          <button
            onClick={() => setPeriod('30days')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition ${
              period === '30days' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            30 Dias
          </button>
          <button
            onClick={() => setPeriod('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition ${
              period === 'all' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Histórico Completo
          </button>
        </div>

        {/* Filtro por Fechamento */}
        <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-lg border border-slate-800 w-full sm:w-auto">
          <button
            onClick={() => setFilterClosed('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
              filterClosed === 'all' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Todos ({metrics.totalContacts})
          </button>
          <button
            onClick={() => setFilterClosed('closed')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
              filterClosed === 'closed' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            ✅ Fechadas ({metrics.closedSalesCount})
          </button>
          <button
            onClick={() => setFilterClosed('unclosed')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
              filterClosed === 'unclosed' ? 'bg-rose-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            ❌ Não Fechadas ({metrics.unclosedSalesCount})
          </button>
        </div>

        {/* Campo de Busca */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, tel ou produto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs pl-9 pr-3 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500 placeholder-slate-500"
          />
        </div>
      </div>

      {/* ── TABELA DE ATENDIMENTOS E DELIVERIES ────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
            <p className="text-sm">Carregando relatório do mês...</p>
          </div>
        ) : deliveries.length === 0 ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center space-y-3">
            <Truck className="w-10 h-10 text-slate-600" />
            <p className="text-base font-semibold text-slate-300">Nenhum atendimento registrado no filtro selecionado</p>
            <p className="text-xs text-slate-500 max-w-md">
              Clique em <strong className="text-emerald-400">Varredura Mês Atual (IA)</strong> para varrer todas as conversas deste mês e quantificar entregas e perdas.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Cliente / Contato</th>
                <th className="px-4 py-3">Endereço / Modalidade</th>
                <th className="px-4 py-3">Produtos Consultados / Comprados</th>
                <th className="px-4 py-3 text-right">Valor R$</th>
                <th className="px-4 py-3">Status / Motivo</th>
                <th className="px-4 py-3 text-center">Ações / Recuperação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
              {deliveries.map((deliv) => {
                const isClosed = deliv.sale_closed === 1 && deliv.status !== 'Nao_Fechado' && deliv.status !== 'Cancelado';

                return (
                  <tr key={deliv.id} className="hover:bg-slate-800/40 transition">
                    {/* Cliente */}
                    <td className="px-4 py-3 font-medium text-white">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-100">
                          {deliv.customer_name && deliv.customer_name !== 'Cliente WhatsApp' ? deliv.customer_name : deliv.phone}
                        </span>
                        {deliv.customer_name && deliv.customer_name !== 'Cliente WhatsApp' && (
                          <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3 text-emerald-400" /> {deliv.phone}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Endereço */}
                    <td className="px-4 py-3 max-w-xs text-slate-300">
                      <div className="flex items-start gap-1">
                        <MapPin className="w-3.5 h-3.5 text-rose-400 mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-2 text-xs">{deliv.delivery_address || 'Atendimento via WhatsApp'}</span>
                      </div>
                    </td>

                    {/* Itens */}
                    <td className="px-4 py-3 max-w-xs text-slate-300">
                      <div className="line-clamp-2 text-xs text-slate-300 italic">
                        {deliv.items || 'Medicamentos/Produtos'}
                      </div>
                    </td>

                    {/* Valor R$ */}
                    <td className="px-4 py-3 text-right font-bold text-sm">
                      <span className={isClosed ? 'text-emerald-400' : 'text-rose-400'}>
                        R$ {(deliv.total_amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </td>

                    {/* Status e Motivo */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col space-y-1">
                        <select
                          value={deliv.status}
                          onChange={(e) => handleStatusChange(deliv.id, e.target.value as DeliveryStatus)}
                          className={`text-xs font-semibold rounded-lg px-2 py-1 border focus:outline-none cursor-pointer ${getStatusBadge(
                            deliv.status
                          )}`}
                        >
                          <option value="Pendente" className="bg-slate-900 text-amber-400">⏳ Fechado - Pendente</option>
                          <option value="Em Rota" className="bg-slate-900 text-blue-400">🛵 Fechado - Em Rota</option>
                          <option value="Entregue" className="bg-slate-900 text-emerald-400">✅ Fechado - Entregue</option>
                          <option value="Nao_Fechado" className="bg-slate-900 text-rose-400">❌ Não Fechado / Perdido</option>
                          <option value="Cancelado" className="bg-slate-900 text-slate-400">🚫 Cancelado</option>
                        </select>

                        {!isClosed && deliv.unclosed_reason && (
                          <span className="text-[10px] text-rose-300 font-medium bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                            Motivo: {deliv.unclosed_reason}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Ações */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        {onOpenChat ? (
                          <button
                            onClick={() => onOpenChat(deliv.phone)}
                            title={isClosed ? 'Abrir Chat no CRM' : '💬 Abrir Chat para Recuperar Venda'}
                            className={`p-1.5 rounded-lg transition ${
                              isClosed
                                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'
                                : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <a
                            href={`https://wa.me/55${deliv.phone}?text=${encodeURIComponent(
                              isClosed
                                ? `Olá, ${deliv.customer_name || ''}! Tudo bem? Passando sobre seu pedido na BelaFarma.`
                                : `Olá, ${deliv.customer_name || ''}! Tudo bem? Vi que você procurou sobre *${deliv.items || 'nossos produtos'}* na BelaFarma. Conseguimos um desconto especial para fechar hoje para você! Podemos separar?`
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            title={isClosed ? 'Abrir WhatsApp' : '💬 Mandar mensagem de recuperação de venda'}
                            className={`p-1.5 rounded-lg transition ${
                              isClosed
                                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'
                                : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            <Send className="w-3.5 h-3.5" />
                          </a>
                        )}

                        <button
                          onClick={() => {
                            setEditingDelivery(deliv);
                            setIsModalOpen(true);
                          }}
                          title="Editar atendimento"
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDelete(deliv.id)}
                          title="Excluir registro"
                          className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── MODAL CADASTRO / EDIÇÃO DE ATENDIMENTO ──────────────────────────────── */}
      {isModalOpen && editingDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Truck className="w-5 h-5 text-emerald-400" />
                {editingDelivery.id ? 'Editar Atendimento' : 'Novo Atendimento Manual'}
              </h3>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingDelivery(null);
                }}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nome do Cliente</label>
                  <input
                    type="text"
                    required
                    value={editingDelivery.customer_name || ''}
                    onChange={(e) => setEditingDelivery({ ...editingDelivery, customer_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-xs rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    placeholder="Ex: João da Silva"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Telefone (WhatsApp)</label>
                  <input
                    type="text"
                    required
                    value={editingDelivery.phone || ''}
                    onChange={(e) => setEditingDelivery({ ...editingDelivery, phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-xs rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    placeholder="Ex: 53999887766"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Endereço de Entrega / Balcão</label>
                <input
                  type="text"
                  value={editingDelivery.delivery_address || ''}
                  onChange={(e) => setEditingDelivery({ ...editingDelivery, delivery_address: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-xs rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  placeholder="Rua, Número, Bairro ou Balcão"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Produtos Consultados / Comprados</label>
                <textarea
                  rows={2}
                  value={editingDelivery.items || ''}
                  onChange={(e) => setEditingDelivery({ ...editingDelivery, items: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-xs rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  placeholder="Ex: 2x Dipirona, 1x Suplemento Vitaminico"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Valor Total (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editingDelivery.total_amount || 0}
                    onChange={(e) => setEditingDelivery({ ...editingDelivery, total_amount: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 text-xs rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Forma de Pagamento</label>
                  <select
                    value={editingDelivery.payment_method || 'Pix'}
                    onChange={(e) => setEditingDelivery({ ...editingDelivery, payment_method: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-xs rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Pix">Pix</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Cartão de Débito">Cartão de Débito</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Crediário">Crediário</option>
                    <option value="A combinar">A combinar</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Status do Atendimento</label>
                  <select
                    value={editingDelivery.status || 'Pendente'}
                    onChange={(e) => {
                      const st = e.target.value as DeliveryStatus;
                      const isClosed = (st === 'Pendente' || st === 'Em Rota' || st === 'Entregue') ? 1 : 0;
                      setEditingDelivery({ ...editingDelivery, status: st, sale_closed: isClosed });
                    }}
                    className="w-full bg-slate-950 border border-slate-800 text-xs rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Pendente">⏳ Fechado - Pendente</option>
                    <option value="Em Rota">🛵 Fechado - Em Rota</option>
                    <option value="Entregue">✅ Fechado - Entregue</option>
                    <option value="Nao_Fechado">❌ Não Fechado / Perdido</option>
                    <option value="Cancelado">🚫 Cancelado</option>
                  </select>
                </div>
              </div>

              {editingDelivery.status === 'Nao_Fechado' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Motivo do Não Fechamento</label>
                  <select
                    value={editingDelivery.unclosed_reason || 'Sem Resposta do Cliente'}
                    onChange={(e) => setEditingDelivery({ ...editingDelivery, unclosed_reason: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-xs rounded-lg px-3 py-2 text-white focus:outline-none focus:border-rose-500"
                  >
                    <option value="Preço Alto">Preço Alto</option>
                    <option value="Falta de Estoque">Falta de Estoque</option>
                    <option value="Sem Resposta do Cliente">Sem Resposta do Cliente</option>
                    <option value="Desistiu">Desistiu</option>
                    <option value="Apenas Cotação">Apenas Cotação</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Observações Gerais</label>
                <input
                  type="text"
                  value={editingDelivery.notes || ''}
                  onChange={(e) => setEditingDelivery({ ...editingDelivery, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-xs rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  placeholder="Observação curta sobre o atendimento"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingDelivery(null);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center space-x-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs transition shadow-lg shadow-emerald-900/30"
                >
                  <Save className="w-4 h-4" />
                  <span>Salvar Atendimento</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
