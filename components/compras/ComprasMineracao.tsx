import React, { useState, useEffect, useMemo } from 'react';
import { 
  Scan, 
  Sparkles, 
  TrendingDown, 
  TrendingUp, 
  DollarSign, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Search, 
  Filter, 
  ArrowRight, 
  MessageSquare, 
  RefreshCw, 
  Layers,
  FileText,
  BadgePercent,
  Check,
  Zap,
  ShoppingBag
} from 'lucide-react';
import { OportunidadeMinerada, User } from '../../types';
import { useToast } from '../ToastContext';

interface ComprasMineracaoProps {
  user: User;
  theme: 'light' | 'dark';
  onNavigateToTab?: (tab: string, preselectedItems?: any[]) => void;
}

export const ComprasMineracao: React.FC<ComprasMineracaoProps> = ({
  user,
  theme,
  onNavigateToTab
}) => {
  const { addToast } = useToast();
  const [oportunidades, setOportunidades] = useState<OportunidadeMinerada[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [diasVarredura, setDiasVarredura] = useState<number>(30);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS');

  // Modal de Detalhes da Oferta
  const [selectedOferta, setSelectedOferta] = useState<OportunidadeMinerada | null>(null);

  const carregarOportunidades = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/central-compras/oportunidades?limite=100');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setOportunidades(data.data);
        }
      }
    } catch (err: any) {
      addToast('Erro ao carregar radar de oportunidades: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarOportunidades();
  }, []);

  const dispararVarredura = async (diasParam?: number) => {
    const dias = diasParam !== undefined ? diasParam : diasVarredura;
    try {
      setScanning(true);
      const url = dias >= 90 ? '/api/central-compras/minerar-90-dias' : '/api/central-compras/whatsapp/minerar';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dias, forcarReleitura: true })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`✅ Varredura concluída! ${data.data?.fornecedoresCadastrados || data.data?.representantesCadastrados || 0} fornecedores e ${data.data?.ofertasIndexadas || 0} ofertas mapeadas.`, 'success');
        carregarOportunidades();
      } else {
        addToast('Erro na mineração: ' + (data.error || 'Falha ao processar conversas'), 'error');
      }
    } catch (err: any) {
      addToast('Falha na comunicação: ' + err.message, 'error');
    } finally {
      setScanning(false);
    }
  };

  const oportunidadesFiltradas = useMemo(() => {
    return oportunidades.filter(op => {
      const prodNome = (op as any).produto_nome || op.produtoNome || '';
      const distNome = (op as any).distribuidora || (op as any).fornecedorNome || '';
      const repNome = (op as any).representante || (op as any).representanteNome || '';
      const eanStr = (op as any).ean || '';

      const matchBusca = !busca || 
        prodNome.toLowerCase().includes(busca.toLowerCase()) ||
        distNome.toLowerCase().includes(busca.toLowerCase()) ||
        repNome.toLowerCase().includes(busca.toLowerCase()) ||
        eanStr.includes(busca);

      const statusOp = (op as any).status || '';
      const matchStatus = filtroStatus === 'TODOS' || 
        (filtroStatus === 'VANTAGOSAS' && (statusOp === 'Aprovado_Radar' || statusOp === 'Disponivel')) ||
        (filtroStatus === 'DESCARTADAS' && (statusOp === 'Descartado_Preco' || statusOp === 'Descartado_Preco_Maior')) ||
        (filtroStatus === 'SEM_HISTORICO' && statusOp === 'Oportunidade_Sem_Historico');

      return matchBusca && matchStatus;
    });
  }, [oportunidades, busca, filtroStatus]);

  const handleCriarCotacaoComOferta = (op: OportunidadeMinerada) => {
    if (onNavigateToTab) {
      onNavigateToTab('cotacoes', [{
        produtoId: 0,
        descricao: (op as any).produto_nome || op.produtoNome,
        ean: op.ean || '',
        quantidade: 10,
        precoUnitarioEstimado: (op as any).preco_ofertado || op.precoLiquidoEfetivo || op.precoOfertado
      }]);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header & Ações de Varredura */}
      <div className="p-6 rounded-[2rem] bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-red-600/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 text-red-300 text-xs font-black uppercase tracking-wider border border-red-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              Radar de Mineração IA
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">
              Mineração de Oportunidades & Histórico de Ofertas
            </h2>
            <p className="text-sm text-slate-300 max-w-2xl font-medium">
              Varredura contínua de conversas, encartes e mensagens do WhatsApp Comercial, cruzando os preços ofertados com o histórico de compras do Digifarma.
            </p>
          </div>

          {/* Painel de Disparo de Varredura */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-slate-800/80 p-3 rounded-2xl border border-slate-700">
            <div className="flex items-center gap-2 px-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <select
                value={diasVarredura}
                onChange={(e) => setDiasVarredura(parseInt(e.target.value, 10))}
                className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
              >
                <option value={7} className="bg-slate-800 text-white">Últimos 7 dias</option>
                <option value={15} className="bg-slate-800 text-white">Últimos 15 dias</option>
                <option value={30} className="bg-slate-800 text-white">Últimos 30 dias</option>
                <option value={60} className="bg-slate-800 text-white">Últimos 60 dias</option>
                <option value={90} className="bg-slate-800 text-white">Últimos 90 dias (Retroativo)</option>
              </select>
            </div>

            <button
              onClick={() => dispararVarredura()}
              disabled={scanning}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white text-xs font-black uppercase tracking-wider shadow-lg hover:shadow-red-500/25 transition-all disabled:opacity-50 cursor-pointer active:scale-95"
            >
              <Scan className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
              {scanning ? 'Minerando 90 Dias...' : 'Varrer WhatsApp Agora'}
            </button>
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por produto minerado, distribuidora ou representante..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-black uppercase text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filtro:
          </span>
          {[
            { id: 'TODOS', label: 'Todas Ofertas' },
            { id: 'VANTAGOSAS', label: 'Aprovadas no Radar (Mais Baratas)' },
            { id: 'DESCARTADAS', label: 'Descartadas (Preço Maior)' },
            { id: 'SEM_HISTORICO', label: 'Sem Histórico Digifarma' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFiltroStatus(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                filtroStatus === f.id
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de Cards de Oportunidades */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 font-bold bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-red-600" />
          Carregando oportunidades mineradas do WhatsApp...
        </div>
      ) : oportunidadesFiltradas.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <MessageSquare className="w-10 h-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
          <p className="font-bold text-slate-700 dark:text-slate-300">Nenhuma oportunidade minerada encontrada</p>
          <p className="text-xs text-slate-400 mt-1">Clique em "Varrer WhatsApp Agora" para extrair ofertas das conversas com os representantes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {oportunidadesFiltradas.map(op => {
            const ehVantajosa = op.status === 'Aprovado_Radar';
            const economizou = op.economiaPercentual && op.economiaPercentual > 0;

            return (
              <div 
                key={op.id}
                className={`p-5 rounded-2xl border bg-white dark:bg-slate-900 transition-all hover:shadow-md flex flex-col justify-between ${
                  ehVantajosa 
                    ? 'border-emerald-300 dark:border-emerald-800/80 bg-gradient-to-b from-emerald-50/20 to-transparent' 
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="space-y-3">
                  {/* Top: Distribuidora e Badge de Economia */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight block">
                        {op.fornecedorNome}
                      </span>
                      {op.representanteNome && (
                        <span className="text-[11px] font-bold text-slate-400">
                          Rep: {op.representanteNome}
                        </span>
                      )}
                    </div>

                    {ehVantajosa && (
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-[10px] font-black border border-emerald-300 dark:border-emerald-800">
                        <TrendingDown className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        {economizou ? `-${op.economiaPercentual?.toFixed(1)}%` : 'Oferta Válida'}
                      </span>
                    )}

                    {!ehVantajosa && op.status === 'Descartado_Preco_Maior' && (
                      <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-[10px] font-bold">
                        Preço Maior
                      </span>
                    )}
                  </div>

                  {/* Produto */}
                  <div>
                    <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 line-clamp-2" title={op.produtoNome}>
                      {op.produtoNome}
                    </h4>
                    {op.ean && (
                      <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                        EAN: {op.ean}
                      </span>
                    )}
                  </div>

                  {/* Bonificação */}
                  {op.bonificacaoTexto && (
                    <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <BadgePercent className="w-3.5 h-3.5 shrink-0" />
                      <span>{op.bonificacaoTexto}</span>
                    </div>
                  )}

                  {/* Comparativo de Preços */}
                  <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block">Preço Ofertado:</span>
                      <span className="text-sm font-black text-slate-900 dark:text-slate-100">
                        R$ {op.precoLiquidoEfetivo?.toFixed(2) || op.precoOfertado?.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block">Última Compra Digifarma:</span>
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                        {op.precoUltCompraDigifarma ? `R$ ${op.precoUltCompraDigifarma.toFixed(2)}` : 'Sem Histórico'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Ações */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setSelectedOferta(op)}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline cursor-pointer"
                  >
                    Ver transcrição
                  </button>

                  <button
                    onClick={() => handleCriarCotacaoComOferta(op)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    Cotar Item
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Transcrição da Oferta */}
      {selectedOferta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg p-6 rounded-[2rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-400 rounded-2xl">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                    Mensagem Original do WhatsApp
                  </h3>
                  <p className="text-xs font-bold text-slate-400">
                    {selectedOferta.fornecedorNome} {selectedOferta.representanteNome ? `(${selectedOferta.representanteNome})` : ''}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap font-mono leading-relaxed max-h-60 overflow-y-auto">
              {selectedOferta.textoOriginal || 'Texto completo não gravado no histórico.'}
            </div>

            <div className="flex items-center justify-end">
              <button
                onClick={() => setSelectedOferta(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
