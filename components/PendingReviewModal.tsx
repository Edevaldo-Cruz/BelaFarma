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
  Sparkles,
  ShoppingBag,
  MapPin,
  DollarSign,
  CreditCard,
  User,
  AlertCircle,
  Send
} from 'lucide-react';
import { useToast } from './ToastContext';
import { Delivery, ProductIdentified, ChatMessage } from '../types';

export interface PendingReviewModalProps {
  delivery: Delivery | null;
  initialMode?: 'pedido' | 'cotacao';
  onClose: () => void;
  onSubmitSuccess?: (deliveryId: string) => void;
}

export const PendingReviewModal: React.FC<PendingReviewModalProps> = ({
  delivery,
  initialMode = 'pedido',
  onClose,
  onSubmitSuccess
}) => {
  const { addToast } = useToast();

  const [gerouEntrega, setGerouEntrega] = useState<boolean>(initialMode === 'pedido');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Estados dos Campos
  const [customerNameInput, setCustomerNameInput] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [items, setItems] = useState<string>('');
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('PIX');
  const [notes, setNotes] = useState<string>('');
  const [unclosedReason, setUnclosedReason] = useState<string>('Preço Alto');

  // Produtos Identificados pela IA (Editáveis)
  const [productsList, setProductsList] = useState<
    Array<{
      name: string;
      quantity: string;
      price: string;
      status: 'accepted' | 'rejected';
      rejection_reason: string;
      selected: boolean;
    }>
  >([]);

  // Histórico de mensagens do chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState<boolean>(false);

  useEffect(() => {
    if (!delivery) return;

    setGerouEntrega(initialMode === 'pedido');
    setCustomerNameInput(delivery.customer_name || delivery.wa_name || '');
    setDeliveryAddress(delivery.delivery_address || '');
    setItems(delivery.items || '');
    setTotalAmount(
      delivery.total_amount !== undefined && delivery.total_amount !== null
        ? String(delivery.total_amount)
        : ''
    );
    setPaymentMethod(delivery.payment_method || 'PIX');
    setNotes(delivery.notes || '');
    setUnclosedReason(delivery.unclosed_reason || 'Preço Alto');

    // Carregar mensagens do chat (se disponíveis)
    if (delivery.chat_messages && delivery.chat_messages.length > 0) {
      setChatMessages(delivery.chat_messages);
    } else {
      // Buscar mensagens do backend se não estiver no objeto
      fetchChatHistory(delivery.phone);
    }

    // Inicializar lista de produtos identificados pela IA
    if (delivery.products_identified && delivery.products_identified.length > 0) {
      setProductsList(
        delivery.products_identified.map(p => ({
          name: p.name,
          quantity: p.quantity || '1 un',
          price: p.price ? String(p.price) : '',
          status: p.status || (initialMode === 'pedido' ? 'accepted' : 'rejected'),
          rejection_reason: p.rejection_reason || 'Preço Alto',
          selected: true
        }))
      );
    } else {
      // Caso não haja produtos estruturados, tenta fazer o parse de discussed_products_json ou items
      let initialProds: string[] = [];
      if (delivery.discussed_products_json) {
        try {
          const parsed = JSON.parse(delivery.discussed_products_json);
          if (Array.isArray(parsed)) {
            initialProds = parsed.map(item => typeof item === 'string' ? item : (item?.name || String(item)));
          }
        } catch (e) {}
      }

      if (initialProds.length === 0 && delivery.items) {
        initialProds = delivery.items.split(',').map(s => s.trim()).filter(Boolean);
      }

      if (initialProds.length > 0) {
        setProductsList(
          initialProds.map(prodName => ({
            name: prodName,
            quantity: '1 un',
            price: '',
            status: initialMode === 'pedido' ? 'accepted' : 'rejected',
            rejection_reason: 'Preço Alto',
            selected: true
          }))
        );
      } else {
        setProductsList([
          {
            name: '',
            quantity: '1 un',
            price: '',
            status: initialMode === 'pedido' ? 'accepted' : 'rejected',
            rejection_reason: 'Preço Alto',
            selected: true
          }
        ]);
      }
    }
  }, [delivery, initialMode]);

  const fetchChatHistory = async (phone: string) => {
    setLoadingChat(true);
    try {
      const res = await fetch(`/api/deliveries/chat-history/${phone}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.messages) {
          setChatMessages(data.messages);
        }
      }
    } catch (e) {
      console.warn('Erro ao buscar histórico do chat:', e);
    } finally {
      setLoadingChat(false);
    }
  };

  if (!delivery) return null;

  const isPureNumeric = (val?: string) => !val || /^\d{10,}$/.test(val.trim());
  let displayName = 'Cliente WhatsApp';
  if (delivery.wa_name && delivery.wa_name.trim() && !isPureNumeric(delivery.wa_name)) {
    displayName = delivery.wa_name.trim();
  } else if (delivery.customer_name && delivery.customer_name.trim() && delivery.customer_name !== 'Cliente WhatsApp' && !isPureNumeric(delivery.customer_name)) {
    displayName = delivery.customer_name.trim();
  } else if (delivery.phone) {
    displayName = isPureNumeric(delivery.phone) ? `Cliente (${delivery.phone.slice(-4)})` : delivery.phone;
  }

  const isNewCustomer = delivery.is_new_customer === 1;

  // Duração formatada
  const durationSecs = delivery.chat_duration_seconds || 0;
  const durationMins = Math.floor(durationSecs / 60);
  const durationSecsRemainder = durationSecs % 60;
  const durationDisplay = durationMins > 0 ? `${durationMins}m ${durationSecsRemainder}s` : `${durationSecs}s`;

  // Manipulação da lista de produtos
  const handleAddProductLine = () => {
    setProductsList(prev => [
      ...prev,
      {
        name: '',
        quantity: '1 un',
        price: '',
        status: gerouEntrega ? 'accepted' : 'rejected',
        rejection_reason: 'Preço Alto',
        selected: true
      }
    ]);
  };

  const handleRemoveProductLine = (index: number) => {
    setProductsList(prev => prev.filter((_, i) => i !== index));
  };

  const handleToggleSelected = (index: number) => {
    setProductsList(prev =>
      prev.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item))
    );
  };

  const handleUpdateProduct = (index: number, field: string, value: any) => {
    setProductsList(prev =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const activeProducts = productsList.filter(p => p.selected && p.name.trim() !== '');

      const bodyData = {
        gerou_entrega: gerouEntrega,
        classification_type: gerouEntrega ? 'pedido' : 'cotacao',
        customer_name: customerNameInput || displayName,
        delivery_address: gerouEntrega ? deliveryAddress : null,
        items: items || activeProducts.map(p => `${p.quantity} ${p.name}`).join(', '),
        total_amount: totalAmount ? parseFloat(totalAmount) : 0,
        payment_method: paymentMethod,
        unclosed_reason: gerouEntrega ? null : unclosedReason,
        notes,
        products_identified: activeProducts,
        rejections: gerouEntrega
          ? []
          : activeProducts
              .filter(p => p.status === 'rejected')
              .map(p => ({
                product_name: p.name,
                reason: p.rejection_reason || unclosedReason,
                notes: `Qtde: ${p.quantity} | Preço: ${p.price || 'N/I'}`
              }))
      };

      const res = await fetch(`/api/deliveries/${delivery.id}/submit-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addToast(
          gerouEntrega
            ? '✅ Pedido de entrega confirmado com sucesso!'
            : '📊 Cotação auditada e registrada nos relatórios!',
          'success'
        );
        if (onSubmitSuccess) {
          onSubmitSuccess(delivery.id);
        }
        onClose();
      } else {
        throw new Error(data.error || 'Erro ao enviar auditoria.');
      }
    } catch (err: any) {
      console.error('[PendingReviewModal] Erro ao enviar:', err);
      addToast(err.message || 'Falha ao salvar auditoria.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* ── CABEÇALHO DO MODAL ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80 shrink-0">
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-2xl border ${
              gerouEntrega
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            }`}>
              {gerouEntrega ? <ShoppingBag className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white uppercase tracking-tight">
                  {gerouEntrega ? '🛵 Confirmar Pedido de Entrega' : '💬 Confirmar Auditoria de Cotação'}
                </h3>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  gerouEntrega ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {gerouEntrega ? 'Pedido' : 'Cotação'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                <span>Cliente: <strong className="text-white">{displayName}</strong></span>
                <span>•</span>
                <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-slate-500" /> {delivery.phone}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── CORPO DO MODAL (DUAS COLUNAS) ─────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden">
          {/* ── COLUNA ESQUERDA: HISTÓRICO DA CONVERSA (CHAT BUBBLES) ──────── */}
          <div className="lg:col-span-5 border-r border-slate-800/80 bg-slate-950/60 p-4 flex flex-col h-[400px] lg:h-auto overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-400" /> Conversa do WhatsApp
              </span>
              <span className="text-[10px] text-slate-500 font-semibold">Últimas mensagens</span>
            </div>

            {/* Lista de Mensagens */}
            <div className="flex-1 overflow-y-auto space-y-3 pt-4 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
              {chatMessages.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs italic">
                  {loadingChat ? 'Carregando conversa...' : 'Nenhum histórico de mensagens encontrado para esta conversa.'}
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div
                    key={msg.id || idx}
                    className={`flex flex-col ${msg.fromMe ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-md space-y-1 ${
                        msg.fromMe
                          ? 'bg-emerald-950/80 text-emerald-100 border border-emerald-800/50 rounded-br-none'
                          : 'bg-slate-900 text-slate-200 border border-slate-800 rounded-bl-none'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 text-[10px] font-bold opacity-75 pb-0.5 border-b border-white/10">
                        <span className={msg.fromMe ? 'text-emerald-300' : 'text-amber-400'}>
                          {msg.sender}
                        </span>
                        <span className="text-slate-400 font-mono">{msg.time}</span>
                      </div>
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── COLUNA DIREITA: FORMULÁRIO & PRODUTOS IDENTIFICADOS ─────────── */}
          <div className="lg:col-span-7 p-5 overflow-y-auto space-y-5 bg-slate-900">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Seleção do Tipo de Registro */}
              <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Resultado deste atendimento:</span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setGerouEntrega(true)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      gerouEntrega
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>🛵 Pedido Fechado</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGerouEntrega(false)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      !gerouEntrega
                        ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>💬 Cotação Não Fechada</span>
                  </button>
                </div>
              </div>

              {/* ── SEÇÃO: PRODUTOS IDENTIFICADOS PELA IA (CONFIRMAÇÃO DO ATENDENTE) ── */}
              <div className="space-y-3 bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" /> Produtos Identificados pela IA ({productsList.filter(p => p.selected).length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddProductLine}
                    className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Produto</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {productsList.map((prod, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border transition ${
                        prod.selected
                          ? 'bg-slate-900 border-slate-700'
                          : 'bg-slate-900/40 border-slate-800/60 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {/* Checkbox de confirmação */}
                        <input
                          type="checkbox"
                          checked={prod.selected}
                          onChange={() => handleToggleSelected(idx)}
                          className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                        />

                        {/* Nome do Produto */}
                        <input
                          type="text"
                          placeholder="Nome do produto ou medicamento"
                          value={prod.name}
                          onChange={(e) => handleUpdateProduct(idx, 'name', e.target.value)}
                          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                        />

                        {/* Quantidade */}
                        <input
                          type="text"
                          placeholder="Qtde"
                          value={prod.quantity}
                          onChange={(e) => handleUpdateProduct(idx, 'quantity', e.target.value)}
                          className="w-20 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white text-center focus:outline-none focus:border-emerald-500"
                        />

                        {/* Preço (opcional) */}
                        <input
                          type="number"
                          step="0.01"
                          placeholder="R$"
                          value={prod.price}
                          onChange={(e) => handleUpdateProduct(idx, 'price', e.target.value)}
                          className="w-20 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white text-right focus:outline-none focus:border-emerald-500 font-mono"
                        />

                        {/* Botão Remover */}
                        <button
                          type="button"
                          onClick={() => handleRemoveProductLine(idx)}
                          className="p-1 text-slate-500 hover:text-rose-400 rounded transition"
                          title="Remover produto da lista"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Caso seja Cotação Não Fechada (Fluxo NÃO), permite definir motivo individual */}
                      {!gerouEntrega && prod.selected && (
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-800/60">
                          <span className="text-[11px] text-slate-400 font-semibold">Motivo da recusa deste item:</span>
                          <select
                            value={prod.rejection_reason}
                            onChange={(e) => handleUpdateProduct(idx, 'rejection_reason', e.target.value)}
                            className="bg-slate-950 border border-slate-800 text-[11px] rounded-lg px-2 py-1 text-amber-300 focus:outline-none"
                          >
                            <option value="Preço Alto">Preço Alto</option>
                            <option value="Falta de Estoque">Falta de Estoque</option>
                            <option value="Sem Resposta do Cliente">Sem Resposta</option>
                            <option value="Desistiu">Desistiu</option>
                            <option value="Outro">Outro Motivo</option>
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── SEÇÃO: CAMPOS ADICIONAIS DO ATENDIMENTO ───────────────────── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Nome do Cliente */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nome do Cliente</label>
                  <input
                    type="text"
                    value={customerNameInput}
                    onChange={(e) => setCustomerNameInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-xs rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    placeholder="Ex: Maria da Silva"
                  />
                </div>

                {/* Valor Total */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Valor Total (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-xs rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-emerald-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {gerouEntrega ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Endereço de Entrega */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Endereço de Entrega / Balcão</label>
                    <input
                      type="text"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-xs rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                      placeholder="Rua, Número, Bairro ou Balcão"
                    />
                  </div>

                  {/* Forma de Pagamento */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Forma de Pagamento</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-xs rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="Pix">Pix</option>
                      <option value="Cartão de Crédito">Cartão de Crédito</option>
                      <option value="Cartão de Débito">Cartão de Débito</option>
                      <option value="Dinheiro">Dinheiro</option>
                      <option value="Crediário">Crediário</option>
                      <option value="A combinar">A combinar</option>
                    </select>
                  </div>
                </div>
              ) : (
                /* Caso NÃO tenha gerado entrega (Cotação Perdida) */
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Motivo Geral do Não Fechamento</label>
                  <select
                    value={unclosedReason}
                    onChange={(e) => setUnclosedReason(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-xs rounded-xl px-3 py-2 text-rose-300 font-bold focus:outline-none focus:border-rose-500"
                  >
                    <option value="Preço Alto">Preço Alto</option>
                    <option value="Falta de Estoque">Falta de Estoque</option>
                    <option value="Sem Resposta do Cliente">Sem Resposta do Cliente</option>
                    <option value="Desistiu">Desistiu</option>
                    <option value="Apenas Cotação">Apenas Cotação</option>
                  </select>
                </div>
              )}

              {/* Observações */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Observação do Atendimento</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-xs rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  placeholder="Observação curta sobre o atendimento"
                />
              </div>

              {/* RODAPÉ E BOTOES DE SUBMIT */}
              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl text-xs transition cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`px-6 py-2.5 font-bold rounded-xl text-xs transition shadow-lg flex items-center space-x-2 cursor-pointer disabled:opacity-50 ${
                    gerouEntrega
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-900/30'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  <span>{isSubmitting ? 'Salvando...' : 'Salvar Auditoria'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
