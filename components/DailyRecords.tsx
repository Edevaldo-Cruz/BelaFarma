import React, { useState, useEffect } from 'react';
import { 
  Plus, Trash2, Pencil, Save, X, AlertCircle, 
  CheckCircle2, ShoppingBag, DollarSign
} from 'lucide-react';
import { User, DailyRecordEntry } from '../types';

interface DailyRecordsProps {
  user: User;
  onLog: (action: string, details: string) => void;
  dailyRecords: DailyRecordEntry[];
  onSave: () => void;
}

type TabType = 'expenses' | 'pix' | 'crediario' | 'non-registered';

interface ExpenseItem {
  id: string;
  desc: string;
  val: number;
}

interface PixItem {
  id: string;
  desc: string;
  val: number;
}

interface CrediarioItem {
  id: string;
  client: string;
  val: number;
}

interface NonRegisteredItem {
  id: string;
  desc: string;
  val: number;
}

export const DailyRecords: React.FC<DailyRecordsProps> = ({ user, onLog, dailyRecords, onSave }) => {
  const [activeTab, setActiveTab] = useState<TabType>('expenses');
  const [todayRecord, setTodayRecord] = useState<DailyRecordEntry | null>(null);
  
  // Form states for each category
  const [expenseForm, setExpenseForm] = useState({ desc: '', val: '' });
  const [pixForm, setPixForm] = useState({ desc: '', val: '' });
  const [crediarioForm, setCrediarioForm] = useState({ client: '', val: '' });
  const [nonRegForm, setNonRegForm] = useState({ desc: '', val: '' });
  
  // Editing states
  const [editingItem, setEditingItem] = useState<{ type: TabType; id: string } | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  
  // Loading and feedback states
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Load today's record on mount and when dailyRecords changes
  // Only show records that haven't been processed in cash closing (lancado === false)
  useEffect(() => {
    console.log('=== DailyRecords useEffect ===');
    console.log('All dailyRecords:', dailyRecords);
    
    const today = getTodayDate();
    console.log('Today date:', today);
    
    const record = dailyRecords.find(r => {
      const recordDate = new Date(r.date).toISOString().split('T')[0];
      const isToday = recordDate === today;
      const isNotProcessed = !r.lancado;
      
      console.log('Record:', {
        id: r.id,
        date: recordDate,
        lancado: r.lancado,
        lancadoType: typeof r.lancado,
        isToday,
        isNotProcessed,
        willShow: isToday && isNotProcessed
      });
      
      // Only load if it's today AND hasn't been processed (lancado is false or undefined)
      return isToday && isNotProcessed;
    });
    
    console.log('Selected record:', record);
    
    if (record) {
      setTodayRecord(record);
    } else {
      // Create empty record structure for today
      setTodayRecord({
        id: `temp-${Date.now()}`,
        date: new Date().toISOString(),
        userName: user.name,
        expenses: [],
        pixDiretoList: [],
        crediarioList: [],
        nonRegistered: [],
        lancado: false, // Initialize as not processed
      });
    }
  }, [dailyRecords, user.name]);

  // Format currency
  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Parse currency input
  const parseCurrency = (value: string): number => {
    const cleaned = value.replace(/\D/g, '');
    return (parseInt(cleaned, 10) || 0) / 100;
  };

  // Save record to backend
  const saveRecord = async (updatedRecord: DailyRecordEntry) => {
    setIsSaving(true);
    try {
      const isNew = updatedRecord.id.startsWith('temp-');
      const url = isNew ? '/api/daily-records' : `/api/daily-records/${updatedRecord.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const payload = {
        ...updatedRecord,
        id: isNew ? Date.now().toString() : updatedRecord.id,
      };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to save record');
      }

      await onSave(); // Refresh data from parent
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      
      onLog('Lançamento Diário', `${isNew ? 'Criou' : 'Atualizou'} lançamento diário`);
    } catch (error) {
      console.error('Error saving record:', error);
      alert('Erro ao salvar lançamento. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  // Add item to a category
  const addItem = async (type: TabType) => {
    if (!todayRecord) return;

    let newItem: any;
    let updatedRecord = { ...todayRecord };

    switch (type) {
      case 'expenses':
        if (!expenseForm.desc || !expenseForm.val) return;
        newItem = {
          id: Date.now().toString(),
          desc: expenseForm.desc,
          val: parseCurrency(expenseForm.val),
        };
        updatedRecord.expenses = [...updatedRecord.expenses, newItem];
        setExpenseForm({ desc: '', val: '' });
        break;

      case 'pix':
        if (!pixForm.desc || !pixForm.val) return;
        newItem = {
          id: Date.now().toString(),
          desc: pixForm.desc,
          val: parseCurrency(pixForm.val),
        };
        updatedRecord.pixDiretoList = [...updatedRecord.pixDiretoList, newItem];
        setPixForm({ desc: '', val: '' });
        break;

      case 'crediario':
        if (!crediarioForm.client || !crediarioForm.val) return;
        newItem = {
          id: Date.now().toString(),
          client: crediarioForm.client,
          val: parseCurrency(crediarioForm.val),
        };
        updatedRecord.crediarioList = [...updatedRecord.crediarioList, newItem];
        setCrediarioForm({ client: '', val: '' });
        break;

      case 'non-registered':
        if (!nonRegForm.desc || !nonRegForm.val) return;
        newItem = {
          id: Date.now().toString(),
          desc: nonRegForm.desc,
          val: parseCurrency(nonRegForm.val),
        };
        updatedRecord.nonRegistered = [...updatedRecord.nonRegistered, newItem];
        setNonRegForm({ desc: '', val: '' });
        break;
    }

    setTodayRecord(updatedRecord);
    await saveRecord(updatedRecord);
  };

  // Start editing an item
  const startEdit = (type: TabType, id: string) => {
    if (!todayRecord) return;

    let item: any;
    switch (type) {
      case 'expenses':
        item = todayRecord.expenses.find(e => e.id === id);
        if (item) setEditForm({ desc: item.desc, val: formatCurrency(item.val) });
        break;
      case 'pix':
        item = todayRecord.pixDiretoList.find(p => p.id === id);
        if (item) setEditForm({ desc: item.desc, val: formatCurrency(item.val) });
        break;
      case 'crediario':
        item = todayRecord.crediarioList.find(c => c.id === id);
        if (item) setEditForm({ client: item.client, val: formatCurrency(item.val) });
        break;
      case 'non-registered':
        item = todayRecord.nonRegistered.find(n => n.id === id);
        if (item) setEditForm({ desc: item.desc, val: formatCurrency(item.val) });
        break;
    }
    setEditingItem({ type, id });
  };

  // Save edited item
  const saveEdit = async () => {
    if (!todayRecord || !editingItem) return;

    const updatedRecord = { ...todayRecord };
    const { type, id } = editingItem;

    switch (type) {
      case 'expenses':
        updatedRecord.expenses = updatedRecord.expenses.map(e =>
          e.id === id ? { ...e, desc: editForm.desc, val: parseCurrency(editForm.val) } : e
        );
        break;
      case 'pix':
        updatedRecord.pixDiretoList = updatedRecord.pixDiretoList.map(p =>
          p.id === id ? { ...p, desc: editForm.desc, val: parseCurrency(editForm.val) } : p
        );
        break;
      case 'crediario':
        updatedRecord.crediarioList = updatedRecord.crediarioList.map(c =>
          c.id === id ? { ...c, client: editForm.client, val: parseCurrency(editForm.val) } : c
        );
        break;
      case 'non-registered':
        updatedRecord.nonRegistered = updatedRecord.nonRegistered.map(n =>
          n.id === id ? { ...n, desc: editForm.desc, val: parseCurrency(editForm.val) } : n
        );
        break;
    }

    setTodayRecord(updatedRecord);
    await saveRecord(updatedRecord);
    setEditingItem(null);
    setEditForm({});
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingItem(null);
    setEditForm({});
  };

  // Delete item
  const deleteItem = async (type: TabType, id: string) => {
    if (!todayRecord) return;

    if (!confirm('Tem certeza que deseja excluir este item?')) return;

    const updatedRecord = { ...todayRecord };

    switch (type) {
      case 'expenses':
        updatedRecord.expenses = updatedRecord.expenses.filter(e => e.id !== id);
        break;
      case 'pix':
        updatedRecord.pixDiretoList = updatedRecord.pixDiretoList.filter(p => p.id !== id);
        break;
      case 'crediario':
        updatedRecord.crediarioList = updatedRecord.crediarioList.filter(c => c.id !== id);
        break;
      case 'non-registered':
        updatedRecord.nonRegistered = updatedRecord.nonRegistered.filter(n => n.id !== id);
        break;
    }

    setTodayRecord(updatedRecord);
    await saveRecord(updatedRecord);
  };

  // Tab configuration
  const tabs = [
    { id: 'expenses' as TabType, label: 'Despesas do Dia', icon: AlertCircle, color: 'red' },
    { id: 'pix' as TabType, label: 'Pix Direto na Conta', icon: DollarSign, color: 'cyan' },
    { id: 'crediario' as TabType, label: 'Crediário', icon: ShoppingBag, color: 'amber' },
    { id: 'non-registered' as TabType, label: 'Produto Não Cadastrado', icon: Plus, color: 'blue' },
  ];

  const activeTabConfig = tabs.find(t => t.id === activeTab)!;

  // Get items for current tab
  const getCurrentItems = (): any[] => {
    if (!todayRecord) return [];
    switch (activeTab) {
      case 'expenses': return todayRecord.expenses;
      case 'pix': return todayRecord.pixDiretoList;
      case 'crediario': return todayRecord.crediarioList;
      case 'non-registered': return todayRecord.nonRegistered;
      default: return [];
    }
  };

  const currentItems = getCurrentItems();

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">
            Lançamentos Diários
          </h1>
          <p className="text-slate-500 font-bold text-sm mt-1">
            {new Date().toLocaleDateString('pt-BR', { dateStyle: 'full' })}
          </p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 p-2 bg-slate-100/50 rounded-[2rem] border border-slate-200/50">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-3xl text-xs font-black uppercase transition-all duration-300 ${
                isActive
                  ? `bg-${tab.color}-600 text-white shadow-xl scale-[1.02]`
                  : 'text-slate-500 hover:bg-white hover:text-slate-900'
              }`}
            >
              <Icon size={16} className={isActive ? 'text-white' : `text-${tab.color}-600`} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="bg-white p-8 rounded-[3rem] border-2 border-slate-100 shadow-xl space-y-6">
        {/* Form Section */}
        <div className="space-y-4">
          <h2 className={`text-lg font-black text-${activeTabConfig.color}-600 uppercase flex items-center gap-2`}>
            <activeTabConfig.icon className="w-5 h-5" />
            Adicionar {activeTabConfig.label}
          </h2>

          {activeTab === 'expenses' && (
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Descrição da despesa..."
                value={expenseForm.desc}
                onChange={(e) => setExpenseForm({ ...expenseForm, desc: e.target.value })}
                className="flex-1 px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-red-500"
              />
              <input
                type="text"
                placeholder="R$ 0,00"
                value={expenseForm.val}
                onChange={(e) => setExpenseForm({ ...expenseForm, val: e.target.value })}
                className="w-32 px-4 py-3 bg-slate-50 border-none rounded-2xl font-black text-sm text-red-600 outline-none focus:ring-2 focus:ring-red-500"
              />
              <button
                onClick={() => addItem('expenses')}
                disabled={isSaving}
                className="px-6 py-3 bg-red-600 text-white rounded-2xl font-black text-sm hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          )}

          {activeTab === 'pix' && (
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Descrição do PIX..."
                value={pixForm.desc}
                onChange={(e) => setPixForm({ ...pixForm, desc: e.target.value })}
                className="flex-1 px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <input
                type="text"
                placeholder="R$ 0,00"
                value={pixForm.val}
                onChange={(e) => setPixForm({ ...pixForm, val: e.target.value })}
                className="w-32 px-4 py-3 bg-slate-50 border-none rounded-2xl font-black text-sm text-cyan-600 outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <button
                onClick={() => addItem('pix')}
                disabled={isSaving}
                className="px-6 py-3 bg-cyan-600 text-white rounded-2xl font-black text-sm hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          )}

          {activeTab === 'crediario' && (
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Nome do cliente..."
                value={crediarioForm.client}
                onChange={(e) => setCrediarioForm({ ...crediarioForm, client: e.target.value })}
                className="flex-1 px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-amber-500"
              />
              <input
                type="text"
                placeholder="R$ 0,00"
                value={crediarioForm.val}
                onChange={(e) => setCrediarioForm({ ...crediarioForm, val: e.target.value })}
                className="w-32 px-4 py-3 bg-slate-50 border-none rounded-2xl font-black text-sm text-amber-600 outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                onClick={() => addItem('crediario')}
                disabled={isSaving}
                className="px-6 py-3 bg-amber-600 text-white rounded-2xl font-black text-sm hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          )}

          {activeTab === 'non-registered' && (
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Nome do produto..."
                value={nonRegForm.desc}
                onChange={(e) => setNonRegForm({ ...nonRegForm, desc: e.target.value })}
                className="flex-1 px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="R$ 0,00"
                value={nonRegForm.val}
                onChange={(e) => setNonRegForm({ ...nonRegForm, val: e.target.value })}
                className="w-32 px-4 py-3 bg-slate-50 border-none rounded-2xl font-black text-sm text-blue-600 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => addItem('non-registered')}
                disabled={isSaving}
                className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-black text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Table Section */}
        <div className="space-y-3">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider">
            Lançamentos de Hoje ({currentItems.length})
          </h3>

          {currentItems.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-sm font-medium italic">Nenhum lançamento registrado ainda.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {currentItems.map((item) => {
                const isEditing = editingItem?.id === item.id && editingItem?.type === activeTab;
                
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                      isEditing
                        ? `bg-${activeTabConfig.color}-50 border-${activeTabConfig.color}-300`
                        : 'bg-white border-slate-100 hover:border-slate-200 hover:shadow-md'
                    }`}
                  >
                    {isEditing ? (
                      <>
                        <div className="flex-1 flex gap-3">
                          {activeTab === 'crediario' ? (
                            <input
                              type="text"
                              value={editForm.client}
                              onChange={(e) => setEditForm({ ...editForm, client: e.target.value })}
                              className="flex-1 px-3 py-2 bg-white border-2 border-amber-300 rounded-xl font-bold text-sm outline-none"
                            />
                          ) : (
                            <input
                              type="text"
                              value={editForm.desc}
                              onChange={(e) => setEditForm({ ...editForm, desc: e.target.value })}
                              className={`flex-1 px-3 py-2 bg-white border-2 border-${activeTabConfig.color}-300 rounded-xl font-bold text-sm outline-none`}
                            />
                          )}
                          <input
                            type="text"
                            value={editForm.val}
                            onChange={(e) => setEditForm({ ...editForm, val: e.target.value })}
                            className={`w-32 px-3 py-2 bg-white border-2 border-${activeTabConfig.color}-300 rounded-xl font-black text-sm text-${activeTabConfig.color}-600 outline-none`}
                          />
                        </div>
                        <div className="flex gap-2 ml-3">
                          <button
                            onClick={saveEdit}
                            className={`p-2 bg-${activeTabConfig.color}-600 text-white rounded-xl hover:bg-${activeTabConfig.color}-700 transition-colors`}
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-2 bg-slate-200 text-slate-600 rounded-xl hover:bg-slate-300 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex-1">
                          <p className="font-bold text-sm text-slate-800">
                            {activeTab === 'crediario' ? (item as CrediarioItem).client : (item as ExpenseItem).desc}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className={`text-sm font-black text-${activeTabConfig.color}-600`}>
                            {activeTab === 'expenses' ? '- ' : '+ '}
                            {formatCurrency(item.val)}
                          </p>
                          <div className="flex gap-1">
                            <button
                              onClick={() => startEdit(activeTab, item.id)}
                              className="p-2 text-blue-500 hover:bg-blue-50 rounded-xl transition-colors"
                              title="Editar"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteItem(activeTab, item.id)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary */}
        {currentItems.length > 0 && (
          <div className={`pt-4 border-t-2 border-${activeTabConfig.color}-100`}>
            <div className="flex justify-between items-center">
              <span className="text-sm font-black text-slate-600 uppercase">Total:</span>
              <span className={`text-xl font-black text-${activeTabConfig.color}-600`}>
                {activeTab === 'expenses' ? '- ' : '+ '}
                {formatCurrency(currentItems.reduce((sum, item) => sum + item.val, 0))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Success Feedback */}
      {saveSuccess && (
        <div className="fixed bottom-8 right-8 bg-emerald-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-300">
          <CheckCircle2 className="w-5 h-5" />
          <span className="font-black text-sm">Salvo com sucesso!</span>
        </div>
      )}
    </div>
  );
};