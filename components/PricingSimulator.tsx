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
  ArrowDownRight,
  TrendingDown,
  Globe,
  Target,
  BarChart2
} from 'lucide-react';
import { User, UserRole } from '../types';
import { useToast } from './ToastContext';
import {
  PricingInputs,
  PricingResult,
  CategoryPreset,
  DEFAULT_PRESETS,
  STORE_FINANCIAL_BASELINE,
  detectProductCategory,
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
  PRECO_PROFFER_MEDIO?: number;
  PRECO_PROFFER_BAIXO?: number;
  PRECO_PROFFER_ALTO?: number;
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

  // Modal para Visualizar o Quadro Geral de Rateio Ponderado
  const [isRateioModalOpen, setIsRateioModalOpen] = useState<boolean>(false);

  // Modal para aplicar preço no Digifarma
  const [isApplyModalOpen, setIsApplyModalOpen] = useState<boolean>(false);
  const [isApplyingPrice, setIsApplyingPrice] = useState<boolean>(false);
  const [inputApplyPrice, setInputApplyPrice] = useState<string>('');
  const [customApplyReason, setCustomApplyReason] = useState<string>('');

  const handleOpenApplyModal = (priceToApply?: number, reason?: string) => {
    const target = priceToApply !== undefined ? priceToApply : pricingResult.precoSugerido;
    setInputApplyPrice(target > 0 ? target.toFixed(2) : '');
    setCustomApplyReason(reason || `Simulador de Precificação (Markup Divisor)`);
    setIsApplyModalOpen(true);
  };

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
        const res = await fetch(`/api/price-manager/search?q=${encodeURIComponent(searchTerm)}&limit=15`);
        if (res.ok) {
          const data = await res.json();
          // Mapeia os dados do endpoint de busca
          const items: DigifarmaSearchProduct[] = (data || []).map((p: any) => ({
            PRODUTO_ID: p.PRODUTO_ID,
            PRODUTO: p.PRODUTO,
            APRESENTACAO: '',
            COD_BARRAS: p.COD_BARRAS || '',
            PROD_PRVENDA: Number(p.PROD_PRVENDA || 0),
            PROD_PRPROMOCAO: Number(p.PROD_PRPROMOCAO || 0),
            PROD_PRCOMPRA: Number(p.PROD_PRCOMPRA || 0),
            ESTOQUE: Number(p.ESTOQUE || 0),
            CATEGORIA: p.CURVA ? `Curva ${p.CURVA}` : '',
            PRECO_PROFFER_MEDIO: p.PRECO_PROFFER_MEDIO ? Number(p.PRECO_PROFFER_MEDIO) : undefined,
            PRECO_PROFFER_BAIXO: p.PRECO_PROFFER_BAIXO ? Number(p.PRECO_PROFFER_BAIXO) : undefined,
            PRECO_PROFFER_ALTO: p.PRECO_PROFFER_ALTO ? Number(p.PRECO_PROFFER_ALTO) : undefined
          }));
          setSearchResults(items);
          setShowDropdown(true);
        }
      } catch (err) {
        console.error('Erro ao buscar produtos no simulador:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

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
    addToast(`Preset "${preset.nome}" aplicado (Rateio Fixo: ${preset.custoFixoPercent}%)!`, 'info');
  };

  // Selecionar Produto da Busca com Detecção Automática de Categoria e Rateio
  const handleSelectProduct = (prod: DigifarmaSearchProduct) => {
    setSelectedProduct(prod);
    setProductName(prod.PRODUTO);
    setSearchTerm('');
    setShowDropdown(false);

    const custo = prod.PROD_PRCOMPRA && prod.PROD_PRCOMPRA > 0 ? prod.PROD_PRCOMPRA : inputs.cmv;
    const precoVendaReal = (prod.PROD_PRPROMOCAO && prod.PROD_PRPROMOCAO > 0) 
      ? prod.PROD_PRPROMOCAO 
      : prod.PROD_PRVENDA;

    // Detectar automaticamente a categoria pelo nome/descrição
    const detectedCatId = detectProductCategory(prod.PRODUTO);
    const matchedPreset = presets.find(p => p.id === detectedCatId) || presets[0];

    setActivePresetId(matchedPreset.id);
    setInputs({
      cmv: roundMoney(custo),
      impostoPercent: matchedPreset.impostoPercent,
      taxaCartaoPercent: matchedPreset.taxaCartaoPercent,
      custosVariaveisPercent: matchedPreset.custosVariaveisPercent,
      custoFixoPercent: matchedPreset.custoFixoPercent,
      proLaboreSocio1Percent: matchedPreset.proLaboreSocio1Percent,
      proLaboreSocio2Percent: matchedPreset.proLaboreSocio2Percent,
      margemLiquidaPercent: matchedPreset.margemLiquidaPercent
    });

    setCurrentStorePrice(precoVendaReal > 0 ? precoVendaReal.toFixed(2) : '');

    addToast(`🏷️ Categoria Identificada: "${matchedPreset.nome}" (Rateio Fixo: ${matchedPreset.custoFixoPercent}%) | Custo: R$ ${custo.toFixed(2)}`, 'success');
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
    const numPrice = parseFloat(inputApplyPrice);
    if (isNaN(numPrice) || numPrice <= 0) {
      addToast('Digite um novo preço de venda válido maior que zero.', 'error');
      return;
    }
    const finalPriceToApply = roundMoney(numPrice);
    const finalReason = customApplyReason || `Simulador de Precificação (Markup Divisor ${pricingResult.markupDivisor.toFixed(4)})`;

    setIsApplyingPrice(true);
    try {
      const res = await fetch('/api/price-manager/apply-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          produtoId: selectedProduct.PRODUTO_ID,
          novoPreco: finalPriceToApply,
          motivo: finalReason,
          usuario: user?.name || 'Administrador',
          tipo: 'simulador'
        })
      });
      const data = await res.json();
      if (data.success) {
        addToast(`✅ Preço de R$ ${finalPriceToApply.toFixed(2)} aplicado no Digifarma com backup gravado!`, 'success');
        setCurrentStorePrice(finalPriceToApply.toFixed(2));
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
              Formação de preço de venda para farmácia com rateio ponderado de despesas fixas por categoria de produto (Maio até hoje) e cobertura matemática garantida de 100% das contas fixas (R$ 10.500/mês).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsRateioModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-100 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="Ver demonstrativo matemático do rateio de despesas fixas"
          >
            <BarChart2 className="w-4 h-4 text-emerald-300" />
            <span>Quadro de Rateio</span>
          </button>

          <button
            onClick={() => setIsPresetModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="Salvar configuração atual como novo preset"
          >
            <Plus className="w-4 h-4" />
            <span>Salvar Preset</span>
          </button>
        </div>
      </div>

      {/* Barra de Presets Rápidos com Rateio Diferenciado */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-black uppercase text-slate-400 tracking-wider whitespace-nowrap">
          <Sliders className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          Categorias & Rateio Fixo:
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
                  isActive ? 'bg-white/20 text-white' : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                }`}>
                  Fixo: {preset.custoFixoPercent}%
                </span>
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
                        <div className="flex items-center justify-end gap-1.5 text-[10px] text-slate-400 mt-0.5">
                          <span>Custo: {formatMoney(item.PROD_PRCOMPRA || 0)}</span>
                          {item.PRECO_PROFFER_MEDIO && item.PRECO_PROFFER_MEDIO > 0 && (
                            <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-500/20">
                              Proffer: {formatMoney(item.PRECO_PROFFER_MEDIO)}
                            </span>
                          )}
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

          {/* Card Especial: Inteligência de Mercado Proffer & Sugestão Estratégica (-10% da Média) */}
          {selectedProduct && selectedProduct.PRECO_PROFFER_MEDIO && selectedProduct.PRECO_PROFFER_MEDIO > 0 ? (
            <div className="p-5 rounded-3xl bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 border-2 border-indigo-500/40 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-white flex items-center gap-2">
                      Inteligência de Mercado Proffer
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                        Regional
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      {selectedProduct.COD_BARRAS ? `EAN: ${selectedProduct.COD_BARRAS}` : `Cód: ${selectedProduct.PRODUTO_ID}`}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setCurrentStorePrice(selectedProduct.PRECO_PROFFER_MEDIO!.toFixed(2));
                    addToast('Preço da Loja preenchido com a Média Proffer para diagnóstico!', 'info');
                  }}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/40 transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Copiar preço médio da concorrência para o campo Preço Atual da Loja"
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>Copiar Média na Loja</span>
                </button>
              </div>

              {/* Grid dos 3 Preços Proffer */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700/60 text-center">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Mínimo da Região
                  </div>
                  <div className="text-sm sm:text-base font-black text-emerald-400 mt-0.5">
                    {formatMoney(selectedProduct.PRECO_PROFFER_BAIXO || selectedProduct.PRECO_PROFFER_MEDIO)}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-indigo-950/80 border-2 border-indigo-500/60 text-center shadow-inner">
                  <div className="text-[10px] font-black text-indigo-300 uppercase tracking-wider">
                    Média da Região
                  </div>
                  <div className="text-base sm:text-lg font-black text-indigo-200 mt-0.5">
                    {formatMoney(selectedProduct.PRECO_PROFFER_MEDIO)}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700/60 text-center">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Máximo da Região
                  </div>
                  <div className="text-sm sm:text-base font-black text-amber-400 mt-0.5">
                    {formatMoney(selectedProduct.PRECO_PROFFER_ALTO || selectedProduct.PRECO_PROFFER_MEDIO)}
                  </div>
                </div>
              </div>

              {/* Box Estratégico: Sugestão 10% Abaixo da Média Proffer */}
              {(() => {
                const precoMeta10Pct = roundMoney(selectedProduct.PRECO_PROFFER_MEDIO * 0.90);
                const diagMeta = diagnoseCurrentPrice(inputs.cmv, precoMeta10Pct, inputs);
                const isViavel = precoMeta10Pct >= pricingResult.pontoEquilibrioUnitario && diagMeta.status !== 'prejuizo';

                return (
                  <div className={`p-4 rounded-2xl border-2 transition-all space-y-2.5 ${
                    isViavel 
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-100'
                      : 'bg-amber-950/30 border-amber-500/40 text-amber-100'
                  }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className={`w-4 h-4 ${isViavel ? 'text-emerald-400' : 'text-amber-400'}`} />
                        <span className="text-xs font-black uppercase tracking-wider">
                          Sugestão Estratégica: 10% Abaixo da Média Concorrente
                        </span>
                      </div>
                      <div className="text-lg font-black">
                        {formatMoney(precoMeta10Pct)}
                      </div>
                    </div>

                    <div className="text-xs font-medium space-y-1">
                      {isViavel ? (
                        <p className="text-emerald-300/90">
                          ✅ <b>Estratégia Altamente Viável:</b> Vendendo a <b>{formatMoney(precoMeta10Pct)}</b> você fica <b>10% mais barato</b> que a média concorrente ({formatMoney(selectedProduct.PRECO_PROFFER_MEDIO)}), garantindo <b>{diagMeta.lucroLiquidoPercent.toFixed(1)}% de margem líquida</b> (+{formatMoney(diagMeta.lucroLiquidoReais)} de lucro livre por unidade).
                        </p>
                      ) : (
                        <p className="text-amber-300/90">
                          ⚠️ <b>Atenção à Margem:</b> Vender a <b>{formatMoney(precoMeta10Pct)}</b> ficaria abaixo do seu ponto de equilíbrio ({formatMoney(pricingResult.pontoEquilibrioUnitario)}), gerando margem negativa ({diagMeta.lucroLiquidoPercent.toFixed(1)}%). Recomendamos usar o <b>Preço Sugerido Markup ({formatMoney(pricingResult.precoSugerido)})</b> para preservar sua margem.
                        </p>
                      )}
                    </div>

                    {user?.role === UserRole.ADM && (
                      <div className="pt-1 flex flex-wrap gap-2">
                        <button
                          onClick={() => handleOpenApplyModal(precoMeta10Pct, `Estratégico: 10% abaixo da média Proffer (${formatMoney(selectedProduct.PRECO_PROFFER_MEDIO)})`)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-sm cursor-pointer ${
                            isViavel 
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                              : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20'
                          }`}
                        >
                          <Store className="w-3.5 h-3.5" />
                          <span>Aplicar {formatMoney(precoMeta10Pct)} no Digifarma (-10% Proffer)</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : selectedProduct ? (
            <div className="p-4 rounded-3xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 flex items-center gap-2.5">
              <Info className="w-4 h-4 text-slate-500 shrink-0" />
              <span>Nenhum histórico de concorrência regional registrado na Proffer para este produto.</span>
            </div>
          ) : null}

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
              <button onClick={() => setIsApplyModalOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Informações do Produto */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-1.5">
              <div className="text-xs font-bold text-slate-900 dark:text-white">
                {selectedProduct.PRODUTO}
              </div>
              <div className="text-[11px] text-slate-400 flex flex-wrap gap-2">
                <span>{selectedProduct.APRESENTACAO}</span>
                {selectedProduct.COD_BARRAS && <span>• EAN: {selectedProduct.COD_BARRAS}</span>}
                <span>• Cód: {selectedProduct.PRODUTO_ID}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
                <span className="text-slate-500">Custo de Compra (CMV): <b>{formatMoney(inputs.cmv)}</b></span>
                <span className="text-slate-500">Preço Atual da Loja: <b>{formatMoney(currentPriceNum)}</b></span>
              </div>
            </div>

            {/* Campo Editável: Novo Preço de Venda */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider block">
                Novo Preço de Venda (R$) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-black text-emerald-600 dark:text-emerald-400">
                  R$
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  autoFocus
                  placeholder="0,00"
                  value={inputApplyPrice}
                  onChange={(e) => setInputApplyPrice(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white dark:bg-slate-900 border-2 border-emerald-500 text-lg font-black text-slate-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-emerald-500/20 shadow-sm"
                />
              </div>

              {/* Atalhos Rápidos para Preencher o Preço */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Sugestões:</span>
                
                {pricingResult.precoSugerido > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setInputApplyPrice(pricingResult.precoSugerido.toFixed(2));
                      setCustomApplyReason(`Simulador de Precificação (Markup Divisor ${pricingResult.markupDivisor.toFixed(4)})`);
                    }}
                    className={`text-[10px] font-extrabold px-2.5 py-1 rounded-xl border transition-all cursor-pointer ${
                      parseFloat(inputApplyPrice) === pricingResult.precoSugerido
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-500'
                    }`}
                  >
                    ⚡ Markup: {formatMoney(pricingResult.precoSugerido)}
                  </button>
                )}

                {selectedProduct.PRECO_PROFFER_MEDIO && selectedProduct.PRECO_PROFFER_MEDIO > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const val = roundMoney(selectedProduct.PRECO_PROFFER_MEDIO! * 0.90);
                        setInputApplyPrice(val.toFixed(2));
                        setCustomApplyReason(`Estratégico: 10% abaixo da média Proffer (${formatMoney(selectedProduct.PRECO_PROFFER_MEDIO!)})`);
                      }}
                      className={`text-[10px] font-extrabold px-2.5 py-1 rounded-xl border transition-all cursor-pointer ${
                        parseFloat(inputApplyPrice) === roundMoney(selectedProduct.PRECO_PROFFER_MEDIO * 0.90)
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:border-indigo-500'
                      }`}
                    >
                      🎯 Proffer -10%: {formatMoney(selectedProduct.PRECO_PROFFER_MEDIO * 0.90)}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setInputApplyPrice(selectedProduct.PRECO_PROFFER_MEDIO!.toFixed(2));
                        setCustomApplyReason(`Mercado: Média Regional Proffer (${formatMoney(selectedProduct.PRECO_PROFFER_MEDIO!)})`);
                      }}
                      className={`text-[10px] font-extrabold px-2.5 py-1 rounded-xl border transition-all cursor-pointer ${
                        parseFloat(inputApplyPrice) === selectedProduct.PRECO_PROFFER_MEDIO
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-500'
                      }`}
                    >
                      📊 Média Proffer: {formatMoney(selectedProduct.PRECO_PROFFER_MEDIO)}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Diagnóstico em Tempo Real do Preço Digitado */}
            {(() => {
              const typedPrice = parseFloat(inputApplyPrice) || 0;
              if (typedPrice <= 0 || inputs.cmv <= 0) return null;
              const diag = diagnoseCurrentPrice(inputs.cmv, typedPrice, inputs);
              const isPrejuizo = diag.status === 'prejuizo';
              const isSaudavel = diag.status === 'lucro_saudavel';

              return (
                <div className={`p-3 rounded-2xl border transition-all text-xs font-bold ${
                  isSaudavel
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                    : isPrejuizo
                    ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                    : 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      {isSaudavel ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : isPrejuizo ? <TrendingDown className="w-4 h-4 text-rose-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                      <span>{isSaudavel ? 'Lucro Líquido Garantido' : isPrejuizo ? 'Prejuízo Operacional!' : 'Margem Líquida Reduzida'}</span>
                    </span>
                    <span className="text-xs font-black">
                      {diag.lucroLiquidoPercent >= 0 ? '+' : ''}{diag.lucroLiquidoPercent.toFixed(1)}% ({formatMoney(diag.lucroLiquidoReais)} / un)
                    </span>
                  </div>
                  <p className="text-[11px] font-normal mt-1 opacity-90">
                    {diag.mensagem}
                  </p>
                </div>
              );
            })()}

            <p className="text-[11px] text-slate-500">
              ⚠️ Esta ação atualizará o preço de venda diretamente no banco de dados do Digifarma (Firebird) e gerará um backup antes da alteração.
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsApplyModalOpen(false)}
                disabled={isApplyingPrice}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApplyPriceToDigifarma}
                disabled={isApplyingPrice || !(parseFloat(inputApplyPrice) > 0)}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white text-xs font-black transition-all shadow-md shadow-emerald-500/20 flex items-center gap-2 cursor-pointer"
              >
                {isApplyingPrice ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Aplicando no Digifarma...</span>
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

      {/* MODAL: QUADRO GERAL DE RATEIO DE DESPESAS FIXAS */}
      {isRateioModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400">
                  <BarChart2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Quadro de Rateio das Despesas Fixas por Categoria
                  </h3>
                  <p className="text-xs text-slate-500">
                    Mix real de vendas (Maio até hoje) com garantia matemática de 100% de cobertura das contas.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsRateioModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* KPIs de Base Financeira da Farmácia */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Faturamento Alvo</span>
                <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                  R$ 36.500,00 <span className="text-[10px] text-slate-400">/mês</span>
                </div>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Contas Fixas Totais</span>
                <div className="text-sm font-black text-blue-600 dark:text-blue-400 mt-0.5">
                  R$ 10.500,00 <span className="text-[10px] text-slate-400">/mês</span>
                </div>
              </div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800">
                <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">Cobertura Garantida</span>
                <div className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> 100.0% das Contas
                </div>
              </div>
            </div>

            {/* Tabela de Rateio Ponderado por Categoria */}
            <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 text-[10px] font-black uppercase text-slate-400 tracking-wider border-b border-slate-100 dark:border-slate-800">
                    <th className="py-2.5 px-3">Categoria</th>
                    <th className="py-2.5 px-3 text-center">Mix de Vendas</th>
                    <th className="py-2.5 px-3 text-center">Rateio Fixo (%)</th>
                    <th className="py-2.5 px-3 text-center">Margem Alvo</th>
                    <th className="py-2.5 px-3 text-right">Absorção Mensal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Genéricos
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-600 dark:text-slate-300">31.1%</td>
                    <td className="py-2.5 px-3 text-center font-black text-emerald-600 dark:text-emerald-400">36.00%</td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-500">15.0% líq</td>
                    <td className="py-2.5 px-3 text-right font-black text-slate-800 dark:text-slate-200">R$ 4.086,00</td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      Perfumarias & Higiene
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-600 dark:text-slate-300">27.7%</td>
                    <td className="py-2.5 px-3 text-center font-black text-blue-600 dark:text-blue-400">26.00%</td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-500">8.0% líq</td>
                    <td className="py-2.5 px-3 text-right font-black text-slate-800 dark:text-slate-200">R$ 2.628,00</td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                      Similares / Bonificados
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-600 dark:text-slate-300">16.8%</td>
                    <td className="py-2.5 px-3 text-center font-black text-purple-600 dark:text-purple-400">33.00%</td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-500">12.0% líq</td>
                    <td className="py-2.5 px-3 text-right font-black text-slate-800 dark:text-slate-200">R$ 2.023,00</td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      Outros & Acessórios
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-600 dark:text-slate-300">13.7%</td>
                    <td className="py-2.5 px-3 text-center font-black text-amber-600 dark:text-amber-400">23.00%</td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-500">10.0% líq</td>
                    <td className="py-2.5 px-3 text-right font-black text-slate-800 dark:text-slate-200">R$ 1.150,00</td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      Referência / Marca
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-600 dark:text-slate-300">10.7%</td>
                    <td className="py-2.5 px-3 text-center font-black text-rose-600 dark:text-rose-400">15.70%</td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-500">4.0% líq</td>
                    <td className="py-2.5 px-3 text-right font-black text-slate-800 dark:text-slate-200">R$ 613,00</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 dark:bg-slate-800/90 font-black text-slate-900 dark:text-white">
                    <td className="py-3 px-3">TOTAL PONDERADO</td>
                    <td className="py-3 px-3 text-center text-emerald-600">100.0%</td>
                    <td className="py-3 px-3 text-center text-blue-600">28.77% (Média)</td>
                    <td className="py-3 px-3 text-center">—</td>
                    <td className="py-3 px-3 text-right text-emerald-600">R$ 10.500,00 /mês</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-2xl border border-blue-200 dark:border-blue-800 text-[11px] text-blue-900 dark:text-blue-200">
              💡 <strong>Lógica Estratégica:</strong> Medicamentos de Referência têm preço competitivo e margem menor no balcão, por isso carregam apenas <strong>15.70%</strong> de custos fixos. Em contrapartida, Genéricos e Similares têm margem maior e absorvem <strong>36%</strong> e <strong>33%</strong>. A soma ponderada cobre com precisão <strong>100% de todas as despesas da farmácia</strong> no final do mês!
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsRateioModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black transition-colors cursor-pointer"
              >
                Entendi e Fechar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
