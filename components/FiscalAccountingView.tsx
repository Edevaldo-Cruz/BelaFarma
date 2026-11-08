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
  CheckCircle2,
  UserCheck,
  Package,
  Archive,
  ChevronDown,
  ChevronUp,
  FileText
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

  // Auditoria Prévia de Fechamento & Pacote Contábil (.ZIP)
  const [auditResult, setAuditResult] = useState<any | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isSyncingDigifarma, setIsSyncingDigifarma] = useState(false);
  const [showAuditDetails, setShowAuditDetails] = useState(false);

  // Modal de Configurações do Contador (SPED Registro 0100)
  const [isContadorModalOpen, setIsContadorModalOpen] = useState(false);
  const [contadorForm, setContadorForm] = useState({
    contador_nome: '',
    contador_cpf: '',
    contador_crc: '',
    contador_cnpj: '',
    contador_cep: '',
    contador_endereco: '',
    contador_numero: '',
    contador_bairro: '',
    contador_telefone: '',
    contador_email: ''
  });
  const [savingContador, setSavingContador] = useState(false);

  const carregarDadosContador = async () => {
    try {
      const res = await fetch('/api/erp/fiscal/settings');
      if (res.ok) {
        const d = await res.json();
        if (d.success && d.settings) {
          setContadorForm({
            contador_nome: d.settings.contador_nome || '',
            contador_cpf: d.settings.contador_cpf || '',
            contador_crc: d.settings.contador_crc || '',
            contador_cnpj: d.settings.contador_cnpj || '',
            contador_cep: d.settings.contador_cep || '',
            contador_endereco: d.settings.contador_endereco || '',
            contador_numero: d.settings.contador_numero || '',
            contador_bairro: d.settings.contador_bairro || '',
            contador_telefone: d.settings.contador_telefone || '',
            contador_email: d.settings.contador_email || ''
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const salvarDadosContador = async () => {
    setSavingContador(true);
    try {
      const res = await fetch('/api/erp/fiscal/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contadorForm)
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || 'Falha ao salvar dados');
      showToast('Dados do contabilista atualizados para o SPED Fiscal!');
      setIsContadorModalOpen(false);
    } catch (e: any) {
      showToast(`Erro ao salvar: ${e.message}`);
    } finally {
      setSavingContador(false);
    }
  };

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
    handleAudit();
  }, [competencia]);

  const handleAudit = async () => {
    setIsAuditing(true);
    try {
      const res = await fetch(`/api/erp/fiscal/audit/${competencia}`);
      const json = await res.json();
      if (res.ok && json.success) {
        setAuditResult(json.data);
      }
    } catch (err) {
      console.warn('Erro ao carregar auditoria prévia:', err);
    } finally {
      setIsAuditing(false);
    }
  };

  const handleSyncDigifarma = async () => {
    setIsSyncingDigifarma(true);
    try {
      const res = await fetch('/api/erp/inbound/sync-digifarma', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competencia })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast(`✅ Digifarma: ${json.total_importadas} nova(s) nota(s) importada(s), ${json.total_ja_existentes} já existentes!`);
        await carregarApuracao(true);
        await handleAudit();
      } else {
        showToast(json.error || 'Erro ao sincronizar com Digifarma.');
      }
    } catch {
      showToast('Falha na comunicação com o servidor.');
    } finally {
      setIsSyncingDigifarma(false);
    }
  };

  const handleDownloadPackageZip = () => {
    window.open(`/api/erp/fiscal/package-zip/${competencia}`, '_blank');
    showToast('Download do Pacote Contábil Completo (.ZIP) iniciado!');
  };

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

  const handleDownloadSintegra = () => {
    window.open(`/api/erp/fiscal/sintegra-txt?competencia=${competencia}`, '_blank');
    showToast('Download do arquivo SINTEGRA iniciado!');
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
      showToast(`Erro ao atualizar: ${err.message}`);
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
              onClick={handleSyncDigifarma}
              disabled={isSyncingDigifarma || loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-cyan-700/80 hover:bg-cyan-600 active:scale-95 text-white transition-all shadow-sm"
              title="Importar compras faturadas no Digifarma (CAB_NOTAS) para este mês"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDigifarma ? 'animate-spin' : ''}`} />
              {isSyncingDigifarma ? 'Sincronizando...' : 'Sincronizar Digifarma'}
            </button>

            <button
              onClick={handleAudit}
              disabled={isAuditing}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-amber-600/90 hover:bg-amber-600 active:scale-95 text-white transition-all shadow-sm"
              title="Executar auditoria prévia e validação de pendências fiscais"
            >
              <ShieldCheck className={`w-3.5 h-3.5 ${isAuditing ? 'animate-spin' : ''}`} />
              {isAuditing ? 'Auditando...' : 'Auditar Fechamento'}
            </button>

            <button
              onClick={handleDownloadPackageZip}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 active:scale-95 text-white shadow-md shadow-violet-900/30 transition-all border border-violet-400/30"
              title="Baixar pacote contábil completo compactado (.ZIP) com SINTEGRA, SPED, CSV e todas as pastas de XMLs (Entradas, Saídas e Cancelamentos)"
            >
              <Package className="w-4 h-4 text-violet-200" />
              Pacote Contábil (.ZIP)
            </button>

            <button
              onClick={() => carregarApuracao(true)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700 transition-all shadow-sm"
              title="Recalcular todos os cupons do período"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
              Recalcular
            </button>

            <button
              onClick={handleDownloadCsv}
              disabled={!report || loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600/90 hover:bg-blue-600 active:scale-95 text-white transition-all shadow-sm"
              title="Exportar planilha completa para o contador"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Relatório Contábil (CSV)
            </button>

            <button
              onClick={handleDownloadSped}
              disabled={!report || loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white transition-all shadow-sm"
              title="Baixar arquivo oficial para validação no PVA da Receita Federal (Entradas e Saídas)"
            >
              <Download className="w-3.5 h-3.5" />
              SPED Fiscal (.TXT)
            </button>

            <button
              onClick={handleDownloadSintegra}
              disabled={!report || loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-500 active:scale-95 text-white transition-all shadow-sm"
              title="Baixar arquivo oficial do SINTEGRA (Convênio ICMS 57/95) com Entradas e Saídas"
            >
              <Download className="w-3.5 h-3.5" />
              SINTEGRA (.TXT)
            </button>

            <button
              onClick={() => {
                carregarDadosContador();
                setIsContadorModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-700 hover:bg-slate-600 active:scale-95 text-white transition-all shadow-sm"
              title="Configurar dados do contabilista (CRC/CPF) para o Registro 0100 do SPED Fiscal e SINTEGRA"
            >
              <UserCheck className="w-3.5 h-3.5" />
              Contador (SPED)
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

      {/* Painel de Auditoria Prévia de Fechamento Fiscal */}
      {auditResult && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-lg ${auditResult.pronto_para_fechamento ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                {auditResult.pronto_para_fechamento ? <ShieldCheck className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-white tracking-tight">
                    Auditoria Prévia de Fechamento Fiscal ({competencia})
                  </h2>
                  <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold border ${
                    auditResult.pronto_para_fechamento 
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60' 
                      : 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                  }`}>
                    {auditResult.pronto_para_fechamento ? '✅ Pronto para Fechamento' : '⚠️ Pendências Encontradas'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Conferência cruzada de NFC-e, Compras (NF-e 55), contingências e integridade cadastral de NCMs.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAuditDetails(!showAuditDetails)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              >
                {showAuditDetails ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    Ocultar Alertas ({auditResult.alertas?.length || 0})
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    Ver Detalhes ({auditResult.alertas?.length || 0})
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Cards de Métricas Compactas da Auditoria */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-2 border-t border-slate-800/80">
            <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/60">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Saídas Autorizadas
              </span>
              <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                {auditResult.resumo?.nfc_autorizadas ?? 0}
              </div>
            </div>

            <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/60">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Saídas Canceladas
              </span>
              <div className="text-base font-bold text-slate-300 font-mono mt-0.5">
                {auditResult.resumo?.saidas_canceladas ?? 0}
              </div>
            </div>

            <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/60">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Entradas (NF-e 55)
              </span>
              <div className="text-base font-bold text-blue-400 font-mono mt-0.5">
                {auditResult.resumo?.total_entradas ?? 0}
              </div>
            </div>

            <div className={`p-2.5 rounded-lg border ${
              (auditResult.resumo?.contingencias_pendentes ?? 0) > 0 
                ? 'bg-red-950/30 border-red-800/60 text-red-300' 
                : 'bg-slate-950/50 border-slate-800/60 text-emerald-400'
            }`}>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                Contingências Pendentes
              </span>
              <div className="text-base font-bold font-mono mt-0.5">
                {auditResult.resumo?.contingencias_pendentes ?? 0}
              </div>
            </div>

            <div className={`p-2.5 rounded-lg border ${
              (auditResult.resumo?.produtos_ncm_invalido ?? 0) > 0 
                ? 'bg-amber-950/30 border-amber-800/60 text-amber-300' 
                : 'bg-slate-950/50 border-slate-800/60 text-emerald-400'
            }`}>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                NCMs Inválidos
              </span>
              <div className="text-base font-bold font-mono mt-0.5">
                {auditResult.resumo?.produtos_ncm_invalido ?? 0}
              </div>
            </div>
          </div>

          {/* Listagem detalhada de Alertas Expandida */}
          {showAuditDetails && auditResult.alertas && auditResult.alertas.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
              <span className="text-xs font-semibold text-slate-300 block">
                Lista de Inconsistências Fiscais Detectadas:
              </span>
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {auditResult.alertas.map((alerta: any, idx: number) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-lg border flex items-start gap-2.5 text-xs ${
                      alerta.nivel === 'ERRO'
                        ? 'bg-red-950/40 border-red-800/60 text-red-200'
                        : 'bg-amber-950/30 border-amber-800/50 text-amber-200'
                    }`}
                  >
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                      alerta.nivel === 'ERRO' ? 'bg-red-800 text-white' : 'bg-amber-700 text-white'
                    }`}>
                      {alerta.nivel}
                    </span>
                    <div className="flex-1">
                      <div className="font-semibold text-slate-100 flex items-center justify-between">
                        <span>{alerta.categoria}</span>
                        {alerta.count > 0 && (
                          <span className="text-[10px] opacity-75">{alerta.count} ocorrência(s)</span>
                        )}
                      </div>
                      <p className="text-[11px] opacity-90 mt-0.5">{alerta.mensagem}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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

      {/* Modal de Configuração do Contabilista (SPED Registro 0100) */}
      {isContadorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <UserCheck className="w-5 h-5 text-indigo-400" />
                <h3>Dados do Contabilista (SPED Registro 0100)</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsContadorModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Estes dados são gravados no <strong>Registro 0100</strong> do SPED Fiscal e nos dados complementares do SINTEGRA, exigidos pelo validador PVA da Receita Federal.
            </p>

            <div className="space-y-3 text-xs max-h-[60vh] overflow-y-auto pr-1">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Nome do Contabilista / Contador</label>
                <input
                  type="text"
                  value={contadorForm.contador_nome}
                  onChange={(e) => setContadorForm({ ...contadorForm, contador_nome: e.target.value })}
                  placeholder="Ex: EDIVALDO CRUZ"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">CPF do Contador</label>
                  <input
                    type="text"
                    value={contadorForm.contador_cpf}
                    onChange={(e) => setContadorForm({ ...contadorForm, contador_cpf: e.target.value })}
                    placeholder="Apenas números"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">CRC (Ex: MG-123456/O)</label>
                  <input
                    type="text"
                    value={contadorForm.contador_crc}
                    onChange={(e) => setContadorForm({ ...contadorForm, contador_crc: e.target.value })}
                    placeholder="Ex: MG000000O0"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Telefone de Contato</label>
                  <input
                    type="text"
                    value={contadorForm.contador_telefone}
                    onChange={(e) => setContadorForm({ ...contadorForm, contador_telefone: e.target.value })}
                    placeholder="DDD + Número"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">E-mail</label>
                  <input
                    type="email"
                    value={contadorForm.contador_email}
                    onChange={(e) => setContadorForm({ ...contadorForm, contador_email: e.target.value })}
                    placeholder="contador@email.com"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-slate-300 font-medium mb-1">Endereço / Logradouro</label>
                  <input
                    type="text"
                    value={contadorForm.contador_endereco}
                    onChange={(e) => setContadorForm({ ...contadorForm, contador_endereco: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Número</label>
                  <input
                    type="text"
                    value={contadorForm.contador_numero}
                    onChange={(e) => setContadorForm({ ...contadorForm, contador_numero: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Bairro</label>
                  <input
                    type="text"
                    value={contadorForm.contador_bairro}
                    onChange={(e) => setContadorForm({ ...contadorForm, contador_bairro: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">CEP</label>
                  <input
                    type="text"
                    value={contadorForm.contador_cep}
                    onChange={(e) => setContadorForm({ ...contadorForm, contador_cep: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsContadorModalOpen(false)}
                className="px-3.5 py-2 rounded-lg text-slate-400 hover:text-white text-xs font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvarDadosContador}
                disabled={savingContador}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 shadow-md"
              >
                <Save className="w-3.5 h-3.5" />
                {savingContador ? 'Salvando...' : 'Salvar Dados do Contador'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
