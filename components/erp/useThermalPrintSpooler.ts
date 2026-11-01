import { useEffect, useState, useCallback, useRef } from 'react';
import { isEstacaoImpressoraLocal, setEstacaoImpressoraLocal, imprimirHtmlIsolado } from '../../utils/thermalPrinter';
import { useToast } from '../ToastContext';

export function useThermalPrintSpooler() {
  const { addToast } = useToast();
  const [isPrinterStation, setIsPrinterStationState] = useState<boolean>(() => isEstacaoImpressoraLocal());
  const isPollingRef = useRef(false);

  // Alterna o papel desta máquina como estação de impressão térmica
  const togglePrinterStation = useCallback((ativo: boolean) => {
    setEstacaoImpressoraLocal(ativo);
    setIsPrinterStationState(ativo);
    if (ativo) {
      addToast('🖥️ Este terminal agora é a Estação de Impressão Bematech! Cupons da rede serão impressos aqui.', 'success', 5000);
    } else {
      addToast('Terminal configurado como cliente: impressões serão despachadas para o Caixa via rede.', 'info', 4000);
    }
  }, [addToast]);

  // Dispara teste de impressão de rede
  const testNetworkPrint = useCallback(async () => {
    try {
      const res = await fetch('/api/printer/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_name: localStorage.getItem('user_name') || 'Terminal Balcão' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast('✅ Teste de impressão enviado para a Bematech no Caixa!', 'success', 4000);
        return true;
      } else {
        addToast(`Erro no teste de impressão: ${data.error || 'Falha'}`, 'error');
        return false;
      }
    } catch (err: any) {
      addToast(`Erro de conexão com o servidor de impressão: ${err.message}`, 'error');
      return false;
    }
  }, [addToast]);

  // Se esta máquina for a Estação da Impressora Bematech, escuta a fila em background
  useEffect(() => {
    if (!isPrinterStation) return;

    console.log('[Print Spooler] 🖨️ Estação de Impressão Ativa: escutando cupons de toda a rede...');

    const checkQueue = async () => {
      if (isPollingRef.current) return;
      isPollingRef.current = true;

      try {
        const res = await fetch('/api/printer/queue/pending?limit=3');
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            for (const job of json.data) {
              console.log(`[Print Spooler] 📄 Imprimindo trabalho #${job.id}: "${job.title}" de ${job.origin_user}`);

              // 1. Dispara impressão física no iframe silencioso (sai direto na Bematech)
              imprimirHtmlIsolado(job.html_content);

              // 2. Confirma conclusão no backend
              try {
                await fetch(`/api/printer/queue/${encodeURIComponent(job.id)}/done`, {
                  method: 'POST'
                });
              } catch (e) {}

              // 3. Notificação discreta ao operador do Caixa
              addToast(`🖨️ Bematech: impresso "${job.title}" vindo de ${job.origin_user || 'Rede'}`, 'info', 3000);
            }
          }
        }
      } catch (err) {
        // Silencioso para não poluir console em caso de oscilação momentânea
      } finally {
        isPollingRef.current = false;
      }
    };

    // Checa a cada 2 segundos
    const interval = setInterval(checkQueue, 2000);
    // Checagem imediata
    checkQueue();

    return () => clearInterval(interval);
  }, [isPrinterStation, addToast]);

  return {
    isPrinterStation,
    togglePrinterStation,
    testNetworkPrint
  };
}
