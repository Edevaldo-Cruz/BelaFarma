import React, { useState } from 'react';
import { Thermometer, Printer, AlertTriangle, X, ShieldAlert } from 'lucide-react';

interface TemperaturePrintReminderModalProps {
  previousMonthLabel: string;
  previousMonth: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenAndPrint: (month: string) => void;
}

export const TemperaturePrintReminderModal: React.FC<TemperaturePrintReminderModalProps> = ({
  previousMonthLabel,
  previousMonth,
  isOpen,
  onClose,
  onOpenAndPrint
}) => {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handlePrintClick = async () => {
    setLoading(true);
    try {
      try {
        localStorage.setItem(`belafarma_temp_printed_${previousMonth}`, 'true');
      } catch (e) {}
      // Registrar no backend que a impressão foi iniciada
      await fetch('/api/temperature/mark-printed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: previousMonth })
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      onOpenAndPrint(previousMonth);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border-2 border-red-500/30 dark:border-red-500/40 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Faixa superior de destaque */}
        <div className="bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
              <Thermometer className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider bg-black/20 px-2 py-0.5 rounded-full">
                Exigência Sanitária • ANVISA
              </span>
              <h2 className="text-lg font-black tracking-tight leading-tight mt-0.5">
                Folha de Temperatura Pendente
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 rounded-xl text-white/80 hover:text-white transition-colors"
            title="Fechar por enquanto"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3 p-3.5 bg-red-50 dark:bg-red-950/30 rounded-2xl border border-red-200 dark:border-red-900/50">
            <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs text-red-900 dark:text-red-200 leading-relaxed">
              <strong>Atenção:</strong> O mês de <strong>{previousMonthLabel}</strong> já encerrou e o mapa de controle diário de temperatura e umidade da loja e do almoxarifado ainda não foi impresso para o livro de fiscalização da farmácia.
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 text-center space-y-1">
            <span className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
              Mês de Referência para Arquivamento
            </span>
            <div className="text-xl font-black text-slate-800 dark:text-white">
              {previousMonthLabel}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Registros da Área de Vendas e Almoxarifado em folha A4 oficial
            </p>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-300 text-center">
            Este aviso continuará sendo exibido na abertura do Belinha até que a folha seja impressa e assinada pelo Responsável Técnico.
          </p>

          {/* Botões de Ação */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <button
              onClick={onClose}
              className="w-full sm:w-1/2 py-2.5 px-4 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Lembrar Mais Tarde
            </button>

            <button
              onClick={handlePrintClick}
              disabled={loading}
              className="w-full sm:w-1/2 py-2.5 px-4 text-xs font-black rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>{loading ? 'Preparando...' : 'Imprimir Folha Agora'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
