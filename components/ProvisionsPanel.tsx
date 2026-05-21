import React, { useState, useEffect, useMemo } from 'react';
import { Target, Wallet, Calendar as CalendarIcon, Save, Info, AlertTriangle, CheckCircle2, DollarSign, Edit2, X, TrendingUp } from 'lucide-react';
import { CashClosingRecord, FixedAccount } from '../types';

interface ProvisionsPanelProps {
  cashClosings: CashClosingRecord[];
  fixedAccounts: FixedAccount[];
}

export const ProvisionsPanel: React.FC<ProvisionsPanelProps> = ({ cashClosings, fixedAccounts }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  const [salesGoal, setSalesGoal] = useState<number>(40000);
  const [prolaboreGoal, setProlaboreGoal] = useState<number>(3000);
  const [vacationGoal, setVacationGoal] = useState<number>(1750);
  
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [tempProlabore, setTempProlabore] = useState('');
  const [tempVacation, setTempVacation] = useState('');
  const [tempSales, setTempSales] = useState('');

  const now = new Date();

  useEffect(() => {
    const fetchGoals = async () => {
      try {
        const [resSales, resProlabore, resVacation] = await Promise.all([
          fetch('/api/settings/monthly_sales_goal'),
          fetch('/api/settings/prolabore_monthly'),
          fetch('/api/settings/vacation_monthly')
        ]);

        if (resSales.ok) {
          const d = await resSales.json();
          if (d && d.value) setSalesGoal(Number(d.value));
        }
        if (resProlabore.ok) {
          const d = await resProlabore.json();
          if (d && d.value) setProlaboreGoal(Number(d.value));
        }
        if (resVacation.ok) {
          const d = await resVacation.json();
          if (d && d.value) setVacationGoal(Number(d.value));
        }
      } catch (err) {
        console.error('Erro ao buscar configurações de metas', err);
      }
    };
    fetchGoals();
  }, []);

  const handleSaveSettings = async () => {
    const numSales = Number(tempSales.replace(/[^0-9.]/g, ''));
    const numProlabore = Number(tempProlabore.replace(/[^0-9.]/g, ''));
    const numVacation = Number(tempVacation.replace(/[^0-9.]/g, ''));

    if (numSales > 0) setSalesGoal(numSales);
    if (numProlabore >= 0) setProlaboreGoal(numProlabore);
    if (numVacation >= 0) setVacationGoal(numVacation);

    try {
      await Promise.all([
        fetch('/api/settings/monthly_sales_goal', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: numSales > 0 ? String(numSales) : String(salesGoal) })
        }),
        fetch('/api/settings/prolabore_monthly', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: numProlabore >= 0 ? String(numProlabore) : String(prolaboreGoal) })
        }),
        fetch('/api/settings/vacation_monthly', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: numVacation >= 0 ? String(numVacation) : String(vacationGoal) })
        })
      ]);
    } catch (e) {
      console.error(e);
    }
    
    setIsEditingSettings(false);
  };

  const startEditing = () => {
    setTempSales(salesGoal.toString());
    setTempProlabore(prolaboreGoal.toString());
    setTempVacation(vacationGoal.toString());
    setIsEditingSettings(true);
  };

  // Calculations
  const currentMonthSales = useMemo(() => {
    return cashClosings
      .filter(c => {
        if (!c.date) return false;
        const [y, m] = c.date.split('-');
        return parseInt(y) === selectedYear && parseInt(m) - 1 === selectedMonth;
      })
      .reduce((acc, curr) => acc + (curr.totalSales || 0), 0);
  }, [cashClosings, selectedMonth, selectedYear]);

  const fixedAccountsTotal = useMemo(() => {
    return fixedAccounts.filter(fa => fa.isActive).reduce((acc, fa) => acc + fa.value, 0);
  }, [fixedAccounts]);

  const totalProvisionsTarget = fixedAccountsTotal + prolaboreGoal + vacationGoal;
  
  // Progresso baseado nas Vendas:
  // Se eu faturei X de uma meta de Vendas de Y, eu preenchi (X/Y) das minhas provisões.
  const salesProgressPercent = salesGoal > 0 ? Math.min(currentMonthSales / salesGoal, 1) : 0;
  
  const provisionedAmount = totalProvisionsTarget * salesProgressPercent;
  const missingSalesAmount = Math.max(0, salesGoal - currentMonthSales);

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(selectedYear, i, 1);
    return { value: i, label: d.toLocaleString('pt-BR', { month: 'long' }) };
  });

  const getProgressColor = (percent: number) => {
    if (percent >= 1) return 'bg-emerald-500 shadow-emerald-200';
    if (percent >= 0.75) return 'bg-blue-500 shadow-blue-200';
    if (percent >= 0.4) return 'bg-yellow-500 shadow-yellow-200';
    return 'bg-red-500 shadow-red-200';
  };

  const formatBRL = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tighter leading-none flex items-center gap-2">
            <Target className="w-6 h-6 text-indigo-600" /> Progresso de Provisões
          </h1>
          <p className="text-slate-500 font-medium text-sm mt-1">Acompanhamento unificado das reservas do mês baseado nas vendas.</p>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
          <div className="relative w-full md:w-48">
            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select 
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
            >
              {monthOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label.toUpperCase()}</option>)}
            </select>
          </div>
          <div className="relative w-full md:w-32">
             <select 
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </header>

      {/* PAINEL CENTRAL (BURACO) */}
      <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-[3rem] p-8 md:p-12 text-white shadow-2xl relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-indigo-500 rounded-full blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-blue-500 rounded-full blur-3xl opacity-10"></div>
        
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
          <div className="col-span-2 space-y-6">
            <h2 className="text-sm font-black text-indigo-300 uppercase tracking-[0.2em] flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Desempenho Geral do Mês
            </h2>
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <p className="text-4xl md:text-6xl font-black tracking-tighter">
                  {formatBRL(currentMonthSales)}
                </p>
                <p className="text-indigo-200 font-bold mb-2">
                  de {formatBRL(salesGoal)}
                </p>
              </div>
              
              <div className="w-full bg-slate-800/80 rounded-full h-4 backdrop-blur-sm p-0.5 border border-slate-700">
                <div 
                  className={`h-full rounded-full transition-all duration-1000 shadow-lg ${getProgressColor(salesProgressPercent)}`}
                  style={{ width: `${salesProgressPercent * 100}%` }}
                ></div>
              </div>
              <p className="text-xs text-right font-black tracking-widest text-indigo-300">
                {(salesProgressPercent * 100).toFixed(1)}% ATINGIDO
              </p>
            </div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-md rounded-[2rem] p-6 border border-white/10 flex flex-col items-center justify-center text-center h-full">
            <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-2">Buraco a Faturar</p>
            {missingSalesAmount > 0 ? (
              <>
                <p className="text-3xl font-black text-white tracking-tighter">{formatBRL(missingSalesAmount)}</p>
                <p className="text-xs font-bold text-indigo-300 mt-2 opacity-80">Faltam para garantir 100% das provisões do mês</p>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-2" />
                <p className="text-lg font-black text-emerald-300 uppercase tracking-widest">Meta Batida!</p>
                <p className="text-xs text-emerald-200/70 mt-1">Todas as provisões garantidas.</p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-2">
        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
           Os 3 Grandes Potes
        </h3>
        
        {isEditingSettings ? (
          <div className="flex items-center gap-2 bg-indigo-50 p-1.5 rounded-2xl border border-indigo-100">
             <button onClick={() => setIsEditingSettings(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
               <X className="w-4 h-4" />
             </button>
             <button onClick={handleSaveSettings} className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md flex items-center gap-1">
               <Save className="w-3 h-3" /> Salvar Metas
             </button>
          </div>
        ) : (
          <button onClick={startEditing} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
             <Edit2 className="w-3 h-3" /> Configurar Valores
          </button>
        )}
      </div>

      {isEditingSettings && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-100 p-6 rounded-[2rem] border border-slate-200 animate-in fade-in">
          <div>
            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-1">Meta Faturamento Mês</label>
            <input type="number" value={tempSales} onChange={e => setTempSales(e.target.value)} className="mt-1 w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 font-bold" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-1">Prolabore Mensal</label>
            <input type="number" value={tempProlabore} onChange={e => setTempProlabore(e.target.value)} className="mt-1 w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 font-bold" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-1">Férias e 13º Mensal</label>
            <input type="number" value={tempVacation} onChange={e => setTempVacation(e.target.value)} className="mt-1 w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 font-bold" />
          </div>
        </div>
      )}

      {/* POTES */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Pote 1: Contas Fixas */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-md transition-shadow group">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform">
              <CalendarIcon className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-500 px-2 py-1 rounded-lg">Pote 1</span>
          </div>
          <p className="font-black text-slate-900 uppercase tracking-tighter text-lg">Contas Fixas</p>
          <p className="text-xs text-slate-500 font-medium mb-6">Custos inegociáveis para o negócio girar.</p>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm font-bold">
              <span className="text-blue-600">{formatBRL(fixedAccountsTotal * salesProgressPercent)}</span>
              <span className="text-slate-400">/ {formatBRL(fixedAccountsTotal)}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div className={`h-full rounded-full transition-all duration-1000 ${getProgressColor(salesProgressPercent)}`} style={{ width: `${salesProgressPercent * 100}%` }}></div>
            </div>
          </div>
        </div>

        {/* Pote 2: Prolabore */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-md transition-shadow group">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:scale-110 transition-transform">
              <Wallet className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-500 px-2 py-1 rounded-lg">Pote 2</span>
          </div>
          <p className="font-black text-slate-900 uppercase tracking-tighter text-lg">Prolabore do Mês</p>
          <p className="text-xs text-slate-500 font-medium mb-6">Remuneração dos sócios garantida.</p>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm font-bold">
              <span className="text-indigo-600">{formatBRL(prolaboreGoal * salesProgressPercent)}</span>
              <span className="text-slate-400">/ {formatBRL(prolaboreGoal)}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div className={`h-full rounded-full transition-all duration-1000 ${getProgressColor(salesProgressPercent)}`} style={{ width: `${salesProgressPercent * 100}%` }}></div>
            </div>
          </div>
        </div>

        {/* Pote 3: Férias e 13º */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-md transition-shadow group">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform">
              <DollarSign className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-500 px-2 py-1 rounded-lg">Pote 3</span>
          </div>
          <p className="font-black text-slate-900 uppercase tracking-tighter text-lg">Férias e 13º</p>
          <p className="text-xs text-slate-500 font-medium mb-6">Reserva de lucro para o futuro.</p>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm font-bold">
              <span className="text-emerald-600">{formatBRL(vacationGoal * salesProgressPercent)}</span>
              <span className="text-slate-400">/ {formatBRL(vacationGoal)}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div className={`h-full rounded-full transition-all duration-1000 ${getProgressColor(salesProgressPercent)}`} style={{ width: `${salesProgressPercent * 100}%` }}></div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="bg-slate-50 border-2 border-dashed border-slate-200 p-6 rounded-[2rem] flex items-center gap-4 text-slate-500 text-sm font-bold">
        <Info className="w-8 h-8 text-indigo-400 shrink-0" />
        <p>A matemática é simples: À medida que as vendas do mês aumentam e se aproximam da Meta de Faturamento, a porcentagem de conclusão é aplicada igualmente em todos os 3 Potes de Provisão.</p>
      </div>
    </div>
  );
};
