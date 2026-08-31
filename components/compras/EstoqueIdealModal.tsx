import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  TrendingDown, 
  TrendingUp, 
  Package, 
  ArrowRight, 
  X, 
  CheckCircle2, 
  DollarSign, 
  ShoppingBag,
  Sparkles,
  Loader2,
  Bell
} from 'lucide-react';
import { EstoqueMinimoProduto, User } from '../../types';

interface EstoqueIdealModalProps {
  isOpen: boolean;
  user: User;
  onClose: () => void;
  onNavigateToCompras: () => void;
}

export const EstoqueIdealModal: React.FC<EstoqueIdealModalProps> = ({
  isOpen,
  user,
  onClose,
  onNavigateToCompras
}) => {
  const [loading, setLoading] = useState(true);
  const [abaixoMinimoList, setAbaixoMinimoList] = useState<EstoqueMinimoProduto[]>([]);
  const [excessoList, setExcessoList] = useState<EstoqueMinimoProduto[]>([]);
  const [resumo, setResumo] = useState<{
    totalRuptura: number;
    totalAbaixoMinimo: number;
    totalExcesso: number;
    valorTotalReposicao: number;
  }>({
    totalRuptura: 0,
    totalAbaixoMinimo: 0,
    totalExcesso: 0,
    valorTotalReposicao: 0
  });

  const [activeListTab, setActiveListTab] = useState<'repor' | 'excesso'>('repor');

  useEffect(() => {
    if (!isOpen) return;

    const carregarResumoEstoque = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/central-compras/estoque/minimo?limite=100');
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.produtos)) {
            const produtos: EstoqueMinimoProduto[] = data.produtos;
            
            const repor = produtos.filter(
              p => p.statusRuptura === 'RUPTURA' || p.statusRuptura === 'ABAIXO_MINIMO' || (p.estMinimoCalculado > 0 && p.saldo < p.estMinimoCalculado)
            );
            const excesso = produtos.filter(
              p => p.statusRuptura === 'EXCESSO' || (p.estMaximoCalculado && p.saldo > p.estMaximoCalculado)
            );

            setAbaixoMinimoList(repor.slice(0, 10));
            setExcessoList(excesso.slice(0, 10));

            setResumo({
              totalRuptura: data.totalRuptura || 0,
              totalAbaixoMinimo: data.totalAbaixoMinimo || 0,
              totalExcesso: data.totalExcesso || 0,
              valorTotalReposicao: data.valorTotalReposicao || 0
            });
          }
        }
      } catch (e) {
        console.error('Erro ao carregar resumo de estoque ideal:', e);
      } finally {
        setLoading(false);
      }
    };

    carregarResumoEstoque();
  }, [isOpen]);

  if (!isOpen) return null;

  const totalParaRepor = resumo.totalRuptura + resumo.totalAbaixoMinimo;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
        
        {/* Cabeçalho */}
        <div className="px-6 py-5 bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-md">
              <ShoppingBag className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-white/20 rounded-full">
                  Central de Compras
                </span>
                <span className="text-[10px] font-bold text-white/80">
                  {new Date().toLocaleDateString('pt-BR')}
                </span>
              </div>
              <h2 className="text-xl font-black tracking-tight mt-0.5">
                Olá, {user.name}! Painel de Estoque Ideal
              </h2>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-red-600" />
              <p className="text-xs font-bold">Verificando status de estoque e pedidos mínimos...</p>
            </div>
          ) : (
            <>
              {/* Cards de Métricas Principais */}
              <div className="grid grid-cols-2 gap-4">
                {/* Card 1: Abaixo do Mínimo / Ruptura (Azul Claro) */}
                <div 
                  onClick={() => setActiveListTab('repor')}
                  className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    activeListTab === 'repor' 
                      ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-950/30 shadow-md ring-2 ring-sky-400/20' 
                      : 'border-slate-200 dark:border-slate-800 hover:border-sky-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-sky-700 dark:text-sky-300 flex items-center gap-1.5">
                      <TrendingDown className="w-4 h-4 text-sky-600" />
                      Abaixo do Mínimo
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200">
                      🟦 Repor
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-black text-sky-700 dark:text-sky-300">
                      {totalParaRepor}
                    </span>
                    <span className="text-xs font-bold text-slate-500">itens</span>
                  </div>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1">
                    Reposição est.: <strong>R$ {resumo.valorTotalReposicao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                  </p>
                </div>

                {/* Card 2: Acima do Máximo (Vermelho) */}
                <div 
                  onClick={() => setActiveListTab('excesso')}
                  className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    activeListTab === 'excesso' 
                      ? 'border-red-500 bg-red-50/50 dark:bg-red-950/30 shadow-md ring-2 ring-red-400/20' 
                      : 'border-slate-200 dark:border-slate-800 hover:border-red-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-red-700 dark:text-red-300 flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-red-600" />
                      Acima do Máximo (+20%)
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200">
                      🟥 Excesso
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-black text-red-700 dark:text-red-300">
                      {resumo.totalExcesso}
                    </span>
                    <span className="text-xs font-bold text-slate-500">itens</span>
                  </div>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1">
                    Saldo superior à margem de segurança de 30 dias.
                  </p>
                </div>
              </div>

              {/* Lista dos Principais Itens */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    {activeListTab === 'repor' ? 'Prioridades para Reposição (Top Itens)' : 'Produtos em Excesso de Estoque'}
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400">
                    {activeListTab === 'repor' ? `${abaixoMinimoList.length} exibidos` : `${excessoList.length} exibidos`}
                  </span>
                </div>

                <div className="space-y-2 border border-slate-100 dark:border-slate-800 rounded-2xl p-2 bg-slate-50/50 dark:bg-slate-800/30">
                  {activeListTab === 'repor' ? (
                    abaixoMinimoList.length === 0 ? (
                      <p className="py-6 text-center text-xs font-bold text-slate-400">
                        Nenhum produto em ruptura ou abaixo do mínimo no momento!
                      </p>
                    ) : (
                      abaixoMinimoList.map(item => (
                        <div 
                          key={item.produtoId}
                          className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm text-xs"
                        >
                          <div className="min-w-0 flex-1 pr-3">
                            <span className="font-bold text-slate-800 dark:text-slate-100 block truncate">
                              {item.descricao}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              Curva {item.curvaAbc || 'C'} • Saldo: <strong className="text-sky-600">{item.saldo}</strong> • Mínimo: {item.estMinimoCalculado}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200">
                              Pedir +{item.pedidoMinimo || Math.max(0, item.estMinimoCalculado - item.saldo)} un
                            </span>
                          </div>
                        </div>
                      ))
                    )
                  ) : (
                    excessoList.length === 0 ? (
                      <p className="py-6 text-center text-xs font-bold text-slate-400">
                        Nenhum produto em excesso detectado!
                      </p>
                    ) : (
                      excessoList.map(item => (
                        <div 
                          key={item.produtoId}
                          className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm text-xs"
                        >
                          <div className="min-w-0 flex-1 pr-3">
                            <span className="font-bold text-slate-800 dark:text-slate-100 block truncate">
                              {item.descricao}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              Curva {item.curvaAbc || 'C'} • Saldo: <strong className="text-red-600">{item.saldo}</strong> • Máx (+20%): {item.estMaximoCalculado || Math.ceil(item.estMinimoCalculado * 1.2)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200">
                              Excesso: +{Math.max(0, item.saldo - (item.estMaximoCalculado || Math.ceil(item.estMinimoCalculado * 1.2)))} un
                            </span>
                          </div>
                        </div>
                      ))
                    )
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Rodapé com Ações */}
        <div className="p-6 bg-slate-50 dark:bg-slate-850 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-black uppercase tracking-wider hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Ciente / Fechar por Hoje
          </button>
          
          <button
            onClick={() => {
              onClose();
              onNavigateToCompras();
            }}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-red-200 dark:shadow-none transition-all active:scale-95"
          >
            Abrir Central de Compras / Cotação
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
