import React, { useState } from 'react';
import { 
  X, 
  Calendar, 
  DollarSign, 
  Clock, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldCheck, 
  Info,
  CalendarCheck,
  ChevronRight,
  PiggyBank
} from 'lucide-react';

interface SemanaOrcamento {
  numero: number;
  nome: string;
  periodo: string;
  diaInicio: number;
  diaFim: number;
  limiteSemanal: number;
  totalComprometido: number;
  totalPago: number;
  totalPendente: number;
  saldoLivreSemana: number;
  percentualComprometido: number;
  statusSemana: 'LIBERADO' | 'ALERTA' | 'ESTOURADO';
  isSemanaAtual: boolean;
  qtdBoletos: number;
}

interface MesDetalhado {
  mes: number;
  ano: number;
  nomeMes: string;
  limite: number;
  limiteSemanalPadrao: number;
  qtdSemanas: number;
  totalComprometido: number;
  totalPago: number;
  totalPendente: number;
  saldoLivre: number;
  percentualComprometido: number;
  statusOrcamento: 'LIBERADO' | 'ALERTA' | 'ESTOURADO';
  qtdBoletos: number;
  semanas: SemanaOrcamento[];
  semanaAtual?: SemanaOrcamento;
}

interface BelaPedOrcamentoSemanalModalProps {
  isOpen: boolean;
  onClose: () => void;
  todosMesesAno: MesDetalhado[];
  mesAtualNumero: number;
  ano: number;
}

export const BelaPedOrcamentoSemanalModal: React.FC<BelaPedOrcamentoSemanalModalProps> = ({
  isOpen,
  onClose,
  todosMesesAno,
  mesAtualNumero,
  ano
}) => {
  const [mesSelecionadoNum, setMesSelecionadoNum] = useState<number>(mesAtualNumero || (new Date().getMonth() + 1));
  const [abaVisao, setAbaVisao] = useState<'semanas' | 'tabela_anual'>('semanas');

  if (!isOpen) return null;

  const mesAtivo = todosMesesAno.find(m => m.mes === mesSelecionadoNum) || todosMesesAno[0] || null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-5xl max-h-[92vh] bg-[#0c1527] border border-cyan-800/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100 ring-1 ring-cyan-500/30"
        role="dialog"
        aria-modal="true"
      >
        {/* Header Modal */}
        <div className="flex items-start justify-between p-4 sm:p-5 border-b border-slate-800/90 bg-[#091122]">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-950/80 border border-cyan-600/50 text-cyan-400 mt-0.5">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-cyan-400">
                  Planejamento Orçamentário BelaPed
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-900/60 text-cyan-200 border border-cyan-700/60">
                  Limite Semanal de Gastos • {ano}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-white mt-0.5">
                Consulta de Tetos & Controle Semanal do Orçamento
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Distribuição do teto mensal em cotas semanais (7 em 7 dias) para impedir esgotamento precoce do caixa.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Fechar Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Seleção de Mês (12 Meses) */}
        <div className="bg-[#091224] px-4 py-2.5 border-b border-slate-800/80 overflow-x-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {todosMesesAno.map(m => {
              const isAtivo = m.mes === mesSelecionadoNum;
              const isMesHoje = m.mes === mesAtualNumero;
              return (
                <button
                  key={m.mes}
                  onClick={() => setMesSelecionadoNum(m.mes)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 border ${
                    isAtivo
                      ? 'bg-cyan-600 text-white border-cyan-400 shadow-md'
                      : isMesHoje
                      ? 'bg-cyan-950/50 border-cyan-700/70 text-cyan-300 hover:border-cyan-500'
                      : 'bg-[#060d1a] border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <span>{m.nomeMes.substring(0, 3)}</span>
                  {isMesHoje && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Toggle de Visualização: Semanas do Mês vs Visão Anual */}
          <div className="flex items-center p-0.5 rounded-xl bg-[#060c18] border border-slate-700 shrink-0">
            <button
              onClick={() => setAbaVisao('semanas')}
              className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                abaVisao === 'semanas' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Semanas
            </button>
            <button
              onClick={() => setAbaVisao('tabela_anual')}
              className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                abaVisao === 'tabela_anual' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos os 12 Meses
            </button>
          </div>
        </div>

        {/* Corpo do Modal */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {mesAtivo ? (
            <>
              {/* Resumo do Mês Selecionado */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-[#0a1528] via-[#0d1d38] to-[#0a1324] border border-cyan-800/80 shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                  <div>
                    <span className="text-[11px] font-black uppercase text-cyan-400 tracking-wider">
                      Resumo Mensal • {mesAtivo.nomeMes.toUpperCase()} / {mesAtivo.ano}
                    </span>
                    <h3 className="text-lg font-black text-white mt-0.5">
                      Limite Mensal: R$ {mesAtivo.limite.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-xl text-xs font-black border ${
                      mesAtivo.statusOrcamento === 'ESTOURADO'
                        ? 'bg-rose-950/90 text-rose-300 border-rose-700 animate-pulse'
                        : mesAtivo.statusOrcamento === 'ALERTA'
                        ? 'bg-amber-950/90 text-amber-300 border-amber-700'
                        : 'bg-emerald-950/90 text-emerald-300 border-emerald-700'
                    }`}>
                      Status: {mesAtivo.statusOrcamento} ({mesAtivo.percentualComprometido}%)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs">
                  {/* Limite Semanal Base */}
                  <div className="p-2.5 rounded-xl bg-[#071120] border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Limite Semanal Base ({mesAtivo.qtdSemanas} sem.)
                    </span>
                    <span className="text-base font-black text-cyan-300 mt-1 block">
                      R$ {mesAtivo.limiteSemanalPadrao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      Teto máximo por semana
                    </span>
                  </div>

                  {/* Comprometido em Boletos */}
                  <div className="p-2.5 rounded-xl bg-[#071120] border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Comprometido no Mês ({mesAtivo.qtdBoletos} boletos)
                    </span>
                    <span className="text-base font-black text-amber-300 mt-1 block">
                      R$ {mesAtivo.totalComprometido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      Pagos: R$ {mesAtivo.totalPago.toFixed(0)} • Pendentes: R$ {mesAtivo.totalPendente.toFixed(0)}
                    </span>
                  </div>

                  {/* Saldo Livre Restante */}
                  <div className="p-2.5 rounded-xl bg-[#071120] border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Saldo Livre Restante
                    </span>
                    <span className={`text-base font-black mt-1 block ${
                      mesAtivo.saldoLivre < 0 ? 'text-rose-400' : 'text-emerald-300'
                    }`}>
                      {mesAtivo.saldoLivre < 0 ? '-R$ ' : 'R$ '}
                      {Math.abs(mesAtivo.saldoLivre).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      Disponível para novas faturas
                    </span>
                  </div>

                  {/* Orientação Estratégica */}
                  <div className="p-2.5 rounded-xl bg-[#071120] border border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Regra de Fluxo
                    </span>
                    <span className="text-xs font-bold text-white mt-1 block leading-snug">
                      {mesAtivo.statusOrcamento === 'ESTOURADO'
                        ? 'Exigir faturamento p/ próximo mês'
                        : mesAtivo.statusOrcamento === 'ALERTA'
                        ? 'Priorizar prazos estendidos (28/42d)'
                        : 'Fluxo liberado p/ compras semanais'}
                    </span>
                  </div>
                </div>
              </div>

              {abaVisao === 'semanas' ? (
                <>
                  {/* Grid de Cards das Semanas do Mês */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-cyan-400" />
                        Detalhamento Semanal de {mesAtivo.nomeMes} ({mesAtivo.semanas.length} Semanas)
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Cada semana tem sua cota de R$ {mesAtivo.limiteSemanalPadrao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                      {mesAtivo.semanas.map((sem) => {
                        return (
                          <div
                            key={sem.numero}
                            className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                              sem.isSemanaAtual
                                ? 'bg-[#0f223f] border-cyan-400 ring-2 ring-cyan-500/40 shadow-xl'
                                : sem.statusSemana === 'ESTOURADO'
                                ? 'bg-[#180f1b] border-rose-900/70'
                                : 'bg-[#081120] border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div>
                              {/* Header do Card da Semana */}
                              <div className="flex items-center justify-between gap-1 pb-2 border-b border-slate-800/80">
                                <div>
                                  <span className="text-xs font-black text-white uppercase block">
                                    {sem.nome}
                                  </span>
                                  <span className="text-[11px] text-cyan-300 font-bold block">
                                    {sem.periodo}
                                  </span>
                                </div>

                                {sem.isSemanaAtual ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-500 text-slate-950 uppercase shadow-sm animate-pulse">
                                    SEMANA ATUAL
                                  </span>
                                ) : (
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-black border ${
                                    sem.statusSemana === 'ESTOURADO'
                                      ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                                      : sem.statusSemana === 'ALERTA'
                                      ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                                      : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                                  }`}>
                                    {sem.statusSemana}
                                  </span>
                                )}
                              </div>

                              {/* Valores da Semana */}
                              <div className="space-y-1.5 mt-2.5 text-xs">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Limite Semanal:</span>
                                  <span className="font-bold text-white">
                                    R$ {sem.limiteSemanal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Gasto em Boletos:</span>
                                  <span className="font-black text-amber-300">
                                    R$ {sem.totalComprometido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                                  <span className="text-slate-300 font-bold">Saldo Disponível:</span>
                                  <span className={`font-black ${
                                    sem.saldoLivreSemana < 0 ? 'text-rose-400' : 'text-emerald-300'
                                  }`}>
                                    {sem.saldoLivreSemana < 0 ? '-R$ ' : 'R$ '}
                                    {Math.abs(sem.saldoLivreSemana).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>

                              {/* Barra de Progresso Semanal */}
                              <div className="mt-3">
                                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                                  <span>Uso da cota:</span>
                                  <span className="font-black text-slate-200">{sem.percentualComprometido}%</span>
                                </div>
                                <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      sem.percentualComprometido > 100
                                        ? 'bg-rose-500'
                                        : sem.percentualComprometido >= 80
                                        ? 'bg-amber-500'
                                        : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${Math.min(100, Math.max(5, sem.percentualComprometido))}%` }}
                                  ></div>
                                </div>
                              </div>
                            </div>

                            <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-between">
                              <span>{sem.qtdBoletos} boleto(s)</span>
                              <span className="text-slate-500">Dias {sem.diaInicio} a {sem.diaFim}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                /* Tabela Geral dos 12 Meses */
                <div className="p-4 rounded-xl bg-[#081020] border border-slate-800">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-300 block mb-3">
                    Visão Comparativa Anual • Todos os 12 Meses de {ano}
                  </span>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[#0c1830] text-slate-400 font-bold uppercase text-[10px] sticky top-0">
                        <tr>
                          <th className="py-2.5 px-3 whitespace-nowrap">Mês</th>
                          <th className="py-2.5 px-3 whitespace-nowrap text-right">Limite Mensal</th>
                          <th className="py-2.5 px-3 whitespace-nowrap text-right">Semanas</th>
                          <th className="py-2.5 px-3 whitespace-nowrap text-right">Limite Semanal Médio</th>
                          <th className="py-2.5 px-3 whitespace-nowrap text-right">Total Boletos</th>
                          <th className="py-2.5 px-3 whitespace-nowrap text-right">Saldo Livre</th>
                          <th className="py-2.5 px-3 whitespace-nowrap text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {todosMesesAno.map(m => {
                          const isAtual = m.mes === mesAtualNumero;
                          return (
                            <tr
                              key={m.mes}
                              onClick={() => {
                                setMesSelecionadoNum(m.mes);
                                setAbaVisao('semanas');
                              }}
                              className={`hover:bg-slate-800/40 cursor-pointer transition-colors ${
                                isAtual ? 'bg-cyan-950/30' : ''
                              }`}
                            >
                              <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span>{m.nomeMes}</span>
                                  {isAtual && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-cyan-600 text-white">
                                      ATUAL
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-300 whitespace-nowrap">
                                R$ {m.limite.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 px-3 text-right text-slate-400 whitespace-nowrap">
                                {m.qtdSemanas} sem.
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-cyan-300 whitespace-nowrap">
                                R$ {m.limiteSemanalPadrao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 px-3 text-right font-medium text-amber-300 whitespace-nowrap">
                                R$ {m.totalComprometido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className={`py-2.5 px-3 text-right font-black whitespace-nowrap ${
                                m.saldoLivre < 0 ? 'text-rose-400' : 'text-emerald-300'
                              }`}>
                                {m.saldoLivre < 0 ? '-R$ ' : 'R$ '}
                                {Math.abs(m.saldoLivre).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                                  m.statusOrcamento === 'ESTOURADO'
                                    ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                                    : m.statusOrcamento === 'ALERTA'
                                    ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                                    : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                                }`}>
                                  {m.statusOrcamento}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Explicação Didática da Regra Semanal */}
              <div className="p-3.5 rounded-xl bg-[#091325] border border-cyan-800/60 flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 shrink-0 mt-0.5">
                  <Info className="w-4 h-4" />
                </div>
                <div className="text-xs text-slate-300 leading-relaxed space-y-1">
                  <p className="font-bold text-cyan-200">
                    Como funciona o Limite Semanal de Gasto do Orçamento:
                  </p>
                  <p>
                    O teto mensal da farmácia é fracionado entre as semanas do calendário (7 em 7 dias). Cada compra alocada pelo BelaPed consome a cota da semana do vencimento do boleto. Isso impede compras volumosas no início do mês que poderiam descapitalizar a loja para as reposições urgentes das semanas seguintes.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-slate-500">
              Nenhum dado orçamentário encontrado.
            </div>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="p-3 sm:p-4 bg-[#091122] border-t border-slate-800/90 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Sincronizado diretamente com a tabela oficial de limites e boletos do Digifarma.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-black transition-colors cursor-pointer"
          >
            Fechar Consulta
          </button>
        </div>
      </div>
    </div>
  );
};
