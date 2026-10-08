import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  X,
  ShoppingBag,
  Sparkles,
  ArrowRight,
  PartyPopper,
  RotateCcw,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Phone,
  MapPin,
  Clock,
  ShieldCheck,
  AlertCircle,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { VitrineProduto, VitrineCartItem, VitrineApiResponse } from './vitrineTypes';
import { VitrineSplash } from './VitrineSplash';
import { VitrineProductCard, formatBRL } from './VitrineProductCard';
import { VitrineCartDrawer } from './VitrineCartDrawer';
import { VitrineCartRecoveryBanner } from './VitrineCartRecoveryBanner';
import { BelaFarmaLogo } from '../BelaFarmaLogo';
import { vitrineAnalytics } from './vitrineAnalytics';

export interface VitrineAniversarioProps {
  onExit?: () => void;
  initialShowSplash?: boolean;
}

const STORAGE_KEY = 'belafarma_vitrine_cart';
const WHATSAPP_NUMBER = '5532998228189';

export const VitrineAniversario: React.FC<VitrineAniversarioProps> = ({
  onExit,
  initialShowSplash = true,
}) => {
  // Estado da Splash Screen
  const [showSplash, setShowSplash] = useState<boolean>(initialShowSplash);

  // Estados de dados da API
  const [produtos, setProdutos] = useState<VitrineProduto[]>([]);
  const [categorias, setCategorias] = useState<string[]>(['Todas']);
  const [campanhaInfo, setCampanhaInfo] = useState<{ id: string; titulo: string } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estados de Filtro e Busca
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategoria, setSelectedCategoria] = useState<string>('Todas');

  // Estado do Carrinho de Compras
  const [cartItems, setCartItems] = useState<VitrineCartItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch (e) {
        console.error('Erro ao recuperar carrinho da vitrine:', e);
      }
    }
    return [];
  });
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [showCartRecoveryBanner, setShowCartRecoveryBanner] = useState<boolean>(false);

  // Sincronização do Carrinho com o LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cartItems));
    } catch (e) {
      console.error('Erro ao salvar carrinho no localStorage:', e);
    }
  }, [cartItems]);

  // Notificação Suave de Retorno com Carrinho Salvo & Escassez
  useEffect(() => {
    if (!showSplash && cartItems.length > 0) {
      const dismissed = sessionStorage.getItem('belafarma_cart_recovery_dismissed');
      if (!dismissed) {
        const timer = setTimeout(() => {
          setShowCartRecoveryBanner(true);
        }, 1200);
        return () => clearTimeout(timer);
      }
    }
  }, [showSplash, cartItems.length]);

  const handleDismissCartRecovery = () => {
    setShowCartRecoveryBanner(false);
    try {
      sessionStorage.setItem('belafarma_cart_recovery_dismissed', 'true');
    } catch (e) {}
  };

  // Telemetria da Vitrine: Pageview, Duração e Profundidade de Scroll
  useEffect(() => {
    vitrineAnalytics.trackPageView();
    const startTime = Date.now();
    let maxScroll = 0;

    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollHeight > 0) {
        const percent = Math.min(100, Math.round((scrollTop / scrollHeight) * 100));
        if (percent > maxScroll) maxScroll = percent;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    const interval = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      vitrineAnalytics.trackHeartbeat(elapsed, maxScroll);
    }, 25000);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearInterval(interval);
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      vitrineAnalytics.trackHeartbeat(elapsed, maxScroll);
    };
  }, []);

  // Busca de Dados da API Pública
  const fetchOfertas = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/liquidacao/public/ofertas');
      if (!res.ok) {
        throw new Error(`Servidor retornou status ${res.status}`);
      }
      const data: VitrineApiResponse = await res.json();
      if (data.sucesso && Array.isArray(data.produtos)) {
        setProdutos(data.produtos);
        if (Array.isArray(data.categorias) && data.categorias.length > 0) {
          setCategorias(data.categorias);
        } else {
          // Extrai categorias únicas dinamicamente
          const cats = Array.from(new Set(data.produtos.map((p) => p.categoria).filter(Boolean))) as string[];
          setCategorias(['Todas', ...cats]);
        }
        if (data.campanha) {
          setCampanhaInfo({
            id: data.campanha.id,
            titulo: data.campanha.titulo,
          });
        }
      } else {
        throw new Error(data.erro || 'Falha ao processar produtos em liquidação.');
      }
    } catch (err: any) {
      console.error('Erro ao buscar ofertas públicas:', err);
      setErrorMsg(err.message || 'Não foi possível carregar as ofertas. Verifique sua conexão.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOfertas();
  }, []);

  // Adição de Produto ao Carrinho
  const handleAddToCart = (produto: VitrineProduto) => {
    setCartItems((prevItems) => {
      const pId = String(produto.id || produto.produto_id);
      const existingIndex = prevItems.findIndex(
        (it) => String(it.produto.id || it.produto.produto_id) === pId
      );
      const maxEstoque = Number(produto.estoque) || 999;

      if (existingIndex !== -1) {
        const currentQty = prevItems[existingIndex].quantidade;
        if (currentQty >= maxEstoque) {
          return prevItems; // Limite de estoque atingido
        }
        const updated = [...prevItems];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantidade: Math.min(maxEstoque, currentQty + 1),
        };
        return updated;
      } else {
        return [...prevItems, { produto, quantidade: 1 }];
      }
    });
    setIsCartOpen(true);
  };

  // Ajuste de Quantidade (+ / -)
  const handleUpdateQuantity = (produtoId: string | number, delta: number) => {
    setCartItems((prevItems) => {
      const pId = String(produtoId);
      const existingIndex = prevItems.findIndex(
        (it) => String(it.produto.id || it.produto.produto_id) === pId
      );
      if (existingIndex === -1) return prevItems;

      const currentItem = prevItems[existingIndex];
      const maxEstoque = Number(currentItem.produto.estoque) || 999;
      const newQty = currentItem.quantidade + delta;

      if (newQty <= 0) {
        return prevItems.filter((_, idx) => idx !== existingIndex);
      }

      const updated = [...prevItems];
      updated[existingIndex] = {
        ...currentItem,
        quantidade: Math.min(maxEstoque, newQty),
      };
      return updated;
    });
  };

  // Remoção de Item
  const handleRemoveItem = (produtoId: string | number) => {
    const pId = String(produtoId);
    setCartItems((prevItems) =>
      prevItems.filter((it) => String(it.produto.id || it.produto.produto_id) !== pId)
    );
  };

  // Limpeza de Carrinho
  const handleClearCart = () => {
    setCartItems([]);
  };

  // Contagem Total e Subtotal do Carrinho
  const totalCartItems = useMemo(() => {
    return cartItems.reduce((sum, it) => sum + it.quantidade, 0);
  }, [cartItems]);

  const cartSubtotal = useMemo(() => {
    const sum = cartItems.reduce(
      (acc, it) => acc + (Number(it.produto.preco_por) || 0) * it.quantidade,
      0
    );
    return Math.round(sum * 100) / 100;
  }, [cartItems]);

  const cartTotalSavings = useMemo(() => {
    const sum = cartItems.reduce((acc, it) => {
      const de = Number(it.produto.preco_de) || 0;
      const por = Number(it.produto.preco_por) || 0;
      return acc + (de > por ? (de - por) * it.quantidade : 0);
    }, 0);
    return Math.round(sum * 100) / 100;
  }, [cartItems]);

  // Filtragem Instantânea de Produtos com Ordenação por Maior Desconto (Compra por Impulso)
  const filteredProdutos = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    const matches = produtos.filter((prod) => {
      // Filtro de Categoria
      if (selectedCategoria !== 'Todas' && prod.categoria !== selectedCategoria) {
        return false;
      }

      // Filtro de Busca Instantânea
      if (!term) return true;

      const nomeMatch = prod.nome?.toLowerCase().includes(term);
      const descMatch = prod.descricao?.toLowerCase().includes(term);
      const apresMatch = prod.apresentacao?.toLowerCase().includes(term);
      const catMatch = prod.categoria?.toLowerCase().includes(term);
      const eanMatch = prod.ean?.includes(term);
      const labMatch = prod.laboratorio?.toLowerCase().includes(term);

      return nomeMatch || descMatch || apresMatch || catMatch || eanMatch || labMatch;
    });

    // Ordenação priorizando o maior desconto percentual (Gatilho psicológico de urgência e impulso)
    return matches.sort((a, b) => {
      const descA = a.desconto_percentual || (a.preco_de > a.preco_por ? ((a.preco_de - a.preco_por) / a.preco_de) * 100 : 0);
      const descB = b.desconto_percentual || (b.preco_de > b.preco_por ? ((b.preco_de - b.preco_por) / b.preco_de) * 100 : 0);
      return descB - descA;
    });
  }, [produtos, searchTerm, selectedCategoria]);

  // Telemetria de Buscas de Clientes na Vitrine (identifica interesse e demandas)
  useEffect(() => {
    const trimmed = searchTerm.trim();
    if (trimmed.length >= 3) {
      const timer = setTimeout(() => {
        vitrineAnalytics.trackSearch(trimmed, filteredProdutos.length);
      }, 750);
      return () => clearTimeout(timer);
    }
  }, [searchTerm, filteredProdutos.length]);

  // Contagem por Categoria para as Abas/Pills
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { Todas: produtos.length };
    produtos.forEach((p) => {
      if (p.categoria) {
        map[p.categoria] = (map[p.categoria] || 0) + 1;
      }
    });
    return map;
  }, [produtos]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-red-500 selection:text-white">
      {/* 1. Integração da Splash Screen Comemorativa de 4 Segundos com Fogos e Contagem Regressiva */}
      {showSplash && (
        <VitrineSplash
          durationMs={4000}
          onComplete={() => setShowSplash(false)}
        />
      )}

      {/* Estilos Globais do Letreiro Marquee Neon */}
      <style>{`
        @keyframes bfMarqueeMove {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
        .animate-bf-marquee {
          display: inline-flex;
          animation: bfMarqueeMove 18s linear infinite !important;
        }
      `}</style>

      {/* 2. Barra Superior Fixa (Sticky Top Bar) */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-red-100 dark:border-slate-800 shadow-sm transition-all">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3">
          {/* Branding da BelaFarma com Logo Oficial e Selo Comemorativo */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <BelaFarmaLogo size="md" showSubtext={true} />
            <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-black px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shrink-0">
              <PartyPopper className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>1º Ano</span>
            </span>
          </div>

          {/* Ações da Direita: Rever Splash, Acesso Admin, e Botão do Carrinho */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSplash(true)}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Rever abertura de boas-vindas"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Rever Abertura</span>
            </button>

            {onExit && (
              <button
                type="button"
                onClick={onExit}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors border border-slate-200 dark:border-slate-700"
              >
                <span>Acesso Administrativo</span>
              </button>
            )}

            {/* Gatilho do Carrinho com Badge Dinâmico */}
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="relative inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-xs sm:text-sm shadow-md transition-all hover:scale-102 active:scale-98 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-400"
              aria-label={`Abrir carrinho com ${totalCartItems} itens`}
            >
              <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Carrinho</span>
              {totalCartItems > 0 && (
                <span className="bg-amber-300 text-red-950 font-black text-xs px-2 py-0.5 rounded-full shadow-inner animate-pulse">
                  {totalCartItems}
                </span>
              )}
              {totalCartItems > 0 && (
                <span className="hidden lg:inline text-xs font-semibold text-red-100 border-l border-red-500 pl-2">
                  {formatBRL(cartSubtotal)}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* 3. Hero Banner Festivo de Aniversário */}
      <section className="relative overflow-hidden bg-gradient-to-br from-red-700 via-red-600 to-rose-700 text-white py-6 sm:py-10 px-4 sm:px-6 shadow-md">
        <div className="max-w-7xl mx-auto relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="max-w-2xl text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/25 backdrop-blur-sm border border-white/20 text-xs font-bold text-amber-300 uppercase tracking-wider mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Grande Festival Comemorativo</span>
            </div>

            {/* Mensagem de Impacto Obrigatória em Destaque */}
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight mb-3 drop-shadow">
              Mais de 100 itens com preços incríveis e descontos imperdíveis!
            </h1>

            <p className="text-xs sm:text-sm md:text-base text-red-100/90 leading-relaxed max-w-xl mb-4">
              Celebre o 1º ano da BelaFarma Sul! Estoque limitado de medicamentos, perfumaria e suplementos com preços de liquidação de verdade. Peça direto e retire na loja ou receba em casa!
            </p>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5">
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-500/30 backdrop-blur border border-emerald-400/50 text-xs font-black text-emerald-200 shadow-md">
                <span>⚡🚀</span>
                <span>Entrega Super Rápida e GRÁTIS para Bairros Próximos</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur border border-white/20 text-xs font-semibold text-amber-200">
                <ShieldCheck className="w-4 h-4 text-emerald-300" />
                <span>Estoque 100% Genuíno</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur border border-white/20 text-xs font-semibold text-amber-200">
                <Clock className="w-4 h-4 text-amber-300" />
                <span>Atendimento Ágil WhatsApp</span>
              </div>
            </div>
          </div>

          {/* Card Resumo Lateral de Compras */}
          <div className="w-full md:w-auto bg-black/20 backdrop-blur-md rounded-2xl p-4 sm:p-5 border border-white/15 text-center flex flex-col items-center gap-2 min-w-[240px]">
            <span className="text-xs font-bold text-amber-300 uppercase tracking-wide">
              Atendimento Oficial
            </span>
            <div className="text-lg sm:text-xl font-black text-white">
              (32) 99822-8189
            </div>
            <p className="text-[11px] text-red-100/90 font-bold">
              📍 Ipiranga • Juiz de Fora - MG
            </p>
            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}?text=Ol%C3%A1%2C%20gostaria%20de%20consultar%20as%20ofertas%20do%20Anivers%C3%A1rio%20BelaFarma!`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 w-full py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow transition-transform hover:scale-102"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Chamar no WhatsApp</span>
            </a>
          </div>
        </div>

        {/* Efeitos Visuais Festivos de Fundo */}
        <div className="absolute -bottom-10 -right-10 w-72 h-72 bg-amber-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 right-10 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
      </section>

      {/* 💥 LETREIRO MARQUEE NEON EM MOVIMENTO (ANIVERSÁRIO BELAFARMA) */}
      <div className="bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider py-2 overflow-hidden shadow-md border-y border-amber-300 relative z-20 select-none">
        <div className="animate-bf-marquee whitespace-nowrap flex items-center gap-8">
          <span className="flex items-center gap-2">💥 MEGA QUEIMA DE ESTOQUE - ATÉ 70% OFF</span>
          <span className="flex items-center gap-2">🎁 1º ANIVERSÁRIO BELAFARMA</span>
          <span className="flex items-center gap-2">⚡ MAIS DE 100 OFERTAS ESPECIAIS</span>
          <span className="flex items-center gap-2">📍 PEÇA DIRETO PELO WHATSAPP</span>
          <span className="flex items-center gap-2">🔥 PREÇOS DE FÁBRICA ENQUANTO DURAR O ESTOQUE</span>
          <span className="flex items-center gap-2">💥 MEGA QUEIMA DE ESTOQUE - ATÉ 70% OFF</span>
          <span className="flex items-center gap-2">🎁 1º ANIVERSÁRIO BELAFARMA</span>
          <span className="flex items-center gap-2">⚡ MAIS DE 100 OFERTAS ESPECIAIS</span>
          <span className="flex items-center gap-2">📍 PEÇA DIRETO PELO WHATSAPP</span>
        </div>
      </div>

      {/* 4. Barra de Busca Instantânea e Filtro por Categorias */}
      <section className="sticky top-[57px] sm:top-[65px] z-30 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 py-3 px-3 sm:px-6 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col gap-2.5">
          {/* Campo de Busca Instantânea */}
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, marca, categoria ou código EAN..."
              className="w-full pl-10 sm:pl-11 pr-10 py-2.5 sm:py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 shadow-sm transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                aria-label="Limpar termo de busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Abas / Pills de Filtro por Categoria com rolagem horizontal touch-friendly */}
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-0.5">
            {categorias.map((cat) => {
              const count = categoryCounts[cat] ?? 0;
              const isSelected = selectedCategoria === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategoria(cat)}
                  className={`px-3 sm:px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0 flex items-center gap-1.5 cursor-pointer shadow-sm ${
                    isSelected
                      ? 'bg-red-600 text-white shadow-red-500/20 scale-102'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <span>{cat}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                      isSelected
                        ? 'bg-red-800 text-amber-200'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5. Catálogo Principal de Produtos */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 lg:p-8 flex flex-col gap-6">
        {/* Indicador de Quantidade e Status de Filtros */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800 dark:text-slate-200">
              {filteredProdutos.length} {filteredProdutos.length === 1 ? 'oferta disponível' : 'ofertas disponíveis'}
            </span>
            {(searchTerm || selectedCategoria !== 'Todas') && (
              <span className="text-[11px] bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-900">
                Filtro ativo
              </span>
            )}
          </div>

          {(searchTerm || selectedCategoria !== 'Todas') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedCategoria('Todas');
              }}
              className="text-red-600 dark:text-red-400 font-bold hover:underline cursor-pointer"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {/* Estado de Carregamento */}
        {isLoading && (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="w-10 h-10 text-red-600 animate-spin" />
            <p className="text-sm font-semibold">Carregando catálogo de liquidação...</p>
          </div>
        )}

        {/* Estado de Erro com Opção de Repetir */}
        {!isLoading && errorMsg && (
          <div className="p-6 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-center flex flex-col items-center gap-3 my-8">
            <AlertCircle className="w-8 h-8 text-red-600" />
            <p className="text-sm font-bold text-red-800 dark:text-red-300">{errorMsg}</p>
            <button
              type="button"
              onClick={fetchOfertas}
              className="px-4 py-2 rounded-xl bg-red-600 text-white font-bold text-xs hover:bg-red-700 transition-colors cursor-pointer"
            >
              Tentar Novamente
            </button>
          </div>
        )}

        {/* Grade Responsiva Mobile-First de Cards de Produtos */}
        {!isLoading && !errorMsg && filteredProdutos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4 lg:gap-6">
            {filteredProdutos.map((produto) => (
              <VitrineProductCard
                key={produto.id || produto.produto_id}
                produto={produto}
                onAddToCart={handleAddToCart}
              />
            ))}
          </div>
        )}

        {/* Estado Vazio (Nenhum produto correspondente) */}
        {!isLoading && !errorMsg && filteredProdutos.length === 0 && (
          <div className="py-16 text-center flex flex-col items-center justify-center gap-3 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
            <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-950/50 flex items-center justify-center text-red-500 mb-1">
              <Search className="w-7 h-7" />
            </div>
            <h3 className="font-extrabold text-base sm:text-lg text-slate-800 dark:text-slate-100">
              Nenhuma oferta encontrada
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-sm">
              Não encontramos nenhum item correspondente ao termo "{searchTerm}". Tente uma nova busca ou navegue pelas outras categorias.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedCategoria('Todas');
              }}
              className="mt-2 px-4 py-2 rounded-xl bg-red-600 text-white font-bold text-xs hover:bg-red-700 transition-colors cursor-pointer"
            >
              Ver todas as ofertas
            </button>
          </div>
        )}
      </main>

      {/* 6. Barra Flutuante Mobile do Carrinho (Rodapé Fixo se houver itens) */}
      {totalCartItems > 0 && !isCartOpen && (
        <div className="fixed bottom-3 inset-x-3 z-30 sm:hidden">
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 text-white font-black text-sm shadow-2xl flex items-center justify-between border border-red-400/50 active:scale-98 transition-transform cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-amber-300 text-red-950 text-xs flex items-center justify-center font-black">
                {totalCartItems}
              </span>
              <span>Ver Carrinho</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>{formatBRL(cartSubtotal)}</span>
              <ChevronRight className="w-4 h-4 text-amber-200" />
            </div>
          </button>
        </div>
      )}

      {/* 7. Gaveta Lateral / Bottom Sheet do Carrinho & Checkout Minimalista (M4) */}
      <VitrineCartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
      />

      {/* 7.1 Notificação Suave de Retorno com Carrinho Salvo & Escassez */}
      {showCartRecoveryBanner && !isCartOpen && cartItems.length > 0 && (
        <VitrineCartRecoveryBanner
          items={cartItems}
          subtotal={cartSubtotal}
          onOpenCart={() => {
            setIsCartOpen(true);
            setShowCartRecoveryBanner(false);
          }}
          onDismiss={handleDismissCartRecovery}
        />
      )}

      {/* 8. Rodapé Institucional com Identidade Visual Oficial */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 mt-auto py-8">
        <div className="max-w-7xl mx-auto px-4 flex flex-col items-center gap-6 text-center">
          <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
            <BelaFarmaLogo size="md" showSubtext={true} />
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-1.5 rounded-full border border-emerald-300 dark:border-emerald-800">
              <span>🚀⚡</span>
              <span>Entrega Super Rápida e Grátis para Bairros Próximos</span>
            </div>
          </div>

          {/* Pilares da Marca da Identidade Visual */}
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-12 text-xs font-black text-slate-700 dark:text-slate-300">
            <div className="flex items-center gap-2">
              <span className="text-red-500 text-sm">❤️</span>
              <span>CUIDAR DE VOCÊ</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-500 text-sm">🛡️</span>
              <span>SAÚDE COM CONFIANÇA</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-500 text-sm">😊</span>
              <span>BEM-ESTAR TODO DIA</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-3 text-xs text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-100 dark:border-slate-800/80">
            <p>Bela Farma Sul • Bairro Ipiranga, Juiz de Fora - MG • WhatsApp Loja: (32) 99822-8189</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {onExit && (
                <>
                  <button
                    type="button"
                    onClick={onExit}
                    className="hover:text-red-600 dark:hover:text-red-400 underline underline-offset-2 cursor-pointer font-bold"
                  >
                    Acesso Administrativo
                  </button>
                  <span>•</span>
                </>
              )}
              <div className="flex items-center gap-2">
                <span>Desenvolvido por <strong className="text-slate-700 dark:text-slate-200 font-bold">Edevaldo Cruz</strong></span>
                <a
                  href="https://wa.me/5532988634755?text=Ol%C3%A1%20Edevaldo%2C%20vi%20seu%20contato%20no%20site%20da%20BelaFarma!"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold transition-all border border-emerald-500/30 hover:scale-105 active:scale-95"
                  title="Conversar com o desenvolvedor no WhatsApp"
                >
                  <span>💬 (32) 98863-4755</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
