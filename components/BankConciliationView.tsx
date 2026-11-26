import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  CreditCard, 
  ShoppingBag, 
  QrCode, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  ArrowUpRight, 
  Check, 
  Clock, 
  Sparkles,
  Search,
  Filter,
  DollarSign,
  Settings,
  KeyRound,
  X,
  Save
} from 'lucide-react';
import { User } from '../types';

interface BankConciliationViewProps {
  user: User;
}

interface ResumoConciliacao {
  totalMaquininhaConciliado: number;
  totalMaquininhaPendente: number;
  totalMaquininhaGeral: number;
  qtdMaquininha: number;
  totalIFoodConciliado: number;
  totalIFoodPendente: number;
  totalIFoodGeral: number;
  qtdIFood: number;
  qtdPix: number;
  totalPix: number;
}

interface ItemExtrato {
  id: string;
  data: string;
  valor: number;
  descricao: string;
  bandeira?: string;
  modalidade?: string;
  tipoRepasse?: string;
  status: 'CONCILIADO' | 'SUGESTAO' | 'NOVO_EXTRATO';
  conciliacao?: any;
  sugestao?: any;
}

export const BankConciliationView: React.FC<BankConciliationViewProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'maquininha' | 'ifood' | 'pix'>('maquininha');
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [saldo, setSaldo] = useState<any>(null);
  const [resumo, setResumo] = useState<ResumoConciliacao | null>(null);
  const [maquininhaItens, setMaquininhaItens] = useState<ItemExtrato[]>([]);
  const [ifoodItens, setIfoodItens] = useState<ItemExtrato[]>([]);
  const [pixItens, setPixItens] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'CONCILIATED'>('ALL');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsConfig, setNeedsConfig] = useState<boolean>(false);

  // Modal de configuração Open Finance (Pluggy)
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [configSaving, setConfigSaving] = useState<boolean>(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [cfgClientId, setCfgClientId] = useState<string>('');
  const [cfgClientSecret, setCfgClientSecret] = useState<string>('');
  const [cfgHasSecret, setCfgHasSecret] = useState<boolean>(false);
  const [cfgItemId, setCfgItemId] = useState<string>('');
  const [cfgAccountId, setCfgAccountId] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const openConfigModal = async () => {
    setConfigError(null);
    setIsConfigOpen(true);
    try {
      const res = await fetch('/api/bank-conciliation/config');
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCfgClientId(data.clientId || '');
        setCfgHasSecret(Boolean(data.hasSecret));
        setCfgClientSecret('');
        setCfgItemId(data.defaultItemId || '');
        setCfgAccountId(data.defaultAccountId || '');
      }
    } catch (e) {
      // Mantém valores atuais em caso de falha de leitura
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigError(null);
    try {
      setConfigSaving(true);
      const res = await fetch('/api/bank-conciliation/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: cfgClientId.trim(),
          clientSecret: cfgClientSecret.trim(),
          defaultItemId: cfgItemId.trim(),
          defaultAccountId: cfgAccountId.trim()
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Não foi possível validar e salvar as credenciais.');
      }
      setIsConfigOpen(false);
      setNeedsConfig(false);
      setErrorMessage(null);
      showToast('Credenciais do Open Finance salvas e validadas com sucesso!');
      await carregarPainel();
    } catch (err: any) {
      setConfigError(err.message || 'Erro ao salvar configuração.');
    } finally {
      setConfigSaving(false);
    }
  };

  const carregarPainel = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await fetch('/api/bank-conciliation/painel');
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.error || data.message || `Falha ao carregar dados do extrato bancário (HTTP ${res.status})`;
        throw new Error(msg);
      }

      if (data.needsConfig) {
        setNeedsConfig(true);
        setSaldo(null);
        setResumo(null);
        openConfigModal();
        return;
      }

      if (data.success) {
        setNeedsConfig(false);
        setSaldo(data.saldo);
        setResumo(data.resumo);
        setMaquininhaItens(data.maquininha || []);
        setIfoodItens(data.ifood || []);
        setPixItens(data.pix || []);
      }
    } catch (err: any) {
      console.error(err);
      const msg = err?.message || 'Erro ao sincronizar com Itaú / Open Finance';
      setErrorMessage(msg);
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarPainel();
  }, []);

  const handleConciliarItem = async (item: ItemExtrato, channel: 'MAQUININHA' | 'IFOOD') => {
    try {
      setActionLoading(true);
      const payload = {
        items: [{
          transactionId: item.id,
          transactionDate: item.data,
          amount: item.valor,
          description: item.descricao,
          channel,
          targetType: channel === 'MAQUININHA' ? 'card_machine_receivable' : 'ifood_sale',
          targetId: item.sugestao ? item.sugestao.id : null,
          notes: item.sugestao ? `Conciliado com ${item.sugestao.id}` : `Confirmado via Extrato Itaú`
        }],
        userName: user.name || 'Administrador'
      };

      const res = await fetch('/api/bank-conciliation/conciliar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Falha ao registrar conciliação');
      showToast(`Entrada de R$ ${item.valor.toFixed(2)} conciliada com sucesso!`);
      await carregarPainel();
    } catch (err: any) {
      console.error(err);
      showToast('Erro ao conciliar item');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAutoConciliarTudo = async () => {
    try {
      setActionLoading(true);
      const res = await fetch('/api/bank-conciliation/auto-conciliar-tudo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: user.name || 'Robô Open Finance' })
      });

      if (!res.ok) throw new Error('Falha na conciliação automática');
      const data = await res.json();
      showToast(`🎉 Sucesso: ${data.count} entradas de Maquininha e iFood foram conciliadas!`);
      await carregarPainel();
    } catch (err: any) {
      console.error(err);
      showToast('Erro na conciliação automática');
    } finally {
      setActionLoading(false);
    }
  };

  // Filtragem dos itens exibidos
  const filtrarLista = (itens: ItemExtrato[]) => {
    return itens.filter(item => {
      const matchSearch = item.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.data.includes(searchTerm) ||
        item.valor.toFixed(2).includes(searchTerm);

      if (!matchSearch) return false;

      if (statusFilter === 'PENDING') {
        return item.status !== 'CONCILIADO';
      }
      if (statusFilter === 'CONCILIATED') {
        return item.status === 'CONCILIADO';
      }
      return true;
    });
  };

  const maquininhaFiltrada = filtrarLista(maquininhaItens);
  const ifoodFiltrado = filtrarLista(ifoodItens);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-emerald-400 animate-bounce">
          <CheckCircle2 className="w-5 h-5" />
          <span className="font-medium text-sm">{toastMessage}</span>
        </div>
      )}

      {/* Top Banner: Saldo Real & Ações */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-800/40 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold rounded-full flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-amber-400" />
                Itaú Empresas • Open Finance
              </span>
              <span className="text-xs text-slate-400">
                Conta: {saldo?.contas?.[0]?.numero || (needsConfig ? 'Não configurada' : 'Conectada')}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Conciliação Bancária Automática
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Conferência contínua dos repasses de Maquininha (Rede), iFood e Pix direto do extrato bancário oficial.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={openConfigModal}
              className="p-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition flex items-center gap-2 text-sm font-medium"
              title="Configurar Open Finance (Pluggy)"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Configurar</span>
            </button>

            <button
              onClick={carregarPainel}
              disabled={loading || actionLoading}
              className="p-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition flex items-center gap-2 text-sm font-medium disabled:opacity-50"
              title="Atualizar Extrato Agora"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>

            <button
              onClick={handleAutoConciliarTudo}
              disabled={loading || actionLoading || ((resumo?.totalMaquininhaPendente || 0) === 0 && (resumo?.totalIFoodPendente || 0) === 0)}
              className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl shadow-lg shadow-emerald-900/30 font-semibold text-sm flex items-center gap-2 transition disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>Conciliar Todas as Entradas</span>
            </button>
          </div>
        </div>

        {/* Métricas Principais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Saldo Itaú em Conta</span>
              <Building2 className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {saldo ? `R$ ${Number(saldo.saldoTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00'}
            </div>
            <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Sincronizado via Open Finance
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Maquininha (Rede) no Extrato</span>
              <CreditCard className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              R$ {(resumo?.totalMaquininhaGeral || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-slate-300 mt-1 flex items-center justify-between">
              <span>{resumo?.qtdMaquininha || 0} repasses</span>
              <span className="text-amber-400 font-medium">
                Pendente: R$ {(resumo?.totalMaquininhaPendente || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>iFood Recebido no Extrato</span>
              <ShoppingBag className="w-4 h-4 text-red-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              R$ {(resumo?.totalIFoodGeral || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-slate-300 mt-1 flex items-center justify-between">
              <span>{resumo?.qtdIFood || 0} lotes</span>
              <span className="text-amber-400 font-medium">
                Pendente: R$ {(resumo?.totalIFoodPendente || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Pix Caixa/Balcão Confirmados</span>
              <QrCode className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400">
              R$ {(resumo?.totalPix || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-slate-300 mt-1">
              {resumo?.qtdPix || 0} pagamentos conferidos
            </div>
          </div>
        </div>
      </div>

      {/* Alerta de Erro ou Configuração Pendente */}
      {(errorMessage || needsConfig) && (
        <div className={`rounded-2xl p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          needsConfig
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-200'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-200'
        }`}>
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold">
                {needsConfig
                  ? 'Conexão Open Finance (Pluggy) ainda não configurada neste servidor'
                  : 'Erro ao sincronizar extrato bancário'}
              </p>
              <p className="opacity-90 text-xs mt-0.5">
                {needsConfig
                  ? 'Clique em "Configurar Open Finance" para informar o Client ID, Client Secret e Item ID da sua conta Pluggy.'
                  : errorMessage}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={openConfigModal}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Configurar Open Finance</span>
            </button>
            <button
              onClick={carregarPainel}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Navegação por Abas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('maquininha')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-2 ${
              activeTab === 'maquininha'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Maquininhas ({resumo?.qtdMaquininha || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('ifood')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-2 ${
              activeTab === 'ifood'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>iFood ({resumo?.qtdIFood || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('pix')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-2 ${
              activeTab === 'pix'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Pix Balcão ({resumo?.qtdPix || 0})</span>
          </button>
        </div>

        {/* Barra de Filtro e Busca */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por descrição, valor ou data..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56 sm:w-64"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">Todos os status</option>
            <option value="PENDING">Pendentes</option>
            <option value="CONCILIATED">Conciliados</option>
          </select>
        </div>
      </div>

      {/* Conteúdo da Aba: MAQUININHAS */}
      {activeTab === 'maquininha' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-indigo-500" />
              Repasses da Adquirente (Rede) creditados no Itaú
            </h3>
            <span className="text-xs text-slate-500">
              {maquininhaFiltrada.length} entradas encontradas
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4 whitespace-nowrap">Data Crédito</th>
                  <th className="py-3 px-4 whitespace-nowrap">Descrição no Extrato</th>
                  <th className="py-3 px-4 whitespace-nowrap">Bandeira / Modalidade</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Valor Depositado</th>
                  <th className="py-3 px-4 text-center whitespace-nowrap">Status</th>
                  <th className="py-3 px-4 text-center whitespace-nowrap">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {maquininhaFiltrada.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Nenhuma transação encontrada para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  maquininhaFiltrada.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">
                        {item.data ? item.data.split('-').reverse().join('/') : '-'}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-700 dark:text-slate-300">
                        {item.descricao}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded font-medium text-xs">
                          {item.bandeira} • {item.modalidade}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        R$ {item.valor.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {item.status === 'CONCILIADO' ? (
                          <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-semibold inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Conciliado
                          </span>
                        ) : item.status === 'SUGESTAO' ? (
                          <span className="px-2.5 py-1 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 rounded-full text-xs font-semibold inline-flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5" /> Match Encontrado
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-full text-xs font-semibold inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> No Extrato
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {item.status === 'CONCILIADO' ? (
                          <span className="text-xs text-slate-400">OK</span>
                        ) : (
                          <button
                            onClick={() => handleConciliarItem(item, 'MAQUININHA')}
                            disabled={actionLoading}
                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition inline-flex items-center gap-1 shadow-sm"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Confirmar</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Conteúdo da Aba: IFOOD */}
      {activeTab === 'ifood' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-red-500" />
              Repasses Semanais do iFood Creditados no Itaú
            </h3>
            <span className="text-xs text-slate-500">
              {ifoodFiltrado.length} repasses encontrados
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4 whitespace-nowrap">Data Crédito</th>
                  <th className="py-3 px-4 whitespace-nowrap">Descrição no Extrato</th>
                  <th className="py-3 px-4 whitespace-nowrap">Tipo de Repasse</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Valor Depositado</th>
                  <th className="py-3 px-4 text-center whitespace-nowrap">Status</th>
                  <th className="py-3 px-4 text-center whitespace-nowrap">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {ifoodFiltrado.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Nenhum repasse do iFood encontrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  ifoodFiltrado.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">
                        {item.data ? item.data.split('-').reverse().join('/') : '-'}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-700 dark:text-slate-300">
                        {item.descricao}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="px-2.5 py-0.5 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 rounded font-medium text-xs">
                          {item.tipoRepasse}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        R$ {item.valor.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {item.status === 'CONCILIADO' ? (
                          <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-semibold inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Conciliado
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-full text-xs font-semibold inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> No Extrato
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {item.status === 'CONCILIADO' ? (
                          <span className="text-xs text-slate-400">OK</span>
                        ) : (
                          <button
                            onClick={() => handleConciliarItem(item, 'IFOOD')}
                            disabled={actionLoading}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition inline-flex items-center gap-1 shadow-sm"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Confirmar</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Conteúdo da Aba: PIX */}
      {activeTab === 'pix' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
              <QrCode className="w-4 h-4 text-emerald-500" />
              Pix Recebidos no Balcão e Delivery (Amostra recente)
            </h3>
            <span className="text-xs text-slate-500">
              Exibindo as últimas 50 entradas
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4 whitespace-nowrap">Data</th>
                  <th className="py-3 px-4 whitespace-nowrap">Identificação do Pix</th>
                  <th className="py-3 px-4 whitespace-nowrap">Documento Pagador</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Valor</th>
                  <th className="py-3 px-4 text-center whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {pixItens.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Nenhum Pix registrado no extrato recente.
                    </td>
                  </tr>
                ) : (
                  pixItens.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">
                        {p.data ? p.data.split('-').reverse().join('/') : '-'}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-700 dark:text-slate-300">
                        {p.descricao}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-xs text-slate-500">
                        {p.pagador}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        R$ {p.valor.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded text-xs font-medium inline-flex items-center gap-1">
                          <Check className="w-3 h-3" /> Confirmado no Banco
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Configuração Open Finance (Pluggy) */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 dark:text-white text-base">
                    Configurar Open Finance (Pluggy)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Credenciais gravadas com segurança no banco de dados do servidor.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsConfigOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {configError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{configError}</span>
              </div>
            )}

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Client ID (Pluggy) *
                </label>
                <input
                  type="text"
                  required
                  value={cfgClientId}
                  onChange={(e) => setCfgClientId(e.target.value)}
                  placeholder="ex: 30b8d898-a53f-4b16-ba8a-c93b583b0f0f"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Client Secret (Pluggy) {cfgHasSecret ? '(opcional para manter a atual)' : '*'}
                </label>
                <input
                  type="password"
                  required={!cfgHasSecret}
                  value={cfgClientSecret}
                  onChange={(e) => setCfgClientSecret(e.target.value)}
                  placeholder={cfgHasSecret ? '•••••••••••••••• (chave já cadastrada)' : 'ex: pluggy_sk_...'}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Item ID (Conexão Meu Pluggy) *
                </label>
                <input
                  type="text"
                  required={!cfgAccountId.trim()}
                  value={cfgItemId}
                  onChange={(e) => setCfgItemId(e.target.value)}
                  placeholder="ex: 549a9b11-28fa-43a3-84bc-8b80c210af42"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Account ID (Opcional — detectado automaticamente pelo Item ID)
                </label>
                <input
                  type="text"
                  value={cfgAccountId}
                  onChange={(e) => setCfgAccountId(e.target.value)}
                  placeholder="Deixe em branco para detectar automaticamente"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={configSaving}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{configSaving ? 'Validando...' : 'Validar e Salvar'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default BankConciliationView;
