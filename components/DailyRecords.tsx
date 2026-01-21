
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, Trash2, Receipt, ShoppingBag, Save, 
  AlertCircle, CheckCircle2, History, Calendar, Search, ChevronRight 
} from 'lucide-react';
import { User, DailyRecordEntry } from '../types';

interface DailyRecordsProps {
  user: User;
  onLog: (action: string, details: string) => void;
}

export const DailyRecords: React.FC<DailyRecordsProps> = ({ user, onLog }) => {
  const [activeTab, setActiveTab] = useState<'entry' | 'history'>('entry');
  const [expenses, setExpenses] = useState<Array<{ id: string, desc: string, val: number }>>([]);
  const [nonRegistered, setNonRegistered] = useState<Array<{ id: string, desc: string, val: number }>>([]);
  const [pixDiretoList, setPixDiretoList] = useState<Array<{ id: string, desc: string, val: number }>>([]);
  const [crediarioList, setCrediarioList] = useState<Array<{ id: string, client: string, val: number }>>([]);
  const [isSaved, setIsSaved] = useState(false);
  
  const [history, setHistory] = useState<DailyRecordEntry[]>([]);
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());

  const lastExpenseRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const savedTemp = localStorage.getItem('belafarma_daily_temp');
    if (savedTemp) {
      const data = JSON.parse(savedTemp);
      setExpenses(data.expenses || []);
      setNonRegistered(data.nonRegistered || []);
      setPixDiretoList(data.pixDiretoList || []);
      setCrediarioList(data.crediarioList || []);
    }
    const savedHistory = localStorage.getItem('belafarma_daily_history');
    if (savedHistory) setHistory(JSON.parse(savedHistory));
  }, []);

  const handleGlobalKeyDown = (e: React.KeyboardEvent) => {
    if (activeTab === 'entry') {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        handleSave();
      }
    }
  };

  const handleSave = async () => {
    const today = new Date().toISOString().split('T')[0];
    const data = { expenses, nonRegistered, pixDiretoList, crediarioList, date: today };
    localStorage.setItem('belafarma_daily_temp', JSON.stringify(data));

    // Save crediario records to the database
    for (const item of crediarioList) {
      try {
        await fetch('/api/crediario', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: item.id,
            date: new Date().toISOString(),
            client: item.client,
            value: item.val,
            userName: user.name,
          }),
        });
      } catch (error) {
        console.error('Failed to save crediario item:', error);
        // Optionally, show an error to the user
      }
    }
    
    const newEntry: DailyRecordEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      expenses,
      nonRegistered,
      pixDiretoList,
      crediarioList,
      userName: user.name
    };

    const updatedHistory = [newEntry, ...history.filter(h => h.date.split('T')[0] !== today)];
    setHistory(updatedHistory);
    localStorage.setItem('belafarma_daily_history', JSON.stringify(updatedHistory));

    const totalExp = expenses.reduce((s, e) => s + e.val, 0);
    const totalPix = pixDiretoList.reduce((s, p) => s + p.val, 0);
    const totalCred = crediarioList.reduce((s, c) => s + c.val, 0);
    const expDetails = expenses.map(e => `${e.desc}: ${formatCurrency(e.val)}`).join(', ');
    const prodDetails = nonRegistered.map(p => p.desc).join(', ');
    
    let logMsg = `Total Despesas: ${formatCurrency(totalExp)}, Total Pix Direto: ${formatCurrency(totalPix)}, Total Crediário: ${formatCurrency(totalCred)}.`;
    if (expenses.length > 0) logMsg += ` Despesas: [${expDetails}].`;
    if (pixDiretoList.length > 0) logMsg += ` Pix: [${pixDiretoList.map(p => `${p.desc}: ${formatCurrency(p.val)}`).join(', ')}].`;
    if (crediarioList.length > 0) logMsg += ` Crediário: [${crediarioList.map(c => `${c.client}: ${formatCurrency(c.val)}`).join(', ')}].`;
    if (nonRegistered.length > 0) logMsg += ` Produtos s/ Cadastro: [${prodDetails}].`;

    onLog('Lançamento Diário', logMsg);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const addExpense = () => {
    setExpenses([...expenses, { id: Date.now().toString(), desc: '', val: 0 }]);
    setTimeout(() => lastExpenseRef.current?.focus(), 50);
  };
  
  const addNonRegistered = () => setNonRegistered([...nonRegistered, { id: Date.now().toString(), desc: '', val: 0 }]);
  const removeExpense = (id: string) => setExpenses(expenses.filter(e => e.id !== id));
  const removeNonRegistered = (id: string) => setNonRegistered(nonRegistered.filter(p => p.id !== id));
  
  const addPixDireto = () => setPixDiretoList([...pixDiretoList, { id: Date.now().toString(), desc: '', val: 0 }]);
  const removePixDireto = (id: string) => setPixDiretoList(pixDiretoList.filter(p => p.id !== id));

  const addCrediario = () => setCrediarioList([...crediarioList, { id: Date.now().toString(), client: '', val: 0 }]);
  const removeCrediario = (id: string) => setCrediarioList(crediarioList.filter(c => c.id !== id));

  const filteredHistory = useMemo(() => {
    return history.filter(h => {
      const d = new Date(h.date);
      return (d.getMonth() + 1) === filterMonth && d.getFullYear() === filterYear;
    });
  }, [history, filterMonth, filterYear]);

  const totalMonthExpenses = useMemo(() => {
    return filteredHistory.reduce((acc, h) => acc + h.expenses.reduce((sum, e) => sum + e.val, 0), 0);
  }, [filteredHistory]);

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20" onKeyDown={handleGlobalKeyDown}>
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">LANÇAMENTOS DIÁRIOS</h1>
          <p className="text-slate-500 font-bold italic text-sm">Use CTRL + ENTER para salvar rapidamente.</p>
        </div>
        <div className="flex bg-white p-1 rounded-2xl border-2 border-slate-100 shadow-sm">
          <button onClick={() => setActiveTab('entry')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'entry' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-400'}`}>Lançar</button>
          <button onClick={() => setActiveTab('history')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'history' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-400'}`}>Histórico</button>
        </div>
      </header>

      {activeTab === 'entry' ? (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-[3rem] border-2 border-slate-100 shadow-xl space-y-6">
              <div className="flex items-center justify-between border-b-2 border-slate-50 pb-4">
                <div className="flex items-center gap-3 text-red-600 font-black uppercase text-sm">Despesas do Dia</div>
                <button onClick={addExpense} className="p-2 bg-red-50 text-red-600 rounded-xl"><Plus className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3">
                {expenses.map((exp, idx) => (
                  <div key={exp.id} className="flex gap-2">
                    <input 
                      ref={idx === expenses.length - 1 ? lastExpenseRef : null}
                      placeholder="Descrição..." className="flex-1 px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none" 
                      value={exp.desc} onChange={(e) => { const n = [...expenses]; n[idx].desc = e.target.value; setExpenses(n); }} 
                    />
                    <input 
                      placeholder="R$" type="text" 
                      className="w-32 px-4 py-3 bg-slate-50 border-none rounded-2xl font-black text-sm text-red-600 outline-none" 
                      value={formatCurrency(exp.val)} 
                      onChange={(e) => { const n = [...expenses]; n[idx].val = parseCurrency(e.target.value); setExpenses(n); }} 
                    />
                    <button onClick={() => removeExpense(exp.id)} className="p-2 text-slate-300"><Trash2 className="w-5 h-5" /></button>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-white p-8 rounded-[3rem] border-2 border-slate-100 shadow-xl space-y-6">
              <div className="flex items-center justify-between border-b-2 border-slate-50 pb-4">
                <div className="flex items-center gap-3 text-cyan-600 font-black uppercase text-sm">Pix Direto na Conta</div>
                <button onClick={addPixDireto} className="p-2 bg-cyan-50 text-cyan-600 rounded-xl"><Plus className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3">
                {pixDiretoList.map((pix, idx) => (
                  <div key={pix.id} className="flex gap-2">
                    <input 
                      placeholder="Descrição..." className="flex-1 px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none" 
                      value={pix.desc} onChange={(e) => { const n = [...pixDiretoList]; n[idx].desc = e.target.value; setPixDiretoList(n); }} 
                    />
                    <input 
                      placeholder="R$" type="text" 
                      className="w-32 px-4 py-3 bg-slate-50 border-none rounded-2xl font-black text-sm text-cyan-600 outline-none" 
                      value={formatCurrency(pix.val)} 
                      onChange={(e) => { const n = [...pixDiretoList]; n[idx].val = parseCurrency(e.target.value); setPixDiretoList(n); }} 
                    />
                    <button onClick={() => removePixDireto(pix.id)} className="p-2 text-slate-300"><Trash2 className="w-5 h-5" /></button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-8 rounded-[3rem] border-2 border-slate-100 shadow-xl space-y-6">
              <div className="flex items-center justify-between border-b-2 border-slate-50 pb-4">
                <div className="flex items-center gap-3 text-amber-600 font-black uppercase text-sm">Vendas em Crediário</div>
                <button onClick={addCrediario} className="p-2 bg-amber-50 text-amber-600 rounded-xl"><Plus className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3">
                {crediarioList.map((cred, idx) => (
                  <div key={cred.id} className="flex gap-2">
                    <input 
                      placeholder="Nome do Cliente..." className="flex-1 px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none" 
                      value={cred.client} onChange={(e) => { const n = [...crediarioList]; n[idx].client = e.target.value; setCrediarioList(n); }} 
                    />
                    <input 
                      placeholder="R$" type="text" 
                      className="w-32 px-4 py-3 bg-slate-50 border-none rounded-2xl font-black text-sm text-amber-600 outline-none" 
                      value={formatCurrency(cred.val)} 
                      onChange={(e) => { const n = [...crediarioList]; n[idx].val = parseCurrency(e.target.value); setCrediarioList(n); }} 
                    />
                    <button onClick={() => removeCrediario(cred.id)} className="p-2 text-slate-300"><Trash2 className="w-5 h-5" /></button>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-white p-8 rounded-[3rem] border-2 border-slate-100 shadow-xl space-y-6">
              <div className="flex items-center justify-between border-b-2 border-slate-50 pb-4">
                <div className="flex items-center gap-3 text-blue-600 font-black uppercase text-sm">Produtos s/ Cadastro</div>
                <button onClick={addNonRegistered} className="p-2 bg-blue-50 text-blue-600 rounded-xl"><Plus className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3">
                {nonRegistered.map((prod, idx) => (
                  <div key={prod.id} className="flex gap-2">
                    <input placeholder="Nome..." className="flex-1 px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none" value={prod.desc} onChange={(e) => { const n = [...nonRegistered]; n[idx].desc = e.target.value; setNonRegistered(n); }} />
                    <input 
                      placeholder="R$" type="text" 
                      className="w-32 px-4 py-3 bg-slate-50 border-none rounded-2xl font-black text-sm text-blue-600 outline-none" 
                      value={formatCurrency(prod.val)} 
                      onChange={(e) => { const n = [...nonRegistered]; n[idx].val = parseCurrency(e.target.value); setNonRegistered(n); }} 
                    />
                    <button onClick={() => removeNonRegistered(prod.id)} className="p-2 text-slate-300"><Trash2 className="w-5 h-5" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="text-center">
            <button onClick={handleSave} className={`px-12 py-5 rounded-[2rem] font-black uppercase shadow-2xl transition-all ${isSaved ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'}`}>
              {isSaved ? 'Dados Salvos' : 'Salvar Tudo (CTRL + ENTER)'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Histórico mantido */}
          <div className="grid grid-cols-1 gap-6">
            {filteredHistory.map(h => (
              <div key={h.id} className="bg-white rounded-[2.5rem] p-8 border-2 border-slate-100 shadow-sm">
                 <h4 className="font-black text-slate-700 uppercase mb-4">{new Date(h.date).toLocaleDateString('pt-BR')}</h4>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="text-xs font-bold text-red-600 uppercase">Despesas: {formatCurrency(h.expenses.reduce((s, e) => s + e.val, 0))}</div>
                    <div className="text-xs font-bold text-cyan-600 uppercase">Pix Direto: {formatCurrency(h.pixDiretoList?.reduce((s, e) => s + e.val, 0) || 0)}</div>
                    <div className="text-xs font-bold text-amber-600 uppercase">Crediário: {formatCurrency(h.crediarioList?.reduce((s, e) => s + e.val, 0) || 0)}</div>
                    <div className="text-xs font-bold text-blue-600 uppercase">Produtos: {h.nonRegistered.length} itens</div>
                 </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
