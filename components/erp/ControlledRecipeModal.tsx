import React, { useState, useEffect, useRef, useId, useCallback } from 'react';
import {
  Stethoscope,
  CheckCircle,
  X,
  Search,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Layers,
  Plus,
  Check
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

export interface SelectedLotEntry {
  lote_id?: number | string | null;
  batch_lot: string;
  available_qty?: number | null;
  manufacture_date?: string;
  expiry_date?: string;
  quantity: number;
  registro_ms?: string;
  is_expired?: boolean;
  is_manual?: boolean;
  source?: string;
}

export interface ControlledRecipeData {
  product_code: string;
  product_name: string;
  recipe_type: 'AMARELA' | 'AZUL' | 'BRANCA' | 'CREME';
  registro_ms?: string;
  therapeutic_class?: string;
  notification_uf?: string;
  notification_number: string;
  prescription_date: string;
  prescribed_qty?: number;
  medicine_use?: 'HUMANO' | 'VETERINARIO';
  buyer_id?: string;
  buyer_code?: string;
  buyer_doc_type?: string;
  buyer_doc_number?: string;
  buyer_doc_uf?: string;
  buyer_name: string;
  buyer_cpf: string;
  buyer_rg: string;
  buyer_rg_issuer: string;
  buyer_address: string;
  buyer_neighborhood?: string;
  buyer_city?: string;
  buyer_uf?: string;
  buyer_phone: string;
  prescriber_id?: string;
  prescriber_council: string;
  prescriber_number: string;
  prescriber_uf: string;
  prescriber_name: string;
  patient_name: string;
  patient_age?: string;
  patient_age_unit?: 'ANOS' | 'MESES' | 'DIAS';
  patient_sex?: '' | 'M' | 'F';
  cid?: string;
  prolonged_use?: boolean;
  batch_lot: string;
  expiry_date: string;
  selected_lots?: SelectedLotEntry[];
  quantity: number;
}

interface ProductLotInfo {
  product_code: string;
  product_name: string;
  registro_ms: string;
  therapeutic_class: string;
  source: string;
  lots: Array<{
    lote_id?: number | string | null;
    batch_lot: string;
    available_qty: number | null;
    manufacture_date: string;
    expiry_date: string;
    is_expired: boolean;
    registro_ms: string;
    source: string;
  }>;
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
  initialActiveCode?: string | null;
}

const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

const DOC_TYPES = [
  { value: 'RG', label: 'Carteira de Identidade (RG)' },
  { value: 'CPF', label: 'Cadastro de Pessoa Física (CPF)' },
  { value: 'CR_PROF', label: 'Carteira de Registro Profissional' },
  { value: 'CNH', label: 'Carteira Nacional de Habilitação (CNH)' },
  { value: 'CTPS', label: 'Carteira de Trabalho (CTPS)' },
  { value: 'PASSAPORTE', label: 'Passaporte' },
  { value: 'CERTIDAO', label: 'Certidão de Nascimento' }
];

const ISSUER_OPTIONS = ['SSP', 'DETRAN', 'IFP', 'DPF', 'MTE', 'PC', 'CRM', 'OAB', 'CBM', 'CFP', 'SESP', 'OUTROS'];

const COUNCIL_OPTIONS = ['CRM', 'CRO', 'CRMV', 'RMS', 'CRF'];

function formatDateBr(isoDate?: string): string {
  if (!isoDate) return '-';
  const clean = String(isoDate).slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return clean;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function getDefaultTherapeuticClass(recipeType: string): string {
  if (recipeType === 'CREME') return 'ANTIMICROBIANO';
  if (recipeType === 'AMARELA') return 'ENTORPECENTE / LISTA A';
  if (recipeType === 'AZUL') return 'PSICOTRÓPICO / LISTA B';
  return 'CONTROLE ESPECIAL (C1/C5)';
}

function sanitizeQtyInt(raw: string): number {
  const n = parseInt(String(raw || '').replace(/\D/g, ''), 10);
  return isNaN(n) || n < 0 ? 0 : n;
}

export const ControlledRecipeModal: React.FC<ControlledRecipeModalProps> = ({
  isOpen,
  controlledItems,
  onClose,
  onConfirm,
  initialBuyer,
  existingRecipes,
  initialActiveCode
}) => {
  const { addToast } = useToast();
  const baseId = useId();
  const mainDialogRef = useRef<HTMLDialogElement>(null);
  const lotsDialogRef = useRef<HTMLDialogElement>(null);
  const prescriberSearchRef = useRef<HTMLInputElement>(null);
  const prescriberNumberRef = useRef<HTMLInputElement>(null);
  const buyerNameRef = useRef<HTMLInputElement>(null);
  const clientCodeInputRef = useRef<HTMLInputElement>(null);
  const lotsFirstInputRef = useRef<HTMLInputElement>(null);
  const autoOpenedLotsRef = useRef<Set<string>>(new Set());

  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [recipes, setRecipes] = useState<ControlledRecipeData[]>([]);
  const [applyToAll, setApplyToAll] = useState(true);

  // Estado de validação pós-interação (modern-web-guidance: validate-input-after-interaction)
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [liveErrorMsg, setLiveErrorMsg] = useState('');

  // Cache e estado de lotes por produto
  const [lotsCache, setLotsCache] = useState<Record<string, ProductLotInfo>>({});
  const [loadingLotsCode, setLoadingLotsCode] = useState<string | null>(null);
  const [isLotsDialogOpen, setIsLotsDialogOpen] = useState(false);
  const [hideExpiredLots, setHideExpiredLots] = useState(false);
  const [draftLots, setDraftLots] = useState<SelectedLotEntry[]>([]);
  const [showManualLotForm, setShowManualLotForm] = useState(false);
  const [manualLotDraft, setManualLotDraft] = useState({
    batch_lot: '',
    manufacture_date: '',
    expiry_date: '',
    quantity: '1'
  });

  // Autocomplete / Busca Prescritor
  const [prescribersFound, setPrescribersFound] = useState<any[]>([]);
  const [isSearchingPrescriber, setIsSearchingPrescriber] = useState(false);
  const [showPrescriberList, setShowPrescriberList] = useState(false);

  // Identificação de Cliente / Comprador já cadastrado
  const [clientLookupInput, setClientLookupInput] = useState('');
  const [buyersFound, setBuyersFound] = useState<any[]>([]);
  const [isSearchingBuyer, setIsSearchingBuyer] = useState(false);
  const [showBuyerList, setShowBuyerList] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const buildDefaultRecipe = useCallback((item: ControlledProductItem): ControlledRecipeData => {
    const foundExisting = existingRecipes?.find(r => r.product_code === item.code);
    if (foundExisting) {
      return {
        ...foundExisting,
        therapeutic_class: foundExisting.therapeutic_class || getDefaultTherapeuticClass(foundExisting.recipe_type || item.recipe_type),
        notification_uf: foundExisting.notification_uf || foundExisting.prescriber_uf || 'MG',
        prescribed_qty: foundExisting.prescribed_qty ?? item.quantity,
        medicine_use: foundExisting.medicine_use || 'HUMANO',
        buyer_doc_type: foundExisting.buyer_doc_type || (foundExisting.buyer_rg ? 'RG' : (foundExisting.buyer_cpf ? 'CPF' : 'RG')),
        buyer_doc_number: foundExisting.buyer_doc_number || foundExisting.buyer_rg || foundExisting.buyer_cpf || '',
        buyer_doc_uf: foundExisting.buyer_doc_uf || 'MG',
        buyer_city: foundExisting.buyer_city || 'JUIZ DE FORA',
        buyer_uf: foundExisting.buyer_uf || 'MG',
        patient_age_unit: foundExisting.patient_age_unit || 'ANOS',
        patient_sex: foundExisting.patient_sex || '',
        quantity: item.quantity
      };
    }

    const firstShared = existingRecipes?.[0];
    return {
      product_code: item.code,
      product_name: item.name,
      recipe_type: item.recipe_type || 'BRANCA',
      registro_ms: '',
      therapeutic_class: getDefaultTherapeuticClass(item.recipe_type || 'BRANCA'),
      notification_uf: firstShared?.notification_uf || 'MG',
      notification_number: firstShared?.notification_number || '',
      prescription_date: firstShared?.prescription_date || today,
      prescribed_qty: item.quantity,
      medicine_use: firstShared?.medicine_use || 'HUMANO',
      buyer_id: firstShared?.buyer_id || '',
      buyer_code: firstShared?.buyer_code || '',
      buyer_doc_type: firstShared?.buyer_doc_type || (initialBuyer?.cpf ? 'CPF' : 'RG'),
      buyer_doc_number: firstShared?.buyer_doc_number || initialBuyer?.cpf || '',
      buyer_doc_uf: firstShared?.buyer_doc_uf || 'MG',
      buyer_name: firstShared?.buyer_name || initialBuyer?.name || '',
      buyer_cpf: firstShared?.buyer_cpf || initialBuyer?.cpf || '',
      buyer_rg: firstShared?.buyer_rg || '',
      buyer_rg_issuer: firstShared?.buyer_rg_issuer || 'SSP',
      buyer_address: firstShared?.buyer_address || initialBuyer?.address || '',
      buyer_neighborhood: firstShared?.buyer_neighborhood || '',
      buyer_city: firstShared?.buyer_city || 'JUIZ DE FORA',
      buyer_uf: firstShared?.buyer_uf || 'MG',
      buyer_phone: firstShared?.buyer_phone || initialBuyer?.phone || '',
      prescriber_id: firstShared?.prescriber_id || '',
      prescriber_council: firstShared?.prescriber_council || 'CRM',
      prescriber_number: firstShared?.prescriber_number || '',
      prescriber_uf: firstShared?.prescriber_uf || 'MG',
      prescriber_name: firstShared?.prescriber_name || '',
      patient_name: firstShared?.patient_name || initialBuyer?.name || '',
      patient_age: firstShared?.patient_age || '',
      patient_age_unit: firstShared?.patient_age_unit || 'ANOS',
      patient_sex: firstShared?.patient_sex || '',
      cid: firstShared?.cid || '',
      prolonged_use: Boolean(firstShared?.prolonged_use),
      batch_lot: '',
      expiry_date: '',
      selected_lots: [],
      quantity: item.quantity
    };
  }, [existingRecipes, initialBuyer, today]);

  // Sincronização declarativa com <dialog>.showModal() (modern-web-guidance: dialog)
  useEffect(() => {
    const dlg = mainDialogRef.current;
    if (!dlg) return;
    if (isOpen) {
      if (!dlg.open) {
        dlg.showModal();
      }
    } else {
      if (lotsDialogRef.current?.open) lotsDialogRef.current.close();
      setIsLotsDialogOpen(false);
      if (dlg.open) dlg.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const lotsDlg = lotsDialogRef.current;
    if (!lotsDlg) return;
    if (isLotsDialogOpen) {
      if (!lotsDlg.open) {
        lotsDlg.showModal();
        requestAnimationFrame(() => {
          lotsFirstInputRef.current?.focus();
          lotsFirstInputRef.current?.select();
        });
      }
    } else if (lotsDlg.open) {
      lotsDlg.close();
    }
  }, [isLotsDialogOpen]);

  // Inicializa receitas ao abrir a modal
  useEffect(() => {
    if (isOpen && controlledItems.length > 0) {
      const initial = controlledItems.map(buildDefaultRecipe);
      setRecipes(initial);
      const targetIdx = initialActiveCode
        ? Math.max(0, controlledItems.findIndex(it => it.code === initialActiveCode))
        : 0;
      setActiveItemIndex(targetIdx);
      setTouchedFields({});
      setHasAttemptedSubmit(false);
      setLiveErrorMsg('');
      setShowPrescriberList(false);
      setShowBuyerList(false);
      setClientLookupInput('');
    } else if (!isOpen) {
      autoOpenedLotsRef.current.clear();
    }
  }, [isOpen, controlledItems, initialActiveCode, buildDefaultRecipe]);

  const activeItem = controlledItems[activeItemIndex] || controlledItems[0];
  const currentRecipe = recipes[activeItemIndex] || (activeItem ? buildDefaultRecipe(activeItem) : null);

  const openLotsSelectorForItem = useCallback((item: ControlledProductItem, recipe: ControlledRecipeData | null, info: ProductLotInfo | null) => {
    const serverLots = info?.lots || [];
    const existingSelected = recipe?.selected_lots || [];

    const rows: SelectedLotEntry[] = serverLots.map((sl) => {
      const match = existingSelected.find(e => e.batch_lot === sl.batch_lot);
      return {
        lote_id: sl.lote_id,
        batch_lot: sl.batch_lot,
        available_qty: sl.available_qty,
        manufacture_date: sl.manufacture_date,
        expiry_date: sl.expiry_date,
        is_expired: sl.is_expired,
        registro_ms: sl.registro_ms,
        source: sl.source,
        quantity: match ? match.quantity : 0
      };
    });

    // Preserva eventuais lotes manuais já escolhidos
    for (const ex of existingSelected) {
      if (ex.batch_lot && !rows.some(r => r.batch_lot === ex.batch_lot)) {
        rows.push({ ...ex, is_manual: true });
      }
    }

    // Se ainda não há quantidade selecionada em nenhum lote, pré-seleciona FEFO automaticamente (como Digifarma)
    const sumSelected = rows.reduce((acc, r) => acc + (r.quantity || 0), 0);
    if (sumSelected === 0 && rows.length > 0) {
      let remaining = Math.max(1, item.quantity || 1);
      // Prioriza lotes não vencidos primeiro (FEFO)
      const orderIndices = rows
        .map((r, idx) => ({ r, idx }))
        .sort((a, b) => Number(Boolean(a.r.is_expired)) - Number(Boolean(b.r.is_expired)))
        .map(x => x.idx);

      for (const idx of orderIndices) {
        if (remaining <= 0) break;
        const avail = rows[idx].available_qty;
        const take = avail !== null && avail !== undefined && avail > 0 ? Math.min(remaining, avail) : remaining;
        if (take > 0) {
          rows[idx] = { ...rows[idx], quantity: take };
          remaining -= take;
        }
      }
    }

    setDraftLots(rows);
    setShowManualLotForm(rows.length === 0);
    setManualLotDraft({
      batch_lot: recipe?.batch_lot && rows.length === 0 ? recipe.batch_lot : '',
      manufacture_date: '',
      expiry_date: recipe?.expiry_date && rows.length === 0 ? recipe.expiry_date : '',
      quantity: String(item.quantity || 1)
    });
    setIsLotsDialogOpen(true);
  }, []);

  // Carrega Registro MS e Lotes do Digifarma para o item ativo
  useEffect(() => {
    if (!isOpen || !activeItem?.code) return;
    const code = activeItem.code;
    let cancelled = false;

    const applyLotInfoToItem = (info: ProductLotInfo) => {
      setRecipes(prev => prev.map((rec, idx) => {
        if (idx !== activeItemIndex) return rec;
        return {
          ...rec,
          registro_ms: rec.registro_ms || info.registro_ms || '',
          therapeutic_class: info.therapeutic_class || rec.therapeutic_class
        };
      }));
    };

    const cached = lotsCache[code];
    if (cached) {
      applyLotInfoToItem(cached);
      if (
        !currentRecipe?.batch_lot &&
        cached.lots.length > 0 &&
        !autoOpenedLotsRef.current.has(code)
      ) {
        autoOpenedLotsRef.current.add(code);
        openLotsSelectorForItem(activeItem, currentRecipe, cached);
      }
      return;
    }

    setLoadingLotsCode(code);
    fetch(`/api/erp/controlled/lots/${encodeURIComponent(code)}`)
      .then(res => (res.ok ? res.json() : null))
      .then(json => {
        if (cancelled || !json?.success || !json.data) return;
        const info: ProductLotInfo = json.data;
        setLotsCache(prev => ({ ...prev, [code]: info }));
        applyLotInfoToItem(info);

        if (
          !currentRecipe?.batch_lot &&
          info.lots &&
          info.lots.length > 0 &&
          !autoOpenedLotsRef.current.has(code)
        ) {
          autoOpenedLotsRef.current.add(code);
          openLotsSelectorForItem(activeItem, currentRecipe, info);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingLotsCode(prev => (prev === code ? null : prev));
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, activeItem?.code, activeItemIndex]);

  const markTouched = (field: string) => {
    setTouchedFields(prev => (prev[field] ? prev : { ...prev, [field]: true }));
  };

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

      const sharedFields: Array<keyof ControlledRecipeData> = [
        'notification_uf',
        'notification_number',
        'prescription_date',
        'medicine_use',
        'buyer_id',
        'buyer_code',
        'buyer_doc_type',
        'buyer_doc_number',
        'buyer_doc_uf',
        'buyer_name',
        'buyer_cpf',
        'buyer_rg',
        'buyer_rg_issuer',
        'buyer_address',
        'buyer_neighborhood',
        'buyer_city',
        'buyer_uf',
        'buyer_phone',
        'prescriber_id',
        'prescriber_council',
        'prescriber_number',
        'prescriber_uf',
        'prescriber_name',
        'patient_name',
        'patient_age',
        'patient_age_unit',
        'patient_sex',
        'cid',
        'prolonged_use'
      ];

      if (applyToAll && sharedFields.includes(field)) {
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

  // Busca prescritores (ao digitar nome ou número de conselho)
  const triggerPrescriberSearch = async (term: string) => {
    const q = term.trim();
    if (q.length < 2) {
      setPrescribersFound([]);
      setShowPrescriberList(false);
      return;
    }
    setIsSearchingPrescriber(true);
    try {
      const res = await fetch(`/api/erp/controlled/prescribers?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const json = await res.json();
        const rows = json.data || [];
        setPrescribersFound(rows);
        setShowPrescriberList(rows.length > 0);
      }
    } catch (_) {
    } finally {
      setIsSearchingPrescriber(false);
    }
  };

  const handleSelectPrescriber = (doc: any) => {
    updateCurrentField('prescriber_id', doc.id || '');
    updateCurrentField('prescriber_name', String(doc.name || '').toUpperCase());
    updateCurrentField('prescriber_council', doc.council_type || 'CRM');
    updateCurrentField('prescriber_number', doc.council_number || '');
    updateCurrentField('prescriber_uf', doc.council_uf || 'MG');
    setShowPrescriberList(false);
  };

  const applyIdentifiedBuyer = (b: any) => {
    const docType = b.doc_type || (b.rg ? 'RG' : (b.cpf ? 'CPF' : 'RG'));
    const docNum = b.doc_number || b.rg || b.cpf || '';
    updateCurrentField('buyer_id', b.id || '');
    updateCurrentField('buyer_code', b.code || b.digifarma_cliente_id || '');
    updateCurrentField('buyer_doc_type', docType);
    updateCurrentField('buyer_doc_number', docNum);
    updateCurrentField('buyer_rg', b.rg || (docType !== 'CPF' ? docNum : ''));
    updateCurrentField('buyer_cpf', b.cpf || (docType === 'CPF' ? docNum : ''));
    updateCurrentField('buyer_rg_issuer', b.rg_issuer || 'SSP');
    updateCurrentField('buyer_doc_uf', b.rg_uf || b.uf || 'MG');
    updateCurrentField('buyer_name', String(b.name || '').toUpperCase());
    updateCurrentField('buyer_phone', b.phone || '');
    updateCurrentField('buyer_address', b.address || '');
    updateCurrentField('buyer_neighborhood', b.neighborhood || '');
    updateCurrentField('buyer_city', b.city || 'JUIZ DE FORA');
    updateCurrentField('buyer_uf', b.uf || 'MG');
    if (b.sex) updateCurrentField('patient_sex', b.sex);
    setShowBuyerList(false);
  };

  // Identifica cliente no Digifarma CLIENTES + SQLite ao clicar em IDENTIFICAR ou buscar
  const handleIdentifyClient = async (explicitQuery?: string) => {
    const q = (explicitQuery ?? clientLookupInput).trim();
    if (!q) {
      clientCodeInputRef.current?.focus();
      addToast('Informe o código, CPF, RG, telefone ou nome do cliente para identificar.', 'info', 2500);
      return;
    }
    setIsSearchingBuyer(true);
    try {
      const res = await fetch(`/api/erp/controlled/buyers?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const json = await res.json();
      const rows: any[] = json.data || [];
      setBuyersFound(rows);

      // Se houve clique explícito no botão IDENTIFICAR e bateu exatamente pelo código/CPF completo, preenche direto
      if (!explicitQuery) {
        const cleanQDigits = q.replace(/\D/g, '');
        const exactMatch = rows.find(
          r => String(r.code || '') === q ||
               (cleanQDigits.length === 11 && String(r.cpf || '').replace(/\D/g, '') === cleanQDigits)
        );
        if (exactMatch || rows.length === 1) {
          const picked = exactMatch || rows[0];
          applyIdentifiedBuyer(picked);
          addToast(`Cliente identificado: ${picked.name}`, 'success', 2200);
          return;
        }
        if (rows.length === 0) {
          addToast(`Nenhum cliente encontrado para "${q}". Preencha o cadastro abaixo.`, 'warning', 2500);
        }
      }
      setShowBuyerList(rows.length > 0);
    } catch (_) {
      addToast('Erro ao consultar cadastro de clientes.', 'error', 2500);
    } finally {
      setIsSearchingBuyer(false);
    }
  };

  useEffect(() => {
    const q = clientLookupInput.trim();
    if (q.length < 2) {
      setBuyersFound([]);
      setShowBuyerList(false);
      return;
    }
    const timer = setTimeout(() => {
      handleIdentifyClient(q);
    }, 240);
    return () => clearTimeout(timer);
  }, [clientLookupInput]);

  // Cópia rápida Comprador -> Paciente (ícone circular do Digifarma)
  const handleCopyBuyerToPatient = () => {
    if (!currentRecipe) return;
    if (!currentRecipe.buyer_name?.trim()) {
      addToast('Preencha o nome do comprador primeiro para copiar para o paciente.', 'info', 2200);
      return;
    }
    updateCurrentField('patient_name', currentRecipe.buyer_name.toUpperCase());
    addToast('Nome do comprador copiado para o paciente.', 'success', 1500);
  };

  // Gera número local de controle quando receita comum não tem talonário pré-impresso
  const handleGenerateLocalNumber = () => {
    const stamp = String(Date.now()).slice(-6);
    updateCurrentField('notification_number', stamp);
  };

  // Ações da Seleção de Lotes
  const visibleDraftLots = hideExpiredLots ? draftLots.filter(l => !l.is_expired) : draftLots;
  const totalDraftSelectedQty = draftLots.reduce((acc, l) => acc + (Number(l.quantity) || 0), 0);

  const handleDraftLotQtyChange = (batchLot: string, rawVal: string) => {
    const nextQty = sanitizeQtyInt(rawVal);
    setDraftLots(prev =>
      prev.map(l => {
        if (l.batch_lot !== batchLot) return l;
        const maxQty = l.available_qty !== null && l.available_qty !== undefined ? l.available_qty : Infinity;
        return { ...l, quantity: Math.min(nextQty, maxQty) };
      })
    );
  };

  const handleAddManualLotRow = () => {
    const code = manualLotDraft.batch_lot.trim().toUpperCase();
    const qty = Math.max(1, sanitizeQtyInt(manualLotDraft.quantity || '1'));
    if (!code) {
      addToast('Informe o número do lote manual.', 'warning', 2200);
      return;
    }
    setDraftLots(prev => {
      const existsIdx = prev.findIndex(l => l.batch_lot === code);
      if (existsIdx >= 0) {
        const copy = [...prev];
        copy[existsIdx] = {
          ...copy[existsIdx],
          manufacture_date: manualLotDraft.manufacture_date || copy[existsIdx].manufacture_date,
          expiry_date: manualLotDraft.expiry_date || copy[existsIdx].expiry_date,
          quantity: qty,
          is_manual: true
        };
        return copy;
      }
      const todayIso = new Date().toISOString().slice(0, 10);
      return [
        ...prev,
        {
          lote_id: null,
          batch_lot: code,
          available_qty: null,
          manufacture_date: manualLotDraft.manufacture_date,
          expiry_date: manualLotDraft.expiry_date,
          is_expired: Boolean(manualLotDraft.expiry_date && manualLotDraft.expiry_date < todayIso),
          quantity: qty,
          is_manual: true,
          source: 'MANUAL'
        }
      ];
    });
    setManualLotDraft({ batch_lot: '', manufacture_date: '', expiry_date: '', quantity: '1' });
    setShowManualLotForm(false);
  };

  const handleConfirmLotsDialog = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const chosen = draftLots.filter(l => (Number(l.quantity) || 0) > 0);
    if (chosen.length === 0) {
      addToast('Selecione a quantidade em pelo menos um lote ou adicione manualmente.', 'warning', 2800);
      return;
    }

    const batchSummary = chosen.map(c => c.batch_lot).join(', ');
    const earliestExpiry = chosen
      .map(c => c.expiry_date)
      .filter(Boolean)
      .sort()[0] || '';
    const lotRegMs = chosen.map(c => c.registro_ms).find(ms => ms && ms !== 'ISENTO') || '';

    setRecipes(prev =>
      prev.map((rec, idx) => {
        if (idx !== activeItemIndex) return rec;
        return {
          ...rec,
          selected_lots: chosen,
          batch_lot: batchSummary,
          expiry_date: earliestExpiry || rec.expiry_date,
          registro_ms: rec.registro_ms || lotRegMs || ''
        };
      })
    );
    setTouchedFields(prev => ({ ...prev, batch_lot: true }));
    setIsLotsDialogOpen(false);
  };

  // Submissão e validação (focus no primeiro erro + anúncio acessível)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);

    const listToValidate = recipes.length > 0 ? recipes : (currentRecipe ? [currentRecipe] : []);
    for (let i = 0; i < listToValidate.length; i++) {
      const r = listToValidate[i];
      if (!r.prescriber_number?.trim()) {
        const msg = `Informe o número do conselho do emitente para ${r.product_name}.`;
        setLiveErrorMsg(msg);
        addToast(msg, 'warning');
        setActiveItemIndex(i);
        requestAnimationFrame(() => prescriberNumberRef.current?.focus());
        return;
      }
      if (!r.prescriber_name?.trim()) {
        const msg = `Informe o nome do emitente/prescritor para ${r.product_name}.`;
        setLiveErrorMsg(msg);
        addToast(msg, 'warning');
        setActiveItemIndex(i);
        requestAnimationFrame(() => prescriberSearchRef.current?.focus());
        return;
      }
      if (!r.buyer_name || r.buyer_name.trim().length < 3) {
        const msg = `Informe o nome completo do comprador para ${r.product_name}.`;
        setLiveErrorMsg(msg);
        addToast(msg, 'warning');
        setActiveItemIndex(i);
        requestAnimationFrame(() => buyerNameRef.current?.focus());
        return;
      }
      const hasLots = Boolean(r.batch_lot?.trim()) || (Array.isArray(r.selected_lots) && r.selected_lots.length > 0);
      if (!hasLots) {
        const msg = `Selecione ou informe o Lote para ${r.product_name} (obrigatório SNGPC).`;
        setLiveErrorMsg(msg);
        addToast(msg, 'warning');
        setActiveItemIndex(i);
        const item = controlledItems[i] || activeItem;
        if (item) {
          openLotsSelectorForItem(item, r, lotsCache[item.code] || null);
        }
        return;
      }
    }

    setLiveErrorMsg('');
    onConfirm(listToValidate);
  };

  if (!currentRecipe) {
    return (
      <>
        <dialog ref={mainDialogRef} className="controlled-recipe-dialog" />
        <dialog ref={lotsDialogRef} className="controlled-recipe-dialog" />
      </>
    );
  }

  const theme = {
    AMARELA: {
      badge: 'bg-amber-400 text-amber-950 border-amber-500',
      headerBg: 'bg-amber-100 border-amber-300 text-amber-950',
      ring: 'border-amber-400'
    },
    AZUL: {
      badge: 'bg-sky-600 text-white border-sky-700',
      headerBg: 'bg-sky-100 border-sky-300 text-sky-950',
      ring: 'border-sky-400'
    },
    CREME: {
      badge: 'bg-amber-200 text-amber-950 border-amber-400',
      headerBg: 'bg-[#FFFBEB] border-amber-300 text-amber-950',
      ring: 'border-amber-300'
    },
    BRANCA: {
      badge: 'bg-slate-700 text-white border-slate-800',
      headerBg: 'bg-slate-100 border-slate-300 text-slate-900',
      ring: 'border-slate-300'
    }
  }[currentRecipe.recipe_type || 'BRANCA'];

  const isFieldInvalid = (name: string, emptyCheck: boolean) =>
    Boolean((touchedFields[name] || hasAttemptedSubmit) && emptyCheck);

  const prescriberNumInvalid = isFieldInvalid('prescriber_number', !currentRecipe.prescriber_number?.trim());
  const prescriberNameInvalid = isFieldInvalid('prescriber_name', !currentRecipe.prescriber_name?.trim());
  const buyerNameInvalid = isFieldInvalid('buyer_name', !currentRecipe.buyer_name?.trim() || currentRecipe.buyer_name.trim().length < 3);

  const selectedLotsList = currentRecipe.selected_lots && currentRecipe.selected_lots.length > 0
    ? currentRecipe.selected_lots
    : (currentRecipe.batch_lot
      ? [{ batch_lot: currentRecipe.batch_lot, quantity: currentRecipe.quantity, expiry_date: currentRecipe.expiry_date }]
      : []);

  const currentLotsInfo = activeItem ? lotsCache[activeItem.code] || null : null;

  return (
    <>
      {/* ===================================================================== */}
      {/* MODAL PRINCIPAL: NOTIFICAÇÃO DE RECEITA (ESTILO DIGIFARMA + SNGPC)    */}
      {/* ===================================================================== */}
      <dialog
        ref={mainDialogRef}
        aria-labelledby={`${baseId}-main-title`}
        onCancel={(e) => {
          e.preventDefault();
          onClose();
        }}
        onClose={(e) => {
          e.currentTarget.returnValue = '';
          if (isOpen) onClose();
        }}
        className="controlled-recipe-dialog m-auto w-[96vw] max-w-4xl max-h-[94dvh] p-0 rounded-lg border-2 border-slate-400 bg-[#f4f5f7] text-slate-900 shadow-2xl overflow-hidden"
      >
        {/* Cabeçalho da Janela */}
        <div className={`px-4 py-2.5 border-b flex items-center justify-between gap-3 shrink-0 ${theme.headerBg}`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded bg-white/80 border border-black/10 shrink-0">
              <ShieldCheck className="w-5 h-5 text-slate-800" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 id={`${baseId}-main-title`} className="text-sm sm:text-base font-black tracking-tight truncate">
                  Notificação de Receita
                </h1>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${theme.badge}`}>
                  {activeItem?.recipe_label || currentRecipe.therapeutic_class || 'Controle Especial'}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de receita"
            className="p-1.5 rounded hover:bg-black/10 text-slate-700 transition-colors cursor-pointer shrink-0"
            title="Cancelar (ESC)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Abas quando houver mais de 1 medicamento controlado no cupom */}
        {controlledItems.length > 1 && (
          <div className="px-3 py-1.5 bg-slate-200/80 border-b border-slate-300 flex items-center gap-1.5 overflow-x-auto shrink-0">
            <span className="text-[11px] font-black uppercase text-slate-700 whitespace-nowrap mr-1">
              Itens ({controlledItems.length}):
            </span>
            {controlledItems.map((item, idx) => {
              const rec = recipes[idx];
              const hasLot = Boolean(rec?.batch_lot);
              const isSelected = activeItemIndex === idx;
              return (
                <button
                  key={`${item.code}-${idx}`}
                  type="button"
                  onClick={() => setActiveItemIndex(idx)}
                  className={`text-xs px-2.5 py-1 rounded border font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-950 shadow-xs'
                      : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${hasLot ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <span className="max-w-[160px] truncate">{item.name}</span>
                  <span className="text-[10px] opacity-75">({item.quantity} un)</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Região de anúncio acessível de erros */}
        <div aria-live="polite" className="sr-only-focusable">
          {liveErrorMsg}
        </div>

        <form id={`${baseId}-form`} noValidate onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 text-xs">

            {/* TOPO DO PRODUTO + QUADRO DE LOTES (IGUAL DIGIFARMA) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
              <div className="md:col-span-8 bg-white border border-slate-300 rounded p-2.5 space-y-2 shadow-2xs">
                <div>
                  <div className="text-[11px] font-bold text-slate-500">Produto:</div>
                  <div className="text-sm font-black text-slate-950 uppercase tracking-tight">
                    <span className="font-mono text-slate-600 mr-1.5">{currentRecipe.product_code}</span>
                    {currentRecipe.product_name}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                  <div className="sm:col-span-5">
                    <label htmlFor={`${baseId}-reg-ms`} className="block text-[11px] font-bold text-slate-700 mb-0.5">
                      Registro MS:
                    </label>
                    <input
                      id={`${baseId}-reg-ms`}
                      type="text"
                      value={currentRecipe.registro_ms || ''}
                      onChange={e => updateCurrentField('registro_ms', e.target.value)}
                      placeholder="1.0000.0000.000-0"
                      className="w-full px-2 py-1 text-xs font-mono font-bold bg-white border-2 border-sky-600/80 rounded focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                    />
                  </div>
                  <div className="sm:col-span-7">
                    <div className="text-[11px] font-bold text-slate-700 mb-0.5">Classe Terapêutica:</div>
                    <div className="px-2 py-1 bg-slate-100 border border-slate-300 rounded font-black text-slate-900 uppercase truncate">
                      {currentRecipe.therapeutic_class || getDefaultTherapeuticClass(currentRecipe.recipe_type)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Quadro Lotes (direita do topo) */}
              <div className="md:col-span-4 bg-white border border-slate-300 rounded p-2.5 flex flex-col justify-between shadow-2xs">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-slate-700">Lotes: <span className="text-rose-600">*</span></span>
                    {loadingLotsCode === activeItem?.code && (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-600" />
                    )}
                  </div>

                  {selectedLotsList.length > 0 ? (
                    <div className="space-y-1 max-h-16 overflow-y-auto pr-1">
                      {selectedLotsList.map((lt, idx) => (
                        <div
                          key={`${lt.batch_lot}-${idx}`}
                          onClick={() => activeItem && openLotsSelectorForItem(activeItem, currentRecipe, currentLotsInfo)}
                          className="px-2 py-0.5 bg-emerald-50 border border-emerald-300 rounded font-mono font-black text-slate-900 text-xs flex items-center justify-between cursor-pointer hover:bg-emerald-100"
                          title="Clique para alterar ou dividir lotes"
                        >
                          <span>{lt.batch_lot} - {lt.quantity}</span>
                          {lt.expiry_date && (
                            <span className="text-[10px] font-normal text-slate-600">{formatDateBr(lt.expiry_date)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-2 py-1.5 bg-rose-50 border border-rose-300 rounded text-[11px] font-bold text-rose-700 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Nenhum lote selecionado</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => activeItem && openLotsSelectorForItem(activeItem, currentRecipe, currentLotsInfo)}
                  className="mt-2 w-full py-1 px-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Layers className="w-3.5 h-3.5 text-amber-300" />
                  <span>{selectedLotsList.length > 0 ? 'Alterar Lotes' : 'Selecionar Lotes'}</span>
                  {currentLotsInfo?.lots && currentLotsInfo.lots.length > 0 && (
                    <span className="bg-white/20 px-1.5 rounded text-[10px] font-mono">
                      {currentLotsInfo.lots.length} disp.
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* BLOCOS LADO A LADO: NOTIFICAÇÃO DE RECEITA (ESQ) + IDENTIFICAÇÃO DO EMITENTE (DIR) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Esquerda: Notificação de Receita */}
              <fieldset className="md:col-span-5 border border-slate-300 bg-white rounded p-2.5 space-y-2 shadow-2xs">
                <legend className="px-1 text-[11px] font-bold text-slate-800">Notificação de Receita:</legend>

                <div>
                  <label htmlFor={`${baseId}-recipe-type`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    Tipo de Receituário
                  </label>
                  <select
                    id={`${baseId}-recipe-type`}
                    value={currentRecipe.recipe_type}
                    onChange={e => updateCurrentField('recipe_type', e.target.value)}
                    className="w-full px-2 py-1 text-xs font-bold bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                  >
                    <option value="CREME">Receita Antimicrobiano (2 Vias)</option>
                    <option value="BRANCA">Receita Controle Especial Branca (C1/C5)</option>
                    <option value="AZUL">Notificação de Receita B (Azul)</option>
                    <option value="AMARELA">Notificação de Receita A (Amarela)</option>
                  </select>
                </div>

                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <label htmlFor={`${baseId}-notif-uf`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      UF:
                    </label>
                    <select
                      id={`${baseId}-notif-uf`}
                      value={currentRecipe.notification_uf || 'MG'}
                      onChange={e => updateCurrentField('notification_uf', e.target.value)}
                      className="w-full px-1.5 py-1 text-xs font-bold bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                    >
                      {UF_OPTIONS.map(uf => (
                        <option key={uf} value={uf}>{uf}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-6">
                    <label htmlFor={`${baseId}-notif-num`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Número:
                    </label>
                    <input
                      id={`${baseId}-notif-num`}
                      type="text"
                      inputMode="numeric"
                      value={currentRecipe.notification_number}
                      onChange={e => updateCurrentField('notification_number', e.target.value.toUpperCase())}
                      placeholder="Nº notificação"
                      className="w-full px-2 py-1 text-xs font-mono font-bold bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                    />
                  </div>

                  <div className="col-span-2">
                    <button
                      type="button"
                      onClick={handleGenerateLocalNumber}
                      title="Gerar número sequencial de controle"
                      aria-label="Gerar número sequencial de controle"
                      className="w-full py-1 px-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded font-mono font-black text-slate-800 cursor-pointer"
                    >
                      #
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-7">
                    <label htmlFor={`${baseId}-presc-date`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Data da Prescrição:
                    </label>
                    <input
                      id={`${baseId}-presc-date`}
                      type="date"
                      value={currentRecipe.prescription_date}
                      onChange={e => updateCurrentField('prescription_date', e.target.value)}
                      className="w-full px-2 py-1 text-xs font-mono font-bold bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                    />
                  </div>
                  <div className="col-span-5">
                    <label htmlFor={`${baseId}-presc-qty`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Qtd. Prescrita:
                    </label>
                    <input
                      id={`${baseId}-presc-qty`}
                      type="text"
                      inputMode="numeric"
                      value={String(currentRecipe.prescribed_qty ?? currentRecipe.quantity)}
                      onChange={e => updateCurrentField('prescribed_qty', sanitizeQtyInt(e.target.value) || 1)}
                      className="w-full px-2 py-1 text-xs font-mono font-bold text-center bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Direita: Identificação do Emitente */}
              <fieldset className="md:col-span-7 border border-slate-300 bg-white rounded p-2.5 space-y-2 shadow-2xs relative">
                <legend className="px-1 text-[11px] font-bold text-slate-800">Identificação do Emitente:</legend>

                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-4">
                    <label htmlFor={`${baseId}-conselho`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Conselho:
                    </label>
                    <select
                      id={`${baseId}-conselho`}
                      value={currentRecipe.prescriber_council}
                      onChange={e => updateCurrentField('prescriber_council', e.target.value)}
                      className="w-full px-2 py-1 text-xs font-bold bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                    >
                      {COUNCIL_OPTIONS.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-3">
                    <label htmlFor={`${baseId}-conselho-uf`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      UF:
                    </label>
                    <select
                      id={`${baseId}-conselho-uf`}
                      value={currentRecipe.prescriber_uf}
                      onChange={e => updateCurrentField('prescriber_uf', e.target.value)}
                      className="w-full px-1.5 py-1 text-xs font-bold bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                    >
                      {UF_OPTIONS.map(uf => (
                        <option key={uf} value={uf}>{uf}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-5">
                    <label htmlFor={`${baseId}-conselho-num`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                      Número: <span aria-hidden="true" className="text-rose-600">*</span>
                    </label>
                    <input
                      ref={prescriberNumberRef}
                      id={`${baseId}-conselho-num`}
                      type="text"
                      inputMode="numeric"
                      required
                      aria-invalid={prescriberNumInvalid ? 'true' : 'false'}
                      aria-describedby={prescriberNumInvalid ? `${baseId}-err-presc-num` : undefined}
                      value={currentRecipe.prescriber_number}
                      onChange={e => {
                        const val = e.target.value;
                        updateCurrentField('prescriber_number', val);
                        triggerPrescriberSearch(val);
                      }}
                      onBlur={() => markTouched('prescriber_number')}
                      placeholder="Ex: 99937"
                      className={`w-full px-2 py-1 text-xs font-mono font-bold bg-white border rounded focus:outline-none ${
                        prescriberNumInvalid ? 'border-rose-600 bg-rose-50' : 'border-slate-300 focus:border-slate-700'
                      }`}
                    />
                    {prescriberNumInvalid && (
                      <div id={`${baseId}-err-presc-num`} className="controlled-error-msg text-[10px] text-rose-700 font-bold mt-0.5">
                        Informe o número do conselho.
                      </div>
                    )}
                  </div>
                </div>

                {/* Nome do Emitente + Botão Lupa (Digifarma VENDAS_PSICOTROPICOS + Local) */}
                <div className="relative">
                  <label htmlFor={`${baseId}-presc-name`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    Nome: <span aria-hidden="true" className="text-rose-600">*</span>
                  </label>
                  <div className="flex items-stretch gap-1.5">
                    <input
                      ref={prescriberSearchRef}
                      id={`${baseId}-presc-name`}
                      type="text"
                      required
                      autoFocus
                      aria-invalid={prescriberNameInvalid ? 'true' : 'false'}
                      aria-describedby={prescriberNameInvalid ? `${baseId}-err-presc-name` : undefined}
                      value={currentRecipe.prescriber_name}
                      onChange={e => {
                        const val = e.target.value.toUpperCase();
                        updateCurrentField('prescriber_name', val);
                        triggerPrescriberSearch(val);
                      }}
                      onBlur={() => markTouched('prescriber_name')}
                      placeholder="Digite nome ou busque CRM..."
                      className={`flex-1 px-2 py-1 text-xs font-bold uppercase bg-white border rounded focus:outline-none ${
                        prescriberNameInvalid ? 'border-rose-600 bg-rose-50' : 'border-slate-300 focus:border-slate-700'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => triggerPrescriberSearch(currentRecipe.prescriber_name || currentRecipe.prescriber_number || '')}
                      title="Pesquisar prescritores cadastrados (Local e Digifarma)"
                      aria-label="Pesquisar prescritores"
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-slate-700 flex items-center justify-center cursor-pointer"
                    >
                      {isSearchingPrescriber ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {prescriberNameInvalid && (
                    <div id={`${baseId}-err-presc-name`} className="controlled-error-msg text-[10px] text-rose-700 font-bold mt-0.5">
                      Informe o nome do prescritor.
                    </div>
                  )}

                  {showPrescriberList && prescribersFound.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-400 rounded shadow-xl z-30 max-h-40 overflow-y-auto divide-y divide-slate-100">
                      {prescribersFound.map((doc, idx) => (
                        <button
                          key={`${doc.id}-${idx}`}
                          type="button"
                          onClick={() => handleSelectPrescriber(doc)}
                          className="w-full px-2.5 py-1.5 text-left hover:bg-sky-50 flex items-center justify-between gap-2 text-xs cursor-pointer"
                        >
                          <span className="font-bold text-slate-900 truncate">{doc.name}</span>
                          <span className="font-mono text-[10px] font-bold bg-slate-100 border border-slate-300 px-1.5 py-0.5 rounded shrink-0">
                            {doc.council_type} {doc.council_number}/{doc.council_uf}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor={`${baseId}-med-use`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    Uso do Medicamento:
                  </label>
                  <select
                    id={`${baseId}-med-use`}
                    value={currentRecipe.medicine_use || 'HUMANO'}
                    onChange={e => updateCurrentField('medicine_use', e.target.value)}
                    className="w-full px-2 py-1 text-xs font-bold bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                  >
                    <option value="HUMANO">HUMANO</option>
                    <option value="VETERINARIO">VETERINÁRIO</option>
                  </select>
                </div>
              </fieldset>
            </div>

            {/* BANNER: IDENTIFICAR CLIENTE JÁ CADASTRADO (IGUAL DIGIFARMA) */}
            <fieldset className="border border-slate-300 bg-white rounded px-3 py-2 shadow-2xs relative">
              <legend className="px-1 text-[11px] font-black uppercase text-slate-700">
                IDENTIFICAR CLIENTE JÁ CADASTRADO:
              </legend>

              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={`${baseId}-cli-lookup`} className="text-[11px] font-black uppercase text-slate-700 shrink-0">
                  CÓDIGO / CPF / NOME:
                </label>
                <input
                  ref={clientCodeInputRef}
                  id={`${baseId}-cli-lookup`}
                  type="text"
                  value={clientLookupInput}
                  onChange={e => setClientLookupInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleIdentifyClient();
                    }
                  }}
                  placeholder="Digite código do cliente, CPF, RG ou nome..."
                  className="flex-1 min-w-[200px] px-2.5 py-1 text-xs font-semibold bg-white border border-slate-400 rounded focus:outline-none focus:border-slate-800"
                />
                <button
                  type="button"
                  onClick={() => handleIdentifyClient()}
                  disabled={isSearchingBuyer}
                  className="px-4 py-1 bg-slate-200 hover:bg-slate-300 border border-slate-400 rounded text-xs font-black uppercase tracking-wider text-slate-900 cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  {isSearchingBuyer && <RefreshCw className="w-3 h-3 animate-spin" />}
                  <span>IDENTIFICAR</span>
                </button>
              </div>

              {showBuyerList && buyersFound.length > 0 && (
                <div className="absolute left-2 right-2 top-full mt-1 bg-white border border-slate-400 rounded shadow-xl z-30 max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {buyersFound.map((b, idx) => (
                    <button
                      key={`${b.id}-${idx}`}
                      type="button"
                      onClick={() => applyIdentifiedBuyer(b)}
                      className="w-full px-3 py-1.5 text-left hover:bg-sky-50 flex items-center justify-between gap-2 text-xs cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">
                          {b.code ? <span className="font-mono text-sky-700 mr-1.5">#{b.code}</span> : null}
                          {b.name}
                        </div>
                        <div className="text-[10px] text-slate-600 truncate">
                          {b.doc_number ? `${b.doc_type || 'DOC'}: ${b.doc_number}` : ''}
                          {b.cpf ? ` • CPF: ${b.cpf}` : ''}
                          {b.address ? ` • ${b.address}` : ''}
                          {b.neighborhood ? `, ${b.neighborhood}` : ''}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono bg-slate-100 border border-slate-300 px-1.5 py-0.5 rounded shrink-0">
                        {b.source === 'DIGIFARMA' ? 'Digifarma' : 'Local'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </fieldset>

            {/* IDENTIFICAÇÃO DO COMPRADOR (IGUAL DIGIFARMA) */}
            <fieldset className="border border-slate-300 bg-white rounded p-2.5 space-y-2 shadow-2xs">
              <legend className="px-1 text-[11px] font-bold text-slate-800">Identificação do Comprador:</legend>

              {/* Linha 1: Tipo de Documento, Num. Doc., Órgão Expedidor, UF */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-5">
                  <label htmlFor={`${baseId}-doc-type`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    Tipo de Documento:
                  </label>
                  <select
                    id={`${baseId}-doc-type`}
                    value={currentRecipe.buyer_doc_type || 'RG'}
                    onChange={e => updateCurrentField('buyer_doc_type', e.target.value)}
                    className="w-full px-2 py-1 text-xs font-semibold bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                  >
                    {DOC_TYPES.map(dt => (
                      <option key={dt.value} value={dt.value}>{dt.label}</option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor={`${baseId}-doc-num`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    Num. Doc.:
                  </label>
                  <input
                    id={`${baseId}-doc-num`}
                    type="text"
                    value={currentRecipe.buyer_doc_number || ''}
                    onChange={e => {
                      const val = e.target.value.toUpperCase();
                      updateCurrentField('buyer_doc_number', val);
                      if ((currentRecipe.buyer_doc_type || 'RG') === 'CPF') {
                        updateCurrentField('buyer_cpf', val);
                      } else {
                        updateCurrentField('buyer_rg', val);
                      }
                    }}
                    placeholder="Nº do documento"
                    className="w-full px-2 py-1 text-xs font-mono font-bold bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor={`${baseId}-doc-issuer`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    Órgão Expedidor:
                  </label>
                  <select
                    id={`${baseId}-doc-issuer`}
                    value={currentRecipe.buyer_rg_issuer || 'SSP'}
                    onChange={e => updateCurrentField('buyer_rg_issuer', e.target.value)}
                    className="w-full px-1.5 py-1 text-xs font-bold bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                  >
                    {ISSUER_OPTIONS.map(org => (
                      <option key={org} value={org}>{org}</option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor={`${baseId}-doc-uf`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    UF:
                  </label>
                  <select
                    id={`${baseId}-doc-uf`}
                    value={currentRecipe.buyer_doc_uf || 'MG'}
                    onChange={e => updateCurrentField('buyer_doc_uf', e.target.value)}
                    className="w-full px-1.5 py-1 text-xs font-bold bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                  >
                    {UF_OPTIONS.map(uf => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Linha 2: Nome, CPF (opc.), Telefone */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-6">
                  <label htmlFor={`${baseId}-buyer-name`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    Nome: <span aria-hidden="true" className="text-rose-600">*</span>
                  </label>
                  <input
                    ref={buyerNameRef}
                    id={`${baseId}-buyer-name`}
                    type="text"
                    required
                    autoComplete="name"
                    aria-invalid={buyerNameInvalid ? 'true' : 'false'}
                    aria-describedby={buyerNameInvalid ? `${baseId}-err-buyer-name` : undefined}
                    value={currentRecipe.buyer_name}
                    onChange={e => updateCurrentField('buyer_name', e.target.value.toUpperCase())}
                    onBlur={() => markTouched('buyer_name')}
                    placeholder="Nome completo do comprador"
                    className={`w-full px-2 py-1 text-xs font-bold uppercase bg-white border rounded focus:outline-none ${
                      buyerNameInvalid ? 'border-rose-600 bg-rose-50' : 'border-slate-300 focus:border-slate-700'
                    }`}
                  />
                  {buyerNameInvalid && (
                    <div id={`${baseId}-err-buyer-name`} className="controlled-error-msg text-[10px] text-rose-700 font-bold mt-0.5">
                      Informe o nome completo do comprador.
                    </div>
                  )}
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor={`${baseId}-buyer-cpf`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    CPF (opcional):
                  </label>
                  <input
                    id={`${baseId}-buyer-cpf`}
                    type="text"
                    inputMode="numeric"
                    value={currentRecipe.buyer_cpf}
                    onChange={e => updateCurrentField('buyer_cpf', e.target.value)}
                    placeholder="000.000.000-00"
                    className="w-full px-2 py-1 text-xs font-mono font-bold bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor={`${baseId}-buyer-phone`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    Telefone:
                  </label>
                  <input
                    id={`${baseId}-buyer-phone`}
                    type="tel"
                    autoComplete="tel"
                    value={currentRecipe.buyer_phone}
                    onChange={e => updateCurrentField('buyer_phone', e.target.value)}
                    placeholder="(32) 99999-9999"
                    className="w-full px-2 py-1 text-xs font-medium bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                  />
                </div>
              </div>

              {/* Linha 3: Endereço */}
              <div>
                <label htmlFor={`${baseId}-buyer-addr`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                  Endereço:
                </label>
                <input
                  id={`${baseId}-buyer-addr`}
                  type="text"
                  autoComplete="address-line1"
                  value={currentRecipe.buyer_address}
                  onChange={e => updateCurrentField('buyer_address', e.target.value.toUpperCase())}
                  placeholder="Rua, Número, Complemento"
                  className="w-full px-2 py-1 text-xs font-medium uppercase bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                />
              </div>

              {/* Linha 4: Bairro, Cidade, UF */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-5">
                  <label htmlFor={`${baseId}-buyer-bairro`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    Bairro:
                  </label>
                  <input
                    id={`${baseId}-buyer-bairro`}
                    type="text"
                    value={currentRecipe.buyer_neighborhood || ''}
                    onChange={e => updateCurrentField('buyer_neighborhood', e.target.value.toUpperCase())}
                    placeholder="Bairro"
                    className="w-full px-2 py-1 text-xs font-medium uppercase bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                  />
                </div>

                <div className="sm:col-span-5">
                  <label htmlFor={`${baseId}-buyer-city`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    Cidade:
                  </label>
                  <input
                    id={`${baseId}-buyer-city`}
                    type="text"
                    autoComplete="address-level2"
                    value={currentRecipe.buyer_city || 'JUIZ DE FORA'}
                    onChange={e => updateCurrentField('buyer_city', e.target.value.toUpperCase())}
                    className="w-full px-2 py-1 text-xs font-bold uppercase bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor={`${baseId}-buyer-uf`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    UF:
                  </label>
                  <select
                    id={`${baseId}-buyer-uf`}
                    autoComplete="address-level1"
                    value={currentRecipe.buyer_uf || 'MG'}
                    onChange={e => updateCurrentField('buyer_uf', e.target.value)}
                    className="w-full px-1.5 py-1 text-xs font-bold bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                  >
                    {UF_OPTIONS.map(uf => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </div>
              </div>
            </fieldset>

            {/* IDENTIFICAÇÃO DO PACIENTE (IGUAL DIGIFARMA) */}
            <fieldset className="border border-slate-300 bg-white rounded p-2.5 space-y-2 shadow-2xs">
              <legend className="px-1 text-[11px] font-bold text-slate-800">Identificação do Paciente:</legend>

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label htmlFor={`${baseId}-patient-name`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    Nome:
                  </label>
                  <input
                    id={`${baseId}-patient-name`}
                    type="text"
                    value={currentRecipe.patient_name}
                    onChange={e => updateCurrentField('patient_name', e.target.value.toUpperCase())}
                    placeholder="Nome do paciente (se diferente do comprador)"
                    className="w-full px-2 py-1 text-xs font-bold uppercase bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleCopyBuyerToPatient}
                  title="Copiar nome do comprador para paciente"
                  aria-label="Copiar nome do comprador para paciente"
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-slate-700 cursor-pointer shrink-0 flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                <div className="sm:col-span-4">
                  <label htmlFor={`${baseId}-patient-age`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    Idade:
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      id={`${baseId}-patient-age`}
                      type="text"
                      inputMode="numeric"
                      value={currentRecipe.patient_age || ''}
                      onChange={e => updateCurrentField('patient_age', e.target.value.replace(/\D/g, ''))}
                      placeholder="0"
                      className="w-16 px-2 py-1 text-xs font-mono font-bold text-center bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                    />
                    <select
                      aria-label="Unidade da idade"
                      value={currentRecipe.patient_age_unit || 'ANOS'}
                      onChange={e => updateCurrentField('patient_age_unit', e.target.value)}
                      className="flex-1 px-2 py-1 text-xs font-semibold bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                    >
                      <option value="ANOS">Anos</option>
                      <option value="MESES">Meses</option>
                      <option value="DIAS">Dias</option>
                    </select>
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor={`${baseId}-patient-sex`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    Sexo:
                  </label>
                  <select
                    id={`${baseId}-patient-sex`}
                    value={currentRecipe.patient_sex || ''}
                    onChange={e => updateCurrentField('patient_sex', e.target.value)}
                    className="w-full px-2 py-1 text-xs font-semibold bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                  >
                    <option value="">Selecionar...</option>
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor={`${baseId}-patient-cid`} className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                    CID:
                  </label>
                  <input
                    id={`${baseId}-patient-cid`}
                    type="text"
                    value={currentRecipe.cid || ''}
                    onChange={e => updateCurrentField('cid', e.target.value.toUpperCase())}
                    placeholder="Opcional"
                    className="w-full px-2 py-1 text-xs font-mono uppercase bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-700"
                  />
                </div>

                <div className="sm:col-span-3 flex items-center gap-1.5 pb-1">
                  <input
                    id={`${baseId}-prolonged-use`}
                    type="checkbox"
                    checked={Boolean(currentRecipe.prolonged_use)}
                    onChange={e => updateCurrentField('prolonged_use', e.target.checked)}
                    className="w-4 h-4 accent-slate-800 cursor-pointer"
                  />
                  <label htmlFor={`${baseId}-prolonged-use`} className="text-[11px] font-black uppercase text-slate-800 cursor-pointer select-none">
                    USO PROLONGADO
                  </label>
                </div>
              </div>
            </fieldset>

            {/* Replicar dados para múltiplos itens controlados */}
            {controlledItems.length > 1 && (
              <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded flex items-center gap-2">
                <input
                  id={`${baseId}-replicate-all`}
                  type="checkbox"
                  checked={applyToAll}
                  onChange={e => setApplyToAll(e.target.checked)}
                  className="w-4 h-4 accent-blue-700 cursor-pointer"
                />
                <label htmlFor={`${baseId}-replicate-all`} className="text-xs font-bold text-blue-900 cursor-pointer">
                  Replicar Emitente, Comprador e Paciente para os outros {controlledItems.length - 1} medicamentos controlados
                </label>
              </div>
            )}
          </div>

          {/* Rodapé da Janela */}
          <div className="px-4 py-2.5 bg-slate-200 border-t border-slate-300 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <span className="text-[11px] font-medium text-slate-600">
              * Emitente, Comprador e Lote são obrigatórios para escrituração SNGPC.
            </span>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-1.5 bg-white hover:bg-slate-100 border border-slate-400 text-slate-800 rounded text-xs font-bold uppercase tracking-wider cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-6 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-800 rounded text-xs font-black uppercase tracking-wider shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>OK</span>
              </button>
            </div>
          </div>
        </form>
      </dialog>

      {/* ===================================================================== */}
      {/* MODAL ANINHADA NO TOP LAYER: SELEÇÃO DE LOTES (IGUAL DIGIFARMA)      */}
      {/* ===================================================================== */}
      <dialog
        ref={lotsDialogRef}
        aria-labelledby={`${baseId}-lots-title`}
        onCancel={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsLotsDialogOpen(false);
        }}
        onClose={(e) => {
          e.currentTarget.returnValue = '';
          if (isLotsDialogOpen) setIsLotsDialogOpen(false);
        }}
        className="controlled-recipe-dialog m-auto w-[95vw] max-w-2xl max-h-[86dvh] p-0 rounded-lg border-2 border-slate-500 bg-[#f4f5f7] text-slate-900 shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-2 bg-slate-800 text-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-300" />
            <h1 id={`${baseId}-lots-title`} className="text-sm font-bold">
              Seleção de Lotes
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setIsLotsDialogOpen(false)}
            aria-label="Fechar seleção de lotes"
            className="p-1 rounded hover:bg-white/15 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form method="dialog" onSubmit={handleConfirmLotsDialog} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="p-3.5 space-y-2.5 flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Identificação do Produto */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-black text-slate-950 uppercase">
                PRODUTO: <span className="font-mono text-sky-800">{activeItem?.code}</span> - {activeItem?.name}
              </div>
              <span className="text-[11px] font-bold bg-sky-100 text-sky-900 border border-sky-300 px-2 py-0.5 rounded">
                Qtd. na Venda: {activeItem?.quantity || 1} un
              </span>
            </div>

            {/* Filtro + Botão Lote Manual */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <input
                  id={`${baseId}-hide-expired`}
                  type="checkbox"
                  checked={hideExpiredLots}
                  onChange={e => setHideExpiredLots(e.target.checked)}
                  className="w-4 h-4 accent-slate-800 cursor-pointer"
                />
                <label htmlFor={`${baseId}-hide-expired`} className="text-xs font-bold uppercase text-slate-800 cursor-pointer select-none">
                  OCULTAR LOTES VENCIDOS
                </label>
              </div>

              <button
                type="button"
                onClick={() => setShowManualLotForm(v => !v)}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-400 rounded text-[11px] font-bold text-slate-800 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-700" />
                <span>Informar Lote Manual</span>
              </button>
            </div>

            {/* Entrada Rápida de Lote Manual */}
            {showManualLotForm && (
              <div className="p-2.5 bg-amber-50 border border-amber-300 rounded grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                <div className="sm:col-span-4">
                  <label htmlFor={`${baseId}-man-lot`} className="block text-[10px] font-black uppercase text-slate-700 mb-0.5">
                    Número do Lote *
                  </label>
                  <input
                    id={`${baseId}-man-lot`}
                    type="text"
                    value={manualLotDraft.batch_lot}
                    onChange={e => setManualLotDraft(prev => ({ ...prev, batch_lot: e.target.value.toUpperCase() }))}
                    placeholder="Ex: 5P4585"
                    className="w-full px-2 py-1 text-xs font-mono font-bold uppercase bg-white border border-amber-400 rounded"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label htmlFor={`${baseId}-man-mfg`} className="block text-[10px] font-bold uppercase text-slate-700 mb-0.5">
                    Fabricação
                  </label>
                  <input
                    id={`${baseId}-man-mfg`}
                    type="date"
                    value={manualLotDraft.manufacture_date}
                    onChange={e => setManualLotDraft(prev => ({ ...prev, manufacture_date: e.target.value }))}
                    className="w-full px-2 py-1 text-xs font-mono bg-white border border-slate-300 rounded"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label htmlFor={`${baseId}-man-exp`} className="block text-[10px] font-bold uppercase text-slate-700 mb-0.5">
                    Validade
                  </label>
                  <input
                    id={`${baseId}-man-exp`}
                    type="date"
                    value={manualLotDraft.expiry_date}
                    onChange={e => setManualLotDraft(prev => ({ ...prev, expiry_date: e.target.value }))}
                    className="w-full px-2 py-1 text-xs font-mono bg-white border border-slate-300 rounded"
                  />
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={handleAddManualLotRow}
                    className="w-full py-1 px-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold cursor-pointer"
                  >
                    + Incluir
                  </button>
                </div>
              </div>
            )}

            {/* Tabela Responsiva de Lotes */}
            <div
              tabIndex={0}
              role="region"
              aria-labelledby={`${baseId}-lots-title`}
              className="controlled-lots-table-region flex-1 min-h-[180px] overflow-auto bg-white border border-slate-400 rounded"
            >
              <table className="w-full text-xs text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-100 border-b border-slate-300 text-[11px] font-black uppercase text-slate-700">
                  <tr>
                    <th className="py-2 px-3 whitespace-nowrap">LOTE</th>
                    <th className="py-2 px-3 text-center whitespace-nowrap">QTDE. DISPONÍVEL</th>
                    <th className="py-2 px-3 text-center whitespace-nowrap">FABRICAÇÃO</th>
                    <th className="py-2 px-3 text-center whitespace-nowrap">VALIDADE</th>
                    <th className="py-2 px-3 text-right whitespace-nowrap">QTDE. SELECIONADA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {visibleDraftLots.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 px-4 text-center text-slate-500">
                        Nenhum lote disponível em estoque no Digifarma para este item.
                        Use <strong>Informar Lote Manual</strong> acima para registrar o lote da embalagem.
                      </td>
                    </tr>
                  ) : (
                    visibleDraftLots.map((lot, idx) => (
                      <tr
                        key={`${lot.batch_lot}-${idx}`}
                        className={`${lot.quantity > 0 ? 'bg-emerald-50/60' : 'hover:bg-slate-50'} transition-colors`}
                      >
                        <th scope="row" className="py-2 px-3 font-mono font-black text-slate-900 whitespace-nowrap">
                          <span>{lot.batch_lot}</span>
                          {lot.is_expired && (
                            <span className="ml-1.5 text-[9px] font-sans font-black bg-rose-100 text-rose-800 border border-rose-300 px-1 py-0.2 rounded">
                              VENCIDO
                            </span>
                          )}
                          {lot.source === 'HISTORICO' && (
                            <span className="ml-1.5 text-[9px] font-sans font-bold bg-slate-100 text-slate-600 border border-slate-300 px-1 rounded">
                              Histórico
                            </span>
                          )}
                        </th>
                        <td data-label="Qtde. Disponível" className="py-2 px-3 text-center font-mono font-bold tabular-nums text-slate-800">
                          {lot.available_qty !== null && lot.available_qty !== undefined ? lot.available_qty : 'Manual'}
                        </td>
                        <td data-label="Fabricação" className="py-2 px-3 text-center font-mono text-slate-700 whitespace-nowrap">
                          {formatDateBr(lot.manufacture_date)}
                        </td>
                        <td data-label="Validade" className={`py-2 px-3 text-center font-mono whitespace-nowrap ${lot.is_expired ? 'text-rose-700 font-bold' : 'text-slate-700'}`}>
                          {formatDateBr(lot.expiry_date)}
                        </td>
                        <td data-label="Qtde. Selecionada" className="py-1.5 px-3 text-right">
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            <input
                              ref={idx === 0 ? lotsFirstInputRef : undefined}
                              type="text"
                              inputMode="numeric"
                              aria-label={`Quantidade selecionada do lote ${lot.batch_lot}`}
                              value={String(lot.quantity)}
                              onChange={e => handleDraftLotQtyChange(lot.batch_lot, e.target.value)}
                              className="w-20 px-2 py-1 text-right font-mono font-black bg-white border border-slate-400 rounded focus:outline-none focus:border-slate-900"
                            />
                            <button
                              type="button"
                              onClick={() => handleDraftLotQtyChange(lot.batch_lot, String(activeItem?.quantity || 1))}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-[10px] font-bold text-slate-700 cursor-pointer"
                              title="Selecionar quantidade da venda"
                            >
                              Usar
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

          {/* Rodapé da Seleção de Lotes */}
          <div className="px-4 py-2.5 bg-slate-200 border-t border-slate-300 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-black uppercase text-slate-700">QTD. SELECIONADA:</span>
              <span
                className={`px-3 py-1 bg-white border rounded font-mono font-black min-w-[56px] text-center ${
                  totalDraftSelectedQty === (activeItem?.quantity || 1)
                    ? 'border-emerald-500 text-emerald-700'
                    : 'border-amber-500 text-amber-800'
                }`}
              >
                {totalDraftSelectedQty}
              </span>
              {totalDraftSelectedQty !== (activeItem?.quantity || 1) && (
                <span className="text-[11px] font-semibold text-amber-800">
                  (Venda: {activeItem?.quantity || 1} un)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => setIsLotsDialogOpen(false)}
                className="px-4 py-1.5 bg-white hover:bg-slate-100 border border-slate-400 text-rose-700 rounded text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancelar</span>
              </button>
              <button
                type="submit"
                className="px-5 py-1.5 bg-emerald-700 hover:bg-emerald-600 border border-emerald-800 text-white rounded text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>OK</span>
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
};
