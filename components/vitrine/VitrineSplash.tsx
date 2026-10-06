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
    }, 450);
  };

  // 🎆 CANVAS FOGOS DE ARTIFÍCIO INTERATIVOS (FIREWORKS HIGH-PERFORMANCE)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
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

    // Partículas de fogos
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

    // Partículas flutuantes contínuas no ar (glitter de festa / confetes dourados)
    interface FloatingSpark {
      x: number;
      y: number;
      vy: number;
      vx: number;
      size: number;
      color: string;
      alpha: number;
      sway: number;
    }

    const fireworks: Firework[] = [];
    const floatingSparks: FloatingSpark[] = [];
    const colors = ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#facc15', '#ffffff', '#fbbf24'];

    // Inicializa 80 partículas de glitter/festa flutuando pelo ar
    for (let i = 0; i < 80; i++) {
      floatingSparks.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vy: - (Math.random() * 1.5 + 0.5),
        vx: (Math.random() - 0.5) * 1.2,
        size: Math.random() * 3 + 1.2,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: Math.random() * 0.8 + 0.2,
        sway: Math.random() * Math.PI * 2
      });
    }

    const createParticles = (x: number, y: number, color: string) => {
      const count = 45 + Math.floor(Math.random() * 35);
      const particles: Particle[] = [];
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 8 + 2;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          color,
          size: Math.random() * 4 + 1.5,
          decay: Math.random() * 0.02 + 0.012,
          gravity: 0.14
        });
      }
      return particles;
    };

    const spawnFirework = () => {
      const x = Math.random() * (width * 0.85) + width * 0.075;
      const targetY = Math.random() * (height * 0.5) + height * 0.08;
      const color = colors[Math.floor(Math.random() * colors.length)];
      fireworks.push({
        x,
        y: height,
        targetY,
        vy: - (Math.random() * 5 + 10),
        color,
        exploded: false,
        particles: []
      });
    };

    let lastSpawn = Date.now();

    const loop = () => {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      const now = Date.now();
      // Dispara fogos de artifício com maior frequência
      if (now - lastSpawn > 220) {
        spawnFirework();
        lastSpawn = now;
      }

      // 1. Renderiza centenas de partículas/glitter flutuando para o alto
      for (let s of floatingSparks) {
        s.y += s.vy;
        s.x += Math.sin(s.sway) * 0.8;
        s.sway += 0.04;
        if (s.y < -10) {
          s.y = height + 10;
          s.x = Math.random() * width;
        }

        ctx.save();
        ctx.globalAlpha = s.alpha;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = s.color;
        ctx.fill();
        ctx.restore();
      }

      // 2. Renderiza explosões de fogos e feixes
      for (let i = fireworks.length - 1; i >= 0; i--) {
        const fw = fireworks[i];
        if (!fw.exploded) {
          fw.y += fw.vy;
          ctx.beginPath();
          ctx.arc(fw.x, fw.y, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = fw.color;
          ctx.shadowBlur = 15;
          ctx.shadowColor = fw.color;
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
              ctx.save();
              ctx.globalAlpha = p.alpha;
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
              ctx.fillStyle = p.color;
              ctx.shadowBlur = 12;
              ctx.shadowColor = p.color;
              ctx.fill();
              ctx.restore();
            }
          }
          if (fw.particles.length === 0) {
            fireworks.splice(i, 1);
          }
        }
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    // Dispara 4 fogos iniciais instantâneos
    spawnFirework();
    spawnFirework();
    spawnFirework();
    spawnFirework();

    loop();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // ⏱️ TIMER DA CONTAGEM REGRESSIVA (4.. 3.. 2.. 1.. 💥 BOOM!)
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

    return () => clearInterval(interval);
  }, [durationMs]);

  const remainingSeconds = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
  const progressPercent = Math.min(100, Math.round((elapsed / durationMs) * 100));

  return (
    <div
      role="dialog"
      aria-label="Tela de Abertura Comemorativa BelaFarma"
      aria-modal="true"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-between bg-gradient-to-br from-slate-950 via-red-950 to-rose-950 text-white select-none overflow-hidden p-4 sm:p-8 transition-all duration-500 ease-out ${
        isExiting ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100"
      }`}
    >
      {/* Canvas do Show de Fogos de Artifício 3D */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-0" />

      {/* Estilos CSS nativos encapsulados para balões e animações de festa */}
      <style>{`
        @keyframes bfRise1 {
          0% { transform: translateY(115vh) translateX(0px) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          50% { transform: translateY(45vh) translateX(30px) rotate(8deg); }
          80% { transform: translateY(15vh) translateX(-20px) rotate(-6deg); }
          100% { transform: translateY(-25vh) translateX(25px) rotate(12deg); opacity: 1; }
        }
        @keyframes bfRise2 {
          0% { transform: translateY(115vh) translateX(0px) rotate(-5deg); opacity: 0; }
          12% { opacity: 1; }
          45% { transform: translateY(50vh) translateX(-35px) rotate(10deg); }
          75% { transform: translateY(20vh) translateX(20px) rotate(-8deg); }
          100% { transform: translateY(-30vh) translateX(-15px) rotate(6deg); opacity: 1; }
        }
        @keyframes bfConfetti {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          50% { transform: translateY(50vh) rotate(360deg); opacity: 0.9; }
          100% { transform: translateY(115vh) rotate(720deg); opacity: 0.2; }
        }
        @keyframes bfCountdownPulse {
          0% { transform: scale(0.6) rotate(-8deg); opacity: 0; }
          40% { transform: scale(1.3) rotate(3deg); opacity: 1; filter: drop-shadow(0 0 35px rgba(250, 204, 21, 0.9)); }
          70% { transform: scale(0.95) rotate(-1deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes bfGlowPulse {
          0%, 100% { box-shadow: 0 0 35px rgba(251, 191, 36, 0.6), 0 0 70px rgba(239, 68, 68, 0.5); }
          50% { box-shadow: 0 0 65px rgba(251, 191, 36, 1), 0 0 110px rgba(239, 68, 68, 0.8); }
        }
        .bf-balloon-1 { animation: bfRise1 3.2s cubic-bezier(0.2, 0.6, 0.4, 1) infinite !important; }
        .bf-balloon-2 { animation: bfRise2 3.8s cubic-bezier(0.2, 0.6, 0.4, 1) infinite !important; }
        .bf-confetti-drop { animation: bfConfetti 2.6s linear infinite !important; }
        .bf-countdown-pop { animation: bfCountdownPulse 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) !important; }
        .bf-box-glow { animation: bfGlowPulse 1.5s ease-in-out infinite !important; }
      `}</style>

      {/* Elementos Decorativos: Balões e Confetes Flutuantes */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-1" aria-hidden="true">
        {/* BALÕES COLORIDOS EM MOVIMENTO SUBINDO */}
        {/* Balão 1 - Dourado Especial 1º Ano (Esquerda) */}
        <div className="absolute -bottom-28 left-[4%] bf-balloon-1 pointer-events-none" style={{ animationDelay: '0s' }}>
          <div className="relative flex flex-col items-center">
            <div className="w-16 h-20 sm:w-20 sm:h-24 rounded-[50%_50%_50%_50%/40%_40%_60%_60%] bg-gradient-to-tr from-amber-500 via-yellow-300 to-yellow-100 shadow-2xl border border-yellow-200/50 flex items-center justify-center">
              <span className="text-[11px] font-black text-amber-900 tracking-tighter">1º ANO</span>
            </div>
            <div className="w-2.5 h-1.5 bg-amber-600 rounded-sm -mt-0.5" />
            <div className="w-0.5 h-20 bg-amber-200/60 -mt-0.5 animate-pulse" />
          </div>
        </div>

        {/* Balão 2 - Vermelho Vivo Festivo (Direita) */}
        <div className="absolute -bottom-28 right-[5%] bf-balloon-2 pointer-events-none" style={{ animationDelay: '0.4s' }}>
          <div className="relative flex flex-col items-center">
            <div className="w-18 h-22 sm:w-22 sm:h-26 rounded-[50%_50%_50%_50%/40%_40%_60%_60%] bg-gradient-to-tr from-red-700 via-red-500 to-rose-300 shadow-2xl border border-red-300/40 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-yellow-200 animate-spin" style={{ animationDuration: '4s' }} />
            </div>
            <div className="w-3 h-2 bg-red-900 rounded-sm -mt-0.5" />
            <div className="w-0.5 h-24 bg-red-200/50 -mt-0.5" />
          </div>
        </div>

        {/* Balão 3 - Azul Real BelaFarma (Centro-Esquerda) */}
        <div className="absolute -bottom-28 left-[22%] bf-balloon-1 pointer-events-none" style={{ animationDelay: '1.2s' }}>
          <div className="relative flex flex-col items-center">
            <div className="w-15 h-19 sm:w-18 sm:h-22 rounded-[50%_50%_50%_50%/40%_40%_60%_60%] bg-gradient-to-tr from-blue-700 via-sky-400 to-sky-100 shadow-xl border border-sky-200/40 flex items-center justify-center">
              <span className="text-[10px] font-black text-white/90">BELA</span>
            </div>
            <div className="w-2.5 h-1.5 bg-blue-900 rounded-sm -mt-0.5" />
            <div className="w-0.5 h-20 bg-sky-200/50 -mt-0.5" />
          </div>
        </div>

        {/* Balão 4 - Dourado Claro com Brilho (Centro-Direita) */}
        <div className="absolute -bottom-28 right-[24%] bf-balloon-2 pointer-events-none" style={{ animationDelay: '1.8s' }}>
          <div className="relative flex flex-col items-center">
            <div className="w-16 h-20 sm:w-20 sm:h-24 rounded-[50%_50%_50%_50%/40%_40%_60%_60%] bg-gradient-to-tr from-amber-600 via-amber-300 to-yellow-100 shadow-2xl border border-yellow-100/50 flex items-center justify-center">
              <span className="text-xs font-black text-amber-900 tracking-tighter">FARMA</span>
            </div>
            <div className="w-3 h-2 bg-amber-700 rounded-sm -mt-0.5" />
            <div className="w-0.5 h-22 bg-amber-100/60 -mt-0.5" />
          </div>
        </div>

        {/* Balão 5 - Verde Saúde / Sucesso (Canto Esquerdo Suave) */}
        <div className="absolute -bottom-28 left-[12%] bf-balloon-2 pointer-events-none" style={{ animationDelay: '2.3s' }}>
          <div className="relative flex flex-col items-center">
            <div className="w-13 h-17 sm:w-15 sm:h-19 rounded-[50%_50%_50%_50%/40%_40%_60%_60%] bg-gradient-to-tr from-emerald-600 via-teal-400 to-emerald-200 shadow-xl border border-emerald-200/40" />
            <div className="w-2 h-1 bg-emerald-800 rounded-sm -mt-0.5" />
            <div className="w-0.5 h-16 bg-emerald-200/40 -mt-0.5" />
          </div>
        </div>

        {/* Balão 6 - Roxo / Violeta Festivo (Canto Direito Suave) */}
        <div className="absolute -bottom-28 right-[14%] bf-balloon-1 pointer-events-none" style={{ animationDelay: '0.9s' }}>
          <div className="relative flex flex-col items-center">
            <div className="w-14 h-18 sm:w-16 sm:h-20 rounded-[50%_50%_50%_50%/40%_40%_60%_60%] bg-gradient-to-tr from-fuchsia-700 via-pink-400 to-purple-200 shadow-xl border border-pink-200/40" />
            <div className="w-2 h-1 bg-fuchsia-900 rounded-sm -mt-0.5" />
            <div className="w-0.5 h-18 bg-purple-200/40 -mt-0.5" />
          </div>
        </div>

        {/* Balão 7 - Vermelho Cereja (Fundo Centro) */}
        <div className="absolute -bottom-28 left-[45%] bf-balloon-2 pointer-events-none opacity-80" style={{ animationDelay: '2.7s' }}>
          <div className="relative flex flex-col items-center">
            <div className="w-14 h-18 rounded-[50%_50%_50%_50%/40%_40%_60%_60%] bg-gradient-to-tr from-rose-800 via-red-600 to-red-300 shadow-lg border border-red-200/30" />
            <div className="w-2 h-1 bg-red-950 rounded-sm -mt-0.5" />
            <div className="w-0.5 h-16 bg-red-200/30 -mt-0.5" />
          </div>
        </div>

        {/* Confetes em cascata contínua */}
        <div className="absolute top-0 left-[8%] w-3 h-4 bg-yellow-300 rounded-sm bf-confetti-drop pointer-events-none" style={{ animationDelay: '0s', animationDuration: '2.4s' }} />
        <div className="absolute top-0 left-[20%] w-2.5 h-5 bg-amber-200 rounded-full bf-confetti-drop pointer-events-none" style={{ animationDelay: '0.6s', animationDuration: '2.1s' }} />
        <div className="absolute top-0 left-[35%] w-3 h-3 bg-sky-300 rounded-sm bf-confetti-drop pointer-events-none" style={{ animationDelay: '1.2s', animationDuration: '2.6s' }} />
        <div className="absolute top-0 left-[48%] w-4 h-2 bg-rose-300 rounded-full bf-confetti-drop pointer-events-none" style={{ animationDelay: '0.3s', animationDuration: '2.3s' }} />
        <div className="absolute top-0 left-[62%] w-3 h-4 bg-yellow-400 rounded-sm bf-confetti-drop pointer-events-none" style={{ animationDelay: '0.9s', animationDuration: '2.5s' }} />
        <div className="absolute top-0 left-[75%] w-2 h-6 bg-emerald-300 rounded-full bf-confetti-drop pointer-events-none" style={{ animationDelay: '1.5s', animationDuration: '2.0s' }} />
        <div className="absolute top-0 left-[88%] w-3 h-3 bg-amber-300 rounded-sm bf-confetti-drop pointer-events-none" style={{ animationDelay: '0.4s', animationDuration: '2.8s' }} />
        <div className="absolute top-0 left-[94%] w-2.5 h-4 bg-purple-300 rounded-sm bf-confetti-drop pointer-events-none" style={{ animationDelay: '1.1s', animationDuration: '2.2s' }} />
      </div>

      {/* Cabeçalho de Topo com Botão Destacado para Entrar Direto */}
      <div className="w-full max-w-lg flex items-center justify-between relative z-10 pt-2">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-amber-400/50 text-xs text-amber-300 font-black tracking-wide shadow-xl">
          <PartyPopper className="w-4 h-4 text-amber-300 animate-bounce" />
          <span>FESTA DE 1º ANIVERSÁRIO</span>
        </div>

        <button
          type="button"
          onClick={handleFinish}
          className="group inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 hover:from-amber-300 hover:to-white text-slate-950 font-black text-xs sm:text-sm shadow-2xl transition-all transform hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer"
          aria-label="Entrar na festa e ver ofertas"
        >
          <span>VER OFERTAS DA FESTA</span>
          <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
        </button>
      </div>

      {/* CONTEÚDO CENTRAL VIBRANTE COM CONTAGEM REGRESSIVA GIGANTE (4.. 3.. 2.. 1.. 💥 BOOM!) */}
      <div className="w-full max-w-lg flex flex-col items-center text-center px-4 relative z-10 my-auto">
        {/* BADGE CENTRAL COM CONTAGEM REGRESSIVA ANIMADA */}
        <div className="relative mb-4 sm:mb-6">
          <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-3xl bg-gradient-to-tr from-amber-400 via-yellow-200 to-amber-500 p-1.5 bf-box-glow flex items-center justify-center rotate-2">
            <div className="w-full h-full bg-gradient-to-br from-red-900 via-slate-950 to-red-950 rounded-[22px] flex flex-col items-center justify-center p-3 text-center shadow-inner relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-t from-amber-500/10 to-transparent pointer-events-none" />
              
              {remainingSeconds > 0 ? (
                <div key={remainingSeconds} className="bf-countdown-pop flex flex-col items-center justify-center">
                  <span className="text-4xl sm:text-6xl font-black tracking-tight text-amber-300 drop-shadow-[0_4px_10px_rgba(251,191,36,0.8)] font-mono leading-none">
                    {remainingSeconds}
                  </span>
                  <span className="text-[10px] sm:text-xs font-black text-white/90 tracking-widest uppercase mt-1">
                    SEGUNDOS
                  </span>
                </div>
              ) : (
                <div className="bf-countdown-pop flex flex-col items-center justify-center">
                  <span className="text-2xl sm:text-3xl font-black text-amber-300 animate-pulse leading-none">
                    💥 BOOM!
                  </span>
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mt-1">
                    ABRINDO!
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="absolute -bottom-3 -right-3 bg-gradient-to-r from-amber-400 to-yellow-300 text-red-950 p-2.5 rounded-full shadow-2xl animate-bounce">
            <Gift className="w-6 h-6" />
          </div>
        </div>

        {/* Título de Celebração */}
        <div className="inline-flex items-center gap-2 mb-3 px-4 py-1.5 bg-red-900/90 rounded-full border-2 border-amber-400/60 text-xs sm:text-sm font-black text-amber-200 shadow-xl">
          <Flame className="w-4 h-4 text-amber-300 animate-pulse fill-amber-300" />
          <span>Grande Aniversário & Liquidação {storeName}</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-none mb-3 drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
          🎈 É FESTA! PREÇOS INCRÍVEIS 🎈
        </h1>

        {/* Caixa de Mensagem de Alto Impacto */}
        <div className="p-4 sm:p-5 rounded-3xl bg-black/50 backdrop-blur-md border-2 border-amber-400/70 shadow-2xl max-w-md mx-auto mb-3 transform hover:scale-102 transition-transform">
          <div className="flex items-center justify-center gap-2">
            <Zap className="w-7 h-7 text-amber-300 shrink-0 animate-bounce" />
            <p className="text-lg sm:text-2xl font-black text-amber-200 leading-tight drop-shadow">
              Mais de 100 produtos com até <span className="text-yellow-300 underline underline-offset-4 decoration-amber-400 font-extrabold">70% OFF</span>!
            </p>
          </div>
        </div>

        <p className="text-xs sm:text-sm font-bold text-amber-100/90 max-w-sm drop-shadow">
          Economia máxima enquanto durarem os estoques comemorativos!
        </p>
      </div>

      {/* BARRA DE PROGRESSO INFERIOR DE CARREGAMENTO VIBRANTE */}
      <div className="w-full max-w-md flex flex-col items-center gap-2.5 relative z-10 pb-2">
        <div className="flex items-center justify-between w-full text-xs font-bold text-amber-200 px-1">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-300 animate-spin" />
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
            className="h-full bg-gradient-to-r from-red-500 via-amber-400 to-yellow-300 rounded-full transition-all duration-150 ease-out shadow-lg"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
};
