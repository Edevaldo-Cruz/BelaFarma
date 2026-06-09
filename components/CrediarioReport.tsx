import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CreditCard, Calendar, Search, CheckCircle } from 'lucide-react';
import { useToast } from './ToastContext';

interface CrediarioDigifarma {
  id: string;
  clientId: string;
  clientName: string;
  phone: string;
  amount: number;
  paidAmount: number;
  balance: number;
  dueDate: string;
  saleId: string;
}

export const CrediarioReport: React.FC = () => {
  const [records, setRecords] = useState<CrediarioDigifarma[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<CrediarioDigifarma | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const parseCurrency = (value: string) => {
    return Number(value.replace(/\D/g, '')) / 100;
  };

  const fetchCrediarioRecords = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/crediario');
      if (response.status === 503) {
        addToast('O servidor do Digifarma está Offline.', 'error');
        setRecords([]);
        return;
      }
      const data = await response.json();
      setRecords(data);
    } catch (error) {
      console.error('Failed to fetch crediario records:', error);
      addToast('Erro ao buscar crediários', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCrediarioRecords();
  }, []);

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const inSearch = searchTerm === '' || (r.clientName || '').toLowerCase().includes(searchTerm.toLowerCase());
      return inSearch;
    });
  }, [records, searchTerm]);

  const totalOpen = useMemo(() => {
    return filteredRecords.reduce((acc, r) => acc + r.balance, 0);
  }, [filteredRecords]);

  const handleOpenReceive = (record: CrediarioDigifarma) => {
    setSelectedRecord(record);
    setPaymentAmount(record.balance);
    setIsModalOpen(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleReceive = async () => {
    if (!selectedRecord) return;
    setIsProcessing(true);
    try {
      const response = await fetch('/api/crediario/receber', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crediarioId: selectedRecord.id, valorPago: paymentAmount })
      });
      
      if (response.status === 503) {
        addToast('O servidor do Digifarma está Offline.', 'error');
        return;
      }
      
      if (!response.ok) throw new Error('Erro ao baixar');
      addToast('Baixa realizada com sucesso no Digifarma!', 'success');
      setIsModalOpen(false);
      fetchCrediarioRecords();
    } catch (error) {
       addToast('Erro ao realizar baixa', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
            <CreditCard className="w-8 h-8" />
            Contas a Receber (Crediário)
          </h1>
          <p className="text-slate-500 font-bold italic text-sm">Vendas em aberto no Digifarma.</p>
        </div>
        <div className="flex items-center gap-2">
            <button onClick={fetchCrediarioRecords} className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm shadow-md">
              Atualizar
            </button>
        </div>
      </header>
      
      <div className="bg-white rounded-[2.5rem] border-2 border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 flex justify-between items-center bg-slate-50 border-b border-slate-100">
            <div>
                <p className="text-xs font-bold text-slate-400 uppercase">Total em Aberto</p>
                <p className="text-3xl font-black text-amber-600">{formatCurrency(totalOpen)}</p>
            </div>
            <div className="relative w-full max-w-sm">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                    type="text"
                    placeholder="Buscar por cliente..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 shadow-sm rounded-2xl font-bold outline-none focus:border-amber-500"
                />
            </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left responsive-table">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-400">Vencimento</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase text-slate-400">Cliente</th>
                <th className="px-8 py-4 text-right text-[10px] font-black uppercase text-slate-400">Total Venda</th>
                <th className="px-8 py-4 text-right text-[10px] font-black uppercase text-slate-400">Pendente</th>
                <th className="px-8 py-4 text-center text-[10px] font-black uppercase text-slate-400">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500 font-bold">Carregando dados do Digifarma...</td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500 font-bold">Nenhum crediário em aberto encontrado.</td>
                </tr>
              ) : (
                filteredRecords.map(record => (
                  <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-4 text-xs font-bold text-slate-500">
                      {record.dueDate ? new Date(record.dueDate).toLocaleDateString('pt-BR') : '-'}
                    </td>
                    <td className="px-8 py-4 font-black text-slate-800 uppercase">{record.clientName}</td>
                    <td className="px-8 py-4 text-right font-bold text-slate-400">{formatCurrency(record.amount)}</td>
                    <td className="px-8 py-4 text-right font-black text-red-600 text-lg">{formatCurrency(record.balance)}</td>
                    <td className="px-8 py-4 text-center">
                       <button onClick={() => handleOpenReceive(record)} className="inline-flex items-center gap-1 px-4 py-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-lg font-bold text-xs transition-colors">
                         <CheckCircle className="w-3.5 h-3.5" />
                         Dar Baixa
                       </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onKeyDown={(e) => e.key === 'Escape' && setIsModalOpen(false)}>
           <div className="bg-white w-full max-w-md rounded-[2rem] p-8 space-y-6 shadow-2xl">
              <div className="text-center space-y-2">
                 <h2 className="text-2xl font-black text-slate-900 uppercase">Receber Crediário</h2>
                 <p className="text-sm font-bold text-slate-500">{selectedRecord.clientName}</p>
              </div>
              
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
                 <span className="text-xs font-black text-slate-400 uppercase">Total Pendente</span>
                 <span className="text-xl font-black text-slate-900">{formatCurrency(selectedRecord.balance)}</span>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Valor a Receber (R$)*</label>
                <input 
                  ref={inputRef}
                  type="text" 
                  value={formatCurrency(paymentAmount)}
                  onChange={e => setPaymentAmount(parseCurrency(e.target.value))}
                  className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black text-3xl text-center outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4">
                 <button disabled={isProcessing} onClick={() => setIsModalOpen(false)} className="py-4 bg-slate-100 text-slate-600 rounded-xl font-black uppercase text-sm">Cancelar</button>
                 <button disabled={isProcessing || paymentAmount <= 0 || paymentAmount > selectedRecord.balance} onClick={handleReceive} className="py-4 bg-emerald-600 text-white rounded-xl font-black uppercase text-sm flex items-center justify-center gap-2 shadow-lg disabled:opacity-50">
                    {isProcessing ? 'Baixando...' : 'Confirmar'}
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};
