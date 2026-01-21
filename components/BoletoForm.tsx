
import React, { useState, useEffect } from 'react';
import { X, Save, Calendar, DollarSign, User as UserIcon, ShieldAlert } from 'lucide-react';
import { Boleto, BoletoStatus, Order, User, UserRole } from '../types';

interface BoletoFormProps {
  user: User;
  onSave: (data: Partial<Boleto> & { boletoFile?: File }) => void;
  onCancel: () => void;
  orders: Order[];
}

export const BoletoForm: React.FC<BoletoFormProps> = ({ user, onSave, onCancel, orders }) => {
  const isOperator = user.role === UserRole.OPERADOR;

  const [formData, setFormData] = useState({
    order_id: '',
    due_date: new Date().toISOString().split('T')[0],
    value: 0,
    status: BoletoStatus.PENDENTE,
    invoice_number: '',
  });

  const [boletoFile, setBoletoFile] = useState<File | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalData = {
      ...formData,
      boletoFile: boletoFile,
    };
    onSave(finalData as any);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (isOperator) return;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'value' ? parseFloat(value) : value
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setBoletoFile(e.target.files[0]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-200 border border-slate-100">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-red-50/50">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-red-700">NOVO BOLETO</h2>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Pressione ENTER para salvar ou ESC para fechar</p>
          </div>
          <button onClick={onCancel} className="p-2 text-slate-400 hover:text-red-700 hover:bg-red-100 rounded-full transition-all">
            <X className="w-7 h-7" />
          </button>
        </div>

        <form onSubmit={handleSubmit} id="boleto-form" className="p-8 overflow-y-auto space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Pedido Associado*</label>
              <select
                required
                name="order_id"
                value={formData.order_id}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold"
              >
                <option value="">Selecione um Pedido</option>
                {orders.map(order => (
                  <option key={order.id} value={order.id}>{order.distributor} - {order.invoiceNumber}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Número da Nota Fiscal</label>
              <input
                type="text"
                name="invoice_number"
                value={formData.invoice_number}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Data de Vencimento*</label>
              <input required type="date" name="due_date" value={formData.due_date} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold" />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Valor (R$)*</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">R$</span>
                <input
                  required
                  type="number"
                  step="0.01"
                  name="value"
                  value={formData.value}
                  onChange={handleChange}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-black text-slate-900 text-lg"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Anexar Boleto</label>
              <input
                type="file"
                onChange={handleFileChange}
                className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100"
              />
            </div>
          </div>
        </form>

        <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-4">
          <button type="button" onClick={onCancel} className="px-6 py-3 text-xs font-black text-slate-400 uppercase">Cancelar (ESC)</button>
          <button form="boleto-form" type="submit" className="flex items-center gap-2 px-10 py-4 bg-red-600 text-white rounded-2xl font-black uppercase shadow-xl transition-all active:scale-[0.98]">
            <Save className="w-5 h-5" /> Salvar (ENTER)
          </button>
        </div>
      </div>
    </div>
  );
};
