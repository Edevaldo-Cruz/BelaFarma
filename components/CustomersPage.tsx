import React, { useState, useEffect, useMemo } from 'react';
import { Users, Plus, Search, Edit2, Trash2, Phone, Mail, MapPin, X, Eye, AlertCircle } from 'lucide-react';
import { Customer, CustomerDebt, User } from '../types';
import { useToast } from './ToastContext';

interface CustomersPageProps {
  user: User;
  onLog: (action: string, details: string) => void;
}

export const CustomersPage: React.FC<CustomersPageProps> = ({ user, onLog }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [customerDebts, setCustomerDebts] = useState<CustomerDebt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useToast();
  
  // Form state
  const [form, setForm] = useState({
    name: '',
    nickname: '',
    cpf: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
    creditLimit: '150,00', // Default to 150,00
    dueDay: '',
  });

  // Currency Mask Handler
  const handleCurrencyMask = (value: string, setFunction: (val: string) => void) => {
    let numeric = value.replace(/\D/g, ''); // Remove all non-digits
    if (!numeric) {
      setFunction('');
      return;
    }
    const floatValue = parseInt(numeric, 10) / 100;
    const formatted = floatValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    setFunction(formatted);
  };

  const parseCurrency = (value: string): number => {
    const cleaned = value.replace(/\D/g, '');
    return (parseInt(cleaned, 10) || 0) / 100;
  };

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/customers');
      const data = await response.json();
      setCustomers(data);
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    if (!searchTerm) return customers;
    const term = searchTerm.toLowerCase();
    return customers.filter(c => 
      c.name.toLowerCase().includes(term) ||
      c.nickname?.toLowerCase().includes(term) ||
      c.cpf?.toLowerCase().includes(term) ||
      c.phone?.toLowerCase().includes(term)
    );
  }, [customers, searchTerm]);

  const resetForm = () => {
    setForm({ 
      name: '', nickname: '', cpf: '', phone: '', email: '', address: '', notes: '',
      creditLimit: '150,00', dueDay: '' 
    });
    setSelectedCustomer(null);
  };

  const openModal = (customer?: Customer) => {
    if (customer) {
      setSelectedCustomer(customer);
      setForm({
        name: customer.name,
        nickname: customer.nickname || '',
        cpf: customer.cpf || '',
        phone: customer.phone || '',
        email: customer.email || '',
        address: customer.address || '',
        notes: customer.notes || '',
        creditLimit: customer.creditLimit ? customer.creditLimit.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00',
        dueDay: customer.dueDay ? customer.dueDay.toString() : '',
      });
    } else {
      resetForm();
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      addToast('O nome é obrigatório.', 'warning');
      return;
    }

    setIsLoading(true);
    try {
      if (selectedCustomer) {
        // Update
        const updatePayload = {
          ...form,
          creditLimit: parseCurrency(form.creditLimit),
          dueDay: form.dueDay ? parseInt(form.dueDay, 10) : undefined,
        };
        const response = await fetch(`/api/customers/${selectedCustomer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        });
        if (response.ok) {
          onLog('Editou Cliente', `Cliente: ${form.name}`);
          fetchCustomers();
          setIsModalOpen(false);
          resetForm();
        }
      } else {
        // Create
        const newCustomer = {
          id: Date.now().toString(),
          ...form,
          creditLimit: parseCurrency(form.creditLimit),
          dueDay: form.dueDay ? parseInt(form.dueDay, 10) : undefined,
        };
        const response = await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newCustomer),
        });
        if (response.ok) {
          onLog('Cadastrou Cliente', `Cliente: ${form.name}`);
          fetchCustomers();
          setIsModalOpen(false);
          resetForm();
        }
      }
    } catch (error) {
      console.error('Error saving customer:', error);
      addToast('Erro ao salvar cliente.', 'error');
    }
    setIsLoading(false);
  };

  const handleDelete = async (customer: Customer) => {
    if (!confirm(`Tem certeza que deseja excluir o cliente "${customer.name}"?`)) return;
    
    try {
      const response = await fetch(`/api/customers/${customer.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        onLog('Excluiu Cliente', `Cliente: ${customer.name}`);
        fetchCustomers();
        addToast('Cliente excluído com sucesso.', 'success');
      } else {
        const data = await response.json();
        addToast(data.error || 'Erro ao excluir cliente.', 'error');
      }
    } catch (error) {
      console.error('Error deleting customer:', error);
      addToast('Erro ao excluir cliente.', 'error');
    }
  };

  const openDetailsModal = async (customer: Customer) => {
    setSelectedCustomer(customer);
    try {
      const response = await fetch(`/api/customers/${customer.id}/debts`);
      const debts = await response.json();
      setCustomerDebts(debts);
    } catch (error) {
      console.error('Error fetching customer debts:', error);
      setCustomerDebts([]);
    }
    setIsDetailsModalOpen(true);
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  const totalDebt = useMemo(() => {
    return customerDebts
      .filter(d => d.status !== 'Pago')
      .reduce((acc, d) => acc + d.totalValue, 0);
  }, [customerDebts]);

  const handleMarkAsPaid = async (debtId: string) => {
    try {
      const response = await fetch(`/api/customer-debts/${debtId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Pago', paidAt: new Date().toISOString() }),
      });
      if (response.ok) {
        // Refresh debts
        if (selectedCustomer) {
          const resp = await fetch(`/api/customers/${selectedCustomer.id}/debts`);
          const debts = await resp.json();
          setCustomerDebts(debts);
        }
      }
    } catch (error) {
      console.error('Error marking debt as paid:', error);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter flex items-center gap-3">
            <Users className="w-8 h-8" />
            Clientes
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-bold italic text-sm">
            Gerencie o cadastro de clientes.
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-2xl font-black text-sm uppercase hover:bg-red-700 transition-all shadow-lg"
        >
          <Plus className="w-5 h-5" />
          Novo Cliente
        </button>
      </header>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por nome, apelido, CPF ou telefone..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl font-bold text-sm outline-none focus:border-red-500 transition-all"
        />
      </div>

      {/* Customers Table */}
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border-2 border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50">
                <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-500">Nome</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-500">Apelido</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-500">Telefone</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-500">CPF</th>
                <th className="px-8 py-4 text-center text-[10px] font-black uppercase text-slate-500">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-8 py-12 text-center text-slate-400">
                    {searchTerm ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado.'}
                  </td>
                </tr>
              ) : (
                filteredCustomers.map(customer => (
                  <tr key={customer.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-8 py-4 font-bold text-slate-800 dark:text-white">{customer.name}</td>
                    <td className="px-8 py-4 text-sm text-slate-500">{customer.nickname || '-'}</td>
                    <td className="px-8 py-4 text-sm text-slate-500">
                      {customer.phone ? (
                        <span className="flex items-center gap-2">
                          <Phone className="w-4 h-4" />
                          {customer.phone}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-8 py-4 text-sm text-slate-500">{customer.cpf || '-'}</td>
                    <td className="px-8 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openDetailsModal(customer)}
                          className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors"
                          title="Ver Detalhes"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openModal(customer)}
                          className="p-2 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-xl transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(customer)}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h2 className="text-xl font-black text-slate-900 dark:text-white">
                {selectedCustomer ? 'Editar Cliente' : 'Novo Cliente'}
              </h2>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-2">Nome *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold outline-none focus:border-red-500"
                  placeholder="Nome completo"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-2">Apelido</label>
                <input
                  type="text"
                  value={form.nickname}
                  onChange={e => setForm({ ...form, nickname: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold outline-none focus:border-red-500"
                  placeholder="Apelido (opcional)"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-2">CPF</label>
                  <input
                    type="text"
                    value={form.cpf}
                    onChange={e => setForm({ ...form, cpf: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold outline-none focus:border-red-500"
                    placeholder="000.000.000-00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-2">Telefone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold outline-none focus:border-red-500"
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-2">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold outline-none focus:border-red-500"
                  placeholder="email@exemplo.com"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-2">Endereço</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold outline-none focus:border-red-500"
                  placeholder="Rua, número, bairro..."
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-2">Observações</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold outline-none focus:border-red-500 resize-none"
                  rows={3}
                  placeholder="Anotações sobre o cliente..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-2">Limite de Crédito</label>
                  <input
                    type="text"
                    value={form.creditLimit}
                    onChange={e => handleCurrencyMask(e.target.value, (val) => setForm({ ...form, creditLimit: val }))}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold outline-none focus:border-red-500 text-amber-600"
                    placeholder="R$ 0,00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-2">Dia de Vencimento</label>
                  <select
                    value={form.dueDay}
                    onChange={e => setForm({ ...form, dueDay: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold outline-none focus:border-red-500"
                  >
                    <option value="">Sem Vencimento</option>
                    {[...Array(31)].map((_, i) => (
                      <option key={i + 1} value={i + 1}>Dia {i + 1}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button
                onClick={() => { setIsModalOpen(false); resetForm(); }}
                className="px-6 py-3 text-slate-500 font-bold rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={isLoading}
                className="px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Details Modal */}
      {isDetailsModalOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">{selectedCustomer.name}</h2>
                {selectedCustomer.nickname && (
                  <p className="text-sm text-slate-500">"{selectedCustomer.nickname}"</p>
                )}
              </div>
              <button onClick={() => setIsDetailsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            {/* Customer Info */}
            <div className="p-6 grid grid-cols-2 gap-4 border-b border-slate-100 dark:border-slate-800">
              {selectedCustomer.phone && (
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <Phone className="w-4 h-4" />
                  {selectedCustomer.phone}
                </div>
              )}
              {selectedCustomer.email && (
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <Mail className="w-4 h-4" />
                  {selectedCustomer.email}
                </div>
              )}
              {selectedCustomer.address && (
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 col-span-2">
                  <MapPin className="w-4 h-4" />
                  {selectedCustomer.address}
                </div>
              )}
              {selectedCustomer.cpf && (
                <div className="text-sm text-slate-500">
                  <span className="font-bold">CPF:</span> {selectedCustomer.cpf}
                </div>
              )}
            </div>

            {/* Debt Summary */}
            {totalDebt > 0 && (
              <div className="p-6 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/30">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                  <div>
                    <p className="text-sm font-bold text-red-600 uppercase">Débito Total</p>
                    <p className="text-2xl font-black text-red-700">{formatCurrency(totalDebt)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Debts History */}
            <div className="p-6">
              <h3 className="text-sm font-black text-slate-500 uppercase mb-4">Histórico de Compras/Crediário</h3>
              {customerDebts.length === 0 ? (
                <p className="text-center text-slate-400 py-4">Nenhuma compra registrada.</p>
              ) : (
                <div className="space-y-3">
                  {customerDebts.map(debt => (
                    <div key={debt.id} className={`p-4 rounded-xl border ${
                      debt.status === 'Pago' 
                        ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-900/30' 
                        : debt.status === 'Atrasado'
                        ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30'
                        : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/30'
                    }`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs text-slate-500">{formatDate(debt.purchaseDate)}</p>
                          <p className="font-bold text-slate-800 dark:text-white">{debt.description || 'Compra'}</p>
                          <p className="text-xs text-slate-500">por {debt.userName}</p>
                        </div>
                        <div className="text-right">
                          <p className={`font-black text-lg ${
                            debt.status === 'Pago' ? 'text-emerald-600' : 
                            debt.status === 'Atrasado' ? 'text-red-600' : 'text-amber-600'
                          }`}>
                            {formatCurrency(debt.totalValue)}
                          </p>
                          <span className={`inline-block px-2 py-1 rounded-lg text-xs font-bold uppercase ${
                            debt.status === 'Pago' 
                              ? 'bg-emerald-200 text-emerald-700' 
                              : debt.status === 'Atrasado'
                              ? 'bg-red-200 text-red-700'
                              : 'bg-amber-200 text-amber-700'
                          }`}>
                            {debt.status}
                          </span>
                        </div>
                      </div>
                      {debt.status !== 'Pago' && (
                        <button
                          onClick={() => handleMarkAsPaid(debt.id)}
                          className="mt-3 w-full py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors"
                        >
                          Marcar como Pago
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
