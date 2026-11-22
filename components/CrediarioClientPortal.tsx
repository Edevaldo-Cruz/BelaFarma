import React, { useEffect, useId, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Lock,
  MessageCircle,
  Printer,
  QrCode,
  Receipt,
  Search,
  ShieldCheck,
  ShoppingBag,
  Unlock,
  User as UserIcon
} from 'lucide-react';

export interface CrediarioClientPortalProps {
  initialToken?: string;
  legacyInvoiceId?: string;
}

interface PortalAccountData {
  firstName: string;
  accountStatus: 'em_dia' | 'vencido' | 'zerado' | 'bloqueado' | string;
  dueDay: number;
  dueDayMode: 'auto' | 'fixed' | string;
  unlockMethod: 'cpf' | 'phone' | 'none';
  maskedHint: string;
  financials: {
    principalBalance: number;
    overduePrincipal: number;
    lateFine: number;
    lateInterest: number;
    totalCharges: number;
    chargesApplied: boolean;
    interestExempt: boolean;
    totalBalance: number;
    maxDaysLate: number;
    overdueCount: number;
    openItemsCount: number;
    nextDueDate: string;
    isBlocked: boolean;
    accountStatus: string;
  };
  pix: {
    pixKey: string;
    merchantName: string;
    merchantCity: string;
    brcode: string;
  };
  storeWhatsapp: string;
  storeName: string;
  storeCnpj: string;
}

interface UnlockedStatement {
  fullName: string;
  simpleStatement: {
    milestone: {
      type: 'zeroed' | 'last_payment' | 'opening' | string;
      date?: string;
      label: string;
      sublabel: string;
    };
    purchaseGroups: Array<{
      key: string;
      date: string;
      saleId?: string;
      buyerName?: string;
      dueDate?: string;
      daysLate?: number;
      subtotal: number;
      items: Array<{
        id: string;
        productName: string;
        presentation?: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
      }>;
    }>;
  };
}

function formatCurrency(val: number | undefined | null): string {
  const num = Number(val || 0);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBR(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const clean = String(dateStr).trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const [y, m, d] = clean.split('-');
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(dateStr);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toLocaleDateString('pt-BR');
  }
  return String(dateStr);
}

function formatWhatsappHref(storePhone: string, text: string): string | null {
  const digits = String(storePhone || '').replace(/\D/g, '');
  if (!digits) return null;
  const fullNumber = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${fullNumber}?text=${encodeURIComponent(text)}`;
}

async function copyTextSafe(text: string): Promise<boolean> {
  if (!text) return false;
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback abaixo
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export const CrediarioClientPortal: React.FC<CrediarioClientPortalProps> = ({
  initialToken = '',
  legacyInvoiceId = ''
}) => {
  const uid = useId();
  const lookupInputId = `${uid}-lookup-identifier`;
  const customAmountInputId = `${uid}-custom-amount`;
  const unlockInputId = `${uid}-unlock-digits`;

  const [activeToken, setActiveToken] = useState<string>(initialToken);
  const [resolvingLegacy, setResolvingLegacy] = useState<boolean>(
    Boolean(legacyInvoiceId && !initialToken)
  );
  const [legacyError, setLegacyError] = useState<string>('');

  // Estado do modo busca (/crediario)
  const [lookupInput, setLookupInput] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');

  // Estado da conta (/minha-conta/:token)
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [account, setAccount] = useState<PortalAccountData | null>(null);

  // Estado de desbloqueio leve (LGPD)
  const [unlockDigits, setUnlockDigits] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const [unlockedData, setUnlockedData] = useState<UnlockedStatement | null>(null);

  // Estado PIX (total ou outro valor)
  const [pixMode, setPixMode] = useState<'total' | 'partial'>('total');
  const [partialAmountInput, setPartialAmountInput] = useState('');
  const [activePixAmount, setActivePixAmount] = useState<number>(0);
  const [activeBrcode, setActiveBrcode] = useState<string>('');
  const [pixLoading, setPixLoading] = useState(false);
  const [pixError, setPixError] = useState('');
  const [pixCopied, setPixCopied] = useState(false);

  useEffect(() => {
    document.title = account
      ? `Crediário de ${unlockedData?.fullName || account.firstName} | Bela Farma`
      : 'Meu Crediário | Bela Farma';
  }, [account, unlockedData]);

  // Resolver link legado (/fatura/:invoiceId -> /minha-conta/:token)
  useEffect(() => {
    if (!legacyInvoiceId || initialToken) {
      setResolvingLegacy(false);
      return;
    }

    let cancelled = false;
    setResolvingLegacy(true);
    setLegacyError('');

    fetch(`/api/crediario-v2/public/by-invoice/${encodeURIComponent(legacyInvoiceId)}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok || !data.success || !data.token) {
          throw new Error(data.error || 'Não foi possível localizar esta fatura antiga.');
        }
        if (!cancelled) {
          setActiveToken(data.token);
          try {
            window.history.replaceState({}, '', `/minha-conta/${data.token}`);
          } catch {
            // ignora erro de history em iframe/sandbox
          }
        }
      })
      .catch(err => {
        if (!cancelled) {
          setLegacyError(err?.message || 'Link inválido ou expirado.');
        }
      })
      .finally(() => {
        if (!cancelled) setResolvingLegacy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [legacyInvoiceId, initialToken]);

  // Carregar conta quando houver token ativo
  useEffect(() => {
    if (!activeToken) {
      setAccount(null);
      setUnlockedData(null);
      setAccountError('');
      return;
    }

    let cancelled = false;
    setLoadingAccount(true);
    setAccountError('');
    setUnlockedData(null);
    setUnlockDigits('');
    setUnlockError('');
    setPixMode('total');
    setPartialAmountInput('');
    setPixError('');

    fetch(`/api/crediario-v2/public/account/${encodeURIComponent(activeToken)}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok || !data.success || !data.account) {
          throw new Error(data.error || 'Não foi possível carregar sua conta no crediário.');
        }
        if (cancelled) return;

        const loaded: PortalAccountData = data.account;
        setAccount(loaded);
        setActivePixAmount(Number(loaded.financials?.totalBalance || 0));
        setActiveBrcode(loaded.pix?.brcode || '');

        if (loaded.unlockMethod === 'none') {
          // Conta sem CPF/telefone cadastrado: desbloqueia automaticamente o extrato
          try {
            const unlockRes = await fetch(
              `/api/crediario-v2/public/account/${encodeURIComponent(activeToken)}/unlock`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ digits: '' })
              }
            );
            const unlockJson = await unlockRes.json();
            if (!cancelled && unlockRes.ok && unlockJson.success) {
              setUnlockedData({
                fullName: unlockJson.fullName || loaded.firstName,
                simpleStatement: unlockJson.simpleStatement
              });
            }
          } catch {
            // mantém bloqueado para tentativa manual se falhar
          }
        }
      })
      .catch(err => {
        if (!cancelled) {
          setAccountError(err?.message || 'Erro de conexão ao consultar sua conta.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAccount(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeToken]);

  const handleLookupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupError('');

    const digits = lookupInput.replace(/\D/g, '');
    if (digits.length < 8) {
      setLookupError('Por favor, digite seu CPF completo ou telefone com DDD.');
      return;
    }

    setLookupLoading(true);
    try {
      const res = await fetch('/api/crediario-v2/public/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: lookupInput })
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.token) {
        setLookupError(
          data.error ||
            'Não encontramos nenhuma conta com este CPF ou telefone. Confira os números ou fale com a farmácia.'
        );
        return;
      }

      setActiveToken(data.token);
      setLookupInput('');
      try {
        window.history.pushState({}, '', `/minha-conta/${data.token}`);
      } catch {
        // ignora
      }
    } catch {
      setLookupError('Sem conexão com o servidor no momento. Tente novamente em instantes.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleResetToLookup = () => {
    setActiveToken('');
    setAccount(null);
    setAccountError('');
    setLegacyError('');
    setUnlockedData(null);
    try {
      window.history.pushState({}, '', '/crediario');
    } catch {
      // ignora
    }
  };

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account || !activeToken) return;

    const cleanDigits = unlockDigits.replace(/\D/g, '');
    const requiredLen = account.unlockMethod === 'cpf' ? 3 : account.unlockMethod === 'phone' ? 4 : 0;

    if (requiredLen > 0 && cleanDigits.length !== requiredLen) {
      setUnlockError(
        account.unlockMethod === 'cpf'
          ? 'Digite exatamente os 3 primeiros números do seu CPF.'
          : 'Digite exatamente os 4 últimos números do seu telefone.'
      );
      return;
    }

    setUnlockLoading(true);
    setUnlockError('');
    try {
      const res = await fetch(
        `/api/crediario-v2/public/account/${encodeURIComponent(activeToken)}/unlock`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ digits: cleanDigits })
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setUnlockError(data.error || 'Os números informados não conferem com o cadastro.');
        return;
      }

      setUnlockedData({
        fullName: data.fullName || account.firstName,
        simpleStatement: data.simpleStatement
      });
    } catch {
      setUnlockError('Erro ao verificar os dígitos. Tente novamente.');
    } finally {
      setUnlockLoading(false);
    }
  };

  const handleSelectTotalPix = () => {
    if (!account) return;
    setPixMode('total');
    setPixError('');
    setActivePixAmount(Number(account.financials.totalBalance || 0));
    setActiveBrcode(account.pix.brcode || '');
    setPixCopied(false);
  };

  const handleGeneratePartialPix = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account || !activeToken) return;
    setPixError('');

    const parsed = Number(partialAmountInput.replace(/\./g, '').replace(',', '.').trim());
    if (!Number.isFinite(parsed) || parsed < 1) {
      setPixError('Informe um valor válido de pelo menos R$ 1,00.');
      return;
    }

    setPixLoading(true);
    try {
      const res = await fetch(
        `/api/crediario-v2/public/account/${encodeURIComponent(activeToken)}/pix`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: parsed })
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success || !data.brcode) {
        setPixError(data.error || 'Não foi possível gerar o PIX para este valor.');
        return;
      }
      setActivePixAmount(Number(data.amount || parsed));
      setActiveBrcode(data.brcode);
      setPixCopied(false);
    } catch {
      setPixError('Erro de conexão ao gerar o novo PIX.');
    } finally {
      setPixLoading(false);
    }
  };

  const handleCopyPix = async () => {
    if (!activeBrcode) return;
    const ok = await copyTextSafe(activeBrcode);
    if (ok) {
      setPixCopied(true);
      setTimeout(() => setPixCopied(false), 5000);
    } else {
      setPixError('Não foi possível copiar automaticamente. Selecione o código acima e copie.');
    }
  };

  const whatsappReceiptLink = useMemo(() => {
    if (!account) return null;
    const nameToDisplay = unlockedData?.fullName || account.firstName;
    const msg =
      `Olá ${account.storeName || 'Bela Farma'}! Acabei de fazer um pagamento via PIX no valor de ${formatCurrency(
        activePixAmount || account.financials.totalBalance
      )} referente ao crediário de ${nameToDisplay}. Segue meu comprovante:`;
    return formatWhatsappHref(account.storeWhatsapp, msg);
  }, [account, unlockedData, activePixAmount]);

  const statusBadge = useMemo(() => {
    if (!account) return null;
    const st = account.accountStatus;
    if (st === 'zerado') {
      return {
        label: 'Conta Zerada',
        className: 'bg-emerald-100 text-emerald-900 border-emerald-300',
        Icon: CheckCircle2
      };
    }
    if (st === 'vencido') {
      return {
        label:
          account.financials.maxDaysLate > 0
            ? `Em Atraso (${account.financials.maxDaysLate} dia${account.financials.maxDaysLate > 1 ? 's' : ''})`
            : 'Vencimento em Atraso',
        className: 'bg-red-100 text-red-900 border-red-300',
        Icon: AlertCircle
      };
    }
    if (st === 'bloqueado') {
      return {
        label: 'Atenção na Conta — Fale com a Farmácia',
        className: 'bg-amber-100 text-amber-950 border-amber-300',
        Icon: AlertCircle
      };
    }
    return {
      label: 'Crediário em Dia',
      className: 'bg-sky-100 text-sky-900 border-sky-300',
      Icon: Clock
    };
  }, [account]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 print:static">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-red-600 text-white flex items-center justify-center font-black text-xl shrink-0 shadow-sm">
              BF
            </div>
            <div className="min-w-0">
              <p className="text-lg font-extrabold text-slate-900 leading-tight truncate">
                {account?.storeName || 'Bela Farma'}
              </p>
              <p className="text-sm text-slate-600 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Portal Seguro do Crediário</span>
              </p>
            </div>
          </div>

          {activeToken && (
            <button
              type="button"
              onClick={handleResetToLookup}
              className="print:hidden min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold flex items-center gap-1.5 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Outra Conta</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6 space-y-6">
        {resolvingLegacy && (
          <section
            aria-label="Carregando fatura"
            role="status"
            className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm"
          >
            <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-900">Localizando sua conta...</h1>
            <p className="text-base text-slate-600 mt-1">
              Estamos redirecionando seu link para o portal atualizado da Bela Farma.
            </p>
          </section>
        )}

        {!resolvingLegacy && legacyError && !activeToken && (
          <section
            role="alert"
            className="bg-white rounded-2xl border border-red-200 p-6 shadow-sm space-y-4"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h1 className="text-xl font-bold text-slate-900">Link antigo não encontrado</h1>
                <p className="text-base text-slate-700 mt-1">{legacyError}</p>
              </div>
            </div>
            <p className="text-base text-slate-700">
              Você pode consultar sua conta abaixo digitando seu CPF ou número de telefone.
            </p>
          </section>
        )}

        {/* MODO 1: CONSULTA RÁPIDA (/crediario) */}
        {!resolvingLegacy && !activeToken && (
          <section
            aria-labelledby={`${uid}-lookup-heading`}
            className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6"
          >
            <div className="space-y-2">
              <h1 id={`${uid}-lookup-heading`} className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                Consultar Meu Crediário
              </h1>
              <p className="text-base sm:text-lg text-slate-700 leading-relaxed">
                Veja seu saldo atualizado, data de vencimento, extrato simples das compras e código PIX para pagamento.
              </p>
            </div>

            <form onSubmit={handleLookupSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor={lookupInputId}
                  className="block text-base font-bold text-slate-900 mb-2"
                >
                  Digite seu CPF ou Telefone (com DDD)
                </label>
                <input
                  id={lookupInputId}
                  type="text"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={lookupInput}
                  onChange={e => setLookupInput(e.target.value)}
                  placeholder="Ex: 000.000.000-00 ou (18) 99999-9999"
                  className="w-full min-h-[54px] px-4 py-3 text-lg rounded-xl border-2 border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-red-600 focus:outline-none"
                />
              </div>

              {lookupError && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 text-base font-medium flex items-start gap-2.5"
                >
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <span>{lookupError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={lookupLoading}
                className="w-full min-h-[54px] px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-lg font-bold flex items-center justify-center gap-2.5 shadow-sm transition-colors"
              >
                <Search className="w-5 h-5" />
                <span>{lookupLoading ? 'Consultando...' : 'Ver Minha Conta'}</span>
              </button>
            </form>
          </section>
        )}

        {/* MODO 2: CARREGANDO / ERRO DA CONTA */}
        {!resolvingLegacy && activeToken && loadingAccount && (
          <section
            role="status"
            aria-label="Carregando dados da conta"
            className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm"
          >
            <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h1 className="text-xl font-bold text-slate-900">Abrindo seu crediário...</h1>
            <p className="text-base text-slate-600 mt-1">Buscando saldo atualizado e informações.</p>
          </section>
        )}

        {!resolvingLegacy && activeToken && !loadingAccount && accountError && (
          <section
            role="alert"
            className="bg-white rounded-2xl border border-red-200 p-6 sm:p-8 shadow-sm space-y-5"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-7 h-7 text-red-600 shrink-0" />
              <div>
                <h1 className="text-xl font-bold text-slate-900">Não foi possível abrir esta conta</h1>
                <p className="text-base text-slate-700 mt-1">{accountError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetToLookup}
              className="w-full min-h-[52px] px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-base font-bold flex items-center justify-center gap-2"
            >
              <Search className="w-5 h-5" />
              <span>Consultar por CPF ou Telefone</span>
            </button>
          </section>
        )}

        {/* MODO 3: PORTAL DA CONTA DO CLIENTE */}
        {!resolvingLegacy && activeToken && !loadingAccount && account && (
          <>
            {/* Resumo da Conta */}
            <section
              aria-labelledby={`${uid}-account-heading`}
              className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                    <UserIcon className="w-4 h-4" />
                    <span>Crediário Pessoal</span>
                  </p>
                  <h1
                    id={`${uid}-account-heading`}
                    className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1"
                  >
                    Olá, {unlockedData?.fullName || account.firstName}!
                  </h1>
                </div>

                {statusBadge && (
                  <span
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-sm font-bold ${statusBadge.className}`}
                  >
                    <statusBadge.Icon className="w-4 h-4 shrink-0" />
                    <span>{statusBadge.label}</span>
                  </span>
                )}
              </div>

              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5 space-y-3">
                <p className="text-base font-semibold text-slate-700">
                  {account.financials.totalBalance <= 0 ? 'Situação Atual' : 'Valor Total em Aberto'}
                </p>
                <p className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">
                  {formatCurrency(account.financials.totalBalance)}
                </p>

                {account.financials.totalCharges > 0 && (
                  <div className="pt-2 border-t border-slate-200 text-base text-slate-700 space-y-1">
                    <p className="flex justify-between gap-2">
                      <span>Compras em aberto:</span>
                      <strong className="tabular-nums">
                        {formatCurrency(account.financials.principalBalance)}
                      </strong>
                    </p>
                    <p className="flex justify-between gap-2 text-red-800">
                      <span>Multa e juros por atraso:</span>
                      <strong className="tabular-nums">
                        + {formatCurrency(account.financials.totalCharges)}
                      </strong>
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-50 text-red-700 flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-600">Vencimento</p>
                    {account.financials.principalBalance <= 0 ? (
                      <p className="text-base font-bold text-emerald-800">
                        Nenhum vencimento pendente
                      </p>
                    ) : account.financials.nextDueDate ? (
                      <p className="text-lg font-extrabold text-slate-900">
                        {formatDateBR(account.financials.nextDueDate)}
                        {account.dueDayMode === 'fixed' && (
                          <span className="text-sm font-medium text-slate-600 ml-1.5">
                            (todo dia {account.dueDay})
                          </span>
                        )}
                      </p>
                    ) : (
                      <p className="text-lg font-extrabold text-slate-900">
                        Todo dia {account.dueDay}
                      </p>
                    )}
                  </div>
                </div>

                {unlockedData && (
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="print:hidden min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 text-sm font-bold flex items-center justify-center gap-2"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Imprimir Extrato</span>
                  </button>
                )}
              </div>
            </section>

            {/* Área PIX para Pagamento */}
            {account.financials.totalBalance > 0 && (
              <section
                aria-labelledby={`${uid}-pix-heading`}
                className="print:hidden bg-white rounded-2xl border border-emerald-200 p-6 sm:p-7 shadow-sm space-y-5"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                    <QrCode className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 id={`${uid}-pix-heading`} className="text-xl font-extrabold text-slate-900">
                      Pagar com PIX
                    </h2>
                    <p className="text-base text-slate-600">
                      Rápido, seguro e sem precisar digitar dados do banco.
                    </p>
                  </div>
                </div>

                <fieldset className="space-y-3">
                  <legend className="text-base font-bold text-slate-900 mb-2">
                    Quanto você deseja pagar agora?
                  </legend>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={handleSelectTotalPix}
                      className={`min-h-[54px] px-4 py-3 rounded-xl border-2 text-left transition-colors ${
                        pixMode === 'total'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                          : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <span className="block text-sm font-semibold">Pagar Valor Total</span>
                      <span className="block text-lg font-extrabold tabular-nums">
                        {formatCurrency(account.financials.totalBalance)}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPixMode('partial');
                        setPixError('');
                      }}
                      className={`min-h-[54px] px-4 py-3 rounded-xl border-2 text-left transition-colors ${
                        pixMode === 'partial'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                          : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <span className="block text-sm font-semibold">Pagar Outro Valor</span>
                      <span className="block text-base font-bold">Escolher quanto pagar</span>
                    </button>
                  </div>
                </fieldset>

                {pixMode === 'partial' && (
                  <form
                    onSubmit={handleGeneratePartialPix}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
                  >
                    <label
                      htmlFor={customAmountInputId}
                      className="block text-base font-bold text-slate-900"
                    >
                      Digite o valor que deseja pagar (R$)
                    </label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        id={customAmountInputId}
                        type="text"
                        inputMode="decimal"
                        value={partialAmountInput}
                        onChange={e => setPartialAmountInput(e.target.value)}
                        placeholder="Ex: 50,00"
                        className="flex-1 min-h-[50px] px-4 py-2.5 text-lg font-bold rounded-xl border-2 border-slate-300 bg-white text-slate-900 focus:border-emerald-600 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={pixLoading}
                        className="min-h-[50px] px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-base font-bold shrink-0"
                      >
                        {pixLoading ? 'Gerando...' : 'Gerar Novo PIX'}
                      </button>
                    </div>
                  </form>
                )}

                {pixError && (
                  <div
                    role="alert"
                    className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-base font-medium"
                  >
                    {pixError}
                  </div>
                )}

                {activeBrcode ? (
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5 flex flex-col items-center text-center space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-600 uppercase tracking-wide">
                        PIX gerado no valor de
                      </p>
                      <p className="text-3xl font-black text-emerald-800 tabular-nums mt-0.5">
                        {formatCurrency(activePixAmount)}
                      </p>
                    </div>

                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                      <QRCodeSVG value={activeBrcode} size={210} level="M" includeMargin />
                    </div>

                    <div className="w-full space-y-2">
                      <button
                        type="button"
                        onClick={handleCopyPix}
                        className={`w-full min-h-[54px] px-5 py-3.5 rounded-xl text-base sm:text-lg font-extrabold flex items-center justify-center gap-2.5 shadow-sm transition-colors ${
                          pixCopied
                            ? 'bg-emerald-700 text-white'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        {pixCopied ? (
                          <>
                            <Check className="w-6 h-6 shrink-0" />
                            <span>PIX COPIADO! ABRA O APP DO SEU BANCO</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-5 h-5 shrink-0" />
                            <span>COPIAR CÓDIGO PIX</span>
                          </>
                        )}
                      </button>

                      <div role="status" aria-live="polite" className="sr-only">
                        {pixCopied
                          ? 'Código PIX copiado para a área de transferência. Agora abra o aplicativo do seu banco.'
                          : ''}
                      </div>

                      <details className="text-left pt-1">
                        <summary className="text-sm font-semibold text-slate-600 cursor-pointer hover:text-slate-900 py-1">
                          Ver código PIX Copia e Cola completo
                        </summary>
                        <p className="mt-2 p-3 rounded-lg bg-white border border-slate-200 font-mono text-xs break-all text-slate-700 select-all">
                          {activeBrcode}
                        </p>
                      </details>
                    </div>

                    <ol className="w-full text-left text-base text-slate-700 space-y-2 bg-white rounded-xl border border-slate-200 p-4 list-decimal list-inside">
                      <li>Toque no botão verde <strong>Copiar Código PIX</strong> acima.</li>
                      <li>Abra o aplicativo do seu banco, entre em <strong>PIX</strong> e escolha <strong>Pix Copia e Cola</strong>.</li>
                      <li>Confira o nome <strong>{account.pix.merchantName || account.storeName}</strong> e confirme o pagamento.</li>
                    </ol>

                    {whatsappReceiptLink ? (
                      <a
                        href={whatsappReceiptLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full min-h-[52px] px-5 py-3 rounded-xl border-2 border-emerald-600 bg-white hover:bg-emerald-50 text-emerald-800 text-base font-extrabold flex items-center justify-center gap-2.5 transition-colors"
                      >
                        <MessageCircle className="w-5 h-5 shrink-0" />
                        <span>Já Paguei — Enviar Comprovante no WhatsApp</span>
                      </a>
                    ) : (
                      <p className="text-sm text-slate-600">
                        Após pagar, envie o comprovante para o WhatsApp da {account.storeName || 'farmácia'}.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-base text-slate-700 bg-amber-50 border border-amber-200 rounded-xl p-4">
                    Chave PIX da loja ainda não configurada. Entre em contato com a farmácia para receber os dados de pagamento.
                  </p>
                )}
              </section>
            )}

            {/* Seção Extrato Simples (protegida por desbloqueio leve quando aplicável) */}
            <section
              aria-labelledby={`${uid}-statement-heading`}
              className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-sm space-y-5"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center shrink-0">
                  {unlockedData ? <Unlock className="w-6 h-6 text-emerald-700" /> : <Receipt className="w-6 h-6" />}
                </div>
                <div>
                  <h2 id={`${uid}-statement-heading`} className="text-xl font-extrabold text-slate-900">
                    Extrato Simples das Compras
                  </h2>
                  <p className="text-base text-slate-600">
                    Mostra somente o que está em aberto de forma clara e fácil de conferir.
                  </p>
                </div>
              </div>

              {!unlockedData && account.unlockMethod !== 'none' ? (
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5 sm:p-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <Lock className="w-6 h-6 text-slate-700 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h3 className="text-lg font-bold text-slate-900">
                        Confirmação rápida para sua privacidade
                      </h3>
                      <p className="text-base text-slate-700 leading-relaxed">
                        {account.unlockMethod === 'cpf' ? (
                          <>
                            Para ver os nomes dos medicamentos e quem retirou na farmácia, digite os{' '}
                            <strong>3 primeiros números do seu CPF</strong>.
                          </>
                        ) : (
                          <>
                            Para ver os nomes dos medicamentos e quem retirou na farmácia, digite os{' '}
                            <strong>4 últimos números do seu telefone</strong>.
                          </>
                        )}
                      </p>
                      {account.maskedHint && (
                        <p className="text-sm font-semibold text-slate-600">
                          Cadastro: <span className="font-mono">{account.maskedHint}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <form onSubmit={handleUnlockSubmit} className="space-y-3">
                    <label
                      htmlFor={unlockInputId}
                      className="block text-base font-bold text-slate-900"
                    >
                      {account.unlockMethod === 'cpf'
                        ? '3 primeiros dígitos do CPF'
                        : '4 últimos dígitos do telefone'}
                    </label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        id={unlockInputId}
                        type="text"
                        inputMode="numeric"
                        maxLength={account.unlockMethod === 'cpf' ? 3 : 4}
                        value={unlockDigits}
                        onChange={e => setUnlockDigits(e.target.value.replace(/\D/g, ''))}
                        placeholder={account.unlockMethod === 'cpf' ? 'Ex: 123' : 'Ex: 9876'}
                        className="sm:w-44 min-h-[52px] px-4 py-2.5 text-2xl font-extrabold tracking-[0.25em] text-center rounded-xl border-2 border-slate-300 bg-white text-slate-900 focus:border-red-600 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={unlockLoading}
                        className="flex-1 min-h-[52px] px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-base font-bold flex items-center justify-center gap-2"
                      >
                        <Unlock className="w-5 h-5" />
                        <span>{unlockLoading ? 'Conferindo...' : 'Desbloquear Extrato'}</span>
                      </button>
                    </div>

                    {unlockError && (
                      <div
                        role="alert"
                        aria-live="polite"
                        className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-base font-medium"
                      >
                        {unlockError}
                      </div>
                    )}
                  </form>
                </div>
              ) : unlockedData ? (
                <div className="space-y-4">
                  {/* Marco de Confiança */}
                  <div
                    className={`rounded-2xl border p-4 sm:p-5 ${
                      unlockedData.simpleStatement.milestone.type === 'zeroed'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                        : 'bg-sky-50 border-sky-200 text-sky-950'
                    }`}
                  >
                    <p className="text-base font-extrabold">
                      {unlockedData.simpleStatement.milestone.label}
                    </p>
                    <p className="text-base mt-1 leading-relaxed">
                      {unlockedData.simpleStatement.milestone.sublabel}
                    </p>
                  </div>

                  {/* Grupos de compras em aberto */}
                  {unlockedData.simpleStatement.purchaseGroups.length === 0 ? (
                    <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-6 text-center space-y-2">
                      <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                      <p className="text-lg font-extrabold text-emerald-950">
                        Nenhuma compra em aberto!
                      </p>
                      <p className="text-base text-emerald-900">
                        Sua conta no crediário está totalmente quitada até o momento.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {unlockedData.simpleStatement.purchaseGroups.map(group => (
                        <article
                          key={group.key}
                          className="rounded-2xl border border-slate-200 overflow-hidden bg-white"
                        >
                          <div className="bg-slate-50 border-b border-slate-200 px-4 py-3.5 flex flex-wrap items-center justify-between gap-2">
                            <div className="space-y-0.5">
                              <p className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                                <ShoppingBag className="w-4 h-4 text-red-600 shrink-0" />
                                <span>Compra de {formatDateBR(group.date)}</span>
                              </p>
                              {group.buyerName && (
                                <p className="text-sm font-medium text-slate-700">
                                  Retirado por: <strong>{group.buyerName}</strong>
                                </p>
                              )}
                            </div>
                            <div className="text-right">
                              <span className="block text-xs font-semibold uppercase text-slate-500">
                                Total da compra
                              </span>
                              <span className="text-lg font-extrabold text-slate-900 tabular-nums">
                                {formatCurrency(group.subtotal)}
                              </span>
                            </div>
                          </div>

                          <ul className="divide-y divide-slate-100">
                            {group.items.map(item => (
                              <li
                                key={item.id}
                                className="px-4 py-3 flex items-start justify-between gap-3"
                              >
                                <div className="min-w-0">
                                  <p className="text-base font-semibold text-slate-900">
                                    {item.productName}
                                  </p>
                                  <p className="text-sm text-slate-600">
                                    {item.quantity} {item.quantity > 1 ? 'unidades' : 'unidade'} ×{' '}
                                    {formatCurrency(item.unitPrice)}
                                  </p>
                                </div>
                                <span className="text-base font-bold text-slate-900 tabular-nums shrink-0">
                                  {formatCurrency(item.totalPrice)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-base text-slate-600">Carregando extrato...</div>
              )}
            </section>
          </>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 mt-auto print:hidden">
        <div className="max-w-2xl mx-auto px-4 py-5 text-center space-y-1 text-sm text-slate-600">
          <p className="font-bold text-slate-800">{account?.storeName || 'Bela Farma'}</p>
          {account?.storeCnpj && <p>CNPJ: {account.storeCnpj}</p>}
          <p>Dúvidas sobre sua conta? Procure nossa equipe no balcão ou pelo WhatsApp da loja.</p>
        </div>
      </footer>
    </div>
  );
};

export default CrediarioClientPortal;
