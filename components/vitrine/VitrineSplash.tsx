import React, { useEffect, useState, useRef } from "react";
import { Sparkles, Gift, PartyPopper, ChevronRight, Zap } from "lucide-react";

export interface VitrineSplashProps {
  onComplete?: () => void;
  durationMs?: number;
  storeName?: string;
}

export const VitrineSplash: React.FC<VitrineSplashProps> = ({
  onComplete,
  durationMs = 3000,
  storeName = "BelaFarma Sul",
}) => {
  const [elapsed, setElapsed] = useState<number>(0);
  const [isExiting, setIsExiting] = useState<boolean>(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const hasFinishedRef = useRef(false);

  const handleFinish = () => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    setIsExiting(true);
    setTimeout(() => {
      if (onCompleteRef.current) {
        onCompleteRef.current();
      }
    }, 450);
  };

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      const currentElapsed = now - startTime;
      if (currentElapsed >= durationMs) {
        setElapsed(durationMs);
        clearInterval(interval);
        handleFinish();
      } else {
        setElapsed(currentElapsed);
      }
    }, 40);

    return () => {
      clearInterval(interval);
    };
  }, [durationMs]);

  const progressPercent = Math.min(100, Math.round((elapsed / durationMs) * 100));
  const remainingSeconds = Math.max(1, Math.ceil((durationMs - elapsed) / 1000));

  return (
    <div
      role="dialog"
      aria-label="Tela de Abertura Aniversário BelaFarma"
      aria-modal="true"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-between bg-gradient-to-br from-red-700 via-red-600 to-rose-800 text-white select-none overflow-hidden p-4 sm:p-8 transition-all duration-500 ease-out ${
        isExiting ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100"
      }`}
    >
      {/* Decorative festive animated background - Balões subindo e confetes */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {/* Glows de iluminação de festa */}
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-400/25 rounded-full blur-3xl pointer-events-none animate-pulse" />
        <div className="absolute -bottom-10 left-1/4 w-80 h-80 bg-red-500/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 right-10 w-72 h-72 bg-yellow-300/20 rounded-full blur-3xl pointer-events-none" />

        {/* BALÕES COLORIDOS EM MOVIMENTO SUBINDO PELA TELA */}
        {/* Balão 1 - Dourado / Amarelo (Esquerda) */}
        <div
          className="absolute -bottom-24 left-[8%] animate-balloon-1 z-0"
          style={{ animationDelay: '0s' }}
        >
          <div className="relative flex flex-col items-center">
            <div className="w-16 h-20 sm:w-20 sm:h-24 rounded-[50%_50%_50%_50%/40%_40%_60%_60%] bg-gradient-to-tr from-amber-500 via-yellow-300 to-yellow-100 shadow-xl border border-yellow-200/50 flex items-center justify-center">
              <span className="text-[10px] font-black text-amber-900 tracking-tighter opacity-75">1º ANO</span>
            </div>
            {/* Nó do balão */}
            <div className="w-2.5 h-1.5 bg-amber-600 rounded-sm -mt-0.5" />
            {/* Cordão do balão ondulando */}
            <div className="w-0.5 h-20 bg-amber-200/60 -mt-0.5 origin-top animate-pulse" />
          </div>
        </div>

        {/* Balão 2 - Vermelho Vivo Festivo (Direita) */}
        <div
          className="absolute -bottom-24 right-[10%] animate-balloon-2 z-0"
          style={{ animationDelay: '0.4s' }}
        >
          <div className="relative flex flex-col items-center">
            <div className="w-18 h-22 sm:w-22 sm:h-26 rounded-[50%_50%_50%_50%/40%_40%_60%_60%] bg-gradient-to-tr from-red-800 via-red-500 to-rose-300 shadow-2xl border border-red-300/40 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-yellow-200 animate-spin" style={{ animationDuration: '4s' }} />
            </div>
            <div className="w-3 h-2 bg-red-900 rounded-sm -mt-0.5" />
            <div className="w-0.5 h-24 bg-red-200/50 -mt-0.5 origin-top" />
          </div>
        </div>

        {/* Balão 3 - Azul Real BelaFarma (Centro-Esquerda) */}
        <div
          className="absolute -bottom-28 left-[28%] animate-balloon-3 z-0"
          style={{ animationDelay: '1.1s' }}
        >
          <div className="relative flex flex-col items-center">
            <div className="w-14 h-18 sm:w-16 sm:h-20 rounded-[50%_50%_50%_50%/40%_40%_60%_60%] bg-gradient-to-tr from-blue-700 via-sky-400 to-sky-100 shadow-lg border border-sky-200/40" />
            <div className="w-2.5 h-1.5 bg-blue-900 rounded-sm -mt-0.5" />
            <div className="w-0.5 h-16 bg-sky-200/50 -mt-0.5" />
          </div>
        </div>

        {/* Balão 4 - Dourado Grande (Centro-Direita) */}
        <div
          className="absolute -bottom-32 right-[25%] animate-balloon-1 z-0"
          style={{ animationDelay: '1.7s' }}
        >
          <div className="relative flex flex-col items-center">
            <div className="w-16 h-20 sm:w-20 sm:h-24 rounded-[50%_50%_50%_50%/40%_40%_60%_60%] bg-gradient-to-tr from-amber-600 via-amber-300 to-yellow-100 shadow-xl border border-yellow-100/50 flex items-center justify-center">
              <span className="text-xs font-black text-amber-900 tracking-tighter">BELA</span>
            </div>
            <div className="w-3 h-2 bg-amber-700 rounded-sm -mt-0.5" />
            <div className="w-0.5 h-20 bg-amber-100/60 -mt-0.5" />
          </div>
        </div>

        {/* Balão 5 - Verde Sucesso / Saúde (Canto Esquerdo) */}
        <div
          className="absolute -bottom-24 left-[2%] animate-balloon-2 z-0"
          style={{ animationDelay: '2.1s' }}
        >
          <div className="relative flex flex-col items-center">
            <div className="w-12 h-16 rounded-[50%_50%_50%_50%/40%_40%_60%_60%] bg-gradient-to-tr from-emerald-600 via-teal-400 to-emerald-200 shadow-md border border-emerald-200/40" />
            <div className="w-2 h-1 bg-emerald-800 rounded-sm -mt-0.5" />
            <div className="w-0.5 h-14 bg-emerald-200/40 -mt-0.5" />
          </div>
        </div>

        {/* Balão 6 - Roxo / Violeta Festivo (Canto Direito) */}
        <div
          className="absolute -bottom-24 right-[2%] animate-balloon-3 z-0"
          style={{ animationDelay: '0.8s' }}
        >
          <div className="relative flex flex-col items-center">
            <div className="w-14 h-18 rounded-[50%_50%_50%_50%/40%_40%_60%_60%] bg-gradient-to-tr from-fuchsia-700 via-pink-400 to-purple-200 shadow-md border border-pink-200/40" />
            <div className="w-2 h-1 bg-fuchsia-900 rounded-sm -mt-0.5" />
            <div className="w-0.5 h-16 bg-purple-200/40 -mt-0.5" />
          </div>
        </div>

        {/* CHUVA DE CONFETES EM MOVIMENTO */}
        <div className="absolute top-0 left-[12%] w-3 h-4 bg-yellow-300 rounded-sm animate-confetti" style={{ animationDelay: '0s', animationDuration: '2.6s' }} />
        <div className="absolute top-0 left-[22%] w-2 h-5 bg-amber-200 rounded-full animate-confetti" style={{ animationDelay: '0.5s', animationDuration: '2.2s' }} />
        <div className="absolute top-0 left-[35%] w-3 h-3 bg-sky-300 rounded-sm animate-confetti" style={{ animationDelay: '1.2s', animationDuration: '2.8s' }} />
        <div className="absolute top-0 left-[48%] w-4 h-2 bg-rose-300 rounded-full animate-confetti" style={{ animationDelay: '0.2s', animationDuration: '2.4s' }} />
        <div className="absolute top-0 left-[62%] w-3 h-4 bg-yellow-400 rounded-sm animate-confetti" style={{ animationDelay: '0.8s', animationDuration: '2.5s' }} />
        <div className="absolute top-0 left-[75%] w-2 h-6 bg-emerald-300 rounded-full animate-confetti" style={{ animationDelay: '1.5s', animationDuration: '2.1s' }} />
        <div className="absolute top-0 left-[88%] w-3 h-3 bg-amber-300 rounded-sm animate-confetti" style={{ animationDelay: '0.3s', animationDuration: '2.9s' }} />
        <div className="absolute top-0 left-[5%] w-2.5 h-4 bg-pink-300 rounded-sm animate-confetti" style={{ animationDelay: '0.9s', animationDuration: '2.7s' }} />
        <div className="absolute top-0 left-[95%] w-3 h-4 bg-yellow-200 rounded-sm animate-confetti" style={{ animationDelay: '1.1s', animationDuration: '2.3s' }} />
      </div>

      {/* Top Bar with Skip Button */}
      <div className="w-full max-w-md flex items-center justify-between relative z-10 pt-2">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/35 backdrop-blur-md border border-amber-400/30 text-xs text-amber-200 font-bold tracking-wide shadow-lg">
          <PartyPopper className="w-4 h-4 text-amber-300 animate-bounce" />
          <span>FESTA DE ANIVERSÁRIO</span>
        </div>

        {/* Prominent Skip Button */}
        <button
          type="button"
          onClick={handleFinish}
          className="group inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-amber-300 to-yellow-200 hover:from-amber-200 hover:to-white text-red-900 font-extrabold text-sm shadow-xl transition-all transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-300"
          aria-label="Pular tela de abertura e ver ofertas"
        >
          <span>Pular • Ver Ofertas</span>
          <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
        </button>
      </div>

      {/* Center Festive Content */}
      <div className="w-full max-w-lg flex flex-col items-center text-center px-4 relative z-10 my-auto">
        {/* Anniversary Badge com animação Pop & Glow */}
        <div className="relative mb-3 sm:mb-5 animate-badge-pop">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-tr from-amber-400 via-yellow-200 to-amber-500 p-1 festive-box-glow flex items-center justify-center rotate-3 transform hover:rotate-0 transition-transform">
            <div className="w-full h-full bg-gradient-to-br from-red-700 via-red-800 to-red-950 rounded-[22px] flex flex-col items-center justify-center p-2 text-center shadow-inner">
              <div className="flex items-center gap-1 text-amber-300">
                <Sparkles className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '3s' }} />
                <span className="text-[11px] font-black tracking-widest uppercase">1º ANO</span>
                <Sparkles className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '3s' }} />
              </div>
              <span className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-none drop-shadow">
                BELA
              </span>
              <span className="text-xs font-black text-amber-300 tracking-widest drop-shadow">
                FARMA
              </span>
            </div>
          </div>

          {/* Decorative Corner Gift Badge */}
          <div className="absolute -bottom-2 -right-2 bg-gradient-to-r from-amber-400 to-yellow-300 text-red-950 p-2 rounded-full shadow-xl animate-bounce" style={{ animationDuration: '1.8s' }}>
            <Gift className="w-5 h-5" />
          </div>
        </div>

        {/* Celebration Title */}
        <div className="inline-flex items-center gap-2 mb-2 px-3.5 py-1 bg-red-900/80 rounded-full border border-amber-400/40 text-xs sm:text-sm font-bold text-amber-200 shadow-md">
          <PartyPopper className="w-4 h-4 text-amber-300 animate-pulse" />
          <span>Grande Aniversário & Liquidação {storeName}</span>
        </div>

        <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white leading-tight mb-3 drop-shadow-lg">
          🎈 É Festa! Preços Imperdíveis 🎈
        </h1>

        {/* Mandatory Impact Message in Bold com destaque pulsante */}
        <div className="p-4 sm:p-5 rounded-2xl bg-black/30 backdrop-blur-md border-2 border-amber-300/50 shadow-2xl max-w-md mx-auto mb-3 transform hover:scale-102 transition-transform">
          <div className="flex items-start justify-center gap-2.5">
            <Zap className="w-6 h-6 text-amber-300 shrink-0 mt-0.5 animate-bounce" />
            <p className="text-base sm:text-xl font-black text-amber-200 leading-snug drop-shadow">
              Mais de 100 itens com preços incríveis e descontos imperdíveis!
            </p>
          </div>
        </div>

        <p className="text-xs sm:text-sm font-medium text-amber-100/90 max-w-sm drop-shadow">
          Economia máxima em remédios e perfumaria enquanto durar o estoque comemorativo!
        </p>
      </div>

      {/* Bottom Progress Bar & Countdown Indicator */}
      <div className="w-full max-w-md flex flex-col items-center gap-3 relative z-10 pb-2">
        {/* Countdown pill: 3s -> 2s -> 1s */}
        <div className="flex items-center justify-between w-full text-xs font-semibold text-amber-200 px-1">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
            <span>Abrindo catálogo especial...</span>
          </span>
          <span className="bg-black/30 px-2.5 py-0.5 rounded-full border border-white/20 font-mono text-sm font-bold text-white shadow-inner">
            {remainingSeconds}s
          </span>
        </div>

        {/* Progress bar: 0% to 100% */}
        <div
          className="w-full h-3 bg-black/30 rounded-full overflow-hidden p-0.5 border border-white/20 shadow-inner"
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 rounded-full transition-all duration-75 ease-linear shadow"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Fallback fast click prompt for mobile users */}
        <button
          type="button"
          onClick={handleFinish}
          className="text-xs text-amber-100/80 hover:text-white underline underline-offset-4 cursor-pointer pt-1"
        >
          Toque aqui se não quiser esperar
        </button>
      </div>
    </div>
  );
};
