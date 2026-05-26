import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  Copy, 
  Share2, 
  CheckCircle2, 
  Loader2, 
  Smartphone, 
  Coins,
  Send,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Play
} from 'lucide-react';
import { useToast } from './ToastContext';
import { User } from '../types';

interface PixGeneratorProps {
  user: User;
  onNavigate: (view: any) => void;
}

export const PixGenerator: React.FC<PixGeneratorProps> = ({ user, onNavigate }) => {
  const { addToast } = useToast();
  
  // Estados da Aplicação
  const [amountRaw, setAmountRaw] = useState<string>('0');
  const [pixString, setPixString] = useState<string>('');
  const [txid, setTxid] = useState<string>('');
  const [isGenerated, setIsGenerated] = useState<boolean>(false);
  const [description, setDescription] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isPaid, setIsPaid] = useState<boolean>(false);
  const [isSimulated, setIsSimulated] = useState<boolean>(false);
  const [isSimulatingPayment, setIsSimulatingPayment] = useState<boolean>(false);

  // Ref para guardar a referência do Polling
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Calcula o valor real em formato decimal
  const getNumericValue = (): number => {
    return parseInt(amountRaw, 10) / 100;
  };

  // Formata o valor bruto para exibição em Real (BRL)
  const formatCurrency = (raw: string): string => {
    const value = parseInt(raw, 10) / 100;
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  // Teclado virtual: manipulação dos botões
  const handleKeyPress = (key: string) => {
    if (isGenerated) return;
    
    setAmountRaw((prev) => {
      if (prev === '0' && key === '0') return prev;
      if (prev === '0') return key;
      if (prev.length >= 7) {
        addToast('Valor máximo atingido para segurança!', 'warning');
        return prev;
      }
      return prev + key;
    });
  };

  const handleBackspace = () => {
    if (isGenerated) return;
    
    setAmountRaw((prev) => {
      if (prev.length <= 1) return '0';
      return prev.slice(0, -1);
    });
  };

  const handleClear = () => {
    if (isGenerated) return;
    setAmountRaw('0');
  };

  // 1. GERA A COBRANÇA DINÂMICA VIA BACKEND (Banco Inter ou Mock)
  const handleGeneratePix = async () => {
    const amount = getNumericValue();
    if (amount <= 0) {
      addToast('Por favor, digite um valor maior que R$ 0,00!', 'warning');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch('/api/pix/generate-dynamic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: amount,
          description: description.trim() || `Venda Balcão Belinha - ${user.name}`
        })
      });

      if (!response.ok) {
        throw new Error('Falha ao gerar cobrança no servidor.');
      }

      const charge = await response.json();
      
      setPixString(charge.pixCopiaECola);
      setTxid(charge.txid);
      setIsSimulated(charge.isSimulatedMode || !process.env.INTER_CLIENT_ID);
      setIsGenerated(true);
      
      addToast('Cobrança Pix Dinâmica gerada!', 'success');
    } catch (e: any) {
      console.error(e);
      addToast('Erro ao gerar cobrança. Verifique a conexão com o servidor.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // 2. POLLING DE STATUS (Consulta se o Pix foi pago de 3 em 3 segundos)
  useEffect(() => {
    if (isGenerated && txid && !isPaid) {
      console.log(`[PIX GENERATOR] 📡 Iniciando polling de status para o txid: ${txid}`);
      
      pollingRef.current = setInterval(async () => {
        try {
          const response = await fetch(`/api/pix/status/${txid}`);
          if (response.ok) {
            const data = await response.json();
            // Banco Central status para pago: 'CONCLUIDA' ou 'CONCLUIDO'
            if (data.status === 'CONCLUIDA' || data.status === 'CONCLUIDO') {
              console.log('[PIX GENERATOR] 🎉 Pagamento confirmado com sucesso!');
              setIsPaid(true);
              addToast('✓ Pagamento confirmado no caixa!', 'success');
              
              // Executa o feedback sonoro de sucesso leve
              tocarSomSucesso();
              
              if (pollingRef.current) {
                clearInterval(pollingRef.current);
              }
            }
          }
        } catch (e) {
          console.warn('[PIX GENERATOR] Erro na consulta de status do Pix:', e);
        }
      }, 3000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [isGenerated, txid, isPaid]);

  // Sintetizador Web Audio API para tocar um "Ding" suave de sucesso ao confirmar o pagamento
  const tocarSomSucesso = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5 (Do)
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1); // E5 (Mi)
      osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.2); // G5 (Sol)
      osc.frequency.setValueAtTime(1046.50, audioCtx.currentTime + 0.3); // C6 (Do oitava)
      
      gain.gain.setValueAtTime(0, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
      
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.8);
    } catch (e) {
      console.log('Feedback sonoro bloqueado pelo navegador:', e);
    }
  };

  // 3. SIMULAR PAGAMENTO LOCAL (Apenas no modo de teste/simulado)
  const handleSimulatePayment = async () => {
    if (!txid) return;
    setIsSimulatingPayment(true);
    try {
      const response = await fetch(`/api/pix/mock-pay/${txid}`, {
        method: 'POST'
      });
      if (response.ok) {
        addToast('Simulação enviada! Aguardando detecção...', 'info');
      } else {
        throw new Error('Falha ao processar simulação.');
      }
    } catch (e) {
      addToast('Erro na simulação do pagamento.', 'error');
    } finally {
      setIsSimulatingPayment(false);
    }
  };

  // Copia a string do Pix Copia e Cola para a área de transferência
  const handleCopyPix = () => {
    if (!pixString) return;
    navigator.clipboard.writeText(pixString);
    addToast('Código Copia e Cola copiado com sucesso!', 'success');
  };

  // Compartilha o código Pix via API Web Share ou monta link de WhatsApp
  const handleSharePix = () => {
    const formattedVal = formatCurrency(amountRaw);
    const message = `Olá! Segue o código Pix Copia e Cola para o pagamento de ${formattedVal} na Bela Farma Sul:\n\n\`${pixString}\`\n\nBasta copiar este código e colar no menu "Pix Copia e Cola" do aplicativo do seu banco!`;

    if (navigator.share) {
      navigator.share({
        title: 'Pix Bela Farma Sul',
        text: message,
      }).catch(console.error);
    } else {
      const encodedMsg = encodeURIComponent(message);
      window.open(`https://api.whatsapp.com/send?text=${encodedMsg}`, '_blank');
    }
  };

  // Volta o app para o estado inicial para gerar outra cobrança
  const handleReset = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    setAmountRaw('0');
    setPixString('');
    setTxid('');
    setIsGenerated(false);
    setDescription('');
    setIsPaid(false);
    setIsSimulated(false);
  };

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center p-2 md:p-6 animate-in fade-in duration-300">
      
      {/* Container Principal Moderno (Glassmorphism & Foco Mobile) */}
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col transition-all duration-500">
        
        {/* Cabeçalho do Card (Muda de cor se pago) */}
        <div className={`p-6 border-b transition-colors duration-500 flex items-center justify-between ${
          isPaid 
            ? 'bg-emerald-500/10 dark:bg-emerald-950/20 border-emerald-500/20' 
            : 'bg-gradient-to-r from-emerald-500/5 to-teal-500/5 dark:from-emerald-950/10 dark:to-teal-950/10 border-slate-100 dark:border-slate-800/80'
        }`}>
          <button 
            onClick={() => {
              if (pollingRef.current) clearInterval(pollingRef.current);
              onNavigate('dashboard');
            }}
            className="p-3 bg-white dark:bg-slate-800 rounded-2xl shadow-sm hover:shadow transition-all text-slate-600 dark:text-slate-300 hover:scale-105 active:scale-95 cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div className="flex flex-col items-center leading-none text-center">
            <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1 transition-all ${
              isPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-emerald-500 dark:text-emerald-400'
            }`}>
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              {isSimulated ? 'Inter Simulado 0%' : 'Inter PJ 0%'}
            </span>
            <span className="text-lg font-black text-slate-850 dark:text-slate-100 tracking-tight mt-1">
              {isPaid ? 'VENDA CONFIRMADA' : 'GERADOR DE PIX'}
            </span>
          </div>

          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${
            isPaid 
              ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' 
              : 'bg-emerald-500/10 dark:bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
          }`}>
            <Coins className={`w-5 h-5 ${isGenerating ? 'animate-bounce' : ''}`} />
          </div>
        </div>

        {/* Corpo principal */}
        <div className="flex-1 p-6 flex flex-col justify-between min-h-[460px]">
          
          {/* MODO A: DIGITAÇÃO DO VALOR */}
          {!isGenerated && (
            <div className="space-y-5 flex-1 flex flex-col justify-between">
              
              {/* Display de Valor Central */}
              <div className="text-center py-6 flex flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-950/30 rounded-[2rem] border border-slate-100 dark:border-slate-800/50">
                <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Digite o valor da venda
                </span>
                <span className="text-4xl md:text-5xl font-black text-slate-900 dark:text-slate-100 mt-2 tracking-tighter transition-all">
                  {formatCurrency(amountRaw)}
                </span>
                
                <div className="mt-4 flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 rounded-full border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wider">
                  <Smartphone className="w-3.5 h-3.5" />
                  Retorno Automático Inter
                </div>
              </div>

              {/* Descrição Opcional do Caixa */}
              <div className="space-y-1 px-1">
                <label className="text-[9px] font-black text-slate-450 dark:text-slate-500 uppercase tracking-widest block">
                  Descrição da venda (opcional):
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Produto X, Balcão, Cliente..."
                  className="w-full bg-slate-50/60 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-xs outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              {/* Teclado Numérico Customizado Premium */}
              <div className="grid grid-cols-3 gap-2.5">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <button
                    key={num}
                    onClick={() => handleKeyPress(num)}
                    className="h-14 flex items-center justify-center text-2xl font-black text-slate-800 dark:text-slate-200 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-850 rounded-2xl border border-slate-100 dark:border-slate-850 active:scale-95 transition-all cursor-pointer font-sans"
                  >
                    {num}
                  </button>
                ))}
                <button
                  onClick={handleClear}
                  className="h-14 flex items-center justify-center text-[10px] font-black text-red-500 hover:text-red-650 bg-red-50 hover:bg-red-100/60 dark:bg-red-950/20 dark:hover:bg-red-950/40 rounded-2xl border border-red-100/30 dark:border-red-950/20 shadow-sm active:scale-95 transition-all cursor-pointer uppercase tracking-wider"
                >
                  Limpar
                </button>
                <button
                  onClick={() => handleKeyPress('0')}
                  className="h-14 flex items-center justify-center text-2xl font-black text-slate-800 dark:text-slate-200 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-850 rounded-2xl border border-slate-100 dark:border-slate-850 active:scale-95 transition-all cursor-pointer font-sans"
                >
                  0
                </button>
                <button
                  onClick={handleBackspace}
                  className="h-14 flex items-center justify-center text-lg font-black text-slate-500 hover:text-slate-650 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-850 rounded-2xl border border-slate-100 dark:border-slate-850 active:scale-95 transition-all cursor-pointer"
                >
                  ⌫
                </button>
              </div>

              {/* Botão de Ação "Gerar" */}
              <button
                onClick={handleGeneratePix}
                disabled={isGenerating || getNumericValue() <= 0}
                className="w-full mt-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-wider shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Gerando Cobrança...
                  </>
                ) : (
                  <>
                    Criar Pix Dinâmico
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

            </div>
          )}

          {/* MODO B: EXIBIÇÃO DO QR CODE E ESPERA EM TEMPO REAL */}
          {isGenerated && !isPaid && (
            <div className="space-y-6 flex-1 flex flex-col justify-between animate-in zoom-in-95 duration-300">
              
              <div className="flex flex-col items-center">
                {/* Display do Valor cobrado */}
                <div className="text-center mb-4">
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    Valor da cobrança
                  </span>
                  <p className="text-3xl font-black text-slate-850 dark:text-slate-100 mt-1 tracking-tight">
                    {formatCurrency(amountRaw)}
                  </p>
                </div>

                {/* QR Code Dinâmico do Banco Inter */}
                <div className="p-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-3xl shadow-md flex items-center justify-center relative group">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(pixString)}`}
                    alt="QR Code Pix Dinâmico"
                    className="w-52 h-52 object-contain"
                  />
                  
                  {/* Logo da Farmácia centralizada */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-11 h-11 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-center shadow-md p-1.5">
                      <img 
                        src="/images/logo-bela-farma.jpg"
                        alt="Logo"
                        className="w-full h-full object-contain rounded-lg"
                        onError={(e) => {
                          (e.target as any).style.display = 'none';
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Status: Aguardando em Tempo Real */}
                <div className="mt-4 flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-full border border-amber-500/20 text-xs font-black uppercase tracking-wider">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500" />
                  Aguardando pagamento...
                </div>
              </div>

              {/* Botões de Cópia e Compartilhamento */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleCopyPix}
                  className="flex items-center justify-center gap-2 py-3 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-800 text-slate-750 dark:text-slate-350 font-black text-[10px] uppercase tracking-wider rounded-2xl border border-slate-200/60 dark:border-slate-800 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 text-emerald-500" />
                  Pix Copia e Cola
                </button>
                <button
                  onClick={handleSharePix}
                  className="flex items-center justify-center gap-2 py-3 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-800 text-slate-750 dark:text-slate-350 font-black text-[10px] uppercase tracking-wider rounded-2xl border border-slate-200/60 dark:border-slate-800 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-emerald-500" />
                  Compartilhar
                </button>
              </div>

              {/* PAINEL DE SIMULAÇÃO DE PAGAMENTO (Só aparece se no modo de testes) */}
              {isSimulated && (
                <div className="bg-slate-50 dark:bg-slate-950/40 border border-dashed border-emerald-500/30 p-4 rounded-[1.75rem] flex flex-col items-center gap-2">
                  <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                    🔧 Caixa em Modo de Testes
                  </span>
                  <button
                    onClick={handleSimulatePayment}
                    disabled={isSimulatingPayment}
                    className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 font-black py-3 rounded-xl text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all"
                  >
                    <Play className="w-3.5 h-3.5 fill-emerald-600 text-emerald-600" />
                    {isSimulatingPayment ? 'Processando...' : 'Simular Pagamento (Bacen)'}
                  </button>
                </div>
              )}

              {/* Botão de Cancelar/Reset */}
              <button
                onClick={handleReset}
                className="w-full py-4 text-slate-400 dark:text-slate-500 hover:text-red-500 font-black text-xs uppercase tracking-wider text-center active:scale-95 transition-all cursor-pointer"
              >
                Cancelar Cobrança
              </button>

            </div>
          )}

          {/* MODO C: SUCESSO ABSOLUTO (PAGO EM TEMPO REAL) */}
          {isGenerated && isPaid && (
            <div className="space-y-6 flex-1 flex flex-col justify-between items-center text-center py-6 animate-in zoom-in-95 duration-500">
              
              {/* Ícone Gigante de Checkmark Animado */}
              <div className="relative">
                <div className="absolute inset-0 bg-emerald-500/20 dark:bg-emerald-500/10 rounded-full scale-125 animate-ping duration-1000" />
                <div className="w-24 h-24 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-xl shadow-emerald-500/20 relative z-10 border-4 border-white dark:border-slate-900">
                  <CheckCircle2 className="w-14 h-14" />
                </div>
              </div>

              {/* Textos de Sucesso */}
              <div className="space-y-2">
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest block">
                  Pagamento Confirmado
                </span>
                <h3 className="text-3xl font-black text-slate-850 dark:text-slate-100 tracking-tight">
                  {formatCurrency(amountRaw)}
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 max-w-[280px] mx-auto font-medium">
                  {description.trim() ? `"${description}"` : 'Pix recebido com sucesso na conta Inter PJ.'}
                </p>
              </div>

              {/* Notificação de Fechamento do Caixa Diário */}
              <div className="w-full bg-emerald-500/10 border border-emerald-500/20 rounded-[1.75rem] py-3.5 px-4 flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
                <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                  ✓ Lançado automaticamente no Caixa Diário
                </span>
              </div>

              {/* Botão de Fechar / Nova Venda */}
              <button
                onClick={handleReset}
                className="w-full bg-slate-900 hover:bg-slate-850 dark:bg-slate-800 dark:hover:bg-slate-750 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-wider shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer text-center"
              >
                Iniciar Nova Cobrança
              </button>

            </div>
          )}

        </div>

      </div>

    </div>
  );
};
