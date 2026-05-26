import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Copy, 
  Share2, 
  CheckCircle2, 
  Loader2, 
  Smartphone, 
  HelpCircle, 
  Coins,
  Send,
  BadgeAlert,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { useToast } from './ToastContext';
import { User } from '../types';

interface PixGeneratorProps {
  user: User;
  onNavigate: (view: any) => void;
}

export const PixGenerator: React.FC<PixGeneratorProps> = ({ user, onNavigate }) => {
  const { addToast } = useToast();
  
  // Informações Padrão do Recebedor (Bela Farma Sul)
  const PIX_KEY = 'belafarmasul@gmail.com';
  const MERCHANT_NAME = 'Bela Farma Sul';
  const MERCHANT_CITY = 'Juiz de Fora';

  // Estados da Aplicação
  const [amountRaw, setAmountRaw] = useState<string>('0');
  const [pixString, setPixString] = useState<string>('');
  const [isGenerated, setIsGenerated] = useState<boolean>(false);
  const [description, setDescription] = useState<string>('');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isRecorded, setIsRecorded] = useState<boolean>(false);

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
    if (isGenerated) return; // Bloqueia se o QR Code já foi gerado
    
    setAmountRaw((prev) => {
      if (prev === '0' && key === '0') return prev;
      
      if (prev === '0') {
        return key;
      }
      // Limite de valor razoável para prevenção de erros (máximo R$ 99.999,99)
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

  // Funções Auxiliares para Geração de EMV / BR Code Pix Estático
  const formatEMV = (id: string, value: string): string => {
    const len = value.length.toString().padStart(2, '0');
    return id + len + value;
  };

  // Algoritmo CRC16 CCITT oficial do Pix (polinômio 0x1021, valor inicial 0xFFFF)
  const calculateCRC16 = (str: string): string => {
    let crc = 0xFFFF;
    const polynomial = 0x1021;
    
    for (let i = 0; i < str.length; i++) {
      const b = str.charCodeAt(i);
      for (let j = 0; j < 8; j++) {
        const bit = ((b >> (7 - j) & 1) === 1);
        const c15 = ((crc >> 15 & 1) === 1);
        crc <<= 1;
        if (c15 !== bit) {
          crc ^= polynomial;
        }
      }
    }
    
    crc &= 0xFFFF;
    return crc.toString(16).toUpperCase().padStart(4, '0');
  };

  // Remove acentos e caracteres especiais para evitar erros na leitura dos bancos
  const cleanString = (str: string): string => {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-zA-Z0-9\s]/g, '') // Remove símbolos especiais
      .substring(0, 25); // Trunca no tamanho seguro
  };

  // Gera o código do Pix Estático com Valor
  const handleGeneratePix = () => {
    const amount = getNumericValue();
    if (amount <= 0) {
      addToast('Por favor, digite um valor maior que R$ 0,00!', 'warning');
      return;
    }

    try {
      // 1. Merchant Account Info (tag 26)
      const gui = formatEMV('00', 'br.gov.bcb.pix');
      const key = formatEMV('01', PIX_KEY);
      const merchantAccountInfo = formatEMV('26', gui + key);

      // 2. Outras tags básicas obrigatórias
      const payloadFormat = formatEMV('00', '01');
      const merchantCategory = formatEMV('52', '0000');
      const transactionCurrency = formatEMV('53', '986'); // BRL
      
      // 3. Valor da Transação (tag 54) - formatado com 2 casas decimais usando ponto como separador
      const transactionAmount = formatEMV('54', amount.toFixed(2));
      
      const countryCode = formatEMV('58', 'BR');
      
      // Limpa nome e cidade para o padrão EMV
      const cleanName = cleanString(MERCHANT_NAME);
      const cleanCity = cleanString(MERCHANT_CITY);
      
      const merchantName = formatEMV('59', cleanName);
      const merchantCity = formatEMV('60', cleanCity);
      
      // 4. Campo de Dados Adicionais (tag 62) - txid obrigatório (usamos *** no estático)
      const referenceLabel = formatEMV('05', '***');
      const additionalData = formatEMV('62', referenceLabel);

      // Concatena tudo até a tag 63 (CRC), deixando 04 caracteres de espaço para o CRC hexadecimal
      const partialPixString = 
        payloadFormat + 
        merchantAccountInfo + 
        merchantCategory + 
        transactionCurrency + 
        transactionAmount + 
        countryCode + 
        merchantName + 
        merchantCity + 
        additionalData + 
        '6304';

      // 5. Calcula o CRC16 e adiciona no fim da string
      const crc = calculateCRC16(partialPixString);
      const finalPixString = partialPixString + crc;

      setPixString(finalPixString);
      setIsGenerated(true);
      addToast('QR Code Pix gerado com sucesso!', 'success');
    } catch (e: any) {
      console.error(e);
      addToast('Erro ao gerar código Pix. Tente novamente.', 'error');
    }
  };

  // Faz o lançamento do Pix Direto no Caixa Diário do Backend
  const handleRecordPixInCash = async () => {
    const value = getNumericValue();
    setIsRecording(true);
    
    try {
      const response = await fetch('/api/daily-records/pix-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: value,
          desc: description.trim() || 'Venda Gerador Pix',
          userName: user.name
        })
      });

      if (response.ok) {
        setIsRecorded(true);
        addToast(`Pix de R$ ${value.toFixed(2)} lançado no Caixa Diário com sucesso!`, 'success');
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao lançar no caixa.');
      }
    } catch (err: any) {
      console.error(err);
      addToast(err.message || 'Erro ao conectar ao servidor para lançar no caixa.', 'error');
    } finally {
      setIsRecording(false);
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
    const amount = getNumericValue();
    const formattedVal = formatCurrency(amountRaw);
    const message = `Olá! Segue o código Pix Copia e Cola para o pagamento de ${formattedVal} na Bela Farma Sul:\n\n\`${pixString}\`\n\nBasta copiar este código e colar no menu "Pix Copia e Cola" do aplicativo do seu banco!`;

    if (navigator.share) {
      navigator.share({
        title: 'Pix Bela Farma Sul',
        text: message,
      }).catch(console.error);
    } else {
      // Fallback para abrir o WhatsApp Web ou Mobile diretamente
      const encodedMsg = encodeURIComponent(message);
      window.open(`https://api.whatsapp.com/send?text=${encodedMsg}`, '_blank');
    }
  };

  // Volta o app para o estado inicial para gerar outra cobrança
  const handleReset = () => {
    setAmountRaw('0');
    setPixString('');
    setIsGenerated(false);
    setDescription('');
    setIsRecorded(false);
  };

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center p-2 md:p-6 animate-in fade-in duration-300">
      
      {/* Container Principal Moderno (Glassmorphism & Foco Mobile) */}
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col">
        
        {/* Cabeçalho do Card */}
        <div className="p-6 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 dark:from-emerald-950/20 dark:to-teal-950/20 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
          <button 
            onClick={() => onNavigate('dashboard')}
            className="p-3 bg-white dark:bg-slate-800 rounded-2xl shadow-sm hover:shadow transition-all text-slate-600 dark:text-slate-300 hover:scale-105 active:scale-95 cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div className="flex flex-col items-center leading-none text-center">
            <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              Pix Grátis
            </span>
            <span className="text-lg font-black text-slate-850 dark:text-slate-100 tracking-tight mt-1">
              GERADOR DE PIX
            </span>
          </div>

          <div className="w-11 h-11 bg-emerald-500/20 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Coins className="w-5 h-5" />
          </div>
        </div>

        {/* Corpo principal */}
        <div className="flex-1 p-6 flex flex-col justify-between min-h-[450px]">
          
          {/* MODO DIGITAÇÃO DO VALOR */}
          {!isGenerated ? (
            <div className="space-y-6 flex-1 flex flex-col justify-between">
              
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
                  Recebe na Chave E-mail
                </div>
              </div>

              {/* Teclado Numérico Customizado Premium */}
              <div className="grid grid-cols-3 gap-3">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <button
                    key={num}
                    onClick={() => handleKeyPress(num)}
                    className="h-16 flex items-center justify-center text-2xl font-black text-slate-800 dark:text-slate-200 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-850 rounded-2xl border border-slate-100 dark:border-slate-850 shadow-sm active:scale-95 transition-all cursor-pointer font-sans"
                  >
                    {num}
                  </button>
                ))}
                <button
                  onClick={handleClear}
                  className="h-16 flex items-center justify-center text-xs font-black text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/40 rounded-2xl border border-red-100/30 dark:border-red-950/20 shadow-sm active:scale-95 transition-all cursor-pointer uppercase tracking-wider"
                >
                  Limpar
                </button>
                <button
                  onClick={() => handleKeyPress('0')}
                  className="h-16 flex items-center justify-center text-2xl font-black text-slate-800 dark:text-slate-200 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-850 rounded-2xl border border-slate-100 dark:border-slate-850 shadow-sm active:scale-95 transition-all cursor-pointer font-sans"
                >
                  0
                </button>
                <button
                  onClick={handleBackspace}
                  className="h-16 flex items-center justify-center text-lg font-black text-slate-500 hover:text-slate-650 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-850 rounded-2xl border border-slate-100 dark:border-slate-850 shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  ⌫
                </button>
              </div>

              {/* Botão de Ação "Gerar" */}
              <button
                onClick={handleGeneratePix}
                className="w-full mt-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-wider shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                Gerar QR Code Pix
                <ArrowRight className="w-4 h-4" />
              </button>

            </div>
          ) : (
            
            // MODO EXIBIÇÃO DE QR CODE E LANÇAMENTO NO CAIXA
            <div className="space-y-6 flex-1 flex flex-col justify-between animate-in zoom-in-95 duration-300">
              
              <div className="flex flex-col items-center">
                {/* Display do Valor cobrado */}
                <div className="text-center mb-4">
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    Valor a pagar
                  </span>
                  <p className="text-3xl font-black text-slate-850 dark:text-slate-100 mt-1 tracking-tight">
                    {formatCurrency(amountRaw)}
                  </p>
                </div>

                {/* QR Code Container */}
                <div className="p-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-3xl shadow-md flex items-center justify-center relative group">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(pixString)}`}
                    alt="QR Code Pix"
                    className="w-56 h-56 object-contain"
                  />
                  
                  {/* Selo Central do Pix de Alta Qualidade */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-12 h-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-center shadow-lg p-2">
                      <img 
                        src="/images/logo-bela-farma.jpg"
                        alt="Logo"
                        className="w-full h-full object-contain rounded-lg"
                        onError={(e) => {
                          // Se der erro de carregamento da imagem local, esconde
                          (e.target as any).style.display = 'none';
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Beneficiário e Chave */}
                <div className="text-center mt-3 space-y-1">
                  <p className="text-xs font-black text-slate-700 dark:text-slate-350 uppercase tracking-tight">
                    {MERCHANT_NAME}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                    Chave: {PIX_KEY} • {MERCHANT_CITY}
                  </p>
                </div>
              </div>

              {/* Ações Auxiliares (Copiar e Compartilhar) */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleCopyPix}
                  className="flex items-center justify-center gap-2 py-3.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-black text-[11px] uppercase tracking-wider rounded-2xl border border-slate-200/60 dark:border-slate-800 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Copy className="w-4 h-4 text-emerald-500" />
                  Copiar Código
                </button>
                <button
                  onClick={handleSharePix}
                  className="flex items-center justify-center gap-2 py-3.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-black text-[11px] uppercase tracking-wider rounded-2xl border border-slate-200/60 dark:border-slate-800 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Share2 className="w-4 h-4 text-emerald-500" />
                  Compartilhar
                </button>
              </div>

              {/* SEÇÃO DE LANÇAMENTO NO CAIXA DIRETO */}
              <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-850 p-4 rounded-[1.75rem] space-y-3">
                
                {/* Se ainda não foi registrado */}
                {!isRecorded ? (
                  <>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-450 dark:text-slate-500 uppercase tracking-widest block">
                        Descrição da venda (opcional):
                      </label>
                      <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Ex: Venda Balcão, Produto X"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-emerald-500 text-slate-800 dark:text-slate-100 font-medium"
                      />
                    </div>

                    <button
                      onClick={handleRecordPixInCash}
                      disabled={isRecording}
                      className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 disabled:opacity-50 text-emerald-700 dark:text-emerald-400 font-black py-3 rounded-xl text-[10px] uppercase tracking-wider hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isRecording ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Lançando...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          Lançar no Caixa Diário
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  // Se já foi registrado com sucesso
                  <div className="flex items-center gap-3 p-2 text-emerald-700 dark:text-emerald-400 justify-center">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    <span className="text-[10px] font-black uppercase tracking-wider">
                      ✓ PIX LANÇADO NO CAIXA DIÁRIO
                    </span>
                  </div>
                )}
              </div>

              {/* Botão de Reset "Nova Cobrança" */}
              <button
                onClick={handleReset}
                className="w-full bg-slate-900 hover:bg-slate-850 dark:bg-slate-800 dark:hover:bg-slate-750 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-wider shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer text-center"
              >
                Nova Cobrança
              </button>

            </div>
          )}

        </div>

      </div>

    </div>
  );
};
