import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Receipt, 
  Download, 
  TrendingDown, 
  AlertTriangle, 
  RefreshCw, 
  FileSpreadsheet, 
  Copy, 
  Check, 
  Edit3, 
  Sliders, 
  Calendar, 
  DollarSign, 
  Layers, 
  Info,
  X,
  Save,
  CheckCircle2
} from 'lucide-react';
import { TaxClosingReport, FiscalAuditIssue } from '../types';

export const FiscalAccountingView: React.FC = () => {
  const [competencia, setCompetencia] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [useCustomDates, setUseCustomDates] = useState(false);
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [aliquotaManual, setAliquotaManual] = useState<string>('');
  const [showAliqInput, setShowAliqInput] = useState(false);

  const [report, setReport] = useState<TaxClosingReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Quick-Fix Modal State
  const [editingIssue, setEditingIssue] = useState<FiscalAuditIssue | null>(null);
  const [fixNcm, setFixNcm] = useState('');
  const [fixCest, setFixCest] = useState('');
  const [fixMonofasico, setFixMonofasico] = useState<'S' | 'N'>('S');
  const [fixCstPis, setFixCstPis] = useState('04');
  const [fixAliqSt, setFixAliqSt] = useState('18');
  const [savingFix, setSavingFix] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const carregarApuracao = async (reprocessar = false) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      let url = `/api/erp/fiscal/apuracao?competencia=${competencia}`;
      if (aliquotaManual && Number(aliquotaManual) > 0) {
        url += `&aliquotaManual=${Number(aliquotaManual) / 100}`;
      }
      if (useCustomDates && dataInicial && dataFinal) {
        url += `&dataInicial=${dataInicial}&dataFinal=${dataFinal}`;
      }

      const method = reprocessar ? 'POST' : 'GET';
      const endpoint = reprocessar ? '/api/erp/fiscal/apuracao/processar' : url;
      const body = reprocessar ? JSON.stringify({
        competencia,
        aliquotaManual: aliquotaManual ? Number(aliquotaManual) / 100 : null,
        dataInicial: useCustomDates ? dataInicial : null,
        dataFinal: useCustomDates ? dataFinal : null
      }) : undefined;

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falha ao processar apuração fiscal.');
      }

      setReport(data);
      if (reprocessar) {
        showToast('Apuração fiscal recalculada com sucesso!');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Erro ao carregar apuração fiscal.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarApuracao();
  }, [competencia]);

  const copiarValor = (texto: string, chave: string) => {
    navigator.clipboard.writeText(texto);
    setCopiedKey(chave);
    showToast(`Copiado: R$ ${texto}`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDownloadSped = () => {
    window.open(`/api/erp/fiscal/sped-txt?competencia=${competencia}`, '_blank');
    showToast('Download do SPED Fiscal iniciado!');
  };

  const handleDownloadCsv = () => {
    window.open(`/api/erp/fiscal/relatorio-csv?competencia=${competencia}`, '_blank');
    showToast('Exportação do Relatório CSV para contabilidade iniciada!');
  };

  const openQuickFix = (issue: FiscalAuditIssue) => {
    setEditingIssue(issue);
    setFixNcm('');
    setFixCest('');
    setFixMonofasico('S');
    setFixCstPis('04');
    setFixAliqSt('18');
  };

  const handleSaveQuickFix = async () => {
    if (!editingIssue) return;
    setSavingFix(true);
    try {
      const res = await fetch('/api/erp/fiscal/quick-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productCode: editingIssue.product_code,
          ncm: fixNcm,
          cest: fixCest,
          tributacao_monofasica: fixMonofasico,
          cst_pis: fixCstPis,
          cst_cofins: fixCstPis,
          aliquota_st: parseFloat(fixAliqSt) || 0
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao atualizar dados fiscais.');
      }

      showToast(`Produto ${editingIssue.product_name} atualizado com sucesso!`);
      setEditingIssue(null);
      // Recalcula o fechamento na hora
      await carregarApuracao(true);
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setSavingFix(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast flutuante */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-lg shadow-xl border border-emerald-500 animate-fade-in text-sm font-medium">
          <CheckCircle2 className="w-5 h-5" />
          {toastMsg}
        </div>
      )}

      {/* 1. Header do Módulo & Barra de Filtros */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400">
                <Receipt className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                  Apuração Contábil & Fiscal
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                    Simples Nacional (Anexo I)
                  </span>
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Segregação de receitas monofásicas (Lei 10.147/00), ICMS ST e geração do SPED Fiscal EFD ICMS/IPI.
                </p>
              </div>
            </div>
          </div>

          {/* Ações de Download e Recálculo */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => carregarApuracao(true)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700 transition-all shadow-sm"
              title="Recalcular todos os cupons do período"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
              Recalcular
            </button>

            <button
              onClick={handleDownloadCsv}
              disabled={!report || loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600/90 hover:bg-blue-600 active:scale-95 text-white transition-all shadow-sm"
              title="Exportar planilha completa para o contador"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Relatório Contábil (CSV)
            </button>

            <button
              onClick={handleDownloadSped}
              disabled={!report || loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white transition-all shadow-sm"
              title="Baixar arquivo oficial para validação no PVA da Receita Federal"
            >
              <Download className="w-3.5 h-3.5" />
              SPED Fiscal (.TXT)
            </button>
          </div>
        </div>

        {/* Linha de Parâmetros e Filtros */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-4 text-xs">
          {/* Seletor de Competência */}
          <div className="flex items-center gap-2 bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
            <Calendar className="w-4 h-4 text-slate-400" />
            <label className="text-slate-400 font-medium whitespace-nowrap">Competência:</label>
            <input
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              className="bg-transparent text-white font-mono font-semibold focus:outline-none cursor-pointer"
            />
          </div>

          {/* Toggle de Intervalo Livre */}
          <button
            onClick={() => setUseCustomDates(!useCustomDates)}
            className={`px-3 py-1.5 rounded-lg border transition-colors ${
              useCustomDates 
                ? 'bg-blue-900/30 border-blue-700 text-blue-300' 
                : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-300'
            }`}
          >
            Intervalo Customizado
          </button>

          {useCustomDates && (
            <div className="flex items-center gap-2 bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
              <input
                type="date"
                value={dataInicial}
                onChange={(e) => setDataInicial(e.target.value)}
                className="bg-transparent text-slate-200 focus:outline-none"
              />
              <span className="text-slate-500">até</span>
              <input
                type="date"
                value={dataFinal}
                onChange={(e) => setDataFinal(e.target.value)}
                className="bg-transparent text-slate-200 focus:outline-none"
              />
              <button
                onClick={() => carregarApuracao(false)}
                className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-[11px]"
              >
                Filtrar
              </button>
            </div>
          )}

          {/* Configuração de Alíquota Efetiva */}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowAliqInput(!showAliqInput)}
              className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>
                Alíquota Efetiva:{' '}
                <strong className="text-blue-400 font-mono">
                  {report ? `${(report.aliquotaEfetiva * 100).toFixed(2)}%` : '--'}
                </strong>
                {report?.aliquotaManualInformada && ' (Manual)'}
              </span>
            </button>

            {showAliqInput && (
              <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded border border-slate-700 animate-fade-in">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 7.85"
                  value={aliquotaManual}
                  onChange={(e) => setAliquotaManual(e.target.value)}
                  className="w-20 bg-transparent text-white font-mono text-xs focus:outline-none px-1"
                />
                <span className="text-slate-400">%</span>
                <button
                  onClick={() => {
                    carregarApuracao(true);
                    setShowAliqInput(false);
                  }}
                  className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-semibold"
                >
                  OK
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-900/60 text-red-200 text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 2. Destaques Financeiros & Comparativo de Economia Tributária */}
      {report && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Faturamento Bruto */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Faturamento Bruto
            </span>
            <div className="text-2xl font-black text-white mt-1.5 font-mono">
              R$ {report.faturamentoBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
              <span>{report.estatisticas.totalVendas} vendas no período</span>
              <span className="font-semibold text-emerald-400">100% cupons</span>
            </div>
          </div>

          {/* Card 2: DAS sem Segregação */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <span className="text-xs font-semibold text-red-400 uppercase tracking-wider flex items-center justify-between">
              DAS sem Segregação
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-950 text-red-300 border border-red-800">
                Alíquota Cheia
              </span>
            </span>
            <div className="text-2xl font-bold text-red-400/90 mt-1.5 font-mono line-through">
              R$ {report.das.valorSemSegregacao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-red-300/70 mt-2">
              Cobrança incorreta em duplicidade de PIS/COFINS/ICMS
            </div>
          </div>

          {/* Card 3: DAS Real com Segregação Legal */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider flex items-center justify-between">
              DAS a Recolher
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                LC 123/2006
              </span>
            </span>
            <div className="text-2xl font-black text-blue-400 mt-1.5 font-mono">
              R$ {report.das.valorComSegregacao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400 mt-2">
              Apenas tributos remanescentes (IRPJ, CSLL e CPP)
            </div>
          </div>

          {/* Card 4: Economia Tributária Obtida */}
          <div className="bg-emerald-950/30 border border-emerald-800/60 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                Economia Tributária
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-300 bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-700">
                <TrendingDown className="w-3 h-3" /> -{report.das.percentualEconomia}%
              </span>
            </div>
            <div className="text-2xl font-black text-emerald-400 mt-1.5 font-mono">
              R$ {report.das.economiaTributariaMes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-emerald-300/80 mt-2">
              Lucro retido na farmácia pela segregação legal
            </div>
          </div>
        </div>
      )}

      {/* 3. Guia Passo a Passo PGDAS-D (Tabela Pronta para Digitação) */}
      {report && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <div>
                <h2 className="text-sm font-bold text-white tracking-tight">
                  Valores Prontos para o PGDAS-D (Portal do Simples Nacional)
                </h2>
                <p className="text-xs text-slate-400">
                  Transcreva esses números exatamente nos campos correspondentes da declaração mensal da farmácia.
                </p>
              </div>
            </div>

            <div className="text-xs text-slate-400">
              RBT12 Acumulada: <strong className="text-white font-mono">R$ {report.rbt12.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400">
                  <th className="py-3 px-4 whitespace-nowrap font-semibold">Campo / Enquadramento de Receita</th>
                  <th className="py-3 px-4 whitespace-nowrap font-semibold">Instrução de Dedução no PGDAS-D</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap font-semibold">Valor Apurado (R$)</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap font-semibold">% Faturamento</th>
                  <th className="py-3 px-4 text-center whitespace-nowrap font-semibold">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {report.guiaPgdas.map((g, idx) => {
                  const valorFmt = g.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  const isCopied = copiedKey === `guia_${idx}`;
                  return (
                    <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-semibold text-white whitespace-nowrap flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${idx === 0 ? 'bg-emerald-400' : idx === 3 ? 'bg-blue-400' : 'bg-slate-400'}`} />
                        {g.campo}
                      </td>
                      <td className="py-3 px-4 text-slate-400 whitespace-nowrap">{g.deducoes}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-white whitespace-nowrap text-sm">
                        R$ {valorFmt}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-400 whitespace-nowrap">
                        {g.percentual.toFixed(1)}%
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => copiarValor(valorFmt, `guia_${idx}`)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white transition-all text-xs inline-flex items-center gap-1.5 border border-slate-700"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          {isCopied ? 'Copiado!' : 'Copiar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Tabela de Inconsistências & Quick-Fix de Produtos */}
      {report && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className={`w-5 h-5 ${report.inconsistenciasCadastrais.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`} />
              <div>
                <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                  Auditoria Cadastral & Pendências Fiscais
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    report.inconsistenciasCadastrais.length > 0
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  }`}>
                    {report.inconsistenciasCadastrais.length} pendências
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  {report.inconsistenciasCadastrais.length > 0
                    ? 'Produtos vendidos sem NCM válido foram alocados provisoriamente em tributação normal para segurança fiscal.'
                    : 'Excelente! Todos os produtos faturados no período possuem cadastro fiscal 100% consistente.'}
                </p>
              </div>
            </div>
          </div>

          {report.inconsistenciasCadastrais.length > 0 ? (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400 sticky top-0 z-10 backdrop-blur-md">
                    <th className="py-2.5 px-4 whitespace-nowrap font-semibold">Código / EAN</th>
                    <th className="py-2.5 px-4 whitespace-nowrap font-semibold">Descrição do Produto</th>
                    <th className="py-2.5 px-4 whitespace-nowrap font-semibold">Inconsistência</th>
                    <th className="py-2.5 px-4 text-right whitespace-nowrap font-semibold">Total Vendido (R$)</th>
                    <th className="py-2.5 px-4 text-center whitespace-nowrap font-semibold">Ação Rápida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-200">
                  {report.inconsistenciasCadastrais.map((inc, i) => (
                    <tr key={i} className="hover:bg-slate-800/50 transition-colors">
                      <td className="py-2.5 px-4 font-mono text-[11px] whitespace-nowrap text-slate-300">
                        {inc.barcode || inc.product_code}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-white whitespace-nowrap truncate max-w-sm">
                        {inc.product_name}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-900/60">
                          {inc.detalhe}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-white whitespace-nowrap">
                        R$ {inc.impacto_valor.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => openQuickFix(inc)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 text-xs font-semibold active:scale-95 transition-all"
                        >
                          <Edit3 className="w-3 h-3" />
                          Corrigir NCM
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              <span>Nenhuma pendência encontrada. Todas as vendas estão com conformidade fiscal perfeita!</span>
            </div>
          )}
        </div>
      )}

      {/* Modal Quick-Fix de Correção de NCM / Tributação */}
      {editingIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Edit3 className="w-4 h-4 text-blue-400" />
                <span>Correção Rápida de Cadastro Fiscal</span>
              </div>
              <button
                onClick={() => setEditingIssue(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-1">
              <div className="text-slate-400">Produto:</div>
              <div className="font-semibold text-white">{editingIssue.product_name}</div>
              <div className="text-slate-500 font-mono text-[11px]">Código: {editingIssue.product_code} | EAN: {editingIssue.barcode}</div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  NCM (8 dígitos) *
                </label>
                <input
                  type="text"
                  maxLength={8}
                  placeholder="Ex: 30049099"
                  value={fixNcm}
                  onChange={(e) => setFixNcm(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                />
                <span className="text-[10px] text-slate-500">
                  Dica: '30049099' é o padrão de outros medicamentos humanos.
                </span>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  CEST (opcional)
                </label>
                <input
                  type="text"
                  maxLength={7}
                  placeholder="Ex: 1300300"
                  value={fixCest}
                  onChange={(e) => setFixCest(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Monofásico (PIS/COFINS)?
                  </label>
                  <select
                    value={fixMonofasico}
                    onChange={(e) => setFixMonofasico(e.target.value as 'S' | 'N')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none"
                  >
                    <option value="S">SIM (CST 04)</option>
                    <option value="N">NÃO (Tributado)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Alíquota ST (%)
                  </label>
                  <input
                    type="number"
                    value={fixAliqSt}
                    onChange={(e) => setFixAliqSt(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingIssue(null)}
                className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white text-xs font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveQuickFix}
                disabled={savingFix || fixNcm.length !== 8}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {savingFix ? 'Salvando...' : 'Salvar e Recalcular'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
