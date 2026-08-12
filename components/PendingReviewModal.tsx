import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
  Phone,
  Plus,
  Trash2,
  Send,
  Sparkles,
  ShoppingBag,
  MapPin,
  DollarSign,
  CreditCard,
  FileText,
  AlertCircle,
  User
} from 'lucide-react';
import { useToast } from './ToastContext';
import { Delivery } from '../types';

export interface PendingReviewModalProps {
  delivery: Delivery | null;
  onClose: () => void;
  onSubmitSuccess?: (deliveryId: string) => void;
}

export const PendingReviewModal: React.FC<PendingReviewModalProps> = ({
  delivery,
  onClose,
  onSubmitSuccess
}) => {
  const { addToast } = useToast();

  const [gerouEntrega, setGerouEntrega] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Estados para fluxo "SIM" (Dados da Entrega)
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [items, setItems] = useState<string>('');
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('PIX');
  const [notes, setNotes] = useState<string>('');

  // Estados para fluxo "NÃO" (Motivos e Rejeições)
  const [unclosedReason, setUnclosedReason] = useState<string>('Preço');
  const [rejections, setRejections] = useState<
    Array<{
      product_name: string;
      reason: string;
      notes: string;
      selected: boolean;
    }>
  >([]);

  useEffect(() => {
    if (!delivery) return;

    // Resetar campos para fluxo SIM
    setDeliveryAddress(delivery.delivery_address || '');
    setItems(delivery.items || '');
    setTotalAmount(
      delivery.total_amount !== undefined && delivery.total_amount !== null
        ? String(delivery.total_amount)
        : ''
    );
    setPaymentMethod(delivery.payment_method || 'PIX');
    setNotes(delivery.notes || '');

    // Resetar campos para fluxo NÃO (parsing seguro dos produtos discutidos)
    let parsedProducts: string[] = [];
    if (delivery.discussed_products_json) {
      try {
        const parsed = JSON.parse(delivery.discussed_products_json);
        if (Array.isArray(parsed)) {
          parsedProducts = parsed.map(p =>
            typeof p === 'string' ? p : String(p?.name || p?.product_name || p)
          );
        } else if (typeof parsed === 'string' && parsed.trim()) {
          parsedProducts = [parsed.trim()];
        } else if (parsed && typeof parsed === 'object') {
          const val = parsed.name || parsed.product_name || String(parsed);
          if (val && typeof val === 'string' && val.trim()) {
            parsedProducts = [val.trim()];
          }
        }
      } catch (e) {
        console.error('[PendingReviewModal] Erro ao parsear produtos discutidos:', e);
      }
    }

    if (parsedProducts.length > 0) {
      setRejections(
        parsedProducts.map(prod => ({
          product_name: prod,
          reason: 'Preço',
          notes: '',
          selected: true
        }))
      );
    } else {
      setRejections([
        {
          product_name: '',
          reason: 'Preço',
          notes: '',
          selected: true
        }
      ]);
    }
  }, [delivery]);

  if (!delivery) return null;

  const displayName =
    delivery.wa_name ||
    (delivery.customer_name &&
    delivery.customer_name !== 'Cliente WhatsApp' &&
    !/^\d{10,}$/.test(delivery.customer_name)
      ? delivery.customer_name
      : delivery.phone);

  const isNewCustomer = delivery.is_new_customer === 1;

  // Duração formatada
  const durationSecs = delivery.chat_duration_seconds || 0;
  const durationMins = Math.floor(durationSecs / 60);
  const durationSecsRemainder = durationSecs % 60;
  const durationDisplay =
    durationMins > 0 ? `${durationMins}m ${durationSecsRemainder}s` : `${durationSecs}s`;

  const handleAddProductLine = () => {
    setRejections(prev => [
      ...prev,
      {
        product_name: '',
        reason: 'Preço',
        notes: '',
        selected: true
      }
    ]);
  };

  const handleRemoveProductLine = (index: number) => {
    setRejections(prev => prev.filter((_, i) => i !== index));
  };

  const handleToggleSelected = (index: number) => {
    setRejections(prev =>
      prev.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item))
    );
  };

  const handleUpdateRejection = (
    index: number,
    field: 'product_name' | 'reason' | 'notes',
    value: string
  ) => {
    setRejections(prev =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      let bodyData: any = {
        gerou_entrega: gerouEntrega
      };

      if (gerouEntrega) {
        const parsedAmount = totalAmount ? parseFloat(totalAmount) : 0;
        bodyData.delivery_details = {
          customer_name: delivery.customer_name || displayName,
          delivery_address: deliveryAddress,
          items: items,
          total_amount: isNaN(parsedAmount) ? 0 : parsedAmount,
          payment_method: paymentMethod,
          notes: notes
        };
      } else {
        const activeRejections = rejections
          .filter(r => r.selected && r.product_name.trim() !== '')
          .map(r => ({
            product_name: r.product_name.trim(),
            reason: r.reason || unclosedReason || 'Outro',
            notes: r.notes.trim()
          }));

        bodyData.unclosed_reason = unclosedReason;
        bodyData.rejection_details = activeRejections;
      }

      const res = await fetch(`/api/deliveries/${delivery.id}/submit-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });

      const data = await res.json();

      if (res.ok && data.success) {
        addToast('Revisão de atendimento concluída com sucesso!', 'success');
        
        // Notificar ouvintes globais para atualização otimista
        window.dispatchEvent(
          new CustomEvent('reviewSubmitted', { detail: { id: delivery.id } })
        );

        if (onSubmitSuccess) {
          onSubmitSuccess(delivery.id);
        }
        onClose();
      } else {
        throw new Error(data.error || 'Falha ao salvar a revisão de atendimento.');
      }
    } catch (err: any) {
      console.error('[PendingReviewModal] Erro ao submeter:', err);
      addToast(err.message || 'Erro ao submeter a revisão de atendimento.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* CABEÇALHO DO MODAL */}
        <div className="bg-slate-50 dark:bg-slate-950 p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-black text-slate-900 dark:text-white truncate" title={displayName}>
                {displayName}
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  isNewCustomer
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    : 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                }`}
              >
                {isNewCustomer ? '🆕 Cliente Novo' : '👤 Recorrente'}
              </span>
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
              <span className="flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                {delivery.phone}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                Duração: {durationDisplay}
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                {delivery.chat_message_count || 0} msgs
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CORPO DO MODAL (FORMULÁRIO) */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* PERGUNTA CHAVE: GEROU ENTREGA? */}
          <div className="bg-slate-100 dark:bg-slate-950/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
            <label className="block text-sm font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Gerou entrega?
            </label>
            <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
              <button
                type="button"
                onClick={() => setGerouEntrega(true)}
                className={`py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
                  gerouEntrega
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 scale-[1.02]'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <CheckCircle className="w-5 h-5" />
                SIM (Entrega)
              </button>

              <button
                type="button"
                onClick={() => setGerouEntrega(false)}
                className={`py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
                  !gerouEntrega
                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 scale-[1.02]'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <XCircle className="w-5 h-5" />
                NÃO (Perdido)
              </button>
            </div>
          </div>

          {/* FLUXO "SIM": FORMULÁRIO DE ENTREGA */}
          {gerouEntrega ? (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm border-b border-slate-200 dark:border-slate-800 pb-2">
                <ShoppingBag className="w-4 h-4" />
                <span>Confirmar Dados do Pedido de Entrega</span>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Endereço de Entrega
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={deliveryAddress}
                    onChange={e => setDeliveryAddress(e.target.value)}
                    placeholder="Rua, número, bairro, complemento..."
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Itens do Pedido
                  </label>
                  <div className="relative">
                    <ShoppingBag className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={items}
                      onChange={e => setItems(e.target.value)}
                      placeholder="Ex: Dipirona 500mg, Dorflex..."
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Valor Total (R$)
                  </label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={totalAmount}
                      onChange={e => setTotalAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Forma de Pagamento
                </label>
                <div className="relative">
                  <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="PIX">PIX</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Cartão de Débito">Cartão de Débito</option>
                    <option value="Dinheiro">Dinheiro</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Observações
                </label>
                <div className="relative">
                  <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Instruções de entrega, troco, observações gerais..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* FLUXO "NÃO": QUESTIONÁRIO DE PRODUTOS E MOTIVOS DE RECUSA */
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-sm">
                  <XCircle className="w-4 h-4" />
                  <span>Motivos de Não Fechamento / Rejeição de Produtos</span>
                </div>
                <button
                  type="button"
                  onClick={handleAddProductLine}
                  className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar Produto
                </button>
              </div>

              {/* MOTIVO GERAL DE NÃO FECHAMENTO */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Motivo Principal de Não Fechamento
                </label>
                <select
                  value={unclosedReason}
                  onChange={e => setUnclosedReason(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
                >
                  <option value="Preço">Preço</option>
                  <option value="Falta de Estoque">Falta de Estoque</option>
                  <option value="Apenas Dúvida">Apenas Dúvida</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              {/* LISTA DE PRODUTOS PRÉ-PREENCHIDOS E ADICIONADOS */}
              <div className="space-y-3 pt-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Produtos Discutidos / Rejeitados na Conversa
                </label>

                {rejections.length === 0 ? (
                  <p className="text-xs italic text-slate-400 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    Nenhum produto listado. Clique em "Adicionar Produto" para registrar um item.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {rejections.map((item, index) => (
                      <div
                        key={index}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          item.selected
                            ? 'bg-slate-50 dark:bg-slate-950/80 border-amber-500/40 dark:border-amber-500/30'
                            : 'bg-slate-100/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={() => handleToggleSelected(index)}
                            className="w-4 h-4 text-red-600 rounded border-slate-300 dark:border-slate-700 focus:ring-red-500 cursor-pointer"
                            title="Marcar produto como rejeitado"
                          />

                          <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={item.product_name}
                              onChange={e =>
                                handleUpdateRejection(index, 'product_name', e.target.value)
                              }
                              placeholder="Nome do produto..."
                              className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                            />

                            <select
                              value={item.reason}
                              onChange={e =>
                                handleUpdateRejection(index, 'reason', e.target.value)
                              }
                              className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
                            >
                              <option value="Preço">Preço</option>
                              <option value="Falta de Estoque">Falta de Estoque</option>
                              <option value="Apenas Dúvida">Apenas Dúvida</option>
                              <option value="Outro">Outro</option>
                            </select>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveProductLine(index)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition cursor-pointer"
                            title="Remover linha de produto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {item.selected && (
                          <div className="mt-2 pl-7">
                            <input
                              type="text"
                              value={item.notes}
                              onChange={e =>
                                handleUpdateRejection(index, 'notes', e.target.value)
                              }
                              placeholder="Observações adicionais da recusa (opcional)..."
                              className="w-full px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-[11px] text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-red-500"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* RODAPÉ E BOTÃO DE ENVIO */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs text-white shadow-lg flex items-center gap-2 transition cursor-pointer ${
                gerouEntrega
                  ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                  : 'bg-red-600 hover:bg-red-500 shadow-red-600/30'
              } ${isSubmitting ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Concluir Revisão</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
