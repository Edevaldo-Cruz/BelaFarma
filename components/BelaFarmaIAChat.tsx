import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, Send, Sparkles, TrendingUp, DollarSign, ShoppingCart, 
  RefreshCw, Lightbulb, ShieldCheck, ArrowRight, Package,
  FileText, Activity, AlertTriangle, Layers, Award
} from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export const BelaFarmaIAChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('belafarma_ia_chat_history');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      {
        role: 'assistant',
        content: 'Olá! Sou o seu **Consultor Estratégico IA** da Bela Farma Sul. 🚀\n\nEstou conectado aos dados reais da farmácia (vendas diárias, curva ABC de produtos, cotações do BelaPed e faturamento). Em que posso ajudar você a aumentar os lucros e melhorar a saúde financeira hoje?',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      }
    ];
  });

  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [contextData, setContextData] = useState<any>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem('belafarma_ia_chat_history', JSON.stringify(messages));
    } catch (e) {}
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchContext = async () => {
    setLoadingContext(true);
    try {
      const res = await fetch('/api/ia/contexto');
      if (res.ok) {
        const data = await res.json();
        setContextData(data.contexto);
      }
    } catch (e) {
      console.warn('Erro ao obter contexto da IA:', e);
    } finally {
      setLoadingContext(false);
    }
  };

  useEffect(() => {
    fetchContext();
  }, []);

  const handleSend = async (customPrompt?: string) => {
    const textToSend = (customPrompt || inputMessage).trim();
    if (!textToSend || isLoading) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          history: newHistory.slice(-8)
        })
      });

      if (response.ok) {
        const data = await response.json();
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: data.reply || 'Desculpe, não consegui formular uma resposta no momento.',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, assistantMsg]);
      } else {
        const errData = await response.json().catch(() => ({}));
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `⚠️ Erro ao obter resposta da IA: ${errData.error || 'Verifique o status do servidor.'}`,
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ Falha de comunicação com o assistente local: ${err.message}`,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    const initial: ChatMessage[] = [
      {
        role: 'assistant',
        content: 'Chat reiniciado. Em que posso te orientar hoje sobre o financeiro ou vendas?',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      }
    ];
    setMessages(initial);
    localStorage.removeItem('belafarma_ia_chat_history');
  };

  const quickPrompts = [
    { title: '💡 Ideias para faturar mais hoje', prompt: 'Com base no faturamento e histórico recente da nossa drogaria, que estratégias e ações rápidas no balcão e no WhatsApp posso aplicar hoje para aumentar as vendas?' },
    { title: '📈 Análise da Curva ABC e Margem', prompt: 'Analise os produtos mais vendidos da nossa drogaria e sugira como podemos elevar a margem de lucro com vendas complementares.' },
    { title: '🏷️ Oportunidades no BelaPed', prompt: 'Como posso aproveitar as melhores cotações e prazos dos distribuidores no BelaPed para economizar nas compras deste mês?' },
    { title: '⚠️ Alerta de Estoque e Validades', prompt: 'Que estratégias de queima de estoque ou campanha promocional você sugere para produtos que estão parados ou perto do vencimento?' }
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] max-w-5xl mx-auto p-2 sm:p-4 gap-4">
      
      {/* Header do Consultor IA */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 rounded-2xl p-4 sm:p-6 text-white shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border border-indigo-700/50">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner">
            <Bot className="w-7 h-7 text-indigo-300 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight">BelaFarma IA Consultor</h1>
              <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2.5 py-0.5 rounded-full font-bold border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Raspberry Pi 5 Local
              </span>
            </div>
            <p className="text-xs sm:text-sm text-indigo-200 font-medium">
              Inteligência Financeira e Estratégica conectada ao seu Digifarma e BelaPed
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={fetchContext}
            disabled={loadingContext}
            title="Atualizar dados da farmácia"
            className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-white/10"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingContext ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar Dados</span>
          </button>
          <button
            onClick={handleClearChat}
            className="p-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-xl text-xs font-bold transition-all border border-rose-500/30"
          >
            Limpar Chat
          </button>
        </div>
      </div>

      {/* Panorama dos Dados Reais Conectados */}
      {contextData?.faturamento && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Vendido 30 Dias</span>
            <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
              R$ {Number(contextData.faturamento.totalVendido30d).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Média Diária</span>
            <span className="text-base sm:text-lg font-black text-indigo-600 dark:text-indigo-400">
              R$ {Number(contextData.faturamento.mediaDiaria).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">% Recebido no Pix</span>
            <span className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400">
              {contextData.faturamento.percentualPix}
            </span>
          </div>
          <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Boletos Pendentes</span>
            <span className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400">
              R$ {Number(contextData.contas?.totalBoletosPendentes || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

      {/* Caixa de Mensagens */}
      <div className="flex-1 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-3 sm:p-5 overflow-y-auto space-y-4">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in-50 duration-200`}
          >
            <div
              className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white font-medium rounded-tr-sm'
                  : 'bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-tl-sm'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5 pb-1 border-b border-black/5 dark:border-white/10 text-[11px] opacity-75">
                {msg.role === 'user' ? (
                  <span className="font-bold">Você (Gestor)</span>
                ) : (
                  <span className="font-bold flex items-center gap-1 text-indigo-400">
                    <Sparkles className="w-3.5 h-3.5" /> BelaFarma IA
                  </span>
                )}
                <span className="ml-auto text-[10px]">{msg.timestamp}</span>
              </div>
              <div className="whitespace-pre-wrap font-sans text-xs sm:text-sm">
                {msg.content}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-500 flex items-center gap-2">
              <Bot className="w-4 h-4 text-indigo-500 animate-spin" />
              <span className="text-xs font-semibold">Consultando bases da farmácia e gerando sugestões...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Prompts Rápidos de Apoio */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {quickPrompts.map((qp, idx) => (
          <button
            key={idx}
            disabled={isLoading}
            onClick={() => handleSend(qp.prompt)}
            className="p-2.5 bg-slate-100 dark:bg-slate-800/60 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 rounded-xl text-left transition-all text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between group"
          >
            <span>{qp.title}</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>

      {/* Input de Envio */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-md"
      >
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Pergunte sobre lucros, produtos para queimar, estratégias de balcão..."
          disabled={isLoading}
          className="flex-1 bg-transparent px-4 py-3 text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!inputMessage.trim() || isLoading}
          className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl shadow-md transition-all flex items-center justify-center"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>

    </div>
  );
};
