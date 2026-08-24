import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calculator,
  Search,
  Sparkles,
  DollarSign,
  TrendingUp,
  Percent,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  Trash2,
  Sliders,
  Store,
  Info,
  ShieldCheck,
  Building,
  UserCheck,
  PiggyBank,
  Check,
  X,
  Lock,
  ArrowUpRight,
  TrendingDown
} from 'lucide-react';
import { User, UserRole } from '../types';
import { useToast } from './ToastContext';
import {
  PricingInputs,
  PricingResult,
  CategoryPreset,
  DEFAULT_PRESETS,
  calculatePricing,
  diagnoseCurrentPrice,
  roundMoney
} from '../utils/pricingEngine';

interface PricingSimulatorProps {
  user?: User | null;
}

interface DigifarmaSearchProduct {
  PRODUTO_ID: number;
  PRODUTO: string;
  APRESENTACAO?: string;
  COD_BARRAS?: string;
  PROD_PRVENDA: number;
  PROD_PRPROMOCAO?: number;
  PROD_PRCOMPRA?: number;
  ESTOQUE?: number;
  CATEGORIA?: string;
}

const PRESETS_STORAGE_KEY = 'belafarma_pricing_presets_v1';

export const PricingSimulator: React.FC<PricingSimulatorProps> = ({ user }) => {
  const { addToast } = useToast();

  // Presets customizados + padrão
  const [presets, setPresets] = useState<CategoryPreset[]>(() => {
    try {
      const saved = localStorage.getItem(PRESETS_STORAGE_KEY);
      if (saved) {
        const customPresets: CategoryPreset[] = JSON.parse(saved);
        return [...DEFAULT_PRESETS, ...customPresets];
      }
    } catch (e) {
      console.error('Erro ao carregar presets customizados:', e);
    }
    return DEFAULT_PRESETS;
  });

  const [activePresetId, setActivePresetId] = useState<string>('genericos');

  // Estado dos Inputs do Simulador
  const [productName, setProductName] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<DigifarmaSearchProduct | null>(null);
  const [currentStorePrice, setCurrentStorePrice] = useState<string>('');
  
  const [inputs, setInputs] = useState<PricingInputs>({
    cmv: 10.0,
    impostoPercent: 4.0,
    taxaCartaoPercent: 2.5,
    custosVariaveisPercent: 1.0,
    custoFixoPercent: 28.77,
    proLaboreSocio1Percent: 6.0,
    proLaboreSocio2Percent: 6.0,
    margemLiquidaPercent: 15.0
  });

  // Busca de Produtos no Digifarma
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchResults, setSearchResults] = useState<DigifarmaSearchProduct[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Modal para salvar Preset Customizado
  const [isPresetModalOpen, setIsPresetModalOpen] = useState<boolean>(false);
  const [newPresetName, setNewPresetName] = useState<string>('');
  const [newPresetDesc, setNewPresetDesc] = useState<string>('');

  // Modal para aplicar preço no Digifarma
  const [isApplyModalOpen, setIsApplyModalOpen] = useState<boolean>(false);
  const [isApplyingPrice, setIsApplyingPrice] = useState<boolean>(false);

  // Fechar dropdown de busca ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Busca debounced de produtos no backend / Digifarma
  useEffect(() => {
    if (!searchTerm.trim() || searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/search-medications?q=${encodeURIComponent(searchTerm)}&limit=8`);
        if (res.ok) {
          const data = await res.json();
          // Mapeia os dados do endpoint de busca
          const items: DigifarmaSearchProduct[] = (data || []).map((p: any) => ({
            PRODUTO_ID: p.PRODUTO_ID || p.id,
            PRODUTO: p.PRODUTO || p.name || p.descricao,
            APRESENTACAO: p.APRESENTACAO || p.presentation || '',
            COD_BARRAS: p.COD_BARRAS || p.barcode || '',
            PROD_PRVENDA: Number(p.PROD_PRVENDA || p.price || 0),
            PROD_PRPROMOCAO: Number(p.PROD_PRPROMOCAO || p.promo_price || 0),
            PROD_PRCOMPRA: Number(p.PROD_PRCOMPRA || p.cost_price || p.custo || 0),
            ESTOQUE: Number(p.ESTOQUE || p.stock || 0),
            CATEGORIA: p.CATEGORIA || p.category || ''
          }));
          setSearchResults(items);
          setShowDropdown(true);
        }
      } catch (err) {
        console.error('Erro ao buscar produtos:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Aplicar Preset de Categoria
  const handleSelectPreset = (preset: CategoryPreset) => {
    setActivePresetId(preset.id);
    setInputs(prev => ({
      ...prev,
      impostoPercent: preset.impostoPercent,
      taxaCartaoPercent: preset.taxaCartaoPercent,
      custosVariaveisPercent: preset.custosVariaveisPercent,
      custoFixoPercent: preset.custoFixoPercent,
      proLaboreSocio1Percent: preset.proLaboreSocio1Percent,
      proLaboreSocio2Percent: preset.proLaboreSocio2Percent,
      margemLiquidaPercent: preset.margemLiquidaPercent
    }));
    addToast(`Preset "${preset.nome}" aplicado com sucesso!`, 'info');
  };

  // Selecionar Produto da Busca
  const handleSelectProduct = (prod: DigifarmaSearchProduct) => {
    setSelectedProduct(prod);
    setProductName(prod.PRODUTO + (prod.APRESENTACAO ? ` - ${prod.APRESENTACAO}` : ''));
    setSearchTerm('');
    setShowDropdown(false);

    const custo = prod.PROD_PRCOMPRA && prod.PROD_PRCOMPRA > 0 ? prod.PROD_PRCOMPRA : inputs.cmv;
    const precoVendaReal = (prod.PROD_PRPROMOCAO && prod.PROD_PRPROMOCAO > 0) 
      ? prod.PROD_PRPROMOCAO 
      : prod.PROD_PRVENDA;

    setInputs(prev => ({ ...prev, cmv: roundMoney(custo) }));
    setCurrentStorePrice(precoVendaReal > 0 ? precoVendaReal.toFixed(2) : '');

    addToast(`Produto "${prod.PRODUTO}" carregado com custo de R$ ${custo.toFixed(2)}!`, 'success');
  };

  // Limpar Produto Selecionado (Modo Livre)
  const handleClearProduct = () => {
    setSelectedProduct(null);
    setProductName('');
    setCurrentStorePrice('');
    setSearchTerm('');
  };

  // Salvar Novo Preset Customizado
  const handleSaveCustomPreset = () => {
    if (!newPresetName.trim()) {
      addToast('Informe o nome do preset.', 'error');
      return;
    }

    const newPreset: CategoryPreset = {
      id: `custom_${Date.now()}`,
      nome: newPresetName.trim(),
      descricao: newPresetDesc.trim() || 'Preset personalizado de precificação.',
      icone: 'Sliders',
      impostoPercent: inputs.impostoPercent,
      taxaCartaoPercent: inputs.taxaCartaoPercent,
      custosVariaveisPercent: inputs.custosVariaveisPercent,
      custoFixoPercent: inputs.custoFixoPercent,
      proLaboreSocio1Percent: inputs.proLaboreSocio1Percent,
      proLaboreSocio2Percent: inputs.proLaboreSocio2Percent,
      margemLiquidaPercent: inputs.margemLiquidaPercent,
      isCustom: true
    };

    const updatedPresets = [...presets, newPreset];
    setPresets(updatedPresets);
    setActivePresetId(newPreset.id);

    // Salva apenas os customizados no localStorage
    const onlyCustom = updatedPresets.filter(p => p.isCustom);
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(onlyCustom));

    setIsPresetModalOpen(false);
    setNewPresetName('');
    setNewPresetDesc('');
    addToast('Preset customizado salvo com sucesso!', 'success');
  };

  // Excluir Preset Customizado
  const handleDeleteCustomPreset = (presetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = presets.filter(p => p.id !== presetId);
    setPresets(updated);
    if (activePresetId === presetId) {
      setActivePresetId('genericos');
    }
    const onlyCustom = updated.filter(p => p.isCustom);
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(onlyCustom));
    addToast('Preset removido.', 'info');
  };

  // Atualizar Preço no Digifarma
  const handleApplyPriceToDigifarma = async () => {
    if (!selectedProduct) return;
    setIsApplyingPrice(true);
    try {
      const res = await fetch('/api/mural/price-variations/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produtoId: selectedProduct.PRODUTO_ID,
          novoPreco: pricingResult.precoSugerido,
          resolvidoPor: user?.name || 'Administrador (Simulador)'
        })
      });
      const data = await res.json();
      if (data.success) {
        addToast(`✅ Preço de R$ ${pricingResult.precoSugerido.toFixed(2)} aplicado no Digifarma para ${selectedProduct.PRODUTO}!`, 'success');
        setCurrentStorePrice(pricingResult.precoSugerido.toFixed(2));
        setIsApplyModalOpen(false);
      } else {
        addToast(data.error || 'Erro ao atualizar preço no Digifarma.', 'error');
      }
    } catch (err) {
      console.error('Erro ao aplicar preço no Digifarma:', err);
      addToast('Erro de comunicação com o servidor.', 'error');
    } finally {
      setIsApplyingPrice(false);
    }
  };

  // Cálculo Principal Reativo
  const pricingResult: PricingResult = useMemo(() => {
    return calculatePricing(inputs);
  }, [inputs]);

  // Diagnóstico do Preço Atual praticado
  const currentPriceNum = parseFloat(currentStorePrice) || 0;
  const healthDiagnosis = useMemo(() => {
    if (currentPriceNum <= 0 || inputs.cmv <= 0) return null;
    return diagnoseCurrentPrice(inputs.cmv, currentPriceNum, inputs);
  }, [inputs, currentPriceNum]);

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

  const proLaboreTotalPercent = roundMoney(inputs.proLaboreSocio1Percent + inputs.proLaboreSocio2Percent);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 rounded-3xl text-white shadow-xl">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-white/15 backdrop-blur-md rounded-2xl border border-white/20 shadow-inner">
            <Calculator className="w-8 h-8 text-blue-200" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight">
                Simulador de Precificação Inteligente
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-white shadow-xs">
                Markup Divisor
              </span>
            </div>
            <p className="text-xs text-blue-100/80 mt-1 max-w-xl">
              Formação de preço de venda para farmácia com decomposição transparente de cada centavo em impostos, taxas, custos fixos, pró-labore e lucro real.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPresetModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-xs cursor-pointer"
            title="Salvar configuração atual como novo preset"
          >
            <Plus className="w-4 h-4" />
            <span>Salvar Preset</span>
          </button>
        </div>
      </div>

      {/* Barra de Presets Rápidos */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-black uppercase text-slate-400 tracking-wider whitespace-nowrap">
          <Sliders className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          Presets de Categoria:
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar items-center flex-1">
          {presets.map(preset => {
            const isActive = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer group ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20 ring-2 ring-blue-400/30'
                    : 'bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>{preset.nome}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}>
                  {preset.margemLiquidaPercent}% liq.
                </span>

                {preset.isCustom && (
                  <button
                    onClick={(e) => handleDeleteCustomPreset(preset.id, e)}
                    className="p-1 rounded hover:bg-red-500 hover:text-white transition-colors ml-1 text-slate-400"
                    title="Excluir preset customizado"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid Principal: Formulário de Entrada (Esquerda) e Painel de Resultados (Direita) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* COLUNA ESQUERDA: ENTRADA DE DADOS & SLIDERS (5 Colunas) */}
        <div className="lg:col-span-5 space-y-5">
          
          {/* Card 1: Seleção / Identificação do Produto */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Store className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                1. Produto / Referência
              </h3>
              {selectedProduct && (
                <button
                  onClick={handleClearProduct}
                  className="text-xs font-bold text-slate-400 hover:text-rose-500 flex items-center gap-1 transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> Modo Livre
                </button>
              )}
            </div>

            {/* Input de Busca com Autocomplete */}
            <div className="relative" ref={searchContainerRef}>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar produto no Digifarma por nome ou código de barras..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Dropdown de Resultados */}
              {showDropdown && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 z-30 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden max-h-64 overflow-y-auto">
                  {searchResults.map((item) => (
                    <button
                      key={item.PRODUTO_ID}
                      onClick={() => handleSelectProduct(item)}
                      className="w-full p-3 text-left hover:bg-blue-50/70 dark:hover:bg-slate-700/60 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                    >
                      <div className="truncate">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {item.PRODUTO}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {item.APRESENTACAO || 'Sem apresentação'} {item.COD_BARRAS ? `• EAN: ${item.COD_BARRAS}` : ''}
                        </div>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <div className="text-xs font-black text-slate-800 dark:text-slate-200">
                          Venda: {formatMoney((item.PROD_PRPROMOCAO && item.PROD_PRPROMOCAO > 0) ? item.PROD_PRPROMOCAO : item.PROD_PRVENDA)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Custo: {formatMoney(item.PROD_PRCOMPRA || 0)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Nome/Descrição Livre */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Nome do Item Simulado
              </label>
              <input
                type="text"
                placeholder="Ex: Paracetamol 750mg c/ 20 comp"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Grid CMV e Preço Atual da Loja */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[11px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-wider block mb-1">
                  CMV (Custo Compra R$) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={inputs.cmv || ''}
                    onChange={(e) => setInputs(prev => ({ ...prev, cmv: Math.max(0, parseFloat(e.target.value) || 0) }))}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border-2 border-blue-200 dark:border-blue-800/60 text-sm font-black text-blue-950 dark:text-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Preço Atual Loja (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Opcional"
                    value={currentStorePrice}
                    onChange={(e) => setCurrentStorePrice(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-sm font-black text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Deduções Percentuais e Sliders */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Percent className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                2. Deduções sobre o Preço de Venda (%)
              </h3>
              <span className="text-xs font-black text-slate-500">
                Total: <b className={pricingResult.totalDeducoesPercent >= 100 ? 'text-red-500 font-black' : 'text-slate-900 dark:text-white'}>{pricingResult.totalDeducoesPercent}%</b>
              </span>
            </div>

            {/* Impostos */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  Impostos (Simples/Monofásico)
                </span>
                <span className="font-black text-red-600 dark:text-red-400">{inputs.impostoPercent}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="25"
                step="0.5"
                value={inputs.impostoPercent}
                onChange={(e) => setInputs(prev => ({ ...prev, impostoPercent: parseFloat(e.target.value) || 0 }))}
                className="w-full accent-red-500 cursor-pointer h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg"
              />
            </div>

            {/* Taxa de Cartão */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Taxa de Cartão / Gateway
                </span>
                <span className="font-black text-amber-600 dark:text-amber-400">{inputs.taxaCartaoPercent}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="0.1"
                value={inputs.taxaCartaoPercent}
                onChange={(e) => setInputs(prev => ({ ...prev, taxaCartaoPercent: parseFloat(e.target.value) || 0 }))}
                className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg"
              />
            </div>

            {/* Custos Variáveis */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  Outros Variáveis (Embalagens/Comissões)
                </span>
                <span className="font-black text-purple-600 dark:text-purple-400">{inputs.custosVariaveisPercent}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={inputs.custosVariaveisPercent}
                onChange={(e) => setInputs(prev => ({ ...prev, custosVariaveisPercent: parseFloat(e.target.value) || 0 }))}
                className="w-full accent-purple-500 cursor-pointer h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg"
              />
            </div>

            {/* Custo Fixo Operacional */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-sky-600"></span>
                  Custo Fixo da Loja (Aluguel/Luz/Sistemas)
                </span>
                <span className="font-black text-sky-600 dark:text-sky-400">{inputs.custoFixoPercent}%</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="45"
                  step="0.01"
                  value={inputs.custoFixoPercent}
                  onChange={(e) => setInputs(prev => ({ ...prev, custoFixoPercent: parseFloat(e.target.value) || 0 }))}
                  className="flex-1 accent-sky-600 cursor-pointer h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg"
                />
                <input
                  type="number"
                  step="0.01"
                  value={inputs.custoFixoPercent}
                  onChange={(e) => setInputs(prev => ({ ...prev, custoFixoPercent: parseFloat(e.target.value) || 0 }))}
                  className="w-16 px-2 py-1 text-right text-xs font-black rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
              <p className="text-[10px] text-slate-400">
                💡 Padrão BelaFarma: <b>28.77%</b> (R$ 10.500 custos fixos / R$ 36.500 faturamento médio).
              </p>
            </div>

            {/* Pró-labore Sócios */}
            <div className="space-y-1 p-3 bg-teal-50/50 dark:bg-teal-950/20 rounded-2xl border border-teal-200/60 dark:border-teal-800/40">
              <div className="flex justify-between text-xs font-extrabold text-teal-900 dark:text-teal-200">
                <span className="flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 text-teal-600" />
                  Pró-labore Total dos Sócios
                </span>
                <span className="font-black text-teal-700 dark:text-teal-300">{proLaboreTotalPercent}%</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                <div>
                  <span className="text-slate-500 font-bold block text-[10px]">Sócio 1 (%):</span>
                  <input
                    type="number"
                    step="0.5"
                    value={inputs.proLaboreSocio1Percent}
                    onChange={(e) => setInputs(prev => ({ ...prev, proLaboreSocio1Percent: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-2 py-1 font-black rounded-lg border border-teal-200 dark:border-teal-800 bg-white dark:bg-slate-900 text-teal-950 dark:text-teal-200 text-xs"
                  />
                </div>
                <div>
                  <span className="text-slate-500 font-bold block text-[10px]">Sócio 2 (%):</span>
                  <input
                    type="number"
                    step="0.5"
                    value={inputs.proLaboreSocio2Percent}
                    onChange={(e) => setInputs(prev => ({ ...prev, proLaboreSocio2Percent: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-2 py-1 font-black rounded-lg border border-teal-200 dark:border-teal-800 bg-white dark:bg-slate-900 text-teal-950 dark:text-teal-200 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Margem Líquida Alvo */}
            <div className="space-y-1 p-3 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200/60 dark:border-emerald-800/40">
              <div className="flex justify-between text-xs font-extrabold text-emerald-900 dark:text-emerald-200">
                <span className="flex items-center gap-1">
                  <PiggyBank className="w-3.5 h-3.5 text-emerald-600" />
                  Margem Líquida Alvo (Lucro Livre)
                </span>
                <span className="font-black text-emerald-700 dark:text-emerald-300">{inputs.margemLiquidaPercent}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="40"
                step="0.5"
                value={inputs.margemLiquidaPercent}
                onChange={(e) => setInputs(prev => ({ ...prev, margemLiquidaPercent: parseFloat(e.target.value) || 0 }))}
                className="w-full accent-emerald-600 cursor-pointer h-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA: KPI CARDS & DESTINAÇÃO FINANCEIRA (7 Colunas) */}
        <div className="lg:col-span-7 space-y-5">
          
          {/* Mensagem de Erro de Soma >= 100% */}
          {!pricingResult.isValid && (
            <div className="p-4 bg-red-500/10 border-2 border-red-500 rounded-2xl flex items-center gap-3 text-red-700 dark:text-red-300 text-xs font-bold">
              <AlertTriangle className="w-5 h-5 shrink-0 text-red-500" />
              <span>{pricingResult.errorMessage}</span>
            </div>
          )}

          {/* Grid de KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
            
            {/* Card 1: Preço de Venda Sugerido (Destaque) */}
            <div className="col-span-2 sm:col-span-1 p-4 bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-700 rounded-3xl text-white shadow-lg shadow-emerald-500/20 relative overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between text-emerald-100">
                <span className="text-[11px] font-black uppercase tracking-wider">Preço Sugerido</span>
                <Sparkles className="w-4 h-4 animate-pulse" />
              </div>
              <div className="my-2">
                <div className="text-3xl font-black tracking-tight">
                  {formatMoney(pricingResult.precoSugerido)}
                </div>
                <div className="text-[11px] text-emerald-100/90 font-medium">
                  Markup Divisor: <b>{pricingResult.markupDivisor.toFixed(4)}</b>
                </div>
              </div>
              <div className="text-[10px] text-emerald-200 font-bold bg-white/10 px-2 py-0.5 rounded-lg w-fit">
                Cobre 100% dos custos + Lucro
              </div>
            </div>

            {/* Card 2: Markup Multiplicador */}
            <div className="p-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
              <div className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
                Multiplicador
              </div>
              <div className="my-1">
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {pricingResult.markupMultiplicador > 0 ? `${pricingResult.markupMultiplicador}x` : '—'}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Preço ÷ CMV
                </div>
              </div>
              <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">
                {inputs.cmv > 0 ? `+${formatMoney(pricingResult.lucroBrutoReais)} bruto` : '—'}
              </div>
            </div>

            {/* Card 3: Margem Bruta */}
            <div className="p-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
              <div className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
                Margem Bruta
              </div>
              <div className="my-1">
                <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                  {pricingResult.margemBrutaPercent}%
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  (Preço - Custo) ÷ Preço
                </div>
              </div>
              <div className="text-[10px] text-slate-400">
                Ponto de Equilíbrio: <b>{formatMoney(pricingResult.pontoEquilibrioUnitario)}</b>
              </div>
            </div>
          </div>

          {/* Comparador com Preço Atual da Loja */}
          {healthDiagnosis && (
            <div className={`p-4 rounded-3xl border-2 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              healthDiagnosis.status === 'lucro_saudavel'
                ? 'bg-emerald-500/10 border-emerald-500/30 dark:bg-emerald-950/20'
                : healthDiagnosis.status === 'margem_apertada'
                ? 'bg-amber-500/10 border-amber-500/30 dark:bg-amber-950/20'
                : 'bg-rose-500/10 border-rose-500/40 dark:bg-rose-950/30'
            }`}>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider">
                  {healthDiagnosis.status === 'lucro_saudavel' && (
                    <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Diagnóstico: Preço Saudável
                    </span>
                  )}
                  {healthDiagnosis.status === 'margem_apertada' && (
                    <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" /> Diagnóstico: Margem Apertada
                    </span>
                  )}
                  {healthDiagnosis.status === 'prejuizo' && (
                    <span className="text-rose-700 dark:text-rose-400 flex items-center gap-1">
                      <TrendingDown className="w-4 h-4" /> Diagnóstico: Prejuízo Operacional
                    </span>
                  )}
                </div>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {healthDiagnosis.mensagem}
                </p>
                <div className="text-[11px] text-slate-500">
                  Preço Atual: <b>{formatMoney(currentPriceNum)}</b> ➔ Sugerido: <b>{formatMoney(pricingResult.precoSugerido)}</b> ({pricingResult.precoSugerido > currentPriceNum ? '+' : ''}{(pricingResult.precoSugerido - currentPriceNum >= 0 ? '+' : '')}{formatMoney(pricingResult.precoSugerido - currentPriceNum)})
                </div>
              </div>

              {selectedProduct && user?.role === UserRole.ADM && (
                <button
                  onClick={() => setIsApplyModalOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 text-xs font-black transition-all shadow-md flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>Aplicar Preço no Digifarma</span>
                </button>
              )}
            </div>
          )}

          {/* Card da Decomposição Financeira (Onde vai cada centavo) */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  3. Destinação da Venda (Para Onde Vai Cada Centavo)
                </h3>
                <span className="text-xs font-bold text-slate-400">
                  Base 100% da Venda: <b>{formatMoney(pricingResult.precoSugerido)}</b>
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Visualização detalhada da divisão de receitas para cada unidade vendida no balcão.
              </p>
            </div>

            {/* Barra Visual Segmentada Proporcional */}
            {pricingResult.decomposicao.length > 0 && (
              <div className="space-y-1.5">
                <div className="w-full h-5 rounded-xl overflow-hidden flex shadow-inner border border-slate-200 dark:border-slate-700">
                  {pricingResult.decomposicao.map(item => (
                    <div
                      key={item.id}
                      style={{ width: `${item.percentual}%`, backgroundColor: item.cor }}
                      title={`${item.label}: ${item.percentual}% (${formatMoney(item.valorReais)})`}
                      className="h-full transition-all duration-300 hover:opacity-80 relative group"
                    />
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                  <span>0% (Custo)</span>
                  <span>50%</span>
                  <span>100% (Preço Final)</span>
                </div>
              </div>
            )}

            {/* Tabela Linha a Linha da Destinação */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="py-2.5 px-3">Destino do Valor</th>
                    <th className="py-2.5 px-3 text-center">Proporção (%)</th>
                    <th className="py-2.5 px-3 text-right">Valor Unitário (R$)</th>
                    <th className="py-2.5 px-3 text-left">Finalidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {pricingResult.decomposicao.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.cor }}></span>
                        <span>{item.label}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-black text-slate-700 dark:text-slate-300">
                        {item.percentual.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-slate-900 dark:text-white">
                        {formatMoney(item.valorReais)}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-400">
                        {item.descricao}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700 font-black text-xs">
                    <td className="py-3 px-3 text-slate-900 dark:text-white">
                      TOTAL (Preço de Venda Final)
                    </td>
                    <td className="py-3 px-3 text-center text-slate-900 dark:text-white">
                      100.0%
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-600 dark:text-emerald-400 text-sm">
                      {formatMoney(pricingResult.precoSugerido)}
                    </td>
                    <td className="py-3 px-3 text-[10px] text-slate-400 uppercase">
                      Equilíbrio + Margem Alvo
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: Salvar Preset Customizado */}
      {isPresetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-blue-600" />
                Salvar Preset de Precificação
              </h3>
              <button onClick={() => setIsPresetModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Salve a combinação de taxas, custos fixos e margem atual ({inputs.margemLiquidaPercent}%) para reutilizar rapidamente em outros produtos.
            </p>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">
                Nome do Preset *
              </label>
              <input
                type="text"
                placeholder="Ex: Dermocosméticos Premium"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">
                Descrição Breve (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: Produtos com margem líquida de 18%"
                value={newPresetDesc}
                onChange={(e) => setNewPresetDesc(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setIsPresetModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveCustomPreset}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black transition-all shadow-md shadow-blue-500/20"
              >
                Salvar Preset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Confirmação de Aplicação de Preço no Digifarma */}
      {isApplyModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Store className="w-5 h-5 text-emerald-600" />
                Atualizar Preço no Digifarma
              </h3>
              <button onClick={() => setIsApplyModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                {selectedProduct.PRODUTO}
              </div>
              <div className="text-[11px] text-slate-400">
                {selectedProduct.APRESENTACAO} {selectedProduct.COD_BARRAS ? `• Cód: ${selectedProduct.PRODUTO_ID}` : ''}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
                <span className="text-slate-500">Preço Atual: <b>{formatMoney(currentPriceNum)}</b></span>
                <ArrowRight className="w-4 h-4 text-slate-400" />
                <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">
                  Novo Preço: {formatMoney(pricingResult.precoSugerido)}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              ⚠️ Esta ação atualizará o preço de venda diretamente no banco de dados do Digifarma (Firebird) para o valor sugerido de <b>{formatMoney(pricingResult.precoSugerido)}</b>.
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setIsApplyModalOpen(false)}
                disabled={isApplyingPrice}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleApplyPriceToDigifarma}
                disabled={isApplyingPrice}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black transition-all shadow-md shadow-emerald-500/20 flex items-center gap-2"
              >
                {isApplyingPrice ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Aplicando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirmar e Atualizar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
