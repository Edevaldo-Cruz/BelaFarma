import React, { useState, useEffect } from 'react';
import { 
  ShoppingBag, 
  LayoutDashboard, 
  Sparkles, 
  Calculator, 
  ShieldCheck, 
  FileText, 
  Users, 
  Smartphone, 
  RefreshCw, 
  TrendingUp, 
  Bell, 
  Wallet,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Layers
} from 'lucide-react';
import { CentralComprasTab, User } from '../types';
import { useToast } from './ToastContext';

// Subcomponentes Especializados
import { ComprasDashboard } from './compras/ComprasDashboard';
import { ComprasMineracao } from './compras/ComprasMineracao';
import { ComprasEquivalentes } from './compras/ComprasEquivalentes';
import { ComprasCotacoes } from './compras/ComprasCotacoes';
import { ComprasAprovacaoFila } from './compras/ComprasAprovacaoFila';
import { ComprasPedidosPainel } from './compras/ComprasPedidosPainel';
import { ComprasRepresentantes } from './compras/ComprasRepresentantes';
import { ComprasWhatsAppConexao } from './compras/ComprasWhatsAppConexao';

interface CentralComprasProps {
  user: User;
  theme: 'light' | 'dark';
  onNavigate?: (view: any) => void;
}

export const CentralCompras: React.FC<CentralComprasProps> = ({
  user,
  theme,
  onNavigate
}) => {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<CentralComprasTab>('dashboard');
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);
  const [whatsappConnected, setWhatsappConnected] = useState<boolean>(false);
  const [preselectedItemsForCotacao, setPreselectedItemsForCotacao] = useState<any[]>([]);
  const [preselectedDataForPedidos, setPreselectedDataForPedidos] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Monitora contadores globais da Central de Compras
  const atualizarMetricasGlobais = async () => {
    try {
      setIsRefreshing(true);
      // Contador da fila de aprovação
      const resAprov = await fetch('/api/central-compras/aprovacoes/contador');
      if (resAprov.ok) {
        const dataAprov = await resAprov.json();
        if (typeof dataAprov.pendentes === 'number') {
          setPendingApprovalsCount(dataAprov.pendentes);
        }
      }

      // Status do WhatsApp Baileys Compras
      const resWa = await fetch('/api/central-compras/whatsapp/status');
      if (resWa.ok) {
        const dataWa = await resWa.json();
        if (dataWa.success && dataWa.data) {
          const isConn = Boolean(dataWa.data.connected || dataWa.data.isConnected || dataWa.data.state === 'connected');
          setWhatsappConnected(isConn);
        }
      }
    } catch (e) {
      // Silencioso
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    atualizarMetricasGlobais();
    const interval = setInterval(atualizarMetricasGlobais, 20000);
    return () => clearInterval(interval);
  }, []);

  const handleNavigateToTab = (tab: string, items?: any[]) => {
    if (tab === 'cotacoes' && items) {
      setPreselectedItemsForCotacao(items);
    } else if (tab === 'pedidos' && items) {
      setPreselectedDataForPedidos(items);
    }
    setActiveTab(tab as CentralComprasTab);
  };

  const tabsConfig = [
    {
      id: 'dashboard',
      label: '1. Gestão de Estoque & Demanda',
      shortLabel: 'Estoque & Demanda',
      icon: LayoutDashboard,
      badge: null
    },
    {
      id: 'mineracao',
      label: '2. Mineração & Ofertas',
      shortLabel: 'Mineração IA',
      icon: Sparkles,
      badge: null
    },
    {
      id: 'equivalentes',
      label: '3. Equivalentes & Marcas',
      shortLabel: 'Equivalentes',
      icon: Layers,
      badge: null
    },
    {
      id: 'cotacoes',
      label: '4. Cotações & Ranking',
      shortLabel: 'Cotações',
      icon: Calculator,
      badge: null
    },
    {
      id: 'aprovacao',
      label: '5. Fila de Aprovação',
      shortLabel: 'Aprovação',
      icon: ShieldCheck,
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : null
    },
    {
      id: 'pedidos',
      label: '6. Pedidos & Orçamento',
      shortLabel: 'Pedidos',
      icon: FileText,
      badge: null
    },
    {
      id: 'representantes',
      label: '7. Representantes',
      shortLabel: 'Representantes',
      icon: Users,
      badge: null
    },
    {
      id: 'whatsapp',
      label: '8. WhatsApp Comercial',
      shortLabel: 'WhatsApp',
      icon: Smartphone,
      isOnline: whatsappConnected
    }
  ];

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 animate-in fade-in duration-300">
      {/* Header Principal com Título, Status e Atualização */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-red-600 to-orange-600 text-white rounded-2xl shadow-md">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                Central de Compras BelaFarma
              </h1>
              <p className="text-xs font-bold text-slate-400">
                Gestão autônoma de estoque para 30 dias, mineração no WhatsApp e motor de cotações com aprovação humana
              </p>
            </div>
          </div>
        </div>

        {/* Indicadores de Status em Tempo Real */}
        <div className="flex items-center gap-3">
          {/* Status WhatsApp Compras */}
          <div 
            onClick={() => setActiveTab('whatsapp')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold shadow-sm cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 transition-all"
            title="Clique para ver o painel do WhatsApp Comercial"
          >
            <span className={`w-2.5 h-2.5 rounded-full ${whatsappConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="text-slate-700 dark:text-slate-300">
              WA Compras: <b>{whatsappConnected ? 'Conectado' : 'Aguardando QR'}</b>
            </span>
          </div>

          {/* Badge de Aprovações Pendentes */}
          {pendingApprovalsCount > 0 && (
            <div 
              onClick={() => setActiveTab('aprovacao')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black shadow-md cursor-pointer animate-pulse transition-all"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>{pendingApprovalsCount} {pendingApprovalsCount === 1 ? 'Aprovação Pendente' : 'Aprovações Pendentes'}</span>
            </div>
          )}

          {/* Botão de Refresh Global */}
          <button
            onClick={atualizarMetricasGlobais}
            disabled={isRefreshing}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer shadow-sm disabled:opacity-40"
            title="Atualizar dados da Central de Compras"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-red-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Navegação por Sub-Abas (Pills Navigation) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {tabsConfig.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as CentralComprasTab)}
              className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer select-none shrink-0 ${
                isActive
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md scale-[1.02]'
                  : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-800'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-red-500 dark:text-red-600' : 'text-slate-400'}`} />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel}</span>

              {tab.badge !== null && tab.badge !== undefined && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-red-600 text-white shadow-sm animate-pulse">
                  {tab.badge}
                </span>
              )}

              {tab.isOnline !== undefined && (
                <span className={`w-2 h-2 rounded-full ${tab.isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              )}
            </button>
          );
        })}
      </div>

      {/* Conteúdo Dinâmico das 7 Subseções */}
      <div className="transition-all duration-300">
        {activeTab === 'dashboard' && (
          <ComprasDashboard
            user={user}
            theme={theme}
            onNavigateToTab={handleNavigateToTab}
          />
        )}

        {activeTab === 'mineracao' && (
          <ComprasMineracao
            user={user}
            theme={theme}
            onNavigateToTab={handleNavigateToTab}
          />
        )}

        {activeTab === 'equivalentes' && (
          <ComprasEquivalentes
            user={user}
            theme={theme}
          />
        )}

        {activeTab === 'cotacoes' && (
          <ComprasCotacoes
            user={user}
            theme={theme}
            preselectedItems={preselectedItemsForCotacao}
            onNavigateToTab={handleNavigateToTab}
          />
        )}

        {activeTab === 'aprovacao' && (
          <ComprasAprovacaoFila
            user={user}
            theme={theme}
            onApprovalsUpdated={atualizarMetricasGlobais}
          />
        )}

        {activeTab === 'pedidos' && (
          <ComprasPedidosPainel
            user={user}
            theme={theme}
            preselectedData={preselectedDataForPedidos}
            onNavigateToTab={handleNavigateToTab}
          />
        )}

        {activeTab === 'representantes' && (
          <ComprasRepresentantes
            user={user}
            theme={theme}
          />
        )}

        {activeTab === 'whatsapp' && (
          <ComprasWhatsAppConexao
            user={user}
            theme={theme}
          />
        )}
      </div>
    </div>
  );
};
