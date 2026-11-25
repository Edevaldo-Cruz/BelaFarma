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
  ChevronUp,
  ArrowLeftRight,
  Check
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

  // Modal de Confirmação genérico (substitui window.confirm)
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  // Auditoria de Faltas Automáticas Cobertas por Equivalentes
  const [auditandoFaltas, setAuditandoFaltas] = useState(false);
  const [baixandoFaltas, setBaixandoFaltas] = useState(false);
  const [auditoriaResultado, setAuditoriaResultado] = useState<any | null>(null);

  // Painel Retrátil: Comparador & Testador do Motor
  const [comparadorAberto, setComparadorAberto] = useState(false);
  const [compTextoA, setCompTextoA] = useState('');
  const [compCatA, setCompCatA] = useState<number>(7);
  const [compTextoB, setCompTextoB] = useState('');
  const [compCatB, setCompCatB] = useState<number>(7);
  const [compLoading, setCompLoading] = useState(false);
  const [compResultado, setCompResultado] = useState<any | null>(null);

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

  // Modal de Revisão e Correção de Categorias no Digifarma (OUTROS -> Perfumaria/Med)
  const [isModalCategoriasOpen, setIsModalCategoriasOpen] = useState(false);
  const [catLoading, setCatLoading] = useState(false);
  const [catSalvando, setCatSalvando] = useState(false);
  const [catTipo, setCatTipo] = useState<'SUGERIDOS' | 'PERFUMARIA' | 'MEDICAMENTOS' | 'TODOS'>('SUGERIDOS');
  const [catApenasSaldo, setCatApenasSaldo] = useState(true);
  const [catBusca, setCatBusca] = useState('');
  const [catItens, setCatItens] = useState<any[]>([]);
  const [catResumo, setCatResumo] = useState<any | null>(null);
  const [catEdicoes, setCatEdicoes] = useState<Record<number, number>>({});
  const [catSelecionados, setCatSelecionados] = useState<Record<number, boolean>>({});

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

  const executarDesvincularProduto = async (grupoId: string, produtoId: number) => {
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

  const desvincularProduto = (grupoId: string, produtoId: number, descricao?: string) => {
    setConfirmModal({
      title: 'Desvincular Produto do Grupo',
      message: `Deseja remover "${descricao || 'este produto'}" do grupo? Ele não voltará a ser agrupado automaticamente aqui.`,
      confirmLabel: 'Desvincular',
      danger: true,
      onConfirm: () => executarDesvincularProduto(grupoId, produtoId)
    });
  };

  const executarExcluirGrupo = async (grupoId: string) => {
    try {
      const res = await fetch(`/api/central-compras/equivalentes/${grupoId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast('Grupo removido com sucesso.', 'info');
        carregarGrupos(pagina);
      } else {
        addToast(data.error || 'Erro ao excluir grupo.', 'error');
      }
    } catch (err: any) {
      addToast('Erro ao excluir grupo: ' + err.message, 'error');
    }
  };

  const excluirGrupo = (grupoId: string, nome: string) => {
    setConfirmModal({
      title: 'Excluir Grupo Equivalente',
      message: `Tem certeza que deseja excluir o grupo "${nome}"? Os produtos voltarão a ser considerados individualmente.`,
      confirmLabel: 'Excluir Grupo',
      danger: true,
      onConfirm: () => executarExcluirGrupo(grupoId)
    });
  };

  const auditarFaltasEquivalentes = async () => {
    try {
      setAuditandoFaltas(true);
      const res = await fetch('/api/central-compras/equivalentes/reavaliar-faltas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true, consultarFirebird: true })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAuditoriaResultado(data.data);
      } else {
        addToast(data.error || 'Erro ao auditar faltas.', 'error');
      }
    } catch (err: any) {
      addToast('Erro de conexão ao auditar faltas: ' + err.message, 'error');
    } finally {
      setAuditandoFaltas(false);
    }
  };

  const confirmarBaixaFaltasEquivalentes = async () => {
    try {
      setBaixandoFaltas(true);
      const res = await fetch('/api/central-compras/equivalentes/reavaliar-faltas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false, consultarFirebird: true })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(data.message || 'Faltas atualizadas com sucesso!', 'success');
        setAuditoriaResultado(null);
      } else {
        addToast(data.error || 'Erro ao baixar faltas.', 'error');
      }
    } catch (err: any) {
      addToast('Erro ao confirmar baixa: ' + err.message, 'error');
    } finally {
      setBaixandoFaltas(false);
    }
  };

  const testarComparacaoMotor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compTextoA.trim()) {
      addToast('Digite o nome do Produto A para analisar.', 'warning');
      return;
    }
    try {
      setCompLoading(true);
      const res = await fetch('/api/central-compras/equivalentes/comparar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texto: compTextoA.trim(),
          categoriaId: compCatA,
          produtoBTexto: compTextoB.trim() || undefined,
          categoriaBId: compCatB
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCompResultado(data.data);
      } else {
        addToast(data.error || 'Erro ao comparar produtos.', 'error');
      }
    } catch (err: any) {
      addToast('Erro na comparação: ' + err.message, 'error');
    } finally {
      setCompLoading(false);
    }
  };

  const getCategoriaBadge = (catId?: number) => {
    if (catId === 7) return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">GEN</span>;
    if (catId === 2) return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">SIM</span>;
    if (catId === 1) return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">REF</span>;
    return null;
  };

  const carregarRevisaoCategorias = async (
    tipoParam = catTipo,
    saldoParam = catApenasSaldo,
    buscaParam = catBusca
  ) => {
    try {
      setCatLoading(true);
      const params = new URLSearchParams({
        tipo: tipoParam,
        apenasComSaldo: String(saldoParam),
        busca: buscaParam.trim(),
        limite: '100'
      });
      const res = await fetch(`/api/central-compras/equivalentes/revisao-categorias?${params.toString()}`);
      const data = await res.json();
      if (data.success && data.data) {
        const lista = data.data.itens || [];
        setCatItens(lista);
        setCatResumo(data.data.resumo || null);
        const iniciais: Record<number, number> = {};
        const sels: Record<number, boolean> = {};
        for (const it of lista) {
          if (it.categoriaSugerida) {
            iniciais[it.produtoId] = it.categoriaSugerida;
            sels[it.produtoId] = true;
          } else {
            iniciais[it.produtoId] = it.categoriaAtual || 6;
            sels[it.produtoId] = false;
          }
        }
        setCatEdicoes(iniciais);
        setCatSelecionados(sels);
      } else {
        addToast(data.error || 'Erro ao carregar revisão de categorias.', 'error');
      }
    } catch {
      addToast('Erro de conexão ao consultar revisão de categorias.', 'error');
    } finally {
      setCatLoading(false);
    }
  };

  const abrirModalCategorias = () => {
    setIsModalCategoriasOpen(true);
    carregarRevisaoCategorias(catTipo, catApenasSaldo, catBusca);
  };

  const salvarCategoriasNoDigifarma = () => {
    const payload = catItens
      .filter(it => catSelecionados[it.produtoId] && catEdicoes[it.produtoId] && catEdicoes[it.produtoId] !== it.categoriaAtual)
      .map(it => ({
        produtoId: it.produtoId,
        novaCategoriaId: catEdicoes[it.produtoId]
      }));

    if (payload.length === 0) {
      addToast('Selecione ao menos um produto com categoria alterada.', 'info');
      return;
    }

    setConfirmModal({
      title: 'Salvar Categorias no Digifarma',
      message: `Deseja atualizar a categoria (CATEGORIA_ID) de ${payload.length} produto(s) diretamente no banco do Digifarma e no cache local?`,
      confirmLabel: `Salvar ${payload.length} no Digifarma`,
      onConfirm: async () => {
        try {
          setCatSalvando(true);
          const res = await fetch('/api/central-compras/equivalentes/atualizar-categoria-digifarma', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itens: payload })
          });
          const data = await res.json();
          if (data.success) {
            addToast(data.message || `${payload.length} produto(s) atualizado(s) no Digifarma!`, 'success');
            await carregarRevisaoCategorias(catTipo, catApenasSaldo, catBusca);
            carregarGrupos(pagina);
          } else {
            addToast(data.error || 'Falha ao atualizar categorias no Digifarma.', 'error');
          }
        } catch {
          addToast('Erro de comunicação ao salvar categorias no Digifarma.', 'error');
        } finally {
          setCatSalvando(false);
        }
      }
    });
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
            onClick={() => setComparadorAberto(!comparadorAberto)}
            className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border transition-colors ${
              comparadorAberto
                ? 'bg-sky-50 border-sky-300 text-sky-700 dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-300'
                : 'border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4" />
            Testar / Comparar
          </button>

          <button
            onClick={abrirModalCategorias}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
            title="Revisar itens em OUTROS (6) e salvar categoria correta direto no Digifarma"
          >
            <Tag className="w-4 h-4 text-violet-500" />
            Corrigir Categorias
          </button>

          <button
            onClick={auditarFaltasEquivalentes}
            disabled={auditandoFaltas}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition-colors disabled:opacity-50"
          >
            <ShieldCheck className={`w-4 h-4 ${auditandoFaltas ? 'animate-pulse' : ''}`} />
            {auditandoFaltas ? 'Auditando...' : 'Auditar Faltas'}
          </button>

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

      {/* Painel Retrátil: Testador & Comparador do Motor */}
      {comparadorAberto && (
        <div className={`p-4 rounded-xl border ${bgCard} space-y-4`}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className={`text-sm font-bold ${textTitle} flex items-center gap-2`}>
                <ArrowLeftRight className="w-4 h-4 text-sky-500" />
                Simulador e Comparador Farmacêutico
              </h3>
              <p className={`text-xs ${textSub}`}>
                Teste como o motor extrai princípio ativo, dosagem, forma e verifique se outro laboratório em estoque cobre o produto.
              </p>
            </div>
            <button onClick={() => setComparadorAberto(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={testarComparacaoMotor} className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
            <div className="lg:col-span-5">
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Produto A (Item em falta) *</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ex: ROSUVASTATINA 20MG C/ 30 TORRENT"
                  value={compTextoA}
                  onChange={(e) => setCompTextoA(e.target.value)}
                  className={`flex-1 px-3 py-2 text-xs rounded-lg border focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                    theme === 'dark' ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
                <select
                  value={compCatA}
                  onChange={(e) => setCompCatA(Number(e.target.value))}
                  className={`px-2 py-2 text-xs rounded-lg border ${
                    theme === 'dark' ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  <option value={7}>Genérico</option>
                  <option value={2}>Similar</option>
                  <option value={1}>Referência</option>
                  <option value={6}>Outros</option>
                </select>
              </div>
            </div>

            <div className="lg:col-span-5">
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">Produto B (Opcional: comparar diretamente)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ex: ROSUVASTATINA 20MG 30CPR PHARLAB"
                  value={compTextoB}
                  onChange={(e) => setCompTextoB(e.target.value)}
                  className={`flex-1 px-3 py-2 text-xs rounded-lg border focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                    theme === 'dark' ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
                <select
                  value={compCatB}
                  onChange={(e) => setCompCatB(Number(e.target.value))}
                  className={`px-2 py-2 text-xs rounded-lg border ${
                    theme === 'dark' ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  <option value={7}>Genérico</option>
                  <option value={2}>Similar</option>
                  <option value={1}>Referência</option>
                  <option value={6}>Outros</option>
                </select>
              </div>
            </div>

            <div className="lg:col-span-2">
              <button
                type="submit"
                disabled={compLoading}
                className="w-full px-4 py-2 text-xs font-bold rounded-lg bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50"
              >
                {compLoading ? 'Analisando...' : 'Analisar Motor'}
              </button>
            </div>
          </form>

          {compResultado && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 space-y-1.5">
                <div className="font-bold text-slate-700 dark:text-slate-200">Atributos Extraídos (Produto A)</div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span>Medicamento: <strong>{compResultado.atributos?.isMedicamento ? 'Sim' : 'Não'}</strong></span>
                  <span>Princípio: <strong>{compResultado.atributos?.principio || '-'}</strong></span>
                  <span>Dosagem: <strong>{compResultado.atributos?.dosagem || '-'}</strong></span>
                  <span>Embalagem: <strong>{compResultado.atributos?.unidadesChave || '-'}</strong></span>
                  <span>Forma: <strong>{compResultado.atributos?.forma || '-'}</strong></span>
                  {compResultado.atributos?.modificador && (
                    <span>Modificador: <strong className="text-amber-600">{compResultado.atributos.modificador}</strong></span>
                  )}
                </div>
                {compResultado.atributos?.chave && (
                  <div className="text-[11px] font-mono text-slate-500 break-all">
                    Chave: {compResultado.atributos.chave}
                  </div>
                )}
                {compResultado.comparacaoB && (
                  <div className={`mt-2 p-2 rounded font-semibold ${
                    compResultado.comparacaoB.podeCobrirFalta
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
                  }`}>
                    Comparação A vs B: {compResultado.comparacaoB.podeCobrirFalta
                      ? '✅ Produto B é equivalente e pode cobrir a falta de A'
                      : compResultado.comparacaoB.equivalentesNaChave
                        ? '⚠️ Mesma molécula/apresentação, mas regra Referência impede cobertura automática'
                        : '❌ Produtos NÃO são equivalentes'}
                  </div>
                )}
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 dark:text-slate-200">Veredito no Estoque da Loja</span>
                  {compResultado.cobertura?.coberto ? (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">
                      ✅ Coberto ({compResultado.cobertura.saldoGrupo} un)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700">
                      🚨 Em Falta ({compResultado.cobertura?.saldoGrupo || 0} un)
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">{compResultado.cobertura?.motivo}</p>
                {compResultado.cobertura?.equivalentesComEstoque?.length > 0 && (
                  <div className="space-y-1 max-h-28 overflow-y-auto pt-1">
                    {compResultado.cobertura.equivalentesComEstoque.map((eq: any) => (
                      <div key={eq.produtoId} className="flex items-center justify-between text-[11px] bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-700">
                        <span className="truncate pr-2">{eq.descricao}</span>
                        <span className="font-bold text-emerald-600 whitespace-nowrap">{eq.saldo} un</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

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
                            <th className="py-2 font-medium whitespace-nowrap">Produto no Digifarma</th>
                            <th className="py-2 font-medium whitespace-nowrap">EAN</th>
                            <th className="py-2 font-medium text-right whitespace-nowrap">Saldo em Estoque</th>
                            <th className="py-2 font-medium text-right whitespace-nowrap">Última Compra</th>
                            <th className="py-2 font-medium text-center whitespace-nowrap">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {grupo.produtos.map((p) => (
                            <tr key={p.produto_id} className="hover:bg-slate-100/50 dark:hover:bg-slate-800/40">
                              <td className="py-2.5 pr-3">
                                <div className="font-semibold text-slate-800 dark:text-slate-200">{p.descricao}</div>
                                <div className="text-[11px] text-slate-400 inline-flex items-center gap-1.5 flex-wrap">
                                  <span>ID: {p.produto_id}</span>
                                  {getCategoriaBadge(p.categoria_id)}
                                  {p.laboratorio ? <span>• Lab: {p.laboratorio}</span> : null}
                                </div>
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
                                  onClick={() => desvincularProduto(grupo.grupoId, p.produto_id, p.descricao)}
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

      {/* Modal: Auditoria de Faltas Cobertas por Equivalentes */}
      {auditoriaResultado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-2xl rounded-2xl shadow-2xl border p-6 space-y-4 ${bgCard}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className={`text-lg font-bold ${textTitle} flex items-center gap-2`}>
                  <ShieldCheck className="w-5 h-5 text-amber-500" />
                  Auditoria de Faltas com Equivalentes
                </h3>
                <p className={`text-xs ${textSub}`}>
                  Analisadas {auditoriaResultado.totalAnalisadas} falta(s) pendente(s) ({auditoriaResultado.firebirdConsultado ? 'saldos ao vivo do Digifarma' : 'cache local'}).
                </p>
              </div>
              <button onClick={() => setAuditoriaResultado(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
                <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Faltas Automáticas Cobertas</div>
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{auditoriaResultado.totalCobertasAuto}</div>
                <div className="text-[11px] text-emerald-600/80">Serão baixadas automaticamente</div>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">Faltas Manuais/WhatsApp c/ Equiv.</div>
                <div className="text-2xl font-black text-amber-600 dark:text-amber-400">{auditoriaResultado.totalCobertasManuais}</div>
                <div className="text-[11px] text-amber-600/80">Recebem badge de aviso (sem baixa)</div>
              </div>
            </div>

            {Array.isArray(auditoriaResultado.amostraCobertas) && auditoriaResultado.amostraCobertas.length > 0 ? (
              <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                    <tr className="text-slate-500 border-b border-slate-200 dark:border-slate-700">
                      <th className="px-3 py-2 font-semibold whitespace-nowrap">Produto em Falta</th>
                      <th className="px-3 py-2 font-semibold whitespace-nowrap">Origem</th>
                      <th className="px-3 py-2 font-semibold whitespace-nowrap">Equivalente em Estoque</th>
                      <th className="px-3 py-2 font-semibold text-right whitespace-nowrap">Saldo Grupo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {auditoriaResultado.amostraCobertas.slice(0, 40).map((item: any) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-200">{item.productName}</td>
                        <td className="px-3 py-2 text-[11px] text-slate-500">{item.source}</td>
                        <td className="px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-400">
                          {(item.equivalentes || []).map((e: any) => `${e.descricao} (${e.saldo})`).join(', ')}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-emerald-600">{item.saldoGrupo} un</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-500">
                Nenhuma falsa falta pendente com equivalente em estoque foi encontrada!
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setAuditoriaResultado(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Fechar
              </button>
              {(auditoriaResultado.totalCobertasAuto > 0 || auditoriaResultado.totalCobertasManuais > 0) && (
                <button
                  type="button"
                  disabled={baixandoFaltas}
                  onClick={confirmarBaixaFaltasEquivalentes}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {baixandoFaltas ? 'Aplicando...' : 'Confirmar Baixa Automática'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Revisão & Correção de Categorias no Digifarma */}
      {isModalCategoriasOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-5xl rounded-2xl shadow-2xl border p-6 space-y-4 ${bgCard}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className={`text-lg font-bold ${textTitle} flex items-center gap-2`}>
                  <Tag className="w-5 h-5 text-violet-500" />
                  Corrigir Categorias (OUTROS → Digifarma)
                </h3>
                <p className={`text-xs ${textSub}`}>
                  Revise itens cadastrados em OUTROS (6) e salve a categoria correta diretamente no Digifarma e no cache local.
                </p>
              </div>
              <button onClick={() => setIsModalCategoriasOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={catBusca}
                  onChange={(e) => setCatBusca(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') carregarRevisaoCategorias(catTipo, catApenasSaldo, catBusca);
                  }}
                  placeholder="Filtrar por nome, substância ou EAN..."
                  className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                    theme === 'dark' ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
              </div>

              <select
                value={catTipo}
                onChange={(e) => {
                  const v = e.target.value as 'SUGERIDOS' | 'PERFUMARIA' | 'MEDICAMENTOS' | 'TODOS';
                  setCatTipo(v);
                  carregarRevisaoCategorias(v, catApenasSaldo, catBusca);
                }}
                className={`px-2.5 py-1.5 text-xs rounded-lg border ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                }`}
              >
                <option value="SUGERIDOS">Todos com Sugestão</option>
                <option value="PERFUMARIA">Sugeridos p/ Perfumaria (5)</option>
                <option value="MEDICAMENTOS">Sugeridos p/ Medicamentos</option>
                <option value="TODOS">Todos em OUTROS (6)</option>
              </select>

              <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={catApenasSaldo}
                  onChange={(e) => {
                    setCatApenasSaldo(e.target.checked);
                    carregarRevisaoCategorias(catTipo, e.target.checked, catBusca);
                  }}
                  className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                />
                Apenas c/ saldo &gt; 0
              </label>

              <button
                type="button"
                onClick={() => carregarRevisaoCategorias(catTipo, catApenasSaldo, catBusca)}
                disabled={catLoading}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white"
              >
                {catLoading ? 'Buscando...' : 'Atualizar'}
              </button>
            </div>

            {catResumo && (
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300">
                  Analisados: <strong>{catResumo.totalAnalisados}</strong>
                </span>
                <span className="px-2.5 py-1 rounded-md bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300">
                  Sugeridos Perfumaria: <strong>{catResumo.sugeridosPerfumaria}</strong>
                </span>
                <span className="px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                  Sugeridos Medicamento: <strong>{catResumo.sugeridosMedicamento}</strong>
                </span>
              </div>
            )}

            <div className="max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl">
              {catLoading ? (
                <div className="p-8 text-center text-xs text-slate-500">Carregando itens em OUTROS...</div>
              ) : catItens.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">Nenhum produto encontrado para este filtro.</div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="px-3 py-2 w-8 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={catItens.length > 0 && catItens.every(it => catSelecionados[it.produtoId])}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            const next: Record<number, boolean> = {};
                            for (const it of catItens) next[it.produtoId] = checked;
                            setCatSelecionados(next);
                          }}
                        />
                      </th>
                      <th className="px-3 py-2 whitespace-nowrap">Produto</th>
                      <th className="px-3 py-2 text-right whitespace-nowrap">Saldo</th>
                      <th className="px-3 py-2 whitespace-nowrap">Motivo / Sugestão</th>
                      <th className="px-3 py-2 whitespace-nowrap">Nova Categoria (Digifarma)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {catItens.map((it) => (
                      <tr key={it.produtoId} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={Boolean(catSelecionados[it.produtoId])}
                            onChange={(e) => setCatSelecionados(prev => ({ ...prev, [it.produtoId]: e.target.checked }))}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className={`font-semibold ${textTitle}`}>{it.descricao}</div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                            <span>ID: {it.produtoId}</span>
                            {it.ean && <span>• EAN: {it.ean}</span>}
                            {it.substanciaNome && <span>• Subst.: {it.substanciaNome}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold whitespace-nowrap">{it.saldo}</td>
                        <td className="px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300">{it.motivoSugestao}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <select
                            value={catEdicoes[it.produtoId] ?? it.categoriaAtual}
                            onChange={(e) => {
                              const nova = Number(e.target.value);
                              setCatEdicoes(prev => ({ ...prev, [it.produtoId]: nova }));
                              setCatSelecionados(prev => ({ ...prev, [it.produtoId]: nova !== it.categoriaAtual }));
                            }}
                            className={`px-2 py-1 text-xs rounded border ${
                              theme === 'dark' ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                            }`}
                          >
                            <option value={6}>6 - OUTROS (atual)</option>
                            <option value={5}>5 - PERFUMARIAS</option>
                            <option value={7}>7 - GENERICOS</option>
                            <option value={2}>2 - SIMILAR</option>
                            <option value={1}>1 - REFERENCIA</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
              <span className="text-xs text-slate-500">
                Selecionados para atualizar:{' '}
                <strong>
                  {catItens.filter(it => catSelecionados[it.produtoId] && catEdicoes[it.produtoId] && catEdicoes[it.produtoId] !== it.categoriaAtual).length}
                </strong>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalCategoriasOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  disabled={catSalvando}
                  onClick={salvarCategoriasNoDigifarma}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {catSalvando ? 'Salvando no Digifarma...' : 'Salvar no Digifarma'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmação de Ação */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl border p-6 space-y-4 ${bgCard}`}>
            <div className="flex items-center justify-between">
              <h3 className={`text-base font-bold ${textTitle}`}>{confirmModal.title}</h3>
              <button onClick={() => setConfirmModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className={`text-xs ${textSub}`}>{confirmModal.message}</p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const fn = confirmModal.onConfirm;
                  setConfirmModal(null);
                  await fn();
                }}
                className={`px-4 py-2 text-xs font-semibold rounded-lg text-white ${
                  confirmModal.danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {confirmModal.confirmLabel || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
