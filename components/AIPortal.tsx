import React, { useState } from 'react';
import { ArrowLeft, Star, TrendingUp, ShoppingCart, BrainCircuit, Sparkles } from 'lucide-react';
import MarketingAgent from './MarketingAgent';
import FinancialAgent from './FinancialAgent';

type ActiveAgent = 'portal' | 'marketing' | 'financeiro';

interface AgentCard {
  id: ActiveAgent;
  name: string;
  subtitle: string;
  description: string;
  emoji: string;
  gradient: string;
  accentColor: string;
  available: boolean;
}

const agents: AgentCard[] = [
  {
    id: 'marketing',
    name: 'Isa-Marketing',
    subtitle: 'Estrategista Digital',
    description: 'Relatórios quinzenais, datas comemorativas, ideias de promoção, curadoria de notícias e alertas climáticos para impulsionar suas vendas.',
    emoji: '📢',
    gradient: 'from-violet-600 via-purple-600 to-indigo-600',
    accentColor: 'violet',
    available: true,
  },
  {
    id: 'financeiro',
    name: 'Isa-Financeiro',
    subtitle: 'Vigilante Financeira',
    description: 'Análise inteligente do caixa, cruzamento de faturamento com boletos, e leitura automática de relatórios Digifarma.',
    emoji: '💰',
    gradient: 'from-emerald-600 via-teal-600 to-cyan-500',
    accentColor: 'emerald',
    available: true,
  },
  {
    id: 'portal', // placeholder
    name: 'Isa-Compras',
    subtitle: 'Gestora de Pedidos',
    description: 'Sugestão de compras baseada no giro de estoque, detecção de produtos em falta e comparação de cotações entre fornecedores.',
    emoji: '🛒',
    gradient: 'from-amber-500 via-orange-500 to-red-500',
    accentColor: 'amber',
    available: false,
  },
];

export default function AIPortal() {
  const [activeAgent, setActiveAgent] = useState<ActiveAgent>('portal');

  // Renderiza o agente selecionado
  if (activeAgent === 'marketing') {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setActiveAgent('portal')}
          className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-violet-600 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Voltar à Central de IAs
        </button>
        <MarketingAgent />
      </div>
    );
  }

  if (activeAgent === 'financeiro') {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setActiveAgent('portal')}
          className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-emerald-600 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Voltar à Central de IAs
        </button>
        <FinancialAgent />
      </div>
    );
  }

  // Portal principal
  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto pb-12">
      {/* Hero Header */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-10 text-white shadow-2xl overflow-hidden relative">
        {/* Decorações de fundo */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="h-20 w-20 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-inner border border-white/10">
              <BrainCircuit className="w-10 h-10 text-violet-300" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight mb-1">Central de IAs</h1>
              <p className="text-slate-400 font-medium flex gap-2">
                <span>Suas assistentes inteligentes</span>
                <span className="text-slate-600">•</span>
                <span>Bela Farma Sul</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-4 py-2 bg-white/5 text-slate-300 border border-white/10 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              Powered by Gemini
            </span>
          </div>
        </div>

        {/* Mensagem da Isa */}
        <div className="relative z-10 mt-6 p-4 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10">
          <p className="text-sm text-slate-300 italic">
            &ldquo;Oi! Sou a Isa, sua assistente com inteligência artificial. Escolha abaixo qual área você precisa de ajuda hoje — marketing, financeiro, ou em breve, compras!&rdquo;
          </p>
        </div>
      </div>

      {/* Grid de Agentes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {agents.map((agent) => (
          <div
            key={agent.id}
            onClick={() => agent.available && setActiveAgent(agent.id)}
            className={`
              relative bg-white dark:bg-slate-900 border-2 rounded-3xl overflow-hidden shadow-sm
              transition-all duration-300 group
              ${agent.available
                ? 'border-slate-200 dark:border-slate-800 hover:border-violet-300 dark:hover:border-violet-700 cursor-pointer hover:shadow-lg hover:-translate-y-1'
                : 'border-dashed border-slate-200 dark:border-slate-800 opacity-70 cursor-default'
              }
            `}
          >
            {/* Faixa de gradiente no topo */}
            <div className={`h-2 bg-gradient-to-r ${agent.gradient}`} />

            <div className="p-6">
              {/* Ícone e Badge */}
              <div className="flex items-start justify-between mb-4">
                <div className={`
                  h-16 w-16 rounded-2xl flex items-center justify-center text-3xl
                  bg-gradient-to-br ${agent.gradient} shadow-lg
                  ${agent.available ? 'group-hover:scale-110 transition-transform duration-300' : ''}
                `}>
                  {agent.emoji}
                </div>
                {agent.available ? (
                  <span className="px-3 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 rounded-full border border-emerald-200 dark:border-emerald-800/30">
                    Ativo
                  </span>
                ) : (
                  <span className="px-3 py-1 text-xs font-bold text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 rounded-full border border-amber-200 dark:border-amber-800/30">
                    Em breve
                  </span>
                )}
              </div>

              {/* Info */}
              <h3 className="text-xl font-black text-slate-800 dark:text-slate-200 mb-0.5">{agent.name}</h3>
              <p className="text-sm font-semibold text-slate-400 mb-3">{agent.subtitle}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-5">{agent.description}</p>

              {/* Botão */}
              {agent.available ? (
                <button className={`
                  w-full py-3 px-4 rounded-xl text-sm font-bold text-white
                  bg-gradient-to-r ${agent.gradient}
                  hover:opacity-90 transition-opacity shadow-md
                  flex items-center justify-center gap-2
                `}>
                  <TrendingUp className="w-4 h-4" />
                  Acessar
                </button>
              ) : (
                <div className="w-full py-3 px-4 rounded-xl text-sm font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 text-center">
                  🚧 Em desenvolvimento
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Rodapé informativo */}
      <div className="text-center text-xs text-slate-400 pt-4">
        <p>Todas as IAs utilizam o modelo <strong>Gemini Flash</strong> e funcionam de forma automática e integrada ao sistema.</p>
      </div>
    </div>
  );
}
