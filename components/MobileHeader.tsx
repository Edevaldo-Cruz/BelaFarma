import React from 'react';
import { Menu, Search } from 'lucide-react';

type BudgetStatus = 'safe' | 'warning' | 'danger' | 'no-budget';

interface MobileHeaderProps {
  onOpenSidebar: () => void;
  onSearch: () => void;
  budgetStatus?: BudgetStatus;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({ onOpenSidebar, onSearch, budgetStatus = 'no-budget' }) => {
  const hasTheme = budgetStatus !== 'no-budget';

  return (
    <header
      className="md:hidden flex flex-col w-full border-b shadow-sm z-30 relative transition-colors duration-500"
      style={{
        backgroundColor: 'var(--bf-header-bg)',
        borderColor: 'var(--bf-header-border)',
        color: 'var(--bf-header-text)',
      }}
    >
      {/* Top row: Centered Logo */}
      <div
        className="flex justify-center items-center py-3 border-b"
        style={{ borderColor: hasTheme ? 'var(--bf-header-border)' : 'var(--bf-header-border)' }}
      >
        <div className="flex items-center gap-2">
          <div className="p-1 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center">
            <img src="/images/logo-icon.png" alt="Bela Farma" className="w-6 h-6 object-contain" />
          </div>
          <div className="flex flex-col leading-none">
            <span
              className="text-xl font-black tracking-tighter"
              style={{ color: 'var(--bf-logo-text)' }}
            >
              belinha
            </span>
            <span
              className="text-[9px] font-bold tracking-widest uppercase italic text-right"
              style={{ color: 'var(--bf-logo-sub)' }}
            >
              sistema
            </span>
          </div>
        </div>
      </div>
      
      {/* Bottom row: Hamburger Menu and Search */}
      <div className="flex justify-between items-center px-4 py-2">
        <button 
          onClick={onOpenSidebar}
          className="p-2 rounded-md border active:scale-95 transition-all"
          style={{
            backgroundColor: 'var(--bf-sidebar-hover-bg)',
            borderColor: 'var(--bf-header-border)',
          }}
        >
          <Menu className="w-6 h-6" style={{ color: 'var(--bf-header-text)' }} />
        </button>
        
        <button 
          onClick={onSearch}
          className="flex-1 ml-4 flex items-center gap-2 px-3 py-2 rounded-xl border transition-all"
          style={{
            backgroundColor: 'var(--bf-sidebar-hover-bg)',
            borderColor: 'var(--bf-header-border)',
            color: 'var(--bf-sidebar-accent)',
          }}
        >
          <Search className="w-4 h-4" />
          <span className="text-sm font-medium">Buscar Medicamento...</span>
        </button>
      </div>
    </header>
  );
};
