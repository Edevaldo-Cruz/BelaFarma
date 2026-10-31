import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, 
  BookOpen, 
  AlertTriangle, 
  FileText, 
  Trash2, 
  Printer, 
  Search, 
  Filter, 
  Plus, 
  Calendar, 
  CheckCircle2, 
  X, 
  RefreshCw, 
  Stethoscope, 
  User, 
  Package, 
  Clock, 
  Eye, 
  Download,
  Building,
  HelpCircle
} from 'lucide-react';
import { useToast } from '../ToastContext';

interface SaleRecipe {
  id: string;
  sale_id: string;
  product_code: string;
  product_name: string;
  recipe_type: 'AMARELA' | 'AZUL' | 'BRANCA' | 'CREME';
  notification_number?: string;
  prescription_date: string;
  buyer_name: string;
  buyer_cpf?: string;
  buyer_rg?: string;
  buyer_rg_issuer?: string;
  buyer_address?: string;
  buyer_phone?: string;
  prescriber_council: string;
  prescriber_number: string;
  prescriber_uf: string;
  prescriber_name: string;
  patient_name?: string;
  batch_lot?: string;
  expiry_date?: string;
  quantity: number;
  created_at: string;
}

interface SanitaryLoss {
  id: string;
  product_code: string;
  product_name: string;
  batch_lot: string;
  expiry_date: string;
  quantity: number;
  loss_reason_code: number;
  loss_reason_label: string;
  loss_date: string;
  notes?: string;
  pharmacist_name: string;
  pharmacist_crf: string;
  document_protocol: string;
  status: string;
  created_at: string;
}

const MOTIVOS_ANVISA = [
  { code: 1, label: '1 - Prazo de validade expirado (Vencimento)' },
  { code: 2, label: '2 - Avaria física / Quebra acidental de frasco ou ampola' },
  { code: 3, label: '3 - Recolhimento pelo fabricante / Suspensão Anvisa' },
  { code: 4, label: '4 - Apreensão sanitária / Fiscalização oficial' },
  { code: 5, label: '5 - Desvio de qualidade ou suspeita de falsificação' },
  { code: 6, label: '6 - Perda no processo de fracionamento / Inutilização' }
];

export const ControlledMedicationsPortal: React.FC = () => {
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<'RECIPES' | 'LOSSES' | 'REGISTRIES'>('RECIPES');

  // helper data local YYYY-MM-DD
  const getTodayStr = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const getFirstDayOfMonthStr = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  };

  // Estados de Filtro para Livro de Receitas
  const [recipeStartDate, setRecipeStartDate] = useState(getFirstDayOfMonthStr());
  const [recipeEndDate, setRecipeEndDate] = useState(getTodayStr());
  const [recipeTypeFilter, setRecipeTypeFilter] = useState<'TODOS' | 'AMARELA' | 'AZUL' | 'BRANCA' | 'CREME'>('TODOS');
  const [recipeSearch, setRecipeSearch] = useState('');
  const [recipesList, setRecipesList] = useState<SaleRecipe[]>([]);
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(false);

  // Modal de Detalhe/Espelho da Receita Retida
  const [selectedRecipeDetail, setSelectedRecipeDetail] = useState<SaleRecipe | null>(null);

  // Estados para Perdas Sanitárias (SNGPC / VISA)
  const [lossesList, setLossesList] = useState<SanitaryLoss[]>([]);
  const [isLoadingLosses, setIsLoadingLosses] = useState(false);
  const [isLossModalOpen, setIsLossModalOpen] = useState(false);
  const [selectedLossForTermo, setSelectedLossForTermo] = useState<SanitaryLoss | null>(null);

  // Formulário de Registro de Perda Sanitária
  const [lossForm, setLossForm] = useState({
    product_code: '',
    product_name: '',
    batch_lot: '',
    expiry_date: '',
    quantity: 1,
    loss_reason_code: 1,
    loss_date: getTodayStr(),
    notes: '',
    pharmacist_name: 'Farmacêutico Responsável',
    pharmacist_crf: 'CRF-MG 00000'
  });
  const [isSavingLoss, setIsSavingLoss] = useState(false);

  // Autocomplete de produtos para perda sanitária
  const [productLossSearch, setProductLossSearch] = useState('');
  const [productsLossFound, setProductsLossFound] = useState<any[]>([]);
  const [isSearchingProductLoss, setIsSearchingProductLoss] = useState(false);

  // Estados de Prescritores e Compradores
  const [prescribersList, setPrescribersList] = useState<any[]>([]);
  const [buyersList, setBuyersList] = useState<any[]>([]);
  const [isLoadingRegistries, setIsLoadingRegistries] = useState(false);
  const [registrySearch, setRegistrySearch] = useState('');

  // 1. Carregar Livro de Receitas
  const fetchRecipes = async () => {
    setIsLoadingRecipes(true);
    try {
      const params = new URLSearchParams();
      if (recipeStartDate) params.append('startDate', recipeStartDate);
      if (recipeEndDate) params.append('endDate', recipeEndDate);
      if (recipeTypeFilter !== 'TODOS') params.append('recipeType', recipeTypeFilter);
      if (recipeSearch.trim()) params.append('q', recipeSearch.trim());

      const res = await fetch(`/api/erp/controlled/recipes?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setRecipesList(json.data || []);
      } else {
        addToast('Erro ao carregar livro de receitas.', 'error');
      }
    } catch (e) {
      addToast('Falha na comunicação com o servidor.', 'error');
    } finally {
      setIsLoadingRecipes(false);
    }
  };

  // 2. Carregar Perdas Sanitárias
  const fetchLosses = async () => {
    setIsLoadingLosses(true);
    try {
      const res = await fetch('/api/erp/controlled/losses');
      if (res.ok) {
        const json = await res.json();
        setLossesList(json.data || []);
      } else {
        addToast('Erro ao carregar perdas sanitárias.', 'error');
      }
    } catch (e) {
      addToast('Falha ao obter baixas sanitárias.', 'error');
    } finally {
      setIsLoadingLosses(false);
    }
  };

  // 3. Carregar Cadastros
  const fetchRegistries = async () => {
    setIsLoadingRegistries(true);
    try {
      const [pRes, bRes] = await Promise.all([
        fetch(`/api/erp/controlled/prescribers?q=${encodeURIComponent(registrySearch)}`),
        fetch(`/api/erp/controlled/buyers?q=${encodeURIComponent(registrySearch)}`)
      ]);
      if (pRes.ok) {
        const pJson = await pRes.json();
        setPrescribersList(pJson.data || []);
      }
      if (bRes.ok) {
        const bJson = await bRes.json();
        setBuyersList(bJson.data || []);
      }
    } catch (e) {
      addToast('Erro ao carregar cadastros.', 'error');
    } finally {
      setIsLoadingRegistries(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'RECIPES') fetchRecipes();
    else if (activeTab === 'LOSSES') fetchLosses();
    else if (activeTab === 'REGISTRIES') fetchRegistries();
  }, [activeTab, recipeStartDate, recipeEndDate, recipeTypeFilter]);

  // Buscar produtos para o modal de perda
  const searchProductForLoss = async (query: string) => {
    if (!query || query.length < 2) {
      setProductsLossFound([]);
      return;
    }
    setIsSearchingProductLoss(true);
    try {
      const res = await fetch(`/api/erp/products?q=${encodeURIComponent(query)}&limit=10`);
      if (res.ok) {
        const json = await res.json();
        setProductsLossFound(json.data || []);
      }
    } catch (e) {
    } finally {
      setIsSearchingProductLoss(false);
    }
  };

  // Salvar Registro de Perda Sanitária
  const handleSaveLoss = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lossForm.product_name.trim()) {
      addToast('Informe o nome do medicamento.', 'warning');
      return;
    }
    if (!lossForm.batch_lot.trim()) {
      addToast('Informe o número do lote do medicamento.', 'warning');
      return;
    }
    if (!lossForm.expiry_date.trim()) {
      addToast('Informe a data de validade do produto.', 'warning');
      return;
    }
    if (lossForm.quantity <= 0) {
      addToast('A quantidade deve ser maior que zero.', 'warning');
      return;
    }

    const selectedReason = MOTIVOS_ANVISA.find(m => m.code === Number(lossForm.loss_reason_code));
    const reasonLabel = selectedReason ? selectedReason.label : 'Outros';

    setIsSavingLoss(true);
    try {
      const payload = {
        ...lossForm,
        loss_reason_label: reasonLabel
      };

      const res = await fetch('/api/erp/controlled/losses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (res.ok && json.success) {
        addToast(`Perda sanitária registrada com sucesso! Protocolo #${json.data.document_protocol}`, 'success');
        setIsLossModalOpen(false);
        setLossForm({
          product_code: '',
          product_name: '',
          batch_lot: '',
          expiry_date: '',
          quantity: 1,
          loss_reason_code: 1,
          loss_date: getTodayStr(),
          notes: '',
          pharmacist_name: 'Farmacêutico Responsável',
          pharmacist_crf: 'CRF-MG 00000'
        });
        setProductLossSearch('');
        fetchLosses();
      } else {
        addToast(json.error || 'Erro ao registrar perda sanitária.', 'error');
      }
    } catch (e) {
      addToast('Falha ao comunicar com o servidor.', 'error');
    } finally {
      setIsSavingLoss(false);
    }
  };

  // Excluir Perda Sanitária
  const handleDeleteLoss = async (id: string, protocolo: string) => {
    if (!confirm(`Atenção: Deseja realmente excluir o registro de perda sanitária protocolo ${protocolo}? Esta ação só deve ser feita em caso de erro de digitação.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/erp/controlled/losses/${id}`, { method: 'DELETE' });
      if (res.ok) {
        addToast('Registro de perda excluído.', 'success');
        fetchLosses();
      }
    } catch (e) {
      addToast('Erro ao excluir registro.', 'error');
    }
  };

  // Sincronizar clientes do ERP para a base de compradores
  const handleSyncInitial = async () => {
    try {
      const res = await fetch('/api/erp/controlled/sync-initial', { method: 'POST' });
      const json = await res.json();
      if (res.ok && json.success) {
        addToast(`${json.synced_buyers} compradores sincronizados a partir dos clientes com CPF!`, 'success');
        fetchRegistries();
      }
    } catch (e) {
      addToast('Erro ao sincronizar cadastros.', 'error');
    }
  };

  // Impressão do Termo Oficial de Inutilização para a VISA
  const handlePrintTermoSanitario = (loss: SanitaryLoss) => {
    setSelectedLossForTermo(loss);
    setTimeout(() => {
      window.print();
    }, 200);
  };

  // Formatação de badge de tipo de receita
  const renderRecipeTypeBadge = (type: string) => {
    switch (type) {
      case 'AMARELA':
        return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-400 text-amber-950 border border-amber-500 shadow-xs">🟡 Receita Amarela (A)</span>;
      case 'AZUL':
        return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-blue-600 text-white border border-blue-700 shadow-xs">🔵 Receita Azul (B)</span>;
      case 'CREME':
        return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-200 text-amber-950 border border-amber-400 shadow-xs">🟠 Antimicrobiano (Creme)</span>;
      case 'BRANCA':
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-slate-700 text-white border border-slate-800 shadow-xs">⚪ Controle Especial (2 Vias)</span>;
    }
  };

  // Formatação de cor da linha conforme o tipo de receita
  const getRecipeRowClass = (type: string) => {
    switch (type) {
      case 'AMARELA':
        return 'bg-amber-100/70 hover:bg-amber-100/90 dark:bg-amber-950/40 dark:hover:bg-amber-950/60 border-l-4 border-amber-500 font-medium';
      case 'AZUL':
        return 'bg-blue-100/70 hover:bg-blue-100/90 dark:bg-blue-950/40 dark:hover:bg-blue-950/60 border-l-4 border-blue-500 font-medium';
      case 'CREME':
        return 'bg-amber-50/80 hover:bg-amber-100/60 dark:bg-amber-950/20 dark:hover:bg-amber-950/40 border-l-4 border-amber-400 font-medium';
      case 'BRANCA':
      default:
        return 'bg-slate-100/80 hover:bg-slate-200/80 dark:bg-slate-900/60 dark:hover:bg-slate-900/90 border-l-4 border-slate-600 font-medium';
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-3 sm:p-5 overflow-y-auto">
      
      {/* 1. CABEÇALHO DO MÓDULO SANITÁRIO */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                Controle Especial & SNGPC
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold border border-purple-500/20">
                  Vigilância Sanitária (VISA)
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Livro de Receitas Retidas (Portaria 344/98 e RDC 20/2011), Baixas Sanitárias Oficiais e Inutilização para a VISA
              </p>
            </div>
          </div>

          {/* Abas Superiores */}
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 text-xs font-bold">
            <button
              onClick={() => setActiveTab('RECIPES')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'RECIPES'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Livro de Receitas Retidas
            </button>

            <button
              onClick={() => setActiveTab('LOSSES')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'LOSSES'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              Perdas Sanitárias & VISA
            </button>

            <button
              onClick={() => setActiveTab('REGISTRIES')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'REGISTRIES'
                  ? 'bg-slate-900 text-white dark:bg-slate-700 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <User className="w-4 h-4" />
              Médicos & Compradores
            </button>
          </div>
        </div>
      </div>

      {/* 2. ABA 1: LIVRO DE RECEITAS RETIDAS */}
      {activeTab === 'RECIPES' && (
        <div className="flex flex-col gap-4 flex-1">
          {/* Barra de Filtros */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Período */}
              <div className="flex items-center gap-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700">
                <Calendar className="w-4 h-4 text-purple-500" />
                <span>De:</span>
                <input
                  type="date"
                  value={recipeStartDate}
                  onChange={e => setRecipeStartDate(e.target.value)}
                  className="bg-transparent font-mono focus:outline-none cursor-pointer"
                />
                <span>Até:</span>
                <input
                  type="date"
                  value={recipeEndDate}
                  onChange={e => setRecipeEndDate(e.target.value)}
                  className="bg-transparent font-mono focus:outline-none cursor-pointer"
                />
              </div>

              {/* Tipo de Receita */}
              <select
                value={recipeTypeFilter}
                onChange={e => setRecipeTypeFilter(e.target.value as any)}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="TODOS">Todas as Receitas</option>
                <option value="AMARELA">🟡 Notificação A (Amarela)</option>
                <option value="AZUL">🔵 Notificação B (Azul)</option>
                <option value="BRANCA">⚪ Controle Especial (Branca)</option>
                <option value="CREME">🟠 Antimicrobiano (Creme)</option>
              </select>

              {/* Busca por termo */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={recipeSearch}
                  onChange={e => setRecipeSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fetchRecipes()}
                  placeholder="Buscar por médico, comprador ou produto..."
                  className="pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white w-64 focus:outline-none focus:border-purple-500"
                />
              </div>

              <button
                onClick={fetchRecipes}
                disabled={isLoadingRecipes}
                className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRecipes ? 'animate-spin' : ''}`} />
                Filtrar
              </button>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
              Total de receitas retidas: <strong className="text-slate-900 dark:text-white">{recipesList.length}</strong>
            </div>
          </div>

          {/* Tabela de Receitas Retidas */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex-1">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-black uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3 whitespace-nowrap">Tipo de Receita</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Cupom / Data</th>
                    <th className="py-2.5 px-4 whitespace-nowrap">Medicamento</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-center">Lote / Validade</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-center">Qtd</th>
                    <th className="py-2.5 px-4 whitespace-nowrap">Médico Prescritor</th>
                    <th className="py-2.5 px-4 whitespace-nowrap">Comprador</th>
                    <th className="py-2.5 px-3 text-center whitespace-nowrap">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {isLoadingRecipes ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-500" />
                        Carregando livro sanitário de receitas...
                      </td>
                    </tr>
                  ) : recipesList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40 text-purple-500" />
                        <p className="font-semibold text-slate-600 dark:text-slate-300">
                          Nenhuma receita retida encontrada no período selecionado.
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Vendas com retenção de receita feitas no Belinha PDV aparecem automaticamente aqui.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    recipesList.map(r => (
                      <tr key={r.id} className={`${getRecipeRowClass(r.recipe_type)} transition-colors`}>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {renderRecipeTypeBadge(r.recipe_type)}
                          {r.notification_number && (
                            <p className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-400 mt-0.5">
                              Notif: {r.notification_number}
                            </p>
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap font-mono">
                          <p className="font-bold text-slate-900 dark:text-white">#{r.sale_id}</p>
                          <p className="text-[10px] text-slate-500">Receita: {r.prescription_date}</p>
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap font-bold text-slate-900 dark:text-white">
                          <p className="truncate max-w-[240px]" title={r.product_name}>{r.product_name}</p>
                          <p className="text-[10px] font-mono text-slate-400 font-normal">Cód: {r.product_code || 'S/N'}</p>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-center font-mono">
                          <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[10px] font-bold">
                            L: {r.batch_lot || 'S/N'}
                          </span>
                          <p className="text-[10px] text-slate-500 mt-0.5">Val: {r.expiry_date || 'S/N'}</p>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-center font-bold font-mono text-sm text-purple-700 dark:text-purple-400">
                          {r.quantity} un
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">
                          <p className="font-bold text-slate-900 dark:text-white">{r.prescriber_name}</p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {r.prescriber_council} {r.prescriber_number}/{r.prescriber_uf}
                          </p>
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">
                          <p className="font-bold text-slate-900 dark:text-white truncate max-w-[180px]">{r.buyer_name}</p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            CPF: {r.buyer_cpf || 'S/N'} • RG: {r.buyer_rg || 'S/N'}
                          </p>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-center">
                          <button
                            onClick={() => setSelectedRecipeDetail(r)}
                            className="p-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 transition-all shadow-xs"
                            title="Ver espelho da receita retida"
                          >
                            <Eye className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. ABA 2: PERDAS SANITÁRIAS & SNGPC (VISA) */}
      {activeTab === 'LOSSES' && (
        <div className="flex flex-col gap-4 flex-1">
          {/* Header Informativo da VISA */}
          <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-black text-rose-900 dark:text-rose-200 uppercase tracking-wide">
                  Registro Oficial de Perdas & Baixas Sanitárias (VISA / SNGPC)
                </h3>
                <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5 max-w-3xl">
                  Medicamentos sob controle especial e antimicrobianos vencidos, avariados ou recolhidos <strong>nunca devem ser descartados no lixo comum</strong>. O registro sanitário abaixo gera o Termo Oficial de Inutilização para conferência da autoridade sanitária e baixa legal no estoque do estabelecimento.
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsLossModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-md flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              Registrar Baixa Sanitária
            </button>
          </div>

          {/* Tabela de Baixas Sanitárias */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex-1">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-black uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3 whitespace-nowrap">Protocolo</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Data da Baixa</th>
                    <th className="py-2.5 px-4 whitespace-nowrap">Medicamento Controlado</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-center">Lote / Validade</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-center">Quantidade</th>
                    <th className="py-2.5 px-4 whitespace-nowrap">Motivo Sanitário (Anvisa)</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Farmacêutico RT</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-center">Status</th>
                    <th className="py-2.5 px-4 text-center whitespace-nowrap">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {isLoadingLosses ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-rose-500" />
                        Carregando registros de baixas sanitárias...
                      </td>
                    </tr>
                  ) : lossesList.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-40 text-rose-500" />
                        <p className="font-semibold text-slate-600 dark:text-slate-300">
                          Nenhuma perda ou baixa sanitária registrada no momento.
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Quando houver produto com validade expirada ou avaria, clique em "Registrar Baixa Sanitária".
                        </p>
                      </td>
                    </tr>
                  ) : (
                    lossesList.map(loss => (
                      <tr key={loss.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-rose-700 dark:text-rose-400 whitespace-nowrap">
                          {loss.document_protocol}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {loss.loss_date}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap font-bold text-slate-900 dark:text-white">
                          <p className="truncate max-w-[240px]" title={loss.product_name}>{loss.product_name}</p>
                          <p className="text-[10px] font-mono text-slate-400 font-normal">Cód: {loss.product_code || 'S/N'}</p>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-center font-mono">
                          <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[10px] font-bold">
                            L: {loss.batch_lot}
                          </span>
                          <p className="text-[10px] text-slate-500 mt-0.5">Val: {loss.expiry_date}</p>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-center font-bold font-mono text-rose-600 dark:text-rose-400 text-sm">
                          {loss.quantity} un
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">
                          <p className="font-bold text-slate-900 dark:text-white">{loss.loss_reason_label}</p>
                          {loss.notes && (
                            <p className="text-[10px] text-slate-500 truncate max-w-[220px]" title={loss.notes}>
                              Obs: {loss.notes}
                            </p>
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap font-medium text-slate-700 dark:text-slate-300">
                          <p className="font-bold text-xs">{loss.pharmacist_name}</p>
                          <p className="text-[10px] font-mono text-slate-400">{loss.pharmacist_crf}</p>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            {loss.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handlePrintTermoSanitario(loss)}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 text-xs font-bold transition-all shadow-xs flex items-center gap-1"
                              title="Gerar e imprimir o Termo Oficial de Inutilização / Descarte Sanitário para a Vigilância Sanitária"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              Termo VISA
                            </button>
                            <button
                              onClick={() => handleDeleteLoss(loss.id, loss.document_protocol)}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                              title="Excluir lançamento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. ABA 3: CADASTROS RÁPIDOS DE MÉDICOS & COMPRADORES */}
      {activeTab === 'REGISTRIES' && (
        <div className="flex flex-col gap-4 flex-1">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={registrySearch}
                  onChange={e => setRegistrySearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fetchRegistries()}
                  placeholder="Buscar médico ou comprador..."
                  className="pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white w-72 focus:outline-none"
                />
              </div>

              <button
                onClick={fetchRegistries}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition-all"
              >
                Buscar
              </button>
            </div>

            <button
              onClick={handleSyncInitial}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
              title="Importar clientes cadastrados no ERP com CPF diretamente para a base de compradores rápidos"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Sincronizar Clientes com CPF
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1">
            {/* Tabela Médicos Prescritores */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4 flex flex-col">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                <Stethoscope className="w-4 h-4 text-purple-600" />
                Médicos & Prescritores Cadastrados ({prescribersList.length})
              </h3>
              <div className="flex-1 overflow-y-auto max-h-[500px]">
                {prescribersList.length === 0 ? (
                  <p className="text-xs text-slate-400 py-8 text-center">Nenhum médico encontrado.</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {prescribersList.map((p, idx) => (
                      <div key={p.id || idx} className="py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{p.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {p.council_type || 'CRM'} {p.council_number} - {p.council_uf || 'MG'} {p.specialty && `• ${p.specialty}`}
                          </p>
                        </div>
                        {p.phone && <span className="text-[10px] font-mono text-slate-400">{p.phone}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Tabela Compradores */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4 flex flex-col">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                <User className="w-4 h-4 text-blue-600" />
                Compradores de Controlados Cadastrados ({buyersList.length})
              </h3>
              <div className="flex-1 overflow-y-auto max-h-[500px]">
                {buyersList.length === 0 ? (
                  <p className="text-xs text-slate-400 py-8 text-center">Nenhum comprador encontrado.</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {buyersList.map((b, idx) => (
                      <div key={b.id || idx} className="py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{b.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            CPF: {b.cpf || 'S/N'} • RG: {b.rg ? `${b.rg} (${b.rg_issuer || ''}-${b.rg_uf || ''})` : 'S/N'}
                          </p>
                          {b.address && <p className="text-[10px] text-slate-400 truncate max-w-sm">{b.address}</p>}
                        </div>
                        {b.phone && <span className="text-[10px] font-mono text-slate-400">{b.phone}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL: REGISTRAR PERDA / BAIXA SANITÁRIA (VISA) */}
      {isLossModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full p-6 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Registrar Baixa / Perda Sanitária (SNGPC & VISA)
                </h3>
              </div>
              <button 
                onClick={() => setIsLossModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLoss} className="space-y-4">
              {/* Seleção / Busca de Medicamento */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Medicamento Sujeito a Controle Especial *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={lossForm.product_name}
                    onChange={e => {
                      setLossForm(prev => ({ ...prev, product_name: e.target.value }));
                      searchProductForLoss(e.target.value);
                    }}
                    placeholder="Digite o nome do medicamento controlado..."
                    required
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                  />
                  {isSearchingProductLoss && (
                    <RefreshCw className="w-4 h-4 animate-spin absolute right-3 top-3 text-slate-400" />
                  )}
                </div>

                {/* Dropdown de sugestão */}
                {productsLossFound.length > 0 && (
                  <div className="mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
                    {productsLossFound.map(p => (
                      <button
                        type="button"
                        key={p.code}
                        onClick={() => {
                          setLossForm(prev => ({
                            ...prev,
                            product_code: p.code,
                            product_name: p.name
                          }));
                          setProductsLossFound([]);
                        }}
                        className="w-full text-left p-2.5 hover:bg-slate-100 dark:hover:bg-slate-700/60 text-xs flex items-center justify-between"
                      >
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{p.name}</p>
                          <p className="font-mono text-[10px] text-slate-400">EAN: {p.barcode || p.code} • Estoque: {p.stock_qty} un</p>
                        </div>
                        {p.recipe_type && renderRecipeTypeBadge(p.recipe_type)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Lote, Validade e Quantidade */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Número do Lote *
                  </label>
                  <input
                    type="text"
                    value={lossForm.batch_lot}
                    onChange={e => setLossForm(prev => ({ ...prev, batch_lot: e.target.value.toUpperCase() }))}
                    placeholder="Ex: ABC1234"
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Data de Validade *
                  </label>
                  <input
                    type="date"
                    value={lossForm.expiry_date}
                    onChange={e => setLossForm(prev => ({ ...prev, expiry_date: e.target.value }))}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Quantidade Inutilizada *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={lossForm.quantity}
                    onChange={e => setLossForm(prev => ({ ...prev, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none text-center"
                  />
                </div>
              </div>

              {/* Motivo Sanitário Oficial da Anvisa */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Motivo da Perda Sanitária (Padrão Oficial SNGPC / Anvisa) *
                </label>
                <select
                  value={lossForm.loss_reason_code}
                  onChange={e => setLossForm(prev => ({ ...prev, loss_reason_code: parseInt(e.target.value, 10) }))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none"
                >
                  {MOTIVOS_ANVISA.map(m => (
                    <option key={m.code} value={m.code}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Responsável Técnico (Farmacêutico) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Farmacêutico(a) RT *
                  </label>
                  <input
                    type="text"
                    value={lossForm.pharmacist_name}
                    onChange={e => setLossForm(prev => ({ ...prev, pharmacist_name: e.target.value }))}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    CRF do RT *
                  </label>
                  <input
                    type="text"
                    value={lossForm.pharmacist_crf}
                    onChange={e => setLossForm(prev => ({ ...prev, pharmacist_crf: e.target.value }))}
                    placeholder="Ex: CRF-MG 12345"
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Justificativa / Observações */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Justificativa Técnica / Laudo de Inutilização
                </label>
                <textarea
                  value={lossForm.notes}
                  onChange={e => setLossForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  placeholder="Descreva o estado físico, lacre rompido, lote vencido ou circunstância do descarte..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsLossModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSavingLoss}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-md transition-all"
                >
                  {isSavingLoss ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirmar Registro Sanitário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL: DETALHE / ESPELHO DA RECEITA RETIDA */}
      {selectedRecipeDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-xl w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-600" />
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Espelho da Receita Retida • Cupom #{selectedRecipeDetail.sale_id}
                </h3>
              </div>
              <button
                onClick={() => setSelectedRecipeDetail(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Tipo e Notificação */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Classificação Sanitária</p>
                  <div className="mt-1">{renderRecipeTypeBadge(selectedRecipeDetail.recipe_type)}</div>
                </div>
                {selectedRecipeDetail.notification_number && (
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Número da Notificação</p>
                    <p className="font-mono font-bold text-slate-900 dark:text-white text-sm">{selectedRecipeDetail.notification_number}</p>
                  </div>
                )}
              </div>

              {/* Medicamento e Lote */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Medicamento Dispensado</p>
                <p className="text-sm font-black text-slate-900 dark:text-white">{selectedRecipeDetail.product_name}</p>
                <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 font-mono text-[11px]">
                  <div><span className="text-slate-400">Qtd:</span> <strong>{selectedRecipeDetail.quantity} un</strong></div>
                  <div><span className="text-slate-400">Lote:</span> <strong>{selectedRecipeDetail.batch_lot || 'S/N'}</strong></div>
                  <div><span className="text-slate-400">Validade:</span> <strong>{selectedRecipeDetail.expiry_date || 'S/N'}</strong></div>
                </div>
              </div>

              {/* Prescritor */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Médico Prescritor</p>
                <p className="font-bold text-slate-900 dark:text-white">{selectedRecipeDetail.prescriber_name}</p>
                <p className="font-mono text-slate-500">
                  {selectedRecipeDetail.prescriber_council} {selectedRecipeDetail.prescriber_number} - {selectedRecipeDetail.prescriber_uf} • Prescrição em: {selectedRecipeDetail.prescription_date}
                </p>
              </div>

              {/* Comprador & Paciente */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Comprador e Paciente</p>
                <p className="font-bold text-slate-900 dark:text-white">{selectedRecipeDetail.buyer_name}</p>
                <p className="font-mono text-slate-500">
                  CPF: {selectedRecipeDetail.buyer_cpf || 'S/N'} • RG: {selectedRecipeDetail.buyer_rg ? `${selectedRecipeDetail.buyer_rg} (${selectedRecipeDetail.buyer_rg_issuer || ''})` : 'S/N'}
                </p>
                {selectedRecipeDetail.buyer_address && (
                  <p className="text-[10px] text-slate-400 mt-1">Endereço: {selectedRecipeDetail.buyer_address}</p>
                )}
                {selectedRecipeDetail.patient_name && (
                  <p className="text-[10px] text-purple-600 font-bold mt-1">Paciente: {selectedRecipeDetail.patient_name}</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setSelectedRecipeDetail(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. TERMO OFICIAL IMPRESSO PARA A VISA (Renderizado apenas na impressão via print:block) */}
      {selectedLossForTermo && (
        <div className="hidden print:block fixed inset-0 bg-white text-black p-8 font-serif z-[9999]">
          <div className="text-center border-b-2 border-black pb-4 mb-6">
            <h1 className="text-xl font-bold uppercase tracking-wider">DROGARIA BELA FARMA</h1>
            <p className="text-sm">CNPJ: 00.000.000/0001-00 • INSCRIÇÃO ESTADUAL: 000.000.000.0000</p>
            <p className="text-xs">AUTORIZAÇÃO DE FUNCIONAMENTO ANVISA (AFE): 1.23456.7 • LICENÇA SANITÁRIA VISA</p>
            <h2 className="text-base font-bold uppercase mt-4 underline">
              TERMO OFICIAL DE INUTILIZAÇÃO / DESCARTE DE MEDICAMENTOS SOB CONTROLE ESPECIAL
            </h2>
            <p className="text-xs italic mt-1">
              (Lavrado em conformidade com a Portaria SVS/MS nº 344/1998 e Resolução RDC Anvisa nº 20/2011)
            </p>
          </div>

          <div className="space-y-4 text-sm leading-relaxed">
            <p>
              Aos <strong>{selectedLossForTermo.loss_date.split('-').reverse().join('/')}</strong>, neste estabelecimento farmacêutico, na presença do(a) Farmacêutico(a) Responsável Técnico(a) abaixo assinado(a), foi procedida a conferência, segregação e registro de inutilização sanitária sob o protocolo oficial <strong>#{selectedLossForTermo.document_protocol}</strong> do medicamento sob controle especial discriminado a seguir:
            </p>

            <table className="w-full border-collapse border border-black text-xs my-4">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-black p-2 text-left">DESCRIÇÃO DO MEDICAMENTO</th>
                  <th className="border border-black p-2 text-center">LOTE</th>
                  <th className="border border-black p-2 text-center">VALIDADE</th>
                  <th className="border border-black p-2 text-center">QUANTIDADE</th>
                  <th className="border border-black p-2 text-left">MOTIVO DA PERDA (ANVISA)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-black p-2 font-bold">{selectedLossForTermo.product_name}</td>
                  <td className="border border-black p-2 text-center">{selectedLossForTermo.batch_lot}</td>
                  <td className="border border-black p-2 text-center">{selectedLossForTermo.expiry_date}</td>
                  <td className="border border-black p-2 text-center font-bold">{selectedLossForTermo.quantity} un</td>
                  <td className="border border-black p-2">{selectedLossForTermo.loss_reason_label}</td>
                </tr>
              </tbody>
            </table>

            {selectedLossForTermo.notes && (
              <p className="text-xs">
                <strong>Observações Técnicas / Laudo:</strong> {selectedLossForTermo.notes}
              </p>
            )}

            <p className="text-xs pt-2">
              Declaro sob as penas da lei que o produto acima foi devidamente segregado na área de quarentena sanitária, não sendo passível de comercialização ou consumo, ficando à disposição para incineração ou recolhimento pela empresa de descarte credenciada, com a devida emissão de Manifesto de Transporte de Resíduos (MTR).
            </p>

            <div className="grid grid-cols-3 gap-6 pt-16 text-center text-xs">
              <div className="border-t border-black pt-2">
                <p className="font-bold">{selectedLossForTermo.pharmacist_name}</p>
                <p>{selectedLossForTermo.pharmacist_crf}</p>
                <p className="text-[10px] text-gray-600">Farmacêutico(a) Responsável Técnico(a)</p>
              </div>

              <div className="border-t border-black pt-2">
                <p className="font-bold">Representante Legal</p>
                <p>Drogaria Bela Farma</p>
                <p className="text-[10px] text-gray-600">Direção do Estabelecimento</p>
              </div>

              <div className="border-t border-black pt-2">
                <p className="font-bold">Autoridade Sanitária</p>
                <p>Vigilância Sanitária Municipal / VISA</p>
                <p className="text-[10px] text-gray-600">Fiscal Sanitário (Visto / Homologação)</p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};