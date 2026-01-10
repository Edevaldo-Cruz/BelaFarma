
import React, { useState, useEffect } from 'react';
import { DollarSign, Save } from 'lucide-react';
import { MonthlyLimit } from '../types';

interface MonthlyLimitsProps {
  limits: MonthlyLimit[];
  onSaveLimit: (limit: MonthlyLimit) => void;
}

export const MonthlyLimits: React.FC<MonthlyLimitsProps> = ({ limits, onSaveLimit }) => {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [monthlyLimits, setMonthlyLimits] = useState<Record<string, number>>({});
  const [monthlyLimitsInput, setMonthlyLimitsInput] = useState<Record<string, string>>({});

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
  };

  const handleSave = (month: number) => {
    const key = `${currentYear}-${month}`;
    const limit = monthlyLimits[key];
    if (limit !== undefined) {
      onSaveLimit({ year: currentYear, month, limit });
    }
  };

  const months = Array.from({ length: 12 }, (_, i) => 
    new Date(0, i).toLocaleString('pt-BR', { month: 'long' })
  );

  return (
    <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl shadow-sm">
          <DollarSign className="w-6 h-6" />
        </div>
        <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">Limites Mensais de Gastos (Boletos)</h3>
      </div>
      <div className="space-y-4 pt-4 border-t border-slate-50">
        <div className="flex justify-end">
          <select 
            value={currentYear} 
            onChange={e => setCurrentYear(Number(e.target.value))}
            className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold"
          >
            {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="space-y-3">
          {months.map((monthName, index) => {
            const monthIndex = index + 1;
            const key = `${currentYear}-${monthIndex}`;
            const limitInput = monthlyLimitsInput[key] || '0,00';

            return (
              <div key={key} className="grid grid-cols-3 items-center gap-4">
                <label className="font-bold text-slate-600 capitalize text-sm">{monthName}</label>
                <div className="relative col-span-2 flex items-center gap-2">
                   <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-slate-400">R$</span>
                   <input
                    type="text"
                    value={limitInput}
                    onChange={e => handleLimitChange(monthIndex, e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800"
                  />
                  <button onClick={() => handleSave(monthIndex)} className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                    <Save className="w-4 h-4"/>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  );
};
