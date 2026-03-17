import React, { useState, useEffect, useRef } from 'react';
import { useToast } from './ToastContext';
import { 
  Bot, Spline as Sparkles, UploadCloud, FileText, TrendingDown,
  LineChart, CheckCircle, AlertTriangle, Lightbulb, ArrowLeft
} from 'lucide-react';
import FileSelector from './FileSelector';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

type Tab = 'dashboard' | 'caixa' | 'central';

export default function FinancialAgent() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  const [pilula, setPilula] = useState<string>('');
  const [relatorioCaixa, setRelatorioCaixa] = useState<string>('');
  const [relatorioArquivo, setRelatorioArquivo] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');

  const [loadingPilula, setLoadingPilula] = useState(false);
  const [loadingCaixa, setLoadingCaixa] = useState(false);
  const [loadingUpload, setLoadingUpload] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Buscar uma pílula inicial ao abrir
    buscarPilula();
  }, []);

  const buscarPilula = async () => {
    setLoadingPilula(true);
    try {
      const r = await fetch(`${API_BASE}/api/finance-agent/pilulas`);
      if (r.ok) {
        const data = await r.json();
        setPilula(data.pilula);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPilula(false);
    }
  };

  const handleAnalisarCaixa = async () => {
    setLoadingCaixa(true);
    setRelatorioCaixa('');
    addToast('🔍 Isa analisando faturamentos e despesas...', 'info');
    try {
      const r = await fetch(`${API_BASE}/api/finance-agent/analisar-caixa`, { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setRelatorioCaixa(data.relatorio);
      addToast('✅ Análise do caixa pronta!', 'success');
    } catch (err: unknown) {
      addToast(`❌ ${err instanceof Error ? err.message : 'Erro genérico'}`, 'error');
    } finally {
      setLoadingCaixa(false);
    }
  };

  const handleAnalyzeFile = async (filename: string) => {
    setLoadingUpload(true);
    setRelatorioArquivo('');
    addToast(`📂 Analisando relatório ${filename}...`, 'info');

    try {
      const r = await fetch(`${API_BASE}/api/finance-agent/analisar-arquivo-central`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      
      setRelatorioArquivo(data.relatorio);
      addToast('✅ Análise concluída!', 'success');
    } catch (err: unknown) {
      addToast(`❌ Erro na análise: ${err instanceof Error ? err.message : 'Falha total'}`, 'error');
    } finally {
      setLoadingUpload(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: Bot },
    { id: 'caixa', label: 'Vigilância de Caixa', icon: LineChart },
    { id: 'central', label: 'Análise de Relatórios', icon: FileText },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto pb-12">
      {/* Header — Isa Financeiro */}
      <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-500 rounded-3xl p-8 text-white shadow-lg overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="h-20 w-20 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-inner border border-white/20">
              <span className="text-5xl drop-shadow-md">💰</span>
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight mb-1">Isa-Financeiro</h1>
              <p className="text-emerald-100 font-medium flex gap-2">
                <span>Vigilante Financeira</span>
                <span className="text-emerald-300">•</span>
                <span>Bela Farma Sul</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <span className="px-4 py-2 bg-white/10 text-white border border-white/20 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-2">
              Gemini Flash
            </span>
          </div>
        </div>
      </div>

      {/* Pílula Diária */}
      <div className="bg-yellow-50 dark:bg-yellow-900/10 border-l-4 border-yellow-500 p-5 rounded-r-2xl flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center shadow-sm">
        <div>
          <h4 className="text-xs font-black text-yellow-700 dark:text-yellow-500 uppercase tracking-widest mb-1 flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5" /> Pílula de Gestão da Isa
          </h4>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 italic min-h-[1.5rem]">
            {loadingPilula ? 'A Isa está formulando um conselho para você...' : (pilula || 'Nenhum conselho ainda.')}
          </p>
        </div>
        <button onClick={buscarPilula} disabled={loadingPilula} className="text-xs font-bold text-yellow-700 bg-yellow-100 hover:bg-yellow-200 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
          Novo Conselho
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-slate-200 dark:border-slate-800">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                isActive 
                  ? 'bg-emerald-100/50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/30 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div>
        {/* ─── DASHBOARD ─────────────────────────────────────────────────────── */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm overflow-hidden relative group cursor-pointer hover:border-emerald-300 transition-colors"
                 onClick={() => setActiveTab('caixa')}>
              <div className="absolute -right-6 -top-6 opacity-5 group-hover:opacity-10 transition-opacity">
                <LineChart className="w-32 h-32" />
              </div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-2xl w-fit mb-4">
                <LineChart className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">Vigilância de Caixa (LRT)</h3>
              <p className="text-sm text-slate-500 max-w-sm">
                A Isa analisa os últimos 7 fechamentos da Bela Farma e o montante de boletos pendentes. 
                Descubra instantaneamente se o lucro operacional cobre os boletos da semana sem falir seu caixa.
              </p>
            </div>
          </div>
        )}

        {/* ─── ANÁLISE DE RELATÓRIOS (CENTRALIZADA) ─────────────────────────── */}
        {activeTab === 'central' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" /> Analisar Relatórios do Digifarma
              </h3>
              <p className="text-sm text-slate-500 mb-6">
                Selecione um dos relatórios que você enviou para a <strong>Central de Arquivos</strong> para que a Isa faça o diagnóstico financeiro.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto p-2">
                <FileSelector onSelect={(filenames) => {
                  const filename = filenames[0] || '';
                  setFileName(filename);
                  if (filename) handleAnalyzeFile(filename);
                }} selectedFiles={fileName ? [fileName] : []} />
              </div>
            </div>

            {loadingUpload && (
              <div className="flex flex-col items-center justify-center p-20 gap-4 text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl animate-pulse">
                <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-700 border-t-blue-600 rounded-full animate-spin" />
                <p className="font-bold">A Isa está lendo o relatório e preparando o diagnóstico...</p>
              </div>
            )}

            {relatorioArquivo && !loadingUpload && (
              <div className="bg-blue-50/50 dark:bg-slate-800/80 border border-blue-100 dark:border-slate-700 rounded-3xl p-8 shadow-sm">
                 <h4 className="text-sm font-bold text-slate-500 mb-4 uppercase tracking-widest border-b pb-2">Diagnóstico de "{fileName}"</h4>
                <pre className="text-sm font-medium whitespace-pre-wrap text-slate-800 dark:text-slate-200 font-sans leading-relaxed">
                  {relatorioArquivo}
                </pre>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
