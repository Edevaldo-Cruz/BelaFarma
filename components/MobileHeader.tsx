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
          <div className="bg-white px-2.5 py-1 rounded-xl shadow-sm border border-slate-200/80 dark:border-white/20 flex items-center justify-center">
            <img src="/images/logo-bela-farma.jpg" alt="Bela Farma Sul" className="h-7 w-auto object-contain" />
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
