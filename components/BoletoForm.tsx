
import React, { useState, useEffect, useCallback } from 'react';
import { X, Save } from 'lucide-react'; // Removed Calendar, DollarSign, UserIcon, ShieldAlert imports
import { Boleto, BoletoStatus, Order, User, UserRole } from '../types';

interface BoletoFormProps {
  user: User;
  onSave: (data: Partial<Boleto>) => void; // Removed boletoFile from type
  onCancel: () => void;
  orders: Order[]; // Orders might not be needed anymore if no order_id is selected
}

// Helper to format numbers to currency string R$ 0.00
const formatCurrency = (value: number) => {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

// Helper to parse currency string back to number (interpreting input as cents)
const parseCurrency = (value: string) => {
  // Remove all non-digit characters
  const cleaned = value.replace(/\D/g, '');
  const num = parseInt(cleaned, 10) || 0;
  return num / 100; // Interpret as cents
};

export const BoletoForm: React.FC<BoletoFormProps> = ({ user, onSave, onCancel, orders }) => {
  const isOperator = user.role === UserRole.OPERADOR;

  const [formData, setFormData] = useState({
    supplierName: '', // New field for free-text supplier
    due_date: new Date().toISOString().split('T')[0],
    value: 0,
    status: BoletoStatus.PENDENTE,
  });
  
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const finalData = {
      ...formData,
      // order_id will not be part of formData if a free text supplier is used
      // boletoFile: boletoFile, // Removed
    };
    onSave(finalData as any);
  }, [formData, onSave]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter' && e.ctrlKey) { // Add CTRL + ENTER to save
        handleSubmit(e as unknown as React.FormEvent);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, handleSubmit]); // handleSubmit is now a stable dependency

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (isOperator) return; // Operators cannot edit this form
    setFormData(prev => ({
      ...prev,
      [name]: name === 'value' ? parseCurrency(value) : value // Use parseCurrency for value field
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-200 border border-slate-100">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-red-50/50">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-red-700">NOVO BOLETO</h2>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Pressione CTRL + ENTER para salvar ou ESC para fechar</p>
          </div>
          <button onClick={onCancel} className="p-2 text-slate-400 hover:text-red-700 hover:bg-red-100 rounded-full transition-all">
            <X className="w-7 h-7" />
          </button>
        </div>

        <form onSubmit={handleSubmit} id="boleto-form" className="p-8 overflow-y-auto space-y-8">
          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Fornecedor*</label>
              <input
                required
                type="text"
                name="supplierName"
                value={formData.supplierName}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold"
                placeholder="Nome do Fornecedor"
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
                  type="text" // Changed type to text for formatting
                  name="value"
                  value={formatCurrency(formData.value)} // Apply formatCurrency here
                  onChange={handleChange}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-black text-slate-900 text-lg"
                />
              </div>
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
