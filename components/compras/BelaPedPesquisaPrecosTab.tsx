import React, { useState, useEffect } from 'react';
import {
  Search,
  Zap,
  ShoppingCart,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Ban,
  PackageCheck,
  Building2,
  Copy,
  TrendingDown,
  TrendingUp,
  RotateCcw,
  Plus,
  Trash2,
  X,
  HelpCircle,
  FileText,
  Calendar,
  Layers,
  Sparkles,
  Info
} from 'lucide-react';

interface Props {
  janelaAlvoSelecionada: string;
  janelaAtivaData: any;
  addToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  user: any;
  onNavegarTab?: (tabId: string) => void;
  onIncluirListaSemanal?: (produto: any, quantidade: number) => Promise<void>;
  onAlternarJaPedido?: (produto: any, e: React.MouseEvent) => void;
}

export const BelaPedPesquisaPrecosTab: React.FC<Props> = ({
  janelaAlvoSelecionada,
  janelaAtivaData,
  addToast,
  user,
  onNavegarTab,
  onIncluirListaSemanal,
  onAlternarJaPedido
}) => {
  const [termoBusca, setTermoBusca] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<any | null>(null);
  const [buscaExecutada, setBuscaExecutada] = useState(false);

  // Estado da cotação ao vivo multi-distribuidoras
  const [cotandoAoVivo, setCotandoAoVivo] = useState(false);
  const [progressoCotacao, setProgressoCotacao] = useState<{
    total: number;
    atualIndex: number;
    distribuidoraAtual: string;
    finalizados: string[];
  }>({ total: 0, atualIndex: 0, distribuidoraAtual: '', finalizados: [] });

  // Modal de confirmação de carrinho limpo
  const [modalCarrinho, setModalCarrinho] = useState<{
    aberto: boolean;
    distribuidora: string;
    ean: string;
    descricao: string;
    quantidade: number;
    preco: number;
    enviando: boolean;
  }>({
    aberto: false,
    distribuidora: '',
    ean: '',
    descricao: '',
    quantidade: 1,
    preco: 0,
    enviando: false
  });

  // Quantidade de compra customizada para inclusão
  const [qtdCompra, setQtdCompra] = useState<number>(2);

  // Histórico rápido de buscas recentes sugeridas
  const buscasSugeridas = ['DIPIRONA', 'GLIFAGE', 'LOSARTANA', 'AMOXICILINA', 'OMEPRAZOL', 'PARACETAMOL', 'IBUPROFENO'];

  const buscarProduto = async (termo: string) => {
    const q = termo.trim();
    if (!q) {
      addToast('Digite o nome, princípio ativo ou EAN do produto.', 'warning');
      return;
    }

    setCarregando(true);
    setBuscaExecutada(true);
    try {
      const janelaQuery = janelaAlvoSelecionada ? `&janelaMes=${encodeURIComponent(janelaAlvoSelecionada)}` : '';
      const res = await fetch(`/api/belaped/pesquisa-produto?q=${encodeURIComponent(q)}${janelaQuery}`);
      const data = await res.json();

      if (data.success && data.encontrado) {
        setResultado(data);
        // Sugere quantidade para 1 semana baseado no VMD ou padrão 2 un
        const vmd = Number(data.estoque?.vmd_ponderado || 0);
        const sugestao = vmd > 0 ? Math.max(1, Math.ceil(vmd * 7)) : 2;
        setQtdCompra(sugestao);
      } else {
        setResultado(null);
        addToast(data.mensagem || 'Nenhum produto localizado para este termo.', 'info');
      }
    } catch (err: any) {
      addToast(`Erro na pesquisa: ${err.message}`, 'error');
    } finally {
      setCarregando(false);
    }
  };

  const handleCopiarEan = (ean: string) => {
    if (!ean) return;
    navigator.clipboard.writeText(ean);
    addToast(`EAN ${ean} copiado para a área de transferência!`, 'success');
  };

  // Disparo da cotação ao vivo para o produto em todas as distribuidoras
  const handleCotarAoVivo = async () => {
    if (!resultado?.produto?.ean) {
      addToast('Produto sem EAN válido para cotação nos portais.', 'warning');
      return;
    }

    const ean = resultado.produto.ean;
    const descricao = resultado.produto.descricao;
    const portais = (resultado.cotacoes?.portais || []).map((p: any) => p.nome);

    if (portais.length === 0) {
      addToast('Nenhuma distribuidora disponível para cotar.', 'warning');
      return;
    }

    setCotandoAoVivo(true);
    setProgressoCotacao({
      total: portais.length,
      atualIndex: 0,
      distribuidoraAtual: portais[0],
      finalizados: []
    });

    try {
      // Cota distribuidora por distribuidora atualizando o progresso na barra
      for (let i = 0; i < portais.length; i++) {
        const portalNome = portais[i];
        setProgressoCotacao(prev => ({
          ...prev,
          atualIndex: i + 1,
          distribuidoraAtual: portalNome
        }));

        try {
          await fetch('/api/belaped/recotar-produto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ean,
              descricao,
              fornecedor: portalNome,
              por_essencia: true
            })
          });
        } catch (ePort) {
          console.warn(`Erro ao cotar no portal ${portalNome}:`, ePort);
        }

        setProgressoCotacao(prev => ({
          ...prev,
          finalizados: [...prev.finalizados, portalNome]
        }));
      }

      addToast(`✓ Cotação concluída em todas as ${portais.length} distribuidoras!`, 'success');
      // Recarrega os preços atualizados
      await buscarProduto(ean);

    } catch (err: any) {
      addToast(`Falha durante a cotação ao vivo: ${err.message}`, 'error');
    } finally {
      setCotandoAoVivo(false);
    }
  };

  // Adição ao carrinho com opção de limpar ou manter
  const handleConfirmarAdicionarCarrinho = async (limparAntes: boolean) => {
    if (!modalCarrinho.distribuidora || !modalCarrinho.ean) return;

    setModalCarrinho(prev => ({ ...prev, enviando: true }));
    try {
      const res = await fetch('/api/belaped/adicionar-item-carrinho', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distribuidora: modalCarrinho.distribuidora,
          ean: modalCarrinho.ean,
          descricao: modalCarrinho.descricao,
          quantidade: modalCarrinho.quantidade,
          limparAntes
        })
      });
      const data = await res.json();

      if (data.success) {
        addToast(data.message || `Item adicionado ao carrinho da ${modalCarrinho.distribuidora}!`, 'success');
        setModalCarrinho(prev => ({ ...prev, aberto: false }));
      } else {
        addToast(data.error || 'Erro ao adicionar item ao carrinho.', 'error');
      }
    } catch (err: any) {
      addToast(`Erro de conexão com o robô: ${err.message}`, 'error');
    } finally {
      setModalCarrinho(prev => ({ ...prev, enviando: false }));
    }
  };

  // Incluir na lista de compras semanal
  const handleIncluirListaSemanalInterno = async () => {
    if (!resultado?.produto) return;
    try {
      const res = await fetch('/api/belaped/itens-avulsos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descricao: resultado.produto.descricao,
          ean: resultado.produto.ean,
          quantidade: qtdCompra,
          preco_referencia: resultado.cotacoes?.melhor_janela?.preco || resultado.ultima_compra?.preco || 10.0,
          motivo: `⭐ Incluído via Consulta de Preços (${qtdCompra} un)`,
          usuario: user?.name || 'Comprador'
        })
      });
      const data = await res.json();
      if (data.success) {
        addToast(`✓ "${resultado.produto.descricao}" (${qtdCompra} un) adicionado à lista de compras da semana!`, 'success');
      } else {
        addToast(data.error || 'Não foi possível adicionar à lista.', 'error');
      }
    } catch (err: any) {
      addToast(`Erro ao adicionar: ${err.message}`, 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── BARRA DE BUSCA PROEMINENTE ─── */}
      <div className="bg-gradient-to-r from-[#0d1627] via-[#0f1d35] to-[#0a1324] p-5 rounded-2xl border border-cyan-800/60 shadow-xl space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-base sm:text-lg font-black uppercase text-white flex items-center gap-2 tracking-wide">
              <Search className="w-5 h-5 text-cyan-400" />
              <span>Consulta de Preços & Cotação Multi-Distribuidora</span>
            </h1>
            <p className="text-xs text-slate-300 font-medium mt-0.5">
              Pesquise qualquer produto para ver o estoque real, histórico de compras, veredito de reposição e preços em todas as empresas.
            </p>
          </div>

          {janelaAtivaData && (
            <div className="flex items-center gap-2 bg-[#070e1c] px-3 py-1.5 rounded-xl border border-cyan-900/60 text-xs">
              <span className="text-slate-400">Janela Alvo:</span>
              <span className="font-black text-cyan-300">{janelaAtivaData.nomeMes}</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-black ${
                janelaAtivaData.statusOrcamento === 'LIBERADO'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'bg-rose-950 text-rose-300 border border-rose-800'
              }`}>
                {janelaAtivaData.statusOrcamento}
              </span>
            </div>
          )}
        </div>

        {/* Input de Pesquisa */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            buscarProduto(termoBusca);
          }}
          className="flex flex-col sm:flex-row items-center gap-2"
        >
          <div className="relative flex-1 w-full">
            <input
              type="text"
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              placeholder="Digite o nome do produto, princípio ativo ou código de barras (EAN)..."
              className="w-full pl-10 pr-10 py-3 rounded-xl bg-[#070e1c] border border-slate-700 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30 text-white placeholder-slate-500 text-sm font-medium transition-all"
              autoFocus
            />
            <Search className="w-5 h-5 text-slate-400 absolute left-3 top-3.5" />
            {termoBusca && (
              <button
                type="button"
                onClick={() => setTermoBusca('')}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white absolute right-3 top-3 transition-colors"
                title="Limpar pesquisa"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={carregando || !termoBusca.trim()}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-cyan-900/40 cursor-pointer transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0"
          >
            {carregando ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin" />
                <span>Consultando...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Buscar Preços</span>
              </>
            )}
          </button>
        </form>

        {/* Chips de Consultas Sugeridas */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] font-bold text-slate-400 mr-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            Sugestões Rápidas:
          </span>
          {buscasSugeridas.map(sug => (
            <button
              key={sug}
              type="button"
              onClick={() => {
                setTermoBusca(sug);
                buscarProduto(sug);
              }}
              className="px-2 py-0.5 rounded-lg bg-[#070e1c] hover:bg-cyan-950/80 text-[11px] font-bold text-slate-300 hover:text-cyan-300 border border-slate-800 hover:border-cyan-700 transition-all cursor-pointer"
            >
              {sug}
            </button>
          ))}
        </div>
      </div>

      {/* ─── RESULTADO DO PRODUTO ─── */}
      {resultado && resultado.produto && (
        <div className="space-y-5">
          
          {/* HEADER DO PRODUTO & METADADOS */}
          <div className="bg-[#0b1322] p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2.5 py-0.5 rounded-md text-xs font-black border ${
                  resultado.produto.curva_abc === 'A'
                    ? 'bg-rose-950 text-rose-300 border-rose-800'
                    : resultado.produto.curva_abc === 'B'
                    ? 'bg-blue-950 text-blue-300 border-blue-800'
                    : 'bg-slate-900 text-slate-400 border border-slate-700'
                }`}>
                  Curva {resultado.produto.curva_abc}
                </span>

                {resultado.produto.ean && (
                  <button
                    onClick={() => handleCopiarEan(resultado.produto.ean)}
                    className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#070e1c] hover:bg-slate-800 text-xs font-mono font-bold text-cyan-300 border border-cyan-800/60 transition-all cursor-pointer"
                    title="Clique para copiar o código de barras (EAN)"
                  >
                    <span>{resultado.produto.ean}</span>
                    <Copy className="w-3 h-3 text-cyan-400" />
                  </button>
                )}

                {resultado.regras?.ja_pedido && (
                  <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-950 text-emerald-300 text-xs font-black border border-emerald-700">
                    <PackageCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Já Pedido</span>
                  </span>
                )}

                {resultado.regras?.nao_cotar && (
                  <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-rose-950 text-rose-300 text-xs font-black border border-rose-800">
                    <Ban className="w-3.5 h-3.5 text-rose-400" />
                    <span>Não Cotar</span>
                  </span>
                )}
              </div>

              <h2 className="text-lg sm:text-xl font-black text-white">
                {resultado.produto.descricao}
              </h2>
              {resultado.produto.apresentacao && (
                <p className="text-xs text-slate-400 font-medium">
                  {resultado.produto.apresentacao}
                </p>
              )}
            </div>

            {/* Ações Rápidas no Header */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex items-center bg-[#070e1c] p-1 rounded-xl border border-slate-800">
                <span className="px-2 text-slate-400 text-xs font-bold">Qtd:</span>
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={qtdCompra}
                  onChange={(e) => setQtdCompra(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-14 py-1 px-2 rounded-lg bg-black/40 text-center text-xs font-black text-cyan-300 border border-slate-700"
                />
              </div>

              <button
                onClick={handleIncluirListaSemanalInterno}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black shadow-md cursor-pointer transition-all active:scale-95"
                title="Adicionar aos itens de compras da semana"
              >
                <Plus className="w-4 h-4 text-emerald-200" />
                <span>Incluir na Semana</span>
              </button>
            </div>
          </div>

          {/* ─── 4 CARDS VITAIS: ESTOQUE, GIRO, ÚLTIMA COMPRA E VEREDITO ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* 1. Saldo em Estoque */}
            <div className="p-3.5 rounded-2xl bg-[#091120] border border-slate-800 space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400 block">
                Estoque Atual na Loja
              </span>
              <div className="flex items-baseline gap-2">
                <span className={`text-xl font-black ${resultado.estoque?.is_falta ? 'text-rose-400 animate-pulse' : 'text-white'}`}>
                  {resultado.estoque?.saldo || 0} un
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  resultado.estoque?.is_falta
                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                    : resultado.estoque?.dias_cobertura <= 7
                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                    : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                }`}>
                  {resultado.estoque?.is_falta ? 'Ruptura (0 un)' : `${resultado.estoque?.dias_cobertura}d de cobertura`}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block">
                Demanda semanal: ~{Math.ceil((resultado.estoque?.vmd_ponderado || 0) * 7)} un
              </span>
            </div>

            {/* 2. Giro Comercial & VMD */}
            <div className="p-3.5 rounded-2xl bg-[#091120] border border-slate-800 space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400 block">
                Giro & Saídas (30 Dias)
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-cyan-300">
                  {resultado.estoque?.vendas_30d || 0} un
                </span>
                <span className="text-xs text-slate-400 font-bold">
                  (VMD: {resultado.estoque?.vmd_ponderado || 0}/dia)
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block">
                Preço venda atual: R$ {(resultado.produto?.preco_venda || 0).toFixed(2)}
              </span>
            </div>

            {/* 3. Última Compra */}
            <div className="p-3.5 rounded-2xl bg-[#091120] border border-slate-800 space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400 block">
                Última Compra Real
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-amber-300">
                  {resultado.ultima_compra?.preco > 0 ? `R$ ${resultado.ultima_compra.preco.toFixed(2)}` : '—'}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block truncate" title={resultado.ultima_compra?.fornecedor}>
                Fornecedor: {resultado.ultima_compra?.fornecedor || 'Não inf.'} {resultado.ultima_compra?.data ? `(${resultado.ultima_compra.data})` : ''}
              </span>
            </div>

            {/* 4. Veredito Inteligente */}
            <div className={`p-3.5 rounded-2xl border space-y-1 ${
              resultado.veredito?.status === 'COMPRAR_AGORA'
                ? 'bg-emerald-950/40 border-emerald-600/80'
                : resultado.veredito?.status === 'AGUARDAR'
                ? 'bg-amber-950/40 border-amber-600/80'
                : 'bg-rose-950/40 border-rose-600/80'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-300 block">
                  Veredito de Reposição
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                  resultado.veredito?.status === 'COMPRAR_AGORA'
                    ? 'bg-emerald-900 text-emerald-200 border border-emerald-500'
                    : resultado.veredito?.status === 'AGUARDAR'
                    ? 'bg-amber-900 text-amber-200 border border-amber-500'
                    : 'bg-rose-900 text-rose-200 border border-rose-500'
                }`}>
                  {resultado.veredito?.titulo}
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-200 leading-snug line-clamp-2" title={resultado.veredito?.detalhe}>
                {resultado.veredito?.detalhe}
              </p>
            </div>
          </div>

          {/* ─── BARRA DE DISPARO DE COTAÇÃO AO VIVO & PROGRESSO ─── */}
          <div className="bg-[#0b1322] p-4 rounded-2xl border border-cyan-800/60 shadow-lg space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-black uppercase text-cyan-300 tracking-wider flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  Cotação em Tempo Real nos Portais
                </span>
                <p className="text-xs text-slate-400 font-medium">
                  Dispara os robôs para pesquisar o preço atualizado deste produto em todas as distribuidoras cadastradas.
                </p>
              </div>

              <button
                onClick={handleCotarAoVivo}
                disabled={cotandoAoVivo}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-black uppercase shadow-lg shadow-cyan-950/60 cursor-pointer transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {cotandoAoVivo ? (
                  <>
                    <RotateCcw className="w-4 h-4 animate-spin" />
                    <span>Cotando nos Portais...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 text-cyan-200" />
                    <span>⚡ Cotar ao Vivo Agora</span>
                  </>
                )}
              </button>
            </div>

            {/* Barra de Progresso durante a Cotação */}
            {cotandoAoVivo && (
              <div className="p-3.5 rounded-xl bg-[#070e1c] border border-cyan-700/60 space-y-2 animate-fadeIn">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-cyan-300 font-bold flex items-center gap-2">
                    <RotateCcw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                    <span>Pesquisando na <b>{progressoCotacao.distribuidoraAtual}</b>...</span>
                  </span>
                  <span className="text-slate-400 font-bold text-[11px]">
                    {progressoCotacao.atualIndex} de {progressoCotacao.total} distribuidoras ({Math.round((progressoCotacao.atualIndex / Math.max(1, progressoCotacao.total)) * 100)}%)
                  </span>
                </div>

                <div className="w-full h-2 bg-black/60 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 transition-all duration-300"
                    style={{ width: `${Math.round((progressoCotacao.atualIndex / Math.max(1, progressoCotacao.total)) * 100)}%` }}
                  ></div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px]">
                  {progressoCotacao.finalizados.map(fn => (
                    <span key={fn} className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                      ✓ {fn}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ─── QUADRO COMPARATIVO DE PREÇOS EM TODAS AS DISTRIBUIDORAS ─── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-cyan-400" />
                Quadro Comparativo de Distribuidoras ({(resultado.cotacoes?.portais || []).length} Portais)
              </span>

              {resultado.cotacoes?.melhor_janela && (
                <span className="text-xs text-emerald-300 font-bold flex items-center gap-1">
                  <span>🏆 Vencedor da Janela:</span>
                  <b>{resultado.cotacoes.melhor_janela.nome} (R$ {resultado.cotacoes.melhor_janela.preco?.toFixed(2)})</b>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {(resultado.cotacoes?.portais || []).map((portal: any) => {
                const isMelhorJanela = resultado.cotacoes?.melhor_janela?.portal_id === portal.portal_id;
                const isMelhorGeral = resultado.cotacoes?.melhor_geral?.portal_id === portal.portal_id;
                const precoUlt = Number(resultado.ultima_compra?.preco || 0);
                const precoPortal = Number(portal.preco || 0);

                let diffPct: number | null = null;
                if (precoPortal > 0 && precoUlt > 0) {
                  diffPct = Number((((precoPortal - precoUlt) / precoUlt) * 100).toFixed(1));
                }

                return (
                  <div
                    key={portal.portal_id}
                    className={`p-4 rounded-2xl border transition-all relative flex flex-col justify-between ${
                      isMelhorJanela
                        ? 'bg-gradient-to-b from-emerald-950/60 to-[#071713] border-emerald-500 shadow-lg ring-1 ring-emerald-500/40'
                        : portal.disponivel
                        ? 'bg-[#091120] border-slate-800 hover:border-slate-700'
                        : 'bg-[#070d18]/60 border-slate-900 opacity-60'
                    }`}
                  >
                    <div>
                      {/* Topo do Card de Distribuidora */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-xs font-black text-white uppercase block">
                            {portal.nome}
                          </span>
                          <span className="text-[10px] text-slate-400 font-semibold block">
                            Mínimo: R$ {portal.pedido_minimo} • {portal.prazo_dias}d ({portal.uf})
                          </span>
                        </div>

                        {/* Badges de Destaque */}
                        <div className="flex flex-col items-end gap-1">
                          {isMelhorJanela && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-500 text-slate-950 shadow-sm animate-pulse">
                              1º NA JANELA
                            </span>
                          )}
                          {isMelhorGeral && !isMelhorJanela && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-cyan-900 text-cyan-200 border border-cyan-700">
                              MENOR GLOBAL
                            </span>
                          )}
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                            portal.is_janela_elegivel
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-slate-900 text-slate-500 border border-slate-800'
                          }`}>
                            {portal.is_janela_elegivel ? 'Janela OK' : 'Fora da Janela'}
                          </span>
                        </div>
                      </div>

                      {/* Bloco de Preço */}
                      <div className="my-3 py-2 px-3 rounded-xl bg-black/40 border border-slate-800/80 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">Preço Cotado</span>
                          {portal.disponivel && portal.preco > 0 ? (
                            <span className="text-lg font-black text-white block">
                              R$ {portal.preco.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-slate-500 block">
                              Sem estoque / Não cotado
                            </span>
                          )}
                        </div>

                        {diffPct !== null && (
                          <div className={`text-right ${diffPct <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            <span className="text-[10px] font-bold uppercase block">vs Última Compra</span>
                            <span className="text-xs font-black block">
                              {diffPct <= 0 ? `${diffPct}%` : `+${diffPct}%`}
                            </span>
                          </div>
                        )}
                      </div>

                      {portal.updated_at && (
                        <span className="text-[9px] text-slate-500 block mb-2">
                          Cotado em: {new Date(portal.updated_at).toLocaleDateString('pt-BR')} às {new Date(portal.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>

                    {/* Ações da Distribuidora */}
                    <div className="flex items-center gap-1.5 pt-2 border-t border-slate-800/60">
                      {portal.url_produto && (
                        <a
                          href={portal.url_produto}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => handleCopiarEan(resultado.produto.ean)}
                          className="p-2 rounded-xl bg-[#081120] hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-all cursor-pointer"
                          title="Abrir página do produto no portal (copia o EAN)"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}

                      <button
                        type="button"
                        disabled={!portal.disponivel || !portal.preco}
                        onClick={() => {
                          setModalCarrinho({
                            aberto: true,
                            distribuidora: portal.nome,
                            ean: resultado.produto.ean,
                            descricao: resultado.produto.descricao,
                            quantidade: qtdCompra,
                            preco: portal.preco,
                            enviando: false
                          });
                        }}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-black cursor-pointer transition-all active:scale-95 ${
                          portal.disponivel && portal.preco
                            ? 'bg-cyan-600/90 hover:bg-cyan-500 text-white shadow-sm'
                            : 'bg-slate-800/40 text-slate-600 cursor-not-allowed border border-slate-800'
                        }`}
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        <span>Adicionar ao Carrinho</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── OUTROS RESULTADOS SIMILARES ─── */}
          {resultado.outrosResultados && resultado.outrosResultados.length > 0 && (
            <div className="p-4 rounded-2xl bg-[#091120] border border-slate-800 space-y-2">
              <span className="text-xs font-black uppercase text-slate-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                Outros Produtos Encontrados para "{termoBusca}":
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {resultado.outrosResultados.map((out: any) => (
                  <button
                    key={out.produto_id}
                    onClick={() => {
                      setTermoBusca(out.ean || out.descricao);
                      buscarProduto(out.ean || out.descricao);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#070e1c] hover:bg-cyan-950/80 text-xs font-bold text-slate-300 hover:text-white border border-slate-800 hover:border-cyan-700 transition-all cursor-pointer"
                  >
                    <span>{out.descricao}</span>
                    <span className="text-[10px] text-slate-500">({out.saldo} un • Curva {out.curva_abc})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ─── ESTADO INICIAL VAZIO ─── */}
      {!resultado && buscaExecutada && !carregando && (
        <div className="p-12 text-center bg-[#091120] rounded-2xl border border-slate-800 space-y-2">
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
          <h3 className="text-sm font-black text-white">Nenhum produto encontrado</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Verifique a grafia do nome ou digite o código de barras (EAN) completo com 13 dígitos para localizar o produto.
          </p>
        </div>
      )}

      {!resultado && !buscaExecutada && (
        <div className="p-16 text-center bg-[#080f1d] rounded-2xl border border-dashed border-slate-800 space-y-3">
          <Search className="w-10 h-10 text-cyan-500/60 mx-auto" />
          <h3 className="text-base font-black text-white">Pronto para Pesquisar</h3>
          <p className="text-xs text-slate-400 max-w-lg mx-auto">
            Digite acima o nome de qualquer medicamento ou utilize o leitor de código de barras para carregar as métricas de estoque, veredito de compras e cotações lado a lado.
          </p>
        </div>
      )}

      {/* ─── MODAL DE CONFIRMAÇÃO: LIMPAR OU MANTER CARRINHO ─── */}
      {modalCarrinho.aberto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b1322] border border-cyan-800/80 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-950 text-cyan-400 border border-cyan-700/60">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase text-white">
                    Adicionar ao Carrinho da {modalCarrinho.distribuidora}
                  </h3>
                  <span className="text-xs text-slate-400 font-medium">
                    {modalCarrinho.descricao}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setModalCarrinho(prev => ({ ...prev, aberto: false }))}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Resumo do Item */}
            <div className="bg-[#070e1c] p-3 rounded-xl border border-slate-800 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Quantidade:</span>
                <b className="text-cyan-300">{modalCarrinho.quantidade} un</b>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Preço Unitário:</span>
                <b className="text-white">R$ {modalCarrinho.preco.toFixed(2)}</b>
              </div>
              <div className="flex justify-between border-t border-slate-800 pt-1">
                <span className="text-slate-400">Subtotal Estimado:</span>
                <b className="text-emerald-400 font-black">R$ {(modalCarrinho.preco * modalCarrinho.quantidade).toFixed(2)}</b>
              </div>
            </div>

            {/* Pergunta Crítica de Higienização do Carrinho */}
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-600/70 text-xs text-amber-200 space-y-1.5">
              <span className="font-black flex items-center gap-1.5 text-amber-300 uppercase text-[11px]">
                <AlertTriangle className="w-4 h-4" />
                Deseja limpar o carrinho anterior antes de adicionar?
              </span>
              <p className="text-[11px] text-amber-200/90 leading-relaxed font-medium">
                Se você já possui itens no portal da <b>{modalCarrinho.distribuidora}</b>, limpar antes garante que o carrinho comece com 0 itens exclusivo para este pedido.
              </p>
            </div>

            {/* Botões de Ação */}
            <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
              <button
                disabled={modalCarrinho.enviando}
                onClick={() => handleConfirmarAdicionarCarrinho(true)}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-black uppercase shadow-md cursor-pointer transition-all active:scale-95 disabled:opacity-40"
              >
                {modalCarrinho.enviando ? 'Processando...' : '🧹 Sim, Limpar e Adicionar'}
              </button>

              <button
                disabled={modalCarrinho.enviando}
                onClick={() => handleConfirmarAdicionarCarrinho(false)}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-black uppercase border border-slate-700 cursor-pointer transition-all active:scale-95 disabled:opacity-40"
              >
                {modalCarrinho.enviando ? 'Processando...' : '➕ Não, Apenas Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
