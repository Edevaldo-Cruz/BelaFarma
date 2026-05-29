import React, { useState } from 'react';
import { X, CheckCircle2, FileText, Calendar as CalendarIcon, Save } from 'lucide-react';
import { Order, OrderStatus, Boleto, BoletoStatus, User } from '../types';
import { useToast } from './ToastContext';

interface OrderStatusModalProps {
  user: User;
  order: Order;
  onClose: () => void;
  onUpdate: (order: Order) => void;
  onUpdateBoletos: (orderId: string, boletos: Boleto[]) => void;
}

export const OrderStatusModal: React.FC<OrderStatusModalProps> = ({ user, order, onClose, onUpdate, onUpdateBoletos }) => {
  const { addToast } = useToast();
  const [tempStatus, setTempStatus] = useState<OrderStatus>(order.status);
  const [invoiceInput, setInvoiceInput] = useState(order.invoiceNumber || '');
  const [receiptDateInput, setReceiptDateInput] = useState(order.receiptDate || new Date().toISOString().split('T')[0]);
  
  const [boletosForConfirmation, setBoletosForConfirmation] = useState<Boleto[]>([]);
  const [isBoletoModalOpen, setIsBoletoModalOpen] = useState(false);

  const generateAndSaveBoletos = (fullOrderData: Order) => {
    if (!fullOrderData.installments || fullOrderData.installments.length === 0) {
      onUpdateBoletos(fullOrderData.id, []);
      return;
    }
    const boletos: Boleto[] = fullOrderData.installments.map((inst, index) => ({
      id: `${fullOrderData.id}-boleto-${index + 1}`,
      order_id: fullOrderData.id,
      due_date: inst.dueDate,
      value: inst.value,
      status: BoletoStatus.PENDENTE,
      installment_number: index + 1,
      invoice_number: fullOrderData.invoiceNumber || '',
    }));
    
    setBoletosForConfirmation(boletos);
    setIsBoletoModalOpen(true);
  };

  const handleConfirmBoletos = () => {
    onUpdateBoletos(order.id, boletosForConfirmation);
    setIsBoletoModalOpen(false);
    setBoletosForConfirmation([]);
    onClose();
  };

  const handleSaveStatus = async () => {
    if (!tempStatus) return;

    const updatedData: Partial<Order> = { status: tempStatus };
    let fullOrderData: Order;

    if (tempStatus === OrderStatus.ENTREGUE) {
      if (!invoiceInput) {
        addToast("O número da Nota Fiscal é obrigatório para entregas.", "warning");
        return;
      }
      updatedData.invoiceNumber = invoiceInput;
      updatedData.receiptDate = receiptDateInput;
    }
    
    fullOrderData = { ...order, ...updatedData };
    onUpdate(fullOrderData);

    if (tempStatus === OrderStatus.ENTREGUE) {
      // Criar nota fiscal automaticamente
      try {
        const response = await fetch('/api/orders/create-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order: fullOrderData,
            userId: user.id
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          if (result.isFogueteAmarelo) {
            addToast(`✅ Nota Fiscal criada! 🚀 Foguete Amarelo ativado com vencimento em 120 dias.`, "success");
          } else {
            addToast(`✅ Nota Fiscal ${fullOrderData.invoiceNumber} criada com sucesso!`, "success");
          }
        }
      } catch (error) {
        console.error('Erro ao criar nota fiscal:', error);
        addToast("⚠️ Pedido atualizado, mas houve erro ao criar a nota fiscal.", "warning");
      }
      
      generateAndSaveBoletos(fullOrderData);
    } else {
      onClose();
    }
  };

  const handleBoletoChange = (index: number, field: 'due_date' | 'value', value: string | number) => {
    const updatedBoletos = [...boletosForConfirmation];
    const boleto = updatedBoletos[index];

    if (field === 'due_date') {
      boleto.due_date = value as string;
    } else if (field === 'value') {
      const numericValue = typeof value === 'string' ? parseFloat(value) : value;
      if (!isNaN(numericValue)) {
        boleto.value = numericValue;
      }
    }
    
    setBoletosForConfirmation(updatedBoletos);
  };

  if (isBoletoModalOpen) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
          <div className="px-8 py-6 border-b border-slate-100">
            <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Confirmar Boletos Gerados</h2>
            <p className="text-sm text-slate-500">Confira os valores e vencimentos antes de salvar.</p>
          </div>
          <div className="p-8 space-y-4 max-h-[60vh] overflow-y-auto">
            {boletosForConfirmation.map((boleto, index) => (
              <div key={index} className="grid grid-cols-3 gap-4 items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="col-span-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Parcela {boleto.installment_number}</label>
                   <input 
                      type="date"
                      className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none font-bold text-sm"
                      value={boleto.due_date}
                      onChange={e => handleBoletoChange(index, 'due_date', e.target.value)}
                    />
                </div>
                <div className="col-span-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor</label>
                   <input 
                      type="number"
                      className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none font-black text-lg text-slate-900"
                      value={boleto.value}
                      onChange={e => handleBoletoChange(index, 'value', e.target.value)}
                    />
                </div>
              </div>
            ))}
          </div>
          <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100">
             <button 
              onClick={handleConfirmBoletos}
              className="w-full flex items-center justify-center gap-2 py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-[0.98] uppercase tracking-widest text-sm"
            >
              <CheckCircle2 className="w-5 h-5" />
              Salvar Boletos e Concluir
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Atualizar Situação</h2>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              Distribuidora: {order.distributor}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-red-600 transition-all">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Selecione o Novo Status</label>
            <div className="grid grid-cols-1 gap-2">
              {[OrderStatus.PENDENTE, OrderStatus.ENTREGUE, OrderStatus.CANCELADO, OrderStatus.DEVOLVIDO].map((s) => (
                <button
                  key={s}
                  onClick={() => setTempStatus(s)}
                  className={`flex items-center justify-between px-5 py-4 rounded-2xl border-2 transition-all font-black uppercase text-[10px] tracking-widest ${
                    tempStatus === s 
                      ? 'border-red-600 bg-red-50 text-red-700 shadow-inner' 
                      : 'border-slate-100 text-slate-400 hover:border-slate-200'
                  }`}
                >
                  <span>{s}</span>
                  {tempStatus === s && <CheckCircle2 className="w-4 h-4" />}
                </button>
              ))}
            </div>
          </div>

          {tempStatus === OrderStatus.ENTREGUE && (
            <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
               <div className="h-px bg-slate-100 w-full" />
               <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Número da Nota Fiscal (NF)*</label>
                <div className="relative">
                  <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input 
                    required
                    type="text"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold"
                    placeholder="Ex: 000.123.456"
                    value={invoiceInput}
                    onChange={e => setInvoiceInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data de Recebimento*</label>
                <div className="relative">
                  <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input 
                    type="date"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold"
                    value={receiptDateInput}
                    onChange={e => setReceiptDateInput(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          <button 
            onClick={handleSaveStatus}
            className="w-full flex items-center justify-center gap-2 py-4 bg-red-600 text-white rounded-2xl font-black shadow-xl shadow-red-100 hover:bg-red-700 transition-all active:scale-[0.98] uppercase tracking-widest text-sm"
          >
            <Save className="w-5 h-5" />
            Confirmar Alteração
          </button>
        </div>
      </div>
    </div>
  );
};
