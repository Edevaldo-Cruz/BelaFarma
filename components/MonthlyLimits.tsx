import React, { useState, useEffect, useMemo } from 'react';
import { DollarSign, Save, Copy, Calendar, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { MonthlyLimit } from '../types';
import { useToast } from './ToastContext';

interface MonthlyLimitsProps {
  limits: MonthlyLimit[];
  onSaveLimit: (limit: MonthlyLimit | MonthlyLimit[]) => void;
}

export const MonthlyLimits: React.FC<MonthlyLimitsProps> = ({ limits, onSaveLimit }) => {
  const { addToast } = useToast();
  const actualCurrentYear = new Date().getFullYear();
  const nextYear = actualCurrentYear + 1;

  const [currentYear, setCurrentYear] = useState(actualCurrentYear);
  const [monthlyLimits, setMonthlyLimits] = useState<Record<string, number>>({});
  const [monthlyLimitsInput, setMonthlyLimitsInput] = useState<Record<string, string>>({});
  const [savedStatus, setSavedStatus] = useState<Record<string, boolean>>({});
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [uniformValueInput, setUniformValueInput] = useState('');

  // Anos disponíveis dinâmicos: cobre desde 2023 até pelo menos o próximo ano + 1 (2028+)
  const availableYears = useMemo(() => {
    const yearsInLimits = limits.map(l => l.year);
    const maxYear = Math.max(actualCurrentYear + 2, ...yearsInLimits, 2027);
    const minYear = Math.min(2023, ...yearsInLimits);
    const years: number[] = [];
    for (let y = minYear; y <= maxYear; y++) {
      years.push(y);
    }
    return years;
  }, [limits, actualCurrentYear]);

  // Carrega os limites recebidos nas estruturas de mapa
  useEffect(() => {
    const limitsMap: Record<string, number> = {};
    const limitsInputMap: Record<string, string> = {};
    limits.forEach(l => {
      const key = `${l.year}-${l.month}`;
      limitsMap[key] = l.limit;
      limitsInputMap[key] = new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(l.limit);
    });
    setMonthlyLimits(limitsMap);
    setMonthlyLimitsInput(limitsInputMap);
  }, [limits]);

  const handleLimitChange = (month: number, value: string) => {
    const key = `${currentYear}-${month}`;
    let numericValue = 0;
    let formattedValue = '0,00';

    if (value) {
      const onlyDigits = value.replace(/\D/g, '');
      if (onlyDigits) {
        numericValue = parseInt(onlyDigits, 10) / 100;
        formattedValue = new Intl.NumberFormat('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(numericValue);
      }
    }

    setMonthlyLimits(prev => ({ ...prev, [key]: numericValue }));
    setMonthlyLimitsInput(prev => ({ ...prev, [key]: formattedValue }));
    setSavedStatus(prev => ({ ...prev, [key]: false }));
  };

  const handleSave = (month: number) => {
    const key = `${currentYear}-${month}`;
    const limit = monthlyLimits[key] || 0;
    onSaveLimit({ year: currentYear, month, limit });
    setSavedStatus(prev => ({ ...prev, [key]: true }));
    addToast(`Limite de ${months[month - 1]} de ${currentYear} salvo: R$ ${monthlyLimitsInput[key] || '0,00'}`, 'success', 3000);
    setTimeout(() => {
      setSavedStatus(prev => ({ ...prev, [key]: false }));
    }, 2500);
  };

  const handleSaveAll = () => {
    setIsSavingAll(true);
    const payload: MonthlyLimit[] = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${currentYear}-${m}`;
      payload.push({
        year: currentYear,
        month: m,
        limit: monthlyLimits[key] || 0
      });
    }
    onSaveLimit(payload);
    
    // Marca todos os meses do ano como salvos
    const updatedSaved: Record<string, boolean> = {};
    for (let m = 1; m <= 12; m++) {
      updatedSaved[`${currentYear}-${m}`] = true;
    }
    setSavedStatus(prev => ({ ...prev, ...updatedSaved }));
    addToast(`Orçamento completo de ${currentYear} salvo com sucesso! (12 meses)`, 'success', 4000);
    
    setTimeout(() => {
      setIsSavingAll(false);
      setSavedStatus(prev => {
        const next = { ...prev };
        for (let m = 1; m <= 12; m++) {
          delete next[`${currentYear}-${m}`];
        }
        return next;
      });
    }, 2500);
  };

  // Copia limites de um ano anterior selecionado
  const handleCopyFromYear = (sourceYear: number) => {
    const newLimitsMap = { ...monthlyLimits };
    const newInputMap = { ...monthlyLimitsInput };
    let copiedCount = 0;

    for (let m = 1; m <= 12; m++) {
      const srcKey = `${sourceYear}-${m}`;
      const dstKey = `${currentYear}-${m}`;
      const val = monthlyLimits[srcKey] || 0;
      newLimitsMap[dstKey] = val;
      newInputMap[dstKey] = new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(val);
      if (val > 0) copiedCount++;
    }

    setMonthlyLimits(newLimitsMap);
    setMonthlyLimitsInput(newInputMap);
    addToast(`Limites de ${sourceYear} copiados para ${currentYear} (${copiedCount} meses preenchidos). Clique em "Salvar Todos" para gravar.`, 'info', 4000);
  };

  // Preenchimento fixo uniforme para todos os 12 meses do ano atual
  const handleApplyUniformValue = () => {
    const onlyDigits = uniformValueInput.replace(/\D/g, '');
    if (!onlyDigits) {
      addToast('Digite um valor válido para aplicar em todos os meses.', 'warning');
      return;
    }
    const numericValue = parseInt(onlyDigits, 10) / 100;
    const formattedValue = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericValue);

    const newLimitsMap = { ...monthlyLimits };
    const newInputMap = { ...monthlyLimitsInput };
    for (let m = 1; m <= 12; m++) {
      const key = `${currentYear}-${m}`;
      newLimitsMap[key] = numericValue;
      newInputMap[key] = formattedValue;
    }

    setMonthlyLimits(newLimitsMap);
    setMonthlyLimitsInput(newInputMap);
    setUniformValueInput('');
    addToast(`Valor de R$ ${formattedValue} aplicado nos 12 meses de ${currentYear}. Clique em "Salvar Todos" para gravar.`, 'info', 4000);
  };

  const months = Array.from({ length: 12 }, (_, i) => 
    new Date(0, i).toLocaleString('pt-BR', { month: 'long' })
  );

  // Totais do ano selecionado
  const yearStats = useMemo(() => {
    let total = 0;
    let filledMonths = 0;
    for (let m = 1; m <= 12; m++) {
      const val = monthlyLimits[`${currentYear}-${m}`] || 0;
      total += val;
      if (val > 0) filledMonths++;
    }
    const average = filledMonths > 0 ? total / 12 : 0;
    return { total, average, filledMonths };
  }, [monthlyLimits, currentYear]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
      {/* Header com Ícone e Seleção de Ano */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl shadow-sm">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">
              Limites Mensais de Gastos (Boletos)
            </h3>
            <p className="text-xs text-slate-400 font-medium">
              Defina o teto orçamentário mensal para controle de compras e pagamentos
            </p>
          </div>
        </div>

        {/* Seletor Dinâmico de Ano */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ano:</span>
            <select 
              value={currentYear} 
              onChange={e => setCurrentYear(Number(e.target.value))}
              className="bg-transparent font-black text-slate-800 text-sm focus:outline-none cursor-pointer"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>
                  {y} {y === actualCurrentYear ? '(Atual)' : y === nextYear ? '(Próximo Ano)' : ''}
                </option>
              ))}
            </select>
          </div>

          {currentYear !== nextYear && (
            <button
              onClick={() => setCurrentYear(nextYear)}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-black rounded-xl border border-indigo-200 transition-all cursor-pointer whitespace-nowrap"
              title={`Ir direto para o orçamento de ${nextYear}`}
            >
              <span>{nextYear}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Cards de Resumo Anual */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Teto Orçado em {currentYear}</p>
          <p className="text-xl font-black text-slate-900 mt-1">{formatCurrency(yearStats.total)}</p>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">{yearStats.filledMonths} de 12 meses configurados</p>
        </div>
        <div className="p-4 bg-sky-50/50 rounded-xl border border-sky-100">
          <p className="text-[10px] font-black text-sky-600 uppercase tracking-widest">Média Mensal</p>
          <p className="text-xl font-black text-sky-700 mt-1">{formatCurrency(yearStats.average)}</p>
          <p className="text-[11px] text-sky-600/70 font-medium mt-0.5">Média calculada sobre 12 meses</p>
        </div>
        <div className="p-4 bg-emerald-50/40 rounded-xl border border-emerald-100 flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Ação Global</p>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Grave todos os meses de uma vez</p>
          </div>
          <button
            onClick={handleSaveAll}
            disabled={isSavingAll}
            className="mt-2 inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isSavingAll ? <Sparkles className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Salvar Todos de {currentYear}</span>
          </button>
        </div>
      </div>

      {/* Barra de Ferramentas / Preenchimento Rápido */}
      <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-600">Copiar orçamento de:</span>
          {availableYears
            .filter(y => y !== currentYear)
            .slice(-3)
            .map(srcY => (
              <button
                key={srcY}
                onClick={() => handleCopyFromYear(srcY)}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-xs"
                title={`Copiar valores definidos em ${srcY} para o ano ${currentYear}`}
              >
                <Copy className="w-3 h-3 text-slate-400" />
                <span>Ano {srcY}</span>
              </button>
            ))}
        </div>

        {/* Aplicar valor uniforme nos 12 meses */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">R$</span>
            <input
              type="text"
              placeholder="Ex: 50.000,00"
              value={uniformValueInput}
              onChange={e => {
                const onlyDigits = e.target.value.replace(/\D/g, '');
                if (onlyDigits) {
                  const num = parseInt(onlyDigits, 10) / 100;
                  setUniformValueInput(new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num));
                } else {
                  setUniformValueInput('');
                }
              }}
              className="w-32 pl-8 pr-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <button
            onClick={handleApplyUniformValue}
            className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap shadow-xs"
            title="Preencher todos os 12 meses com este valor"
          >
            Aplicar nos 12 Meses
          </button>
        </div>
      </div>

      {/* Grade dos 12 Meses */}
      <div className="space-y-3 pt-2">
        {months.map((monthName, index) => {
          const monthIndex = index + 1;
          const key = `${currentYear}-${monthIndex}`;
          const limitInput = monthlyLimitsInput[key] || '0,00';
          const isSaved = savedStatus[key];

          return (
            <div 
              key={key} 
              className="grid grid-cols-3 items-center gap-4 p-2 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <label className="font-bold text-slate-700 capitalize text-sm flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center text-[11px] font-black">
                  {String(monthIndex).padStart(2, '0')}
                </span>
                <span>{monthName}</span>
              </label>

              <div className="relative col-span-2 flex items-center gap-2">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-slate-400 text-sm">R$</span>
                <input
                  type="text"
                  value={limitInput}
                  onChange={e => handleLimitChange(monthIndex, e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 focus:bg-white border border-slate-200 focus:border-sky-500 rounded-xl font-bold text-slate-800 text-right focus:outline-none transition-all"
                  placeholder="0,00"
                />
                <button 
                  onClick={() => handleSave(monthIndex)} 
                  className={`p-2.5 rounded-xl transition-all cursor-pointer ${
                    isSaved 
                      ? 'bg-emerald-600 text-white' 
                      : 'bg-red-600 text-white hover:bg-red-700 active:scale-95 shadow-xs'
                  }`}
                  title={isSaved ? 'Salvo!' : `Salvar limite de ${monthName}`}
                >
                  {isSaved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4"/>}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Botão de Rodapé para Salvar Todos */}
      <div className="pt-4 border-t border-slate-100 flex justify-end">
        <button
          onClick={handleSaveAll}
          disabled={isSavingAll}
          className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          {isSavingAll ? <Sparkles className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>Salvar Todo o Orçamento de {currentYear}</span>
        </button>
      </div>
    </div>
  );
};
