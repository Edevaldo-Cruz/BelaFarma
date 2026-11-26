import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  DollarSign,
  History,
  Lock,
  Printer,
  Search,
  ShoppingBag,
  Trash2,
  User as UserIcon,
  X
} from 'lucide-react';
import { useToast } from '../ToastContext';
import {
  imprimirComprovanteCaderninho,
  imprimirCupomVenda,
  imprimirDanfeNfce
} from '../../utils/thermalPrinter';

export interface CaderninhoCartItem {
  code: string;
  barcode: string;
  name: string;
  unit_price: number;
  unit_cost: number;
  quantity: number;
  discount: number;
  total_price: number;
  sale_price?: number;
  promo_price?: number;
  crediario_price?: number;
  promo_vista?: string;
  is_unregistered?: boolean;
}

export interface CaderninhoModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CaderninhoCartItem[];
  cartDiscount: number;
  cartTotal: number;
  currentSeller: { id: string; name: string; role?: string; jobRole?: string } | null;
  currentUser?: { id?: string; name?: string; role?: string } | null;
  autoPrintCupom?: boolean;
  isOfflineMode?: boolean;
  onEntryCreated: (summary: any) => void;
  onSummaryUpdated: (summary: any) => void;
}

interface CaderninhoEntry {
  id: string;
  person_id: string;
  original_total_amount?: number;
  total_amount: number;
  discount_value: number;
  paid_amount: number;
  remaining_amount: number;
  crediario_rule_enabled?: boolean;
  crediario_total_amount?: number;
  crediario_surcharge?: number;
  crediario_applied?: boolean;
  status: 'ABERTA' | 'PARCIAL' | 'PAGA' | 'CANCELADA' | string;
  items: Array<{
    code: string;
    name: string;
    quantity: number;
    unit_price: number;
    cash_unit_price?: number;
    crediario_unit_price?: number;
    total_price: number;
  }>;
  operator_name: string;
  created_at: string;
  created_ymd: string;
  days_open: number;
  is_today: boolean;
  is_overdue: boolean;
}

interface CaderninhoPersonRow {
  id: string;
  name: string;
  openBalance: number;
  openEntriesCount: number;
  oldestOpenDate: string | null;
  maxDaysOpen: number;
  isOverdue: boolean;
  exceededLimit: boolean;
  totalMovementsCount: number;
  lastMovementAt: string | null;
  entries: CaderninhoEntry[];
}

function normalizeNameClient(name: string): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function formatCurrency(val: number | undefined | null): string {
  return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateTimeBR(val?: string | null): string {
  if (!val) return '-';
  const normalized = String(val).includes('T') ? String(val) : String(val).replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function parseMoneyInput(raw: string): number {
  const clean = String(raw || '').trim();
  if (!clean) return NaN;
  if (clean.includes(',')) {
    return parseFloat(clean.replace(/\./g, '').replace(',', '.'));
  }
  return parseFloat(clean);
}

export const CaderninhoModal: React.FC<CaderninhoModalProps> = ({
  isOpen,
  onClose,
  cart,
  cartDiscount,
  cartTotal,
  currentSeller,
  currentUser,
  autoPrintCupom = true,
  isOfflineMode = false,
  onEntryCreated,
  onSummaryUpdated
}) => {
  const { addToast } = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const uid = useId();

  const isCurrentUserAdmin = useMemo(() => {
    const r1 = String(currentSeller?.role || '').toLowerCase();
    const r2 = String(currentUser?.role || '').toLowerCase();
    return r1.includes('admin') || r2.includes('admin');
  }, [currentSeller, currentUser]);

  const operatorName = currentSeller?.name || currentUser?.name || 'Caixa';

  const [activeTab, setActiveTab] = useState<'abertos' | 'historico'>('abertos');
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [allPeople, setAllPeople] = useState<CaderninhoPersonRow[]>([]);
  const [searchOpen, setSearchOpen] = useState('');
  const [searchHistory, setSearchHistory] = useState('');

  // Nova anotação (com carrinho atual)
  const [personNameInput, setPersonNameInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);

  // Receber / Pagar
  const [payPerson, setPayPerson] = useState<CaderninhoPersonRow | null>(null);
  const [payMode, setPayMode] = useState<'total' | 'entries' | 'partial'>('total');
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [partialAmountInput, setPartialAmountInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'DINHEIRO' | 'PIX' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO'>('DINHEIRO');
  const [amountReceivedInput, setAmountReceivedInput] = useState('');
  const [emitNfce, setEmitNfce] = useState(false);
  const [customerCpf, setCustomerCpf] = useState('');
  const [processingPay, setProcessingPay] = useState(false);

  // Cancelamento de anotação
  const [cancelTarget, setCancelTarget] = useState<{ personName: string; entry: CaderninhoEntry } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [adminKeyInput, setAdminKeyInput] = useState('');
  const [processingCancel, setProcessingCancel] = useState(false);

  // Histórico detalhado da pessoa selecionada
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<any | null>(null);

  const addToastRef = useRef(addToast);
  addToastRef.current = addToast;
  const onSummaryUpdatedRef = useRef(onSummaryUpdated);
  onSummaryUpdatedRef.current = onSummaryUpdated;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const wasOpenRef = useRef(false);

  // <dialog> nativo com light-dismiss fallback
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;

    if (isOpen) {
      if (!dlg.open) {
        try {
          dlg.showModal();
        } catch {}
      }
    } else if (dlg.open) {
      dlg.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;

    const handleNativeClose = () => {
      if (isOpen) onCloseRef.current();
    };
    dlg.addEventListener('close', handleNativeClose);

    let cleanupFallback: (() => void) | undefined;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const outside = (e: PointerEvent) => {
        const r = dlg.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      let pressedOutside = false;
      const onDown = (e: PointerEvent) => {
        pressedOutside = outside(e);
      };
      const onUp = (e: PointerEvent) => {
        if (pressedOutside && outside(e)) dlg.close();
      };
      dlg.addEventListener('pointerdown', onDown);
      dlg.addEventListener('pointerup', onUp);
      cleanupFallback = () => {
        dlg.removeEventListener('pointerdown', onDown);
        dlg.removeEventListener('pointerup', onUp);
      };
    }

    return () => {
      dlg.removeEventListener('close', handleNativeClose);
      if (cleanupFallback) cleanupFallback();
    };
  }, [isOpen]);

  const fetchPeople = useCallback(async () => {
    setLoadingPeople(true);
    try {
      const res = await fetch('/api/erp/pos/caderninho/people?onlyOpen=0');
      const data = await res.json();
      if (res.ok && data.success) {
        setAllPeople(Array.isArray(data.people) ? data.people : []);
        if (data.summary) onSummaryUpdatedRef.current(data.summary);
      }
    } catch {
      addToastRef.current('Erro ao carregar dados do Caderninho.', 'error');
    } finally {
      setLoadingPeople(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      wasOpenRef.current = true;
      setPersonNameInput('');
      setShowSuggestions(false);
      setPayPerson(null);
      setCancelTarget(null);
      setSelectedHistory(null);
      setActiveTab('abertos');
      fetchPeople();
    } else if (!isOpen) {
      wasOpenRef.current = false;
    }
  }, [isOpen, fetchPeople]);

  const openPeople = useMemo(() => {
    const q = normalizeNameClient(searchOpen);
    return allPeople
      .filter(p => p.openBalance > 0)
      .filter(p => !q || normalizeNameClient(p.name).includes(q));
  }, [allPeople, searchOpen]);

  const historyPeopleList = useMemo(() => {
    const q = normalizeNameClient(searchHistory);
    return allPeople.filter(p => !q || normalizeNameClient(p.name).includes(q));
  }, [allPeople, searchHistory]);

  const matchedPersonForEntry = useMemo(() => {
    const norm = normalizeNameClient(personNameInput);
    if (!norm) return null;
    return allPeople.find(p => normalizeNameClient(p.name) === norm) || null;
  }, [allPeople, personNameInput]);

  const suggestionsForEntry = useMemo(() => {
    const norm = normalizeNameClient(personNameInput);
    if (!norm) return allPeople.slice(0, 6);
    return allPeople
      .filter(p => normalizeNameClient(p.name).includes(norm) && normalizeNameClient(p.name) !== norm)
      .slice(0, 6);
  }, [allPeople, personNameInput]);

  const projectedBalance = useMemo(() => {
    return Math.round(((matchedPersonForEntry?.openBalance || 0) + cartTotal) * 100) / 100;
  }, [matchedPersonForEntry, cartTotal]);

  const cartCrediarioPreview = useMemo(() => {
    let surcharge = 0;
    for (const it of cart) {
      const qty = Math.max(1, Number(it.quantity || 1));
      const cashUnit = Math.max(0, Number(it.unit_price || 0));
      const sale = Math.max(0, Number(it.sale_price || 0));
      const promo = Math.max(0, Number(it.promo_price || 0));
      const cred = Math.max(0, Number(it.crediario_price || 0));
      const promoVista = String(it.promo_vista || '').toUpperCase() === 'S';

      let credUnit = cashUnit;
      if (cred > 0) credUnit = cred;
      else if (promo > 0 && promoVista && sale > 0) credUnit = sale;

      const diff = Math.max(0, credUnit - cashUnit);
      surcharge += qty * diff;
    }
    const roundedSurcharge = Math.round(surcharge * 100) / 100;
    return {
      surcharge: roundedSurcharge,
      crediarioTotal: Math.round((cartTotal + roundedSurcharge) * 100) / 100
    };
  }, [cart, cartTotal]);

  const handleSaveNewEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      addToast('O carrinho do PDV está vazio.', 'warning');
      return;
    }
    if (personNameInput.trim().length < 2) {
      addToast('Digite o nome da pessoa para anotar no Caderninho.', 'warning');
      return;
    }

    setSavingEntry(true);
    try {
      const res = await fetch('/api/erp/pos/caderninho/entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-name': operatorName
        },
        body: JSON.stringify({
          personName: personNameInput.trim(),
          items: cart,
          discount_value: cartDiscount,
          discount_includes_items: true,
          seller_id: currentSeller?.id || null,
          seller_name: operatorName
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao salvar anotação no Caderninho.');
      }

      addToast(
        `Anotado no Caderninho de ${data.person.name} (${formatCurrency(data.entry.total_amount)})!`,
        'success'
      );

      // Impressão automática 80mm conforme preferência do usuário
      try {
        imprimirComprovanteCaderninho({
          entry_id: data.entry.id,
          pessoa_nome: data.person.name,
          data_hora: formatDateTimeBR(data.entry.created_at),
          vendedor_nome: operatorName,
          itens: data.entry.items.map((it: any) => ({
            nome: it.name,
            quantidade: it.quantity,
            subtotal: it.total_price
          })),
          valor_anotacao: data.entry.total_amount,
          valor_crediario: data.entry.crediario_total_amount,
          acrescimo_crediario: data.entry.crediario_surcharge,
          crediario_aplicado: Boolean(data.entry.crediario_applied),
          saldo_acumulado: data.newOpenBalance,
          desconto: data.entry.discount_value,
          teto_alerta: 100
        });
      } catch (errPrint) {
        console.error('Erro ao imprimir comprovante Caderninho:', errPrint);
      }

      setPersonNameInput('');
      setShowSuggestions(false);
      onEntryCreated(data.summary);
      await fetchPeople();
    } catch (err: any) {
      addToast(err?.message || 'Erro ao anotar no Caderninho.', 'error');
    } finally {
      setSavingEntry(false);
    }
  };

  const handleOpenPayment = (person: CaderninhoPersonRow) => {
    setPayPerson(person);
    setCancelTarget(null);
    setPayMode('total');
    setSelectedEntryIds(person.entries.map(e => e.id));
    setPartialAmountInput('');
    setPaymentMethod('DINHEIRO');
    setAmountReceivedInput('');
    setEmitNfce(false);
    setCustomerCpf('');
  };

  const calculatedPayAmount = useMemo(() => {
    if (!payPerson) return 0;
    if (payMode === 'total') return payPerson.openBalance;
    if (payMode === 'entries') {
      return (
        Math.round(
          payPerson.entries
            .filter(e => selectedEntryIds.includes(e.id))
            .reduce((acc, e) => acc + e.remaining_amount, 0) * 100
        ) / 100
      );
    }
    const parsed = parseMoneyInput(partialAmountInput);
    return !isNaN(parsed) && parsed > 0 ? Math.min(parsed, payPerson.openBalance) : 0;
  }, [payPerson, payMode, selectedEntryIds, partialAmountInput]);

  const cashChange = useMemo(() => {
    if (paymentMethod !== 'DINHEIRO') return 0;
    const rec = parseMoneyInput(amountReceivedInput);
    if (isNaN(rec) || rec <= calculatedPayAmount) return 0;
    return Math.round((rec - calculatedPayAmount) * 100) / 100;
  }, [paymentMethod, amountReceivedInput, calculatedPayAmount]);

  const handleConfirmPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payPerson) return;

    if (payMode === 'entries' && selectedEntryIds.length === 0) {
      addToast('Selecione pelo menos uma anotação para pagar.', 'warning');
      return;
    }
    if (payMode === 'partial') {
      const parsed = parseMoneyInput(partialAmountInput);
      if (isNaN(parsed) || parsed <= 0) {
        addToast('Informe um valor válido maior que zero.', 'warning');
        return;
      }
      if (parsed > payPerson.openBalance + 0.01) {
        addToast(`O valor informado não pode ultrapassar ${formatCurrency(payPerson.openBalance)}.`, 'warning');
        return;
      }
    }

    setProcessingPay(true);
    try {
      const recNum = parseMoneyInput(amountReceivedInput);
      const res = await fetch('/api/erp/pos/caderninho/pay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-name': operatorName
        },
        body: JSON.stringify({
          personId: payPerson.id,
          mode: payMode,
          entryIds: selectedEntryIds,
          amount: payMode === 'partial' ? calculatedPayAmount : undefined,
          payment_method: paymentMethod,
          amount_received: paymentMethod === 'DINHEIRO' && !isNaN(recNum) ? recNum : undefined,
          emit_nfce: emitNfce,
          customer_cpf: customerCpf.trim() || null,
          force_contingency: isOfflineMode,
          seller_id: currentSeller?.id || null,
          seller_name: operatorName
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falha ao processar recebimento do Caderninho.');
      }

      addToast(
        `Pagamento de ${formatCurrency(data.paidAmount)} lançado no caixa (${data.sale.sale_id})!`,
        'success'
      );

      if (autoPrintCupom) {
        try {
          if (data.danfe && (data.danfe.qr_code_base64 || data.danfe.nfe_number)) {
            imprimirDanfeNfce(data.danfe, true);
          } else {
            const totalItemsSum = (data.receiptItems || []).reduce(
              (acc: number, it: any) => acc + Number(it.total_price || 0),
              0
            );
            imprimirCupomVenda(
              {
                sale_id: data.sale.sale_id,
                date: data.sale.sale_date,
                time: data.sale.sale_time,
                customer_name: data.person.name,
                seller_name: operatorName,
                items: data.receiptItems || [],
                total_items_value: totalItemsSum,
                discount_value: data.totalDiscountApplied || 0,
                total_final: data.paidAmount,
                payment: { method: paymentMethod, amount: data.paidAmount },
                change: data.changeAmount || 0
              },
              true
            );
          }
        } catch (errPrint) {
          console.error('Erro ao imprimir cupom da venda do Caderninho:', errPrint);
        }
      }

      setPayPerson(null);
      if (data.summary) onSummaryUpdated(data.summary);
      await fetchPeople();
    } catch (err: any) {
      addToast(err?.message || 'Erro ao receber pagamento.', 'error');
    } finally {
      setProcessingPay(false);
    }
  };

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTarget) return;
    if (cancelReason.trim().length < 3) {
      addToast('Informe o motivo do cancelamento.', 'warning');
      return;
    }

    setProcessingCancel(true);
    try {
      const res = await fetch(
        `/api/erp/pos/caderninho/entries/${encodeURIComponent(cancelTarget.entry.id)}/cancel`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-name': operatorName
          },
          body: JSON.stringify({
            reason: cancelReason.trim(),
            adminAccessKey: adminKeyInput.trim() || undefined,
            seller_name: operatorName
          })
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Não foi possível cancelar esta anotação.');
      }

      addToast('Anotação cancelada e registrada no histórico.', 'info');
      setCancelTarget(null);
      setCancelReason('');
      setAdminKeyInput('');
      if (data.summary) onSummaryUpdated(data.summary);
      await fetchPeople();
    } catch (err: any) {
      addToast(err?.message || 'Erro ao cancelar anotação.', 'error');
    } finally {
      setProcessingCancel(false);
    }
  };

  const handleLoadPersonHistory = async (personId: string) => {
    setActiveTab('historico');
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/erp/pos/caderninho/people/${encodeURIComponent(personId)}/history`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Não foi possível carregar o histórico.');
      }
      setSelectedHistory(data);
    } catch (err: any) {
      addToast(err?.message || 'Erro ao consultar histórico.', 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleReprintEntry = (person: CaderninhoPersonRow, entry: CaderninhoEntry) => {
    imprimirComprovanteCaderninho({
      entry_id: entry.id,
      pessoa_nome: person.name,
      data_hora: formatDateTimeBR(entry.created_at),
      vendedor_nome: entry.operator_name || operatorName,
      itens: entry.items.map(it => ({
        nome: it.name,
        quantidade: it.quantity,
        subtotal: it.total_price
      })),
      valor_anotacao: entry.total_amount,
      valor_crediario: entry.crediario_total_amount,
      acrescimo_crediario: entry.crediario_surcharge,
      crediario_aplicado: Boolean(entry.crediario_applied),
      saldo_acumulado: person.openBalance,
      desconto: entry.discount_value,
      teto_alerta: 100
    });
    addToast('Comprovante enviado para impressão 80mm.', 'info');
  };

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as any)}
      aria-labelledby={`${uid}-title`}
      className="crediario-dialog w-[96vw] max-w-4xl max-h-[92vh] m-auto p-0 rounded-3xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl overflow-hidden"
    >
      {/* Cabeçalho */}
      <div className="bg-slate-950 px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 id={`${uid}-title`} className="text-base sm:text-lg font-black text-white">
              Caderninho do Balcão
            </h2>
            <p className="text-xs text-slate-400">
              Anotações rápidas por nome — não entra na venda nem baixa estoque até o cliente pagar.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar Caderninho"
          className="p-2 rounded-xl hover:bg-slate-800 text-slate-300 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Corpo com scroll */}
      <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
        {/* Card de Anotação Imediata quando o carrinho do PDV tem itens */}
        {cart.length > 0 && (
          <form
            onSubmit={handleSaveNewEntry}
            className="rounded-2xl bg-amber-950/35 border-2 border-amber-500/50 p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-amber-200 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-amber-400" />
                  <span>Anotar Carrinho Atual no Caderninho ({cart.length} item(ns))</span>
                </h3>
                <p className="text-xs text-amber-100/80">
                  Pagando hoje: <strong className="text-white text-sm">{formatCurrency(cartTotal)}</strong>
                  {cartCrediarioPreview.surcharge > 0 && (
                    <span className="ml-2 text-amber-300 font-bold">
                      • Após hoje (Crediário): {formatCurrency(cartCrediarioPreview.crediarioTotal)} (+{formatCurrency(cartCrediarioPreview.surcharge)})
                    </span>
                  )}
                </p>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200">
                Imprime 80mm automaticamente ao salvar
              </span>
            </div>

            <div className="text-xs text-slate-200 bg-slate-950/70 rounded-xl border border-slate-800 px-3 py-2 max-h-24 overflow-y-auto">
              {cart.map((it, idx) => (
                <div key={`${it.code}-${idx}`} className="flex justify-between gap-2 py-0.5">
                  <span className="truncate">
                    {it.quantity}x {it.name}
                  </span>
                  <strong className="tabular-nums shrink-0">{formatCurrency(it.total_price)}</strong>
                </div>
              ))}
            </div>

            <div className="relative">
              <label htmlFor={`${uid}-person-name`} className="block text-xs font-bold text-amber-100 mb-1">
                Nome da Pessoa *
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <input
                    id={`${uid}-person-name`}
                    type="text"
                    required
                    value={personNameInput}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
                    onChange={e => {
                      setPersonNameInput(e.target.value);
                      setShowSuggestions(true);
                    }}
                    placeholder="Digite o nome (ex: Dona Maria da Padaria)..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-amber-400/50 bg-slate-950 text-white text-sm font-bold placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                  />

                  {showSuggestions && suggestionsForEntry.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl bg-slate-950 border border-slate-700 shadow-xl max-h-44 overflow-y-auto divide-y divide-slate-800">
                      {suggestionsForEntry.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={e => {
                            e.preventDefault();
                            setPersonNameInput(p.name);
                            setShowSuggestions(false);
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center justify-between text-xs cursor-pointer"
                        >
                          <span className="font-bold text-white">{p.name}</span>
                          <span className={p.openBalance > 0 ? 'text-amber-300 font-bold' : 'text-slate-400'}>
                            {p.openBalance > 0 ? `Em aberto: ${formatCurrency(p.openBalance)}` : 'Quitado'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={savingEntry}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{savingEntry ? 'Anotando...' : 'Anotar e Imprimir'}</span>
                </button>
              </div>
            </div>

            {matchedPersonForEntry && (
              <p className="text-xs text-slate-200">
                Cliente já salvo no Caderninho • Saldo em aberto atual:{' '}
                <strong className="text-amber-300">{formatCurrency(matchedPersonForEntry.openBalance)}</strong> →
                Saldo após anotar: <strong className="text-white">{formatCurrency(projectedBalance)}</strong>
              </p>
            )}

            {projectedBalance > 100 && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/70 text-rose-100 text-xs flex items-start gap-2.5"
              >
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-sm text-rose-200">
                    Aviso: Acumulado acima de R$ 100,00 ({formatCurrency(projectedBalance)})
                  </strong>
                  <span>
                    Esta pessoa ultrapassará o valor sugerido de R$ 100,00 para anotações rápidas. Você ainda pode confirmar normalmente clicando em &ldquo;Anotar e Imprimir&rdquo;.
                  </span>
                </div>
              </div>
            )}
          </form>
        )}

        {/* Abas Em Aberto / Histórico */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('abertos')}
              className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 cursor-pointer transition-colors ${
                activeTab === 'abertos'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Em Aberto ({allPeople.filter(p => p.openBalance > 0).length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('historico')}
              className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 cursor-pointer transition-colors ${
                activeTab === 'historico'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Histórico por Pessoa ({allPeople.length})</span>
            </button>
          </div>
        </div>

        {/* Painel Embutido de Recebimento / Pagamento */}
        {payPerson && (
          <form
            onSubmit={handleConfirmPay}
            className="rounded-2xl bg-emerald-950/35 border-2 border-emerald-500/60 p-4 space-y-4"
          >
            <div className="flex items-center justify-between gap-2 border-b border-emerald-800/60 pb-2">
              <div>
                <h3 className="text-sm font-black text-emerald-200 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span>Receber Caderninho — {payPerson.name}</span>
                </h3>
                <p className="text-xs text-emerald-100/80">
                  Saldo em aberto: <strong className="text-white">{formatCurrency(payPerson.openBalance)}</strong> • Esta baixa entrará nas vendas e no caixa de hoje.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayPerson(null)}
                className="text-xs font-bold text-slate-300 hover:text-white px-2 py-1 rounded-lg bg-slate-800 cursor-pointer"
              >
                Voltar
              </button>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-xs font-bold text-slate-200 mb-1.5">Quanto o cliente está pagando?</legend>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPayMode('total')}
                  className={`p-2.5 rounded-xl border text-left text-xs font-bold cursor-pointer ${
                    payMode === 'total'
                      ? 'border-emerald-400 bg-emerald-600/25 text-white'
                      : 'border-slate-700 bg-slate-950 text-slate-300'
                  }`}
                >
                  <span className="block">Quitar Tudo</span>
                  <strong className="text-sm tabular-nums">{formatCurrency(payPerson.openBalance)}</strong>
                </button>

                <button
                  type="button"
                  onClick={() => setPayMode('entries')}
                  className={`p-2.5 rounded-xl border text-left text-xs font-bold cursor-pointer ${
                    payMode === 'entries'
                      ? 'border-emerald-400 bg-emerald-600/25 text-white'
                      : 'border-slate-700 bg-slate-950 text-slate-300'
                  }`}
                >
                  <span className="block">Escolher Anotações</span>
                  <span className="text-[11px] font-normal text-slate-400">Marcar itens específicos</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPayMode('partial')}
                  className={`p-2.5 rounded-xl border text-left text-xs font-bold cursor-pointer ${
                    payMode === 'partial'
                      ? 'border-emerald-400 bg-emerald-600/25 text-white'
                      : 'border-slate-700 bg-slate-950 text-slate-300'
                  }`}
                >
                  <span className="block">Outro Valor (Parcial)</span>
                  <span className="text-[11px] font-normal text-slate-400">Abate parte em R$</span>
                </button>
              </div>
            </fieldset>

            {payMode === 'entries' && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto rounded-xl bg-slate-950 border border-slate-800 p-2.5">
                {payPerson.entries.map(ent => (
                  <label
                    key={ent.id}
                    className="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-900 cursor-pointer text-xs"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedEntryIds.includes(ent.id)}
                        onChange={e =>
                          setSelectedEntryIds(prev =>
                            e.target.checked ? [...prev, ent.id] : prev.filter(id => id !== ent.id)
                          )
                        }
                        className="w-4 h-4 accent-emerald-500"
                      />
                      <span className="truncate">
                        {formatDateTimeBR(ent.created_at)} — {ent.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                        {ent.crediario_applied && Number(ent.crediario_surcharge || 0) > 0 && (
                          <span className="ml-1.5 text-[10px] font-black text-amber-300">
                            (+Crediário {formatCurrency(ent.crediario_surcharge)})
                          </span>
                        )}
                      </span>
                    </span>
                    <strong className="tabular-nums shrink-0 text-emerald-300">
                      {formatCurrency(ent.remaining_amount)}
                    </strong>
                  </label>
                ))}
              </div>
            )}

            {payMode === 'partial' && (
              <div className="max-w-xs">
                <label htmlFor={`${uid}-partial-val`} className="block text-xs font-bold text-slate-200 mb-1">
                  Valor Pago Agora (R$) *
                </label>
                <input
                  id={`${uid}-partial-val`}
                  type="text"
                  inputMode="decimal"
                  required
                  value={partialAmountInput}
                  onChange={e => setPartialAmountInput(e.target.value)}
                  placeholder={`Ex: ${(payPerson.openBalance / 2).toFixed(2).replace('.', ',')}`}
                  className="w-full px-3 py-2 rounded-xl border border-emerald-400/50 bg-slate-950 text-white font-black text-base"
                />
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'DINHEIRO', label: 'Dinheiro' },
                { id: 'PIX', label: 'PIX' },
                { id: 'CARTAO_DEBITO', label: 'Débito' },
                { id: 'CARTAO_CREDITO', label: 'Crédito' }
              ].map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id as any)}
                  className={`py-2 px-3 rounded-xl border text-xs font-black cursor-pointer ${
                    paymentMethod === m.id
                      ? 'border-emerald-400 bg-emerald-500 text-slate-950'
                      : 'border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {paymentMethod === 'DINHEIRO' && (
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <label htmlFor={`${uid}-cash-rec`} className="block text-xs font-bold text-slate-300 mb-1">
                    Valor Recebido em Dinheiro (para troco)
                  </label>
                  <input
                    id={`${uid}-cash-rec`}
                    type="text"
                    inputMode="decimal"
                    value={amountReceivedInput}
                    onChange={e => setAmountReceivedInput(e.target.value)}
                    placeholder={calculatedPayAmount.toFixed(2).replace('.', ',')}
                    className="w-44 px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-white text-sm font-bold"
                  />
                </div>
                {cashChange > 0 && (
                  <div className="px-3 py-2 rounded-xl bg-amber-500/20 border border-amber-400/50 text-amber-200 text-xs font-black">
                    Troco: <span className="text-base">{formatCurrency(cashChange)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-emerald-800/60">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="inline-flex items-center gap-2 cursor-pointer text-slate-200 font-semibold">
                  <input
                    type="checkbox"
                    checked={emitNfce}
                    onChange={e => setEmitNfce(e.target.checked)}
                    className="w-4 h-4 accent-emerald-500"
                  />
                  <span>Emitir NFC-e</span>
                </label>
                {emitNfce && (
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="CPF na nota (opcional)"
                    value={customerCpf}
                    onChange={e => setCustomerCpf(e.target.value)}
                    placeholder="CPF na nota (opcional)"
                    className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-950 text-xs text-white"
                  />
                )}
              </div>

              <button
                type="submit"
                disabled={processingPay || calculatedPayAmount <= 0}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-sm flex items-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {processingPay
                    ? 'Faturando...'
                    : `Confirmar Recebimento (${formatCurrency(calculatedPayAmount)})`}
                </span>
              </button>
            </div>
          </form>
        )}

        {/* Painel Embutido de Cancelamento */}
        {cancelTarget && (
          <form
            onSubmit={handleConfirmCancel}
            className="rounded-2xl bg-rose-950/40 border-2 border-rose-500/60 p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-black text-rose-200 flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span>
                  Cancelar Anotação de {cancelTarget.personName} ({formatCurrency(cancelTarget.entry.total_amount)})
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="text-xs font-bold text-slate-300 bg-slate-800 px-2.5 py-1 rounded-lg cursor-pointer"
              >
                Voltar
              </button>
            </div>

            <div>
              <label htmlFor={`${uid}-cancel-reason`} className="block text-xs font-bold text-rose-100 mb-1">
                Motivo do Cancelamento *
              </label>
              <input
                id={`${uid}-cancel-reason`}
                type="text"
                required
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Ex: Lançado no nome errado / Cliente desistiu do item"
                className="w-full px-3 py-2 rounded-xl border border-rose-500/40 bg-slate-950 text-white text-sm"
              />
            </div>

            {!cancelTarget.entry.is_today && !isCurrentUserAdmin && (
              <div>
                <label htmlFor={`${uid}-cancel-adm`} className="block text-xs font-bold text-amber-200 mb-1 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Anotação de dia anterior — Chave/Senha de Administrador *</span>
                </label>
                <input
                  id={`${uid}-cancel-adm`}
                  type="password"
                  required
                  value={adminKeyInput}
                  onChange={e => setAdminKeyInput(e.target.value)}
                  placeholder="Digite a chave do Administrador"
                  className="w-full max-w-xs px-3 py-2 rounded-xl border border-amber-400/50 bg-slate-950 text-white text-sm"
                />
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={processingCancel}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black cursor-pointer disabled:opacity-50"
              >
                {processingCancel ? 'Cancelando...' : 'Confirmar Cancelamento'}
              </button>
            </div>
          </form>
        )}

        {/* ABA 1: CONTAS EM ABERTO */}
        {activeTab === 'abertos' && (
          <div className="space-y-3">
            <search>
              <label htmlFor={`${uid}-search-open`} className="sr-only">
                Buscar pessoa com saldo aberto no Caderninho
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id={`${uid}-search-open`}
                  type="search"
                  value={searchOpen}
                  onChange={e => setSearchOpen(e.target.value)}
                  placeholder="Buscar nome em aberto..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-700 bg-slate-950 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </search>

            {loadingPeople ? (
              <p className="py-8 text-center text-sm text-slate-400">Carregando Caderninho...</p>
            ) : openPeople.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm bg-slate-950/60 rounded-2xl border border-slate-800">
                Nenhuma anotação em aberto no Caderninho no momento.
              </div>
            ) : (
              <div className="space-y-3">
                {openPeople.map(person => (
                  <article
                    key={person.id}
                    className={`rounded-2xl border p-4 space-y-3 ${
                      person.isOverdue
                        ? 'bg-rose-950/20 border-rose-500/50'
                        : 'bg-slate-950/80 border-slate-800'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-black text-white">{person.name}</h3>
                          {person.isOverdue && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[11px] font-black">
                              {person.maxDaysOpen} dias em aberto
                            </span>
                          )}
                          {person.exceededLimit && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-200 text-[11px] font-bold">
                              Acima de R$ 100
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">
                          {person.openEntriesCount} anotação(ões) em aberto • Mais antiga em{' '}
                          {formatDateTimeBR(person.oldestOpenDate)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-right mr-2">
                          <span className="block text-[10px] uppercase text-slate-400 font-bold">
                            Total em aberto
                          </span>
                          <strong className="text-xl font-black text-amber-300 tabular-nums">
                            {formatCurrency(person.openBalance)}
                          </strong>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOpenPayment(person)}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
                        >
                          <DollarSign className="w-4 h-4" />
                          <span>Receber / Pagar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleLoadPersonHistory(person.id)}
                          title="Ver histórico completo"
                          className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold cursor-pointer"
                        >
                          Histórico
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {person.entries.map(ent => (
                        <div
                          key={ent.id}
                          className="rounded-xl bg-slate-900/90 border border-slate-800 p-3 text-xs space-y-1.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-slate-200">
                                {formatDateTimeBR(ent.created_at)}
                              </span>
                              <span className="text-slate-400">por {ent.operator_name}</span>
                              {ent.is_overdue ? (
                                <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">
                                  {ent.days_open}d atraso
                                </span>
                              ) : ent.is_today ? (
                                <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold">
                                  Hoje
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                                  {ent.days_open}d
                                </span>
                              )}
                              {ent.paid_amount > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                                  Já pago: {formatCurrency(ent.paid_amount)}
                                </span>
                              )}
                              {ent.crediario_applied && Number(ent.crediario_surcharge || 0) > 0 ? (
                                <span
                                  className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 font-bold"
                                  title={`Valor original à vista: ${formatCurrency(ent.original_total_amount)}`}
                                >
                                  +Crediário ({formatCurrency(ent.crediario_surcharge)})
                                </span>
                              ) : ent.is_today && ent.crediario_rule_enabled && Number(ent.crediario_surcharge || 0) > 0 ? (
                                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300/90 font-semibold">
                                  Após hoje: {formatCurrency(ent.crediario_total_amount)}
                                </span>
                              ) : null}
                            </div>

                            <div className="flex items-center gap-1.5">
                              <strong className="text-white tabular-nums mr-1">
                                Resta {formatCurrency(ent.remaining_amount)}
                              </strong>
                              <button
                                type="button"
                                onClick={() => handleReprintEntry(person, ent)}
                                title="Reimprimir comprovante 80mm"
                                aria-label="Reimprimir comprovante 80mm"
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              {ent.paid_amount <= 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCancelTarget({ personName: person.name, entry: ent });
                                    setCancelReason('');
                                    setAdminKeyInput('');
                                  }}
                                  title="Cancelar anotação"
                                  aria-label="Cancelar anotação"
                                  className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="pl-2 border-l-2 border-slate-700 space-y-0.5 text-slate-300">
                            {ent.items.map((it, idx) => (
                              <div key={`${ent.id}-${idx}`} className="flex justify-between gap-2">
                                <span>
                                  {it.quantity}x {it.name}
                                </span>
                                <span className="tabular-nums">{formatCurrency(it.total_price)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA 2: HISTÓRICO POR PESSOA */}
        {activeTab === 'historico' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <search>
                <label htmlFor={`${uid}-search-hist`} className="sr-only">
                  Pesquisar pessoa salva no Caderninho
                </label>
                <input
                  id={`${uid}-search-hist`}
                  type="search"
                  value={searchHistory}
                  onChange={e => setSearchHistory(e.target.value)}
                  placeholder="Filtrar pessoa..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-xs text-white"
                />
              </search>
              <div className="max-h-96 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 divide-y divide-slate-800">
                {historyPeopleList.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500 text-center">Nenhum nome registrado.</p>
                ) : (
                  historyPeopleList.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleLoadPersonHistory(p.id)}
                      className={`w-full p-3 text-left flex items-center justify-between gap-2 text-xs hover:bg-slate-900 cursor-pointer ${
                        selectedHistory?.person?.id === p.id ? 'bg-slate-800' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-white truncate">{p.name}</p>
                        <p className="text-[11px] text-slate-400">{p.totalMovementsCount} movimentação(ões)</p>
                      </div>
                      <span
                        className={`font-black tabular-nums shrink-0 ${
                          p.openBalance > 0 ? 'text-amber-300' : 'text-emerald-400'
                        }`}
                      >
                        {formatCurrency(p.openBalance)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="md:col-span-2 rounded-2xl border border-slate-800 bg-slate-950 p-4">
              {historyLoading ? (
                <p className="text-sm text-slate-400 py-8 text-center">Carregando histórico...</p>
              ) : !selectedHistory ? (
                <div className="py-12 text-center text-slate-500 text-sm space-y-2">
                  <UserIcon className="w-8 h-8 mx-auto opacity-50" />
                  <p>Selecione uma pessoa à esquerda para acompanhar todo o histórico de movimentação.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <h3 className="text-base font-black text-white">{selectedHistory.person.name}</h3>
                      <p className="text-xs text-slate-400">
                        Primeiro registro em {formatDateTimeBR(selectedHistory.person.created_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="block text-[10px] uppercase text-slate-400 font-bold">Saldo em aberto</span>
                      <strong className={`text-lg font-black tabular-nums ${selectedHistory.openBalance > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                        {formatCurrency(selectedHistory.openBalance)}
                      </strong>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {(selectedHistory.movements || []).map((mov: any) => (
                      <div key={mov.id} className="rounded-xl bg-slate-900 border border-slate-800 p-3 text-xs space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded font-black text-[10px] ${
                                mov.type === 'ANOTACAO'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : mov.type === 'CANCELAMENTO'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-emerald-500/20 text-emerald-300'
                              }`}
                            >
                              {mov.type}
                            </span>
                            <span className="text-slate-300 font-semibold">{formatDateTimeBR(mov.created_at)}</span>
                            <span className="text-slate-400">• {mov.operator_name}</span>
                          </div>
                          <strong className="text-white tabular-nums">{formatCurrency(mov.amount)}</strong>
                        </div>
                        {mov.payment_method && mov.type !== 'ANOTACAO' && (
                          <p className="text-emerald-300">
                            Forma: {mov.payment_method} {mov.sale_id ? `• Venda #${mov.sale_id}` : ''}
                          </p>
                        )}
                        {mov.reason && <p className="text-rose-300">Motivo: {mov.reason}</p>}
                        {Array.isArray(mov.details?.items) && mov.details.items.length > 0 && (
                          <p className="text-slate-400">
                            Itens: {mov.details.items.map((i: any) => `${i.quantity}x ${i.name}`).join(', ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
};

export default CaderninhoModal;
