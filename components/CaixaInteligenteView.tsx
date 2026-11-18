import React, { useState, useMemo, useEffect } from 'react';
import { 
  PiggyBank, 
  TrendingUp, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight, 
  ArrowUpRight, 
  ArrowDownRight, 
  DollarSign, 
  RefreshCw, 
  Landmark, 
  Banknote, 
  Calendar, 
  Percent, 
  Info, 
  Copy, 
  Check, 
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { Boleto, FixedAccount, CashClosingRecord, User, BoletoStatus } from '../types';
import { useToast } from './ToastContext';

interface CaixaInteligenteViewProps {
  user?: User;
  boletos: Boleto[];
  fixedAccounts: FixedAccount[];
  cashClosings: CashClosingRecord[];
  onLog?: (action: string, details: string) => void;
  onUpdateBoletoStatus?: (boletoId: string, status: BoletoStatus) => void;
}

interface DiaFluxo {
  dataStr: string;
  dataObj: Date;
  diaSemana: string;
  isFimDeSemana: boolean;
  contasDoDia: { nome: string; valor: number; tipo: 'boleto' | 'fixa'; pago: boolean }[];
  provisaoCaixinhas: number;
  totalSaidas: number;
  totalEntradasPrevistas: number;
  saldoProjetado: number;
  status: 'seguro' | 'alerta' | 'perigo';
}

export const CaixaInteligenteView: React.FC<CaixaInteligenteViewProps> = ({
  user,
  boletos = [],
  fixedAccounts = [],
  cashClosings = [],
  onLog,
  onUpdateBoletoStatus
}) => {
  const { addToast } = useToast();

  // ─── Estados Persistidos ou Customizáveis ─────────────────────────
  // Saldo bancário atual (inicia com R$ 2.683,82 calculado na conciliação ou carregado do storage)
  const [saldoBanco, setSaldoBanco] = useState<number>(() => {
    const salvo = localStorage.getItem('belafarma_saldo_banco_atual');
    return salvo ? parseFloat(salvo) : 2683.82;
  });
  const [editandoSaldoBanco, setEditandoSaldoBanco] = useState<boolean>(false);
  const [tempSaldoBanco, setTempSaldoBanco] = useState<string>(saldoBanco.toFixed(2));

  // Saldo físico (Cofre + Gaveta)
  const [saldoCofre, setSaldoCofre] = useState<number>(() => {
    const salvo = localStorage.getItem('belafarma_saldo_cofre_atual');
    return salvo ? parseFloat(salvo) : 1603.99;
  });

  // Colchão de segurança operacional (mínimo desejado na conta para contingência)
  const [colchaoSeguranca, setColchaoSeguranca] = useState<number>(() => {
    const salvo = localStorage.getItem('belafarma_colchao_seguranca');
    return salvo ? parseFloat(salvo) : 3000.00;
  });

  // Dias de antecedência para cálculo de cobertura essencial (padrão: 5 dias)
  const [diasCoberturaEssencial, setDiasCoberturaEssencial] = useState<number>(5);

  // Valor de terceiros total para amortização gradual
  const [valorTerceirosTotal, setValorTerceirosTotal] = useState<number>(() => {
    const salvo = localStorage.getItem('belafarma_valor_terceiros_total');
    return salvo ? parseFloat(salvo) : 0;
  });
  const [tempTerceiros, setTempTerceiros] = useState<string>(valorTerceirosTotal ? valorTerceirosTotal.toFixed(2) : '');
  const [editandoTerceiros, setEditandoTerceiros] = useState<boolean>(false);

  // Copiado feedback
  const [copiedAmount, setCopiedAmount] = useState<boolean>(false);

  // Provisões das Caixinhas: controle de separação e integração
  const [paidProvisionsDates, setPaidProvisionsDates] = useState<string[]>([]);
  const [considerarProvisoes, setConsiderarProvisoes] = useState<boolean>(() => {
    const salvo = localStorage.getItem('belafarma_caixa_considerar_provisoes');
    return salvo !== null ? salvo === 'true' : true; // Padrão: SEMPRE considerar provisões
  });
  const [prolaborePct, setProlaborePct] = useState<number>(11.1);
  const [reservePct, setReservePct] = useState<number>(12.5);

  // Busca dados de provisões pagas e médias de precificação
  useEffect(() => {
    const fetchProvisionsData = async () => {
      try {
        const [resDates, resAvg] = await Promise.all([
          fetch('/api/settings/paid_provisions_dates'),
          fetch('/api/price-manager/customizations/averages')
        ]);
        if (resDates.ok) {
          const d = await resDates.json();
          if (d && d.value) {
            try {
              const parsed = JSON.parse(d.value);
              if (Array.isArray(parsed)) setPaidProvisionsDates(parsed);
            } catch(e) {}
          }
        }
        if (resAvg.ok) {
          const avg = await resAvg.json();
          if (avg && avg.success && avg.simpleAverages) {
            if (avg.simpleAverages.proLaboreTotalPct > 0) setProlaborePct(avg.simpleAverages.proLaboreTotalPct);
            if (avg.simpleAverages.margemLiquidaPct > 0) setReservePct(avg.simpleAverages.margemLiquidaPct);
          }
        }
      } catch (err) {
        console.error('Erro ao buscar dados de provisões no Caixa Inteligente:', err);
      }
    };
    fetchProvisionsData();
  }, []);

  const toggleConsiderarProvisoes = () => {
    const novoValor = !considerarProvisoes;
    setConsiderarProvisoes(novoValor);
    localStorage.setItem('belafarma_caixa_considerar_provisoes', novoValor.toString());
    addToast(
      novoValor 
        ? '🛡️ Provisões das Caixinhas (Pró-Labore & Reserva) ATIVADAS no cálculo do caixa!' 
        : '⚠️ Provisões das Caixinhas desativadas (visão bruta do banco).',
      novoValor ? 'success' : 'warning'
    );
  };

  // Média diária de vendas e proporção digital
  const { mediaDiariaVendas, percentualDigital } = useMemo(() => {
    if (!cashClosings || cashClosings.length === 0) {
      return { mediaDiariaVendas: 1356.46, percentualDigital: 0.68 };
    }
    const ultimos = cashClosings.slice(-15);
    const totalVendas = ultimos.reduce((acc, c) => acc + (c.totalSales || 0), 0);
    const totalDigital = ultimos.reduce((acc, c) => acc + ((c.pix || 0) + (c.debit || 0) + (c.credit || 0)), 0);
    const media = ultimos.length > 0 ? totalVendas / ultimos.length : 1356.46;
    const percDig = totalVendas > 0 ? (totalDigital / totalVendas) : 0.68;
    return {
      mediaDiariaVendas: media > 0 ? media : 1356.46,
      percentualDigital: (percDig >= 0.4 && percDig <= 0.95) ? percDig : 0.68
    };
  }, [cashClosings]);

  // Entrada diária estimada no banco (Pix + Cartões Débito/Crédito)
  const entradaDigitalDiaria = mediaDiariaVendas * percentualDigital;

  // Provisões pendentes acumuladas do mês atual que ainda não foram retiradas/pagas
  const { provisoesPendentesAcumuladas, provisaoDiariaMedia } = useMemo(() => {
    const provDiaria = mediaDiariaVendas * ((prolaborePct + reservePct) / 100);

    if (!cashClosings || cashClosings.length === 0) {
      return { provisoesPendentesAcumuladas: 0, provisaoDiariaMedia: provDiaria };
    }

    let pendingTotal = 0;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    cashClosings.forEach(c => {
      if (!c.date) return;
      const d = new Date(c.date);
      if (d.getFullYear() !== currentYear || d.getMonth() !== currentMonth) return;

      const dateKey = c.date.split('T')[0];
      const cred = Number(c.totalCrediario) || 0;
      const netSales = Math.max(0, (Number(c.totalSales) || 0) - cred);
      if (netSales <= 0) return;

      const valProlabore = netSales * (prolaborePct / 100);
      const valReserve = netSales * (reservePct / 100);

      const isProlaborePaid = paidProvisionsDates.includes(`prolabore-${dateKey}`) || paidProvisionsDates.includes(`prolabore-${c.date}`);
      const isReservePaid = paidProvisionsDates.includes(`reserve-${dateKey}`) || paidProvisionsDates.includes(`reserve-${c.date}`);

      if (!isProlaborePaid) pendingTotal += valProlabore;
      if (!isReservePaid) pendingTotal += valReserve;
    });

    return {
      provisoesPendentesAcumuladas: pendingTotal,
      provisaoDiariaMedia: provDiaria
    };
  }, [cashClosings, paidProvisionsDates, prolaborePct, reservePct, mediaDiariaVendas]);

  // ─── Mapeamento de Contas e Boletos ──────────────────────────────
  const contasDetalhadas = useMemo(() => {
    const lista: { id: string; nome: string; vencimento: string; valor: number; tipo: 'boleto' | 'fixa'; pago: boolean }[] = [];

    // Boletos
    boletos.forEach(b => {
      const isPago = b.status === BoletoStatus.PAGO || (b.status as any) === 'Pago';
      lista.push({
        id: b.id,
        nome: b.supplierName || 'Distribuidora',
        vencimento: b.due_date ? b.due_date.split('T')[0] : '',
        valor: b.value || 0,
        tipo: 'boleto',
        pago: isPago
      });
    });

    // Contas Fixas
    fixedAccounts.forEach(f => {
      const isPago = (f as any).status === 'Pago';
      // Ajustar dia de vencimento para o mês atual
      const diaVenc = String((f as any).dueDay || '20').padStart(2, '0');
      const hojeIso = new Date().toISOString().split('T')[0];
      const anoMes = hojeIso.substring(0, 7);
      const dataVenc = `${anoMes}-${diaVenc}`;

      lista.push({
        id: String(f.id),
        nome: f.name || 'Conta Fixa',
        vencimento: dataVenc,
        valor: (f as any).amount || f.value || 0,
        tipo: 'fixa',
        pago: isPago
      });
    });

    return lista;
  }, [boletos, fixedAccounts]);

  // ─── Projeção Dia a Dia dos Próximos 14 Dias ──────────────────────
  const projecaoDias = useMemo<DiaFluxo[]>(() => {
    const dias: DiaFluxo[] = [];
    const hoje = new Date();
    let saldoCorrente = saldoBanco;

    for (let i = 0; i < 14; i++) {
      const d = new Date(hoje);
      d.setDate(d.getDate() + i);
      const dataIso = d.toISOString().split('T')[0];
      const diaSemanaNum = d.getDay();
      const isFimDeSemana = diaSemanaNum === 0 || diaSemanaNum === 6;

      const nomesDias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      const diaSemana = nomesDias[diaSemanaNum];

      // Contas pendentes que vencem neste dia
      const contasDoDia = contasDetalhadas
        .filter(c => c.vencimento === dataIso && !c.pago)
        .map(c => ({
          nome: c.nome,
          valor: c.valor,
          tipo: c.tipo,
          pago: c.pago
        }));

      // Provisão diária estimada que precisa ser retida/separada para Pró-Labore e Reserva
      // (somente em dias úteis com vendas estimadas)
      let provisaoCaixinhasDia = 0;
      if (considerarProvisoes && !isFimDeSemana) {
        const vendasEstimadasDia = totalEntradasPrevistas > 0 
          ? (totalEntradasPrevistas / (percentualDigital || 0.68)) 
          : mediaDiariaVendas;
        provisaoCaixinhasDia = vendasEstimadasDia * ((prolaborePct + reservePct) / 100);
      }

      const totalSaidas = contasDoDia.reduce((acc, c) => acc + c.valor, 0) + provisaoCaixinhasDia;

      // Entradas previstas no banco:
      // Fim de semana não compensa dinheiro no banco (vai para segunda/terça)
      let totalEntradasPrevistas = 0;
      if (!isFimDeSemana) {
        // Segunda-feira absorve entradas acumuladas do fim de semana
        if (diaSemanaNum === 1) {
          totalEntradasPrevistas = entradaDigitalDiaria * 1.8;
        } else {
          totalEntradasPrevistas = entradaDigitalDiaria;
        }
      }

      saldoCorrente = saldoCorrente + totalEntradasPrevistas - totalSaidas;

      let status: 'seguro' | 'alerta' | 'perigo' = 'seguro';
      if (saldoCorrente < 0) {
        status = 'perigo';
      } else if (saldoCorrente < colchaoSeguranca) {
        status = 'alerta';
      }

      dias.push({
        dataStr: dataIso,
        dataObj: d,
        diaSemana,
        isFimDeSemana,
        contasDoDia,
        provisaoCaixinhas: provisaoCaixinhasDia,
        totalSaidas,
        totalEntradasPrevistas,
        saldoProjetado: saldoCorrente,
        status
      });
    }

    return dias;
  }, [saldoBanco, contasDetalhadas, entradaDigitalDiaria, colchaoSeguranca, considerarProvisoes, percentualDigital, mediaDiariaVendas, prolaborePct, reservePct]);

  // ─── Cálculos do Colchão Essencial & Sobra ─────────────────────────
  // Contas dos próximos N dias (diasCoberturaEssencial)
  const contasProximosDias = useMemo(() => {
    return projecaoDias.slice(0, diasCoberturaEssencial);
  }, [projecaoDias, diasCoberturaEssencial]);

  const totalSaidasProximosDias = useMemo(() => {
    return contasProximosDias.reduce((acc, d) => acc + d.totalSaidas, 0);
  }, [contasProximosDias]);

  const totalEntradasProximosDias = useMemo(() => {
    return contasProximosDias.reduce((acc, d) => acc + d.totalEntradasPrevistas, 0);
  }, [contasProximosDias]);

  // Valor Essencial que precisa ficar na conta hoje:
  // Necessidade líquida dos próximos dias (contas + provisões diárias) + margem de segurança configurada + provisões pendentes acumuladas que devem ser retidas
  const valorEssencialRecomendado = useMemo(() => {
    const deficitProximo = Math.max(0, totalSaidasProximosDias - totalEntradasProximosDias);
    const retencaoProvisoesPendentes = considerarProvisoes ? provisoesPendentesAcumuladas : 0;
    return Math.max(colchaoSeguranca, deficitProximo + (colchaoSeguranca * 0.5) + retencaoProvisoesPendentes);
  }, [totalSaidasProximosDias, totalEntradasProximosDias, colchaoSeguranca, considerarProvisoes, provisoesPendentesAcumuladas]);

  // Sobra Disponível Hoje para Render ou Devolver
  const sobraDisponivel = saldoBanco - valorEssencialRecomendado;

  // Simulador de Rendimento (100% CDI ~ 11% a 13% a.a. => ~0,9% ao mês)
  const rendimentoEstimadoMes = useMemo(() => {
    if (sobraDisponivel <= 0) return 0;
    return (sobraDisponivel * 0.0092); // ~0,92% ao mês líquido
  }, [sobraDisponivel]);

  const rendimentoEstimadoAno = useMemo(() => {
    if (sobraDisponivel <= 0) return 0;
    return (sobraDisponivel * 0.115); // ~11,5% ao ano
  }, [sobraDisponivel]);

  // ─── Salvar no localStorage ───────────────────────────────────────
  const salvarSaldoBanco = () => {
    const num = parseFloat(tempSaldoBanco.replace(',', '.'));
    if (!isNaN(num)) {
      setSaldoBanco(num);
      localStorage.setItem('belafarma_saldo_banco_atual', num.toString());
      setEditandoSaldoBanco(false);
      addToast('Saldo bancário atualizado com sucesso!', 'success');
      onLog?.('Atualização Saldo Banco', `Novo saldo: R$ ${num.toFixed(2)}`);
    }
  };

  const salvarTerceiros = () => {
    const num = parseFloat(tempTerceiros.replace(',', '.'));
    const val = !isNaN(num) ? num : 0;
    setValorTerceirosTotal(val);
    localStorage.setItem('belafarma_valor_terceiros_total', val.toString());
    setEditandoTerceiros(false);
    addToast('Valor de terceiros atualizado!', 'success');
  };

  const copiarSobra = () => {
    if (sobraDisponivel > 0) {
      navigator.clipboard.writeText(sobraDisponivel.toFixed(2));
      setCopiedAmount(true);
      addToast(`Valor de R$ ${sobraDisponivel.toFixed(2)} copiado!`, 'info');
      setTimeout(() => setCopiedAmount(false), 2500);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── BANNER PRINCIPAL: VISÃO ESTRATÉGICA ───────────────────────── */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-bold uppercase tracking-wider">
              <PiggyBank className="w-4 h-4 text-indigo-400" />
              Rotina de Caixa Inteligente & Rendimento Diário
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">
              Deixe no banco apenas o essencial. Faça a sobra render no CDI.
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Conta corrente tradicional <strong>rende R$ 0,00</strong> e perde poder de compra todo mês. 
              Esta rotina calcula exatamente o saldo necessário para blindar a farmácia contra o cheque especial 
              e indica quanto você pode transferir para uma conta que rende 100% do CDI (ou amortizar dinheiro de terceiros).
            </p>

            {/* Toggle de Inclusão de Provisões no Cálculo */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={toggleConsiderarProvisoes}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 border shadow-sm ${
                  considerarProvisoes 
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40 hover:bg-emerald-500/30' 
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
                title="Clique para alternar se o cálculo deve considerar as caixinhas de provisões (Pró-labore e Reserva)"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Provisões das Caixinhas: {considerarProvisoes ? 'CONSIDERADAS NO CÁLCULO' : 'IGNORADAS'}</span>
              </button>
            </div>

            {considerarProvisoes && (
              <div className="text-[11px] text-indigo-200/90 flex flex-wrap items-center gap-3 bg-indigo-950/60 px-3.5 py-2 rounded-xl border border-indigo-500/30">
                <span>🛡️ <strong>Pró-Labore ({prolaborePct.toFixed(1)}%) + Reserva ({reservePct.toFixed(1)}%)</strong> retidos na projeção: ~R$ {provisaoDiariaMedia.toFixed(2)}/dia</span>
                {provisoesPendentesAcumuladas > 0 && (
                  <span className="text-amber-300 font-bold">• Pendente de separação acumulado: R$ {provisoesPendentesAcumuladas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                )}
              </div>
            )}
          </div>

          {/* Card Resumo da Sobra em Destaque */}
          <div className="bg-slate-950/80 border border-indigo-500/40 rounded-2xl p-4 flex flex-col items-center justify-center min-w-[240px] text-center shadow-inner">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              {sobraDisponivel >= 0 ? '✨ Sobra Livre para Transferir' : '⚠️ Aporte Necessário no Banco'}
            </span>
            <div className={`text-3xl font-black font-mono mt-1 ${sobraDisponivel >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              R$ {Math.abs(sobraDisponivel).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-400 mt-1">
              {sobraDisponivel >= 0 
                ? (considerarProvisoes ? 'Sobra líquida (após contas e provisões)' : 'Rendimento 0% no banco -> Ponha no CDI') 
                : 'Deposite do cofre para evitar juros'}
            </span>
            {sobraDisponivel > 0 && (
              <button
                type="button"
                onClick={copiarSobra}
                className="mt-3 w-full py-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow"
              >
                {copiedAmount ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedAmount ? 'Valor Copiado!' : 'Copiar Valor do Pix'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── CARDS DE PILARES FINANCEIROS ───────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Saldo na Conta Corrente */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm relative group">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Landmark className="w-4 h-4 text-blue-500" />
              Saldo na Conta
            </span>
            <button
              type="button"
              onClick={() => setEditandoSaldoBanco(!editandoSaldoBanco)}
              className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold"
            >
              {editandoSaldoBanco ? 'Fechar' : 'Ajustar'}
            </button>
          </div>

          {editandoSaldoBanco ? (
            <div className="space-y-2 mt-1">
              <input
                type="text"
                value={tempSaldoBanco}
                onChange={(e) => setTempSaldoBanco(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono font-bold focus:outline-none focus:border-blue-500"
                placeholder="0,00"
              />
              <button
                type="button"
                onClick={salvarSaldoBanco}
                className="w-full py-1 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 transition-colors"
              >
                Salvar Saldo
              </button>
            </div>
          ) : (
            <>
              <div className="text-2xl font-black font-mono text-slate-900 dark:text-white">
                R$ {saldoBanco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Saldo de partida na conta da farmácia
              </p>
            </>
          )}
        </div>

        {/* Colchão de Segurança Essencial */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Colchão Essencial
            </span>
            <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full font-bold">
              {diasCoberturaEssencial} dias
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
            R$ {valorEssencialRecomendado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {considerarProvisoes 
              ? 'Mínimo para cobrir contas + provisões sem sufoco'
              : 'Mínimo obrigatório para cobrir contas sem cheque especial'}
          </p>
        </div>

        {/* Caixinhas de Provisão (Pró-Labore & Reserva) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              <PiggyBank className="w-4 h-4 text-indigo-500" />
              Caixinhas (Pró+Reserva)
            </span>
            <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full font-bold">
              {(prolaborePct + reservePct).toFixed(1)}% das vendas
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-indigo-600 dark:text-indigo-400">
            R$ {provisaoDiariaMedia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-500">/dia</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {provisoesPendentesAcumuladas > 0 
              ? `R$ ${provisoesPendentesAcumuladas.toFixed(0)} pendentes retidos no essencial`
              : 'Provisões do mês em dia'}
          </p>
        </div>

        {/* Dinheiro Físico (Cofre + Gaveta) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Banknote className="w-4 h-4 text-amber-500" />
              Dinheiro Físico (Cofre)
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
            R$ {saldoCofre.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Disponível para aportes no banco quando faltar
          </p>
        </div>

        {/* Entrada Digital Prevista / Dia */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-purple-500" />
              Entrada Digital / Dia
            </span>
            <span className="text-[10px] bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-300 px-2 py-0.5 rounded-full font-bold">
              {(percentualDigital * 100).toFixed(0)}% das vendas
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-purple-600 dark:text-purple-400">
            R$ {entradaDigitalDiaria.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Pix + Cartões que caem todo dia na conta
          </p>
        </div>
      </div>

      {/* ─── SIMULADOR DE RENDIMENTO & CONTA DI ───────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Percent className="w-5 h-5 text-indigo-500" />
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Simulador de Rendimento da Sobra (100% CDI vs Banco Tradicional)
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-semibold">
            Base: Selic ~11.25% a.a. / 100% do CDI com liquidez diária
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <span className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
              Parado na Conta Corrente
            </span>
            <div className="text-2xl font-black font-mono text-slate-400 mt-1">
              R$ 0,00
            </div>
            <p className="text-[11px] text-rose-500 font-semibold mt-1">
              Perde dinheiro para a inflação todos os meses.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60">
            <span className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-400">
              Rendimento em 30 Dias (Sobra Atual)
            </span>
            <div className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-300 mt-1">
              + R$ {rendimentoEstimadoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">
              Líquido caindo todo dia na conta sem travar o dinheiro.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60">
            <span className="text-xs font-bold uppercase text-indigo-700 dark:text-indigo-400">
              Rendimento Anual Projetado
            </span>
            <div className="text-2xl font-black font-mono text-indigo-600 dark:text-indigo-300 mt-1">
              + R$ {rendimentoEstimadoAno.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-indigo-700 dark:text-indigo-400 mt-1">
              Cobre despesas de tarifas bancárias e custos fixos menores.
            </p>
          </div>
        </div>
      </div>

      {/* ─── ROTINA DIÁRIA DO GESTOR (PASSO A PASSO GUIADO) ──────────── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Rotina Diária Matinal (Checklist do Gestor)
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-semibold">
            Execute todos os dias às 08h30 antes de iniciar os pagamentos
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Passo 1 */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase text-blue-600 dark:text-blue-400 mb-1">
                <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/60 flex items-center justify-center text-[11px]">1</span>
                Conferir Extrato
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                Abra o app do banco e confira o saldo real. Se houver divergência, clique em <strong>Ajustar Saldo</strong> no card acima.
              </p>
            </div>
            <div className="mt-3 text-[11px] font-bold text-slate-400">
              Tempo: 1 minuto
            </div>
          </div>

          {/* Passo 2 */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase text-amber-600 dark:text-amber-400 mb-1">
                <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center text-[11px]">2</span>
                Cobrir Déficit (Se Houver)
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                Se o card mostrar <strong>Aporte Necessário</strong>, pegue o valor indicado no cofre físico e faça um depósito imediato na conta.
              </p>
            </div>
            <div className="mt-3 text-[11px] font-bold text-amber-500">
              Meta: Saldo ≥ R$ {valorEssencialRecomendado.toFixed(0)}
            </div>
          </div>

          {/* Passo 3 */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase text-emerald-600 dark:text-emerald-400 mb-1">
                <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 flex items-center justify-center text-[11px]">3</span>
                Pagar Contas do Dia
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                Pague os boletos listados para hoje na tabela de projeção abaixo. Eles já foram descontados no cálculo do essencial.
              </p>
            </div>
            <div className="mt-3 text-[11px] font-bold text-emerald-500">
              Contas de hoje já provisionadas
            </div>
          </div>

          {/* Passo 4 */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase text-indigo-600 dark:text-indigo-400 mb-1">
                <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 flex items-center justify-center text-[11px]">4</span>
                Fazer o Pix da Sobra
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                Se a <strong>Sobra Livre</strong> for maior que R$ 200, faça um Pix para a conta que rende (ou amortize terceiros). Nunca deixe dinheiro à toa.
              </p>
            </div>
            <div className="mt-3 text-[11px] font-bold text-indigo-500">
              Rende todo dia no CDI
            </div>
          </div>
        </div>
      </div>

      {/* ─── FLUXO DE CAIXA DIÁRIO PROJETADO (PRÓXIMOS 14 DIAS) ─────────── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-500" />
              Projeção Dia a Dia (Próximos 14 Dias)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Simulação de entradas de vendas e saídas de contas com saldo final de cada dia.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-emerald-600 font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Saldo Saudável
            </span>
            <span className="flex items-center gap-1.5 text-amber-600 font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Abaixo do Colchão
            </span>
            <span className="flex items-center gap-1.5 text-rose-600 font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Cheque Especial
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-400">
                <th className="py-2.5 px-3">Data</th>
                <th className="py-2.5 px-3">Dia</th>
                <th className="py-2.5 px-3">Contas a Pagar</th>
                <th className="py-2.5 px-3 text-right">Saídas (R$)</th>
                <th className="py-2.5 px-3 text-right">Entradas Previstas (R$)</th>
                <th className="py-2.5 px-3 text-right">Saldo Final Projetado</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
              {projecaoDias.map((d, idx) => {
                const diaFormatado = d.dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                const isHoje = idx === 0;

                return (
                  <tr 
                    key={d.dataStr}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                      isHoje ? 'bg-indigo-50/40 dark:bg-indigo-950/20 font-semibold' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono">
                      <span className="flex items-center gap-1.5">
                        {isHoje && <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[9px] font-black uppercase">Hoje</span>}
                        {diaFormatado}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`${d.isFimDeSemana ? 'text-slate-400 italic' : 'text-slate-700 dark:text-slate-300 font-bold'}`}>
                        {d.diaSemana}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 max-w-[280px]">
                      {d.contasDoDia.length === 0 && (!considerarProvisoes || d.provisaoCaixinhas <= 0) ? (
                        <span className="text-slate-400 text-[11px]">Nenhuma conta vencendo</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {d.contasDoDia.map((c, cIdx) => (
                            <span 
                              key={cIdx}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-700 dark:text-slate-300"
                              title={`R$ ${c.valor.toFixed(2)}`}
                            >
                              <span className="font-semibold">{c.nome}</span>
                              <span className="text-slate-500 font-mono">(R$ {c.valor.toFixed(0)})</span>
                            </span>
                          ))}
                          {considerarProvisoes && d.provisaoCaixinhas > 0 && (
                            <span 
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-[10px] text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40"
                              title={`Provisão diária retida para Pró-Labore (${prolaborePct.toFixed(1)}%) e Reserva (${reservePct.toFixed(1)}%)`}
                            >
                              <PiggyBank className="w-3 h-3 text-emerald-600" />
                              <span className="font-bold">Caixinhas</span>
                              <span className="font-mono font-bold">(R$ {d.provisaoCaixinhas.toFixed(0)})</span>
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-500">
                      {d.totalSaidas > 0 ? (
                        <div>
                          <div>- R$ {d.totalSaidas.toFixed(2)}</div>
                          {considerarProvisoes && d.provisaoCaixinhas > 0 && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold block" title="Retenção de Pró-labore e Reserva">
                              (incl. R$ {d.provisaoCaixinhas.toFixed(0)} caixinhas)
                            </span>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-500">
                      {d.totalEntradasPrevistas > 0 ? `+ R$ ${d.totalEntradasPrevistas.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-black text-sm">
                      <span className={
                        d.saldoProjetado < 0 
                          ? 'text-rose-600 dark:text-rose-400' 
                          : d.saldoProjetado < colchaoSeguranca 
                            ? 'text-amber-600 dark:text-amber-400' 
                            : 'text-slate-900 dark:text-white'
                      }>
                        R$ {d.saldoProjetado.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {d.status === 'seguro' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-black">
                          <CheckCircle2 className="w-3 h-3" /> Seguro
                        </span>
                      )}
                      {d.status === 'alerta' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-[10px] font-black">
                          <AlertTriangle className="w-3 h-3" /> Atenção
                        </span>
                      )}
                      {d.status === 'perigo' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[10px] font-black animate-pulse">
                          <AlertTriangle className="w-3 h-3" /> Cheque Esp.
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
