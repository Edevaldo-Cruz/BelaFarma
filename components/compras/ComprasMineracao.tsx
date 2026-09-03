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
  const [diasVarredura, setDiasVarredura] = useState<number>(14);
  const [busca, setBusca] = useState('');
  const [abaAtiva, setAbaAtiva] = useState<'RELEVANTES' | 'DESCONTO' | 'RUPTURA' | 'TODOS'>('RELEVANTES');

  // Modal de Detalhes da Oferta
  const [selectedOferta, setSelectedOferta] = useState<OportunidadeMinerada | null>(null);
  
  // Modal de Produtos Equivalentes da Oferta
  const [modalEquivOferta, setModalEquivOferta] = useState<any | null>(null);

  // Modal de Mineração Manual / Colar Texto
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualTexto, setManualTexto] = useState('');
  const [manualTelefone, setManualTelefone] = useState('');
  const [manualRepresentante, setManualRepresentante] = useState('');
  const [processandoManual, setProcessandoManual] = useState(false);

  const carregarOportunidades = async () => {
    try {
      const res = await fetch('/api/central-compras/oportunidades?limite=100');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setOportunidades(data.data);
        }
      }
    } catch (err: any) {
      console.warn('Erro ao carregar oportunidades:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarOportunidades();
    // Atualiza automaticamente a cada 15 segundos para exibir novas ofertas mineradas
    const interval = setInterval(() => {
      carregarOportunidades();
    }, 15000);
    return () => clearInterval(interval);
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
        const ofertasCount = data.data?.ofertasIndexadas || 0;
        const fornecedoresCount = data.data?.fornecedoresCadastrados || data.data?.representantesCadastrados || 0;
        if (ofertasCount > 0) {
          addToast(`✅ Varredura concluída! ${fornecedoresCount} fornecedores e ${ofertasCount} ofertas mapeadas.`, 'success');
        } else {
          addToast(`ℹ️ Varredura concluída! Nenhuma nova tabela de preços identificada no WhatsApp ainda. Você pode colar mensagens de representantes no botão "Colar Oferta".`, 'info');
        }
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

  const handleProcessarTextoManual = async () => {
    if (!manualTexto.trim()) {
      addToast('Cole o texto da oferta antes de processar.', 'warning');
      return;
    }
    try {
      setProcessandoManual(true);
      const res = await fetch('/api/central-compras/mineracao/processar-texto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: manualTexto,
          phone: manualTelefone || '5532999990000',
          pushName: manualRepresentante || 'Representante Comercial'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const qtdOfertas = data.data?.ofertas?.length || 0;
        addToast(`✅ Mineração concluída! ${qtdOfertas} oferta(s) extraída(s) com sucesso.`, 'success');
        setIsManualModalOpen(false);
        setManualTexto('');
        setManualTelefone('');
        setManualRepresentante('');
        carregarOportunidades();
      } else {
        addToast('Erro ao minerar texto: ' + (data.error || 'Falha ao processar'), 'error');
      }
    } catch (err: any) {
      addToast('Erro de comunicação: ' + err.message, 'error');
    } finally {
      setProcessandoManual(false);
    }
  };

  const oportunidadesFiltradas = useMemo(() => {
    return oportunidades
      .filter(op => {
        const prodNome = (op as any).produto_nome || op.produtoNome || '';
        const distNome = (op as any).distribuidora || (op as any).fornecedorNome || '';
        const repNome = (op as any).representante || (op as any).representanteNome || '';
        const eanStr = (op as any).ean || '';

        const matchBusca = !busca || 
          prodNome.toLowerCase().includes(busca.toLowerCase()) ||
          distNome.toLowerCase().includes(busca.toLowerCase()) ||
          repNome.toLowerCase().includes(busca.toLowerCase()) ||
          eanStr.includes(busca);

        if (!matchBusca) return false;

        const economizou = (op.economiaPercentual || 0) > 0;
        const temRuptura = Boolean(op.emRuptura || (op.estoqueAtual !== undefined && op.estoqueAtual <= 0));
        const temEstoqueBaixo = Boolean(op.estoqueMinimo && op.estoqueAtual !== undefined && op.estoqueAtual < op.estoqueMinimo);
        const precisaComprar = temRuptura || temEstoqueBaixo;

        if (abaAtiva === 'RELEVANTES') {
          // Exibir somente os relevantes: necessidade de estoque OU maior desconto
          return precisaComprar || economizou;
        }

        if (abaAtiva === 'DESCONTO') {
          return economizou;
        }

        if (abaAtiva === 'RUPTURA') {
          return precisaComprar;
        }

        return true; // 'TODOS'
      })
      .sort((a, b) => {
        if (abaAtiva === 'DESCONTO') {
          return (b.economiaPercentual || 0) - (a.economiaPercentual || 0);
        }
        if (abaAtiva === 'RUPTURA') {
          const scoreA = (a.estoqueAtual !== undefined && a.estoqueAtual <= 0 ? 100 : 50) + (a.economiaPercentual || 0);
          const scoreB = (b.estoqueAtual !== undefined && b.estoqueAtual <= 0 ? 100 : 50) + (b.economiaPercentual || 0);
          return scoreB - scoreA;
        }
        // 'RELEVANTES' ou padrão: pelo scoreRelevancia (Ruptura + Desconto primeiro, depois rupturas, depois super descontos)
        return (b.scoreRelevancia || 0) - (a.scoreRelevancia || 0);
      });
  }, [oportunidades, busca, abaAtiva]);

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
                <option value={14} className="bg-slate-800 text-white">Últimas 2 semanas (14 dias)</option>
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

            <button
              onClick={() => setIsManualModalOpen(true)}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-black uppercase tracking-wider border border-slate-600 transition-all cursor-pointer active:scale-95"
              title="Colar texto de mensagem ou encarte de representante"
            >
              <FileText className="w-4 h-4 text-orange-400" />
              Colar Oferta
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
          {[
            { id: 'RELEVANTES', label: '🎯 Mais Relevantes', badge: oportunidades.filter(o => (o.economiaPercentual || 0) > 0 || o.emRuptura).length },
            { id: 'DESCONTO', label: '📉 Maior Desconto', badge: oportunidades.filter(o => (o.economiaPercentual || 0) > 0).length },
            { id: 'RUPTURA', label: '🚨 Reposição / Ruptura', badge: oportunidades.filter(o => o.emRuptura).length },
            { id: 'TODOS', label: '📦 Todas as Ofertas', badge: oportunidades.length }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setAbaAtiva(f.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer ${
                abaAtiva === f.id
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md scale-[1.02]'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span>{f.label}</span>
              {f.badge > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  abaAtiva === f.id
                    ? 'bg-red-600 text-white dark:bg-red-500'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}>
                  {f.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela Operacional de Oportunidades Relevantes */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 font-bold bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-red-600" />
          Carregando oportunidades mineradas do WhatsApp...
        </div>
      ) : oportunidadesFiltradas.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
          <MessageSquare className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="font-bold text-slate-700 dark:text-slate-300">Nenhuma oportunidade relevante encontrada nesta aba</p>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {abaAtiva === 'RELEVANTES' 
              ? 'Não há ofertas com desconto ou ruptura no momento. Alterne para a aba "Todas as Ofertas" ou clique em "Varrer WhatsApp Agora".'
              : 'Clique em "Varrer WhatsApp Agora" para extrair ofertas das conversas com os representantes.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-4 px-4">Produto & Fornecedor</th>
                  <th className="py-4 px-3">Preço Ofertado</th>
                  <th className="py-4 px-3">Última Compra</th>
                  <th className="py-4 px-3 text-center">Desconto</th>
                  <th className="py-4 px-3 text-center">Estoque</th>
                  <th className="py-4 px-4 min-w-[260px]">Justificativa de Compra</th>
                  <th className="py-4 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {oportunidadesFiltradas.map(op => {
                  const ehVantajosa = op.status === 'Aprovado_Radar' || (op.economiaPercentual || 0) > 0;
                  const economizou = op.economiaPercentual && op.economiaPercentual > 0;
                  const emRup = Boolean(op.emRuptura || (op.estoqueAtual !== undefined && op.estoqueAtual <= 0));
                  const precoOf = op.precoLiquidoEfetivo || op.precoOfertado;
                  const precoUlt = op.precoUltCompraDigifarma;
                  const econValor = (precoUlt && precoUlt > precoOf) ? (precoUlt - precoOf) : (op.economiaValor || 0);

                  // Cores e texto da Justificativa
                  const justBadge = op.justificativa?.badge || (emRup ? '🚨 Reposição Necessária' : (economizou ? '📉 Preço Competitivo' : 'Preço Normal'));
                  const justTexto = op.justificativa?.texto || (emRup 
                    ? `Estoque zerado ou abaixo do mínimo. Reposição necessária.` 
                    : (economizou 
                      ? `${op.economiaPercentual?.toFixed(1)}% mais barato que no Digifarma (Economia de R$ ${econValor.toFixed(2)}/un).`
                      : 'Oferta recebida de representante parceiro.'));
                  
                  const justCor = op.justificativa?.cor || (emRup ? 'red' : (economizou ? 'emerald' : 'slate'));

                  return (
                    <tr 
                      key={op.id}
                      className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                        emRup && economizou 
                          ? 'bg-red-50/20 dark:bg-red-950/10' 
                          : (economizou ? 'bg-emerald-50/10 dark:bg-emerald-950/5' : '')
                      }`}
                    >
                      {/* Produto & Fornecedor */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-black text-sm text-slate-900 dark:text-white line-clamp-2" title={op.produtoNome}>
                          {op.produtoNome}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {op.fornecedorNome || (op as any).distribuidora || 'Distribuidora'}
                          </span>
                          {op.representanteNome && (
                            <span>• Rep: {op.representanteNome}</span>
                          )}
                          {op.ean && (
                            <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-500">
                              {op.ean}
                            </span>
                          )}
                          {op.grupoEquivalente && (
                            <button
                              onClick={() => setModalEquivOferta(op.grupoEquivalente)}
                              className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 dark:text-indigo-300 transition-colors cursor-pointer border border-indigo-200 dark:border-indigo-800"
                              title="Clique para ver o estoque e preços dos produtos equivalentes"
                            >
                              <Layers className="w-3 h-3 text-indigo-500" />
                              <span>Equivalentes: {op.grupoEquivalente.saldoTotal} un ({op.grupoEquivalente.quantidadeProdutos} marcas)</span>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Preço Ofertado */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <span className="text-sm font-black text-slate-900 dark:text-slate-100 block">
                          R$ {precoOf?.toFixed(2)}
                        </span>
                        {op.bonificacaoTexto && (
                          <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[10px] font-black">
                            🎁 {op.bonificacaoTexto}
                          </span>
                        )}
                      </td>

                      {/* Última Compra Digifarma */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {precoUlt ? (
                          <>
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 block">
                              R$ {precoUlt.toFixed(2)}
                            </span>
                            {econValor > 0 && (
                              <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 block">
                                -R$ {econValor.toFixed(2)}/un
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs font-medium text-slate-400">Sem Histórico</span>
                        )}
                      </td>

                      {/* Desconto (%) */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        {economizou ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-xs font-black border border-emerald-300 dark:border-emerald-800 shadow-sm">
                            <TrendingDown className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            -{op.economiaPercentual?.toFixed(1)}%
                          </span>
                        ) : op.status === 'Descartado_Preco_Maior' ? (
                          <span className="px-2 py-1 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-[11px] font-bold">
                            Preço Maior
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">—</span>
                        )}
                      </td>

                      {/* Estoque */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        {op.estoqueAtual !== undefined ? (
                          <div className="flex flex-col items-center">
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-black border ${
                              op.estoqueAtual <= 0
                                ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300'
                                : (op.estoqueMinimo && op.estoqueAtual < op.estoqueMinimo
                                  ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300')
                            }`}>
                              {op.estoqueAtual <= 0 ? 'Zerado (0)' : `${op.estoqueAtual} un`}
                            </span>
                            {op.estoqueMinimo ? (
                              <span className="text-[10px] text-slate-400 mt-0.5">
                                Mín: {op.estoqueMinimo}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      {/* Justificativa de Compra */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                            justCor === 'red'
                              ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950/80 dark:text-red-300 dark:border-red-800'
                              : (justCor === 'amber'
                                ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800'
                                : (justCor === 'emerald'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800'
                                  : (justCor === 'blue'
                                    ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/80 dark:text-blue-300 dark:border-blue-800'
                                    : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700')))
                          }`}>
                            {justBadge}
                          </span>
                          <p className="text-[11px] font-medium text-slate-700 dark:text-slate-300 leading-tight">
                            {justTexto}
                          </p>
                        </div>
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {op.grupoEquivalente && (
                            <button
                              onClick={() => setModalEquivOferta(op.grupoEquivalente)}
                              className="p-2 rounded-xl text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-all cursor-pointer"
                              title="Ver produtos e marcas equivalentes"
                            >
                              <Layers className="w-4 h-4" />
                            </button>
                          )}

                          <button
                            onClick={() => setSelectedOferta(op)}
                            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                            title="Ver mensagem original do WhatsApp"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleCriarCotacaoComOferta(op)}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer active:scale-95"
                          >
                            <ShoppingBag className="w-3.5 h-3.5" />
                            Cotar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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

      {/* Modal para Colar/Importar Texto de Mensagem de Representante */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl p-6 rounded-[2rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 rounded-2xl">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                  Colar Oferta / Mensagem do WhatsApp
                </h3>
                <p className="text-xs font-bold text-slate-400">
                  Cole tabelas, encartes ou conversas de representantes para minerar preços e prazos imediatamente.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Nome / Distribuidora (Opcional)
                </label>
                <input
                  type="text"
                  value={manualRepresentante}
                  onChange={(e) => setManualRepresentante(e.target.value)}
                  placeholder="Ex: Carlos (Santa Cruz)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                  Telefone (Opcional)
                </label>
                <input
                  type="text"
                  value={manualTelefone}
                  onChange={(e) => setManualTelefone(e.target.value)}
                  placeholder="Ex: (32) 99999-8888"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                Texto da Mensagem com Preços / Prazos
              </label>
              <textarea
                value={manualTexto}
                onChange={(e) => setManualTexto(e.target.value)}
                placeholder="Exemplo:&#10;Boa tarde! Ofertas especiais de hoje:&#10;Dipirona 500mg c/ 100 por R$ 1,45&#10;Losartana 50mg 30cp R$ 2,10&#10;Amoxicilina 500mg R$ 18,90&#10;Condições: 28/35/42 dias no boleto, pedido mínimo R$ 500"
                rows={6}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500 leading-relaxed resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsManualModalOpen(false)}
                disabled={processandoManual}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleProcessarTextoManual}
                disabled={processandoManual || !manualTexto.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white text-xs font-black uppercase tracking-wider shadow-lg transition-all disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className={`w-4 h-4 ${processandoManual ? 'animate-spin' : ''}`} />
                {processandoManual ? 'Minerando IA...' : 'Processar e Minerar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalhes dos Produtos Equivalentes */}
      {modalEquivOferta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl p-6 rounded-[2rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 rounded-2xl">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                    {modalEquivOferta.nome || modalEquivOferta.nomeGrupo}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Estoque consolidado de marcas equivalentes / genéricos
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalEquivOferta(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-center">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Saldo Total</span>
                <span className={`text-lg font-black ${modalEquivOferta.saldoTotal > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}>
                  {modalEquivOferta.saldoTotal} un
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Estoque Mínimo</span>
                <span className="text-lg font-black text-slate-700 dark:text-slate-300">
                  {modalEquivOferta.estMinimoTotal || 0} un
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Menor Compra</span>
                <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                  {modalEquivOferta.menorUltimaCompra > 0 ? `R$ ${modalEquivOferta.menorUltimaCompra.toFixed(2)}` : '—'}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Marcas e Estoque Atual na Farmácia:
              </span>
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
                {modalEquivOferta.produtos && modalEquivOferta.produtos.length > 0 ? (
                  modalEquivOferta.produtos.map((p: any) => (
                    <div key={p.produto_id} className="p-3 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">{p.descricao}</span>
                        <span className="text-[11px] text-slate-400">ID: {p.produto_id} {p.ean ? `• EAN: ${p.ean}` : ''}</span>
                      </div>
                      <div className="text-right">
                        <span className={`font-black block ${p.saldo > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                          {p.saldo} un
                        </span>
                        {p.ultima_compra_valor > 0 && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                            Últ: R$ {Number(p.ultima_compra_valor).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-6 text-center text-xs text-slate-400">Nenhum produto detalhado encontrado.</div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => {
                  setModalEquivOferta(null);
                  if (onNavigateToTab) onNavigateToTab('equivalentes');
                }}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
              >
                Gerenciar todos os grupos na aba "Equivalentes" →
              </button>

              <button
                onClick={() => setModalEquivOferta(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
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
