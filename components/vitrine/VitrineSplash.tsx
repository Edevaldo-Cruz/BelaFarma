import React, { useEffect, useState, useRef } from "react";
import { Sparkles, Gift, PartyPopper, ChevronRight, Zap, Flame } from "lucide-react";

export interface VitrineSplashProps {
  onComplete?: () => void;
  durationMs?: number;
  storeName?: string;
}

export const VitrineSplash: React.FC<VitrineSplashProps> = ({
  onComplete,
  durationMs = 4000,
  storeName = "BelaFarma Sul",
}) => {
  const [elapsed, setElapsed] = useState<number>(0);
  const [isExiting, setIsExiting] = useState<boolean>(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const hasFinishedRef = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleFinish = () => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    setIsExiting(true);
    setTimeout(() => {
      if (onCompleteRef.current) {
        onCompleteRef.current();
      }
    }, 400);
  };

  // 🎆 CANVAS FOGOS DE ARTIFÍCIO ULTRA-ULTRA FLUIDOS (60 FPS GPU BLITTER)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      alpha: number;
      color: string;
      size: number;
      decay: number;
      gravity: number;
    }

    interface Firework {
      x: number;
      y: number;
      targetY: number;
      vy: number;
      color: string;
      exploded: boolean;
      particles: Particle[];
    }

    interface FloatingSpark {
      x: number;
      y: number;
      vy: number;
      size: number;
      color: string;
      alpha: number;
      sway: number;
    }

    const fireworks: Firework[] = [];
    const floatingSparks: FloatingSpark[] = [];
    const colors = ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#ec4899', '#facc15', '#ffffff'];

    // 40 fagulhas flutuantes leves
    for (let i = 0; i < 40; i++) {
      floatingSparks.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vy: -(Math.random() * 1.2 + 0.4),
        size: Math.random() * 2.5 + 1.2,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: Math.random() * 0.7 + 0.3,
        sway: Math.random() * Math.PI * 2
      });
    }

    const createParticles = (x: number, y: number, color: string) => {
      const count = 28 + Math.floor(Math.random() * 15);
      const particles: Particle[] = [];
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 6.5 + 1.5;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          color,
          size: Math.random() * 3 + 1.5,
          decay: Math.random() * 0.022 + 0.016,
          gravity: 0.12
        });
      }
      return particles;
    };

    const spawnFirework = () => {
      const x = Math.random() * (width * 0.8) + width * 0.1;
      const targetY = Math.random() * (height * 0.45) + height * 0.1;
      const color = colors[Math.floor(Math.random() * colors.length)];
      fireworks.push({
        x,
        y: height,
        targetY,
        vy: -(Math.random() * 4 + 9),
        color,
        exploded: false,
        particles: []
      });
    };

    let lastSpawn = 0;

    const render = (timestamp: number) => {
      if (timestamp - lastSpawn > 280) {
        spawnFirework();
        lastSpawn = timestamp;
      }

      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.fillRect(0, 0, width, height);

      // Desativa filtros pesados para manter 60 FPS cravados sem travamento
      ctx.globalCompositeOperation = 'lighter';

      // 1. Fagulhas Flutuantes (Fundo)
      for (let i = 0; i < floatingSparks.length; i++) {
        const s = floatingSparks[i];
        s.y += s.vy;
        s.x += Math.sin(s.sway) * 0.6;
        s.sway += 0.05;
        if (s.y < -10) {
          s.y = height + 10;
          s.x = Math.random() * width;
        }

        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Fogos de Artifício
      for (let i = fireworks.length - 1; i >= 0; i--) {
        const fw = fireworks[i];
        if (!fw.exploded) {
          fw.y += fw.vy;
          ctx.globalAlpha = 1;
          ctx.fillStyle = fw.color;
          ctx.beginPath();
          ctx.arc(fw.x, fw.y, 3, 0, Math.PI * 2);
          ctx.fill();

          if (fw.y <= fw.targetY || fw.vy >= 0) {
            fw.exploded = true;
            fw.particles = createParticles(fw.x, fw.y, fw.color);
          }
        } else {
          for (let pIdx = fw.particles.length - 1; pIdx >= 0; pIdx--) {
            const p = fw.particles[pIdx];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.alpha -= p.decay;

            if (p.alpha <= 0) {
              fw.particles.splice(pIdx, 1);
            } else {
              ctx.globalAlpha = p.alpha;
              ctx.fillStyle = p.color;
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          if (fw.particles.length === 0) {
            fireworks.splice(i, 1);
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    // Dispara 2 fogos iniciais
    spawnFirework();
    spawnFirework();

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // ⏱️ TIMER OTIMIZADO (RE-RENDERIZA 5 FPS PARA NÃO BLOQUEAR A UI THREAD)
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
    }, 200); // 200ms de intervalo em vez de 40ms -> UI Thread 100% fluida!

    return () => clearInterval(interval);
  }, [durationMs]);

  const remainingSeconds = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
  const progressPercent = Math.min(100, Math.round((elapsed / durationMs) * 100));

  return (
    <div
      role="dialog"
      aria-label="Tela de Abertura Comemorativa BelaFarma"
      aria-modal="true"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-between bg-gradient-to-br from-slate-950 via-red-950 to-rose-950 text-white select-none overflow-hidden p-4 sm:p-8 transition-all duration-400 ease-out will-change-transform ${
        isExiting ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100"
      }`}
    >
      {/* Canvas GPU Blitter 60 FPS */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-0 will-change-transform" />

      {/* Estilos CSS Otimizados com GPU Hardware Acceleration (translate3d) */}
      <style>{`
        @keyframes bfRise1 {
          0% { transform: translate3d(0, 115vh, 0) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          50% { transform: translate3d(25px, 45vh, 0) rotate(6deg); }
          100% { transform: translate3d(15px, -25vh, 0) rotate(10deg); opacity: 1; }
        }
        @keyframes bfRise2 {
          0% { transform: translate3d(0, 115vh, 0) rotate(-4deg); opacity: 0; }
          12% { opacity: 1; }
          50% { transform: translate3d(-30px, 50vh, 0) rotate(8deg); }
          100% { transform: translate3d(-10px, -30vh, 0) rotate(5deg); opacity: 1; }
        }
        @keyframes bfConfetti {
          0% { transform: translate3d(0, -10vh, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate3d(0, 115vh, 0) rotate(720deg); opacity: 0.2; }
        }
        @keyframes bfCountdownPulse {
          0% { transform: scale3d(0.6, 0.6, 1) rotate(-6deg); opacity: 0; }
          45% { transform: scale3d(1.2, 1.2, 1) rotate(2deg); opacity: 1; }
          100% { transform: scale3d(1, 1, 1) rotate(0deg); opacity: 1; }
        }
        .bf-balloon-1 { animation: bfRise1 3.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite !important; will-change: transform; }
        .bf-balloon-2 { animation: bfRise2 3.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite !important; will-change: transform; }
        .bf-confetti-drop { animation: bfConfetti 2.6s linear infinite !important; will-change: transform; }
        .bf-countdown-pop { animation: bfCountdownPulse 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) !important; will-change: transform; }
      `}</style>

      {/* Elementos Decorativos Flutuantes Leves */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-1" aria-hidden="true">
        <div className="absolute -bottom-28 left-[6%] bf-balloon-1 pointer-events-none">
          <div className="relative flex flex-col items-center">
            <div className="w-16 h-20 sm:w-20 sm:h-24 rounded-[50%_50%_50%_50%/40%_40%_60%_60%] bg-gradient-to-tr from-amber-500 via-yellow-300 to-yellow-100 shadow-xl border border-yellow-200/50 flex items-center justify-center">
              <span className="text-[11px] font-black text-amber-900 tracking-tighter">1º ANO</span>
            </div>
            <div className="w-2.5 h-1.5 bg-amber-600 rounded-sm -mt-0.5" />
            <div className="w-0.5 h-20 bg-amber-200/60 -mt-0.5" />
          </div>
        </div>

        <div className="absolute -bottom-28 right-[8%] bf-balloon-2 pointer-events-none" style={{ animationDelay: '0.4s' }}>
          <div className="relative flex flex-col items-center">
            <div className="w-18 h-22 sm:w-22 sm:h-26 rounded-[50%_50%_50%_50%/40%_40%_60%_60%] bg-gradient-to-tr from-red-800 via-red-500 to-rose-300 shadow-xl border border-red-300/40 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-yellow-200" />
            </div>
            <div className="w-3 h-2 bg-red-900 rounded-sm -mt-0.5" />
            <div className="w-0.5 h-24 bg-red-200/50 -mt-0.5" />
          </div>
        </div>

        {/* Confetes leves */}
        <div className="absolute top-0 left-[18%] w-3 h-4 bg-yellow-300 rounded-sm bf-confetti-drop pointer-events-none" style={{ animationDelay: '0s', animationDuration: '2.6s' }} />
        <div className="absolute top-0 left-[48%] w-4 h-2 bg-rose-300 rounded-full bf-confetti-drop pointer-events-none" style={{ animationDelay: '0.2s', animationDuration: '2.4s' }} />
        <div className="absolute top-0 left-[78%] w-2 h-6 bg-emerald-300 rounded-full bf-confetti-drop pointer-events-none" style={{ animationDelay: '1.2s', animationDuration: '2.2s' }} />
      </div>

      {/* Cabeçalho de Topo */}
      <div className="w-full max-w-lg flex items-center justify-between relative z-10 pt-2">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/60 border border-amber-400/50 text-xs text-amber-300 font-black tracking-wide shadow-xl">
          <PartyPopper className="w-4 h-4 text-amber-300 animate-bounce" />
          <span>FESTA DE 1º ANIVERSÁRIO</span>
        </div>

        <button
          type="button"
          onClick={handleFinish}
          className="group inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 hover:from-amber-300 hover:to-white text-slate-950 font-black text-xs sm:text-sm shadow-xl transition-transform active:scale-95 cursor-pointer"
          aria-label="Pular vinheta e ver ofertas da festa"
          title="Pular animação"
        >
          <span>PULAR • VER OFERTAS</span>
          <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
        </button>
      </div>

      {/* CONTEÚDO CENTRAL ULTRA-FLUIDO COM CONTAGEM REGRESSIVA (4.. 3.. 2.. 1.. 💥 BOOM!) */}
      <div className="w-full max-w-lg flex flex-col items-center text-center px-4 relative z-10 my-auto">
        {/* SELO CENTRAL COM CONTAGEM REGRESSIVA ANIMADA */}
        <div className="relative mb-4 sm:mb-6">
          <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-3xl bg-gradient-to-tr from-amber-400 via-yellow-200 to-amber-500 p-1.5 shadow-2xl flex items-center justify-center rotate-2">
            <div className="w-full h-full bg-gradient-to-br from-red-900 via-slate-950 to-red-950 rounded-[22px] flex flex-col items-center justify-center p-3 text-center shadow-inner relative overflow-hidden">
              {remainingSeconds > 0 ? (
                <div key={remainingSeconds} className="bf-countdown-pop flex flex-col items-center justify-center">
                  <span className="text-4xl sm:text-6xl font-black tracking-tight text-amber-300 font-mono leading-none">
                    {remainingSeconds}
                  </span>
                  <span className="text-[10px] sm:text-xs font-black text-white/90 tracking-widest uppercase mt-1">
                    SEGUNDOS
                  </span>
                </div>
              ) : (
                <div className="bf-countdown-pop flex flex-col items-center justify-center">
                  <span className="text-2xl sm:text-3xl font-black text-amber-300 leading-none">
                    💥 BOOM!
                  </span>
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mt-1">
                    ABRINDO!
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="absolute -bottom-3 -right-3 bg-gradient-to-r from-amber-400 to-yellow-300 text-red-950 p-2.5 rounded-full shadow-xl">
            <Gift className="w-6 h-6" />
          </div>
        </div>

        {/* Título de Celebração */}
        <div className="inline-flex items-center gap-2 mb-3 px-4 py-1.5 bg-red-900/90 rounded-full border-2 border-amber-400/60 text-xs sm:text-sm font-black text-amber-200 shadow-xl">
          <Flame className="w-4 h-4 text-amber-300 fill-amber-300" />
          <span>Grande Aniversário & Liquidação {storeName}</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-none mb-3">
          🎈 É FESTA! PREÇOS INCRÍVEIS 🎈
        </h1>

        {/* Caixa de Mensagem de Alto Impacto */}
        <div className="p-4 sm:p-5 rounded-3xl bg-black/50 border-2 border-amber-400/70 shadow-2xl max-w-md mx-auto mb-3">
          <div className="flex items-center justify-center gap-2">
            <Zap className="w-7 h-7 text-amber-300 shrink-0" />
            <p className="text-lg sm:text-2xl font-black text-amber-200 leading-tight">
              Mais de 100 produtos com até <span className="text-yellow-300 underline underline-offset-4 decoration-amber-400 font-extrabold">70% OFF</span>!
            </p>
          </div>
        </div>

        <p className="text-xs sm:text-sm font-bold text-amber-100/90 max-w-sm">
          Economia máxima enquanto durarem os estoques comemorativos!
        </p>
      </div>

      {/* BARRA DE PROGRESSO INFERIOR */}
      <div className="w-full max-w-md flex flex-col items-center gap-2.5 relative z-10 pb-2">
        <div className="flex items-center justify-between w-full text-xs font-bold text-amber-200 px-1">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Liberando descontos exclusivos...</span>
          </span>
          <span className="bg-black/60 px-3 py-0.5 rounded-full border border-amber-400/40 font-mono text-xs font-black text-amber-300 shadow-inner">
            {progressPercent}%
          </span>
        </div>

        <div
          className="w-full h-3.5 bg-black/60 rounded-full overflow-hidden p-0.5 border border-amber-400/50 shadow-inner"
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-gradient-to-r from-red-500 via-amber-400 to-yellow-300 rounded-full transition-all duration-200 ease-out shadow-lg"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
};
