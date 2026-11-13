import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Calendar,
  Lock,
  Unlock,
  Copy,
  Check,
  Phone,
  ShieldCheck,
  Receipt,
  AlertCircle,
  Clock,
  Sparkles
} from 'lucide-react';

interface InvoicePublicData {
  id: string;
  customer_first_name: string;
  total_due: number;
  paid_amount: number;
  balance: number;
  due_date: string;
  status: string;
  pix_copia_cola?: string;
  has_cpf: boolean;
}

interface InvoiceItem {
  id: string;
  purchased_at: string;
  description: string;
  amount: number;
}

interface CrediarioPublicInvoiceProps {
  invoiceId: string;
}

export const CrediarioPublicInvoice: React.FC<CrediarioPublicInvoiceProps> = ({ invoiceId }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<InvoicePublicData | null>(null);

  // Desbloqueio dos itens por CPF
  const [cpfDigits, setCpfDigits] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string>('');
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [copiedPix, setCopiedPix] = useState(false);

  const formatCurrency = (val: number) => {
    return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return new Date(dateStr).toLocaleDateString('pt-BR');
    } catch {
      return dateStr;
    }
  };

  useEffect(() => {
    const fetchInvoice = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/cards/public/invoice/${encodeURIComponent(invoiceId)}`);
        const data = await res.json();
        if (res.ok && data.success && data.invoice) {
          setInvoice(data.invoice);
          // Se o cliente não tem CPF registrado, já pode desbloquear direto
          if (!data.invoice.has_cpf) {
            handleUnlockWithoutCpf();
          }
        } else {
          setError(data.error || 'Fatura não encontrada ou encerrada.');
        }
      } catch (err) {
        setError('Não foi possível carregar a fatura. Verifique sua conexão.');
      } finally {
        setLoading(false);
      }
    };

    fetchInvoice();
  }, [invoiceId]);

  const handleUnlockWithoutCpf = async () => {
    try {
      const res = await fetch(`/api/cards/public/invoice/${encodeURIComponent(invoiceId)}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpfDigits: '' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsUnlocked(true);
        setFullName(data.customer_name);
        setItems(data.items || []);
      }
    } catch {}
  };

  const handleUnlockWithCpf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cpfDigits || cpfDigits.length < 3) {
      setUnlockError('Digite os 3 primeiros dígitos do seu CPF.');
      return;
    }

    setUnlockLoading(true);
    setUnlockError(null);
    try {
      const res = await fetch(`/api/cards/public/invoice/${encodeURIComponent(invoiceId)}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpfDigits: cpfDigits.slice(0, 3) })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsUnlocked(true);
        setFullName(data.customer_name);
        setItems(data.items || []);
      } else {
        setUnlockError(data.error || 'Os dígitos informados não conferem.');
      }
    } catch (err) {
      setUnlockError('Erro ao validar dados. Tente novamente.');
    } finally {
      setUnlockLoading(false);
    }
  };

  const handleCopyPix = () => {
    const pixCode = invoice?.pix_copia_cola || '31.144.152/0001-44';
    navigator.clipboard.writeText(pixCode);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 3000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl text-center space-y-4 max-w-sm w-full">
          <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-bold text-slate-700">Carregando sua fatura...</p>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl text-center space-y-4 max-w-sm w-full">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-black text-slate-900">Ops! Fatura não encontrada</h2>
          <p className="text-xs text-slate-500">{error || 'Verifique o link enviado no seu WhatsApp.'}</p>
        </div>
      </div>
    );
  }

  const isPaid = invoice.status === 'paid' || invoice.balance <= 0;

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4 flex justify-center">
      <div className="w-full max-w-md space-y-4">
        {/* Topo: Logo & Identificação */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 text-center space-y-3">
          <div className="inline-block bg-white px-3 py-1 rounded-xl shadow-2xs border border-slate-200">
            <img src="/images/logo-bela-farma.jpg" alt="Bela Farma Sul" className="h-8 w-auto object-contain mx-auto" />
          </div>

          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Crediário Digital Bela Farma
            </span>
            <h1 className="text-xl font-black text-slate-900">
              Olá, {fullName || invoice.customer_first_name}!
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Aqui está o extrato da sua conta para acompanhamento.
            </p>
          </div>

          {/* Card de Valor e Vencimento */}
          <div className={`p-5 rounded-2xl border text-center space-y-1 ${
            isPaid
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-gradient-to-br from-red-600 to-amber-600 text-white shadow-md'
          }`}>
            <span className={`text-[10px] font-black uppercase tracking-wider ${isPaid ? 'text-emerald-700' : 'text-white/80'}`}>
              {isPaid ? 'Fatura Paga / Quitada' : 'Total a Pagar'}
            </span>
            <p className="text-3xl font-black">
              {formatCurrency(isPaid ? invoice.total_due : invoice.balance)}
            </p>
            <div className={`text-xs font-bold inline-flex items-center gap-1.5 ${isPaid ? 'text-emerald-600' : 'text-white/90'}`}>
              <Calendar className="w-3.5 h-3.5" />
              <span>Vencimento: {formatDate(invoice.due_date)}</span>
            </div>
          </div>

          {/* Botão de Pagamento PIX */}
          {!isPaid && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleCopyPix}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer active:scale-98"
              >
                {copiedPix ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Chave PIX Copiada com Sucesso!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar Chave PIX (Pagar Agora)</span>
                  </>
                )}
              </button>
              <p className="text-[10px] text-slate-400 mt-1.5">
                Basta colar a chave no aplicativo do seu banco para pagar.
              </p>
            </div>
          )}
        </div>

        {/* Seção de Extrato Detalhado com Proteção de Privacidade */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-red-600" />
              <h2 className="text-sm font-black uppercase text-slate-900">
                Itens Comprados
              </h2>
            </div>
            {isUnlocked && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                Liberado
              </span>
            )}
          </div>

          {!isUnlocked ? (
            <form onSubmit={handleUnlockWithCpf} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center gap-2 text-amber-700 text-xs font-bold">
                <Lock className="w-4 h-4 shrink-0 text-amber-600" />
                <span>Por privacidade, confirme os 3 primeiros dígitos do seu CPF:</span>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={3}
                  pattern="\d{3}"
                  placeholder="Ex: 123"
                  value={cpfDigits}
                  onChange={e => setCpfDigits(e.target.value.replace(/\D/g, ''))}
                  className="w-24 text-center px-3 py-2 bg-white border-2 border-slate-200 rounded-xl font-black text-lg outline-none focus:border-red-500 tracking-widest"
                />
                <button
                  type="submit"
                  disabled={unlockLoading || cpfDigits.length < 3}
                  className="flex-1 py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs shadow-xs disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {unlockLoading ? 'Conferindo...' : 'Ver Meus Itens'}
                </button>
              </div>

              {unlockError && (
                <p className="text-[11px] font-bold text-red-600">{unlockError}</p>
              )}
            </form>
          ) : (
            <div className="space-y-2">
              {items.length === 0 ? (
                <p className="text-center py-4 text-xs text-slate-400 font-semibold">
                  Compras consolidadas no balcão da farmácia.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto pr-1">
                  {items.map(it => (
                    <div key={it.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-slate-800">{it.description}</p>
                        <p className="text-[10px] text-slate-400 font-medium">
                          {formatDate(it.purchased_at?.split('T')[0] || it.purchased_at)}
                        </p>
                      </div>
                      <span className="font-black text-slate-900">
                        {formatCurrency(it.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé e Suporte WhatsApp */}
        <div className="text-center space-y-1.5 pt-2">
          <p className="text-[11px] text-slate-400 font-medium">
            Farmácia Bela Farma Sul • CNPJ: 31.144.152/0001-44
          </p>
          <a
            href="https://wa.me/5535999999999"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-700 hover:underline"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Falar com o atendente no WhatsApp</span>
          </a>
        </div>
      </div>
    </div>
  );
};
