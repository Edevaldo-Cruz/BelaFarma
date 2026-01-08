
import React from 'react';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Settings, 
  LogOut, 
  Menu, 
  X, 
  PlusSquare,
  ShieldCheck,
  User as UserIcon,
  Wallet,
  Users as UsersIcon,
  ClipboardList,
  Search,
  Calculator,
  Lock,
  Receipt,
  History
} from 'lucide-react';
import { View, User, UserRole } from '../types';

interface SidebarProps {
  user: User;
  currentView: View;
  setView: (view: View) => void;
  onLogout: () => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  user,
  currentView, 
  setView, 
  onLogout, 
  isOpen, 
  setIsOpen 
}) => {
  const isAdmin = user.role === UserRole.ADM;

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'orders', label: 'Pedidos', icon: ShoppingCart },
    { id: 'shortages', label: 'Lista de Faltas', icon: ClipboardList },
    { id: 'daily-records', label: 'Lançamentos', icon: Receipt },
    { id: 'medication-search', label: 'Consultar Méd.', icon: Search },
    ...(isAdmin ? [
      { id: 'cash-closing', label: 'Fechamento', icon: Calculator },
      { id: 'safe', label: 'Cofre', icon: Lock },
      { id: 'financial', label: 'Financeiro', icon: Wallet },
      { id: 'users', label: 'Usuários', icon: UsersIcon },
      { id: 'logs', label: 'Auditoria', icon: History }
    ] : []),
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  return (
    <>
      {!isOpen && (
         <button 
         onClick={() => setIsOpen(true)}
         className="fixed top-4 left-4 z-50 p-2 bg-white rounded-md shadow-md md:hidden"
       >
         <Menu className="w-6 h-6 text-slate-600" />
       </button>
      )}

      <aside 
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } md:relative md:translate-x-0`}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-6 py-8">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-red-600 rounded-lg shadow-lg">
                <PlusSquare className="w-6 h-6 text-white" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-xl font-black text-red-700 tracking-tighter">BELA FARMA</span>
                <span className="text-sm font-bold text-blue-700 ml-auto tracking-widest uppercase text-[10px]">Sul</span>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-1 text-slate-400 md:hidden">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="px-6 mb-8">
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <div className={`p-2 rounded-xl ${isAdmin ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                {isAdmin ? <ShieldCheck className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-xs font-black text-slate-900 truncate uppercase tracking-tighter">{user.name}</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{user.role}</span>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setView(item.id as View);
                    if (window.innerWidth < 768) setIsOpen(false);
                  }}
                  className={`flex items-center w-full gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    isActive 
                      ? 'bg-red-50 text-red-700 shadow-sm' 
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-red-600' : 'text-slate-400'}`} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-100 bg-slate-50/50">
            <button
              onClick={onLogout}
              className="flex items-center w-full gap-3 px-4 py-3 text-sm font-bold text-slate-400 rounded-xl hover:bg-red-50 hover:text-red-600 transition-all"
            >
              <LogOut className="w-5 h-5" />
              Sair do Sistema
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
