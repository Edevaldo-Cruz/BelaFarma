import React, { useState, useEffect } from 'react';
import {
  Truck, CheckCircle, AlertCircle, RefreshCw, MessageSquare, Building2, Check, X, MapPin, User, Package
} from 'lucide-react';
import { useToast } from './ToastContext';
import { Delivery } from '../types';

interface InTransitDeliveriesCardProps {
  onOpenChat?: (phone: string) => void;
  onNavigate?: (view: any) => void;
  showWhenEmpty?: boolean;
}

export const InTransitDeliveriesCard: React.FC<InTransitDeliveriesCardProps> = ({
  onOpenChat,
  onNavigate,
  showWhenEmpty = false
}) => {
  const { addToast } = useToast();

  const [inTransitDeliveries, setInTransitDeliveries] = useState<Delivery[]>([]);
  const [loadingInTransit, setLoadingInTransit] = useState<boolean>(false);
  const [editingTransitData, setEditingTransitData] = useState<Record<string, { customer_name?: string; delivery_address?: string; neighborhood?: string }>>({});
  const [undeliveredModalDelivery, setUndeliveredModalDelivery] = useState<Delivery | null>(null);
  const [undeliveredAction, setUndeliveredAction] = useState<'reagendar' | 'cancelar'>('reagendar');
  const [undeliveredReason, setUndeliveredReason] = useState<string>('Cliente ausente / ninguém atendeu');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);


  const fetchInTransitDeliveries = async () => {
    setLoadingInTransit(true);
    try {
      const res = await fetch('/api/deliveries/in-transit');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const raw = data.deliveries || [];
          const seen = new Set<string>();
          const uniqueDeliveries = raw.filter((d: Delivery) => {
            const key = `${d.phone || ''}_${(d.items || '').trim().toLowerCase()}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setInTransitDeliveries(uniqueDeliveries);
        }
      }
    } catch (err: any) {
      console.error('[DeliveryWidget] Erro ao buscar pedidos em rota:', err);
    } finally {
      setLoadingInTransit(false);
    }
  };

  const handleTransitChange = (id: string, field: 'customer_name' | 'delivery_address' | 'neighborhood', value: string) => {
    setEditingTransitData(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const handleConfirmDelivered = async (del: Delivery) => {
    setActionLoadingId(del.id);
    const edit = editingTransitData[del.id] || {};
    const nameToSave = (edit.customer_name !== undefined ? edit.customer_name : (del.customer_name || '')).trim();
    const addressToSave = (edit.delivery_address !== undefined ? edit.delivery_address : (del.delivery_address || '')).trim();
    const neighborhoodToSave = (edit.neighborhood !== undefined ? edit.neighborhood : (del.neighborhood || '')).trim();

    try {
      const res = await fetch(`/api/deliveries/${del.id}/confirm-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Entregue',
          customer_name: nameToSave,
          delivery_address: addressToSave,
          neighborhood: neighborhoodToSave
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        let msg = '✅ Pedido marcado como Entregue!';
        if (data.digifarma && data.digifarma.cliente_id) {
          msg += ` Digifarma: #${data.digifarma.cliente_id} (${data.digifarma.action === 'created' ? 'Novo Cadastro Criado' : 'Cadastro Atualizado'}).`;
        }
        addToast(msg, 'success');
        setInTransitDeliveries(prev => prev.filter(item => item.id !== del.id && item.phone !== del.phone));
        fetchInTransitDeliveries();
        // refresh
      } else {
        addToast(data.error || 'Erro ao confirmar entrega.', 'error');
      }
    } catch (err: any) {
      addToast('Erro de conexão ao confirmar entrega.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSyncDigifarma = async (del: Delivery) => {
    setActionLoadingId(del.id);
    const edit = editingTransitData[del.id] || {};
    const nameToSave = (edit.customer_name !== undefined ? edit.customer_name : (del.customer_name || '')).trim();
    const addressToSave = (edit.delivery_address !== undefined ? edit.delivery_address : (del.delivery_address || '')).trim();
    const neighborhoodToSave = (edit.neighborhood !== undefined ? edit.neighborhood : (del.neighborhood || '')).trim();

    try {
      await fetch(`/api/deliveries/${del.id}/confirm-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: del.status || 'Em Rota',
          customer_name: nameToSave,
          delivery_address: addressToSave,
          neighborhood: neighborhoodToSave
        })
      });

      const res = await fetch(`/api/deliveries/${del.id}/sync-digifarma`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success && data.digifarma?.cliente_id) {
        addToast(`✅ Digifarma: Cliente #${data.digifarma.cliente_id} (${data.digifarma.action === 'created' ? 'Novo Cadastro' : 'Atualizado'}) com sucesso!`, 'success');
        fetchInTransitDeliveries();
        // refresh
      } else {
        addToast(data.digifarma?.message || 'Não foi possível sincronizar com o Digifarma.', 'warning');
      }
    } catch (err: any) {
      addToast('Erro ao comunicar com o Digifarma.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleConfirmUndelivered = async () => {
    if (!undeliveredModalDelivery) return;
    const del = undeliveredModalDelivery;
    setActionLoadingId(del.id);

    try {
      const targetStatus = undeliveredAction === 'reagendar' ? 'Pendente' : 'Cancelado';
      const res = await fetch(`/api/deliveries/${del.id}/confirm-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: targetStatus,
          unclosed_reason: undeliveredReason
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(
          undeliveredAction === 'reagendar'
            ? 'Pedido retornado para Pendente para nova tentativa.'
            : 'Pedido cancelado e registrado no histórico.',
          'info'
        );
        setUndeliveredModalDelivery(null);
        fetchInTransitDeliveries();
        // refresh
      } else {
        addToast(data.error || 'Erro ao atualizar pedido.', 'error');
      }
    } catch (err: any) {
      addToast('Erro ao comunicar com o servidor.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  useEffect(() => {
    fetchInTransitDeliveries();
    const interval = setInterval(fetchInTransitDeliveries, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!loadingInTransit && inTransitDeliveries.length === 0 && !showWhenEmpty) {
    return null;
  }

  return (
    <>
      {/* ── CARD DE AÇÃO RÁPIDA: PEDIDOS EM ROTA PARA ENTREGA ─────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 border-2 border-amber-500/40 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold text-xl shadow-inner">
              🛵
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-tight">
                  Pedidos Em Rota para Entrega
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-500 text-slate-950 animate-pulse">
                  {inTransitDeliveries.length}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Confirme se a entrega foi realizada e complete Nome e Endereço para criar ou atualizar o cadastro no <strong>Digifarma</strong>.
              </p>
            </div>
          </div>

          <button
            onClick={fetchInTransitDeliveries}
            disabled={loadingInTransit}
            className="self-start sm:self-auto px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            title="Atualizar lista de pedidos em rota"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingInTransit ? 'animate-spin text-amber-400' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>

        {loadingInTransit ? (
          <div className="py-8 text-center text-slate-400 flex flex-col items-center justify-center space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
            <p className="text-xs">Verificando entregas em rota...</p>
          </div>
        ) : inTransitDeliveries.length === 0 ? (
          <div className="py-5 px-4 text-center rounded-2xl bg-slate-950/40 border border-slate-800/80 flex flex-col sm:flex-row items-center justify-center gap-3 text-slate-400">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="text-left">
              <p className="text-xs sm:text-sm font-bold text-slate-300">Nenhum pedido em rota pendente de confirmação no momento.</p>
              <p className="text-[11px] text-slate-500">Assim que um pedido for despachado para entrega no WhatsApp, ele aparecerá aqui com caixas para conferência de Nome e Endereço.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {inTransitDeliveries.map((del) => {
              const edit = editingTransitData[del.id] || {};
              const currentName = edit.customer_name !== undefined ? edit.customer_name : (del.customer_name || '');
              const currentAddress = edit.delivery_address !== undefined ? edit.delivery_address : (del.delivery_address || '');
              const currentNeighborhood = edit.neighborhood !== undefined ? edit.neighborhood : (del.neighborhood || '');
              const isLoadingThis = actionLoadingId === del.id;

              return (
                <div
                  key={del.id}
                  className="bg-slate-950/80 border border-amber-500/30 hover:border-amber-500/60 rounded-2xl p-4 shadow-lg flex flex-col justify-between space-y-3 transition"
                >
                  {/* Topo do Card: Telefone, Valor, Status, Digifarma Badge */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-black text-white">
                          {del.phone}
                        </span>
                        {onOpenChat && (
                          <button
                            onClick={() => onOpenChat(del.phone)}
                            className="p-1 text-slate-400 hover:text-emerald-400 transition cursor-pointer"
                            title="Conversar no WhatsApp"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          🛵 Em Rota
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        <span>Produtos: <strong className="text-slate-200">{del.items || 'Itens diversos'}</strong></span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-base font-black text-emerald-400 block">
                        R$ {(del.total_amount || 0).toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        {del.payment_method || 'Pagamento na entrega'}
                      </span>
                    </div>
                  </div>

                  {/* Formulário Rápido de Edição de Nome e Endereço */}
                  <div className="space-y-2.5 bg-slate-900/70 p-3 rounded-xl border border-slate-800">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1 flex items-center justify-between">
                        <span>👤 Nome do Cliente (Digifarma):</span>
                        {del.digifarma_cliente_id ? (
                          <span className="text-teal-400 font-mono text-[10px] flex items-center gap-1 font-bold">
                            <Check className="w-3 h-3" /> Digifarma #{del.digifarma_cliente_id}
                          </span>
                        ) : (
                          <span className="text-amber-400 text-[10px]">
                            {currentName ? 'Pronto para cadastrar' : '⚠️ Digite o nome'}
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={currentName}
                        onChange={(e) => handleTransitChange(del.id, 'customer_name', e.target.value)}
                        placeholder="Nome não encontrado - digite aqui..."
                        className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                          📍 Endereço de Entrega:
                        </label>
                        <input
                          type="text"
                          value={currentAddress}
                          onChange={(e) => handleTransitChange(del.id, 'delivery_address', e.target.value)}
                          placeholder="Rua, número, complemento..."
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                          Bairro:
                        </label>
                        <input
                          type="text"
                          value={currentNeighborhood}
                          onChange={(e) => handleTransitChange(del.id, 'neighborhood', e.target.value)}
                          placeholder="Bairro..."
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Ações: Entregue, Não Entregue, Sincronizar Digifarma */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleConfirmDelivered(del)}
                        disabled={isLoadingThis}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                        <span>Entregue</span>
                      </button>

                      <button
                        onClick={() => {
                          setUndeliveredModalDelivery(del);
                          setUndeliveredAction('reagendar');
                        }}
                        disabled={isLoadingThis}
                        className="px-3 py-2 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                      >
                        <X className="w-4 h-4" />
                        <span>Não Entregue</span>
                      </button>
                    </div>

                    <button
                      onClick={() => handleSyncDigifarma(del)}
                      disabled={isLoadingThis}
                      className="px-3 py-2 bg-slate-800 hover:bg-teal-700 text-slate-300 hover:text-white border border-slate-700 hover:border-teal-600 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                      title="Salva os dados e cadastra/atualiza o cliente imediatamente no banco Firebird do Digifarma"
                    >
                      <Building2 className="w-3.5 h-3.5 text-teal-400" />
                      <span>{del.digifarma_cliente_id ? `Digifarma #${del.digifarma_cliente_id}` : 'Cadastrar no Digifarma'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MODAL: TRATAMENTO DE PEDIDO NÃO ENTREGUE ─────────────────────────── */}
      {undeliveredModalDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Pedido Não Entregue
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    {undeliveredModalDelivery.phone} • {undeliveredModalDelivery.customer_name || 'Cliente'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setUndeliveredModalDelivery(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-300 font-medium">
                Como deseja proceder com este pedido?
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setUndeliveredAction('reagendar')}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                    undeliveredAction === 'reagendar'
                      ? 'bg-amber-500/20 border-amber-500 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="text-xs font-bold block mb-1">🔄 Reagendar</span>
                  <span className="text-[10px] text-slate-400 leading-tight">Volta para 'Pendente' para nova tentativa de entrega.</span>
                </button>

                <button
                  type="button"
                  onClick={() => setUndeliveredAction('cancelar')}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                    undeliveredAction === 'cancelar'
                      ? 'bg-rose-500/20 border-rose-500 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="text-xs font-bold block mb-1">🚫 Cancelar Pedido</span>
                  <span className="text-[10px] text-slate-400 leading-tight">Marca como Cancelado e registra o motivo da devolução.</span>
                </button>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Motivo:
                </label>
                <div className="space-y-1.5">
                  <select
                    value={undeliveredReason}
                    onChange={(e) => setUndeliveredReason(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="Cliente ausente / ninguém atendeu">Cliente ausente / ninguém atendeu</option>
                    <option value="Endereço não localizado ou incompleto">Endereço não localizado ou incompleto</option>
                    <option value="Cliente cancelou / desistiu do pedido">Cliente cancelou / desistiu do pedido</option>
                    <option value="Troca ou problema com a mercadoria">Troca ou problema com a mercadoria</option>
                    <option value="Outro">Outro motivo</option>
                  </select>

                  {undeliveredReason === 'Outro' && (
                    <input
                      type="text"
                      placeholder="Especifique o motivo..."
                      onChange={(e) => setUndeliveredReason(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 mt-1"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setUndeliveredModalDelivery(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmUndelivered}
                disabled={actionLoadingId === undeliveredModalDelivery.id}
                className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer disabled:opacity-50 ${
                  undeliveredAction === 'reagendar'
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                Confirmar {undeliveredAction === 'reagendar' ? 'Reagendamento' : 'Cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};