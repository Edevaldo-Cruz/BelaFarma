import React, { useState, useEffect, useRef } from 'react';
import { useToast } from './ToastContext';
import { 
  Bot, Spline as Sparkles, UploadCloud, FileText, TrendingDown,
  LineChart, CheckCircle, AlertTriangle, Lightbulb
} from 'lucide-react';

const API_BASE = 'http://localhost:3001';

type Tab = 'dashboard' | 'caixa' | 'digifarma';

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setLoadingUpload(true);
    setRelatorioArquivo('');
    addToast(`📂 Enviando ${file.name} para a Isa ler...`, 'info');

    const formData = new FormData();
    formData.append('relatorio', file);

    try {
      const r = await fetch(`${API_BASE}/api/finance-agent/upload-relatorio`, {
        method: 'POST',
        body: formData
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      
      setRelatorioArquivo(data.relatorio);
      addToast('✅ Relatório processado com sucesso!', 'success');
    } catch (err: unknown) {
      addToast(`❌ Erro no upload: ${err instanceof Error ? err.message : 'Arquivo inválido'}`, 'error');
    } finally {
      setLoadingUpload(false);
      // reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: Bot },
    { id: 'caixa', label: 'Vigilância de Caixa', icon: LineChart },
    { id: 'digifarma', label: 'Leitura Digifarma', icon: FileText },
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

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm overflow-hidden relative group cursor-pointer hover:border-blue-300 transition-colors"
                 onClick={() => setActiveTab('digifarma')}>
              <div className="absolute -right-6 -top-6 opacity-5 group-hover:opacity-10 transition-opacity">
                <FileText className="w-32 h-32" />
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-2xl w-fit mb-4">
                <UploadCloud className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">Leitor Digifarma (PDF/CSV)</h3>
              <p className="text-sm text-slate-500 max-w-sm">
                Jogue um relatório de vendas ou fluxo em formato PDF ou CSV. A Isa formata os dados complexos 
                do Digifarma em um diagnóstico claro, apontando para onde o seu dinheiro está vazando.
              </p>
            </div>
          </div>
        )}

        {/* ─── VIGILÂNCIA DE CAIXA ────────────────────────────────────────────── */}
        {activeTab === 'caixa' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl shadow-sm">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-1">Diagnóstico Semanal de Fluxo</h3>
                <p className="text-sm text-slate-500">Avalia os fechamentos dos últimos 7 dias cruzando com Boletos que vencem logo.</p>
              </div>
              <button 
                onClick={handleAnalisarCaixa} 
                disabled={loadingCaixa}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all whitespace-nowrap"
              >
                {loadingCaixa ? 'Aguarde, calculando...' : 'Gerar Análise Crítica'}
              </button>
            </div>

            {loadingCaixa && (
              <div className="flex flex-col items-center justify-center p-20 gap-4 text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
                <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-700 border-t-emerald-600 rounded-full animate-spin" />
                <p className="font-bold">Cruzando dados de vendas e despesas do sistema...</p>
              </div>
            )}

            {relatorioCaixa && !loadingCaixa && (
              <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-3xl p-8 shadow-sm">
                <pre className="text-sm font-medium whitespace-pre-wrap text-slate-800 dark:text-slate-200 font-sans leading-relaxed">
                  {relatorioCaixa}
                </pre>
              </div>
            )}

            {!relatorioCaixa && !loadingCaixa && (
              <div className="flex flex-col items-center justify-center p-16 gap-4 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl bg-slate-50/50 dark:bg-slate-800/30">
                <div className="text-4xl opacity-80 mb-2">📉</div>
                <h4 className="font-bold text-slate-700 dark:text-slate-300 text-lg">Sem relatório</h4>
                <p className="text-sm text-slate-500 max-w-sm">Mande a Isa fazer a auditoria do seu faturamento.</p>
              </div>
            )}
          </div>
        )}

        {/* ─── LEITURA DIGIFARMA ──────────────────────────────────────────────── */}
        {activeTab === 'digifarma' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-blue-500" /> Upload de Relatórios (CSV ou PDF)
              </h3>
              <p className="text-sm text-slate-500 mb-6">
                Faça o download de um relatório de giro de estoque, lucro ou vendas no software interno (Digifarma) e envie aqui. 
                A Isa vai ler as planilhas e páginas de PDF e te resumir o que é mais alarmante ou positivo.
              </p>

              <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-10 bg-slate-50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative">
                <UploadCloud className="w-12 h-12 text-slate-400 mb-4" />
                <p className="font-bold text-slate-700 dark:text-slate-300 text-lg mb-1">
                  Arraste o arquivo ou Clique aqui
                </p>
                <p className="text-xs text-slate-500">.PDF ou .CSV aceitos.</p>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  accept=".csv, .pdf, text/csv, application/pdf" 
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={loadingUpload}
                />
              </div>

              {loadingUpload && (
                <div className="mt-8 flex items-center justify-center gap-3 text-blue-600 dark:text-blue-400 font-bold">
                  <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                  A Isa está processando o arquivo {fileName}... Isso pode demorar.
                </div>
              )}
            </div>

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
