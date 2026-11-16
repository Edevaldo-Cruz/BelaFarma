import React, { useState, useEffect } from 'react';
import { CreditCard, Calendar, CheckCircle2, X, AlertCircle, Sparkles, DollarSign, Clock } from 'lucide-react';
import { useToast } from './ToastContext';

interface CreditCardPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (val: number) => void;
  userName?: string;
}

export const CreditCardPromptModal: React.FC<CreditCardPromptModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  userName = 'Edevaldo'
}) => {
  const { addToast } = useToast();
  const [amountStr, setAmountStr] = useState<string>('1511,66');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isFetchingCurrent, setIsFetchingCurrent] = useState<boolean>(true);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthNum = now.getMonth() + 1;
  const currentMonthStr = String(currentMonthNum).padStart(2, '0');
  const monthKey = `${currentYear}-${currentMonthStr}`;
  const monthName = now.toLocaleString('pt-BR', { month: 'long' });
  const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  // Busca o valor atual cadastrado nas configurações
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsFetchingCurrent(true);

    const loadCardInvoice = async () => {
      try {
        const res = await fetch(`/api/settings/credit_card_invoice_${currentYear}_${currentMonthStr}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.value && isMounted) {
            const num = Number(data.value);
            if (!isNaN(num) && num > 0) {
              setAmountStr(num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
            }
          }
        }
      } catch (err) {
        console.error('Erro ao buscar fatura do cartão:', err);
      } finally {
        if (isMounted) setIsFetchingCurrent(false);
      }
    };

    loadCardInvoice();

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentYear, currentMonthStr]);

  if (!isOpen) return null;

  const parseInputAmount = (val: string): number => {
    if (!val) return 0;
    const clean = val.replace(/[^\d,\.]/g, '').replace(/\./g, '').replace(',', '.');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  const parsedAmount = parseInputAmount(amountStr);
  const dailyProvision15Days = parsedAmount > 0 ? parsedAmount / 15 : 0;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(`belafarma_cc_prompt_dismissed_${monthKey}`, 'true');
    } catch (e) {}
    onClose();
  };

  const handleSave = async () => {
    if (parsedAmount <= 0) {
      addToast('Por favor, informe um valor válido para a fatura.', 'warning');
      return;
    }

    setIsLoading(true);
    try {
      const token = localStorage.getItem('belinha_auth_token') || '';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // 1. Salvar em system_settings para a competência do mês e atual
      await Promise.all([
        fetch(`/api/settings/credit_card_invoice_${currentYear}_${currentMonthStr}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ value: parsedAmount.toFixed(2) })
        }),
        fetch('/api/settings/credit_card_current_invoice', {
          method: 'PUT',
          headers,
          body: JSON.stringify({ value: parsedAmount.toFixed(2) })
        }),
        fetch('/api/settings/credit_card_confirmed_month', {
          method: 'PUT',
          headers,
          body: JSON.stringify({ value: monthKey })
        })
      ]);

      // 2. Atualizar ou criar na tabela de contas fixas
      try {
        const getFixedRes = await fetch('/api/fixed-accounts', { headers });
        if (getFixedRes.ok) {
          const fixedAccounts = await getFixedRes.json();
          const existing = (fixedAccounts || []).find((f: any) => 
            f.id === 'fa_cartao_credito' || 
            (f.name && (f.name.toLowerCase().includes('cartão') || f.name.toLowerCase().includes('cartao')))
          );

          if (existing) {
            await fetch(`/api/fixed-accounts/${existing.id}`, {
              method: 'PUT',
              headers,
              body: JSON.stringify({
                name: 'Cartão de Crédito (Fatura)',
                value: parsedAmount,
                dueDay: 16,
                isActive: true
              })
            });
          } else {
            await fetch('/api/fixed-accounts', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                id: 'fa_cartao_credito',
                name: 'Cartão de Crédito (Fatura)',
                value: parsedAmount,
                dueDay: 16,
                isActive: true
              })
            });
          }
        }
      } catch (fErr) {
        console.warn('Aviso ao sincronizar conta fixa do cartão:', fErr);
      }

      // 3. Marca como dispensado para esta sessão
      sessionStorage.setItem(`belafarma_cc_prompt_dismissed_${monthKey}`, 'true');

      // 4. Dispara evento global para o ProvisionsPanel e Financial atualizarem
      window.dispatchEvent(new CustomEvent('belafarma_credit_card_updated', {
        detail: { value: parsedAmount, monthKey }
      }));

      addToast(
        `💳 Fatura de R$ ${parsedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} salva com sucesso!`,
        'success'
      );

      if (onSuccess) onSuccess(parsedAmount);
      onClose();
    } catch (err) {
      console.error('Erro ao salvar fatura do cartão:', err);
      addToast('Erro ao salvar fatura do cartão. Tente novamente.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cc-prompt-title"
      >
        {/* Cabeçalho */}
        <div className="p-6 bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-white relative">
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
            title="Lembrar mais tarde"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-500/20 border border-indigo-400/30 rounded-2xl text-indigo-300">
              <CreditCard className="w-7 h-7" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-amber-300" /> Previsibilidade Financeira • Exclusivo {userName}
              </span>
              <h2 id="cc-prompt-title" className="text-xl font-black text-white tracking-tight mt-0.5">
                Fatura do Cartão de Crédito
              </h2>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs font-bold bg-white/10 px-3.5 py-1.5 rounded-xl border border-white/10 w-fit">
            <Calendar className="w-3.5 h-3.5 text-indigo-300" />
            <span>Competência: {capitalizedMonth} / {currentYear}</span>
            <span className="text-slate-400">•</span>
            <span className="text-amber-300 font-black">Vencimento: Dia 16</span>
          </div>
        </div>

        {/* Corpo */}
        <div className="p-6 space-y-5">
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Olá <strong>{userName}</strong>! Para mantermos o fluxo de caixa da farmácia e as provisões diárias 100% previsíveis, informe o valor da fatura que fecha para o dia 16 deste mês:
          </p>

          {/* Campo de Entrada de Valor */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
              Valor Total da Fatura (R$)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black text-lg">
                R$
              </span>
              <input
                type="text"
                autoFocus
                disabled={isLoading || isFetchingCurrent}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                }}
                placeholder="0,00"
                className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-indigo-200 dark:border-indigo-900 focus:border-indigo-600 rounded-2xl text-2xl font-black text-slate-900 dark:text-white outline-none transition-all shadow-inner"
              />
            </div>
          </div>

          {/* Card de Simulação das Caixinhas */}
          {parsedAmount > 0 && (
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/30 border border-indigo-100 dark:border-indigo-800/50 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-black text-indigo-900 dark:text-indigo-200">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Divisão Automática das Caixinhas:
                </span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-extrabold text-[10px]">
                  15 Dias de Venda
                </span>
              </div>

              <div className="flex items-baseline justify-between pt-1 border-t border-indigo-100 dark:border-indigo-800/40">
                <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                  Separação diária sugerida (01 a 15):
                </span>
                <span className="text-base font-black text-indigo-700 dark:text-indigo-300">
                  R$ {dailyProvision15Days.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-500">/dia</span>
                </span>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                💡 O valor entra somado na <strong>Caixinha de Contas Fixas (Despesas Operacionais)</strong>, garantindo que no dia 16 o dinheiro já esteja reservado sem pesar no saldo bancário.
              </p>
            </div>
          )}
        </div>

        {/* Rodapé / Ações */}
        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleDismiss}
            disabled={isLoading}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-all order-2 sm:order-1"
          >
            Lembrar mais tarde
          </button>

          <div className="w-full sm:w-auto flex items-center gap-2 order-1 sm:order-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isLoading || parsedAmount <= 0}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-indigo-600/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>Salvando...</>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Salvar e Provisionar
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
