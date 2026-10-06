import React from 'react';

interface BelaFarmaLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showSubtext?: boolean;
  lightMode?: boolean;
}

export const BelaFarmaLogo: React.FC<BelaFarmaLogoProps> = ({
  className = '',
  size = 'md',
  showSubtext = true,
  lightMode = false
}) => {
  const symbolSizes = {
    sm: 'h-8 sm:h-9',
    md: 'h-10 sm:h-12',
    lg: 'h-14 sm:h-16'
  };

  const textSizes = {
    sm: 'text-sm sm:text-base',
    md: 'text-lg sm:text-2xl',
    lg: 'text-2xl sm:text-3xl'
  };

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Símbolo Oficial Cálices + Cruz Vermelha da BelaFarma */}
      <img
        src="/logo/logo-simbolo.png"
        alt="Símbolo BelaFarma Sul"
        className={`${symbolSizes[size]} w-auto object-contain drop-shadow-sm shrink-0`}
        onError={(e) => {
          // Fallback gracioso caso a imagem demore para carregar no dev
          (e.target as HTMLElement).style.display = 'none';
        }}
      />

      <div className="flex flex-col justify-center leading-tight">
        <div className="flex items-baseline gap-1">
          <span className={`font-black tracking-tight text-red-600 ${lightMode ? 'text-red-500' : 'dark:text-red-500'} ${textSizes[size]}`}>
            BELA FARMA
          </span>
          <span className={`font-extrabold text-blue-600 ${lightMode ? 'text-blue-300' : 'dark:text-blue-400'} italic text-xs sm:text-base font-sans ml-0.5`}>
            Sul
          </span>
        </div>
        {showSubtext && (
          <span className={`text-[10px] sm:text-[11px] font-bold tracking-wide uppercase ${lightMode ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
            Ipiranga • Juiz de Fora - MG
          </span>
        )}
      </div>
    </div>
  );
};
