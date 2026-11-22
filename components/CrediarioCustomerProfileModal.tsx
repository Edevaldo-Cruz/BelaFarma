import React, { useState, useEffect, useMemo, useRef, useId } from 'react';
import {
  X,
  Printer,
  Edit3,
  CheckCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  Calendar,
  Phone,
  MapPin,
  FileText,
  Copy,
  Send,
  Save,
  Search,
  RefreshCw,
  ShoppingBag,
  Check,
  Shield,
  Lock,
  Unlock,
  ExternalLink,
  MessageSquare,
  DollarSign,
  UserCheck,
  Users
} from 'lucide-react';
import { useToast } from './ToastContext';
import { User, UserRole } from '../types';

export interface CustomerProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardId?: number | string | null;
  customerId?: string | null;
  user?: User;
  initialPanel?: 'none' | 'receive' | 'purchase' | 'whatsapp' | 'edit';
  initialSaleId?: string;
  onProfileUpdated?: () => void;
  onUpdated?: () => void;
  onOpenSaleModal?: (card: any) => void;
  onOpenPayModal?: (inv: any) => void;
}

const TEMPLATE_LABELS: Record<string, string> = {
  purchase: 'Aviso de Compra',
  statement: 'Extrato + Link PIX',
  due_reminder: 'Lembrete de Vencimento',
  overdue: 'Aviso de Atraso',
  payment_receipt: 'Confirmação de Pagamento'
};

export const CrediarioCustomerProfileModal: React.FC<CustomerProfileModalProps> = ({
  isOpen,
  onClose,
  cardId,
  customerId,
  user,
  initialPanel = 'none',
  initialSaleId = '',
  onProfileUpdated,
  onUpdated
}) => {
  const { addToast } = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const uidPrefix = useId();

  const effectiveUser = useMemo(() => {
    if (user) return user;
    try {
      const saved = localStorage.getItem('belinha_session_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }, [user]);

  const isAdmin = effectiveUser?.role === UserRole.ADM || effectiveUser?.role === 'Administrador';

  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any | null>(null);

  // Modo de visualização: Extrato Simples (Idosos/Cliente) | Extrato Completo (Auditoria) | Histórico WhatsApp
  const [viewMode, setViewMode] = useState<'simple' | 'complete' | 'messages'>('simple');
  const [activePanel, setActivePanel] = useState<'none' | 'receive' | 'purchase' | 'whatsapp' | 'edit'>('none');

  // Filtros do Extrato Completo
  const [completeFilter, setCompleteFilter] = useState<'all' | 'DEBITO' | 'CREDITO'>('all');
  const [completeSearch, setCompleteSearch] = useState('');

  // Estado de Impressão Térmica 80mm
  const [printingThermal, setPrintingThermal] = useState(false);

  // Formulário de Edição da Ficha 360°
  const [editForm, setEditForm] = useState({
    customer_name: '',
    nickname: '',
    cpf: '',
    rg: '',
    birth_date: '',
    phone: '',
    phone_fixed: '',
    email: '',
    address: '',
    address_number: '',
    address_complement: '',
    neighborhood: '',
    city: '',
    state: '',
    zip_code: '',
    address_reference: '',
    responsible_name: '',
    authorized_buyers: '',
    notes: '',
    credit_limit: '300',
    due_day: '20',
    due_day_mode: 'auto' as 'auto' | 'fixed',
    interest_exempt: false,
    interest_exempt_reason: ''
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Formulário de Recebimento
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('DINHEIRO');
  const [waiveInterest, setWaiveInterest] = useState(false);
  const [payNotes, setPayNotes] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [submittingPay, setSubmittingPay] = useState(false);

  // Formulário de Nova Compra no Belinha
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [purchaseBuyer, setPurchaseBuyer] = useState('');
  const [purchaseDesc, setPurchaseDesc] = useState('');
  const [purchaseDueDate, setPurchaseDueDate] = useState('');
  const [purchaseBypassLock, setPurchaseBypassLock] = useState(false);
  const [submittingPurchase, setSubmittingPurchase] = useState(false);

  // Compositor WhatsApp
  const [waTemplate, setWaTemplate] = useState<string>('statement');
  const [waSaleId, setWaSaleId] = useState<string>('');
  const [waPhone, setWaPhone] = useState<string>('');
  const [waText, setWaText] = useState<string>('');
  const [waUrl, setWaUrl] = useState<string>('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sendingWa, setSendingWa] = useState(false);
  const [copiedPortal, setCopiedPortal] = useState(false);

  const targetLookupId = cardId || customerId;

  const formatCurrency = (val: number) =>
    Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatDateBR = (dateStr?: string) => {
    if (!dateStr) return '-';
    const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      return d.toLocaleDateString('pt-BR');
    } catch {
      return String(dateStr);
    }
  };

  const notifyParentRefresh = () => {
    if (onProfileUpdated) onProfileUpdated();
    if (onUpdated) onUpdated();
  };

  // Gerenciamento nativo de <dialog> via showModal() + light-dismiss fallback (modern-web-guidance: dialog)
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
      if (isOpen) onClose();
    };
    dlg.addEventListener('close', handleNativeClose);

    // Fallback para navegadores sem <dialog closedby="any">
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
  }, [isOpen, onClose]);

  const loadProfile = async () => {
    if (!targetLookupId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/crediario-v2/clients/${encodeURIComponent(String(targetLookupId))}/profile`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        addToast(data.error || 'Não foi possível carregar a ficha do cliente.', 'error');
        return;
      }

      setProfile(data);
      const c = data.card;
      const fin = data.financials;

      setEditForm({
        customer_name: c.customer_name || '',
        nickname: c.nickname || '',
        cpf: c.cpf || '',
        rg: c.rg || '',
        birth_date: c.birth_date || '',
        phone: c.phone || '',
        phone_fixed: c.phone_fixed || '',
        email: c.email || '',
        address: c.address || '',
        address_number: c.address_number || '',
        address_complement: c.address_complement || '',
        neighborhood: c.neighborhood || '',
        city: c.city || '',
        state: c.state || '',
        zip_code: c.zip_code || '',
        address_reference: c.address_reference || '',
        responsible_name: c.responsible_name || '',
        authorized_buyers: Array.isArray(c.authorized_buyers) ? c.authorized_buyers.join(', ') : '',
        notes: c.notes || '',
        credit_limit: String(c.credit_limit || 300),
        due_day: String(c.due_day || 20),
        due_day_mode: c.due_day_mode === 'fixed' ? 'fixed' : 'auto',
        interest_exempt: Boolean(Number(c.interest_exempt)),
        interest_exempt_reason: c.interest_exempt_reason || ''
      });

      setPayAmount(fin.totalBalance > 0 ? fin.totalBalance.toFixed(2) : '');
      setWaPhone(c.phone || '');
      setWaiveInterest(false);
      setSelectedItemIds([]);
    } catch {
      addToast('Erro de conexão ao carregar ficha do cliente.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && targetLookupId) {
      setViewMode('simple');
      setActivePanel(initialPanel || 'none');
      setWaSaleId(initialSaleId || '');
      if (initialSaleId) {
        setWaTemplate('purchase');
      }
      loadProfile();
    }
  }, [isOpen, targetLookupId, initialPanel, initialSaleId]);

  const loadWhatsAppPreview = async (tplType: string, sId = '') => {
    if (!profile?.card?.id) return;
    setLoadingPreview(true);
    try {
      const res = await fetch(`/api/crediario-v2/clients/${profile.card.id}/whatsapp-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateType: tplType, saleId: sId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWaText(data.messageText || '');
        setWaUrl(data.waMeUrl || '');
        if (data.phone && !waPhone) setWaPhone(data.phone);
      }
    } catch {
      addToast('Não foi possível gerar o modelo de mensagem.', 'error');
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    if (activePanel === 'whatsapp' && profile?.card?.id) {
      loadWhatsAppPreview(waTemplate, waSaleId);
    }
  }, [activePanel, waTemplate, waSaleId, profile?.card?.id]);

  // Impressão Térmica 80mm
  const handlePrintThermal = async () => {
    if (!profile?.card?.id) return;
    setPrintingThermal(true);
    try {
      const mode = viewMode === 'complete' ? 'complete' : 'simple';
      const res = await fetch(`/api/crediario-v2/clients/${profile.card.id}/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(data.message || 'Extrato enviado para a impressora térmica 80mm!', data.queued ? 'success' : 'info');
      } else {
        addToast(data.error || 'Erro ao imprimir na térmica.', 'error');
      }
    } catch {
      addToast('Falha na comunicação com a impressora térmica.', 'error');
    } finally {
      setPrintingThermal(false);
    }
  };

  // Impressão A4 / PDF em letra grande e alto contraste para idosos
  const handlePrintA4 = () => {
    if (!profile) return;
    const { card, financials, simpleStatement, completeStatement, pix } = profile;
    const isSimple = viewMode !== 'complete';

    const win = window.open('', '_blank', 'width=860,height=950');
    if (!win) {
      addToast('Pop-up bloqueado pelo navegador. Libere os pop-ups para imprimir em A4/PDF.', 'warning');
      return;
    }

    const escape = (s: any) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const contentHtml = isSimple
      ? `
        <div class="banner ${simpleStatement.milestone.type === 'zeroed' ? 'banner-green' : 'banner-blue'}">
          <strong>${escape(simpleStatement.milestone.label)}</strong>
          <div>${escape(simpleStatement.milestone.sublabel)}</div>
        </div>
        ${
          simpleStatement.purchaseGroups.length === 0
            ? '<p class="empty">Você não possui débitos em aberto no momento.</p>'
            : simpleStatement.purchaseGroups
                .map(
                  (grp: any) => `
                <div class="group-card">
                  <div class="group-head">
                    <span>📅 Compra de ${escape(formatDateBR(grp.date))}${grp.buyerName ? ` — Retirado por: <strong>${escape(grp.buyerName)}</strong>` : ''}</span>
                    <span>Subtotal: <strong>${escape(formatCurrency(grp.subtotal))}</strong></span>
                  </div>
                  <table>
                    <thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Valor</th></tr></thead>
                    <tbody>
                      ${grp.items
                        .map(
                          (it: any) => `
                        <tr>
                          <td>${escape(it.productName)}</td>
                          <td class="num">${it.quantity}</td>
                          <td class="num"><strong>${escape(formatCurrency(it.totalPrice))}</strong></td>
                        </tr>`
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>`
                )
                .join('')
        }
      `
      : `
        <table>
          <thead><tr><th>Data</th><th>Histórico</th><th>Tipo</th><th class="num">Valor</th><th class="num">Saldo</th></tr></thead>
          <tbody>
            ${completeStatement.entries
              .map(
                (e: any) => `
              <tr>
                <td>${escape(formatDateBR(e.date))}</td>
                <td><strong>${escape(e.title)}</strong><br/><small>${escape(e.subtitle)}</small></td>
                <td>${escape(e.type)}</td>
                <td class="num">${e.type === 'CREDITO' ? '-' : '+'} ${escape(formatCurrency(e.amount))}</td>
                <td class="num">${e.runningBalance !== null && e.runningBalance !== undefined ? escape(formatCurrency(e.runningBalance)) : '-'}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      `;

    win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Extrato Crediário - ${escape(card.customer_name)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.5; font-size: 14px; margin: 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
  .brand { font-size: 20px; font-weight: 900; color: #b91c1c; }
  .client-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px 16px; margin-bottom: 16px; }
  .banner { padding: 12px 16px; border-radius: 10px; margin-bottom: 16px; font-size: 15px; }
  .banner-green { background: #ecfdf5; border: 2px solid #059669; color: #064e3b; }
  .banner-blue { background: #eff6ff; border: 2px solid #2563eb; color: #1e3a8a; }
  .group-card { border: 1px solid #cbd5e1; border-radius: 10px; margin-bottom: 14px; overflow: hidden; page-break-inside: avoid; }
  .group-head { background: #f1f5f9; padding: 8px 14px; display: flex; justify-content: space-between; font-size: 14px; border-bottom: 1px solid #cbd5e1; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 7px 12px; border-bottom: 1px solid #e2e8f0; text-align: left; }
  th { font-size: 12px; text-transform: uppercase; color: #475569; }
  .num { text-align: right; white-space: nowrap; }
  .total-box { margin-top: 18px; border: 2px solid #0f172a; border-radius: 12px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; }
  .total-val { font-size: 24px; font-weight: 900; color: #b91c1c; }
  .pix-box { margin-top: 14px; padding: 12px 16px; border: 1px dashed #475569; border-radius: 10px; font-size: 14px; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">DROGARIA BELA FARMA SUL</div>
      <div>Extrato ${isSimple ? 'Simplificado do Cliente' : 'Completo (Auditoria)'}</div>
    </div>
    <div style="text-align:right">
      <div><strong>Emitido em:</strong> ${new Date().toLocaleString('pt-BR')}</div>
      <div>CNPJ: 31.144.152/0001-44</div>
    </div>
  </div>
  <div class="client-box">
    <div><strong>Cliente:</strong> ${escape(card.customer_name)}</div>
    <div><strong>Vencimento:</strong> ${escape(financials.nextDueDate ? formatDateBR(financials.nextDueDate) : `Todo dia ${card.due_day}`)}</div>
  </div>
  ${contentHtml}
  <div class="total-box">
    <div>
      <div style="font-size:13px;color:#475569;">Saldo das compras: ${escape(formatCurrency(financials.principalBalance))}${financials.totalCharges > 0 ? ` • Multa/Juros: ${escape(formatCurrency(financials.totalCharges))}` : ''}</div>
      <div style="font-size:16px;font-weight:900;">TOTAL A PAGAR</div>
    </div>
    <div class="total-val">${escape(formatCurrency(financials.totalBalance))}</div>
  </div>
  <div class="pix-box">
    <strong>💳 Pagamento via PIX (Chave CNPJ):</strong> ${escape(pix.pixKey || '31.144.152/0001-44')}<br/>
    <small>Você também pode consultar e gerar o QR Code pelo link: ${escape(profile.portalUrl)}</small>
  </div>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
    win.document.close();
  };

  // Salvar Edição da Ficha
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.card?.id) return;
    setSavingEdit(true);
    try {
      const payload: Record<string, any> = {
        customer_name: editForm.customer_name,
        nickname: editForm.nickname,
        cpf: editForm.cpf,
        rg: editForm.rg,
        birth_date: editForm.birth_date,
        phone: editForm.phone,
        phone_fixed: editForm.phone_fixed,
        email: editForm.email,
        address: editForm.address,
        address_number: editForm.address_number,
        address_complement: editForm.address_complement,
        neighborhood: editForm.neighborhood,
        city: editForm.city,
        state: editForm.state,
        zip_code: editForm.zip_code,
        address_reference: editForm.address_reference,
        responsible_name: editForm.responsible_name,
        authorized_buyers: editForm.authorized_buyers
          .split(',')
          .map(s => s.trim().toUpperCase())
          .filter(Boolean),
        notes: editForm.notes
      };

      if (isAdmin) {
        payload.credit_limit = parseFloat(editForm.credit_limit) || 300;
        payload.due_day = parseInt(editForm.due_day, 10) || 20;
        payload.due_day_mode = editForm.due_day_mode;
        payload.interest_exempt = editForm.interest_exempt;
        payload.interest_exempt_reason = editForm.interest_exempt_reason;
      }

      const res = await fetch(`/api/crediario-v2/clients/${profile.card.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast('Ficha do cliente atualizada com sucesso!', 'success');
        setActivePanel('none');
        await loadProfile();
        notifyParentRefresh();
      } else {
        addToast(data.error || 'Erro ao salvar ficha.', 'error');
      }
    } catch {
      addToast('Erro de conexão ao salvar ficha.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  // Receber Pagamento
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.card?.id) return;
    const val = parseFloat(payAmount);
    if (isNaN(val) || (val <= 0 && !waiveInterest)) {
      addToast('Informe um valor pago válido.', 'warning');
      return;
    }

    setSubmittingPay(true);
    try {
      const res = await fetch(`/api/crediario-v2/clients/${profile.card.id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: val,
          paymentMethod: payMethod,
          waiveInterest: isAdmin && waiveInterest,
          itemIds: selectedItemIds,
          notes: payNotes
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(
          data.isFullSettlement
            ? 'Quitação total registrada! Conta zerada e limite restaurado.'
            : `Pagamento de ${formatCurrency(val)} registrado com sucesso!`,
          'success'
        );
        if (data.digifarmaOfflineWarning) {
          addToast('Baixa salva no Belinha. Lembre de conferir no caixa do Digifarma (offline no momento).', 'warning');
        }
        setActivePanel('none');
        setPayNotes('');
        await loadProfile();
        notifyParentRefresh();
      } else {
        addToast(data.error || 'Não foi possível registrar o recebimento.', 'error');
      }
    } catch {
      addToast('Erro de conexão ao registrar pagamento.', 'error');
    } finally {
      setSubmittingPay(false);
    }
  };

  // Lançar Compra no Belinha
  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.card?.id) return;
    const val = parseFloat(purchaseAmount);
    if (isNaN(val) || val <= 0) {
      addToast('Informe o valor válido da compra.', 'warning');
      return;
    }
    if (!purchaseDesc.trim()) {
      addToast('Informe a descrição dos produtos.', 'warning');
      return;
    }

    setSubmittingPurchase(true);
    try {
      const res = await fetch(`/api/crediario-v2/clients/${profile.card.id}/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: val,
          buyerName: purchaseBuyer,
          description: purchaseDesc,
          dueDate: purchaseDueDate,
          bypassLock: isAdmin && purchaseBypassLock
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast('Compra lançada no crediário com sucesso!', 'success');
        setActivePanel('none');
        setPurchaseAmount('');
        setPurchaseDesc('');
        setPurchaseBuyer('');
        setPurchaseDueDate('');
        setPurchaseBypassLock(false);
        await loadProfile();
        notifyParentRefresh();
      } else {
        addToast(data.error || 'Compra não autorizada.', 'error');
      }
    } catch {
      addToast('Erro de conexão ao lançar compra.', 'error');
    } finally {
      setSubmittingPurchase(false);
    }
  };

  // Envio WhatsApp
  const handleSendWa = async (channel: 'auto' | 'wa_me' | 'copy') => {
    if (!profile?.card?.id || !waText.trim()) return;
    setSendingWa(true);
    try {
      const res = await fetch(`/api/crediario-v2/clients/${profile.card.id}/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: waPhone,
          templateType: waTemplate,
          saleId: waSaleId,
          messageText: waText,
          channel
        })
      });
      const data = await res.json();

      if (channel === 'copy') {
        await navigator.clipboard.writeText(waText);
        addToast('Mensagem copiada para a área de transferência!', 'success');
      } else if (channel === 'wa_me') {
        window.open(data.waMeUrl || waUrl, '_blank', 'noopener,noreferrer');
        addToast('Abrindo WhatsApp Web com a mensagem pronta!', 'success');
      } else if (data.sentViaServer) {
        addToast(`Mensagem enviada com sucesso via servidor (${data.channel})!`, 'success');
      } else {
        addToast(data.error || 'WhatsApp do servidor desconectado. Use "Abrir WhatsApp Web" ou "Copiar".', 'warning');
      }
      await loadProfile();
    } catch {
      addToast('Falha ao processar envio de WhatsApp.', 'error');
    } finally {
      setSendingWa(false);
    }
  };

  // Ações Administrativas da Ficha
  const handleToggleBlock = async () => {
    if (!profile?.card?.id || !isAdmin) return;
    try {
      const res = await fetch(`/api/crediario-v2/clients/${profile.card.id}/toggle-block`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(data.message, 'success');
        await loadProfile();
        notifyParentRefresh();
      } else {
        addToast(data.error || 'Erro ao alterar bloqueio.', 'error');
      }
    } catch {
      addToast('Erro de conexão.', 'error');
    }
  };

  const handleRegenerateToken = async () => {
    if (!profile?.card?.id || !isAdmin) return;
    try {
      const res = await fetch(`/api/crediario-v2/clients/${profile.card.id}/regenerate-token`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast('Novo link pessoal gerado para o cliente!', 'success');
        await loadProfile();
      } else {
        addToast(data.error || 'Erro ao gerar novo link.', 'error');
      }
    } catch {
      addToast('Erro de conexão.', 'error');
    }
  };

  const handleCopyPortalLink = async () => {
    if (!profile?.portalUrl) return;
    try {
      await navigator.clipboard.writeText(profile.portalUrl);
      setCopiedPortal(true);
      addToast('Link do Portal do Cliente copiado!', 'success');
      setTimeout(() => setCopiedPortal(false), 2500);
    } catch {
      addToast('Não foi possível copiar o link.', 'error');
    }
  };

  const filteredCompleteEntries = useMemo(() => {
    const entries = profile?.completeStatement?.entries || [];
    const term = completeSearch.trim().toLowerCase();
    return entries.filter((e: any) => {
      if (completeFilter !== 'all' && e.type !== completeFilter) return false;
      if (!term) return true;
      const inTitle = (e.title || '').toLowerCase().includes(term) || (e.subtitle || '').toLowerCase().includes(term);
      const inItems = Array.isArray(e.items) && e.items.some((i: any) => (i.productName || '').toLowerCase().includes(term));
      return inTitle || inItems;
    });
  }, [profile, completeFilter, completeSearch]);

  const card = profile?.card;
  const financials = profile?.financials;
  const simple = profile?.simpleStatement;
  const complete = profile?.completeStatement;

  const limitPercent = financials && financials.creditLimit > 0
    ? Math.min(100, Math.round((financials.principalBalance / financials.creditLimit) * 100))
    : 0;

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as any)}
      aria-labelledby={`${uidPrefix}-title`}
      className="crediario-dialog w-[96vw] max-w-5xl max-h-[92vh] m-auto p-0 rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl overflow-hidden"
    >
      {/* CABEÇALHO DO DIALOG */}
      <div className="bg-slate-950 text-white px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-red-600 flex items-center justify-center text-white font-black text-lg shrink-0 shadow">
            {card?.customer_name?.charAt(0) || <CreditCard className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 id={`${uidPrefix}-title`} className="text-base sm:text-lg font-black tracking-tight truncate">
                {card?.customer_name || 'Carregando ficha...'}
              </h1>
              {financials && (
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  financials.isBlocked
                    ? 'bg-rose-950 text-rose-300 border border-rose-500/40'
                    : financials.accountStatus === 'vencido'
                    ? 'bg-amber-950 text-amber-300 border border-amber-500/40'
                    : financials.accountStatus === 'zerado'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                    : 'bg-sky-950 text-sky-300 border border-sky-500/40'
                }`}>
                  {financials.isBlocked
                    ? 'Bloqueado'
                    : financials.accountStatus === 'vencido'
                    ? `Vencido (${financials.maxDaysLate}d)`
                    : financials.accountStatus === 'zerado'
                    ? 'Conta Zerada'
                    : 'Em Dia'}
                </span>
              )}
              {card && Boolean(Number(card.interest_exempt)) && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-500/40">
                  Isento de Juros
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Ficha 360° • Extrato Simples (Idosos) &amp; Auditoria Completa • Recebimento &amp; Portal PIX
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          <button
            type="button"
            onClick={handlePrintThermal}
            disabled={printingThermal || !card}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold border border-slate-700 transition cursor-pointer disabled:opacity-50"
          >
            <Printer className={`w-3.5 h-3.5 text-emerald-400 ${printingThermal ? 'animate-spin' : ''}`} />
            <span>80mm</span>
          </button>

          <button
            type="button"
            onClick={handlePrintA4}
            disabled={!card}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold border border-slate-700 transition cursor-pointer disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5 text-sky-400" />
            <span>A4 / PDF</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePanel(activePanel === 'edit' ? 'none' : 'edit')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
              activePanel === 'edit'
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Editar Ficha</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="p-2 rounded-xl bg-slate-800 hover:bg-rose-700 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* BARRA DE AÇÕES RÁPIDAS DO ATENDIMENTO */}
      {card && (
        <div className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => setActivePanel(activePanel === 'receive' ? 'none' : 'receive')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
              activePanel === 'receive'
                ? 'bg-emerald-700 text-white shadow'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Receber Pagamento</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePanel(activePanel === 'purchase' ? 'none' : 'purchase')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
              activePanel === 'purchase'
                ? 'bg-red-700 text-white shadow'
                : 'bg-red-600 hover:bg-red-700 text-white shadow-2xs'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Lançar Compra</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePanel(activePanel === 'whatsapp' ? 'none' : 'whatsapp')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
              activePanel === 'whatsapp'
                ? 'bg-teal-700 text-white shadow'
                : 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-white hover:bg-slate-50'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
            <span>Mandar WhatsApp</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={handleToggleBlock}
              className={`ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                financials?.isBlocked
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                  : 'bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100'
              }`}
            >
              {financials?.isBlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              <span>{financials?.isBlocked ? 'Desbloquear Conta' : 'Bloquear Conta'}</span>
            </button>
          )}
        </div>
      )}

      {/* CORPO ROLÁVEL */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        {loading && !profile ? (
          <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
            <RefreshCw className="w-8 h-8 animate-spin text-red-600" />
            <p className="text-sm font-bold">Sincronizando extrato e dados da ficha...</p>
          </div>
        ) : card && financials && simple && complete ? (
          <>
            {/* SUB-PAINEL: EDITAR FICHA 360° */}
            {activePanel === 'edit' && (
              <form
                onSubmit={handleSaveProfile}
                aria-labelledby={`${uidPrefix}-edit-h`}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border-2 border-amber-400/70 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                  <h2 id={`${uidPrefix}-edit-h`} className="text-xs font-black uppercase text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <Edit3 className="w-4 h-4" /> Atualizar Dados da Ficha do Cliente
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActivePanel('none')}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>

                <fieldset className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  <legend className="sr-only-focusable">Dados pessoais e endereço</legend>
                  <div>
                    <label htmlFor={`${uidPrefix}-name`} className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Nome Completo *</label>
                    <input
                      id={`${uidPrefix}-name`}
                      name="customer_name"
                      type="text"
                      required
                      value={editForm.customer_name}
                      onChange={e => setEditForm({ ...editForm, customer_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uidPrefix}-nick`} className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Apelido / Como é conhecido</label>
                    <input
                      id={`${uidPrefix}-nick`}
                      name="nickname"
                      type="text"
                      value={editForm.nickname}
                      onChange={e => setEditForm({ ...editForm, nickname: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uidPrefix}-cpf`} className="block font-bold text-slate-700 dark:text-slate-300 mb-1">CPF (Usado p/ liberar extrato web)</label>
                    <input
                      id={`${uidPrefix}-cpf`}
                      name="cpf"
                      type="text"
                      inputMode="numeric"
                      value={editForm.cpf}
                      onChange={e => setEditForm({ ...editForm, cpf: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uidPrefix}-rg`} className="block font-bold text-slate-700 dark:text-slate-300 mb-1">RG</label>
                    <input
                      id={`${uidPrefix}-rg`}
                      name="rg"
                      type="text"
                      value={editForm.rg}
                      onChange={e => setEditForm({ ...editForm, rg: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uidPrefix}-birth`} className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Data de Nascimento</label>
                    <input
                      id={`${uidPrefix}-birth`}
                      name="birth_date"
                      type="date"
                      value={editForm.birth_date}
                      onChange={e => setEditForm({ ...editForm, birth_date: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uidPrefix}-phone`} className="block font-bold text-slate-700 dark:text-slate-300 mb-1">WhatsApp / Celular (com DDD)</label>
                    <input
                      id={`${uidPrefix}-phone`}
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      value={editForm.phone}
                      onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uidPrefix}-resp`} className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Responsável / Cuidador (Opcional)</label>
                    <input
                      id={`${uidPrefix}-resp`}
                      name="responsible_name"
                      type="text"
                      placeholder="Ex: Filha Maria"
                      value={editForm.responsible_name}
                      onChange={e => setEditForm({ ...editForm, responsible_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor={`${uidPrefix}-buyers`} className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Compradores Autorizados (separar por vírgula)</label>
                    <input
                      id={`${uidPrefix}-buyers`}
                      name="authorized_buyers"
                      type="text"
                      placeholder="Ex: YASMIM, JOÃO"
                      value={editForm.authorized_buyers}
                      onChange={e => setEditForm({ ...editForm, authorized_buyers: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor={`${uidPrefix}-addr`} className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Endereço (Rua, Av.)</label>
                    <input
                      id={`${uidPrefix}-addr`}
                      name="address"
                      type="text"
                      value={editForm.address}
                      onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uidPrefix}-num`} className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Número / Bairro</label>
                    <div className="flex gap-1.5">
                      <input
                        id={`${uidPrefix}-num`}
                        name="address_number"
                        type="text"
                        placeholder="Nº"
                        value={editForm.address_number}
                        onChange={e => setEditForm({ ...editForm, address_number: e.target.value })}
                        className="w-20 px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                      <input
                        name="neighborhood"
                        aria-label="Bairro"
                        type="text"
                        placeholder="Bairro"
                        value={editForm.neighborhood}
                        onChange={e => setEditForm({ ...editForm, neighborhood: e.target.value })}
                        className="flex-1 px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-3">
                    <label htmlFor={`${uidPrefix}-notes`} className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Observações da Ficha</label>
                    <input
                      id={`${uidPrefix}-notes`}
                      name="notes"
                      type="text"
                      value={editForm.notes}
                      onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                </fieldset>

                {/* Regras de Crédito (Exclusivo Admin) */}
                <fieldset className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                  <legend className="px-2 font-black uppercase text-slate-500 flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5 text-red-600" />
                    Parâmetros de Crédito e Juros {!isAdmin && '(Somente Administrador)'}
                  </legend>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label htmlFor={`${uidPrefix}-limit`} className="block font-bold mb-1">Limite de Crédito (R$)</label>
                      <input
                        id={`${uidPrefix}-limit`}
                        name="credit_limit"
                        type="number"
                        step="10"
                        min="50"
                        disabled={!isAdmin}
                        value={editForm.credit_limit}
                        onChange={e => setEditForm({ ...editForm, credit_limit: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-black disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label htmlFor={`${uidPrefix}-duemode`} className="block font-bold mb-1">Regra de Vencimento</label>
                      <select
                        id={`${uidPrefix}-duemode`}
                        name="due_day_mode"
                        disabled={!isAdmin}
                        value={editForm.due_day_mode}
                        onChange={e => setEditForm({ ...editForm, due_day_mode: e.target.value as 'auto' | 'fixed' })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-bold disabled:opacity-60"
                      >
                        <option value="auto">Automático (por compra/Digifarma)</option>
                        <option value="fixed">Dia Fixo Todo Mês</option>
                      </select>
                    </div>
                    {editForm.due_day_mode === 'fixed' && (
                      <div>
                        <label htmlFor={`${uidPrefix}-dueday`} className="block font-bold mb-1">Dia Fixo do Mês (1 a 28)</label>
                        <input
                          id={`${uidPrefix}-dueday`}
                          name="due_day"
                          type="number"
                          min="1"
                          max="28"
                          disabled={!isAdmin}
                          value={editForm.due_day}
                          onChange={e => setEditForm({ ...editForm, due_day: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-black disabled:opacity-60"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                    <label className="inline-flex items-center gap-2 font-bold cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={!isAdmin}
                        checked={editForm.interest_exempt}
                        onChange={e => setEditForm({ ...editForm, interest_exempt: e.target.checked })}
                        className="w-4 h-4 accent-red-600"
                      />
                      <span>Isentar este cliente de juros e multa por atraso</span>
                    </label>
                    {editForm.interest_exempt && (
                      <input
                        type="text"
                        disabled={!isAdmin}
                        aria-label="Motivo da isenção"
                        placeholder="Motivo opcional (ex: cliente antigo)"
                        value={editForm.interest_exempt_reason}
                        onChange={e => setEditForm({ ...editForm, interest_exempt_reason: e.target.value })}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                      />
                    )}
                  </div>
                </fieldset>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setActivePanel('none')}
                    className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{savingEdit ? 'Salvando...' : 'Salvar Alterações'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* SUB-PAINEL: RECEBER PAGAMENTO */}
            {activePanel === 'receive' && (
              <form
                onSubmit={handleSubmitPayment}
                aria-labelledby={`${uidPrefix}-pay-h`}
                className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border-2 border-emerald-500/60 space-y-3 text-xs"
              >
                <div className="flex items-center justify-between border-b border-emerald-200 dark:border-emerald-800 pb-2">
                  <h2 id={`${uidPrefix}-pay-h`} className="font-black uppercase text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4" /> Registrar Recebimento no Caixa
                  </h2>
                  <button type="button" onClick={() => setActivePanel('none')} className="text-slate-500 font-bold cursor-pointer">
                    Fechar
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Saldo Compras (Principal)</span>
                    <span className="text-base font-black">{formatCurrency(financials.principalBalance)}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Multa + Juros Aplicados</span>
                    <span className="text-base font-black text-amber-600">{formatCurrency(financials.totalCharges)}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700">
                    <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 block">Total Atualizado</span>
                    <span className="text-base font-black text-emerald-700 dark:text-emerald-400">
                      {formatCurrency(
                        waiveInterest && isAdmin ? financials.principalBalance : financials.totalBalance
                      )}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor={`${uidPrefix}-pay-val`} className="block font-bold mb-1">Valor Recebido (R$) *</label>
                    <input
                      id={`${uidPrefix}-pay-val`}
                      name="amount"
                      type="number"
                      step="0.01"
                      min="0"
                      required={!waiveInterest}
                      value={payAmount}
                      onChange={e => setPayAmount(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-black text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uidPrefix}-pay-method`} className="block font-bold mb-1">Forma de Pagamento</label>
                    <select
                      id={`${uidPrefix}-pay-method`}
                      name="paymentMethod"
                      value={payMethod}
                      onChange={e => setPayMethod(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                    >
                      <option value="DINHEIRO">Dinheiro</option>
                      <option value="PIX">PIX</option>
                      <option value="DEBITO">Cartão Débito</option>
                      <option value="CREDITO">Cartão Crédito</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${uidPrefix}-pay-notes`} className="block font-bold mb-1">Observação (Opcional)</label>
                    <input
                      id={`${uidPrefix}-pay-notes`}
                      name="notes"
                      type="text"
                      placeholder="Ex: Pago pela filha"
                      value={payNotes}
                      onChange={e => setPayNotes(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>

                {financials.totalCharges > 0 && (
                  <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-center justify-between gap-2">
                    <label className={`inline-flex items-center gap-2 font-bold ${isAdmin ? 'cursor-pointer' : 'opacity-60'}`}>
                      <input
                        type="checkbox"
                        disabled={!isAdmin}
                        checked={waiveInterest}
                        onChange={e => {
                          const checked = e.target.checked;
                          setWaiveInterest(checked);
                          setPayAmount((checked ? financials.principalBalance : financials.totalBalance).toFixed(2));
                        }}
                        className="w-4 h-4 accent-amber-600"
                      />
                      <span>Abonar / Perdoar Juros e Multa ({formatCurrency(financials.totalCharges)})</span>
                    </label>
                    {!isAdmin && <span className="text-[11px] font-bold text-amber-800">Exclusivo Administrador</span>}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPayAmount((waiveInterest ? financials.principalBalance : financials.totalBalance).toFixed(2))}
                    className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold cursor-pointer"
                  >
                    Preencher Total
                  </button>
                  <button
                    type="submit"
                    disabled={submittingPay}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>{submittingPay ? 'Registrando...' : 'Confirmar Recebimento'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* SUB-PAINEL: LANÇAR COMPRA */}
            {activePanel === 'purchase' && (
              <form
                onSubmit={handleSubmitPurchase}
                aria-labelledby={`${uidPrefix}-pur-h`}
                className="p-4 rounded-2xl bg-red-50/70 dark:bg-red-950/20 border-2 border-red-400/60 space-y-3 text-xs"
              >
                <div className="flex items-center justify-between border-b border-red-200 dark:border-red-900 pb-2">
                  <h2 id={`${uidPrefix}-pur-h`} className="font-black uppercase text-red-700 dark:text-red-400 flex items-center gap-1.5">
                    <ShoppingBag className="w-4 h-4" /> Lançar Nova Compra no Crediário (Belinha)
                  </h2>
                  <button type="button" onClick={() => setActivePanel('none')} className="text-slate-500 font-bold cursor-pointer">
                    Fechar
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor={`${uidPrefix}-pur-val`} className="block font-bold mb-1">Valor Total (R$) *</label>
                    <input
                      id={`${uidPrefix}-pur-val`}
                      name="amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={purchaseAmount}
                      onChange={e => setPurchaseAmount(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-black text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uidPrefix}-pur-buyer`} className="block font-bold mb-1">Quem retirou? (Comprador)</label>
                    <input
                      id={`${uidPrefix}-pur-buyer`}
                      name="buyerName"
                      type="text"
                      placeholder="Ex: Próprio cliente ou familiar"
                      value={purchaseBuyer}
                      onChange={e => setPurchaseBuyer(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${uidPrefix}-pur-due`} className="block font-bold mb-1">Vencimento (Opcional)</label>
                    <input
                      id={`${uidPrefix}-pur-due`}
                      name="dueDate"
                      type="date"
                      value={purchaseDueDate}
                      onChange={e => setPurchaseDueDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label htmlFor={`${uidPrefix}-pur-desc`} className="block font-bold mb-1">Produtos / Descrição *</label>
                    <input
                      id={`${uidPrefix}-pur-desc`}
                      name="description"
                      type="text"
                      required
                      placeholder="Ex: Losartana 50mg + Fralda Geriátrica G"
                      value={purchaseDesc}
                      onChange={e => setPurchaseDesc(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>

                {isAdmin && (financials.isBlocked || financials.availableCredit <= 0) && (
                  <label className="inline-flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={purchaseBypassLock}
                      onChange={e => setPurchaseBypassLock(e.target.checked)}
                      className="w-4 h-4 accent-red-600"
                    />
                    <span>Autorizar compra excepcionalmente acima do limite / bloqueio (Admin)</span>
                  </label>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingPurchase}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black shadow cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>{submittingPurchase ? 'Lançando...' : 'Autorizar e Lançar Compra'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* SUB-PAINEL: MENSAGEM WHATSAPP */}
            {activePanel === 'whatsapp' && (
              <div className="p-4 rounded-2xl bg-teal-50/70 dark:bg-teal-950/30 border-2 border-teal-500/50 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-teal-200 dark:border-teal-800 pb-2">
                  <h2 className="font-black uppercase text-teal-800 dark:text-teal-300 flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4" /> Enviar Mensagem no WhatsApp
                  </h2>
                  <button type="button" onClick={() => setActivePanel('none')} className="text-slate-500 font-bold cursor-pointer">
                    Fechar
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor={`${uidPrefix}-wa-tpl`} className="block font-bold mb-1">Modelo de Mensagem</label>
                    <select
                      id={`${uidPrefix}-wa-tpl`}
                      value={waTemplate}
                      onChange={e => setWaTemplate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                    >
                      {Object.entries(TEMPLATE_LABELS).map(([k, lbl]) => (
                        <option key={k} value={k}>{lbl}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${uidPrefix}-wa-phone`} className="block font-bold mb-1">WhatsApp Destino</label>
                    <input
                      id={`${uidPrefix}-wa-phone`}
                      type="tel"
                      placeholder="Ex: 32999999999"
                      value={waPhone}
                      onChange={e => setWaPhone(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                    />
                  </div>
                  {waTemplate === 'purchase' && simple.purchaseGroups.length > 0 && (
                    <div>
                      <label htmlFor={`${uidPrefix}-wa-sale`} className="block font-bold mb-1">Compra de Referência</label>
                      <select
                        id={`${uidPrefix}-wa-sale`}
                        value={waSaleId}
                        onChange={e => setWaSaleId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      >
                        <option value="">Compra mais recente</option>
                        {simple.purchaseGroups.map((g: any) => (
                          <option key={g.key} value={g.saleId}>
                            {formatDateBR(g.date)} — {formatCurrency(g.subtotal)} ({g.buyerName || 'Cliente'})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor={`${uidPrefix}-wa-text`} className="block font-bold mb-1">
                    Texto da Mensagem {loadingPreview && '(Gerando...)'}
                  </label>
                  <textarea
                    id={`${uidPrefix}-wa-text`}
                    rows={6}
                    value={waText}
                    onChange={e => setWaText(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-sans text-xs leading-relaxed"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={sendingWa || !waText.trim()}
                    onClick={() => handleSendWa('copy')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-bold cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Mensagem</span>
                  </button>
                  <button
                    type="button"
                    disabled={sendingWa || !waText.trim()}
                    onClick={() => handleSendWa('wa_me')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-100 text-emerald-900 hover:bg-emerald-200 border border-emerald-300 font-black cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Abrir no WhatsApp Web</span>
                  </button>
                  <button
                    type="button"
                    disabled={sendingWa || !waText.trim()}
                    onClick={() => handleSendWa('auto')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{sendingWa ? 'Enviando...' : 'Enviar Direto pelo Servidor'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* RESUMO 360° DA FICHA & LINK DO PORTAL */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Ficha Cadastral */}
              <div className="lg:col-span-5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                  Dados da Ficha do Cliente
                </h2>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">CPF</span>
                    <span className="font-mono font-bold">{card.cpf || <em className="text-amber-600">Sem CPF</em>}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">WhatsApp</span>
                    {card.phone ? (
                      <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {card.phone}
                      </span>
                    ) : (
                      <em className="text-amber-600">Sem WhatsApp</em>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Nascimento / RG</span>
                    <span className="font-semibold">
                      {card.birth_date ? formatDateBR(card.birth_date) : '-'} {card.rg ? `• RG ${card.rg}` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] font-bold uppercase">Responsável / Cuidador</span>
                    <span className="font-semibold inline-flex items-center gap-1">
                      <UserCheck className="w-3 h-3 text-slate-400" />
                      {card.responsible_name || '-'}
                    </span>
                  </div>
                </div>

                {(card.address || card.neighborhood) && (
                  <div className="pt-1 text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                    <span>
                      {[card.address, card.address_number, card.neighborhood, card.city].filter(Boolean).join(', ')}
                      {card.address_reference ? ` (Ref: ${card.address_reference})` : ''}
                    </span>
                  </div>
                )}

                <div className="pt-1">
                  <span className="text-slate-400 block text-[10px] font-bold uppercase mb-1">
                    Compradores Autorizados
                  </span>
                  {Array.isArray(card.authorized_buyers) && card.authorized_buyers.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {card.authorized_buyers.map((b: string) => (
                        <span
                          key={b}
                          className="px-2 py-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 text-[10px] font-black uppercase"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-400">Somente o titular</span>
                  )}
                </div>
              </div>

              {/* Limites, Encargos & Portal do Cliente */}
              <div className="lg:col-span-7 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-black uppercase text-[11px] text-slate-500">Limite &amp; Saldo Devedor Atualizado</span>
                    <span className="font-mono font-bold text-slate-600 dark:text-slate-300">
                      {limitPercent}% usado • Vencimento:{' '}
                      <strong>{financials.nextDueDate ? formatDateBR(financials.nextDueDate) : `Todo dia ${card.due_day}`}</strong>
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        limitPercent >= 90 ? 'bg-red-600' : limitPercent >= 70 ? 'bg-amber-500' : 'bg-emerald-600'
                      }`}
                      style={{ width: `${limitPercent}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Compras (Principal)</span>
                    <span className="text-sm font-black">{formatCurrency(financials.principalBalance)}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] font-bold uppercase text-amber-600 block">Juros + Multa</span>
                    <span className="text-sm font-black text-amber-600">
                      {formatCurrency(financials.totalCharges)}
                    </span>
                    {!financials.chargesApplied && financials.simulatedCharges > 0 && (
                      <span className="block text-[9px] text-slate-400">
                        Simulado: {formatCurrency(financials.simulatedCharges)}
                      </span>
                    )}
                  </div>
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900">
                    <span className="text-[10px] font-bold uppercase text-red-600 block">Total a Pagar</span>
                    <span className="text-base font-black text-red-600">{formatCurrency(financials.totalBalance)}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900">
                    <span className="text-[10px] font-bold uppercase text-emerald-600 block">Disponível</span>
                    <span className="text-sm font-black text-emerald-600">{formatCurrency(financials.availableCredit)}</span>
                  </div>
                </div>

                {/* Portal Pessoal Fixo do Cliente */}
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase text-slate-400 block">
                      Link Fixo do Portal do Cliente (Extrato + PIX)
                    </span>
                    <span className="font-mono text-[11px] text-sky-700 dark:text-sky-400 truncate block">
                      {profile.portalUrl}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleCopyPortalLink}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 font-bold cursor-pointer"
                    >
                      {copiedPortal ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedPortal ? 'Copiado' : 'Copiar'}</span>
                    </button>
                    <a
                      href={`/minha-conta/${card.portal_token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 font-bold hover:bg-sky-100"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Abrir</span>
                    </a>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={handleRegenerateToken}
                        title="Gerar novo link de segurança (invalida o link anterior)"
                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 text-slate-600 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ALTERNADOR DE VISÃO DO EXTRATO */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
              <div className="inline-flex rounded-2xl bg-slate-100 dark:bg-slate-800 p-1 gap-1">
                <button
                  type="button"
                  aria-pressed={viewMode === 'simple'}
                  onClick={() => setViewMode('simple')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                    viewMode === 'simple'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white/60'
                  }`}
                >
                  🟢 Modo Simples (Cliente / Idosos)
                </button>
                <button
                  type="button"
                  aria-pressed={viewMode === 'complete'}
                  onClick={() => setViewMode('complete')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                    viewMode === 'complete'
                      ? 'bg-slate-900 dark:bg-red-600 text-white shadow'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white/60'
                  }`}
                >
                  🏦 Extrato Completo (Auditoria)
                </button>
                <button
                  type="button"
                  aria-pressed={viewMode === 'messages'}
                  onClick={() => setViewMode('messages')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                    viewMode === 'messages'
                      ? 'bg-teal-600 text-white shadow'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white/60'
                  }`}
                >
                  💬 Histórico WhatsApp ({profile.messageHistory?.length || 0})
                </button>
              </div>
            </div>

            {/* VISÃO 1: EXTRATO SIMPLES (FOCO EM IDOSOS) */}
            {viewMode === 'simple' && (
              <div className="space-y-4">
                <div
                  className={`p-4 rounded-2xl border-2 flex items-start gap-3 ${
                    simple.milestone.type === 'zeroed'
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/60 text-emerald-950 dark:text-emerald-200'
                      : 'bg-sky-50 dark:bg-sky-950/30 border-sky-500/50 text-sky-950 dark:text-sky-200'
                  }`}
                >
                  <CheckCircle
                    className={`w-6 h-6 shrink-0 mt-0.5 ${
                      simple.milestone.type === 'zeroed' ? 'text-emerald-600' : 'text-sky-600'
                    }`}
                  />
                  <div>
                    <p className="text-sm sm:text-base font-black">{simple.milestone.label}</p>
                    <p className="text-xs sm:text-sm opacity-90">{simple.milestone.sublabel}</p>
                  </div>
                </div>

                {simple.localCreditApplied > 0 && (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 text-xs font-bold text-amber-900 dark:text-amber-200">
                    ℹ️ Existe um abatimento/crédito registrado no Belinha de {formatCurrency(simple.localCreditApplied)} já descontado do total abaixo.
                  </div>
                )}

                {simple.purchaseGroups.length === 0 ? (
                  <div className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 text-center space-y-1">
                    <CheckCircle className="w-10 h-10 text-emerald-600 mx-auto" />
                    <p className="text-sm font-black">Conta 100% em dia e zerada!</p>
                    <p className="text-xs text-slate-500">Não existem compras em aberto para este cliente.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {simple.purchaseGroups.map((grp: any) => (
                      <div
                        key={grp.key}
                        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 overflow-hidden shadow-2xs"
                      >
                        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-slate-900 dark:text-white inline-flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-red-600" />
                              Compra em {formatDateBR(grp.date)}
                            </span>
                            {grp.buyerName && (
                              <span className="px-2 py-0.5 rounded-lg bg-slate-200 dark:bg-slate-700 font-black uppercase text-[10px]">
                                Retirado por: {grp.buyerName}
                              </span>
                            )}
                            {grp.daysLate > 0 && (
                              <span className="px-2 py-0.5 rounded-lg bg-red-100 text-red-700 font-black text-[10px]">
                                Venceu em {formatDateBR(grp.dueDate)} ({grp.daysLate}d atraso)
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm text-slate-900 dark:text-white">
                              Subtotal: {formatCurrency(grp.subtotal)}
                            </span>
                            {grp.saleId && (
                              <button
                                type="button"
                                onClick={() => {
                                  setWaSaleId(grp.saleId);
                                  setWaTemplate('purchase');
                                  setActivePanel('whatsapp');
                                }}
                                title="Avisar esta compra no WhatsApp"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[11px] font-bold cursor-pointer"
                              >
                                <Send className="w-3 h-3" />
                                <span>Avisar</span>
                              </button>
                            )}
                          </div>
                        </div>

                        <ul className="divide-y divide-slate-100 dark:divide-slate-800/80">
                          {grp.items.map((it: any) => (
                            <li key={it.id} className="px-4 py-2 flex items-center justify-between gap-3 text-xs sm:text-sm">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                <strong className="font-black">{it.quantity}x</strong> {it.productName}
                              </span>
                              <span className="font-black font-mono shrink-0 text-slate-900 dark:text-white">
                                {formatCurrency(it.totalPrice)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                {simple.paymentsAfterMilestone?.length > 0 && (
                  <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 space-y-2">
                    <h3 className="text-xs font-black uppercase text-emerald-800 dark:text-emerald-300">
                      Pagamentos Parciais Já Abatidos Depois Dessa Data
                    </h3>
                    <ul className="space-y-1 text-xs">
                      {simple.paymentsAfterMilestone.map((p: any) => (
                        <li key={p.id} className="flex justify-between font-bold text-emerald-700 dark:text-emerald-300">
                          <span>{formatDateBR(p.date)} — Pagamento ({p.method})</span>
                          <span>- {formatCurrency(p.amountPaid)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* VISÃO 2: EXTRATO COMPLETO (ESTILO BANCÁRIO / AUDITORIA) */}
            {viewMode === 'complete' && (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setCompleteFilter('all')}
                      className={`px-3 py-1 rounded-lg cursor-pointer ${completeFilter === 'all' ? 'bg-white dark:bg-slate-900 shadow' : 'text-slate-500'}`}
                    >
                      Tudo
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompleteFilter('DEBITO')}
                      className={`px-3 py-1 rounded-lg cursor-pointer ${completeFilter === 'DEBITO' ? 'bg-white dark:bg-slate-900 text-red-600 shadow' : 'text-slate-500'}`}
                    >
                      Compras (+)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompleteFilter('CREDITO')}
                      className={`px-3 py-1 rounded-lg cursor-pointer ${completeFilter === 'CREDITO' ? 'bg-white dark:bg-slate-900 text-emerald-600 shadow' : 'text-slate-500'}`}
                    >
                      Pagamentos (-)
                    </button>
                  </div>

                  <search className="relative flex-1 max-w-xs">
                    <label htmlFor={`${uidPrefix}-search-complete`} className="sr-only-focusable">Buscar no extrato completo</label>
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id={`${uidPrefix}-search-complete`}
                      type="search"
                      placeholder="Buscar produto ou recibo..."
                      value={completeSearch}
                      onChange={e => setCompleteSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                    />
                  </search>
                </div>

                <div
                  tabIndex={0}
                  role="region"
                  aria-labelledby={`${uidPrefix}-comp-cap`}
                  className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800"
                >
                  <table className="w-full text-left border-collapse text-xs">
                    <caption id={`${uidPrefix}-comp-cap`} className="sr-only-focusable">
                      Extrato bancário completo da conta de crediário
                    </caption>
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase text-slate-500">
                        <th scope="col" className="px-3 py-2.5 whitespace-nowrap">Data</th>
                        <th scope="col" className="px-3 py-2.5 whitespace-nowrap">Histórico / Itens</th>
                        <th scope="col" className="px-3 py-2.5 whitespace-nowrap">Tipo</th>
                        <th scope="col" className="px-3 py-2.5 text-right whitespace-nowrap">Valor</th>
                        <th scope="col" className="px-3 py-2.5 text-right whitespace-nowrap">Saldo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredCompleteEntries.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400">Nenhum lançamento encontrado.</td>
                        </tr>
                      ) : (
                        filteredCompleteEntries.map((entry: any) => (
                          <tr key={entry.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                            <td className="px-3 py-2 whitespace-nowrap font-mono font-bold text-slate-600 dark:text-slate-300 align-top">
                              {formatDateBR(entry.date)}
                            </td>
                            <td className="px-3 py-2 align-top">
                              <div className="font-black text-slate-900 dark:text-white">{entry.title}</div>
                              <div className="text-[11px] text-slate-500">{entry.subtitle}</div>
                              {Array.isArray(entry.items) && entry.items.length > 0 && (
                                <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                                  {entry.items.map((it: any) => (
                                    <li key={it.id}>
                                      • {it.quantity}x {it.productName} ({formatCurrency(it.totalPrice)})
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap align-top">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase inline-flex items-center gap-1 ${
                                entry.type === 'CREDITO'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : entry.type === 'ENCARGO'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}>
                                {entry.type === 'CREDITO' ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                                {entry.type}
                              </span>
                            </td>
                            <td className={`px-3 py-2 text-right whitespace-nowrap font-mono font-black align-top ${
                              entry.type === 'CREDITO' ? 'text-emerald-600' : 'text-red-600'
                            }`}>
                              {entry.type === 'CREDITO' ? `- ${formatCurrency(entry.amount)}` : `+ ${formatCurrency(entry.amount)}`}
                            </td>
                            <td className="px-3 py-2 text-right whitespace-nowrap font-mono font-bold text-slate-700 dark:text-slate-300 align-top">
                              {entry.runningBalance !== null && entry.runningBalance !== undefined
                                ? formatCurrency(entry.runningBalance)
                                : '-'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
                    <span className="text-[10px] font-bold uppercase text-emerald-700 block">Pago nos últimos 90 dias</span>
                    <span className="text-sm font-black text-emerald-700">{formatCurrency(complete.summary.totalPaid90d)}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-bold uppercase text-slate-500 block">Compras em Aberto</span>
                    <span className="text-sm font-black">{formatCurrency(complete.summary.openPrincipal)}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
                    <span className="text-[10px] font-bold uppercase text-red-700 block">Saldo Total Atualizado</span>
                    <span className="text-sm font-black text-red-700">{formatCurrency(complete.summary.totalDue)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* VISÃO 3: HISTÓRICO WHATSAPP */}
            {viewMode === 'messages' && (
              <div className="space-y-2">
                {(!profile.messageHistory || profile.messageHistory.length === 0) ? (
                  <div className="py-10 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-slate-200 dark:border-slate-800">
                    Nenhuma mensagem registrada para este cliente ainda.
                  </div>
                ) : (
                  profile.messageHistory.map((m: any) => (
                    <div key={m.id} className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black uppercase text-[10px] px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800">
                          {TEMPLATE_LABELS[m.template_type] || m.template_type} • via {m.channel}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {m.created_at} • por {m.sent_by || 'Sistema'}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed">
                        {m.message_text}
                      </p>
                      {m.error_message && (
                        <p className="text-[10px] text-amber-700 font-bold">Obs: {m.error_message}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* RODAPÉ */}
      <div className="px-5 py-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs shrink-0">
        <span className="text-slate-500 inline-flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-red-600" />
          Base Unificada Digifarma + Belinha
        </span>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white font-bold cursor-pointer hover:bg-slate-800"
        >
          Fechar Ficha
        </button>
      </div>
    </dialog>
  );
};
