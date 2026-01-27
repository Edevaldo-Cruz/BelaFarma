import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Plus, Trash2, Receipt, ShoppingBag, Save, Pencil,
  AlertCircle, CheckCircle2, History, Calendar, Search, ChevronRight 
} from 'lucide-react';
import { User, DailyRecordEntry } from '../types';

interface DailyRecordsProps {
  user: User;
  onLog: (action: string, details: string) => void;
  dailyRecords: DailyRecordEntry[]; // Unprocessed daily records from DB
  onSave: () => void; // Function to refresh parent's dailyRecords state
}

export const DailyRecords: React.FC<DailyRecordsProps> = ({ user, onLog, dailyRecords, onSave: refreshData }) => {
  const [activeTab, setActiveTab] = useState<'entry' | 'history'>('entry');
  // Local states for the lists of items
  const [expenses, setExpenses] = useState<Array<{ id: string, desc: string, val: number }>>([]);
  const [nonRegistered, setNonRegistered] = useState<Array<{ id: string, desc: string, val: number }>>([]);
  const [pixDiretoList, setPixDiretoList] = useState<Array<{ id: string, desc: string, val: number }>>([]);
  const [crediarioList, setCrediarioList] = useState<Array<{ id: string, client: string, val: number }>>([]);
  
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [expandedRecords, setExpandedRecords] = useState<Set<string>>(new Set());
  const [activeSubTab, setActiveSubTab] = useState<'expenses' | 'pix' | 'crediario' | 'non-registered'>('expenses');
  const [activeHistorySubTab, setActiveHistorySubTab] = useState<'expenses' | 'pix' | 'crediario' | 'non-registered'>('expenses');
  
  // States for individual new input fields
  const [newExpenseDesc, setNewExpenseDesc] = useState('');
  const [newExpenseValue, setNewExpenseValue] = useState(0);

  const [newPixDiretoDesc, setNewPixDiretoDesc] = useState('');
  const [newPixDiretoValue, setNewPixDiretoValue] = useState(0);

  const [newCrediarioClient, setNewCrediarioClient] = useState('');
  const [newCrediarioValue, setNewCrediarioValue] = useState(0);

  const [newNonRegisteredDesc, setNewNonRegisteredDesc] = useState('');
  const [newNonRegisteredValue, setNewNonRegisteredValue] = useState(0);

  const [isSaved, setIsSaved] = useState(false);
  
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());

  const expenseDescRef = useRef<HTMLInputElement>(null); // Ref for expense description field

  const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const parseCurrency = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    return (parseInt(cleaned, 10) || 0) / 100;
  };

  const resetAllInputStates = useCallback(() => {
    setNewExpenseDesc('');
    setNewExpenseValue(0);
    setNewPixDiretoDesc('');
    setNewPixDiretoValue(0);
    setNewCrediarioClient('');
    setNewCrediarioValue(0);
    setNewNonRegisteredDesc('');
    setNewNonRegisteredValue(0);
  }, []);

  const resetDailyTempStates = useCallback(() => {
    setExpenses([]);
    setNonRegistered([]);
    setPixDiretoList([]);
    setCrediarioList([]);
    localStorage.removeItem('belafarma_daily_temp');
    resetAllInputStates(); // Also clear the input fields
  }, [resetAllInputStates]);

  useEffect(() => {
    // Load temporary data from localStorage for the current entry session
    const savedTemp = localStorage.getItem('belafarma_daily_temp');
    if (savedTemp) {
      const data = JSON.parse(savedTemp);
      setExpenses(data.expenses || []);
      setNonRegistered(data.nonRegistered || []);
      setPixDiretoList(data.pixDiretoList || []);
      setCrediarioList(data.crediarioList || []);
    } else {
      resetDailyTempStates();
    }
  }, [resetDailyTempStates]); // Only run once on mount

  useEffect(() => {
    // This effect ensures states are reset if belafarma_daily_temp is cleared by another action (e.g. cash closing)
    const checkLocalStorage = () => {
      const savedTemp = localStorage.getItem('belafarma_daily_temp');
      if (!savedTemp && activeTab === 'entry') { // Only reset if on entry tab and temp is cleared
        resetDailyTempStates();
      }
    };

    window.addEventListener('storage', checkLocalStorage);
    return () => window.removeEventListener('storage', checkLocalStorage);
  }, [activeTab, resetDailyTempStates]);

  const handleGlobalKeyDown = (e: React.KeyboardEvent) => {
    if (activeTab === 'entry') {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        handleSave();
      }
    }
  };
  const handleSave = async () => {
    const dataToSaveLocally = { expenses, nonRegistered, pixDiretoList, crediarioList };
    if (!editingRecordId) {
      localStorage.setItem('belafarma_daily_temp', JSON.stringify(dataToSaveLocally));
    }

    // Create record object
    const recordPayload = {
      id: editingRecordId || Date.now().toString(),
      date: editingDate || new Date().toISOString(),
      expenses,
      nonRegistered,
      pixDiretoList,
      crediarioList,
      userName: user.name
    };

    console.log('DailyRecords: Salvando registro...', recordPayload);

    try {
      const url = editingRecordId ? `/api/daily-records/${editingRecordId}` : '/api/daily-records';
      const method = editingRecordId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recordPayload),
      });

      if (!response.ok) {
        throw new Error('Failed to save record');
      }

      console.log('DailyRecords: Registro salvo com sucesso, atualizando dados...');

      // After saving to DB, refresh parent's dailyRecords state
      await refreshData();
      
      console.log('DailyRecords: Dados atualizados');
      
      onLog('Lançamento Diário', `${editingRecordId ? 'Atualizou' : 'Salvou novo'} registro diário.`);
      setIsSaved(true);
      
      if (editingRecordId) {
        setEditingRecordId(null);
        setEditingDate(null);
        resetDailyTempStates();
      }

      setTimeout(() => setIsSaved(false), 3000);

    } catch (error) {
      console.error('Failed to save daily record:', error);
      alert('Erro ao salvar lançamento. Por favor, tente novamente.');
    }
  };

  const startEditing = (record: DailyRecordEntry) => {
    setEditingRecordId(record.id);
    setEditingDate(record.date);
    setExpenses(record.expenses);
    setNonRegistered(record.nonRegistered);
    setPixDiretoList(record.pixDiretoList || []);
    setCrediarioList(record.crediarioList || []);
    setActiveTab('entry');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteRecord = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este lançamento permanentemente?')) return;

    try {
      const response = await fetch(`/api/daily-records/${id}`, { method: 'DELETE' });
      if (response.ok) {
        onLog('Lançamento Diário', `Excluiu lançamento histórico.`);
        refreshData();
      } else {
        alert('Não foi possível excluir. Talvez o registro já tenha sido processado no fechamento.');
      }
    } catch (error) {
      console.error('Error deleting record:', error);
    }
  };

  // Handler to delete individual item from a saved record
  const handleDeleteItemFromRecord = async (
    recordId: string, 
    itemType: 'expenses' | 'pixDiretoList' | 'crediarioList' | 'nonRegistered',
    itemId: string
  ) => {
    const record = dailyRecords.find(r => r.id === recordId);
    if (!record) return;

    // Create updated record with the item removed
    const updatedRecord = { ...record };
    if (itemType === 'expenses') {
      updatedRecord.expenses = record.expenses.filter(e => e.id !== itemId);
    } else if (itemType === 'pixDiretoList') {
      updatedRecord.pixDiretoList = (record.pixDiretoList || []).filter(p => p.id !== itemId);
    } else if (itemType === 'crediarioList') {
      updatedRecord.crediarioList = (record.crediarioList || []).filter(c => c.id !== itemId);
    } else if (itemType === 'nonRegistered') {
      updatedRecord.nonRegistered = record.nonRegistered.filter(n => n.id !== itemId);
    }

    try {
      await fetch(`/api/daily-records/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedRecord),
      });
      onLog('Lançamento Diário', `Removeu item do lançamento.`);
      refreshData();
    } catch (error) {
      console.error('Error deleting item from record:', error);
    }
  };

  // Handler to edit individual item from a saved record
  const handleEditItemFromRecord = (
    recordId: string,
    itemType: 'expenses' | 'pixDiretoList' | 'crediarioList' | 'nonRegistered',
    itemId: string
  ) => {
    const record = dailyRecords.find(r => r.id === recordId);
    if (!record) return;

    let item: any;
    if (itemType === 'expenses') {
      item = record.expenses.find(e => e.id === itemId);
      if (item) {
        setNewExpenseDesc(item.desc);
        setNewExpenseValue(item.val);
        setActiveSubTab('expenses');
      }
    } else if (itemType === 'pixDiretoList') {
      item = (record.pixDiretoList || []).find(p => p.id === itemId);
      if (item) {
        setNewPixDiretoDesc(item.desc);
        setNewPixDiretoValue(item.val);
        setActiveSubTab('pix');
      }
    } else if (itemType === 'crediarioList') {
      item = (record.crediarioList || []).find(c => c.id === itemId);
      if (item) {
        setNewCrediarioClient(item.client);
        setNewCrediarioValue(item.val);
        setActiveSubTab('crediario');
      }
    } else if (itemType === 'nonRegistered') {
      item = record.nonRegistered.find(n => n.id === itemId);
      if (item) {
        setNewNonRegisteredDesc(item.desc);
        setNewNonRegisteredValue(item.val);
        setActiveSubTab('non-registered');
      }
    }

    // Delete the item from the record after copying to input
    if (item) {
      handleDeleteItemFromRecord(recordId, itemType, itemId);
    }
  };

  const cancelEditing = () => {
    setEditingRecordId(null);
    setEditingDate(null);
    resetDailyTempStates();
  };

  const toggleExpand = (id: string) => {
    setExpandedRecords(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addNewExpense = () => {
    if (newExpenseDesc && newExpenseValue > 0) {
      setExpenses(prev => [...prev, { id: Date.now().toString(), desc: newExpenseDesc, val: newExpenseValue }]);
      setNewExpenseDesc('');
      setNewExpenseValue(0);
      expenseDescRef.current?.focus(); 
    }
  };
  const removeExpense = (id: string) => setExpenses(prev => prev.filter(e => e.id !== id));
  
  const editExpense = (id: string, desc: string, val: number) => {
    setNewExpenseDesc(desc);
    setNewExpenseValue(val);
    removeExpense(id);
    expenseDescRef.current?.focus();
  };
  
  const addNewNonRegistered = () => {
    if (newNonRegisteredDesc && newNonRegisteredValue > 0) {
      setNonRegistered(prev => [...prev, { id: Date.now().toString(), desc: newNonRegisteredDesc, val: newNonRegisteredValue }]);
      setNewNonRegisteredDesc('');
      setNewNonRegisteredValue(0);
    }
  };
  const removeNonRegistered = (id: string) => setNonRegistered(prev => prev.filter(p => p.id !== id));
  
  const editNonRegistered = (id: string, desc: string, val: number) => {
    setNewNonRegisteredDesc(desc);
    setNewNonRegisteredValue(val);
    removeNonRegistered(id);
  };
  
  const addNewPixDireto = () => {
    if (newPixDiretoDesc && newPixDiretoValue > 0) {
      setPixDiretoList(prev => [...prev, { id: Date.now().toString(), desc: newPixDiretoDesc, val: newPixDiretoValue }]);
      setNewPixDiretoDesc('');
      setNewPixDiretoValue(0);
    }
  };
  const removePixDireto = (id: string) => setPixDiretoList(prev => prev.filter(p => p.id !== id));

  const editPixDireto = (id: string, desc: string, val: number) => {
    setNewPixDiretoDesc(desc);
    setNewPixDiretoValue(val);
    removePixDireto(id);
  };
  
  const addNewCrediario = () => {
    if (newCrediarioClient && newCrediarioValue > 0) {
      setCrediarioList(prev => [...prev, { id: Date.now().toString(), client: newCrediarioClient, val: newCrediarioValue }]);
      setNewCrediarioClient('');
      setNewCrediarioValue(0);
    }
  };
  const removeCrediario = (id: string) => setCrediarioList(prev => prev.filter(c => c.id !== id));

  const editCrediario = (id: string, client: string, val: number) => {
    setNewCrediarioClient(client);
    setNewCrediarioValue(val);
    removeCrediario(id);
  };
  
  const filteredHistory = useMemo(() => {
    return (dailyRecords || []).filter(h => {
      const d = new Date(h.date);
      return (d.getMonth() + 1) === filterMonth && d.getFullYear() === filterYear;
    });
  }, [dailyRecords, filterMonth, filterYear]);

  const totalMonthExpenses = useMemo(() => {
    return filteredHistory.reduce((acc, h) => acc + h.expenses.reduce((sum, e) => sum + e.val, 0), 0);
  }, [filteredHistory]);

  // Get today's saved records for display in entry tab
  const todaysSavedRecords = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    console.log('DailyRecords: Filtrando registros de hoje...', { today, totalRecords: dailyRecords?.length });
    const filtered = (dailyRecords || []).filter(record => {
      const recordDate = new Date(record.date).toISOString().split('T')[0];
      const matches = recordDate === today;
      if (matches) {
        console.log('DailyRecords: Registro de hoje encontrado:', record);
      }
      return matches;
    });
    console.log('DailyRecords: Total de registros de hoje:', filtered.length);
    return filtered;
  }, [dailyRecords]);


  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20" onKeyDown={ handleGlobalKeyDown }>
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
        <React.Fragment>
          {/* Sub Tabs Navigation */}
          <div className="flex flex-wrap gap-2 mb-8 p-1.5 bg-slate-100/50 rounded-[2rem] border border-slate-200/50 backdrop-blur-sm">
            {[
              { id: 'expenses', label: 'Despesas', icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', activeBg: 'bg-red-600' },
              { id: 'pix', label: 'Pix Direto', icon: CheckCircle2, color: 'text-cyan-600', bg: 'bg-cyan-50', activeBg: 'bg-cyan-600' },
              { id: 'crediario', label: 'Crediário', icon: ShoppingBag, color: 'text-amber-600', bg: 'bg-amber-50', activeBg: 'bg-amber-600' },
              { id: 'non-registered', label: 'S/ Cadastro', icon: Plus, color: 'text-blue-600', bg: 'bg-blue-50', activeBg: 'bg-blue-600' }
            ].map((sub) => (
              <button
                key={sub.id}
                onClick={() => setActiveSubTab(sub.id as any)}
                className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-3xl text-xs font-black uppercase transition-all duration-300 ${
                  activeSubTab === sub.id 
                    ? `${sub.activeBg} text-white shadow-xl scale-[1.02]` 
                    : `text-slate-500 hover:bg-white hover:text-slate-900`
                }`}
              >
                <sub.icon size={16} className={activeSubTab === sub.id ? 'text-white' : sub.color} />
                <span className="hidden sm:inline">{sub.label}</span>
              </button>
            ))}
          </div>

          <div className="min-h-[400px]">
            {/* Despesas do Dia Card */}
            {activeSubTab === 'expenses' && (
              <div className="bg-white p-8 rounded-[3rem] border-2 border-slate-100 shadow-xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between border-b-2 border-slate-50 pb-4">
                <div className="flex items-center gap-3 text-red-600 font-black uppercase text-sm">Despesas do Dia</div>
                <button onClick={addNewExpense} className="p-2 bg-red-50 text-red-600 rounded-xl"><Plus className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3">
                <div className="flex gap-2">
                    <input 
                      ref={expenseDescRef}
                      placeholder="Descrição..." className="flex-1 px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none" 
                      value={newExpenseDesc} onChange={(e) => setNewExpenseDesc(e.target.value)} 
                    />
                    <input 
                      placeholder="R$" type="text" 
                      className="w-32 px-4 py-3 bg-slate-50 border-none rounded-2xl font-black text-sm text-red-600 outline-none" 
                      value={formatCurrency(newExpenseValue)} 
                      onChange={(e) => setNewExpenseValue(parseCurrency(e.target.value))} 
                    />
                </div>
              </div>
              {expenses.length > 0 && (
                <div className="pt-4 border-t border-slate-100 space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Despesas Registradas (Temporário)</h4>
                  {expenses.map((exp) => (
                    <div key={exp.id} className="flex justify-between items-center bg-slate-50/70 p-3 rounded-2xl border border-slate-100/50 group hover:bg-white hover:shadow-md transition-all">
                      <p className="font-bold text-sm text-slate-800">{exp.desc}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-black text-red-600">- {formatCurrency(exp.val)}</p>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => editExpense(exp.id, exp.desc, exp.val)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => removeExpense(exp.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Today's Saved Expenses */}
              {todaysSavedRecords.map(record => (
                record.expenses.length > 0 && (
                  <div key={record.id} className="pt-4 border-t-2 border-red-100 space-y-2">
                    <h4 className="text-xs font-bold text-red-500 uppercase tracking-wider flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3" />
                      Despesas Salvas - {new Date(record.date).toLocaleDateString('pt-BR')}
                    </h4>
                    {record.expenses.map((exp) => (
                      <div key={exp.id} className="flex justify-between items-center bg-red-50/50 p-3 rounded-2xl border border-red-100 group hover:bg-red-50 hover:shadow-md transition-all">
                        <p className="font-bold text-sm text-slate-800">{exp.desc}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-red-600">- {formatCurrency(exp.val)}</p>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => handleEditItemFromRecord(record.id, 'expenses', exp.id)} 
                              className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Editar item"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteItemFromRecord(record.id, 'expenses', exp.id)} 
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Excluir item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ))}
            </div>
            )}
            
            {/* Pix Direto na Conta Card */}
            {activeSubTab === 'pix' && (
              <div className="bg-white p-8 rounded-[3rem] border-2 border-slate-100 shadow-xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between border-b-2 border-slate-50 pb-4">
                <div className="flex items-center gap-3 text-cyan-600 font-black uppercase text-sm">Pix Direto na Conta</div>
                <button onClick={addNewPixDireto} className="p-2 bg-cyan-50 text-cyan-600 rounded-xl"><Plus className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3">
                <div className="flex gap-2">
                    <input 
                      placeholder="Descrição..." className="flex-1 px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none" 
                      value={newPixDiretoDesc} onChange={(e) => setNewPixDiretoDesc(e.target.value)} 
                    />
                    <input 
                      placeholder="R$" type="text" 
                      className="w-32 px-4 py-3 bg-slate-50 border-none rounded-2xl font-black text-sm text-cyan-600 outline-none" 
                      value={formatCurrency(newPixDiretoValue)} 
                      onChange={(e) => setNewPixDiretoValue(parseCurrency(e.target.value))} 
                    />
                </div>
              </div>
              {pixDiretoList.length > 0 && (
                <div className="pt-4 border-t border-slate-100 space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pix Direto Registrado (Temporário)</h4>
                  {pixDiretoList.map((pix) => (
                    <div key={pix.id} className="flex justify-between items-center bg-slate-50/70 p-3 rounded-2xl border border-slate-100/50 group hover:bg-white hover:shadow-md transition-all">
                      <p className="font-bold text-sm text-slate-800">{pix.desc}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-black text-cyan-600">+ {formatCurrency(pix.val)}</p>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => editPixDireto(pix.id, pix.desc, pix.val)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => removePixDireto(pix.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Today's Saved Pix Direto */}
              {todaysSavedRecords.map(record => (
                record.pixDiretoList && record.pixDiretoList.length > 0 && (
                  <div key={record.id} className="pt-4 border-t-2 border-cyan-100 space-y-2">
                    <h4 className="text-xs font-bold text-cyan-500 uppercase tracking-wider flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3" />
                      Pix Direto Salvo - {new Date(record.date).toLocaleDateString('pt-BR')}
                    </h4>
                    {record.pixDiretoList.map((pix) => (
                      <div key={pix.id} className="flex justify-between items-center bg-cyan-50/50 p-3 rounded-2xl border border-cyan-100 group hover:bg-cyan-50 hover:shadow-md transition-all">
                        <p className="font-bold text-sm text-slate-800">{pix.desc}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-cyan-600">+ {formatCurrency(pix.val)}</p>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => handleEditItemFromRecord(record.id, 'pixDiretoList', pix.id)} 
                              className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Editar item"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteItemFromRecord(record.id, 'pixDiretoList', pix.id)} 
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Excluir item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ))}
            </div>
            )}
            
            {/* Vendas em Crediário Card */}
            {activeSubTab === 'crediario' && (
              <div className="bg-white p-8 rounded-[3rem] border-2 border-slate-100 shadow-xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between border-b-2 border-slate-50 pb-4">
                <div className="flex items-center gap-3 text-amber-600 font-black uppercase text-sm">Vendas em Crediário</div>
                <button onClick={addNewCrediario} className="p-2 bg-amber-50 text-amber-600 rounded-xl"><Plus className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3">
                <div className="flex gap-2">
                    <input 
                      placeholder="Nome do Cliente..." className="flex-1 px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none" 
                      value={newCrediarioClient} onChange={(e) => setNewCrediarioClient(e.target.value)} 
                    />
                    <input 
                      placeholder="R$" type="text" 
                      className="w-32 px-4 py-3 bg-slate-50 border-none rounded-2xl font-black text-sm text-amber-600 outline-none" 
                      value={formatCurrency(newCrediarioValue)} 
                      onChange={(e) => setNewCrediarioValue(parseCurrency(e.target.value))} 
                    />
                </div>
              </div>
              {crediarioList.length > 0 && (
                <div className="pt-4 border-t border-slate-100 space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Crediário Registrado (Temporário)</h4>
                  {crediarioList.map((cred) => (
                    <div key={cred.id} className="flex justify-between items-center bg-slate-50/70 p-3 rounded-2xl border border-slate-100/50 group hover:bg-white hover:shadow-md transition-all">
                      <p className="font-bold text-sm text-slate-800">{cred.client}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-black text-amber-600">+ {formatCurrency(cred.val)}</p>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => editCrediario(cred.id, cred.client, cred.val)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => removeCrediario(cred.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Today's Saved Crediário */}
              {todaysSavedRecords.map(record => (
                record.crediarioList && record.crediarioList.length > 0 && (
                  <div key={record.id} className="pt-4 border-t-2 border-amber-100 space-y-2">
                    <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3" />
                      Crediário Salvo - {new Date(record.date).toLocaleDateString('pt-BR')}
                    </h4>
                    {record.crediarioList.map((cred) => (
                      <div key={cred.id} className="flex justify-between items-center bg-amber-50/50 p-3 rounded-2xl border border-amber-100 group hover:bg-amber-50 hover:shadow-md transition-all">
                        <p className="font-bold text-sm text-slate-800">{cred.client}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-amber-600">+ {formatCurrency(cred.val)}</p>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => handleEditItemFromRecord(record.id, 'crediarioList', cred.id)} 
                              className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Editar item"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteItemFromRecord(record.id, 'crediarioList', cred.id)} 
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Excluir item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ))}
            </div>
            )}
            
            {/* Produtos s/ Cadastro Card */}
            {activeSubTab === 'non-registered' && (
              <div className="bg-white p-8 rounded-[3rem] border-2 border-slate-100 shadow-xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between border-b-2 border-slate-50 pb-4">
                <div className="flex items-center gap-3 text-blue-600 font-black uppercase text-sm">Produtos s/ Cadastro</div>
                <button onClick={addNewNonRegistered} className="p-2 bg-blue-50 text-blue-600 rounded-xl"><Plus className="w-5 h-5" /></button>
              </div>
              <div className="space-y-3">
                <div className="flex gap-2">
                    <input placeholder="Nome..." className="flex-1 px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none" value={newNonRegisteredDesc} onChange={(e) => setNewNonRegisteredDesc(e.target.value)} />
                    <input 
                      placeholder="R$" type="text" 
                      className="w-32 px-4 py-3 bg-slate-50 border-none rounded-2xl font-black text-sm text-blue-600 outline-none" 
                      value={formatCurrency(newNonRegisteredValue)} 
                      onChange={(e) => setNewNonRegisteredValue(parseCurrency(e.target.value))} 
                    />
                </div>
              </div>
              {nonRegistered.length > 0 && (
                <div className="pt-4 border-t border-slate-100 space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Produtos Registrados (Temporário)</h4>
                  {nonRegistered.map((prod) => (
                    <div key={prod.id} className="flex justify-between items-center bg-slate-50/70 p-3 rounded-2xl border border-slate-100/50 group hover:bg-white hover:shadow-md transition-all">
                      <p className="font-bold text-sm text-slate-800">{prod.desc}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-black text-blue-600">+ {formatCurrency(prod.val)}</p>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => editNonRegistered(prod.id, prod.desc, prod.val)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => removeNonRegistered(prod.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Today's Saved Non-Registered Products */}
              {todaysSavedRecords.map(record => (
                record.nonRegistered.length > 0 && (
                  <div key={record.id} className="pt-4 border-t-2 border-blue-100 space-y-2">
                    <h4 className="text-xs font-bold text-blue-500 uppercase tracking-wider flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3" />
                      Produtos Salvos - {new Date(record.date).toLocaleDateString('pt-BR')}
                    </h4>
                    {record.nonRegistered.map((prod) => (
                      <div key={prod.id} className="flex justify-between items-center bg-blue-50/50 p-3 rounded-2xl border border-blue-100 group hover:bg-blue-50 hover:shadow-md transition-all">
                        <p className="font-bold text-sm text-slate-800">{prod.desc}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-blue-600">+ {formatCurrency(prod.val)}</p>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => handleEditItemFromRecord(record.id, 'nonRegistered', prod.id)} 
                              className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Editar item"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteItemFromRecord(record.id, 'nonRegistered', prod.id)} 
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Excluir item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ))}
            </div>
            )}
          </div>
          <div className="text-center mt-8 flex flex-col items-center gap-4">
            <button 
              onClick={handleSave} 
              className={`px-12 py-5 rounded-[2rem] font-black uppercase shadow-2xl transition-all ${isSaved ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'}`}
            >
              {isSaved ? 'Dados Salvos' : editingRecordId ? 'Atualizar Lançamento' : 'Salvar Lançamentos (CTRL + ENTER)'}
            </button>
            {editingRecordId && (
              <button onClick={cancelEditing} className="text-xs font-black uppercase text-slate-400 hover:text-red-600 transition-colors">
                Cancelar Edição
              </button>
            )}
          </div>
        </React.Fragment>
      ) : (
        <div className="space-y-6">
          {/* History Sub Tabs */}
          <div className="flex flex-wrap gap-2 mb-8 p-1.5 bg-slate-100/50 rounded-[2rem] border border-slate-200/50 backdrop-blur-sm">
            {[
              { id: 'expenses', label: 'Despesas', icon: AlertCircle, color: 'text-red-600', activeBg: 'bg-red-600' },
              { id: 'pix', label: 'Pix Direto', icon: CheckCircle2, color: 'text-cyan-600', activeBg: 'bg-cyan-600' },
              { id: 'crediario', label: 'Crediário', icon: ShoppingBag, color: 'text-amber-600', activeBg: 'bg-amber-600' },
              { id: 'non-registered', label: 'S/ Cadastro', icon: Plus, color: 'text-blue-600', activeBg: 'bg-blue-600' }
            ].map((sub) => (
              <button
                key={sub.id}
                onClick={() => setActiveHistorySubTab(sub.id as any)}
                className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-3xl text-xs font-black uppercase transition-all duration-300 ${
                  activeHistorySubTab === sub.id 
                    ? `${sub.activeBg} text-white shadow-xl scale-[1.02]` 
                    : `text-slate-500 hover:bg-white hover:text-slate-900`
                }`}
              >
                <sub.icon size={16} className={activeHistorySubTab === sub.id ? 'text-white' : sub.color} />
                <span className="hidden sm:inline">{sub.label}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6">
            {filteredHistory.map(h => {
              // Check if the record has items in the current sub-tab
              const hasItems = 
                (activeHistorySubTab === 'expenses' && h.expenses.length > 0) ||
                (activeHistorySubTab === 'pix' && h.pixDiretoList && h.pixDiretoList.length > 0) ||
                (activeHistorySubTab === 'crediario' && h.crediarioList && h.crediarioList.length > 0) ||
                (activeHistorySubTab === 'non-registered' && h.nonRegistered.length > 0);

              if (!hasItems) return null;

              return (
                <div key={h.id} className="bg-white rounded-[2.5rem] p-8 border-2 border-slate-100 shadow-sm transition-all hover:shadow-md">
                   <div className="flex justify-between items-start mb-6">
                      <div>
                        <h4 className="font-black text-slate-900 uppercase text-lg tracking-tighter">
                          {new Date(h.date).toLocaleDateString('pt-BR')}
                        </h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h.userName || 'Sistema'}</p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => startEditing(h)}
                          className="p-2.5 bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-all"
                          title="Editar lançamento completo"
                        >
                          <History size={18} />
                        </button>
                        <button 
                          onClick={() => handleDeleteRecord(h.id)}
                          className="p-2.5 bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all"
                          title="Excluir lançamento completo"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                   </div>

                   <div className="space-y-4">
                      {activeHistorySubTab === 'expenses' && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-black text-red-600 uppercase tracking-widest flex items-center gap-2">
                            <AlertCircle size={14} /> Total em Despesas: {formatCurrency(h.expenses.reduce((s, e) => s + e.val, 0))}
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {h.expenses.map(exp => (
                              <div key={exp.id} className="flex justify-between items-center p-3 bg-red-50/40 rounded-2xl border border-red-100/50">
                                <span className="text-sm font-bold text-slate-700">{exp.desc}</span>
                                <span className="text-sm font-black text-red-600">{formatCurrency(exp.val)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {activeHistorySubTab === 'pix' && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-black text-cyan-600 uppercase tracking-widest flex items-center gap-2">
                            <CheckCircle2 size={14} /> Total em Pix Direto: {formatCurrency(h.pixDiretoList?.reduce((s, e) => s + e.val, 0) || 0)}
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {h.pixDiretoList?.map(pix => (
                              <div key={pix.id} className="flex justify-between items-center p-3 bg-cyan-50/40 rounded-2xl border border-cyan-100/50">
                                <span className="text-sm font-bold text-slate-700">{pix.desc}</span>
                                <span className="text-sm font-black text-cyan-600">{formatCurrency(pix.val)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {activeHistorySubTab === 'crediario' && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-2">
                            <ShoppingBag size={14} /> Total em Crediário: {formatCurrency(h.crediarioList?.reduce((s, e) => s + e.val, 0) || 0)}
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {h.crediarioList?.map(cred => (
                              <div key={cred.id} className="flex justify-between items-center p-3 bg-amber-50/40 rounded-2xl border border-amber-100/50">
                                <span className="text-sm font-bold text-slate-700">{cred.client}</span>
                                <span className="text-sm font-black text-amber-600">{formatCurrency(cred.val)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {activeHistorySubTab === 'non-registered' && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
                            <Plus size={14} /> Total em Itens s/ Cadastro: {formatCurrency(h.nonRegistered.reduce((s, e) => s + e.val, 0))}
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {h.nonRegistered.map(prod => (
                              <div key={prod.id} className="flex justify-between items-center p-3 bg-blue-50/40 rounded-2xl border border-blue-100/50">
                                <span className="text-sm font-bold text-slate-700">{prod.desc}</span>
                                <span className="text-sm font-black text-blue-600">{formatCurrency(prod.val)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                   </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};