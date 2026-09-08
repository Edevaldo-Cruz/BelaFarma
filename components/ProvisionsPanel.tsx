import React, { useState, useEffect, useMemo } from 'react';
import { 
  PiggyBank, 
  Landmark, 
  ShieldCheck, 
  Calendar as CalendarIcon, 
  TrendingUp, 
  CheckCircle2, 
  Clock, 
  Layers,
  Info,
  RefreshCw,
  Filter
} from 'lucide-react';
import { CashClosingRecord, FixedAccount } from '../types';
import { useToast } from './ToastContext';

interface ProvisionsPanelProps {
  cashClosings: CashClosingRecord[];
  fixedAccounts?: FixedAccount[];
}

const formatBRL = (val: number) => 
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

export const ProvisionsPanel: React.FC<ProvisionsPanelProps> = ({ cashClosings }) => {
  const { addToast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [paidProvisionsDates, setPaidProvisionsDates] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [filterMode, setFilterMode] = useState<'provisioned' | 'all' | 'pending'>('provisioned');

  // Busca configurações de datas de provisões pagas
  const fetchPaidDates = async () => {
    try {
      const res = await fetch('/api/settings/paid_provisions_dates');
      if (res.ok) {
        const d = await res.json();
        if (d && d.value) {
          try {
            const parsed = JSON.parse(d.value);
            if (Array.isArray(parsed)) setPaidProvisionsDates(parsed);
          } catch(e) {}
        }
      }
    } catch (err) {
      console.error('Erro ao buscar status de provisões pagas:', err);
    }
  };

  useEffect(() => {
    fetchPaidDates();

    const handleProvisionsUpdated = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        setPaidProvisionsDates(e.detail);
      } else {
        fetchPaidDates();
      }
    };
    window.addEventListener('belafarma_provisions_updated', handleProvisionsUpdated);
    return () => window.removeEventListener('belafarma_provisions_updated', handleProvisionsUpdated);
  }, []);

  // Data de início oficial das provisões das caixinhas (ignora fechamentos anteriores a 31/08/2026)
  const PROVISION_START_DATE = '2026-08-31';

  // Fechamentos filtrados para o mês/ano selecionado a partir de 31/08/2026
  const monthClosings = useMemo(() => {
    return cashClosings
      .filter(c => {
        if (!c.date) return false;
        if (c.date < PROVISION_START_DATE) return false;
        const [y, m] = c.date.split('-');
        return parseInt(y) === selectedYear && parseInt(m) - 1 === selectedMonth;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [cashClosings, selectedMonth, selectedYear]);

  // Faturamento total do mês selecionado
  const totalMonthSales = useMemo(() => {
    return monthClosings.reduce((sum, c) => sum + (Number(c.totalSales) || 0), 0);
  }, [monthClosings]);

  // Cálculos das Caixinhas
  const prolaboreTotal = totalMonthSales * 0.12;
  const taxTotal = totalMonthSales * 0.04;
  const reserveTotal = totalMonthSales * 0.01;
  const grandTotalProvisions = prolaboreTotal + taxTotal + reserveTotal;

  // Totais Pagos / Separados
  const paidStats = useMemo(() => {
    let paidProlabore = 0;
    let paidTax = 0;
    let paidReserve = 0;

    monthClosings.forEach(c => {
      const sales = Number(c.totalSales) || 0;
      if (paidProvisionsDates.includes(`prolabore-${c.date}`)) {
        paidProlabore += sales * 0.12;
      }
      if (paidProvisionsDates.includes(`tax-${c.date}`)) {
        paidTax += sales * 0.04;
      }
      if (paidProvisionsDates.includes(`reserve-${c.date}`)) {
        paidReserve += sales * 0.01;
      }
    });

    return {
      paidProlabore,
      pendingProlabore: Math.max(0, prolaboreTotal - paidProlabore),
      paidTax,
      pendingTax: Math.max(0, taxTotal - paidTax),
      paidReserve,
      pendingReserve: Math.max(0, reserveTotal - paidReserve),
      totalPaid: paidProlabore + paidTax + paidReserve,
      totalPending: Math.max(0, grandTotalProvisions - (paidProlabore + paidTax + paidReserve))
    };
  }, [monthClosings, paidProvisionsDates, prolaboreTotal, taxTotal, reserveTotal, grandTotalProvisions]);

  const isClosingProvisioned = (date: string) => {
    return (
      paidProvisionsDates.includes(`prolabore-${date}`) ||
      paidProvisionsDates.includes(`tax-${date}`) ||
      paidProvisionsDates.includes(`reserve-${date}`)
    );
  };

  const isClosingFullyProvisioned = (date: string) => {
    return (
      paidProvisionsDates.includes(`prolabore-${date}`) &&
      paidProvisionsDates.includes(`tax-${date}`) &&
      paidProvisionsDates.includes(`reserve-${date}`)
    );
  };

  const provisionedClosingsCount = useMemo(() => {
    return monthClosings.filter(c => isClosingProvisioned(c.date)).length;
  }, [monthClosings, paidProvisionsDates]);

  const pendingClosingsCount = useMemo(() => {
    return monthClosings.filter(c => !isClosingFullyProvisioned(c.date)).length;
  }, [monthClosings, paidProvisionsDates]);

  const displayedClosings = useMemo(() => {
    if (filterMode === 'provisioned') {
      return monthClosings.filter(c => isClosingProvisioned(c.date));
    }
    if (filterMode === 'pending') {
      return monthClosings.filter(c => !isClosingFullyProvisioned(c.date));
    }
    return monthClosings;
  }, [monthClosings, filterMode, paidProvisionsDates]);

  // Alternar status de pagamento de uma provisão diária específica
  const handleToggleProvision = async (provisionKey: string) => {
    if (isUpdating) return;
    setIsUpdating(true);

    let newDates = [...paidProvisionsDates];
    const isPaid = newDates.includes(provisionKey);

    if (isPaid) {
      newDates = newDates.filter(d => d !== provisionKey);
    } else {
      newDates.push(provisionKey);
    }

    setPaidProvisionsDates(newDates);

    try {
      const res = await fetch('/api/settings/paid_provisions_dates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(newDates) })
      });

      if (!res.ok) throw new Error('Falha ao salvar status da provisão');

      window.dispatchEvent(new CustomEvent('belafarma_provisions_updated', { detail: newDates }));

      addToast(
        isPaid ? 'Provisão marcada como pendente' : 'Provisão marcada como reservada/paga com sucesso!', 
        'success'
      );
    } catch (e) {
      console.error(e);
      addToast('Erro ao atualizar status da provisão', 'error');
      // Reverter estado local em caso de erro
      setPaidProvisionsDates(paidProvisionsDates);
    } finally {
      setIsUpdating(false);
    }
  };

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(selectedYear, i, 1);
    return { value: i, label: d.toLocaleString('pt-BR', { month: 'long' }) };
  });

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 pb-12">
      {/* Header com Seletor de Período */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tighter leading-none flex items-center gap-2">
            <PiggyBank className="w-7 h-7 text-emerald-600" /> Caixinhas de Provisão
          </h1>
          <p className="text-slate-500 font-medium text-sm mt-1">
            Separação diária sobre o faturamento: Pró-labore (12%), Impostos (4%) e Fundo de Reserva (1%).
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
          <div className="relative w-44">
            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select 
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold capitalize appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
            >
              {monthOptions.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <select 
            className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            {[selectedYear - 1, selectedYear, selectedYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <button
            onClick={fetchPaidDates}
            disabled={isUpdating}
            className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all border border-slate-200 hover:border-emerald-200"
            title="Atualizar dados de provisões"
          >
            <RefreshCw className={`w-4 h-4 ${isUpdating ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Resumo Geral de Faturamento e Total Provisionado (17%) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card Faturamento Total */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Faturamento do Mês</span>
            <div className="p-2 rounded-xl bg-slate-100 text-slate-600">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">{formatBRL(totalMonthSales)}</h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {monthClosings.length} {monthClosings.length === 1 ? 'fechamento registrado' : 'fechamentos registrados'}
            </p>
          </div>
        </div>

        {/* Card 1: Pró-labore (12%) */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 rounded-2xl p-5 border border-emerald-100 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest flex items-center gap-1.5">
                <PiggyBank className="w-3.5 h-3.5 text-emerald-600" /> Pró-labore dos Sócios
              </span>
              <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-md">
                12% do Faturamento
              </span>
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-emerald-950 tracking-tight">{formatBRL(prolaboreTotal)}</h3>
            <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-emerald-200/60 font-semibold">
              <span className="text-emerald-700">Reservado: {formatBRL(paidStats.paidProlabore)}</span>
              <span className="text-amber-700 font-bold">Pendente: {formatBRL(paidStats.pendingProlabore)}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Impostos (4%) */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-2xl p-5 border border-blue-100 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black text-blue-800 uppercase tracking-widest flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5 text-blue-600" /> Impostos / Tributos
              </span>
              <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-md">
                4% do Faturamento
              </span>
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-blue-950 tracking-tight">{formatBRL(taxTotal)}</h3>
            <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-blue-200/60 font-semibold">
              <span className="text-blue-700">Reservado: {formatBRL(paidStats.paidTax)}</span>
              <span className="text-amber-700 font-bold">Pendente: {formatBRL(paidStats.pendingTax)}</span>
            </div>
          </div>
        </div>

        {/* Card 3: Reserva (1%) */}
        <div className="bg-gradient-to-br from-purple-50 to-violet-50/50 rounded-2xl p-5 border border-purple-100 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black text-purple-800 uppercase tracking-widest flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-600" /> Fundo de Reserva
              </span>
              <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded-md">
                1% do Faturamento
              </span>
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-purple-950 tracking-tight">{formatBRL(reserveTotal)}</h3>
            <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-purple-200/60 font-semibold">
              <span className="text-purple-700">Reservado: {formatBRL(paidStats.paidReserve)}</span>
              <span className="text-amber-700 font-bold">Pendente: {formatBRL(paidStats.pendingReserve)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Card de Total Acumulado Provisionado (17%) */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">Total Geral de Provisões do Mês</h3>
            <p className="text-xs text-slate-500 font-medium">Soma das reservas destinadas a pró-labore (12%), impostos (4%) e fundo de emergência (1%).</p>
          </div>
        </div>

        <div className="flex items-center gap-6 self-stretch md:self-auto justify-between md:justify-end">
          <div className="text-right">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Total Reservado</span>
            <span className="text-lg font-black text-emerald-600">{formatBRL(paidStats.totalPaid)}</span>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div className="text-right">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Total Provisionado</span>
            <span className="text-2xl font-black text-slate-900">{formatBRL(grandTotalProvisions)}</span>
          </div>
        </div>
      </div>

      {/* Tabela Analítica Dia a Dia */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-slate-500" /> Detalhamento Diário das Provisões
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {filterMode === 'provisioned' 
                ? 'Exibindo apenas os fechamentos que foram marcados como provisionados nas caixinhas (o restante foi ignorado).'
                : filterMode === 'pending'
                  ? 'Exibindo apenas os fechamentos que possuem provisões pendentes a reservar.'
                  : 'Exibindo todos os fechamentos registrados do mês.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setFilterMode('provisioned')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-xs ${
                filterMode === 'provisioned'
                  ? 'bg-emerald-600 text-white shadow-emerald-600/30 ring-2 ring-emerald-600/20'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Apenas Provisionados ({provisionedClosingsCount})
            </button>
            <button
              onClick={() => setFilterMode('all')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-xs ${
                filterMode === 'all'
                  ? 'bg-slate-900 text-white shadow-slate-900/30 ring-2 ring-slate-900/20'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Todos ({monthClosings.length})
            </button>
            <button
              onClick={() => setFilterMode('pending')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-xs ${
                filterMode === 'pending'
                  ? 'bg-amber-600 text-white shadow-amber-600/30 ring-2 ring-amber-600/20'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Pendentes ({pendingClosingsCount})
            </button>
          </div>
        </div>

        {monthClosings.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="font-bold text-sm">Nenhum fechamento de caixa registrado para este mês.</p>
          </div>
        ) : displayedClosings.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            {filterMode === 'provisioned' ? (
              <>
                <ShieldCheck className="w-12 h-12 mx-auto text-emerald-500 opacity-70" />
                <div>
                  <p className="font-black text-base text-slate-800">Nenhum fechamento marcado como provisionado neste mês</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    Os fechamentos sem provisão marcada foram ignorados por este filtro. Quando você confirmar a separação no Modal de Pendências ou registrar em "Todos", eles aparecerão listados aqui.
                  </p>
                </div>
                <button
                  onClick={() => setFilterMode('all')}
                  className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm inline-flex items-center gap-2"
                >
                  <Layers className="w-3.5 h-3.5" /> Ver todos os {monthClosings.length} fechamentos
                </button>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 opacity-70" />
                <div>
                  <p className="font-black text-base text-slate-800">Todas as provisões deste mês já foram separadas!</p>
                  <p className="text-xs text-slate-400 mt-1">Não há fechamentos pendentes de provisão para o período selecionado.</p>
                </div>
                <button
                  onClick={() => setFilterMode('provisioned')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm inline-flex items-center gap-2"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ver fechamentos provisionados
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100">
                  <th className="px-6 py-3.5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Data</th>
                  <th className="px-6 py-3.5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Faturamento</th>
                  <th className="px-6 py-3.5 text-[10px] font-black text-emerald-700 uppercase tracking-widest text-center">Pró-labore (12%)</th>
                  <th className="px-6 py-3.5 text-[10px] font-black text-blue-700 uppercase tracking-widest text-center">Impostos (4%)</th>
                  <th className="px-6 py-3.5 text-[10px] font-black text-purple-700 uppercase tracking-widest text-center">Reserva (1%)</th>
                  <th className="px-6 py-3.5 text-[10px] font-black text-slate-700 uppercase tracking-widest text-right">Total Provisionado (Dia)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedClosings.map(c => {
                  const sales = Number(c.totalSales) || 0;
                  const valProlabore = sales * 0.12;
                  const valTax = sales * 0.04;
                  const valReserve = sales * 0.01;
                  const valDayTotal = valProlabore + valTax + valReserve;

                  const isProlaborePaid = paidProvisionsDates.includes(`prolabore-${c.date}`);
                  const isTaxPaid = paidProvisionsDates.includes(`tax-${c.date}`);
                  const isReservePaid = paidProvisionsDates.includes(`reserve-${c.date}`);

                  const valDayProvisioned = 
                    (isProlaborePaid ? valProlabore : 0) +
                    (isTaxPaid ? valTax : 0) +
                    (isReservePaid ? valReserve : 0);

                  const dateFormatted = c.date.split('-').reverse().join('/');
                  const isFullyPaid = isProlaborePaid && isTaxPaid && isReservePaid;
                  const isAnyPaid = isProlaborePaid || isTaxPaid || isReservePaid;

                  return (
                    <tr 
                      key={c.id || c.date} 
                      className={`transition-colors ${
                        isFullyPaid 
                          ? 'bg-emerald-50/25 hover:bg-emerald-50/50' 
                          : isAnyPaid 
                            ? 'bg-slate-50/70 hover:bg-slate-100/70' 
                            : 'hover:bg-slate-50/60'
                      }`}
                    >
                      {/* Data */}
                      <td className="px-6 py-4 font-bold text-slate-900 text-sm whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {isFullyPaid ? (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 shadow-xs" title="100% Provisionado" />
                          ) : isAnyPaid ? (
                            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Parcialmente Provisionado" />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" title="Pendente" />
                          )}
                          <span>{dateFormatted}</span>
                        </div>
                      </td>

                      {/* Faturamento */}
                      <td className="px-6 py-4 text-right font-black text-slate-900 text-sm whitespace-nowrap">
                        {formatBRL(sales)}
                      </td>

                      {/* Pró-labore (12%) */}
                      <td className="px-6 py-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => handleToggleProvision(`prolabore-${c.date}`)}
                          disabled={isUpdating}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-xs ${
                            isProlaborePaid
                              ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                          }`}
                          title="Clique para alternar entre Separado e Pendente"
                        >
                          {isProlaborePaid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5 text-emerald-600" />}
                          <span>{formatBRL(valProlabore)}</span>
                          <span className="text-[10px] opacity-75 font-medium">({isProlaborePaid ? 'Separado' : 'Pendente'})</span>
                        </button>
                      </td>

                      {/* Impostos (4%) */}
                      <td className="px-6 py-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => handleToggleProvision(`tax-${c.date}`)}
                          disabled={isUpdating}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-xs ${
                            isTaxPaid
                              ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                              : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
                          }`}
                          title="Clique para alternar entre Separado e Pendente"
                        >
                          {isTaxPaid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5 text-blue-600" />}
                          <span>{formatBRL(valTax)}</span>
                          <span className="text-[10px] opacity-75 font-medium">({isTaxPaid ? 'Separado' : 'Pendente'})</span>
                        </button>
                      </td>

                      {/* Reserva (1%) */}
                      <td className="px-6 py-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => handleToggleProvision(`reserve-${c.date}`)}
                          disabled={isUpdating}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-xs ${
                            isReservePaid
                              ? 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700'
                              : 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100'
                          }`}
                          title="Clique para alternar entre Separado e Pendente"
                        >
                          {isReservePaid ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5 text-purple-600" />}
                          <span>{formatBRL(valReserve)}</span>
                          <span className="text-[10px] opacity-75 font-medium">({isReservePaid ? 'Separado' : 'Pendente'})</span>
                        </button>
                      </td>

                      {/* Total Dia */}
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <span className={`font-black text-sm block ${valDayProvisioned > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                          {formatBRL(valDayProvisioned > 0 ? valDayProvisioned : valDayTotal)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium block">
                          {valDayProvisioned === valDayTotal 
                            ? '100% provisionado' 
                            : valDayProvisioned > 0 
                              ? `de ${formatBRL(valDayTotal)} calculado` 
                              : 'a provisionar'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
