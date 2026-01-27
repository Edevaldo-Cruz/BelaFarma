import React, { useState, useEffect, useCallback } from 'react';
import { X, Save } from 'lucide-react';
import { Boleto, BoletoStatus, Order, User, UserRole } from '../types';

interface BoletoFormProps {
  user: User;
  onSave: (data: Partial<Boleto>) => void;
  onCancel: () => void;
  orders: Order[];
  boletoToEdit?: Boleto | null; // Added for editing
}

// Helper to format numbers to currency string R$ 0.00
const formatCurrency = (value: number) => {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

// Helper to parse currency string back to number
const parseCurrency = (value: string) => {
  const cleaned = value.replace(/\D/g, '');
  const num = parseInt(cleaned, 10) || 0;
  return num / 100;
};

export const BoletoForm: React.FC<BoletoFormProps> = ({ user, onSave, onCancel, orders, boletoToEdit }) => {
  const isEditMode = !!boletoToEdit;
  const isOperator = user.role === UserRole.OPERADOR;

  const [formData, setFormData] = useState({
    supplierName: '',
    invoice_number: '', // Added invoice number
    due_date: new Date().toISOString().split('T')[0],
    value: 0,
    status: BoletoStatus.PENDENTE,
  });

  useEffect(() => {
    if (isEditMode && boletoToEdit) {
      setFormData({
        supplierName: boletoToEdit.supplierName || '',
        invoice_number: boletoToEdit.invoice_number || '',
        due_date: new Date(boletoToEdit.due_date).toISOString().split('T')[0],
        value: boletoToEdit.value,
        status: boletoToEdit.status,
      });
    }
  }, [boletoToEdit, isEditMode]);
  
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const finalData: Partial<Boleto> = {
      ...formData,
      id: isEditMode && boletoToEdit ? boletoToEdit.id : undefined, // Keep ID for updates
    };
    onSave(finalData);
  }, [formData, onSave, isEditMode, boletoToEdit]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter' && e.ctrlKey) {
        handleSubmit(e as unknown as React.FormEvent);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, handleSubmit]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (isOperator && name !== 'status') return; // Operators can only change status
    
    setFormData(prev => ({
      ...prev,
      [name]: name === 'value' ? parseCurrency(value) : value
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-200 border border-slate-100 dark:border-slate-800">
        <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-red-50/50 dark:bg-red-900/10">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-red-700 dark:text-red-500">
              {isEditMode ? 'EDITAR BOLETO' : 'NOVO BOLETO'}
            </h2>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">Pressione CTRL + ENTER para salvar ou ESC para fechar</p>
          </div>
          <button onClick={onCancel} className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full transition-all">
            <X className="w-7 h-7" />
          </button>
        </div>

        <form onSubmit={handleSubmit} id="boleto-form" className="p-8 overflow-y-auto space-y-8">
          <div className="grid grid-cols-1 gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Fornecedor*</label>
                <input
                  required
                  type="text"
                  name="supplierName"
                  value={formData.supplierName}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold dark:text-slate-200 transition-all"
                  placeholder="Nome do Fornecedor"
                  readOnly={isOperator}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Nº da Nota Fiscal</label>
                <input
                  type="text"
                  name="invoice_number"
                  value={formData.invoice_number}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold dark:text-slate-200 transition-all"
                  placeholder="Opcional"
                  readOnly={isOperator}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Data de Vencimento*</label>
                <input required type="date" name="due_date" value={formData.due_date} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold dark:text-slate-200 transition-all" readOnly={isOperator} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Valor (R$)*</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400 dark:text-slate-500">R$</span>
                  <input
                    required
                    type="text"
                    name="value"
                    value={formatCurrency(formData.value)}
                    onChange={handleChange}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-black text-slate-900 dark:text-slate-100 text-lg transition-all"
                    readOnly={isOperator}
                  />
                </div>
              </div>
            </div>
             {isEditMode && (
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Status</label>
                <select 
                    name="status" 
                    value={formData.status} 
                    onChange={handleChange} 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold dark:text-slate-200 transition-all"
                >
                    {Object.values(BoletoStatus).map(s => <option key={s} value={s} className="dark:bg-slate-900">{s}</option>)}
                </select>
              </div>
            )}
          </div>
        </form>

        <div className="px-8 py-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-4">
          <button type="button" onClick={onCancel} className="px-6 py-3 text-xs font-black text-slate-400 dark:text-slate-500 uppercase hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Cancelar (ESC)</button>
          <button form="boleto-form" type="submit" className="flex items-center gap-2 px-10 py-4 bg-red-600 dark:bg-red-700 text-white rounded-2xl font-black uppercase shadow-xl transition-all active:scale-[0.98] hover:opacity-90">
            <Save className="w-5 h-5" /> {isEditMode ? 'Atualizar' : 'Salvar'} (CTRL + ENTER)
          </button>
        </div>
      </div>
    </div>
  );
};
