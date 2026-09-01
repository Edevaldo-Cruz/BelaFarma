import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Building2, 
  Phone, 
  Clock, 
  DollarSign, 
  Layers, 
  Award, 
  AlertTriangle, 
  Search, 
  PlusCircle, 
  Edit3, 
  BookOpen, 
  RefreshCw, 
  ShieldCheck, 
  ExternalLink,
  X,
  CheckCircle2
} from 'lucide-react';
import { FornecedorMeta, User } from '../../types';
import { useToast } from '../ToastContext';

interface ComprasRepresentantesProps {
  user: User;
  theme: 'light' | 'dark';
}

export const ComprasRepresentantes: React.FC<ComprasRepresentantesProps> = ({
  user,
  theme
}) => {
  const { addToast } = useToast();
  const [fornecedores, setFornecedores] = useState<FornecedorMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [saving, setSaving] = useState(false);

  // Modal: Cadastro / Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFornecedor, setEditingFornecedor] = useState<FornecedorMeta | null>(null);
  const [formFornecedor, setFormFornecedor] = useState({
    distribuidora: '',
    representante: '',
    telefone: '',
    prazosHabituais: '28/35/42 dias',
    pedidoMinimo: 500,
    categorias: 'Genéricos, Similares, OTC',
    scorePontualidade: 85,
    taxaQuebraPercent: 0,
    observacoes: ''
  });

  // Modal: Catálogo Histórico
  const [isCatalogoModalOpen, setIsCatalogoModalOpen] = useState(false);
  const [catalogoData, setCatalogoData] = useState<{ fornecedor: string; itens: any[] }>({ fornecedor: '', itens: [] });
  const [loadingCatalogo, setLoadingCatalogo] = useState(false);

  const carregarFornecedores = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/central-compras/fornecedores');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setFornecedores(data.data);
        }
      }
    } catch (err: any) {
      addToast('Erro ao carregar fornecedores: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarFornecedores();
  }, []);

  const fornecedoresFiltrados = useMemo(() => {
    return fornecedores.filter(f => {
      if (!busca) return true;
      const b = busca.toLowerCase();
      return (
        f.distribuidora?.toLowerCase().includes(b) ||
        f.representante?.toLowerCase().includes(b) ||
        f.telefone?.includes(b) ||
        f.categoriasAtendidas?.some(c => c.toLowerCase().includes(b))
      );
    });
  }, [fornecedores, busca]);

  const handleOpenNovo = () => {
    setEditingFornecedor(null);
    setFormFornecedor({
      distribuidora: '',
      representante: '',
      telefone: '',
      prazosHabituais: '28/35/42 dias',
      pedidoMinimo: 500,
      categorias: 'Genéricos, Similares, OTC',
      scorePontualidade: 85,
      taxaQuebraPercent: 0,
      observacoes: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEditar = (f: FornecedorMeta) => {
    setEditingFornecedor(f);
    setFormFornecedor({
      distribuidora: f.distribuidora || '',
      representante: f.representante || '',
      telefone: f.telefone || '',
      prazosHabituais: Array.isArray(f.prazosHabituais) ? f.prazosHabituais.join(', ') : (f.prazosHabituais || '28/35/42 dias'),
      pedidoMinimo: f.pedidoMinimo || 0,
      categorias: Array.isArray(f.categoriasAtendidas) ? f.categoriasAtendidas.join(', ') : (f.categoriasAtendidas || 'Genéricos'),
      scorePontualidade: f.scorePontualidade ?? 85,
      taxaQuebraPercent: f.taxaQuebraPercent ?? 0,
      observacoes: f.observacoes || ''
    });
    setIsModalOpen(true);
  };

  const handleSalvarFornecedor = async () => {
    if (!formFornecedor.distribuidora.trim() && !formFornecedor.representante.trim()) {
      addToast('Distribuidora ou Representante é obrigatório.', 'warning');
      return;
    }

    try {
      setSaving(true);
      const url = editingFornecedor 
        ? `/api/central-compras/fornecedores/${editingFornecedor.id}`
        : '/api/central-compras/fornecedores';
      const method = editingFornecedor ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distribuidora: formFornecedor.distribuidora,
          representante: formFornecedor.representante,
          telefone: formFornecedor.telefone,
          prazos: formFornecedor.prazosHabituais.split(',').map(p => p.trim()).filter(Boolean),
          pedidoMinimo: formFornecedor.pedidoMinimo,
          categorias: formFornecedor.categorias.split(',').map(c => c.trim()).filter(Boolean),
          scorePontualidade: formFornecedor.scorePontualidade,
          taxaQuebraPercent: formFornecedor.taxaQuebraPercent,
          observacoes: formFornecedor.observacoes
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addToast(editingFornecedor ? '✅ Representante atualizado com sucesso!' : '✅ Representante cadastrado com sucesso!', 'success');
        setIsModalOpen(false);
        carregarFornecedores();
      } else {
        addToast('Erro ao salvar representante: ' + (data.error || 'Falha no servidor'), 'error');
      }
    } catch (err: any) {
      addToast('Falha na comunicação: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleVerCatalogo = async (f: FornecedorMeta) => {
    try {
      setLoadingCatalogo(true);
      setCatalogoData({ fornecedor: `${f.distribuidora} (${f.representante})`, itens: [] });
      setIsCatalogoModalOpen(true);

      const res = await fetch(`/api/central-compras/fornecedores/${f.id}/catalogo`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data?.catalogo)) {
          setCatalogoData({
            fornecedor: `${f.distribuidora} (${f.representante})`,
            itens: data.data.catalogo
          });
        }
      }
    } catch (err: any) {
      addToast('Erro ao carregar catálogo: ' + err.message, 'error');
    } finally {
      setLoadingCatalogo(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Topo com Busca e Novo Representante */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar representante por nome, distribuidora, telefone ou categorias..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={carregarFornecedores}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleOpenNovo}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider shadow-md transition-all cursor-pointer active:scale-95"
          >
            <PlusCircle className="w-4 h-4" />
            Cadastrar Representante
          </button>
        </div>
      </div>

      {/* Grid de Cards de Fornecedores */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 font-bold bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-red-600" />
          Carregando base de representantes e distribuidoras...
        </div>
      ) : fornecedoresFiltrados.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <Users className="w-10 h-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
          <p className="font-bold text-slate-700 dark:text-slate-300">Nenhum representante encontrado</p>
          <p className="text-xs text-slate-400 mt-1">Varra o histórico de conversas do WhatsApp ou cadastre novos contatos manualmente.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {fornecedoresFiltrados.map(f => (
            <div
              key={f.id}
              className="p-5 rounded-2xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:shadow-md transition-all space-y-4"
            >
              <div className="space-y-3">
                {/* Header do Card */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight block">
                      {f.distribuidora || 'Distribuidora Não Informada'}
                    </span>
                    <span className="text-sm font-black text-red-600 dark:text-red-400 block mt-0.5">
                      {f.representante || 'Representante'}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-400 block">Pontualidade:</span>
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                      {f.scorePontualidade ?? 85} pts
                    </span>
                  </div>
                </div>

                {/* Telefone e Contato */}
                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 font-mono">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>{f.telefone || 'Sem telefone'}</span>
                </div>

                {/* Prazos e Pedido Mínimo */}
                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 block">Prazos Habituais:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {Array.isArray(f.prazosHabituais || f.prazosPagamento)
                        ? (f.prazosHabituais || f.prazosPagamento).join('/')
                        : (f.prazosHabituais || f.prazosPagamento || '28d')}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 block">Pedido Mínimo:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {(f.pedidoMinimo || f.pedidoMinimoValor) ? `R$ ${((f.pedidoMinimo ?? f.pedidoMinimoValor) as number).toFixed(2)}` : 'Sem mínimo'}
                    </span>
                  </div>
                </div>

                {/* Categorias Atendidas */}
                {(f.categoriasAtendidas || f.categorias) && (f.categoriasAtendidas || f.categorias).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(f.categoriasAtendidas || f.categorias).map((cat: string, idx: number) => (
                      <span key={idx} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold">
                        {cat}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Ações do Card */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleVerCatalogo(f)}
                  className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Ver Catálogo
                </button>

                <button
                  onClick={() => handleOpenEditar(f)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Cadastro / Edição de Representante */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg p-6 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              {editingFornecedor ? 'Editar Representante / Distribuidora' : 'Cadastrar Novo Representante'}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nome da Distribuidora / Laboratório
                </label>
                <input
                  type="text"
                  placeholder="Ex: Santa Cruz, Profarma, GAM..."
                  value={formFornecedor.distribuidora}
                  onChange={(e) => setFormFornecedor(p => ({ ...p, distribuidora: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Representante Comercial
                </label>
                <input
                  type="text"
                  placeholder="Nome do vendedor"
                  value={formFornecedor.representante}
                  onChange={(e) => setFormFornecedor(p => ({ ...p, representante: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Telefone WhatsApp Comercial
                </label>
                <input
                  type="text"
                  placeholder="Ex: 553299999999"
                  value={formFornecedor.telefone}
                  onChange={(e) => setFormFornecedor(p => ({ ...p, telefone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Prazos Habituais
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 28/35/42 dias"
                    value={formFornecedor.prazosHabituais}
                    onChange={(e) => setFormFornecedor(p => ({ ...p, prazosHabituais: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Pedido Mínimo (R$)
                  </label>
                  <input
                    type="number"
                    value={formFornecedor.pedidoMinimo}
                    onChange={(e) => setFormFornecedor(p => ({ ...p, pedidoMinimo: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Categorias / Linhas Atendidas (separadas por vírgula)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Genéricos, Similares, Perfumaria, OTC"
                  value={formFornecedor.categorias}
                  onChange={(e) => setFormFornecedor(p => ({ ...p, categorias: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Score Pontualidade (0-100)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formFornecedor.scorePontualidade}
                    onChange={(e) => setFormFornecedor(p => ({ ...p, scorePontualidade: parseInt(e.target.value, 10) || 85 }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Taxa de Quebra (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formFornecedor.taxaQuebraPercent}
                    onChange={(e) => setFormFornecedor(p => ({ ...p, taxaQuebraPercent: parseInt(e.target.value, 10) || 0 }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black uppercase text-slate-600 dark:text-slate-400"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvarFornecedor}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Salvar Fornecedor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Catálogo Histórico do Representante */}
      {isCatalogoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg p-6 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Catálogo & Histórico Fornecido
                </h3>
                <p className="text-xs text-slate-400 font-bold">
                  {catalogoData.fornecedor}
                </p>
              </div>
              <button onClick={() => setIsCatalogoModalOpen(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingCatalogo ? (
              <div className="py-8 text-center text-slate-400 font-bold">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-red-600" />
                Carregando catálogo...
              </div>
            ) : catalogoData.itens.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                Nenhum produto indexado ainda para este representante.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto">
                {catalogoData.itens.map((it, idx) => (
                  <div key={idx} className="py-2 flex justify-between items-center text-xs">
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">{it.produtoNome || it.descricao}</span>
                      <span className="text-[10px] text-slate-400">{it.ean ? `EAN: ${it.ean}` : ''}</span>
                    </div>
                    {it.ultimoPreco && (
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                        R$ {Number(it.ultimoPreco).toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsCatalogoModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black uppercase"
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
