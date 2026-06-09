import React from 'react';
import { Menu, Search, PlusSquare } from 'lucide-react';

interface MobileHeaderProps {
  onOpenSidebar: () => void;
  onSearch: () => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({ onOpenSidebar, onSearch }) => {
  return (
    <header className="md:hidden flex flex-col w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm z-30 relative">
      {/* Top row: Centered Logo */}
      <div className="flex justify-center items-center py-3 border-b border-slate-100 dark:border-slate-800/50">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-red-600 rounded-md shadow-sm">
            <PlusSquare className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-xl font-black text-red-700 dark:text-red-500 tracking-tighter">belinha</span>
            <span className="text-[9px] font-bold text-blue-700 dark:text-blue-400 tracking-widest uppercase italic text-right">sistema</span>
          </div>
        </div>
      </div>
      
      {/* Bottom row: Hamburger Menu and Search */}
      <div className="flex justify-between items-center px-4 py-2">
        <button 
          onClick={onOpenSidebar}
          className="p-2 bg-slate-50 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 active:bg-slate-100 dark:active:bg-slate-700 transition-colors"
        >
          <Menu className="w-6 h-6 text-slate-600 dark:text-slate-300" />
        </button>
        
        <button 
          onClick={onSearch}
          className="flex-1 ml-4 flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl border border-slate-200 dark:border-slate-700"
        >
          <Search className="w-4 h-4" />
          <span className="text-sm font-medium">Buscar Medicamento...</span>
        </button>
      </div>
    </header>
  );
};
