import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  User, 
  Stethoscope, 
  Calendar, 
  CheckCircle, 
  X, 
  Search, 
  AlertTriangle,
  Copy,
  Hash,
  ShieldCheck,
  Building2
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
  initialBuyer?: {
    name?: string;
    cpf?: string;
    phone?: string;
    address?: string;
  };
  existingRecipes?: ControlledRecipeData[] | null;
}

export const ControlledRecipeModal: React.FC<ControlledRecipeModalProps> = ({
  isOpen,
  controlledItems,
  onClose,
  onConfirm,
  initialBuyer,
  existingRecipes
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

  const today = new Date().toISOString().split('T')[0];

  // Função auxiliar para gerar item padrão
  const buildDefaultRecipe = (item: ControlledProductItem): ControlledRecipeData => {
    const foundExisting = existingRecipes?.find(r => r.product_code === item.code);
    if (foundExisting) {
      return {
        ...foundExisting,
        quantity: item.quantity
      };
    }
    return {
      product_code: item.code,
      product_name: item.name,
      recipe_type: item.recipe_type || 'BRANCA',
      notification_number: '',
      prescription_date: today,
      buyer_id: '',
      buyer_name: initialBuyer?.name || '',
      buyer_cpf: initialBuyer?.cpf || '',
      buyer_rg: '',
      buyer_rg_issuer: 'SSP',
      buyer_address: initialBuyer?.address || '',
      buyer_phone: initialBuyer?.phone || '',
      prescriber_id: '',
      prescriber_council: 'CRM',
      prescriber_number: '',
      prescriber_uf: 'MG',
      prescriber_name: '',
      patient_name: initialBuyer?.name || '',
      batch_lot: '',
      expiry_date: '',
      quantity: item.quantity
    };
  };

  // Inicializa o estado das receitas quando abre o modal
  useEffect(() => {
    if (isOpen && controlledItems.length > 0) {
      const initial = controlledItems.map(buildDefaultRecipe);
      setRecipes(initial);
      setActiveItemIndex(0);
    }
  }, [isOpen, controlledItems, initialBuyer, existingRecipes]);

  // Fallback imediato para garantir renderização instantânea no primeiro frame
  const activeItem = controlledItems[activeItemIndex] || controlledItems[0];
  const currentRecipe = recipes[activeItemIndex] || (activeItem ? buildDefaultRecipe(activeItem) : null);

  // Atualiza um campo da receita ativa
  const updateCurrentField = (field: keyof ControlledRecipeData, value: any) => {
    setRecipes(prev => {
      let updated = [...prev];
      if (updated.length === 0 && controlledItems.length > 0) {
        updated = controlledItems.map(buildDefaultRecipe);
      }
      if (!updated[activeItemIndex]) {
        if (activeItem) {
          updated[activeItemIndex] = buildDefaultRecipe(activeItem);
        } else {
          return updated;
        }
      }

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
    const listToValidate = recipes.length > 0 ? recipes : (currentRecipe ? [currentRecipe] : []);
    for (let i = 0; i < listToValidate.length; i++) {
      const r = listToValidate[i];
      if (!r.prescriber_name || !r.prescriber_number) {
        addToast(`Informe o médico / prescritor e o número do conselho para ${r.product_name}.`, 'warning');
        setActiveItemIndex(i);
        return;
      }
      if (!r.buyer_name || r.buyer_name.trim().length < 3) {
        addToast(`Informe o nome completo do comprador que está retirando ${r.product_name}.`, 'warning');
        setActiveItemIndex(i);
        return;
      }
      if (!r.batch_lot) {
        addToast(`Informe o número do Lote para ${r.product_name} (exigência sanitária SNGPC).`, 'warning');
        setActiveItemIndex(i);
        return;
      }
    }

    onConfirm(listToValidate);
  };

  if (!isOpen || !currentRecipe) return null;

  // Temas e aparências oficiais dos formulários físicos da legislação brasileira
  const theme = {
    AMARELA: {
      officialTitle: 'NOTIFICAÇÃO DE RECEITA "A"',
      officialSub: 'ENTORPECENTES E PSICOTRÓPICOS (LISTAS A1, A2 E A3) • PORTARIA SVS/MS Nº 344/98',
      retentionVia: '1ª VIA - RETIDA NA FARMÁCIA (DISPENSAÇÃO)',
      paperBg: 'bg-[#FEFCE8]', // Amarelo canário característico
      paperBorder: 'border-amber-500',
      headerBg: 'bg-amber-400 text-amber-950 border-b-2 border-amber-600',
      boxBorder: 'border-amber-400/80 bg-amber-50/70',
      inputBg: 'bg-white/95 focus:bg-white border-amber-300 focus:border-amber-600',
      badgeColor: 'bg-amber-500 text-amber-950 border-amber-600',
      stampColor: 'text-amber-800 border-amber-800'
    },
    AZUL: {
      officialTitle: 'NOTIFICAÇÃO DE RECEITA "B"',
      officialSub: 'PSICOTRÓPICOS (LISTAS B1 E B2) • PORTARIA SVS/MS Nº 344/98',
      retentionVia: '1ª VIA - RETIDA NA FARMÁCIA (DISPENSAÇÃO)',
      paperBg: 'bg-[#F0F9FF]', // Azul notificação
      paperBorder: 'border-sky-500',
      headerBg: 'bg-sky-500 text-white border-b-2 border-sky-700',
      boxBorder: 'border-sky-300/80 bg-sky-50/70',
      inputBg: 'bg-white/95 focus:bg-white border-sky-300 focus:border-sky-600',
      badgeColor: 'bg-sky-600 text-white border-sky-700',
      stampColor: 'text-sky-800 border-sky-800'
    },
    CREME: {
      officialTitle: 'RECEITUÁRIO DE ANTIMICROBIANOS',
      officialSub: 'CONTROLE DE ANTIBIÓTICOS • RDC ANVISA Nº 20/2011 (VALIDADE DE 10 DIAS)',
      retentionVia: '1ª VIA - RETIDA NA FARMÁCIA • 2ª VIA - PACIENTE',
      paperBg: 'bg-[#FFFBEB]', // Creme característico
      paperBorder: 'border-amber-400',
      headerBg: 'bg-amber-200 text-amber-950 border-b-2 border-amber-400',
      boxBorder: 'border-amber-300/80 bg-amber-50/60',
      inputBg: 'bg-white/95 focus:bg-white border-amber-300 focus:border-amber-600',
      badgeColor: 'bg-amber-300 text-amber-950 border-amber-500',
      stampColor: 'text-amber-900 border-amber-900'
    },
    BRANCA: {
      officialTitle: 'RECEITUÁRIO DE CONTROLE ESPECIAL',
      officialSub: 'SUBSTÂNCIAS DAS LISTAS C1, C2, C4 E C5 • PORTARIA SVS/MS Nº 344/98',
      retentionVia: '1ª VIA - RETENÇÃO DA FARMÁCIA • 2ª VIA - ORIENTAÇÃO DO PACIENTE',
      paperBg: 'bg-white',
      paperBorder: 'border-slate-400',
      headerBg: 'bg-slate-800 text-white border-b-2 border-slate-900',
      boxBorder: 'border-slate-300 bg-slate-50/80',
      inputBg: 'bg-white focus:bg-white border-slate-300 focus:border-slate-700',
      badgeColor: 'bg-slate-700 text-white border-slate-800',
      stampColor: 'text-slate-800 border-slate-800'
    }
  }[currentRecipe.recipe_type || 'BRANCA'];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      {/* Moldura de Papel Oficial com Borda Dupla Típica de Talonário Sanitário */}
      <div className={`w-full max-w-4xl max-h-[94vh] flex flex-col rounded-xl shadow-2xl border-4 ${theme.paperBorder} ${theme.paperBg} overflow-hidden animate-in fade-in zoom-in-95 duration-150`}>
        
        {/* CABEÇALHO OFICIAL DO FORMULÁRIO SANITÁRIO (ESTILO TALONÁRIO ANVISA) */}
        <div className={`p-4 ${theme.headerBg} flex items-center justify-between shrink-0 shadow-sm relative`}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg border border-white/30 backdrop-blur-sm shadow-inner shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-mono tracking-widest uppercase bg-black/20 px-2 py-0.5 rounded font-black">
                  REPÚBLICA FEDERATIVA DO BRASIL • ANVISA / MS
                </span>
                <span className="text-[10px] font-mono tracking-wider uppercase bg-white/30 px-2 py-0.5 rounded font-black">
                  {theme.retentionVia}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black tracking-wide uppercase mt-0.5">
                {theme.officialTitle}
              </h2>
              <p className="text-[11px] font-medium opacity-95">
                {theme.officialSub}
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-black/20 rounded-lg transition-colors shrink-0 text-current"
            title="Fechar (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ABAS CASO HAJA MAIS DE UM MEDICAMENTO CONTROLADO NA VENDA */}
        {controlledItems.length > 1 && (
          <div className="px-4 py-2 bg-black/5 border-b border-black/10 flex items-center gap-2 overflow-x-auto shrink-0">
            <span className="text-xs font-black uppercase text-slate-700 whitespace-nowrap">
              Medicamentos ({controlledItems.length}):
            </span>
            {controlledItems.map((item, idx) => {
              const isSelected = activeItemIndex === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setActiveItemIndex(idx)}
                  className={`text-xs px-3 py-1 rounded-lg border font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                    isSelected 
                      ? 'bg-slate-900 text-white border-slate-950 shadow-md ring-1 ring-slate-700' 
                      : 'bg-white/80 text-slate-700 border-slate-300 hover:bg-white'
                  }`}
                >
                  <span className="opacity-80">#{idx + 1}</span>
                  <span className="max-w-[150px] truncate">{item.name}</span>
                  <span className="text-[10px] bg-black/10 px-1 rounded">Qtd: {item.quantity}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* CORPO DO FORMULÁRIO (ESTRUTURADO EM QUADROS OFICIAIS CONFORME A LEI) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-slate-900 font-sans">

          {/* FAIXA SUPERIOR: IDENTIFICADOR DA NOTIFICAÇÃO E DATA DE PRESCRIÇÃO */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3 rounded-lg border-2 border-dashed border-slate-400 bg-white/70 shadow-sm">
            <div className="sm:col-span-4">
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1">
                Nº Notificação / Talonário *
              </label>
              <input
                type="text"
                placeholder="Ex: MG 098451"
                value={currentRecipe.notification_number}
                onChange={e => updateCurrentField('notification_number', e.target.value.toUpperCase())}
                className={`w-full text-xs font-mono font-black px-3 py-1.5 rounded border ${theme.inputBg} focus:outline-none focus:ring-1 focus:ring-slate-800`}
              />
              <span className="text-[10px] text-slate-500 font-mono">Impresso no topo da receita física</span>
            </div>

            <div className="sm:col-span-3">
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1">
                UF Notificação *
              </label>
              <input
                type="text"
                maxLength={2}
                placeholder="MG"
                value={currentRecipe.prescriber_uf}
                onChange={e => updateCurrentField('prescriber_uf', e.target.value.toUpperCase())}
                className={`w-full text-xs font-mono font-black text-center uppercase px-3 py-1.5 rounded border ${theme.inputBg} focus:outline-none focus:ring-1 focus:ring-slate-800`}
              />
            </div>

            <div className="sm:col-span-5">
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1">
                Data da Prescrição Médica *
              </label>
              <input
                type="date"
                value={currentRecipe.prescription_date}
                onChange={e => updateCurrentField('prescription_date', e.target.value)}
                className={`w-full text-xs font-mono font-bold px-3 py-1.5 rounded border ${theme.inputBg} focus:outline-none focus:ring-1 focus:ring-slate-800`}
              />
              <span className="text-[10px] text-slate-500 font-mono">Validade regulamentar: 30 dias (Antimicrobianos: 10 dias)</span>
            </div>
          </div>

          {/* QUADRO I: IDENTIFICAÇÃO DO EMITENTE / PROFISSIONAL PRESCRITOR */}
          <div className={`p-3.5 rounded-lg border ${theme.boxBorder} shadow-sm relative space-y-2`}>
            <div className="flex items-center justify-between border-b border-black/10 pb-1.5">
              <div className="flex items-center gap-1.5">
                <Stethoscope className="w-4 h-4 text-slate-800" />
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-900">
                  I. Identificação do Emitente (Prescritor / Médico)
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-600 bg-white/60 px-1.5 py-0.5 rounded border border-black/10">
                Portaria 344/98 - Art. 35
              </span>
            </div>

            {/* Busca Rápida de Prescritor Cadastrado */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                placeholder="Pesquisar médico já cadastrado por CRM ou Nome..."
                value={prescriberSearch}
                onChange={e => setPrescriberSearch(e.target.value)}
                onFocus={() => { if (prescribersFound.length > 0) setShowPrescriberList(true); }}
                className="w-full pl-8 pr-3 py-1 bg-white/90 border border-slate-300 rounded text-xs focus:outline-none focus:border-slate-700 font-medium"
              />
              {showPrescriberList && prescribersFound.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-xl z-30 max-h-40 overflow-y-auto divide-y divide-slate-100">
                  {prescribersFound.map(doc => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => handleSelectPrescriber(doc)}
                      className="w-full px-3 py-1.5 text-left hover:bg-slate-100 flex items-center justify-between text-xs transition-colors"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{doc.name}</div>
                        <div className="text-[10px] text-slate-500">{doc.specialty || 'Clínico Geral'}</div>
                      </div>
                      <span className="font-mono text-[10px] font-bold bg-slate-200 px-1.5 py-0.5 rounded">
                        {doc.council_type} {doc.council_number}/{doc.council_uf}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Campos Formais do Prescritor */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
              <div className="sm:col-span-7">
                <label className="block text-[10px] font-bold uppercase text-slate-700 mb-0.5">
                  Nome Completo do Prescritor *
                </label>
                <input
                  type="text"
                  placeholder="Dr(a). Nome e Sobrenome"
                  value={currentRecipe.prescriber_name}
                  onChange={e => updateCurrentField('prescriber_name', e.target.value)}
                  className={`w-full text-xs font-bold px-2.5 py-1.5 rounded border ${theme.inputBg} focus:outline-none`}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold uppercase text-slate-700 mb-0.5">
                  Conselho *
                </label>
                <select
                  value={currentRecipe.prescriber_council}
                  onChange={e => updateCurrentField('prescriber_council', e.target.value)}
                  className={`w-full text-xs font-bold px-2 py-1.5 rounded border ${theme.inputBg} focus:outline-none`}
                >
                  <option value="CRM">CRM</option>
                  <option value="CRO">CRO</option>
                  <option value="CRMV">CRMV</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[10px] font-bold uppercase text-slate-700 mb-0.5">
                  Nº Inscrição *
                </label>
                <input
                  type="text"
                  placeholder="12345"
                  value={currentRecipe.prescriber_number}
                  onChange={e => updateCurrentField('prescriber_number', e.target.value)}
                  className={`w-full text-xs font-mono font-bold px-2.5 py-1.5 rounded border ${theme.inputBg} focus:outline-none`}
                />
              </div>
            </div>
          </div>

          {/* QUADRO II: IDENTIFICAÇÃO DO PACIENTE */}
          <div className={`p-3.5 rounded-lg border ${theme.boxBorder} shadow-sm space-y-2`}>
            <div className="flex items-center justify-between border-b border-black/10 pb-1.5">
              <div className="flex items-center gap-1.5">
                <User className="w-4 h-4 text-slate-800" />
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-900">
                  II. Identificação do Paciente
                </h3>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-700 mb-0.5">
                Nome Completo do Paciente *
              </label>
              <input
                type="text"
                placeholder="Nome completo do paciente que utilizará o medicamento"
                value={currentRecipe.patient_name}
                onChange={e => updateCurrentField('patient_name', e.target.value)}
                className={`w-full text-xs font-bold px-2.5 py-1.5 rounded border ${theme.inputBg} focus:outline-none`}
              />
            </div>
          </div>

          {/* QUADRO III: DISPENSAÇÃO & RASTREABILIDADE (SNGPC) */}
          <div className={`p-3.5 rounded-lg border-2 border-dashed border-amber-500/80 bg-amber-500/10 shadow-sm space-y-2`}>
            <div className="flex items-center justify-between border-b border-black/10 pb-1.5">
              <div className="flex items-center gap-1.5">
                <Hash className="w-4 h-4 text-amber-900" />
                <h3 className="text-xs font-black uppercase tracking-wide text-amber-950">
                  III. Medicamento Dispensado & Rastreabilidade de Lote (SNGPC)
                </h3>
              </div>
              <span className="text-[10px] font-bold bg-amber-200 text-amber-950 px-1.5 py-0.5 rounded border border-amber-300">
                Obrigatório para Vigilância Sanitária
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-6">
                <label className="block text-[10px] font-bold uppercase text-slate-700 mb-0.5">
                  Medicamento
                </label>
                <div className="px-3 py-1.5 bg-white rounded border border-slate-300 text-xs font-black text-slate-900 truncate">
                  {currentRecipe.product_name}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold uppercase text-slate-700 mb-0.5">
                  Qtd
                </label>
                <div className="px-3 py-1.5 bg-white rounded border border-slate-300 text-xs font-black text-center text-slate-900">
                  {currentRecipe.quantity} un
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] font-black uppercase text-amber-950 mb-0.5 flex items-center gap-1">
                  <span>Lote *</span>
                  <span className="text-rose-600 font-bold">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: L12345"
                  value={currentRecipe.batch_lot}
                  onChange={e => updateCurrentField('batch_lot', e.target.value.toUpperCase())}
                  className="w-full text-xs font-mono font-black px-2.5 py-1.5 rounded border-2 border-amber-400 bg-white focus:outline-none focus:border-amber-600 text-amber-950 uppercase"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold uppercase text-slate-700 mb-0.5">
                  Validade
                </label>
                <input
                  type="month"
                  value={currentRecipe.expiry_date ? currentRecipe.expiry_date.slice(0, 7) : ''}
                  onChange={e => updateCurrentField('expiry_date', e.target.value ? `${e.target.value}-01` : '')}
                  className="w-full text-xs font-mono font-medium px-2 py-1.5 rounded border border-slate-300 bg-white focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* QUADRO IV: IDENTIFICAÇÃO DO COMPRADOR (QUEM RETIRA NA FARMÁCIA) */}
          <div className={`p-3.5 rounded-lg border ${theme.boxBorder} shadow-sm space-y-2`}>
            <div className="flex items-center justify-between border-b border-black/10 pb-1.5">
              <div className="flex items-center gap-1.5">
                <User className="w-4 h-4 text-slate-800" />
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-900">
                  IV. Identificação do Comprador (Pessoa que retira na Farmácia)
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-600">
                Portaria 344/98 - Art. 36
              </span>
            </div>

            {/* Busca Rápida de Comprador */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                placeholder="Pesquisar comprador por CPF ou Nome..."
                value={buyerSearch}
                onChange={e => setBuyerSearch(e.target.value)}
                onFocus={() => { if (buyersFound.length > 0) setShowBuyerList(true); }}
                className="w-full pl-8 pr-3 py-1 bg-white/90 border border-slate-300 rounded text-xs focus:outline-none focus:border-slate-700 font-medium"
              />
              {showBuyerList && buyersFound.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-xl z-30 max-h-40 overflow-y-auto divide-y divide-slate-100">
                  {buyersFound.map(b => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => handleSelectBuyer(b)}
                      className="w-full px-3 py-1.5 text-left hover:bg-slate-100 flex items-center justify-between text-xs transition-colors"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{b.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{b.cpf ? `CPF: ${b.cpf}` : 'Sem CPF'}</div>
                      </div>
                      <span className="text-[10px] text-slate-500 max-w-[200px] truncate">{b.address || ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Linha 1: Nome, CPF e Telefone */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
              <div className="sm:col-span-6">
                <label className="block text-[10px] font-bold uppercase text-slate-700 mb-0.5">
                  Nome Completo do Comprador *
                </label>
                <input
                  type="text"
                  placeholder="Nome de quem está no balcão"
                  value={currentRecipe.buyer_name}
                  onChange={e => updateCurrentField('buyer_name', e.target.value)}
                  className={`w-full text-xs font-bold px-2.5 py-1.5 rounded border ${theme.inputBg} focus:outline-none`}
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[10px] font-bold uppercase text-slate-700 mb-0.5">
                  CPF do Comprador
                </label>
                <input
                  type="text"
                  placeholder="000.000.000-00"
                  value={currentRecipe.buyer_cpf}
                  onChange={e => updateCurrentField('buyer_cpf', e.target.value)}
                  className={`w-full text-xs font-mono font-bold px-2.5 py-1.5 rounded border ${theme.inputBg} focus:outline-none`}
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[10px] font-bold uppercase text-slate-700 mb-0.5">
                  Telefone de Contato
                </label>
                <input
                  type="text"
                  placeholder="(32) 99999-9999"
                  value={currentRecipe.buyer_phone}
                  onChange={e => updateCurrentField('buyer_phone', e.target.value)}
                  className={`w-full text-xs font-medium px-2.5 py-1.5 rounded border ${theme.inputBg} focus:outline-none`}
                />
              </div>
            </div>

            {/* Linha 2: RG, Órgão e Endereço Completo */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-3">
                <label className="block text-[10px] font-bold uppercase text-slate-700 mb-0.5">
                  Doc. Identidade (RG)
                </label>
                <input
                  type="text"
                  placeholder="Ex: MG-15.421.902"
                  value={currentRecipe.buyer_rg}
                  onChange={e => updateCurrentField('buyer_rg', e.target.value.toUpperCase())}
                  className={`w-full text-xs font-mono font-medium px-2.5 py-1.5 rounded border ${theme.inputBg} focus:outline-none`}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold uppercase text-slate-700 mb-0.5">
                  Órgão / UF
                </label>
                <input
                  type="text"
                  placeholder="SSP/MG"
                  value={currentRecipe.buyer_rg_issuer}
                  onChange={e => updateCurrentField('buyer_rg_issuer', e.target.value.toUpperCase())}
                  className={`w-full text-xs font-mono font-bold text-center uppercase px-2 py-1.5 rounded border ${theme.inputBg} focus:outline-none`}
                />
              </div>

              <div className="sm:col-span-7">
                <label className="block text-[10px] font-bold uppercase text-slate-700 mb-0.5">
                  Endereço Residencial Completo
                </label>
                <input
                  type="text"
                  placeholder="Rua, Número, Bairro, Cidade - UF"
                  value={currentRecipe.buyer_address}
                  onChange={e => updateCurrentField('buyer_address', e.target.value)}
                  className={`w-full text-xs font-medium px-2.5 py-1.5 rounded border ${theme.inputBg} focus:outline-none`}
                />
              </div>
            </div>
          </div>

          {/* QUADRO V: IDENTIFICAÇÃO DO ESTABELECIMENTO DISPENSADOR (FARMÁCIA) */}
          <div className="p-3 rounded-lg border border-slate-300 bg-white/70 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-700" />
              <div>
                <span className="font-bold text-slate-900">Drogaria BelaFarma Ltda</span>
                <span className="text-slate-500 font-mono ml-2">CNPJ: 19.349.882/0001-44</span>
              </div>
            </div>

            <div className="flex items-center gap-4 text-slate-600 font-mono text-[11px]">
              <div>
                Data de Atendimento: <strong className="text-slate-900">{new Date().toLocaleDateString('pt-BR')}</strong>
              </div>
              <div className="border-l border-slate-300 pl-4">
                Visto do Farmacêutico: <span className="italic text-slate-800">Assinatura Eletrônica SNGPC</span>
              </div>
            </div>
          </div>

          {/* REPLICAR DADOS ENTRE MEDICAMENTOS */}
          {controlledItems.length > 1 && (
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-bold text-blue-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyToAll}
                  onChange={e => setApplyToAll(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span>Replicar dados de Médico e Comprador para os outros {controlledItems.length - 1} medicamentos controlados</span>
              </label>
              <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                Preenchimento Rápido
              </span>
            </div>
          )}

        </div>

        {/* RODAPÉ COM AÇÕES */}
        <div className="p-3 bg-slate-900 text-white flex items-center justify-between shrink-0 border-t border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className="font-mono text-amber-400 font-bold">* Campos obrigatórios</span>
            <span>• Notificação retida será registrada no Livro Sanitário do SNGPC</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-bold transition-colors"
            >
              Cancelar (ESC)
            </button>
            <button
              type="button"
              onClick={handleConfirmAll}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4 text-white" />
              <span>Confirmar e Vincular Receita</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
