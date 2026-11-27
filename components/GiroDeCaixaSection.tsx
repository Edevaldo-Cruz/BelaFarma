import React, { useState, useMemo } from 'react';
import { 
  RotateCw, 
  Calendar, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight, 
  DollarSign, 
  TrendingUp, 
  Package, 
  ShieldCheck, 
  HelpCircle, 
  Layers,
  Sparkles,
  Zap,
  Flame,
  Info
} from 'lucide-react';
import { Boleto, CashClosingRecord, FixedAccount } from '../types';

interface GiroDeCaixaSectionProps {
  cashClosings: CashClosingRecord[];
  boletos: Boleto[];
  fixedAccounts: FixedAccount[];
  estoqueTotalEstimado?: number;
  estoqueParado90d?: number;
  valorParado90d?: number;
}

export const GiroDeCaixaSection: React.FC<GiroDeCaixaSectionProps> = ({
  cashClosings,
  boletos,
  fixedAccounts,
  estoqueTotalEstimado = 75000,
  estoqueParado90d = 1164,
  valorParado90d = 53193.52
}) => {
  // Ajustes manuais de simulação para o empresário brincar com os prazos
  const [pmpCustom, setPmpCustom] = useState<number>(28); // Prazo Fornecedores (média 28d)
  const [pmrCustom, setPmrCustom] = useState<number>(2);  // Prazo Recebimento (D+1/D+2 com antecipação)
  const [pmeCustom, setPmeCustom] = useState<number>(45); // Prazo Médio de Estoque (dias)
  const [simularDesovaParados, setSimularDesovaParados] = useState<boolean>(false);

  // 1. Média de Vendas Diárias e Mensais
  const { mediaDiariaVendas, faturamentoMensal } = useMemo(() => {
    if (!cashClosings || cashClosings.length === 0) {
      return { mediaDiariaVendas: 1350, faturamentoMensal: 40500 };
    }
    const ultimos = cashClosings.slice(-30);
    const soma = ultimos.reduce((acc, c) => acc + (Number(c.totalSales) || 0), 0);
    const media = ultimos.length > 0 ? soma / ultimos.length : 1350;
    return {
      mediaDiariaVendas: media > 0 ? media : 1350,
      faturamentoMensal: (media > 0 ? media : 1350) * 30
    };
  }, [cashClosings]);

  // 2. Custos Fixos Mensais e Diários
  const custoFixoMensal = useMemo(() => {
    return (fixedAccounts || [])
      .filter(f => f.isActive)
      .reduce((acc, f) => acc + (Number((f as any).amount || f.value) || 0), 0) || 11700;
  }, [fixedAccounts]);
  const custoFixoDiario = custoFixoMensal / 30;

  // 3. CMV Médio Diário (~58% das vendas em farmácia independente)
  const cmvDiario = mediaDiariaVendas * 0.58;
  const custoTotalDiario = cmvDiario + custoFixoDiario;

  // PME efetivo (se simular desova de parados, o estoque gira muito mais rápido)
  const pmeEfetivo = simularDesovaParados ? Math.round(pmeCustom * 0.65) : pmeCustom;

  // Ciclo Operacional = PME + PMR
  const cicloOperacional = pmeEfetivo + pmrCustom;

  // Ciclo de Caixa (Giro de Caixa em dias) = Ciclo Operacional - PMP
  const cicloCaixaDias = cicloOperacional - pmpCustom;

  // Giro de Caixa no Ano = 360 / Ciclo de Caixa
  const giroCaixaAno = cicloCaixaDias > 0 ? (360 / cicloCaixaDias) : 0;

  // Necessidade de Capital de Giro (NCG) = Custo Total Diário * Ciclo de Caixa
  const ncg = Math.max(0, custoTotalDiario * cicloCaixaDias);

  // Diagnóstico do Giro
  const getDiagnostico = () => {
    if (cicloCaixaDias <= 10) {
      return {
        badge: 'Nível Ouro (Excelente)',
        color: 'emerald',
        bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800',
        text: 'text-emerald-700 dark:text-emerald-300',
        desc: 'Seu caixa roda quase sem depender de dinheiro próprio. O faturamento das vendas entra no banco bem a tempo de pagar os boletos dos distribuidores!'
      };
    }
    if (cicloCaixaDias <= 22) {
      return {
        badge: 'Saudável (Muito Bom)',
        color: 'sky',
        bg: 'bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800',
        text: 'text-sky-700 dark:text-sky-300',
        desc: 'O recebimento em D+1 te dá agilidade, mas o estoque parado ainda pede um capital de giro de segurança para cobrir os boletos.'
      };
    }
    return {
      badge: 'Atenção (Giro Lento)',
      color: 'amber',
      bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
      text: 'text-amber-700 dark:text-amber-300',
      desc: 'Os boletos vencem muito antes de a mercadoria ser vendida, exigindo que você tire dinheiro do bolso para financiar a farmácia.'
    };
  };

  const diag = getDiagnostico();

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
      {/* Cabeçalho do Painel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <RotateCw className="w-5 h-5 animate-spin-slow" />
            </span>
            <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
              Termômetro de Giro de Caixa & Capital de Giro
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Veja exatamente quanto tempo o dinheiro da farmácia leva para rodar e qual a quantia necessária para nunca apertar o caixa.
          </p>
        </div>

        {/* Status Geral */}
        <div className={`px-4 py-2 rounded-2xl border flex items-center gap-2 ${diag.bg}`}>
          <div className={`w-2.5 h-2.5 rounded-full bg-${diag.color}-500 animate-pulse`} />
          <span className={`text-xs font-black uppercase tracking-wider ${diag.text}`}>
            {diag.badge}
          </span>
        </div>
      </div>

      {/* Grid Principal: Os 3 Prazos + O Ciclo de Caixa */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Prazo de Estoque (PME) */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-4 h-4 text-amber-500" />
                Estoque Médio (PME)
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                Prateleira
              </span>
            </div>
            <div className="text-3xl font-black font-mono text-slate-900 dark:text-white mt-1">
              {pmeEfetivo} <span className="text-sm font-normal text-slate-500">dias</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
              Tempo médio que a mercadoria fica parada até ser vendida no balcão.
            </p>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-[11px] text-slate-500">
            <span>Ajustar PME:</span>
            <input 
              type="number"
              min="15"
              max="90"
              value={pmeCustom}
              onChange={(e) => setPmeCustom(Number(e.target.value) || 45)}
              className="w-14 text-center font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md py-0.5"
            />
          </div>
        </div>

        {/* 2. Prazo de Recebimento (PMR) */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-emerald-500" />
                Recebimento (PMR)
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                D+1 Ativo
              </span>
            </div>
            <div className="text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1">
              {pmrCustom} <span className="text-sm font-normal text-slate-500">dias</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
              Dinheiro na conta no dia seguinte (Pix, Dinheiro e Cartão antecipado).
            </p>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-[11px] text-slate-500">
            <span>Ajustar PMR:</span>
            <input 
              type="number"
              min="0"
              max="30"
              value={pmrCustom}
              onChange={(e) => setPmrCustom(Number(e.target.value) || 2)}
              className="w-14 text-center font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md py-0.5"
            />
          </div>
        </div>

        {/* 3. Prazo de Fornecedores (PMP) */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-blue-500" />
                Fornecedores (PMP)
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                Boletos
              </span>
            </div>
            <div className="text-3xl font-black font-mono text-blue-600 dark:text-blue-400 mt-1">
              {pmpCustom} <span className="text-sm font-normal text-slate-500">dias</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
              Prazo médio concedido por Distrimed, Martins, Profarma e Oriente.
            </p>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-[11px] text-slate-500">
            <span>Ajustar PMP:</span>
            <input 
              type="number"
              min="7"
              max="60"
              value={pmpCustom}
              onChange={(e) => setPmpCustom(Number(e.target.value) || 28)}
              className="w-14 text-center font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md py-0.5"
            />
          </div>
        </div>

        {/* 4. O Ciclo Financeiro (Giro de Caixa) */}
        <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-950 text-white rounded-2xl p-4 flex flex-col justify-between border border-indigo-500/40 shadow-lg">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                <RotateCw className="w-4 h-4 text-indigo-400" />
                Ciclo de Caixa Real
              </span>
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-200">
                PME + PMR - PMP
              </span>
            </div>
            <div className="text-3xl font-black font-mono text-emerald-300 mt-1">
              {cicloCaixaDias} <span className="text-sm font-normal text-indigo-200">dias</span>
            </div>
            <p className="text-[11px] text-indigo-200 mt-1 leading-snug">
              Tempo em que a farmácia precisa financiar o estoque antes de receber.
            </p>
          </div>

          <div className="mt-3 pt-2 border-t border-indigo-800/80 flex items-center justify-between text-[11px] text-indigo-300 font-bold">
            <span>Giro no ano:</span>
            <span className="text-white font-mono">{giroCaixaAno.toFixed(1)} voltas</span>
          </div>
        </div>
      </div>

      {/* Bloco de Interpretação & Necessidade de Capital de Giro */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card Necessidade de Capital de Giro */}
        <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 p-5 rounded-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-indigo-500" />
                Capital de Giro Necessário (NCG)
              </span>
            </div>
            <div className="text-3xl font-black font-mono text-indigo-600 dark:text-indigo-400 mt-2">
              R$ {ncg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              Com esse saldo guardado na conta ou caixinha de reserva, a BelaFarma opera com <strong>zero risco de cheque especial</strong> e banca os {cicloCaixaDias} dias de descasamento com total tranquilidade.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 flex justify-between">
            <span>Gasto diário total da loja:</span>
            <strong className="font-mono">R$ {custoTotalDiario.toFixed(2)}/dia</strong>
          </div>
        </div>

        {/* Card Alerta de Produtos Parados (A Chave para o Giro) */}
        <div className="lg:col-span-2 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 p-5 rounded-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black uppercase tracking-wider text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-amber-500" />
                Oportunidade Oculta: {estoqueParado90d} Itens Parados (+90 dias)
              </span>
              <button
                type="button"
                onClick={() => setSimularDesovaParados(!simularDesovaParados)}
                className={`px-3 py-1 rounded-xl text-xs font-black transition-all border cursor-pointer ${
                  simularDesovaParados 
                    ? 'bg-amber-500 text-white border-amber-600 shadow-sm' 
                    : 'bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 hover:bg-amber-50'
                }`}
              >
                {simularDesovaParados ? '✓ Simulação Ativa (-35% PME)' : 'Simular Desova (-35% PME)'}
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
                R$ {valorParado90d.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                em mercadorias que poderiam ser dinheiro no banco agora
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
              {simularDesovaParados ? (
                <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                  ✨ Ao desovar esses produtos parados, seu estoque cai de {pmeCustom} para {pmeEfetivo} dias, seu ciclo de caixa encolhe para apenas {cicloCaixaDias} dias e a necessidade de capital de giro diminui em mais de R$ 10.000!
                </span>
              ) : (
                <span>
                  O seu recebimento é ultrarrápido (D+1), mas esse estoque parado é o único motivo do seu ciclo ser de 18 a 26 dias. Se você colocar mais lotes na Liquidação, esse dinheiro volta direto para a sua conta e seu giro vira padrão de ouro!
                </span>
              )}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-amber-200 dark:border-amber-900/50 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-amber-800 dark:text-amber-300 font-medium">
              💡 Diagnóstico: <strong>{diag.desc}</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
