import React, { useState, useEffect } from 'react';
import { 
  Layers, 
  Search, 
  Sparkles, 
  PlusCircle, 
  AlertTriangle, 
  CheckCircle2, 
  Trash2, 
  Plus, 
  RefreshCw, 
  Package, 
  TrendingDown, 
  X,
  Tag,
  Building,
  ShieldCheck,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { GrupoEquivalente, User } from '../../types';
import { useToast } from '../ToastContext';

interface ComprasEquivalentesProps {
  user: User;
  theme: 'light' | 'dark';
}

export const ComprasEquivalentes: React.FC<ComprasEquivalentesProps> = ({
  theme
}) => {
  const { addToast } = useToast();
  const [grupos, setGrupos] = useState<GrupoEquivalente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroRuptura, setFiltroRuptura] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [totalGrupos, setTotalGrupos] = useState(0);

  const [gerandoAuto, setGerandoAuto] = useState(false);
  const [grupoExpandido, setGrupoExpandido] = useState<string | null>(null);

  // Modal de Novo Grupo Manual
  const [isModalGrupoOpen, setIsModalGrupoOpen] = useState(false);
  const [formGrupo, setFormGrupo] = useState({
    nomeGrupo: '',
    principioAtivo: '',
    dosagem: '',
    unidadesEmbalagem: 1,
    formaFarmaceutica: 'COMP/CAPS',
    estMinimoGrupo: 0,
    observacoes: ''
  });

  // Modal de Vincular Produto a um Grupo
  const [isModalVincularOpen, setIsModalVincularOpen] = useState(false);
  const [grupoSelecionadoParaVinculo, setGrupoSelecionadoParaVinculo] = useState<GrupoEquivalente | null>(null);
  const [buscaProduto, setBuscaProduto] = useState('');
  const [produtosEncontrados, setProdutosEncontrados] = useState<any[]>([]);
  const [buscandoProdutos, setBuscandoProdutos] = useState(false);

  const carregarGrupos = async (pag = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        pagina: String(pag),
        limite: '20',
        busca: busca.trim(),
        apenasRuptura: String(filtroRuptura)
      });
      const res = await fetch(`/api/central-compras/equivalentes?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setGrupos(data.data.grupos || []);
          setTotalPaginas(data.data.totalPaginas || 1);
          setTotalGrupos(data.data.total || 0);
          setPagina(pag);
        }
      }
    } catch (err: any) {
      addToast('Erro ao carregar grupos equivalentes: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarGrupos(1);
  }, [busca, filtroRuptura]);

  const dispararAutoAgrupamento = async () => {
    try {
      setGerandoAuto(true);
      const res = await fetch('/api/central-compras/equivalentes/gerar-automaticos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`✅ ${data.message}`, 'success');
        carregarGrupos(1);
      } else {
        addToast(data.error || 'Erro ao gerar grupos automáticos.', 'error');
      }
    } catch (err: any) {
      addToast('Erro na conexão: ' + err.message, 'error');
    } finally {
      setGerandoAuto(false);
    }
  };

  const salvarNovoGrupo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formGrupo.nomeGrupo.trim() || !formGrupo.principioAtivo.trim()) {
      addToast('Informe o nome do grupo e o princípio ativo.', 'warning');
      return;
    }
    try {
      const res = await fetch('/api/central-compras/equivalentes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formGrupo)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast('Grupo criado com sucesso!', 'success');
        setIsModalGrupoOpen(false);
        setFormGrupo({
          nomeGrupo: '',
          principioAtivo: '',
          dosagem: '',
          unidadesEmbalagem: 1,
          formaFarmaceutica: 'COMP/CAPS',
          estMinimoGrupo: 0,
          observacoes: ''
        });
        carregarGrupos(1);
      } else {
        addToast(data.error || 'Erro ao criar grupo.', 'error');
      }
    } catch (err: any) {
      addToast('Erro ao salvar grupo: ' + err.message, 'error');
    }
  };

  const pesquisarProdutosEstoque = async (termo: string) => {
    setBuscaProduto(termo);
    if (!termo || termo.trim().length < 2) {
      setProdutosEncontrados([]);
      return;
    }
    try {
      setBuscandoProdutos(true);
      const res = await fetch(`/api/central-compras/produtos-busca?q=${encodeURIComponent(termo.trim())}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setProdutosEncontrados(data.data || []);
        }
      }
    } catch (err) {} finally {
      setBuscandoProdutos(false);
    }
  };

  const vincularProduto = async (produtoId: number) => {
    if (!grupoSelecionadoParaVinculo) return;
    try {
      const res = await fetch('/api/central-compras/equivalentes/vincular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grupoId: grupoSelecionadoParaVinculo.grupoId,
          produtoId
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast('Produto vinculado ao grupo com sucesso!', 'success');
        setIsModalVincularOpen(false);
        setBuscaProduto('');
        setProdutosEncontrados([]);
        carregarGrupos(pagina);
      } else {
        addToast(data.error || 'Erro ao vincular produto.', 'error');
      }
    } catch (err: any) {
      addToast('Erro ao vincular: ' + err.message, 'error');
    }
  };

  const desvincularProduto = async (grupoId: string, produtoId: number) => {
    if (!confirm('Deseja desvincular este produto do grupo de equivalentes?')) return;
    try {
      const res = await fetch(`/api/central-compras/equivalentes/${grupoId}/produtos/${produtoId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast('Produto desvinculado com sucesso!', 'info');
        carregarGrupos(pagina);
      } else {
        addToast(data.error || 'Erro ao desvincular produto.', 'error');
      }
    } catch (err: any) {
      addToast('Erro ao desvincular: ' + err.message, 'error');
    }
  };

  const excluirGrupo = async (grupoId: string, nome: string) => {
    if (!confirm(`Tem certeza que deseja excluir o grupo "${nome}"? Os produtos voltarão a ser considerados individualmente.`)) return;
    try {
      const res = await fetch(`/api/central-compras/equivalentes/${grupoId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast('Grupo removido com sucesso.', 'info');
        carregarGrupos(pagina);
      }
    } catch (err: any) {
      addToast('Erro ao excluir grupo: ' + err.message, 'error');
    }
  };

  const bgCard = theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200';
  const textTitle = theme === 'dark' ? 'text-white' : 'text-slate-900';
  const textSub = theme === 'dark' ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className="space-y-6">
      {/* Cabeçalho & Botões Principais */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className={`text-2xl font-bold ${textTitle}`}>Produtos Equivalentes & Substitutos</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {totalGrupos} Grupos
            </span>
          </div>
          <p className={`text-sm ${textSub} mt-1`}>
            Agrupe genéricos e similares intercambiáveis para unificar estoque, evitar falsas rupturas e cotar com a melhor referência.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={dispararAutoAgrupamento}
            disabled={gerandoAuto}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors disabled:opacity-50"
          >
            <Sparkles className={`w-4 h-4 ${gerandoAuto ? 'animate-spin' : ''}`} />
            {gerandoAuto ? 'Agrupando Catálogo...' : 'Auto-Agrupar Catálogo'}
          </button>

          <button
            onClick={() => setIsModalGrupoOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            Novo Grupo Manual
          </button>
        </div>
      </div>

      {/* Barra de Busca & Filtros */}
      <div className={`p-4 rounded-xl border ${bgCard} flex flex-col sm:flex-row items-center justify-between gap-4`}>
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por princípio ativo ou nome do grupo..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className={`w-full pl-9 pr-4 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              theme === 'dark' 
                ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' 
                : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
            }`}
          />
          {busca && (
            <button onClick={() => setBusca('')} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => setFiltroRuptura(!filtroRuptura)}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
              filtroRuptura
                ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300'
                : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Apenas em Ruptura (Saldo 0)
          </button>

          <button
            onClick={() => carregarGrupos(pagina)}
            className="p-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-600 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Lista de Grupos */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin mb-3 text-blue-500" />
          <p className="text-sm">Carregando grupos de produtos equivalentes...</p>
        </div>
      ) : grupos.length === 0 ? (
        <div className={`p-12 text-center rounded-xl border ${bgCard}`}>
          <Layers className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <h3 className={`text-base font-semibold ${textTitle}`}>Nenhum grupo equivalente encontrado</h3>
          <p className={`text-sm ${textSub} mt-1 max-w-md mx-auto`}>
            {busca 
              ? 'Nenhum grupo corresponde aos termos da busca.' 
              : 'Clique em "Auto-Agrupar Catálogo" para indexar automaticamente os medicamentos por princípio ativo, dosagem e embalagem.'}
          </p>
          {!busca && (
            <button
              onClick={dispararAutoAgrupamento}
              disabled={gerandoAuto}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Sparkles className="w-4 h-4" />
              Executar Auto-Agrupamento
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {grupos.map((grupo) => {
            const expandido = grupoExpandido === grupo.grupoId;
            return (
              <div 
                key={grupo.grupoId} 
                className={`rounded-xl border transition-all ${bgCard} ${
                  grupo.emRuptura ? 'border-rose-300 dark:border-rose-900/60' : ''
                }`}
              >
                {/* Header do Card do Grupo */}
                <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className={`text-base font-bold ${textTitle}`}>{grupo.nomeGrupo}</h4>
                      {grupo.emRuptura ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Ruptura Conjunta (0 un)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Estoque Seguro
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        {grupo.quantidadeProdutos} {grupo.quantidadeProdutos === 1 ? 'marca' : 'marcas cadastradas'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-2">
                      <span>Princípio: <strong className="text-slate-700 dark:text-slate-300">{grupo.principioAtivo}</strong></span>
                      {grupo.dosagem && <span>Dosagem: <strong className="text-slate-700 dark:text-slate-300">{grupo.dosagem}</strong></span>}
                      {grupo.unidadesEmbalagem && <span>Embalagem: <strong className="text-slate-700 dark:text-slate-300">{grupo.unidadesEmbalagem} un</strong></span>}
                      {grupo.menorUltimaCompra > 0 && (
                        <span>Menor Última Compra: <strong className="text-emerald-600 dark:text-emerald-400">R$ {grupo.menorUltimaCompra.toFixed(2)}</strong></span>
                      )}
                    </div>
                  </div>

                  {/* Resumo de Estoque & Ações */}
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Saldo Consolidado</div>
                      <div className={`text-xl font-black ${grupo.saldoTotal > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {grupo.saldoTotal} <span className="text-xs font-normal text-slate-500">un</span>
                      </div>
                      {grupo.estMinimoTotal > 0 && (
                        <div className="text-[11px] text-slate-400">Mín: {grupo.estMinimoTotal} un</div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setGrupoSelecionadoParaVinculo(grupo);
                          setIsModalVincularOpen(true);
                        }}
                        className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
                        title="Adicionar outro produto a este grupo"
                      >
                        <Plus className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => setGrupoExpandido(expandido ? null : grupo.grupoId)}
                        className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                        title={expandido ? 'Recolher detalhes' : 'Ver marcas e produtos'}
                      >
                        {expandido ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Área Expandida com a Lista de Produtos do Grupo */}
                {expandido && (
                  <div className="p-4 border-t border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/30">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Produtos e Marcas Vinculadas a este Grupo
                      </span>
                      <button
                        onClick={() => excluirGrupo(grupo.grupoId, grupo.nomeGrupo)}
                        className="text-xs text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Excluir Grupo
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="text-slate-400 border-b border-slate-200 dark:border-slate-700 pb-2">
                            <th className="py-2 font-medium">Produto no Digifarma</th>
                            <th className="py-2 font-medium">EAN</th>
                            <th className="py-2 font-medium text-right">Saldo em Estoque</th>
                            <th className="py-2 font-medium text-right">Última Compra</th>
                            <th className="py-2 font-medium text-center">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {grupo.produtos.map((p) => (
                            <tr key={p.produto_id} className="hover:bg-slate-100/50 dark:hover:bg-slate-800/40">
                              <td className="py-2.5 pr-3">
                                <div className="font-semibold text-slate-800 dark:text-slate-200">{p.descricao}</div>
                                <div className="text-[11px] text-slate-400">ID: {p.produto_id} {p.laboratorio ? `• Lab: ${p.laboratorio}` : ''}</div>
                              </td>
                              <td className="py-2.5 pr-3 font-mono text-slate-500 dark:text-slate-400">
                                {p.ean || 'Sem EAN'}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <span className={`font-bold ${p.saldo > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                                  {p.saldo} un
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {p.ultima_compra_valor && p.ultima_compra_valor > 0 ? (
                                  <span className="font-medium text-slate-700 dark:text-slate-300">
                                    R$ {p.ultima_compra_valor.toFixed(2)}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">Sem reg.</span>
                                )}
                              </td>
                              <td className="py-2.5 pl-3 text-center">
                                <button
                                  onClick={() => desvincularProduto(grupo.grupoId, p.produto_id)}
                                  className="text-slate-400 hover:text-rose-500 p-1 rounded"
                                  title="Remover deste grupo"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Paginação */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between pt-4">
          <span className="text-xs text-slate-500">
            Página {pagina} de {totalPaginas} ({totalGrupos} grupos no total)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => carregarGrupos(pagina - 1)}
              disabled={pagina <= 1}
              className="px-3 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              onClick={() => carregarGrupos(pagina + 1)}
              disabled={pagina >= totalPaginas}
              className="px-3 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      {/* Modal: Vincular Produto a um Grupo */}
      {isModalVincularOpen && grupoSelecionadoParaVinculo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-lg rounded-2xl shadow-2xl border p-6 ${bgCard}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className={`text-lg font-bold ${textTitle}`}>Vincular Produto ao Grupo</h3>
                <p className={`text-xs ${textSub}`}>{grupoSelecionadoParaVinculo.nomeGrupo}</p>
              </div>
              <button 
                onClick={() => setIsModalVincularOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  Pesquise o produto no estoque pelo nome ou código de barras
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Ex: Fluconazol Cimed..."
                    value={buscaProduto}
                    onChange={(e) => pesquisarProdutosEstoque(e.target.value)}
                    className={`w-full pl-9 pr-4 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      theme === 'dark' ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60 border rounded-lg">
                {buscandoProdutos ? (
                  <div className="py-6 text-center text-xs text-slate-400">Pesquisando no estoque...</div>
                ) : produtosEncontrados.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    {buscaProduto.length >= 2 ? 'Nenhum produto encontrado com este nome.' : 'Digite 2 ou mais letras para buscar.'}
                  </div>
                ) : (
                  produtosEncontrados.map((item) => (
                    <div 
                      key={item.produto_id}
                      className="p-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                    >
                      <div className="flex-1 pr-3">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{item.descricao}</div>
                        <div className="text-[11px] text-slate-400">
                          EAN: {item.ean || 'N/A'} • Saldo: <strong>{item.saldo || 0} un</strong> • Últ. Compra: R$ {Number(item.ultima_compra_valor || 0).toFixed(2)}
                        </div>
                      </div>
                      <button
                        onClick={() => vincularProduto(item.produto_id)}
                        className="px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                      >
                        Vincular
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Novo Grupo Manual */}
      {isModalGrupoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl border p-6 ${bgCard}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-bold ${textTitle}`}>Novo Grupo de Equivalentes</h3>
              <button 
                onClick={() => setIsModalGrupoOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={salvarNovoGrupo} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Nome do Grupo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: FLUCONAZOL 150MG C/ 2 CPS"
                  value={formGrupo.nomeGrupo}
                  onChange={(e) => setFormGrupo({ ...formGrupo, nomeGrupo: e.target.value })}
                  className={`w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-blue-500 ${
                    theme === 'dark' ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Princípio Ativo *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: FLUCONAZOL"
                    value={formGrupo.principioAtivo}
                    onChange={(e) => setFormGrupo({ ...formGrupo, principioAtivo: e.target.value })}
                    className={`w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-blue-500 ${
                      theme === 'dark' ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Dosagem</label>
                  <input
                    type="text"
                    placeholder="Ex: 150MG"
                    value={formGrupo.dosagem}
                    onChange={(e) => setFormGrupo({ ...formGrupo, dosagem: e.target.value })}
                    className={`w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-blue-500 ${
                      theme === 'dark' ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Qtd Comprimidos/Unidades</label>
                  <input
                    type="number"
                    min="1"
                    value={formGrupo.unidadesEmbalagem}
                    onChange={(e) => setFormGrupo({ ...formGrupo, unidadesEmbalagem: parseInt(e.target.value, 10) || 1 })}
                    className={`w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-blue-500 ${
                      theme === 'dark' ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Forma Farmacêutica</label>
                  <select
                    value={formGrupo.formaFarmaceutica}
                    onChange={(e) => setFormGrupo({ ...formGrupo, formaFarmaceutica: e.target.value })}
                    className={`w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-blue-500 ${
                      theme === 'dark' ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  >
                    <option value="COMP/CAPS">Comprimido / Cápsula</option>
                    <option value="GOTAS">Gotas / Solução Oral</option>
                    <option value="XAROPE">Xarope</option>
                    <option value="SUSPENSÃO">Suspensão</option>
                    <option value="CREME">Creme / Pomada</option>
                    <option value="INJETÁVEL">Injetável</option>
                    <option value="OUTROS">Outros</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsModalGrupoOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Salvar Grupo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
