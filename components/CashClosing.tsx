
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Calculator, Save, ChevronRight, ChevronLeft, CheckCircle2, DollarSign, 
  CreditCard, Smartphone, Wallet, TrendingUp, ArrowDown,
  Coins, History, X, Search, Lock, Plus, Calendar, Receipt, ShoppingBag,
  Banknote,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { useToast } from './ToastContext';
import { User, SafeEntry, CashClosingRecord, DailyRecordEntry } from '../types';

interface CashClosingProps {
  user: User;
  onFinish?: () => void;
  onLog: (action: string, details: string) => void;
  onSave?: () => void;
  dailyRecords: DailyRecordEntry[]; // Unprocessed daily records from DB
  onMarkDailyRecordsProcessed: (recordIds: string[], cashClosingId: string) => void;
}

type Step = 'sales' | 'cash' | 'digital' | 'summary';

const denominations = [
  { label: 'R$ 100,00', key: '100', val: 100 },
  { label: 'R$ 50,00', key: '50', val: 50 },
  { label: 'R$ 20,00', key: '20', val: 20 },
  { label: 'R$ 10,00', key: '10', val: 10 },
  { label: 'R$ 5,00', key: '5', val: 5 },
  { label: 'R$ 2,00', key: '2', val: 2 },
  { label: 'R$ 1,00', key: '1', val: 1 },
  { label: 'R$ 0,50', key: '0.50', val: 0.5 },
  { label: 'R$ 0,25', key: '0.25', val: 0.25 },
  { label: 'R$ 0,10', key: '0.10', val: 0.1 },
  { label: 'R$ 0,05', key: '0.05', val: 0.05 },
];

export const CashClosing: React.FC<CashClosingProps> = ({ user, onFinish, onLog, onSave, dailyRecords, onMarkDailyRecordsProcessed }) => {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'closing' | 'history'>('history');
  const [currentStep, setCurrentStep] = useState<Step>('sales');
  
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isPrevDayModalOpen, setIsPrevDayModalOpen] = useState(false);
  const [selectedPrevDate, setSelectedPrevDate] = useState('');
  const [prevSalesValue, setPrevSalesValue] = useState(0);
  const [safeDepositValue, setSafeDepositValue] = useState(0);

  const [totalSales, setTotalSales] = useState(0);
  const [receivedExtra, setReceivedExtra] = useState(0);
  const [initialCash, setInitialCash] = useState(0);
  
  const [currencyCount, setCurrencyCount] = useState<Record<string, number>>({
    '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '2': 0,
    '1': 0, '0.50': 0, '0.25': 0, '0.10': 0, '0.05': 0,
  });

  const [credit, setCredit] = useState(0);
  const [debit, setDebit] = useState(0);
  const [pix, setPix] = useState(0);
  const [pixDirect, setPixDirect] = useState(0);
  const [others, setOthers] = useState(0);

  const [history, setHistory] = useState<CashClosingRecord[]>([]);
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [expandedClosing, setExpandedClosing] = useState<string | null>(null);

  const [expensesList, setExpensesList] = useState<Array<{ id: string, desc: string, val: number }>>([]);
  const [nonRegisteredList, setNonRegisteredList] = useState<Array<{ id: string, desc: string, val: number }>>([]);
  const [pixDiretoList, setPixDiretoList] = useState<Array<{ id: string, desc: string, val: number }>>([]);
  const [crediarioList, setCrediarioList] = useState<Array<{ id: string, client: string, val: number }>>([]);

  const firstInputRef = useRef<HTMLInputElement>(null);

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
    const fetchHistory = async () => {
      try {
        const response = await fetch('/api/cash-closings');
        const data = await response.json();
        setHistory(data);
      } catch (error) {
        console.error('Failed to fetch cash closing history:', error);
      }
    };

    fetchHistory();

    const savedNextInitial = localStorage.getItem('belafarma_next_initial_balance');
    if (savedNextInitial) {
      setInitialCash(JSON.parse(savedNextInitial));
      localStorage.removeItem('belafarma_next_initial_balance');
    }

    // Load daily expenses/non-registered items from dailyRecords prop
    const todayStr = new Date().toISOString().split('T')[0];
    const todaysRecordEntries = dailyRecords.filter(r => r.date.startsWith(todayStr) && !r.lancado);

    let combinedExpenses: Array<{ id: string, desc: string, val: number }> = [];
    let combinedNonRegistered: Array<{ id: string, desc: string, val: number }> = [];
    let combinedPixDireto: Array<{ id: string, desc: string, val: number }> = [];
    let combinedCrediario: Array<{ id: string, client: string, val: number }> = [];

    todaysRecordEntries.forEach(entry => {
      combinedExpenses = combinedExpenses.concat(entry.expenses);
      combinedNonRegistered = combinedNonRegistered.concat(entry.nonRegistered);
      combinedPixDireto = combinedPixDireto.concat(entry.pixDiretoList || []);
      combinedCrediario = combinedCrediario.concat(entry.crediarioList || []);
    });

    setExpensesList(combinedExpenses);
    setNonRegisteredList(combinedNonRegistered);
    setPixDiretoList(combinedPixDireto);
    setCrediarioList(combinedCrediario);
    
    // Sum up pixDireto for display
    if (combinedPixDireto.length > 0) {
      const totalPix = combinedPixDireto.reduce((acc: number, curr: { val: number }) => acc + curr.val, 0);
      setPixDirect(totalPix);
    }


    // Load saved form state
    const savedFormState = localStorage.getItem('belafarma_closing_form_state');
    if (savedFormState) {
      const state = JSON.parse(savedFormState);
      setTotalSales(state.totalSales || 0);
      setReceivedExtra(state.receivedExtra || 0);
      if (!savedNextInitial) { // Only use saved initial cash if there's no "next day" value
        setInitialCash(state.initialCash || 0);
      }
      setCurrencyCount(state.currencyCount || denominations.reduce((acc, d) => ({ ...acc, [d.key]: 0 }), {}));
      setCredit(state.credit || 0);
      setDebit(state.debit || 0);
      setPix(state.pix || 0);
      // Only set pixDirect from saved state if it wasn't populated from daily records
      if (combinedPixDireto.length === 0) { // If no current pix direto entries from daily records, use saved state
        setPixDirect(state.pixDirect || 0);
      }
      setOthers(state.others || 0);
      setSafeDepositValue(state.safeDepositValue || 0);
      setCurrentStep(state.currentStep || 'sales');
      // Set activeTab to 'closing' if a state was loaded
      setActiveTab('closing');
    } else {
      // If no form state, but there are daily records, start a new closing
      if (todaysRecordEntries.length > 0) {
        setActiveTab('closing');
      }
    }
  }, [dailyRecords]);

  // Foco automático ao mudar de passo
  useEffect(() => {
    if (activeTab === 'closing' && firstInputRef.current) {
      firstInputRef.current.focus();
    }
  }, [currentStep, activeTab]);

  useEffect(() => {
    // Save form state to localStorage
    const formState = {
      totalSales,
      receivedExtra,
      initialCash,
      currencyCount,
      credit,
      debit,
      pix,
      pixDirect,
      others,
      safeDepositValue,
      currentStep,
    };
    localStorage.setItem('belafarma_closing_form_state', JSON.stringify(formState));
  }, [totalSales, receivedExtra, initialCash, currencyCount, credit, debit, pix, pixDirect, others, safeDepositValue, currentStep]);

  const totalExpenses = useMemo(() => expensesList.reduce((acc, curr) => acc + curr.val, 0) + nonRegisteredList.reduce((acc, curr) => acc + curr.val, 0), [expensesList, nonRegisteredList]);
  const totalCrediario = useMemo(() => crediarioList.reduce((acc, curr) => acc + curr.val, 0), [crediarioList]);

  const totalInDrawer = useMemo(() => {
    return Object.entries(currencyCount).reduce((acc: number, [key, count]) => {
      const denom = denominations.find(d => d.key === key);
      return acc + (Number(count) * (denom?.val || 0));
    }, 0);
  }, [currencyCount]);

    const totalDigital = useMemo(() => credit + debit + pix + pixDirect + others, [credit, debit, pix, pixDirect, others]);

    const subtotalSoma = useMemo(() => totalSales + receivedExtra + initialCash - totalExpenses - totalCrediario, [totalSales, receivedExtra, initialCash, totalExpenses, totalCrediario]);

    const totalConferido = useMemo(() => totalInDrawer + totalDigital, [totalInDrawer, totalDigital]);

    const diff = totalConferido - subtotalSoma;

  

    // FIX: Added filteredHistory memo to resolve the error in line 279

    const filteredHistory = useMemo(() => {

      return history.filter(h => {

        const d = new Date(h.date);

        return (d.getMonth() + 1) === filterMonth && d.getFullYear() === filterYear;

      });

    }, [history, filterMonth, filterYear]);

  

    const steps = [

      { id: 'sales', label: 'Vendas', icon: TrendingUp },

      { id: 'cash', label: 'Dinheiro', icon: Wallet },

      { id: 'digital', label: 'Cartões/Pix', icon: CreditCard },

      { id: 'summary', label: 'Conferência', icon: CheckCircle2 },

    ];

  

    const handleNext = () => {

      const idx = steps.findIndex(s => s.id === currentStep);

      if (idx < steps.length - 1) {

        setCurrentStep(steps[idx + 1].id as Step);

      } else if (currentStep === 'summary') {
        if (totalInDrawer > 0) {
          setIsDepositModalOpen(true);
        } else {
          setSafeDepositValue(0);
          saveClosingData();
        }
      }

    };

  

    const handleBack = () => {

      const idx = steps.findIndex(s => s.id === currentStep);

      if (idx > 0) setCurrentStep(steps[idx-1].id as Step);

    };

  

    const handleGlobalKeyDown = (e: React.KeyboardEvent) => {

      if (activeTab === 'closing') {

        if (e.key === 'Enter' && !isDepositModalOpen) {

          // Prevenir envio se for uma textarea ou se o enter for parte da navegação natural

          if ((e.target as HTMLElement).tagName !== 'TEXTAREA') {

            handleNext();

          }

        } else if (e.key === 'Escape') {

          if (isDepositModalOpen) setIsDepositModalOpen(false);

          else handleBack();

        }

      }

    };

  

        const saveClosingData = async () => {

  

          const newRecord: CashClosingRecord = {

  

            id: Date.now().toString(),

  

            date: new Date().toISOString(),

  

            totalSales, initialCash, receivedExtra, totalDigital, totalInDrawer,

  

            difference: diff, safeDeposit: safeDepositValue, expenses: totalExpenses, userName: user.name,

  

            credit, debit, pix, pixDirect,

  

            totalCrediario,

  

            crediarioList,

  

          };

  

          
          // Validate safe deposit before processing
          if (safeDepositValue > totalInDrawer) {
            addToast(`O valor de retirada (R$ ${safeDepositValue}) não pode ser maior que o valor em gaveta (R$ ${totalInDrawer}).`, 'error');
            return;
          }

          // Filter daily records: only get today's records that haven't been processed yet (lancado = false)
          const dailyRecordIdsToProcess = dailyRecords.filter(

  

            dr => {
              const recordDate = dr.date.split('T')[0];
              const today = new Date().toISOString().split('T')[0];
              const isToday = recordDate === today;
              const notProcessed = !dr.lancado;
              
              console.log('CashClosing - checking record:', {
                id: dr.id,
                date: recordDate,
                lancado: dr.lancado,
                isToday,
                notProcessed,
                willProcess: isToday && notProcessed
              });
              
              return isToday && notProcessed;
            }

  

          ).map(dr => dr.id);

  

          console.log('CashClosing - IDs to process:', dailyRecordIdsToProcess);

  

          try {

  

            const response = await fetch('/api/cash-closings', {

  

              method: 'POST',

  

              headers: { 'Content-Type': 'application/json' },

  

              body: JSON.stringify(newRecord),

  

            });

  

    

  

            if (!response.ok) {

  

              const errData = await response.json();

  

              const errorDetails = errData.details || 'Nenhum detalhe fornecido.';

  

              throw new Error(`Falha ao salvar o fechamento de caixa. \\nO servidor diz: ${errorDetails}`);

  

            }

  

    

  

            const nextInitialBalance = totalInDrawer - safeDepositValue;

  

            localStorage.setItem('belafarma_next_initial_balance', JSON.stringify(nextInitialBalance));

  

    

  

            const newHistory = [newRecord, ...history];

  

            setHistory(newHistory);

  

    

  

            // Mark daily records as processed
            

            if (dailyRecordIdsToProcess.length > 0) {

  

              await onMarkDailyRecordsProcessed(dailyRecordIdsToProcess, newRecord.id);

  

            }

  

    

  

            onLog('Fechamento de Caixa', `Total Vendas: ${formatCurrency(totalSales)}, Diferença: ${formatCurrency(diff)}, Dep. Cofre: ${formatCurrency(safeDepositValue)}`);

  

            localStorage.removeItem('belafarma_daily_temp');

  

            localStorage.removeItem('belafarma_closing_form_state'); // Clear saved form state

  

            addToast("Fechamento concluído!", 'success');

  

            if (onSave) onSave();
            if (onFinish) onFinish();

  

          } catch (error) {

  

            console.error('Error saving cash closing:', error);

  

            addToast('Erro ao salvar o fechamento de caixa. Tente novamente.', 'error');

          }
        };

        const handleSavePrevDaySales = async () => {
          if (prevSalesValue <= 0 || !selectedPrevDate) {
            addToast('Por favor, informe a data e o valor da venda.', 'warning');
            return;
          }

          const newRecord: CashClosingRecord = {
            id: 'PREV' + Date.now().toString(),
            date: new Date(selectedPrevDate + 'T12:00:00Z').toISOString(),
            totalSales: prevSalesValue,
            initialCash: 0,
            receivedExtra: 0,
            totalDigital: 0,
            totalInDrawer: 0,
            difference: 0,
            safeDeposit: 0,
            expenses: 0,
            userName: user.name,
            credit: 0,
            debit: 0,
            pix: 0,
            pixDirect: 0,
            totalCrediario: 0,
            crediarioList: [],
          };

          try {
            const response = await fetch('/api/cash-closings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newRecord),
            });

            if (!response.ok) {
              const errData = await response.json();
              throw new Error(errData.details || 'Falha ao salvar o fechamento.');
            }

            setHistory([newRecord, ...history]);
            if (onSave) onSave();
            onLog('Venda Retroativa', `Data: ${selectedPrevDate}, Valor: ${formatCurrency(prevSalesValue)}`);
            setIsPrevDayModalOpen(false);
            addToast("Venda lançada com sucesso!", 'success');
          } catch (error: any) {
            console.error('Error saving prev day sales:', error);
            addToast('Erro ao salvar: ' + (error as any).message, 'error');
          }
        };

      

  

        return (

      <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20" onKeyDown={handleGlobalKeyDown}>

        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">

          <div><h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter">FECHAMENTO</h1><p className="text-slate-500 dark:text-slate-400 font-bold italic text-sm">Use ENTER para avançar e ESC para voltar.</p></div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                // Find first valid day (not Sunday and not in history)
                let d = new Date();
                let found = false;
                for (let i = 1; i <= 45; i++) {
                  let checkDate = new Date();
                  checkDate.setDate(checkDate.getDate() - i);
                  const ds = checkDate.toISOString().split('T')[0];
                  const isSun = checkDate.getDay() === 0;
                  const hasRec = history.some(r => r.date.startsWith(ds));
                  
                  if (!isSun && !hasRec) {
                    setSelectedPrevDate(ds);
                    found = true;
                    break;
                  }
                }
                
                if (!found) {
                  addToast("Não há dias disponíveis para lançamento nos últimos 45 dias.", 'info');
                  return;
                }
                
                setPrevSalesValue(0);
                setIsPrevDayModalOpen(true);
              }}
              className="p-3 bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-xl border-2 border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-all flex items-center justify-center"
              title="Lançar Venda de Dia Anterior"
            >
              <DollarSign className="w-5 h-5" />
            </button>
            <div className="flex bg-white dark:bg-slate-800 p-1 rounded-2xl border-2 border-slate-100 dark:border-slate-800 shadow-sm">
              <button onClick={() => setActiveTab('history')} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'history' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-400 dark:text-slate-500'}`}>Histórico</button>

            <button onClick={() => {

              // Reset all fields to start a fresh closing

              localStorage.removeItem('belafarma_closing_form_state');

              setTotalSales(0);

              setReceivedExtra(0);

              // Check for a carried-over initial balance

              const savedNextInitial = localStorage.getItem('belafarma_next_initial_balance');

              if (savedNextInitial) {

                setInitialCash(JSON.parse(savedNextInitial));

                localStorage.removeItem('belafarma_next_initial_balance');

              } else {

                setInitialCash(0);

              }

              setCurrencyCount(denominations.reduce((acc, d) => ({ ...acc, [d.key]: 0 }), {}));

              setCredit(0);

              setDebit(0);

              setPix(0);

              setPixDirect(0);

              setOthers(0);
              setSafeDepositValue(0);
              setCurrentStep('sales');
                setActiveTab('closing');
            }} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'closing' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-400 dark:text-slate-500'}`}>Novo</button>
          </div>
        </div>
      </header>
  

        {activeTab === 'closing' ? (

          <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">

            <div className="flex items-center justify-between px-4 max-w-2xl mx-auto">

              {steps.map((step, i) => { const Icon = step.icon; const isActive = currentStep === step.id; const isDone = steps.findIndex(s => s.id === currentStep) > i; return (<React.Fragment key={step.id}><div className="flex flex-col items-center gap-2"><div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isActive ? 'bg-red-600 text-white shadow-lg' : isDone ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600'}`}>{isDone ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}</div></div>{i < steps.length - 1 && <div className={`flex-1 h-0.5 mx-2 rounded-full ${isDone ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'}`} />}</React.Fragment>); })}

            </div>

            <div className="bg-white dark:bg-slate-900 rounded-[3rem] border-2 border-slate-100 dark:border-slate-800 shadow-2xl overflow-hidden min-h-[500px] flex flex-col">

              <div className="p-8 md:p-12 flex-1">

                {currentStep === 'sales' && (

                  <div className="space-y-10 text-center">

                    <h2 className="text-xl font-black text-slate-900 uppercase">1. Vendas e Saldo Inicial</h2>

                    <div className="max-w-md mx-auto space-y-6 text-left">

                      <div className="space-y-2">

                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Saldo Inicial (Troco)*</label>

                        <input 
                          ref={firstInputRef} type="text" step="0.01" 
                          value={formatCurrency(initialCash)} 
                          onChange={(e) => setInitialCash(parseCurrency(e.target.value))} 
                          className="w-full px-8 py-8 bg-amber-50 dark:bg-amber-900/10 rounded-[2.5rem] font-black text-4xl text-amber-900 dark:text-amber-400 border-2 border-amber-100 dark:border-amber-900/30 outline-none" 
                        />

                      </div>

                      <div className="space-y-2">

                        <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Venda Bruta do Dia*</label>

                        <input 
                          type="text" step="0.01" 
                          value={formatCurrency(totalSales)} 
                          onChange={(e) => setTotalSales(parseCurrency(e.target.value))} 
                          className="w-full px-8 py-8 bg-slate-50 dark:bg-slate-800/50 rounded-[2.5rem] font-black text-4xl text-slate-900 dark:text-slate-100 border-2 border-transparent focus:border-slate-200 dark:focus:border-slate-700 outline-none" 
                        />

                      </div>

                    </div>

                  </div>

                )}

  

                {currentStep === 'cash' && (

                  <div className="space-y-6">

                    <div className="text-center space-y-2 mb-8">

                      <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 uppercase">2. Contagem de Dinheiro</h2>

                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400 rounded-full font-black text-sm border border-emerald-100 dark:border-emerald-900/30">

                        Total: R$ {totalInDrawer.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

                      </div>

                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 max-w-4xl mx-auto">

                      {denominations.map((denom, i) => (

                        <div key={denom.key} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-800">

                          <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase w-24">{denom.label}</span>

                          <div className="flex items-center gap-3">

                            <input 
                              ref={i === 0 ? firstInputRef : null}
                              type="number" min="0"
                              className="w-20 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-center font-black text-slate-900 dark:text-slate-100 outline-none"
                              value={currencyCount[denom.key] || ''}
                              onChange={(e) => setCurrencyCount({...currencyCount, [denom.key]: parseInt(e.target.value) || 0})}
                            />

                            <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 w-24 text-right">

                              = R$ {( (currencyCount[denom.key] || 0) * denom.val ).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

                            </span>

                          </div>

                        </div>

                      ))}

                    </div>

                  </div>

                )}

  

                {currentStep === 'digital' && (

                  <div className="space-y-10">

                    <div className="text-center mb-8">

                      <h2 className="text-xl font-black text-slate-900 uppercase">3. Valores Digitais</h2>

                    </div>

                    <div className="max-w-md mx-auto space-y-5">

                      {[

                        { label: 'Cartão de Crédito', val: credit, set: setCredit },

                        { label: 'Cartão de Débito', val: debit, set: setDebit },

                        { label: 'Pix (Maquininha)', val: pix, set: setPix },

                        { label: 'Pix Direto na Conta (Entrada)', val: pixDirect, set: setPixDirect },

                      ].map((field, idx) => (

                        <div key={idx} className="space-y-1">

                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">{field.label}</label>

                          <input 
                            ref={idx === 0 ? firstInputRef : null}
                            type="text" step="0.01" 
                            className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl font-black text-xl text-slate-900 dark:text-slate-100 outline-none focus:border-slate-400 dark:focus:border-slate-500 transition-all"
                            value={formatCurrency(field.val)}
                            onChange={(e) => field.set(parseCurrency(e.target.value))}
                          />

                        </div>

                      ))}

                    </div>

                  </div>

                )}

  

                {currentStep === 'summary' && (

                  <div className="space-y-8 text-center animate-in zoom-in-95 duration-300">

                    <h2 className="text-xl font-black uppercase text-slate-900 dark:text-slate-100">Resumo e Conferência</h2>
                    <div className="p-10 bg-white dark:bg-slate-900/50 rounded-[3rem] border-2 border-slate-100 dark:border-slate-800 max-w-2xl mx-auto shadow-inner">

                      <div className="grid grid-cols-2 gap-4 text-left border-b border-slate-200 pb-4 mb-4">

                        <div>

                          <p className="text-[10px] font-black uppercase text-slate-400">Saldo Esperado (Subtotal Soma)</p>
                          <p className="text-xl font-black text-slate-900 dark:text-slate-100">R$ {subtotalSoma.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1 mt-2">

                            <li>+ Venda Bruta do Dia: R$ {totalSales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</li>

                            <li>+ Recebido Extra: R$ {receivedExtra.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</li>

                            <li>+ Saldo Inicial: R$ {initialCash.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</li>

                            <li>- Lançamentos do Dia: R$ {totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</li>

                            <li>- Vendas em Crediário: R$ {totalCrediario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</li>

                          </ul>

                        </div>

                        <div>

                          <p className="text-[10px] font-black uppercase text-slate-400">Total Conferido</p>
                          <p className="text-xl font-black text-slate-900 dark:text-slate-100">R$ {totalConferido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1 mt-2">

                            <li>+ Total em Gaveta: R$ {totalInDrawer.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</li>



                            <li>+ Total Digital: R$ {totalDigital.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</li>

                          </ul>

                        </div>

                      </div>

                      

                      <p className="text-[10px] font-black uppercase text-slate-400 mt-4">Divergência Apurada</p>

                      <h3 className={`text-6xl font-black tracking-tighter ${Math.abs(diff) < 0.1 ? 'text-emerald-600' : 'text-red-600'}`}>

                        {formatCurrency(diff)}

                      </h3>

                      <button ref={firstInputRef} onClick={handleNext} className="mt-8 px-10 py-4 bg-red-600 text-white rounded-2xl font-black uppercase shadow-xl transition-all">Finalizar (ENTER)</button>

                    {(totalExpenses > 0 || totalCrediario > 0) && (
                      <div className="mt-8 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 text-left space-y-4">
                        <h4 className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-2">

                          <ShoppingBag className="w-3.5 h-3.5" /> Lançamentos Registrados ({formatCurrency(totalExpenses + totalCrediario)})

                        </h4>

                        {expensesList.length > 0 && (

                          <ul className="space-y-1">

                            {expensesList.map((item, idx) => (

                              <li key={item.id || idx} className="flex justify-between text-sm font-bold text-slate-700">

                                <span>{item.desc}</span>

                                <span>- {formatCurrency(item.val)}</span>

                              </li>

                            ))}

                          </ul>

                        )}

                        {nonRegisteredList.length > 0 && (

                          <ul className="space-y-1 mt-2">

                            {nonRegisteredList.map((item, idx) => (

                              <li key={item.id || idx} className="flex justify-between text-sm font-bold text-slate-700">

                                <span>{item.desc} (s/ cadastro)</span>

                                <span>- {formatCurrency(item.val)}</span>

                              </li>

                            ))}

                          </ul>

                        )}

                        {crediarioList.length > 0 && (

                          <ul className="space-y-1 mt-2">

                            <h5 className="text-[10px] font-black uppercase text-amber-500">Crediário</h5>

                            {crediarioList.map((item, idx) => (

                              <li key={item.id || idx} className="flex justify-between text-sm font-bold text-slate-700">

                                <span>{item.client}</span>

                                <span>- {formatCurrency(item.val)}</span>

                              </li>

                            ))}

                          </ul>

                        )}

                      </div>

                    )}

                    </div>

                  </div>

                )}

              </div>

  

              <div className="px-12 py-8 bg-slate-50 dark:bg-slate-800/30 border-t-2 border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <button onClick={handleBack} disabled={currentStep === 'sales'} className="px-6 py-3 text-slate-400 dark:text-slate-500 font-black text-xs uppercase disabled:opacity-20 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Voltar (ESC)</button>

                {currentStep !== 'summary' && (

                  <button onClick={handleNext} className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-sm shadow-xl">Continuar (ENTER)</button>

                )}

              </div>

            </div>

          </div>

        ) : (

          <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border-2 border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-8 py-6 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><History className="w-4 h-4" /> Histórico</h3>

            </div>

            <div className="overflow-x-auto">

               <table className="w-full text-left">

                 <thead><tr className="bg-slate-50/50 dark:bg-slate-800/50"><th className="px-8 py-4 text-[10px] font-black uppercase text-slate-400">Data</th><th className="px-8 py-4 text-right text-[10px] font-black uppercase text-slate-400">Venda</th><th className="px-8 py-4 text-center text-[10px] font-black uppercase text-slate-400">Diferença</th><th className="w-24 px-8 py-4 text-center text-[10px] font-black uppercase text-slate-400">Ações</th></tr></thead>

                 <tbody className="divide-y divide-slate-100 dark:divide-slate-800">

                   {filteredHistory.map(record => (

                     <React.Fragment key={record.id}>

                       <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                         <td className="px-8 py-4 text-xs font-bold text-slate-500 dark:text-slate-400">{new Date(record.date).toLocaleDateString('pt-BR')}</td>
                         <td className="px-8 py-4 text-right font-black text-slate-900 dark:text-slate-100">{formatCurrency(record.totalSales)}</td>
                         <td className="px-8 py-4 text-center"><span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase ${Math.abs(record.difference) < 0.1 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>{formatCurrency(record.difference)}</span></td>

                         <td className="px-8 py-4 text-center">

                           <button onClick={() => setExpandedClosing(expandedClosing === record.id ? null : record.id)} className="p-2 rounded-full hover:bg-slate-200">

                             {expandedClosing === record.id ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}

                           </button>

                         </td>

                       </tr>

                       {expandedClosing === record.id && (
                          <tr className="bg-slate-50 dark:bg-slate-800/10">
                            <td colSpan={4} className="p-4">
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">

                                {Object.entries(record).map(([key, value]) => {

                                  // Simple mapping for display labels

                                  const keyMap: { [key: string]: string } = {

                                    id: 'ID',

                                    date: 'Data',

                                    totalSales: 'Total de Vendas',

                                    initialCash: 'Caixa Inicial',

                                    receivedExtra: 'Recebimento Extra',

                                    totalDigital: 'Total Digital',

                                    totalInDrawer: 'Total em Gaveta',

                                    difference: 'Diferença',

                                    safeDeposit: 'Retirada',

                                    expenses: 'Despesas',

                                    pixDirect: 'Pix Direto',

                                    credit: 'Crédito',

                                    debit: 'Débito',

                                    pix: 'Pix (Maquininha)',

                                    userName: 'Usuário',

                                    totalCrediario: 'Total Crediário',

                                    crediarioList: 'Lista Crediário'

                                  };

                                  const label = keyMap[key] || key;

                                  let displayValue: string;

                                  if (key === 'crediarioList') {

                                    displayValue = Array.isArray(value) ? (value as Array<{ client: string, val: number }>).map(c => `${c.client}: ${formatCurrency(c.val)}`).join(', ') : 'N/A';

                                  } else if (typeof value === 'number' && key !== 'id') {

                                    displayValue = formatCurrency(value);

  

                                  } else if (key === 'date') {

                                    displayValue = new Date(value as string).toLocaleString('pt-BR', { timeZone: 'UTC' });

                                  } else {

                                    displayValue = String(value);

                                  }

                                  // Destacar Retirada em negrito
                                  const isBold = key === 'safeDeposit';

                                  return (

                                    <div key={key} className="text-xs">

                                      <p className="font-bold text-slate-400 dark:text-slate-500 uppercase">{label}</p>

                                      <p className={`font-mono text-slate-800 dark:text-slate-200 ${isBold ? 'font-black text-base text-red-600 dark:text-red-400' : ''}`}>{displayValue}</p>

                                    </div>

                                  );

                                })}
                                
                                {/* Campo adicional: Caixa (Gaveta - Retirada) */}
                                  <div className="text-xs">
                                    <p className="font-bold text-slate-400 dark:text-slate-500 uppercase">Caixa</p>
                                    <p className="font-mono text-slate-800 dark:text-slate-200 font-black text-base">
                                      {formatCurrency(record.totalInDrawer - record.safeDeposit)}
                                    </p>
                                  </div>

                              </div>

                            </td>

                          </tr>

                        )}

                     </React.Fragment>

                   ))}

                 </tbody>

               </table>

            </div>

          </div>

        )}

  

        {isDepositModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md" onKeyDown={(e) => { if(e.key === 'Enter') saveClosingData(); if(e.key === 'Escape') setIsDepositModalOpen(false); }}>
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] shadow-2xl border-4 border-emerald-500 dark:border-emerald-600 overflow-hidden">
              <div className="p-8 space-y-6 text-center">
                <h2 className="text-xl font-black uppercase text-emerald-700 dark:text-emerald-400">Depósito em Cofre</h2>
                <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase">Dinheiro em Gaveta</p>
                  <p className="text-4xl font-black text-slate-900 dark:text-slate-100">{formatCurrency(totalInDrawer)}</p>
                </div>

                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase">Valor p/ Retirada*</label>
                  <input 
                    autoFocus type="text" step="0.01" 
                    value={formatCurrency(safeDepositValue)} 
                    onChange={(e) => setSafeDepositValue(parseCurrency(e.target.value))} 
                    className="w-full px-6 py-5 bg-emerald-50 dark:bg-emerald-900/10 border-2 border-emerald-100 dark:border-emerald-900/30 rounded-3xl font-black text-slate-900 dark:text-slate-100 text-2xl outline-none" 
                  />
                </div>

                <button 
                  onClick={saveClosingData} 
                  disabled={safeDepositValue > totalInDrawer}
                  className={`w-full py-5 rounded-2xl font-black uppercase shadow-xl transition-all ${safeDepositValue > totalInDrawer ? 'bg-slate-300 cursor-not-allowed' : 'bg-slate-900 text-white'}`}
                >
                  {safeDepositValue > totalInDrawer ? 'Valor Excedido' : 'Confirmar (ENTER)'}
                </button>

                <button onClick={() => setIsDepositModalOpen(false)} className="text-[10px] font-black uppercase text-slate-400">Cancelar (ESC)</button>

              </div>
            </div>
          </div>
        )}

        {isPrevDayModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] shadow-2xl border-4 border-emerald-500 dark:border-emerald-600 overflow-hidden">
              <div className="p-8 space-y-6 text-center">
                <h2 className="text-xl font-black uppercase text-emerald-700 dark:text-emerald-400">Venda de Dia Anterior</h2>
                
                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase">Selecione o Dia*</label>
                  <select 
                    value={selectedPrevDate}
                    onChange={(e) => setSelectedPrevDate(e.target.value)}
                    className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl font-bold dark:text-slate-100 outline-none"
                  >
                    {Array.from({ length: 45 }, (_, i) => {
                      const d = new Date();
                      d.setDate(d.getDate() - (i + 1));
                      const ds = d.toISOString().split('T')[0];
                      
                      // Check if it's Sunday (0)
                      const isSunday = d.getDay() === 0;
                      
                      // Check if this date already exists in history
                      const hasRecord = history.some(record => record.date.startsWith(ds));
                      
                      if (isSunday || hasRecord) return null;

                      return (
                        <option key={ds} value={ds}>
                           {d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </option>
                      );
                    }).filter(Boolean)}
                  </select>
                </div>

                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase">Venda Bruta*</label>
                  <input 
                    autoFocus type="text"
                    value={formatCurrency(prevSalesValue)} 
                    onChange={(e) => setPrevSalesValue(parseCurrency(e.target.value))} 
                    className="w-full px-6 py-5 bg-emerald-50 dark:bg-emerald-900/10 border-2 border-emerald-100 dark:border-emerald-900/30 rounded-3xl font-black text-slate-900 dark:text-slate-100 text-2xl outline-none" 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => setIsPrevDayModalOpen(false)} className="py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black uppercase">Cancelar</button>
                  <button onClick={handleSavePrevDaySales} className="py-4 bg-slate-900 dark:bg-slate-50 text-white dark:text-slate-900 rounded-2xl font-black uppercase shadow-xl hover:opacity-90 transition-all">Confirmar</button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

    );

  };
