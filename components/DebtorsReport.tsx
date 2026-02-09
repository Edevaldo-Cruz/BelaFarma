import React, { useState, useEffect } from 'react';
import { AlertTriangle, Phone, Eye, X, DollarSign, Clock, History, CheckCircle } from 'lucide-react';
import { DebtorReport, Customer, CustomerDebt } from '../types';

export const DebtorsReport: React.FC = () => {
  const [debtors, setDebtors] = useState<DebtorReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDebtor, setSelectedDebtor] = useState<Customer | null>(null);
  const [debtorDebts, setDebtorDebts] = useState<CustomerDebt[]>([]);
  const [allDebts, setAllDebts] = useState<CustomerDebt[]>([]); // Para histórico completo
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false); // Toggle para mostrar histórico
  const [paymentModalDebt, setPaymentModalDebt] = useState<CustomerDebt | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');

  const fetchDebtors = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/debtors-report');
      const data = await response.json();
      setDebtors(data);
    } catch (error) {
      console.error('Failed to fetch debtors:', error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchDebtors();
  }, []);

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  const totalDebt = debtors.reduce((acc, d) => acc + d.totalOwed, 0);

  const openDetails = async (debtor: DebtorReport) => {
    try {
      // Fetch full customer data
      const customerResp = await fetch(`/api/customers/${debtor.id}`);
      const customer = await customerResp.json();
      setSelectedDebtor(customer);

      // Fetch ALL debts (pending and paid)
      const debtsResp = await fetch(`/api/customers/${debtor.id}/debts`);
      const debts = await debtsResp.json();
      setAllDebts(debts); // Todos os débitos
      setDebtorDebts(debts.filter((d: CustomerDebt) => d.status !== 'Pago')); // Apenas pendentes
      
      setShowHistory(false); // Começa mostrando apenas pendentes
      setIsModalOpen(true);
    } catch (error) {
      console.error('Error fetching debtor details:', error);
    }
  };

  const openPaymentModal = (debt: CustomerDebt) => {
    setPaymentModalDebt(debt);
    setPaymentAmount(debt.totalValue.toFixed(2));
  };

  const handlePartialPayment = async () => {
    if (!paymentModalDebt) return;
    
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Por favor, insira um valor válido.');
      return;
    }

    if (amount > paymentModalDebt.totalValue) {
      alert('O valor do pagamento não pode ser maior que o débito.');
      return;
    }

    try {
      if (amount >= paymentModalDebt.totalValue) {
        // Pagamento total - marca como pago
        const response = await fetch(`/api/customer-debts/${paymentModalDebt.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'Pago', paidAt: new Date().toISOString() }),
        });
        
        if (response.ok) {
          setPaymentModalDebt(null);
          setPaymentAmount('');
          fetchDebtors();
          if (selectedDebtor) {
            const debtsResp = await fetch(`/api/customers/${selectedDebtor.id}/debts`);
            const debts = await debtsResp.json();
            setAllDebts(debts);
            setDebtorDebts(debts.filter((d: CustomerDebt) => d.status !== 'Pago'));
          }
        }
      } else {
        // Pagamento parcial - reduz o valor do débito
        const newValue = paymentModalDebt.totalValue - amount;
        const response = await fetch(`/api/customer-debts/${paymentModalDebt.id}/partial-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            paymentAmount: amount,
            newTotalValue: newValue
          }),
        });
        
        if (response.ok) {
          setPaymentModalDebt(null);
          setPaymentAmount('');
          fetchDebtors();
          if (selectedDebtor) {
            const debtsResp = await fetch(`/api/customers/${selectedDebtor.id}/debts`);
            const debts = await debtsResp.json();
            setAllDebts(debts);
            setDebtorDebts(debts.filter((d: CustomerDebt) => d.status !== 'Pago'));
          }
        }
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      alert('Erro ao processar pagamento.');
    }
  };

  const handleMarkAsPaid = async (debtId: string) => {
    try {
      const response = await fetch(`/api/customer-debts/${debtId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Pago', paidAt: new Date().toISOString() }),
      });
      if (response.ok) {
        // Refresh everything
        fetchDebtors();
        if (selectedDebtor) {
          const debtsResp = await fetch(`/api/customers/${selectedDebtor.id}/debts`);
          const debts = await debtsResp.json();
          setAllDebts(debts);
          setDebtorDebts(debts.filter((d: CustomerDebt) => d.status !== 'Pago'));
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
            <AlertTriangle className="w-8 h-8 text-red-600" />
            Relatório de Devedores
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-bold italic text-sm">
            Clientes com pendências de crediário, ordenados do maior para o menor.
          </p>
        </div>
      </header>

      {/* Summary Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-red-500 to-red-700 rounded-3xl p-6 text-white shadow-lg">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="w-6 h-6" />
            <span className="text-sm font-bold uppercase opacity-80">Total a Receber</span>
          </div>
          <p className="text-3xl font-black">{formatCurrency(totalDebt)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border-2 border-slate-100 dark:border-slate-700 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
            <span className="text-sm font-bold uppercase text-slate-500">Clientes Devedores</span>
          </div>
          <p className="text-3xl font-black text-slate-800 dark:text-white">{debtors.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border-2 border-slate-100 dark:border-slate-700 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="w-6 h-6 text-red-600" />
            <span className="text-sm font-bold uppercase text-slate-500">Com Atraso</span>
          </div>
          <p className="text-3xl font-black text-red-600">{debtors.filter(d => d.hasOverdue).length}</p>
        </div>
      </div>

      {/* Debtors List */}
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border-2 border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400">Carregando...</div>
        ) : debtors.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <DollarSign className="w-8 h-8 text-emerald-600" />
            </div>
            <p className="text-lg font-bold text-emerald-600">Nenhum devedor!</p>
            <p className="text-sm text-slate-500">Todos os crediários estão em dia.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {debtors.map((debtor, index) => (
              <div
                key={debtor.id}
                className={`p-6 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                  debtor.hasOverdue ? 'bg-red-50/50 dark:bg-red-900/10' : ''
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-white ${
                    index === 0 ? 'bg-red-600' : index === 1 ? 'bg-amber-600' : index === 2 ? 'bg-orange-500' : 'bg-slate-400'
                  }`}>
                    {index + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-slate-800 dark:text-white">{debtor.name}</h3>
                      {debtor.hasOverdue ? (
                        <span className="px-2 py-0.5 bg-red-200 text-red-700 text-[10px] font-black uppercase rounded-lg">
                          Atrasado
                        </span>
                      ) : null}
                    </div>
                    {debtor.nickname && (
                      <p className="text-xs text-slate-500">"{debtor.nickname}"</p>
                    )}
                    {debtor.phone && (
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                        <Phone className="w-3 h-3" />
                        {debtor.phone}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs text-slate-500 uppercase font-bold">{debtor.debtCount} {debtor.debtCount === 1 ? 'compra' : 'compras'}</p>
                    <p className={`text-2xl font-black ${debtor.hasOverdue ? 'text-red-600' : 'text-amber-600'}`}>
                      {formatCurrency(debtor.totalOwed)}
                    </p>
                  </div>
                  <button
                    onClick={() => openDetails(debtor)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    Ver Detalhes
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Details Modal */}
      {isModalOpen && selectedDebtor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-red-50 dark:bg-red-900/20">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">{selectedDebtor.name}</h2>
                {selectedDebtor.nickname && (
                  <p className="text-sm text-slate-500">"{selectedDebtor.nickname}"</p>
                )}
                {selectedDebtor.phone && (
                  <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                    <Phone className="w-4 h-4" />
                    {selectedDebtor.phone}
                  </p>
                )}
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-xl">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Toggle History Button */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex gap-2">
              <button
                onClick={() => setShowHistory(false)}
                className={`flex-1 py-2 px-4 rounded-xl font-bold text-sm transition-colors ${
                  !showHistory
                    ? 'bg-red-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                Débitos Pendentes ({debtorDebts.length})
              </button>
              <button
                onClick={() => setShowHistory(true)}
                className={`flex-1 py-2 px-4 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 ${
                  showHistory
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                <History className="w-4 h-4" />
                Histórico Completo ({allDebts.length})
              </button>
            </div>

            {/* Debts */}
            <div className="p-6">
              {!showHistory ? (
                // Débitos Pendentes
                <>
                  <h3 className="text-sm font-black text-slate-500 uppercase mb-4">Débitos Pendentes</h3>
                  {debtorDebts.length === 0 ? (
                    <p className="text-center text-emerald-600 font-bold py-4">
                      Todos os débitos foram pagos!
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {debtorDebts.map(debt => (
                        <div 
                          key={debt.id} 
                          className={`p-4 rounded-xl border ${
                            debt.status === 'Atrasado'
                              ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30'
                              : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/30'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-xs text-slate-500">{formatDate(debt.purchaseDate)}</p>
                              <p className="font-bold text-slate-800 dark:text-white">{debt.description || 'Compra'}</p>
                              <p className="text-xs text-slate-500">Atendente: {debt.userName}</p>
                            </div>
                            <div className="text-right">
                              <p className={`font-black text-lg ${
                                debt.status === 'Atrasado' ? 'text-red-600' : 'text-amber-600'
                              }`}>
                                {formatCurrency(debt.totalValue)}
                              </p>
                              <span className={`inline-block px-2 py-1 rounded-lg text-xs font-bold uppercase ${
                                debt.status === 'Atrasado'
                                  ? 'bg-red-200 text-red-700'
                                  : 'bg-amber-200 text-amber-700'
                              }`}>
                                {debt.status}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => handleMarkAsPaid(debt.id)}
                              className="flex-1 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-colors"
                            >
                              Pagar Total
                            </button>
                            <button
                              onClick={() => openPaymentModal(debt)}
                              className="flex-1 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              Pagamento Parcial
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                // Histórico Completo
                <>
                  <h3 className="text-sm font-black text-slate-500 uppercase mb-4">Histórico Completo de Operações</h3>
                  {allDebts.length === 0 ? (
                    <p className="text-center text-slate-500 font-bold py-4">
                      Nenhuma operação registrada.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {allDebts.map(debt => (
                        <div 
                          key={debt.id} 
                          className={`p-4 rounded-xl border ${
                            debt.status === 'Pago'
                              ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-900/30'
                              : debt.status === 'Atrasado'
                              ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30'
                              : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/30'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-xs text-slate-500">{formatDate(debt.purchaseDate)}</p>
                              <p className="font-bold text-slate-800 dark:text-white">{debt.description || 'Compra'}</p>
                              <p className="text-xs text-slate-500">Atendente: {debt.userName}</p>
                              {debt.paidAt && (
                                <p className="text-xs text-emerald-600 font-bold mt-1 flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" />
                                  Pago em {formatDate(debt.paidAt)}
                                </p>
                              )}
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
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {paymentModalDebt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-xl font-black text-slate-900 dark:text-white">Pagamento Parcial</h3>
              <p className="text-sm text-slate-500 mt-1">
                {paymentModalDebt.description || 'Compra'} - {formatDate(paymentModalDebt.purchaseDate)}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Valor Total do Débito
                </label>
                <div className="text-2xl font-black text-red-600">
                  {formatCurrency(paymentModalDebt.totalValue)}
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Valor do Pagamento
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={paymentModalDebt.totalValue}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold text-lg focus:outline-none focus:border-blue-500"
                  placeholder="0.00"
                />
                <p className="text-xs text-slate-500 mt-2">
                  {parseFloat(paymentAmount) < paymentModalDebt.totalValue && parseFloat(paymentAmount) > 0
                    ? `Restará: ${formatCurrency(paymentModalDebt.totalValue - parseFloat(paymentAmount))}`
                    : parseFloat(paymentAmount) >= paymentModalDebt.totalValue
                    ? 'Débito será quitado totalmente'
                    : ''}
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex gap-3">
              <button
                onClick={() => {
                  setPaymentModalDebt(null);
                  setPaymentAmount('');
                }}
                className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handlePartialPayment}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors"
              >
                Confirmar Pagamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
