import React from 'react';
import { Menu, Search, PlusSquare } from 'lucide-react';

interface MobileHeaderProps {
  onOpenSidebar: () => void;
  onSearch: () => void;
  isBudgetBusted?: boolean;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({ onOpenSidebar, onSearch, isBudgetBusted = false }) => {
  return (
    <header className={`md:hidden flex flex-col w-full border-b shadow-sm z-30 relative transition-colors duration-500 ${isBudgetBusted ? 'bg-red-950 text-red-100 border-red-900' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}>
      {/* Top row: Centered Logo */}
      <div className={`flex justify-center items-center py-3 border-b ${isBudgetBusted ? 'border-red-900/50' : 'border-slate-100 dark:border-slate-800/50'}`}>
        <div className="flex items-center gap-2">
          <div className="p-1 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center">
            <img src="/images/logo-icon.png" alt="Bela Farma" className="w-6 h-6 object-contain" />
          </div>
          <div className="flex flex-col leading-none">
            <span className={`text-xl font-black tracking-tighter ${isBudgetBusted ? 'text-red-400' : 'text-red-700 dark:text-red-500'}`}>belinha</span>
            <span className={`text-[9px] font-bold tracking-widest uppercase italic text-right ${isBudgetBusted ? 'text-red-300/80' : 'text-blue-700 dark:text-blue-400'}`}>sistema</span>
          </div>
        </div>
      </div>
      
      {/* Bottom row: Hamburger Menu and Search */}
      <div className="flex justify-between items-center px-4 py-2">
        <button 
          onClick={onOpenSidebar}
          className={`p-2 rounded-md border active:scale-95 transition-all ${
            isBudgetBusted 
              ? 'bg-red-900/40 border-red-800/60 active:bg-red-900/60 text-red-200' 
              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 active:bg-slate-100 dark:active:bg-slate-700'
          }`}
        >
          <Menu className={`w-6 h-6 ${isBudgetBusted ? 'text-red-200' : 'text-slate-600 dark:text-slate-300'}`} />
        </button>
        
        <button 
          onClick={onSearch}
          className={`flex-1 ml-4 flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
            isBudgetBusted 
              ? 'bg-red-900/40 border-red-800/60 text-red-300' 
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
          }`}
        >
          <Search className="w-4 h-4" />
          <span className="text-sm font-medium">Buscar Medicamento...</span>
        </button>
      </div>
    </header>
  );
};
