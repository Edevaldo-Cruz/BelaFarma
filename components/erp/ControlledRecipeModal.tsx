import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  User, 
  Stethoscope, 
  Calendar, 
  CheckCircle, 
  X, 
  Search, 
  Plus, 
  AlertTriangle,
  Copy,
  Hash
} from 'lucide-react';
import { useToast } from '../ToastContext';

export interface ControlledProductItem {
  code: string;
  barcode: string;
  name: string;
  quantity: number;
  unit_price: number;
  recipe_type: 'AMARELA' | 'AZUL' | 'BRANCA' | 'CREME';
  recipe_label: string;
}

export interface ControlledRecipeData {
  product_code: string;
  product_name: string;
  recipe_type: 'AMARELA' | 'AZUL' | 'BRANCA' | 'CREME';
  notification_number: string;
  prescription_date: string;
  buyer_id?: string;
  buyer_name: string;
  buyer_cpf: string;
  buyer_rg: string;
  buyer_rg_issuer: string;
  buyer_address: string;
  buyer_phone: string;
  prescriber_id?: string;
  prescriber_council: string;
  prescriber_number: string;
  prescriber_uf: string;
  prescriber_name: string;
  patient_name: string;
  batch_lot: string;
  expiry_date: string;
  quantity: number;
}

interface ControlledRecipeModalProps {
  isOpen: boolean;
  controlledItems: ControlledProductItem[];
  onClose: () => void;
  onConfirm: (recipes: ControlledRecipeData[]) => void;
}

export const ControlledRecipeModal: React.FC<ControlledRecipeModalProps> = ({
  isOpen,
  controlledItems,
  onClose,
  onConfirm
}) => {
  const { addToast } = useToast();

  // Receita ativa selecionada na aba de itens
  const [activeItemIndex, setActiveItemIndex] = useState(0);

  // Lista de formulários preenchidos por item
  const [recipes, setRecipes] = useState<ControlledRecipeData[]>([]);

  // Opção para replicar dados do primeiro para os demais
  const [applyToAll, setApplyToAll] = useState(true);

  // Autocomplete Prescritor
  const [prescriberSearch, setPrescriberSearch] = useState('');
  const [prescribersFound, setPrescribersFound] = useState<any[]>([]);
  const [isSearchingPrescriber, setIsSearchingPrescriber] = useState(false);
  const [showPrescriberList, setShowPrescriberList] = useState(false);

  // Autocomplete Comprador
  const [buyerSearch, setBuyerSearch] = useState('');
  const [buyersFound, setBuyersFound] = useState<any[]>([]);
  const [isSearchingBuyer, setIsSearchingBuyer] = useState(false);
  const [showBuyerList, setShowBuyerList] = useState(false);

  // Inicializa o estado das receitas quando abre o modal
  useEffect(() => {
    if (isOpen && controlledItems.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const initial = controlledItems.map(item => ({
        product_code: item.code,
        product_name: item.name,
        recipe_type: item.recipe_type || 'BRANCA',
        notification_number: '',
        prescription_date: today,
        buyer_id: '',
        buyer_name: '',
        buyer_cpf: '',
        buyer_rg: '',
        buyer_rg_issuer: 'SSP',
        buyer_address: '',
        buyer_phone: '',
        prescriber_id: '',
        prescriber_council: 'CRM',
        prescriber_number: '',
        prescriber_uf: 'MG',
        prescriber_name: '',
        patient_name: '',
        batch_lot: '',
        expiry_date: '',
        quantity: item.quantity
      }));
      setRecipes(initial);
      setActiveItemIndex(0);
    }
  }, [isOpen, controlledItems]);

  const currentRecipe = recipes[activeItemIndex] || null;

  // Atualiza um campo da receita ativa
  const updateCurrentField = (field: keyof ControlledRecipeData, value: any) => {
    setRecipes(prev => {
      const updated = [...prev];
      if (!updated[activeItemIndex]) return prev;

      updated[activeItemIndex] = {
        ...updated[activeItemIndex],
        [field]: value
      };

      // Se applyToAll estiver ativo e alterou comprador, médico ou data, replica para os outros itens
      if (
        applyToAll &&
        [
          'buyer_name',
          'buyer_cpf',
          'buyer_rg',
          'buyer_rg_issuer',
          'buyer_address',
          'buyer_phone',
          'prescriber_council',
          'prescriber_number',
          'prescriber_uf',
          'prescriber_name',
          'prescription_date',
          'patient_name',
          'notification_number'
        ].includes(field)
      ) {
        for (let i = 0; i < updated.length; i++) {
          if (i !== activeItemIndex) {
            updated[i] = {
              ...updated[i],
              [field]: value
            };
          }
        }
      }

      return updated;
    });
  };

  // Busca rápida de Médicos
  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      if (prescriberSearch.trim().length >= 2) {
        setIsSearchingPrescriber(true);
        try {
          const res = await fetch(`/api/erp/controlled/prescribers?q=${encodeURIComponent(prescriberSearch)}`);
          if (res.ok) {
            const json = await res.json();
            setPrescribersFound(json.data || []);
            setShowPrescriberList(true);
          }
        } catch (_) {
        } finally {
          setIsSearchingPrescriber(false);
        }
      } else {
        setPrescribersFound([]);
        setShowPrescriberList(false);
      }
    }, 200);

    return () => clearTimeout(delayDebounce);
  }, [prescriberSearch]);

  // Busca rápida de Compradores
  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      if (buyerSearch.trim().length >= 2) {
        setIsSearchingBuyer(true);
        try {
          const res = await fetch(`/api/erp/controlled/buyers?q=${encodeURIComponent(buyerSearch)}`);
          if (res.ok) {
            const json = await res.json();
            setBuyersFound(json.data || []);
            setShowBuyerList(true);
          }
        } catch (_) {
        } finally {
          setIsSearchingBuyer(false);
        }
      } else {
        setBuyersFound([]);
        setShowBuyerList(false);
      }
    }, 200);

    return () => clearTimeout(delayDebounce);
  }, [buyerSearch]);

  // Seleciona um Prescritor do autocomplete
  const handleSelectPrescriber = (doc: any) => {
    updateCurrentField('prescriber_id', doc.id);
    updateCurrentField('prescriber_name', doc.name);
    updateCurrentField('prescriber_council', doc.council_type || 'CRM');
    updateCurrentField('prescriber_number', doc.council_number);
    updateCurrentField('prescriber_uf', doc.council_uf || 'MG');
    setShowPrescriberList(false);
    setPrescriberSearch('');
  };

  // Seleciona um Comprador do autocomplete
  const handleSelectBuyer = (b: any) => {
    updateCurrentField('buyer_id', b.id);
    updateCurrentField('buyer_name', b.name);
    updateCurrentField('buyer_cpf', b.cpf || '');
    updateCurrentField('buyer_rg', b.rg || '');
    updateCurrentField('buyer_rg_issuer', b.rg_issuer || 'SSP');
    updateCurrentField('buyer_address', b.address || '');
    updateCurrentField('buyer_phone', b.phone || '');
    setShowBuyerList(false);
    setBuyerSearch('');
  };

  // Validação e confirmação
  const handleConfirmAll = () => {
    for (let i = 0; i < recipes.length; i++) {
      const r = recipes[i];
      if (!r.buyer_name || r.buyer_name.trim().length < 3) {
        addToast(`Informe o nome completo do comprador para ${r.product_name}.`, 'warning');
        setActiveItemIndex(i);
        return;
      }
      if (!r.prescriber_name || !r.prescriber_number) {
        addToast(`Informe o médico e número de conselho para ${r.product_name}.`, 'warning');
        setActiveItemIndex(i);
        return;
      }
      if (!r.batch_lot) {
        addToast(`Informe o número do Lote para ${r.product_name} (exigido por lei).`, 'warning');
        setActiveItemIndex(i);
        return;
      }
    }

    onConfirm(recipes);
  };

  if (!isOpen || !currentRecipe) return null;

  // Temas de Cores da Receita Ativa
  const theme = {
    AMARELA: {
      badge: 'bg-amber-400 text-amber-950 border-amber-500',
      headerBg: 'bg-gradient-to-r from-amber-500 to-amber-600 text-amber-950',
      tabActive: 'bg-amber-400 text-amber-950 font-bold border-amber-500 shadow-sm',
      tabInactive: 'bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-300',
      iconColor: 'text-amber-800',
      name: 'Notificação de Receita A (Amarela)'
    },
    AZUL: {
      badge: 'bg-blue-500 text-white border-blue-600',
      headerBg: 'bg-gradient-to-r from-blue-600 to-blue-700 text-white',
      tabActive: 'bg-blue-500 text-white font-bold border-blue-600 shadow-sm',
      tabInactive: 'bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-300',
      iconColor: 'text-blue-600',
      name: 'Notificação de Receita B (Azul)'
    },
    BRANCA: {
      badge: 'bg-slate-700 text-white border-slate-800',
      headerBg: 'bg-gradient-to-r from-slate-700 to-slate-800 text-white',
      tabActive: 'bg-slate-700 text-white font-bold border-slate-800 shadow-sm',
      tabInactive: 'bg-slate-100 text-slate-800 hover:bg-slate-200 border-slate-300',
      iconColor: 'text-slate-700',
      name: 'Controle Especial 2 Vias (Branca)'
    },
    CREME: {
      badge: 'bg-amber-200 text-stone-900 border-amber-300',
      headerBg: 'bg-gradient-to-r from-amber-200 via-amber-300 to-yellow-300 text-stone-900',
      tabActive: 'bg-amber-200 text-stone-900 font-bold border-amber-400 shadow-sm',
      tabInactive: 'bg-yellow-50 text-stone-700 hover:bg-amber-100 border-amber-200',
      iconColor: 'text-amber-700',
      name: 'Antimicrobianos (Receita Creme / RDC 20)'
    }
  }[currentRecipe.recipe_type || 'BRANCA'];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Cabeçalho Temático da Receita */}
        <div className={`px-5 py-4 flex items-center justify-between ${theme.headerBg} shadow-sm`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-md">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight">Retenção de Receita Obrigatória</h2>
                <span className="text-xs uppercase font-extrabold px-2 py-0.5 rounded-full bg-white/30 tracking-wider">
                  SNGPC / ANVISA
                </span>
              </div>
              <p className="text-xs opacity-90 font-medium">
                {theme.name} • Portaria 344/98 e RDC 20/2011
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas de Itens Controlados no Carrinho */}
        {controlledItems.length > 1 && (
          <div className="px-5 pt-3 pb-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2 overflow-x-auto">
            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Medicamentos:</span>
            {controlledItems.map((item, idx) => {
              const itemType = item.recipe_type || 'BRANCA';
              const isSelected = activeItemIndex === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setActiveItemIndex(idx)}
                  className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all whitespace-nowrap ${
                    isSelected ? theme.tabActive : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <span className="font-bold">#{idx + 1}</span>
                  <span className="max-w-[140px] truncate">{item.name}</span>
                  <span className="opacity-75">({item.quantity}un)</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Corpo do Formulário */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Banner do Medicamento Ativo */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Medicamento a Dispensar</div>
              <div className="text-sm font-bold text-slate-900">{currentRecipe.product_name}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium">
                <Hash className="w-3.5 h-3.5 text-slate-400" />
                <span>Qtd: <strong>{currentRecipe.quantity} un</strong></span>
              </div>
              <div className={`px-3 py-1 rounded-lg text-xs font-bold border ${theme.badge}`}>
                {theme.name}
              </div>
            </div>
          </div>

          {/* Checkbox de Replicação */}
          {controlledItems.length > 1 && (
            <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-xl">
              <label className="flex items-center gap-2 text-xs font-semibold text-blue-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyToAll}
                  onChange={e => setApplyToAll(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-blue-300"
                />
                Aplicar mesmos dados de Comprador e Médico para todos os {controlledItems.length} medicamentos controlados
              </label>
              <span className="text-[11px] text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md font-medium">
                Preenchimento Ágil
              </span>
            </div>
          )}

          {/* GRID: Dados da Receita e Lote */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-slate-50/80 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nº Notificação / Receita
              </label>
              <input
                type="text"
                placeholder="Ex: 123456"
                value={currentRecipe.notification_number}
                onChange={e => updateCurrentField('notification_number', e.target.value)}
                className="w-full text-xs font-medium px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Data de Emissão da Receita *
              </label>
              <input
                type="date"
                value={currentRecipe.prescription_date}
                onChange={e => updateCurrentField('prescription_date', e.target.value)}
                className="w-full text-xs font-medium px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Paciente (Se diferente do comprador)
              </label>
              <input
                type="text"
                placeholder="Nome do paciente"
                value={currentRecipe.patient_name}
                onChange={e => updateCurrentField('patient_name', e.target.value)}
                className="w-full text-xs font-medium px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Lote e Validade do Medicamento */}
            <div className="md:col-span-2 grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
              <div>
                <label className="block text-xs font-bold text-amber-900 mb-1 flex items-center gap-1">
                  <span>Lote do Medicamento *</span>
                  <span className="text-[10px] text-amber-700 font-normal">(Exigência SNGPC)</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: L12345"
                  value={currentRecipe.batch_lot}
                  onChange={e => updateCurrentField('batch_lot', e.target.value.toUpperCase())}
                  className="w-full text-xs font-bold tracking-wider px-3 py-2 bg-amber-50/60 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Validade do Lote
                </label>
                <input
                  type="month"
                  value={currentRecipe.expiry_date ? currentRecipe.expiry_date.slice(0, 7) : ''}
                  onChange={e => updateCurrentField('expiry_date', e.target.value ? `${e.target.value}-01` : '')}
                  className="w-full text-xs font-medium px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="pt-2 border-t border-slate-200 flex items-center text-[11px] text-slate-500 italic">
              O número do lote garante a rastreabilidade da embalagem para a Vigilância Sanitária.
            </div>
          </div>

          {/* SEÇÃO: Médico / Prescritor */}
          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm relative">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Dados do Prescritor / Médico *
                </h3>
              </div>
              <span className="text-[11px] text-slate-500">Busca por CRM ou Nome</span>
            </div>

            {/* Input de Busca Rápida de Prescritor */}
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Digitar CRM ou Nome do médico para buscar no histórico..."
                value={prescriberSearch}
                onChange={e => setPrescriberSearch(e.target.value)}
                onFocus={() => { if (prescribersFound.length > 0) setShowPrescriberList(true); }}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />

              {/* Dropdown de Resultados de Médicos */}
              {showPrescriberList && prescribersFound.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {prescribersFound.map(doc => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => handleSelectPrescriber(doc)}
                      className="w-full px-3 py-2 text-left hover:bg-emerald-50 flex items-center justify-between text-xs transition-colors"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{doc.name}</div>
                        <div className="text-[11px] text-slate-500">{doc.specialty || 'Clínico'}</div>
                      </div>
                      <div className="font-mono text-[11px] px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold">
                        {doc.council_type} {doc.council_number}/{doc.council_uf}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Formulário de Campos do Prescritor */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Nome Completo do Prescritor *</label>
                <input
                  type="text"
                  placeholder="Dr(a). Nome Sobrenome"
                  value={currentRecipe.prescriber_name}
                  onChange={e => updateCurrentField('prescriber_name', e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Conselho *</label>
                <select
                  value={currentRecipe.prescriber_council}
                  onChange={e => updateCurrentField('prescriber_council', e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                >
                  <option value="CRM">CRM (Médico)</option>
                  <option value="CRO">CRO (Dentista)</option>
                  <option value="CRMV">CRMV (Veterinário)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Nº Registro *</label>
                  <input
                    type="text"
                    placeholder="12345"
                    value={currentRecipe.prescriber_number}
                    onChange={e => updateCurrentField('prescriber_number', e.target.value)}
                    className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">UF *</label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="MG"
                    value={currentRecipe.prescriber_uf}
                    onChange={e => updateCurrentField('prescriber_uf', e.target.value.toUpperCase())}
                    className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-center uppercase"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SEÇÃO: Comprador */}
          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm relative">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Dados do Comprador (Balcão) *
                </h3>
              </div>
              <span className="text-[11px] text-slate-500">Busca por CPF, Nome ou Telefone</span>
            </div>

            {/* Input de Busca Rápida de Comprador */}
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Digitar CPF, Nome ou Telefone para preenchimento imediato..."
                value={buyerSearch}
                onChange={e => setBuyerSearch(e.target.value)}
                onFocus={() => { if (buyersFound.length > 0) setShowBuyerList(true); }}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              {/* Dropdown de Resultados de Compradores */}
              {showBuyerList && buyersFound.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {buyersFound.map(b => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => handleSelectBuyer(b)}
                      className="w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center justify-between text-xs transition-colors"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{b.name}</div>
                        <div className="text-[11px] text-slate-500">{b.address || 'Sem endereço'}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-[11px] text-blue-800 font-bold">{b.cpf || 'Sem CPF'}</div>
                        <div className="text-[11px] text-slate-500">{b.phone || ''}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Formulário de Campos do Comprador */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Nome Completo do Comprador *</label>
                <input
                  type="text"
                  placeholder="Nome do cliente que está retirando"
                  value={currentRecipe.buyer_name}
                  onChange={e => updateCurrentField('buyer_name', e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">CPF do Comprador</label>
                <input
                  type="text"
                  placeholder="000.000.000-00"
                  value={currentRecipe.buyer_cpf}
                  onChange={e => updateCurrentField('buyer_cpf', e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">RG / Documento</label>
                <input
                  type="text"
                  placeholder="MG-12.345.678"
                  value={currentRecipe.buyer_rg}
                  onChange={e => updateCurrentField('buyer_rg', e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Órgão Emissor</label>
                <input
                  type="text"
                  placeholder="SSP/MG"
                  value={currentRecipe.buyer_rg_issuer}
                  onChange={e => updateCurrentField('buyer_rg_issuer', e.target.value.toUpperCase())}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Telefone de Contato</label>
                <input
                  type="text"
                  placeholder="(32) 99999-9999"
                  value={currentRecipe.buyer_phone}
                  onChange={e => updateCurrentField('buyer_phone', e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Endereço Completo</label>
                <input
                  type="text"
                  placeholder="Rua, Número, Bairro, Cidade - UF"
                  value={currentRecipe.buyer_address}
                  onChange={e => updateCurrentField('buyer_address', e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé com Botão de Confirmação e Atalhos */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>Dados salvos localmente para preenchimento automático futuro</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmAll}
              className={`px-5 py-2 rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-2 ${
                currentRecipe.recipe_type === 'AMARELA'
                  ? 'bg-amber-500 hover:bg-amber-600 text-amber-950'
                  : currentRecipe.recipe_type === 'AZUL'
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : currentRecipe.recipe_type === 'CREME'
                  ? 'bg-amber-300 hover:bg-amber-400 text-amber-950'
                  : 'bg-slate-800 hover:bg-slate-900 text-white'
              }`}
            >
              <CheckCircle className="w-4 h-4" />
              <span>Confirmar Receita e Ir para Pagamento</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

