
import React, { useState, useMemo } from 'react';

import { DollarSign, Search, Plus, Calendar as CalendarIcon, TrendingUp } from 'lucide-react';

import { Boleto, Order } from '../types';

import Calendar, { Value } from 'react-calendar';

import 'react-calendar/dist/Calendar.css';

import './DaysInDebt.css';

interface DaysInDebtProps {
  boletos: Boleto[];
  orders: Order[];
}

interface DebtCardInfo {
  mainDate: Date;
  mainDateValue: number;
  surroundingDates: {
    date: Date;
    value: number;
  }[];
}

export const DaysInDebt: React.FC<DaysInDebtProps> = ({ boletos, orders }) => {
  const [selectedDate, setSelectedDate] = useState<Value>(new Date());
  const [totalValue, setTotalValue] = useState(0);
  const [totalValueInput, setTotalValueInput] = useState('0,00');
  const [installments, setInstallments] = useState(1);
  const [days, setDays] = useState<string>('15');
  const [simulationResult, setSimulationResult] = useState<DebtCardInfo[]>([]);

  const handleChangeTotalValue = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    value = value.replace(/\D/g, ''); // Remove tudo que não é dígito

    if (value === '') {
      setTotalValue(0);
      setTotalValueInput('0,00');
      return;
    }

    const numericValue = parseInt(value, 10) / 100;
    setTotalValue(numericValue);
    setTotalValueInput(
      new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numericValue)
    );
  };
  const handleSimulate = () => {
    const installmentValue = totalValue / installments;
    const daysArray = days.split(',').map(d => parseInt(d.trim(), 10));
    const today = new Date();
    
    const results: DebtCardInfo[] = daysArray.map(day => {
      const mainDate = new Date(today);
      mainDate.setDate(today.getDate() + day);
      mainDate.setHours(0, 0, 0, 0);

      const mainDateBoletos = boletos.filter(b => {
        const d = new Date(b.due_date);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === mainDate.getTime();
      });
      const mainDateValue = mainDateBoletos.reduce((acc, b) => acc + b.value, installmentValue);

      const surroundingDates: DebtCardInfo['surroundingDates'] = [];
      for (let i = -5; i <= 5; i++) {
        if (i === 0) continue;
        const surroundingDate = new Date(mainDate);
        surroundingDate.setDate(mainDate.getDate() + i);
        
        const surroundingBoletos = boletos.filter(b => {
          const d = new Date(b.due_date);
          d.setHours(0, 0, 0, 0);
          return d.getTime() === surroundingDate.getTime();
        });
        const surroundingValue = surroundingBoletos.reduce((acc, b) => acc + b.value, 0);
        if (surroundingValue > 0) {
          surroundingDates.push({ date: surroundingDate, value: surroundingValue });
        }
      }

      return { mainDate, mainDateValue, surroundingDates };
    });

    setSimulationResult(results);
  };

  const paymentDates = useMemo(() => {
    return boletos.map(b => {
      const d = new Date(b.due_date);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    });
  }, [boletos]);

  const getTileClassName = ({ date }: { date: Date }) => {
    date.setHours(0, 0, 0, 0);
    if (paymentDates.includes(date.getTime())) {
      return 'has-payment';
    }
    return null;
  };

  const selectedDateBoletos = useMemo(() => {
    if (!selectedDate || Array.isArray(selectedDate)) return [];
    const selectedTime = selectedDate.getTime();
    return boletos.filter(b => {
      const d = new Date(b.due_date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === selectedTime;
    });
  }, [selectedDate, boletos]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <header>
            <h1 className="text-2xl font-bold text-slate-900">Calendário de Pagamentos</h1>
            <p className="text-slate-500 font-medium">Visualize seus compromissos financeiros.</p>
          </header>
          <div className="mt-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <Calendar
              onChange={setSelectedDate}
              value={selectedDate}
              tileClassName={getTileClassName}
              className="w-full"
            />
          </div>
        </div>
        <div>
          <header>
            <h1 className="text-2xl font-bold text-slate-900">Detalhes do Dia</h1>
            <p className="text-slate-500 font-medium">
              {selectedDate && !Array.isArray(selectedDate) 
                ? selectedDate.toLocaleDateString('pt-BR')
                : 'Selecione uma data'}
            </p>
          </header>
          <div className="mt-4 space-y-2">
            {selectedDateBoletos.length > 0 ? (
              selectedDateBoletos.map(boleto => (
                <div key={boleto.id} className="bg-white p-4 rounded-xl border border-slate-200 flex justify-between items-center">
                  <span className="font-bold text-slate-800">{boleto.description}</span>
                  <span className="font-black text-lg text-red-600">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(boleto.value)}
                  </span>
                </div>
              ))
            ) : (
              <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
                <p className="text-slate-500">Nenhum boleto para esta data.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <hr className="border-slate-200" />

      <header>
        <h1 className="text-2xl font-bold text-slate-900">Pesquisa de Dias Comprometidos</h1>
        <p className="text-slate-500 font-medium">Simule um pedido e veja o impacto nos seus compromissos financeiros.</p>
      </header>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-bold text-slate-700">Valor Total do Pedido</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={totalValueInput}
                onChange={handleChangeTotalValue}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-bold text-slate-700">Número de Parcelas</label>
            <input
              type="number"
              value={installments}
              onChange={(e) => setInstallments(parseInt(e.target.value, 10))}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>
          <div>
            <label className="text-sm font-bold text-slate-700">Dias para Vencimento (separados por vírgula)</label>
            <input
              type="text"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>
        </div>
        <button
          onClick={handleSimulate}
          className="w-full flex items-center justify-center gap-2 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700"
        >
          <Search className="w-5 h-5" /> Simular
        </button>
      </div>

      {simulationResult.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-800">Resultado da Simulação</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {simulationResult.map((result, index) => (
              <div key={index} className="bg-white p-4 rounded-xl border border-slate-200">
                <div className="text-center p-4 border-b border-slate-100">
                  <p className="text-xs text-slate-500">Parcela {index + 1}</p>
                  <p className="font-bold text-lg">{result.mainDate.toLocaleDateString('pt-BR')}</p>
                  <p className="font-black text-2xl text-red-600">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(result.mainDateValue)}
                  </p>
                </div>
                <div className="space-y-2 pt-4">
                  <h4 className="text-xs font-bold text-slate-500 text-center">Dias Próximos</h4>
                  {result.surroundingDates.length > 0 ? (
                    result.surroundingDates.map(sd => (
                      <div key={sd.date.toISOString()} className="flex justify-between text-xs">
                        <span>{sd.date.toLocaleDateString('pt-BR')}</span>
                        <span className="font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sd.value)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 text-center">Nenhum boleto próximo.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

