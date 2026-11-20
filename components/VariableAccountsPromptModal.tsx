import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Calendar, 
  CheckCircle2, 
  X, 
  AlertCircle, 
  Sparkles, 
  DollarSign, 
  Clock, 
  Zap, 
  Cloud, 
  Landmark, 
  FileText 
} from 'lucide-react';
import { useToast } from './ToastContext';

interface VariableAccountsPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  userName?: string;
}

interface VariableAccountItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  dueDay: number;
  fixedAccountId?: string;
  fixedAccountNameMatch: string[];
  settingKey: string;
  defaultVal: number;
  description: string;
}

export const VariableAccountsPromptModal: React.FC<VariableAccountsPromptModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  userName = 'Edevaldo'
}) => {
  const { addToast } = useToast();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isFetchingCurrent, setIsFetchingCurrent] = useState<boolean>(true);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthNum = now.getMonth() + 1;
  const currentMonthStr = String(currentMonthNum).padStart(2, '0');
  const monthKey = `${currentYear}-${currentMonthStr}`;
  const monthName = now.toLocaleString('pt-BR', { month: 'long' });
  const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  // Definição das 5 contas variáveis que o Edevaldo informará no início do mês
  const accountsConfig: VariableAccountItem[] = [
    {
      key: 'credit_card',
      label: 'Cartão de Crédito (Farmácia)',
      icon: <CreditCard className="w-5 h-5 text-indigo-500" />,
      dueDay: 16,
      fixedAccountId: 'fa_cartao_credito',
      fixedAccountNameMatch: ['cartão', 'cartao'],
      settingKey: `credit_card_invoice_${currentYear}_${currentMonthStr}`,
      defaultVal: 1511.66,
      description: 'Fatura de compras e despesas da farmácia'
    },
    {
      key: 'simples_nacional',
      label: 'Simples Nacional (DAS)',
      icon: <Landmark className="w-5 h-5 text-blue-500" />,
      dueDay: 20,
      fixedAccountId: 'fa_1769686108191',
      fixedAccountNameMatch: ['simples nacional', 'simples'],
      settingKey: `simples_nacional_invoice_${currentYear}_${currentMonthStr}`,
      defaultVal: 1000.00,
      description: 'Guia apurada do imposto Simples Nacional do mês'
    },
    {
      key: 'inss_receita',
      label: 'INSS / Receita Federal',
      icon: <FileText className="w-5 h-5 text-teal-500" />,
      dueDay: 20,
      fixedAccountId: 'fa_1769686802949',
      fixedAccountNameMatch: ['receita federal', 'inss'],
      settingKey: `inss_receita_invoice_${currentYear}_${currentMonthStr}`,
      defaultVal: 1100.00,
      description: 'Guia DARF de INSS e tributos federais da competência'
    },
    {
      key: 'cemig',
      label: 'CEMIG (Energia Elétrica)',
      icon: <Zap className="w-5 h-5 text-amber-500" />,
      dueDay: 17,
      fixedAccountId: 'fa_1770205814826',
      fixedAccountNameMatch: ['cemig', 'energia'],
      settingKey: `cemig_invoice_${currentYear}_${currentMonthStr}`,
      defaultVal: 200.00,
      description: 'Fatura real da conta de luz da loja'
    },
    {
      key: 'nuv',
      label: 'NUV (Sistema em Nuvem)',
      icon: <Cloud className="w-5 h-5 text-sky-500" />,
      dueDay: 17,
      fixedAccountId: 'fa_1769693100766',
      fixedAccountNameMatch: ['nuv'],
      settingKey: `nuv_invoice_${currentYear}_${currentMonthStr}`,
      defaultVal: 500.00,
      description: 'Mensalidade do servidor/sistema em nuvem'
    }
  ];

  // Estado dos valores em string para inputs
  const [formValues, setFormValues] = useState<Record<string, string>>({
    credit_card: '1511,66',
    simples_nacional: '1000,00',
    inss_receita: '1100,00',
    cemig: '200,00',
    nuv: '500,00'
  });

  // Busca os valores já cadastrados em system_settings e fixed_accounts
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsFetchingCurrent(true);

    const loadValues = async () => {
      try {
        const token = localStorage.getItem('belinha_auth_token') || '';
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        // 1. Busca configurações salvas para este mês
        const settingsPromises = accountsConfig.map(async (acc) => {
          try {
            const res = await fetch(`/api/settings/${acc.settingKey}`, { headers });
            if (res.ok) {
              const d = await res.json();
              if (d && d.value) {
                const valNum = Number(d.value);
                if (!isNaN(valNum) && valNum > 0) {
                  return { key: acc.key, val: valNum };
                }
              }
            }
          } catch (e) {}
          return null;
        });

        // 2. Busca contas fixas atuais para ver se já têm valores preenchidos
        let fixedAccounts: any[] = [];
        try {
          const resFixed = await fetch('/api/fixed-accounts', { headers });
          if (resFixed.ok) {
            fixedAccounts = await resFixed.json();
          }
        } catch (e) {}

        const settingsResults = await Promise.all(settingsPromises);

        if (isMounted) {
          const newVals: Record<string, string> = { ...formValues };

          accountsConfig.forEach(acc => {
            // Primeiro checa se achou no settings deste mês
            const foundSetting = settingsResults.find(r => r && r.key === acc.key);
            if (foundSetting) {
              newVals[acc.key] = foundSetting.val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              return;
            }

            // Se não, busca da tabela de fixed_accounts
            const matchedFixed = (fixedAccounts || []).find((f: any) => {
              if (acc.fixedAccountId && f.id === acc.fixedAccountId) return true;
              const fName = (f.name || '').toLowerCase();
              return acc.fixedAccountNameMatch.some(m => fName.includes(m));
            });

            if (matchedFixed && Number(matchedFixed.value) > 0) {
              newVals[acc.key] = Number(matchedFixed.value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            } else {
              newVals[acc.key] = acc.defaultVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
          });

          setFormValues(newVals);
        }
      } catch (err) {
        console.error('Erro ao carregar valores de contas variáveis:', err);
      } finally {
        if (isMounted) setIsFetchingCurrent(false);
      }
    };

    loadValues();

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

  const handleInputChange = (key: string, val: string) => {
    setFormValues(prev => ({ ...prev, [key]: val }));
  };

  const totalGeral = Object.keys(formValues).reduce((acc, k) => {
    return acc + parseInputAmount(formValues[k]);
  }, 0);

  const handleDismiss = () => {
    try {
      localStorage.setItem(`belafarma_var_prompt_confirmed_${monthKey}`, 'true');
    } catch (e) {}
    onClose();
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('belinha_auth_token') || '';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // 1. Salva cada valor em system_settings para a competência do mês
      const saveSettingsPromises = accountsConfig.map(async (acc) => {
        const amount = parseInputAmount(formValues[acc.key]);
        if (amount > 0) {
          await fetch(`/api/settings/${acc.settingKey}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ value: amount.toFixed(2) })
          });

          // Se for cartão, atualiza também a chave de fatura corrente
          if (acc.key === 'credit_card') {
            await fetch('/api/settings/credit_card_current_invoice', {
              method: 'PUT',
              headers,
              body: JSON.stringify({ value: amount.toFixed(2) })
            });
          }
        }
      });

      await Promise.all(saveSettingsPromises);

      // 2. Atualizar ou injetar o valor real na tabela fixed_accounts
      try {
        const getFixedRes = await fetch('/api/fixed-accounts', { headers });
        if (getFixedRes.ok) {
          const fixedAccounts = await getFixedRes.json();

          for (const acc of accountsConfig) {
            const amount = parseInputAmount(formValues[acc.key]);
            if (amount <= 0) continue;

            const existing = (fixedAccounts || []).find((f: any) => {
              if (acc.fixedAccountId && f.id === acc.fixedAccountId) return true;
              const fName = (f.name || '').toLowerCase();
              return acc.fixedAccountNameMatch.some(m => fName.includes(m));
            });

            if (existing) {
              await fetch(`/api/fixed-accounts/${existing.id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                  ...existing,
                  value: amount,
                  isActive: true
                })
              });
            } else {
              // Cria se não existir
              await fetch('/api/fixed-accounts', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  id: acc.fixedAccountId || `fa_${acc.key}`,
                  name: acc.label,
                  value: amount,
                  dueDay: acc.dueDay,
                  isActive: true
                })
              });
            }
          }
        }
      } catch (fErr) {
        console.warn('Aviso ao sincronizar contas fixas variáveis:', fErr);
      }

      // 3. Marca como confirmado de forma permanente no localStorage para este mês
      // Isso impede que reapareça a cada F5 ou reabertura do sistema!
      localStorage.setItem(`belafarma_var_prompt_confirmed_${monthKey}`, 'true');

      // 4. Dispara evento global para o Caixa Inteligente, Provisões e Contas Fixas atualizarem
      window.dispatchEvent(new CustomEvent('belafarma_fixed_accounts_updated'));
      window.dispatchEvent(new CustomEvent('belafarma_provisions_updated'));

      addToast(
        `✅ Contas variáveis de ${capitalizedMonth} salvas com sucesso! Valores reais aplicados no Caixa Inteligente e Provisões.`,
        'success'
      );

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erro ao salvar contas variáveis do mês:', err);
      addToast('Erro ao salvar valores: ' + (err.message || 'Tente novamente.'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Faixa Superior com Gradiente */}
        <div className="relative px-6 pt-6 pb-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shadow-inner">
                <Sparkles className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 border border-indigo-500/40">
                    Ajuste Mensal Exclusivo • {userName}
                  </span>
                  <span className="text-xs text-slate-300 font-bold">
                    {capitalizedMonth}/{currentYear}
                  </span>
                </div>
                <h3 className="text-xl font-black tracking-tight text-white mt-1">
                  Contas Variáveis do Mês
                </h3>
              </div>
            </div>

            <button
              onClick={handleDismiss}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Fechar (não perguntar novamente neste mês)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-xs text-slate-300 mt-3 leading-relaxed">
            Informe os valores reais apurados deste mês para substituir as estimativas fixas no <strong>Contas a Pagar</strong>, <strong>Provisões</strong> e no <strong>Caixa Inteligente</strong>.
          </p>
        </div>

        {/* Corpo com a Lista das 5 Contas */}
        <div className="p-6 space-y-4 overflow-y-auto grow">
          {isFetchingCurrent && (
            <div className="flex items-center justify-center py-6 text-xs text-slate-500 gap-2">
              <Clock className="w-4 h-4 animate-spin text-indigo-500" />
              <span>Carregando valores cadastrados...</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accountsConfig.map(acc => {
              const currentVal = parseInputAmount(formValues[acc.key] || '');
              return (
                <div 
                  key={acc.key}
                  className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 transition-all hover:border-indigo-300 dark:hover:border-indigo-600/50 shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        {acc.icon}
                        <span className="text-xs font-black text-slate-900 dark:text-white">
                          {acc.label}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        Venc. Dia {acc.dueDay}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mb-3">
                      {acc.description}
                    </p>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                      Valor Real Deste Mês
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                        R$
                      </span>
                      <input
                        type="text"
                        value={formValues[acc.key] || ''}
                        onChange={(e) => handleInputChange(acc.key, e.target.value)}
                        placeholder="0,00"
                        className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-mono font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-xs"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Resumo do Total Acumulado */}
          <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/40 flex items-center justify-between">
            <div>
              <span className="text-xs font-black text-indigo-950 dark:text-indigo-200 block">
                Total de Contas Variáveis do Mês:
              </span>
              <span className="text-[11px] text-indigo-700 dark:text-indigo-300">
                Substitui as previsões estimadas por valores 100% reais
              </span>
            </div>
            <div className="text-xl font-black font-mono text-indigo-600 dark:text-indigo-400">
              R$ {totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Rodapé de Ações */}
        <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleDismiss}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            Manter Estimativas & Fechar
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isLoading || isFetchingCurrent}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Clock className="w-4 h-4 animate-spin" />
                <span>Gravando Valores...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirmar Valores do Mês</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
