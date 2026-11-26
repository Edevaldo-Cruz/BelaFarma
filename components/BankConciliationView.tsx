import React, { useState, useEffect } from 'react';
import {
  Building2,
  CreditCard,
  ShoppingBag,
  QrCode,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Check,
  Clock,
  Sparkles,
  Search,
  Settings,
  KeyRound,
  X,
  Save,
  ShieldAlert,
  Bot,
  Plus,
  ExternalLink,
  Copy,
  PiggyBank,
  Star,
  BookOpen,
  ArrowRight
} from 'lucide-react';
import { User, View } from '../types';
import { CheckingAccount } from './CheckingAccount';

interface BankConciliationViewProps {
  user: User;
  onNavigate?: (view: View) => void;
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

interface PendenciasSistema {
  today: string;
  cardDueCount: number;
  cardDueGross: number;
  cardFutureCount: number;
  cardFutureGross: number;
  ifoodDueCount: number;
  ifoodDueNet: number;
  ifoodFutureCount: number;
  ifoodFutureNet: number;
}

interface ContaConectada {
  id: string;
  itemId?: string | null;
  nome: string;
  customLabel?: string | null;
  tipo: string;
  subtipo: string;
  numero: string;
  saldo: number;
  moeda: string;
  role: 'PRINCIPAL' | 'INVESTIMENTO' | 'SECUNDARIO';
}

interface SaldoData {
  configured?: boolean;
  saldoPrincipal: number;
  saldoInvestimento: number;
  saldoTotal: number;
  contaPrincipal?: ContaConectada | null;
  contas: ContaConectada[];
  atualizadoEm?: string;
}

interface UltimaExecucao {
  id: string;
  runDate: string;
  status: 'OK' | 'ALERTA' | 'ERRO';
  saldoTotal: number | null;
  extratoConciliados: number;
  cardsBaixados: number;
  ifoodBaixados: number;
  alertas: any[];
  whatsappSent: boolean;
  createdAt: string;
}

interface ItemStatus {
  id: string;
  status: string;
  executionStatus: string;
  lastUpdatedAt: string | null;
  nextAutoSyncAt: string | null;
  consentExpiresAt: string | null;
}

interface ItemExtrato {
  id: string;
  data: string;
  valor: number;
  descricao: string;
  accountName?: string | null;
  bandeira?: string;
  modalidade?: string;
  tipoRepasse?: string;
  status: 'CONCILIADO' | 'SUGESTAO' | 'NOVO_EXTRATO';
  conciliacao?: any;
  sugestao?: any;
}

export const BankConciliationView: React.FC<BankConciliationViewProps> = ({ user, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'maquininha' | 'ifood' | 'pix' | 'conta-corrente'>('maquininha');
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [saldo, setSaldo] = useState<SaldoData | null>(null);
  const [resumo, setResumo] = useState<ResumoConciliacao | null>(null);
  const [maquininhaItens, setMaquininhaItens] = useState<ItemExtrato[]>([]);
  const [ifoodItens, setIfoodItens] = useState<ItemExtrato[]>([]);
  const [pixItens, setPixItens] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'CONCILIATED'>('ALL');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsConfig, setNeedsConfig] = useState<boolean>(false);
  const [pendenciasSistema, setPendenciasSistema] = useState<PendenciasSistema | null>(null);
  const [divergenciasAbertasCount, setDivergenciasAbertasCount] = useState<number>(0);
  const [isConfirmZerarOpen, setIsConfirmZerarOpen] = useState<boolean>(false);
  const [itemStatus, setItemStatus] = useState<ItemStatus | null>(null);
  const [ultimaExecucao, setUltimaExecucao] = useState<UltimaExecucao | null>(null);

  // Modal de configuração Open Finance (Pluggy)
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [configSaving, setConfigSaving] = useState<boolean>(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [cfgClientId, setCfgClientId] = useState<string>('');
  const [cfgClientSecret, setCfgClientSecret] = useState<string>('');
  const [cfgHasSecret, setCfgHasSecret] = useState<boolean>(false);
  const [cfgItemId, setCfgItemId] = useState<string>('');
  const [cfgAccountId, setCfgAccountId] = useState<string>('');

  // Modal de Conectar Novo Banco (Mercado Pago / Outros)
  const [isAddBankOpen, setIsAddBankOpen] = useState<boolean>(false);
  const [newBankStep, setNewBankStep] = useState<'idle' | 'link_ready'>('idle');
  const [newBankLoading, setNewBankLoading] = useState<boolean>(false);
  const [newBankItemId, setNewBankItemId] = useState<string>('');
  const [newBankAuthUrl, setNewBankAuthUrl] = useState<string>('');
  const [newBankError, setNewBankError] = useState<string | null>(null);

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
    } catch {}
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

  const carregarPainel = async (overrideAccountId?: string) => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const accFilter = overrideAccountId !== undefined ? overrideAccountId : selectedAccountId;
      const qs = accFilter ? `?accountId=${encodeURIComponent(accFilter)}` : '';
      const res = await fetch(`/api/bank-conciliation/painel${qs}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data.error || data.message || `Falha ao carregar dados do extrato bancário (HTTP ${res.status})`;
        throw new Error(msg);
      }

      if (data.pendenciasSistema) setPendenciasSistema(data.pendenciasSistema);
      if (data.divergenciasAbertasCount !== undefined) setDivergenciasAbertasCount(Number(data.divergenciasAbertasCount || 0));
      if (data.ultimaExecucao !== undefined) setUltimaExecucao(data.ultimaExecucao);
      if (data.itemStatus !== undefined) setItemStatus(data.itemStatus);

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
      const msg = err?.message || 'Erro ao sincronizar com o Open Finance';
      setErrorMessage(msg);
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarPainel();
  }, []);

  const handleChangeAccountRole = async (conta: ContaConectada, role: 'PRINCIPAL' | 'INVESTIMENTO' | 'SECUNDARIO') => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/bank-conciliation/accounts/${encodeURIComponent(conta.id)}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          itemId: conta.itemId || '',
          bankName: conta.nome,
          accountNumber: conta.numero,
          customLabel: conta.customLabel || null
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao atualizar papel da conta');
      }
      showToast(
        role === 'PRINCIPAL'
          ? `${conta.customLabel || conta.nome} definida como Conta Principal!`
          : role === 'INVESTIMENTO'
            ? `${conta.customLabel || conta.nome} marcada como Banco Investimento.`
            : `${conta.customLabel || conta.nome} marcada como Conta Secundária.`
      );
      await carregarPainel();
    } catch (err: any) {
      showToast(err?.message || 'Erro ao definir papel da conta');
    } finally {
      setActionLoading(false);
    }
  };

  const handleGerarLinkNovoBanco = async () => {
    setNewBankError(null);
    try {
      setNewBankLoading(true);
      const res = await fetch('/api/bank-conciliation/gerar-link-conexao', {
        method: 'POST'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao gerar link de autorização');
      }
      setNewBankItemId(data.itemId);
      setNewBankAuthUrl(data.authUrl);
      setNewBankStep('link_ready');
    } catch (err: any) {
      setNewBankError(err?.message || 'Não foi possível gerar o link.');
    } finally {
      setNewBankLoading(false);
    }
  };

  const handleConfirmarNovoBanco = async () => {
    setNewBankError(null);
    try {
      setNewBankLoading(true);
      const res = await fetch('/api/bank-conciliation/confirmar-conexao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: newBankItemId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Autorização ainda não finalizada.');
      }
      setIsAddBankOpen(false);
      setNewBankStep('idle');
      setNewBankItemId('');
      setNewBankAuthUrl('');
      showToast('Nova conta bancária sincronizada com sucesso!');
      await carregarPainel();
    } catch (err: any) {
      setNewBankError(err?.message || 'Erro ao confirmar conexão.');
    } finally {
      setNewBankLoading(false);
    }
  };

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
          notes: item.sugestao ? `Conciliado com ${item.sugestao.id}` : 'Confirmado via Extrato Bancário'
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
      const endpoint = needsConfig
        ? '/api/bank-conciliation/zerar-pendencias'
        : '/api/bank-conciliation/auto-conciliar-tudo';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: user.name || 'Robô Open Finance' })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha na conciliação automática');

      setIsConfirmZerarOpen(false);
      const sis = data.sistema || data;
      const msg = data.message || `Pendências zeradas: ${sis.totalCardsBaixados || 0} maquininhas e ${sis.totalIFoodBaixados || 0} iFood conciliados!`;
      showToast(msg);
      await carregarPainel();
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Erro na conciliação automática');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRodarAuditoria = async () => {
    try {
      setActionLoading(true);
      const res = await fetch('/api/bank-conciliation/executar-rotina-diaria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enviarWhatsapp: false })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao executar auditoria');
      const qtdAlertas = Array.isArray(data.alertas) ? data.alertas.length : 0;
      showToast(
        qtdAlertas > 0
          ? `Auditoria concluída: ${qtdAlertas} divergência(s) registrada(s) na página de Alertas.`
          : 'Auditoria diária concluída: tudo certo (0 alertas).'
      );
      await carregarPainel();
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Erro ao rodar auditoria');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDateTimeBR = (iso?: string | null) => {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '-';
    }
  };

  const filtrarLista = (itens: ItemExtrato[]) => {
    return itens.filter(item => {
      const matchSearch = item.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.data.includes(searchTerm) ||
        item.valor.toFixed(2).includes(searchTerm);

      if (!matchSearch) return false;
      if (statusFilter === 'PENDING') return item.status !== 'CONCILIADO';
      if (statusFilter === 'CONCILIATED') return item.status === 'CONCILIADO';
      return true;
    });
  };

  const maquininhaFiltrada = filtrarLista(maquininhaItens);
  const ifoodFiltrado = filtrarLista(ifoodItens);

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-emerald-400">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span className="font-medium text-sm">{toastMessage}</span>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-800/40 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold rounded-full flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-amber-400" />
                Open Finance • Contas Bancárias
              </span>
              <span className="text-xs text-slate-300">
                Principal: <strong>{saldo?.contaPrincipal?.customLabel || saldo?.contaPrincipal?.nome || (needsConfig ? 'Não configurada' : '-')}</strong>
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Conta Corrente & Conciliação Bancária
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Gestão unificada das contas conectadas, classificação Conta Principal vs. Investimento e conciliação de Maquininha, iFood e Pix.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={openConfigModal}
              className="p-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition flex items-center gap-2 text-xs font-semibold"
              title="Configurar Open Finance (Pluggy)"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Configurar</span>
            </button>

            <button
              onClick={handleRodarAuditoria}
              disabled={loading || actionLoading || needsConfig}
              className="p-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition flex items-center gap-2 text-xs font-semibold disabled:opacity-50"
              title="Executar Auditoria Diária Agora"
            >
              <Bot className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Rodar Auditoria</span>
            </button>

            <button
              onClick={() => carregarPainel()}
              disabled={loading || actionLoading}
              className="p-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition flex items-center gap-2 text-xs font-semibold disabled:opacity-50"
              title="Atualizar Extrato Agora"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>

            <button
              onClick={handleAutoConciliarTudo}
              disabled={
                loading ||
                actionLoading ||
                ((resumo?.totalMaquininhaPendente || 0) === 0 &&
                  (resumo?.totalIFoodPendente || 0) === 0 &&
                  (pendenciasSistema?.cardDueCount || 0) === 0 &&
                  (pendenciasSistema?.ifoodDueCount || 0) === 0)
              }
              className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl shadow-lg shadow-emerald-900/30 font-semibold text-xs flex items-center gap-2 transition disabled:opacity-50"
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
              <span>Saldo Conta Principal</span>
              <Star className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {saldo ? `R$ ${Number(saldo.saldoPrincipal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00'}
            </div>
            <div className="text-[11px] text-slate-300 mt-1 flex items-center justify-between">
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Alimenta Caixa Inteligente
              </span>
              {saldo && saldo.saldoInvestimento > 0 && (
                <span className="text-sky-300">
                  Inv.: R$ {saldo.saldoInvestimento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>Maquininhas no Extrato</span>
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

      {/* Painel de Contas Bancárias Conectadas (Multi-Banco + Papel Principal/Investimento) */}
      {!needsConfig && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-sm md:text-base flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-500" />
                Contas Bancárias Conectadas ({saldo?.contas?.length || 0})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <strong>Conta Principal:</strong> recebe Pix/maquininhas, paga contas e sincroniza o Saldo Conta Banco • <strong>Investimento:</strong> reserva por prazo definido.
              </p>
            </div>
            <button
              onClick={() => {
                setNewBankError(null);
                setNewBankStep('idle');
                setIsAddBankOpen(true);
              }}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition shrink-0 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Conectar Novo Banco (Mercado Pago / Outros)</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {(saldo?.contas || []).map((c) => {
              const isPrincipal = c.role === 'PRINCIPAL';
              const isInvest = c.role === 'INVESTIMENTO';
              return (
                <div
                  key={c.id}
                  className={`rounded-xl border p-4 flex flex-col justify-between gap-3 transition ${
                    isPrincipal
                      ? 'border-amber-400/70 bg-amber-50/40 dark:bg-amber-950/20'
                      : isInvest
                        ? 'border-sky-400/70 bg-sky-50/40 dark:bg-sky-950/20'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {c.customLabel || c.nome}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isPrincipal
                            ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                            : isInvest
                              ? 'bg-sky-500/20 text-sky-700 dark:text-sky-300'
                              : 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
                        }`}>
                          {isPrincipal ? 'Conta Principal' : isInvest ? 'Investimento' : 'Secundário'}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        Conta: {c.numero || c.id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-extrabold font-mono text-slate-900 dark:text-white">
                        R$ {Number(c.saldo || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200/70 dark:border-slate-700/60">
                    <button
                      onClick={() => handleChangeAccountRole(c, 'PRINCIPAL')}
                      disabled={isPrincipal || actionLoading}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition ${
                        isPrincipal
                          ? 'bg-amber-500 text-white cursor-default'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-amber-400'
                      }`}
                    >
                      <Star className="w-3 h-3" />
                      <span>Principal</span>
                    </button>
                    <button
                      onClick={() => handleChangeAccountRole(c, 'INVESTIMENTO')}
                      disabled={isInvest || actionLoading}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition ${
                        isInvest
                          ? 'bg-sky-600 text-white cursor-default'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-sky-400'
                      }`}
                    >
                      <PiggyBank className="w-3 h-3" />
                      <span>Investimento</span>
                    </button>
                    <button
                      onClick={() => handleChangeAccountRole(c, 'SECUNDARIO')}
                      disabled={c.role === 'SECUNDARIO' || actionLoading}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                        c.role === 'SECUNDARIO'
                          ? 'bg-slate-600 text-white cursor-default'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400'
                      }`}
                    >
                      Secundário
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
              onClick={() => carregarPainel()}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Barra da Rotina Diária + Atalho para Página de Alertas de Divergência */}
      {!needsConfig && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 rounded-2xl px-4 py-3 border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
                <Bot className="w-4 h-4 text-indigo-500" />
                Robô diário ativo (11h30)
              </span>
              {ultimaExecucao ? (
                <span className={`px-2 py-0.5 rounded-full font-semibold ${
                  ultimaExecucao.status === 'OK'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : ultimaExecucao.status === 'ALERTA'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                }`}>
                  Última auditoria ({formatDateTimeBR(ultimaExecucao.createdAt)}): {ultimaExecucao.status}
                </span>
              ) : (
                <span className="text-slate-400">Aguardando primeira execução automática</span>
              )}
            </div>
            {itemStatus && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span>Sync: <strong>{formatDateTimeBR(itemStatus.lastUpdatedAt)}</strong></span>
                <span>•</span>
                <span>Próxima: <strong>{formatDateTimeBR(itemStatus.nextAutoSyncAt)}</strong></span>
              </div>
            )}
          </div>

          <button
            onClick={() => onNavigate?.('bank-divergence-alerts')}
            className={`rounded-2xl px-4 py-3 border flex items-center justify-between gap-3 text-left transition ${
              divergenciasAbertasCount > 0
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-200 hover:bg-rose-500/15'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/15'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <ShieldAlert className={`w-5 h-5 shrink-0 ${divergenciasAbertasCount > 0 ? 'text-rose-500' : 'text-emerald-500'}`} />
              <div>
                <p className="text-xs font-bold">
                  Alertas de Divergência
                </p>
                <p className="text-[11px] opacity-90">
                  {divergenciasAbertasCount > 0
                    ? `${divergenciasAbertasCount} alerta(s) pendente(s) por categoria`
                    : 'Nenhuma divergência pendente'}
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      )}

      {/* Banner de Pendências Vencidas de Maquininha & iFood no Sistema */}
      {pendenciasSistema && (
        (pendenciasSistema.cardDueCount > 0 || pendenciasSistema.ifoodDueCount > 0) ? (
          <div className="rounded-2xl p-4 border bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-amber-500" />
              <div className="text-sm">
                <p className="font-semibold">
                  Pendências vencidas em aberto gerando alertas no sistema
                </p>
                <p className="text-xs opacity-90 mt-0.5">
                  Maquininhas: <strong>{pendenciasSistema.cardDueCount}</strong> item(ns) (R$ {pendenciasSistema.cardDueGross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                  {' • '}
                  iFood: <strong>{pendenciasSistema.ifoodDueCount}</strong> venda(s) (R$ {pendenciasSistema.ifoodDueNet.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsConfirmZerarOpen(true)}
              disabled={actionLoading}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shrink-0 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Conciliar e Zerar Pendências</span>
            </button>
          </div>
        ) : (
          <div className="rounded-2xl px-4 py-3 border bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>0 pendências vencidas de Maquininha e iFood (alertas zerados)</span>
            </div>
            {(pendenciasSistema.ifoodFutureCount > 0 || pendenciasSistema.cardFutureCount > 0) && (
              <span className="opacity-85">
                Agendados futuros: {pendenciasSistema.cardFutureCount} maquininha(s) • {pendenciasSistema.ifoodFutureCount} iFood (R$ {pendenciasSistema.ifoodFutureNet.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
              </span>
            )}
          </div>
        )
      )}

      {/* Navegação por Abas */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('maquininha')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-2 ${
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
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-2 ${
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
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-2 ${
              activeTab === 'pix'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Pix Balcão ({resumo?.qtdPix || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('conta-corrente')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-2 ${
              activeTab === 'conta-corrente'
                ? 'bg-slate-800 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Conta Corrente (Livro Interno)</span>
          </button>
        </div>

        {/* Barra de Filtro e Busca */}
        {activeTab !== 'conta-corrente' && (
          <div className="flex flex-wrap items-center gap-2">
            {saldo && saldo.contas.length > 0 && (
              <select
                value={selectedAccountId}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedAccountId(val);
                  carregarPainel(val);
                }}
                className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Conta Principal ({saldo.contaPrincipal?.customLabel || saldo.contaPrincipal?.nome || 'Padrão'})</option>
                <option value="ALL">Todas as Contas</option>
                {saldo.contas.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.customLabel || c.nome} ({c.numero})
                  </option>
                ))}
              </select>
            )}

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar descrição, valor ou data..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48 sm:w-56"
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
        )}
      </div>

      {/* Conteúdo da Aba: MAQUININHAS */}
      {activeTab === 'maquininha' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-indigo-500" />
              Repasses de Maquininhas creditados no extrato
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
              Repasses Semanais do iFood creditados no extrato
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

      {/* Conteúdo da Aba: CONTA CORRENTE (LIVRO INTERNO UNIFICADO) */}
      {activeTab === 'conta-corrente' && (
        <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6">
          <CheckingAccount user={user} embedded />
        </div>
      )}

      {/* Modal: Conectar Novo Banco (Mercado Pago / Outros) */}
      {isAddBankOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 dark:text-white text-base">
                    Sincronizar Nova Conta (Mercado Pago / Outros)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Libera contas recém-adicionadas no Meu Pluggy para aparecerem aqui.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddBankOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {newBankError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{newBankError}</span>
              </div>
            )}

            {newBankStep === 'idle' ? (
              <div className="space-y-4">
                <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p><strong>Por que o Mercado Pago ainda não apareceu?</strong></p>
                  <p>
                    Quando você adiciona uma conta nova lá no <strong>meu.pluggy.ai</strong> depois da autorização inicial, é preciso gerar uma nova autorização OAuth marcando também essa nova conta.
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsAddBankOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleGerarLinkNovoBanco}
                    disabled={newBankLoading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>{newBankLoading ? 'Gerando link...' : 'Gerar Link de Autorização'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2">
                  <p><strong>1.</strong> Clique abaixo para abrir a autorização do Meu Pluggy e selecione o <strong>Mercado Pago</strong> (e as demais contas que desejar):</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <a
                      href={newBankAuthUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Abrir Autorização Meu Pluggy</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(newBankAuthUrl);
                        showToast('Link copiado!');
                      }}
                      className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar Link</span>
                    </button>
                  </div>
                  <p className="pt-2"><strong>2.</strong> Após autorizar na tela do Meu Pluggy, clique em <strong>Confirmar Conexão</strong> abaixo:</p>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => setIsAddBankOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                  >
                    Fechar
                  </button>
                  <button
                    onClick={handleConfirmarNovoBanco}
                    disabled={newBankLoading}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>{newBankLoading ? 'Verificando...' : 'Confirmar Conexão'}</span>
                  </button>
                </div>
              </div>
            )}
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

      {/* Modal de Confirmação para Conciliar e Zerar Pendências */}
      {isConfirmZerarOpen && pendenciasSistema && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <h2 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                Conciliar e Zerar Pendências
              </h2>
              <button
                onClick={() => setIsConfirmZerarOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Esta ação conciliará as entradas do extrato bancário e dará baixa em todas as pendências vencidas até hoje ({pendenciasSistema.today.split('-').reverse().join('/')}):
            </p>
            <ul className="mt-3 space-y-1.5 text-xs bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
              <li>• <strong>Maquininhas:</strong> {pendenciasSistema.cardDueCount} recebível(eis) pendente(s) (R$ {pendenciasSistema.cardDueGross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</li>
              <li>• <strong>iFood:</strong> {pendenciasSistema.ifoodDueCount} venda(s) vencida(s) (R$ {pendenciasSistema.ifoodDueNet.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</li>
              <li className="text-slate-500 dark:text-slate-400 pt-1">Recebíveis com vencimento futuro não serão alterados.</li>
            </ul>
            <div className="flex items-center justify-end gap-2 mt-5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsConfirmZerarOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAutoConciliarTudo}
                disabled={actionLoading}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{actionLoading ? 'Conciliando...' : 'Confirmar e Zerar'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default BankConciliationView;
