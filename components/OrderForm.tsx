
import React, { useState, useEffect } from 'react';
import { X, Save, Calendar, Plus, Trash2, Calculator, DollarSign, User as UserIcon, ShieldAlert } from 'lucide-react';
import { Order, OrderStatus, PaymentMethod, Installment, User, UserRole } from '../types';

interface OrderFormProps {generateInstallments
  user: User;
  order?: Order;
  onSave: (data: Omit<Order, 'id'>) => void;
  onCancel: () => void;
}

export const OrderForm: React.FC<OrderFormProps> = ({ user, order, onSave, onCancel }) => {
  const isOperator = user.role === UserRole.OPERADOR;
  const isNewOrder = !order;

  const getTomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };

  // Helper to format numbers to currency string R$ 0.00
  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Helper to parse currency string back to number (interpreting input as cents)
  const parseCurrency = (value: string) => {
    // Remove all non-digit characters
    const cleaned = value.replace(/\D/g, '');
    const num = parseInt(cleaned, 10) || 0;
    return num / 100;
  };

  const [formData, setFormData] = useState({
    distributor: order?.distributor || '',
    seller: order?.seller || '',
    totalValue: order?.totalValue || 0,
    orderDate: order?.orderDate || new Date().toISOString().split('T')[0],
    arrivalForecast: order?.arrivalForecast || (order ? '' : getTomorrow()),
    status: order?.status || OrderStatus.PENDENTE,
    paymentMethod: order?.paymentMethod || PaymentMethod.BOLETO,
    paymentMonth: order?.paymentMonth || new Date().toLocaleString('pt-BR', { month: 'long' }).replace(/^\w/, (c) => c.toUpperCase()),
    invoiceNumber: order?.invoiceNumber || '',
    receiptDate: order?.receiptDate || '',
    notes: order?.notes || '',
  });

  const [boletoFile, setBoletoFile] = useState<File | null>(null);
  const [installments, setInstallments] = useState<Installment[]>(order?.installments || []);
  const [installmentCount, setInstallmentCount] = useState(order?.installments?.length || 1);
  const [daysArray, setDaysArray] = useState<number[]>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  useEffect(() => {
    if (isOperator) return;
    setDaysArray(prev => {
      const newArray = [...prev];
      if (newArray.length < installmentCount) {
        for (let i = newArray.length; i < installmentCount; i++) {
          const lastValue = newArray.length > 0 ? newArray[newArray.length - 1] : 0;
          newArray.push(lastValue + (newArray.length === 0 ? 15 : 30));
        }
      } else if (newArray.length > installmentCount) {
        return newArray.slice(0, installmentCount);
      }
      return newArray;
    });
  }, [installmentCount, isOperator]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalData = {
      ...formData,
      status: isNewOrder ? OrderStatus.PENDENTE : formData.status,
      installments: formData.paymentMethod === PaymentMethod.BOLETO ? installments : undefined,
      boletoFile: boletoFile,
    };
    onSave(finalData as any);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (isOperator && name !== 'status') return;
    if (isNewOrder && name === 'status') return;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'totalValue' ? parseCurrency(value) : value
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setBoletoFile(e.target.files[0]);
    }
  };

  const handleDayChange = (index: number, value: string) => {
    if (isOperator) return;
    const newDays = [...daysArray];
    newDays[index] = parseInt(value) || 0;
    setDaysArray(newDays);
  };

  const generateInstallments = () => {
    if (isOperator) return;
    const baseDate = new Date(formData.orderDate);
    // Ajuste para o fuso horário local
    const timezoneOffset = baseDate.getTimezoneOffset() * 60000;
    const localBaseDate = new Date(baseDate.getTime() + timezoneOffset);

    const valuePerInstallment = parseFloat((formData.totalValue / installmentCount).toFixed(2));
    const newInstallments: Installment[] = [];
    
    // Assegura que o daysArray tenha o tamanho correto
    const currentDays = [...daysArray];
    while(currentDays.length < installmentCount) {
        const lastValue = currentDays.length > 0 ? currentDays[currentDays.length - 1] : 0;
        currentDays.push(lastValue + 30);
    }
    if(currentDays.length > installmentCount) {
      currentDays.splice(installmentCount);
    }
    setDaysArray(currentDays);

    for (let i = 0; i < installmentCount; i++) {
      const dueDate = new Date(localBaseDate);
      const daysToAdd = currentDays[i] || (i + 1) * 30; // Fallback para o caso de o array não estar populado
      dueDate.setDate(localBaseDate.getDate() + daysToAdd);

      const finalValue = (i === installmentCount - 1)
        ? parseFloat((formData.totalValue - (valuePerInstallment * (installmentCount - 1))).toFixed(2))
        : valuePerInstallment;

      newInstallments.push({
        id: Math.random().toString(36).substr(2, 5),
        value: finalValue,
        dueDate: dueDate.toISOString().split('T')[0]
      });
    }
    setInstallments(newInstallments);
  };

  const updateInstallment = (index: number, field: keyof Installment, value: any) => {
    if (isOperator) return;
    const updated = [...installments];
    updated[index] = { ...updated[index], [field]: field === 'value' ? parseCurrency(value) : value };
    setInstallments(updated);
  };

  const removeInstallment = (index: number) => {
    if (isOperator) return;
    setInstallments(installments.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-200 border border-slate-100">
        <div className={`px-8 py-6 border-b border-slate-100 flex items-center justify-between ${isOperator ? 'bg-amber-50/50' : 'bg-red-50/50'}`}>
          <div>
            <h2 className={`text-2xl font-black tracking-tight ${isOperator ? 'text-amber-700' : 'text-red-700'}`}>
              {isOperator ? 'ATUALIZAÇÃO DE STATUS' : (order ? 'EDITAR PEDIDO' : 'NOVO REGISTRO DE COMPRA')}
            </h2>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1 flex items-center gap-2">
              {isOperator ? (
                <><ShieldAlert className="w-3.5 h-3.5" /> Você possui permissão apenas para atualizar o status.</>
              ) : 'Pressione ENTER para salvar ou ESC para fechar'}
            </p>
          </div>
          <button onClick={onCancel} className="p-2 text-slate-400 hover:text-red-700 hover:bg-red-100 rounded-full transition-all">
            <X className="w-7 h-7" />
          </button>
        </div>

        <form onSubmit={handleSubmit} id="order-form" className="p-8 overflow-y-auto space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Distribuidora / Laboratório*</label>
              <input 
                required
                autoFocus
                disabled={isOperator}
                type="text" 
                name="distributor"
                value={formData.distributor}
                onChange={handleChange}
                placeholder="Ex: Panarello, SantaCruz..."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 focus:bg-white outline-none transition-all font-bold disabled:opacity-60"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Vendedor / Contato*</label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  required
                  disabled={isOperator}
                  type="text" 
                  name="seller"
                  value={formData.seller}
                  onChange={handleChange}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none transition-all font-bold disabled:opacity-60"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Valor Total (R$)*</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">R$</span>
                <input 
                  required
                  disabled={isOperator}
                  type="text" 
                  step="0.01"
                  name="totalValue"
                  value={formatCurrency(formData.totalValue)}
                  onChange={handleChange}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-black text-slate-900 text-lg disabled:opacity-60"
                />
              </div>
            </div>
            {/* Resto do formulário mantido conforme original */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Data da Compra*</label>
              <input required disabled={isOperator} type="date" name="orderDate" value={formData.orderDate} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Previsão de Chegada*</label>
              <input required disabled={isOperator} type="date" name="arrivalForecast" value={formData.arrivalForecast} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold text-red-600" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Forma de Pagamento*</label>
              <select required disabled={isOperator} name="paymentMethod" value={formData.paymentMethod} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold">
                {Object.values(PaymentMethod).map(m => (<option key={m} value={m}>{m}</option>))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Status do Pedido {isNewOrder && "(Automático)"}</label>
              <select required disabled={isNewOrder} name="status" value={formData.status} onChange={handleChange} className={`w-full px-4 py-3 border-2 rounded-2xl outline-none font-black text-slate-900 shadow-sm transition-all ${isNewOrder ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' : 'bg-white border-amber-400 focus:ring-2 focus:ring-red-500'}`}>
                {Object.values(OrderStatus).map(s => (<option key={s} value={s}>{s}</option>))}
              </select>
            </div>
            {!isNewOrder && (
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Número da Nota Fiscal*</label>
                <input required disabled={isOperator} type="text" name="invoiceNumber" value={formData.invoiceNumber} onChange={handleChange} className="w-full px-4 py-3 bg-white border-2 border-red-100 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-black text-slate-900" />
              </div>
            )}
          </div>

          {formData.paymentMethod === PaymentMethod.BOLETO && !isOperator && (
            <div className="p-6 bg-slate-50 rounded-[2rem] border border-slate-200 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <h3 className="font-black text-sm uppercase tracking-wider text-red-700 flex items-center gap-2"><Calculator className="w-5 h-5" /> Parcelamento</h3>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Anexar Boleto</label>
                  <input 
                    type="file" 
                    onChange={handleFileChange} 
                    className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100"
                  />
                </div>
              </div>
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Qtd. Parcelas</label>
                  <select value={installmentCount} onChange={(e) => setInstallmentCount(parseInt(e.target.value))} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none font-bold">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12].map(num => (<option key={num} value={num}>{num}x</option>))}
                  </select>
                </div>
                <button type="button" onClick={generateInstallments} className="px-6 py-2.5 bg-red-600 text-white rounded-xl font-black text-[10px] uppercase">Gerar Parcelas</button>
              </div>

              {installments.length > 0 && (
                <div className="mt-6 space-y-4">
                   <div className="grid grid-cols-4 gap-2 items-center text-[10px] font-black text-slate-400 uppercase ml-1">
                      <div className="col-span-1">Parcela</div>
                      <div className="col-span-1">Dias</div>
                      <div className="col-span-2">Vencimento</div>
                  </div>
                  {installments.map((inst, index) => (
                    <div key={index} className="grid grid-cols-4 gap-2 items-center">
                       <div className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-xl col-span-1">
                          <span className="text-sm font-black text-slate-700">{index + 1}x</span>
                          <input
                            type="text"
                            value={formatCurrency(inst.value)}
                            onChange={(e) => updateInstallment(index, 'value', parseCurrency(e.target.value))}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-900 outline-none"
                          />
                      </div>
                      <div className="col-span-1">
                         <input
                          type="number"
                          value={daysArray[index] || ''}
                          onChange={(e) => handleDayChange(index, e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-900 outline-none"
                        />
                      </div>
                       <div className="flex items-center gap-2 col-span-2">
                        <input
                          type="date"
                          readOnly
                          value={inst.dueDate}
                          className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold text-slate-500 outline-none cursor-not-allowed"
                        />
                        <button type="button" onClick={() => removeInstallment(index)} className="p-2 text-slate-400 hover:text-red-700">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                   <button type="button" onClick={generateInstallments} className="w-full mt-2 px-6 py-2.5 bg-blue-500 text-white rounded-xl font-black text-[10px] uppercase">Aplicar Dias</button>
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Observações</label>
            <textarea name="notes" disabled={isOperator} rows={2} value={formData.notes} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none resize-none font-medium" />
          </div>
        </form>

        <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-4">
          <button type="button" onClick={onCancel} className="px-6 py-3 text-xs font-black text-slate-400 uppercase">Cancelar (ESC)</button>
          <button form="order-form" type="submit" className="flex items-center gap-2 px-10 py-4 bg-red-600 text-white rounded-2xl font-black uppercase shadow-xl transition-all active:scale-[0.98]">
            <Save className="w-5 h-5" /> Salvar (ENTER)
          </button>
        </div>
      </div>
    </div>
  );
};
