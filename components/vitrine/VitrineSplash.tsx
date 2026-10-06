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
      {/* Decorative festive background particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {/* Floating Confetti Elements */}
        <div className="absolute -top-4 left-1/4 w-3 h-8 bg-amber-300 rounded-full rotate-45 opacity-80 animate-bounce" style={{ animationDuration: '2.5s' }} />
        <div className="absolute top-12 right-1/4 w-3 h-3 bg-yellow-200 rounded-sm rotate-12 opacity-90 animate-ping" style={{ animationDuration: '3s' }} />
        <div className="absolute top-1/3 left-10 w-4 h-4 bg-sky-300 rounded-full opacity-70 animate-pulse" />
        <div className="absolute bottom-1/4 right-8 w-3 h-6 bg-emerald-300 rounded-full -rotate-12 opacity-80" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-72 h-72 bg-red-500/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 left-1/3 w-80 h-80 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* SVG Balloons Graphic */}
        <svg
          className="absolute -top-10 -right-8 w-44 h-44 text-amber-300/20"
          viewBox="0 0 100 100"
          fill="currentColor"
        >
          <ellipse cx="40" cy="45" rx="22" ry="28" />
          <polygon points="38,73 42,73 40,78" />
          <path d="M40,78 Q45,90 35,98" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
        <svg
          className="absolute -bottom-8 -left-8 w-48 h-48 text-yellow-300/15"
          viewBox="0 0 100 100"
          fill="currentColor"
        >
          <ellipse cx="50" cy="45" rx="25" ry="32" />
          <polygon points="48,77 52,77 50,82" />
          <path d="M50,82 Q42,92 52,100" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </div>

      {/* Top Bar with Skip Button */}
      <div className="w-full max-w-md flex items-center justify-between relative z-10 pt-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/25 backdrop-blur-md border border-white/15 text-xs text-amber-200 font-semibold tracking-wide shadow-sm">
          <PartyPopper className="w-4 h-4 text-amber-300 animate-spin" style={{ animationDuration: '6s' }} />
          <span>Festival de Ofertas</span>
        </div>

        {/* Prominent Skip Button */}
        <button
          type="button"
          onClick={handleFinish}
          className="group inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-red-700 hover:bg-amber-100 active:bg-amber-200 font-bold text-sm shadow-lg transition-transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-red-700"
          aria-label="Pular tela de abertura e ver ofertas"
        >
          <span>Pular • Ver Ofertas</span>
          <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      {/* Center Festive Content */}
      <div className="w-full max-w-lg flex flex-col items-center text-center px-4 relative z-10 my-auto">
        {/* Anniversary Badge */}
        <div className="relative mb-4 sm:mb-6">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-gradient-to-tr from-amber-400 via-yellow-300 to-amber-500 p-1 shadow-2xl flex items-center justify-center rotate-3 transform hover:rotate-0 transition-transform">
            <div className="w-full h-full bg-red-700 rounded-[22px] flex flex-col items-center justify-center p-2 text-center shadow-inner">
              <div className="flex items-center gap-1 text-amber-300">
                <Sparkles className="w-4 h-4 animate-pulse" />
                <span className="text-xs font-black tracking-widest uppercase">1º ANO</span>
                <Sparkles className="w-4 h-4 animate-pulse" />
              </div>
              <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-none">
                BELA
              </span>
              <span className="text-xs font-bold text-yellow-300 tracking-wider">
                FARMA
              </span>
            </div>
          </div>

          {/* Decorative Corner Glow */}
          <div className="absolute -bottom-2 -right-2 bg-amber-400 text-red-950 p-1.5 rounded-full shadow-lg">
            <Gift className="w-5 h-5" />
          </div>
        </div>

        {/* Celebration Title */}
        <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 bg-red-800/60 rounded-full border border-red-500/40 text-xs sm:text-sm font-medium text-amber-200">
          <PartyPopper className="w-4 h-4 text-amber-300" />
          <span>Grande Aniversário & Liquidação {storeName}</span>
        </div>

        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight mb-4 drop-shadow-md">
          Celebre Conosco com Preços de Verdade!
        </h1>

        {/* Mandatory Impact Message in Bold */}
        <div className="p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-xl max-w-md mx-auto mb-4">
          <div className="flex items-start justify-center gap-2">
            <Zap className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
            <p className="text-base sm:text-lg font-bold text-amber-100 leading-snug">
              Mais de 100 itens com preços incríveis e descontos imperdíveis!
            </p>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-red-100/90 max-w-sm">
          Medicamentos, perfumaria e cuidados especiais com estoque limitado e entrega rápida.
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
