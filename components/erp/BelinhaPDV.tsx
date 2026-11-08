import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Barcode, 
  Search, 
  ShoppingCart, 
  Trash2, 
  CreditCard, 
  Banknote, 
  QrCode, 
  BookOpen, 
  CheckCircle2, 
  X, 
  Printer, 
  AlertCircle,
  Plus,
  Minus,
  RefreshCw,
  Clock,
  User,
  UserCheck,
  DollarSign,
  ShieldCheck,
  RotateCcw,
  History,
  Receipt,
  Tag,
  Lock,
  Zap,
  ArrowRight,
  AlertTriangle,
  FileText,
  Percent,
  Key,
  Sparkles
} from 'lucide-react';
import { useToast } from '../ToastContext';
import { BelaFarmaLogo } from '../BelaFarmaLogo';
import { DanfeNfceModal } from './DanfeNfceModal';
import { FiscalSettingsModal } from './FiscalSettingsModal';
import { PromotionsManagementModal } from './PromotionsManagementModal';
import { imprimirCupomVenda, imprimirDanfeNfce, imprimirComprovanteMovimentacaoCaixa } from '../../utils/thermalPrinter';
import { ControlledRecipeModal, ControlledProductItem, ControlledRecipeData } from './ControlledRecipeModal';
import { useThermalPrintSpooler } from './useThermalPrintSpooler';

interface CartItem {
  code: string;
  barcode: string;
  name: string;
  unit_price: number;
  unit_cost: number;
  quantity: number;
  discount: number;
  total_price: number;
  recipe_type?: 'AMARELA' | 'AZUL' | 'BRANCA' | 'CREME' | null;
  recipe_label?: string | null;
  is_controlado?: boolean;
  category?: string;
  generic?: boolean;
  is_unregistered?: boolean;
}

interface PaymentOption {
  method: 'DINHEIRO' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'PIX' | 'CREDIARIO';
  amount: number;
  change_amount?: number;
  card_brand?: string;
  installments?: number;
  due_date?: string;
}

interface ProductSearchResult {
  code: string;
  barcode: string;
  name: string;
  sale_price: number;
  promo_price: number;
  cost_price: number;
  stock_qty: number;
  curve?: string;
  vendas_30d?: number;
  vendas_10m?: number;
  category?: string;
  generic?: boolean;
  recipe_type?: 'AMARELA' | 'AZUL' | 'BRANCA' | 'CREME' | null;
  recipe_label?: string | null;
  is_controlado?: boolean;
}

interface CustomerOption {
  id: string;
  name: string;
  phone: string;
  cpf?: string;
}

interface BelinhaPDVProps {
  currentUser?: any;
  onNavigate?: (view: any) => void;
}

export const BelinhaPDV: React.FC<BelinhaPDVProps> = ({ currentUser, onNavigate }) => {
  const { addToast } = useToast();

  // Spooler de Impressão Térmica em Rede (qualquer computador da farmácia imprime na Bematech do Caixa)
  const { isPrinterStation, togglePrinterStation, testNetworkPrint } = useThermalPrintSpooler();

  // Relógio ao Vivo
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Identificação do Vendedor por Chave de Acesso do Login
  const [currentSeller, setCurrentSeller] = useState<{ id: string; name: string; role?: string; jobRole?: string } | null>(() => {
    if (currentUser && currentUser.name && currentUser.name !== 'Caixa') {
      return {
        id: currentUser.id,
        name: currentUser.name,
        role: currentUser.role,
        jobRole: currentUser.jobRole || 'Vendedor'
      };
    }
    return null;
  });
  const [isSellerModalOpen, setIsSellerModalOpen] = useState(false);
  const [sellerKeyInput, setSellerKeyInput] = useState('');
  const [isIdentifyingSeller, setIsIdentifyingSeller] = useState(false);
  const [isPendingCheckout, setIsPendingCheckout] = useState(false);
  const sellerKeyInputRef = useRef<HTMLInputElement>(null);

  // Modal de Produto Não Cadastrado / Cadastro Expresso Provisório [F7 / Bip não encontrado]
  const [isUnregisteredModalOpen, setIsUnregisteredModalOpen] = useState(false);
  const [unregisteredBarcode, setUnregisteredBarcode] = useState('');
  const [unregisteredName, setUnregisteredName] = useState('');
  const [unregisteredPrice, setUnregisteredPrice] = useState('');
  const [unregisteredQuantity, setUnregisteredQuantity] = useState(1);
  const [unregisteredCategory, setUnregisteredCategory] = useState<'cosmetico' | 'acessorio' | 'medicamento'>('cosmetico');
  const unregisteredPriceInputRef = useRef<HTMLInputElement>(null);
  const unregisteredNameInputRef = useRef<HTMLInputElement>(null);

  // Preços Escalonados por Quantidade (DESCONTO_ESCALONADO Digifarma)
  const [tieredRules, setTieredRules] = useState<any[]>([]);

  const fetchTieredRules = useCallback(async () => {
    try {
      const res = await fetch('/api/erp/pos/tiered-pricing');
      if (res.ok) {
        const json = await res.json();
        setTieredRules(json.rules || []);
      }
    } catch (e) {
      console.warn('Erro ao carregar regras de preço escalonado:', e);
    }
  }, []);

  useEffect(() => {
    fetchTieredRules();
  }, [fetchTieredRules]);

  // Estados do Carrinho
  const [cart, setCart] = useState<CartItem[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [discount, setDiscount] = useState<number>(0);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Autocomplete em tempo real ao digitar na barra principal
  const [autocompleteResults, setAutocompleteResults] = useState<ProductSearchResult[]>([]);
  const [isAutocompleteLoading, setIsAutocompleteLoading] = useState(false);
  const autocompleteDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Modal de Catálogo / Busca Avançada [F1]
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);

  // Modal de Desconto Geral [F2]
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [discountInputVal, setDiscountInputVal] = useState('');
  const [discountInputType, setDiscountInputType] = useState<'PERCENT' | 'VALUE'>('PERCENT');

  // Modal de Cliente / CPF Fidelidade [F6]
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);

  // Modal de Confirmação para Limpar Cupom [F9]
  const [isClearCartModalOpen, setIsClearCartModalOpen] = useState(false);

  // Forma de Pagamento e Dados Financeiros
  const [selectedMethod, setSelectedMethod] = useState<'DINHEIRO' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'PIX' | 'CREDIARIO'>('DINHEIRO');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [cardBrand, setCardBrand] = useState('MASTERCARD');
  const [installments, setInstallments] = useState<number>(1);

  // Cliente & Fidelidade
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [customersList, setCustomersList] = useState<CustomerOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerCpf, setCustomerCpf] = useState<string>('');
  const [customerNameInput, setCustomerNameInput] = useState<string>('');
  const [customerPoints, setCustomerPoints] = useState<number>(380);
  const [convenioNome, setConvenioNome] = useState<string>('Farmácia Popular / BelaFarma Club');

  // Identificação do cliente ativa
  const isCustomerIdentified = Boolean(selectedCustomer || customerCpf.trim() || customerNameInput.trim());

  // Cupom Concluído e Fiscal
  const [completedSale, setCompletedSale] = useState<any | null>(null);
  const [emitNfce, setEmitNfce] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('belaped_emit_nfce_default');
      return saved !== null ? saved === 'true' : true; // Padrão ATIVADO
    } catch {
      return true;
    }
  });

  const toggleEmitNfce = (checked: boolean) => {
    setEmitNfce(checked);
    try {
      localStorage.setItem('belaped_emit_nfce_default', checked ? 'true' : 'false');
    } catch {}
  };

  const [activeDanfeModal, setActiveDanfeModal] = useState<any | null>(null);
  const [completedSaleFiscalStatus, setCompletedSaleFiscalStatus] = useState<any | null>(null);
  const [isFiscalSettingsOpen, setIsFiscalSettingsOpen] = useState<boolean>(false);
  const [autoPrintCupom, setAutoPrintCupom] = useState<boolean>(() => {
    try {
      return localStorage.getItem('belaped_auto_print') === 'true';
    } catch {
      return false;
    }
  });

  const toggleAutoPrint = (checked: boolean) => {
    setAutoPrintCupom(checked);
    try {
      localStorage.setItem('belaped_auto_print', checked ? 'true' : 'false');
    } catch {}
  };

  // Modal de Histórico e Cancelamento Rápido no PDV [F7]
  const [isRecentSalesOpen, setIsRecentSalesOpen] = useState<boolean>(false);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState<boolean>(false);
  const [saleToCancel, setSaleToCancel] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [isEmittingFiscal, setIsEmittingFiscal] = useState<boolean>(false);

  // Inspeção de Itens da Venda e Exclusão Individual (Padrão Digifarma)
  const [inspectedSaleDetail, setInspectedSaleDetail] = useState<any | null>(null);
  const [isLoadingInspectedDetail, setIsLoadingInspectedDetail] = useState<boolean>(false);
  const [itemToCancelInPdv, setItemToCancelInPdv] = useState<{ saleId: string; item: any } | null>(null);
  const [itemCancelReasonInPdv, setItemCancelReasonInPdv] = useState<string>('Devolução / Desistência no Balcão');
  const [isCancellingItemInPdv, setIsCancellingItemInPdv] = useState<boolean>(false);

  // Central de Promoções e Validade
  const [isPromotionsModalOpen, setIsPromotionsModalOpen] = useState<boolean>(false);

  // Movimentações de Caixa (Sangria e Suprimento) [F4]
  const [isCashMovementModalOpen, setIsCashMovementModalOpen] = useState<boolean>(false);
  const [movementType, setMovementType] = useState<'SANGRIA' | 'SUPRIMENTO'>('SANGRIA');
  const [movementAmount, setMovementAmount] = useState<string>('');
  const [movementReason, setMovementReason] = useState<string>('');
  const [isSavingMovement, setIsSavingMovement] = useState<boolean>(false);
  const [recentMovements, setRecentMovements] = useState<any[]>([]);

  // Pré-Vendas e Orçamentos do Balcão [F9]
  const [isPreSaleModalOpen, setIsPreSaleModalOpen] = useState<boolean>(false);
  const [preSalesList, setPreSalesList] = useState<any[]>([]);
  const [isLoadingPreSales, setIsLoadingPreSales] = useState<boolean>(false);

  // Status de Crediário e Limite do Cliente
  const [customerCreditInfo, setCustomerCreditInfo] = useState<any | null>(null);

  // Controle Sanitário & Receitas Retidas (SNGPC)
  const [isControlledRecipeOpen, setIsControlledRecipeOpen] = useState<boolean>(false);
  const [controlledRecipesData, setControlledRecipesData] = useState<ControlledRecipeData[] | null>(null);
  const [isFinishingSale, setIsFinishingSale] = useState<boolean>(false);
  const [activeControlledItem, setActiveControlledItem] = useState<ControlledProductItem | null>(null);

  // Itens controlados no carrinho
  const controlledItemsInCart = useMemo<ControlledProductItem[]>(() => {
    return cart
      .filter(it => it.is_controlado || it.recipe_type)
      .map(it => ({
        code: it.code,
        barcode: it.barcode,
        name: it.name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        recipe_type: (it.recipe_type || 'BRANCA') as 'AMARELA' | 'AZUL' | 'BRANCA' | 'CREME',
        recipe_label: it.recipe_label || 'Receita de Controle Especial'
      }));
  }, [cart]);

  // Tema visual dominante no PDV baseado na receita mais restrita
  const dominantRecipe = useMemo(() => {
    if (controlledItemsInCart.length === 0) return null;
    if (controlledItemsInCart.some(it => it.recipe_type === 'AMARELA')) {
      return {
        type: 'AMARELA' as const,
        label: 'Receita Amarela (Notificação A)',
        badge: 'bg-amber-400 text-amber-950 font-black border border-amber-500 shadow-sm',
        banner: 'bg-amber-400 text-amber-950 border-amber-500 shadow-md',
        border: 'border-amber-400 dark:border-amber-500 ring-2 ring-amber-400/40'
      };
    }
    if (controlledItemsInCart.some(it => it.recipe_type === 'AZUL')) {
      return {
        type: 'AZUL' as const,
        label: 'Receita Azul (Notificação B)',
        badge: 'bg-blue-600 text-white font-black border border-blue-700 shadow-sm',
        banner: 'bg-blue-600 text-white border-blue-700 shadow-md',
        border: 'border-blue-500 dark:border-blue-600 ring-2 ring-blue-500/40'
      };
    }
    if (controlledItemsInCart.some(it => it.recipe_type === 'CREME')) {
      return {
        type: 'CREME' as const,
        label: 'Receita Antimicrobiano (Creme / RDC 20)',
        badge: 'bg-amber-100 text-amber-950 font-black border border-amber-300 shadow-sm',
        banner: 'bg-amber-100 text-amber-950 border-amber-300 shadow-md',
        border: 'border-amber-300 dark:border-amber-500 ring-2 ring-amber-300/40'
      };
    }
    return {
      type: 'BRANCA' as const,
      label: 'Receita Controle Especial (2 Vias)',
      badge: 'bg-slate-700 text-white font-black border border-slate-800 shadow-sm',
      banner: 'bg-slate-700 text-white border-slate-800 shadow-md',
      border: 'border-slate-500 dark:border-slate-600 ring-2 ring-slate-500/40'
    };
  }, [controlledItemsInCart]);

  // Helper para calcular desconto escalonado (faixa por quantidade)
  const getTieredDiscount = useCallback((it: CartItem) => {
    if (!it || !tieredRules || tieredRules.length === 0 || it.quantity <= 1) return null;
    const barcodeItem = it.barcode ? String(it.barcode).trim() : null;
    const codeItem = it.code ? String(it.code).trim() : null;
    const qtdItem = it.quantity;

    const matches = tieredRules.filter(r => 
      (barcodeItem && r.barcode === barcodeItem) ||
      (codeItem && String(r.product_id) === codeItem)
    );

    if (matches.length === 0) return null;
    matches.sort((a, b) => b.quantity - a.quantity);
    const applicable = matches.find(r => qtdItem >= r.quantity);
    if (!applicable) return null;

    const fullPacks = Math.floor(qtdItem / applicable.quantity);
    const remainder = qtdItem % applicable.quantity;
    const promoTotal = (fullPacks * applicable.package_price) + (remainder * it.unit_price);
    const normalTotal = it.unit_price * qtdItem;
    const savings = Math.max(0, normalTotal - promoTotal);

    if (savings <= 0.009) return null;

    return {
      rule: applicable,
      promoTotal: Math.round(promoTotal * 100) / 100,
      savings: Math.round(savings * 100) / 100,
      label: `${applicable.quantity} un por R$ ${applicable.package_price.toFixed(2)}`
    };
  }, [tieredRules]);

  // Economia total de preços escalonados no carrinho
  const tieredSavingsTotal = useMemo(() => {
    return cart.reduce((acc, it) => {
      const td = getTieredDiscount(it);
      return acc + (td ? td.savings : 0);
    }, 0);
  }, [cart, getTieredDiscount]);

  // Totais calculados
  const subtotal = useMemo(() => cart.reduce((acc, it) => acc + (it.unit_price * it.quantity), 0), [cart]);
  const itemDiscounts = useMemo(() => cart.reduce((acc, it) => acc + ((it.discount || 0) * it.quantity), 0), [cart]);
  const generalDiscountAmount = useMemo(() => {
    if (discountPercent > 0) {
      return Math.round((subtotal - itemDiscounts) * (discountPercent / 100) * 100) / 100;
    }
    return discount;
  }, [subtotal, itemDiscounts, discountPercent, discount]);

  const totalDiscount = useMemo(() => itemDiscounts + generalDiscountAmount + tieredSavingsTotal, [itemDiscounts, generalDiscountAmount, tieredSavingsTotal]);
  const totalFinal = useMemo(() => Math.max(0, Math.round((subtotal - totalDiscount) * 100) / 100), [subtotal, totalDiscount]);
  const totalQuantity = useMemo(() => cart.reduce((acc, it) => acc + it.quantity, 0), [cart]);

  // Troco em dinheiro
  const isCashValueEntered = cashReceived.trim() !== '';
  const cashNum = isCashValueEntered ? (parseFloat(cashReceived.replace(',', '.')) || 0) : totalFinal;
  const cashChange = selectedMethod === 'DINHEIRO' && isCashValueEntered ? Math.max(0, cashNum - totalFinal) : 0;

  // Refs de Foco
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Abertura rápida do modal de identificação de vendedor
  const handleOpenSellerModal = useCallback(() => {
    setSellerKeyInput('');
    setIsSellerModalOpen(true);
    setTimeout(() => sellerKeyInputRef.current?.focus(), 80);
  }, []);

  // Foco automático no input de bipagem
  const focusBarcodeInput = useCallback(() => {
    if (!isSearchOpen && !isSellerModalOpen && !isUnregisteredModalOpen && !isControlledRecipeOpen && !isDiscountModalOpen && !isCustomerModalOpen && !isRecentSalesOpen && !isClearCartModalOpen && !completedSale) {
      setTimeout(() => barcodeInputRef.current?.focus(), 50);
    }
  }, [isSearchOpen, isSellerModalOpen, isUnregisteredModalOpen, isControlledRecipeOpen, isDiscountModalOpen, isCustomerModalOpen, isRecentSalesOpen, isClearCartModalOpen, completedSale]);

  // Foco inicial ao abrir o PDV (ou solicitação única do vendedor se não definido)
  const hasPromptedInitialSellerRef = useRef(false);
  useEffect(() => {
    if (!currentSeller && !hasPromptedInitialSellerRef.current) {
      hasPromptedInitialSellerRef.current = true;
      handleOpenSellerModal();
    } else if (currentSeller) {
      focusBarcodeInput();
    }
  }, [currentSeller, handleOpenSellerModal, focusBarcodeInput]);

  // Abertura da modal de produto não cadastrado / sem código de barras (*123)
  const handleOpenUnregisteredModal = useCallback((barcode: string, qty: number = 1) => {
    setUnregisteredBarcode(barcode);
    setUnregisteredName('');
    setUnregisteredPrice('');
    setUnregisteredQuantity(qty > 0 ? qty : 1);
    setIsUnregisteredModalOpen(true);
    setTimeout(() => {
      unregisteredNameInputRef.current?.focus();
    }, 100);
  }, []);

  // Confirmação de inclusão do produto expresso provisório (Blindagem Fiscal SEFAZ + Fila de Saneamento)
  const handleConfirmUnregisteredProduct = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanPrice = unregisteredPrice.replace(',', '.').trim();
    const priceNum = parseFloat(cleanPrice);

    if (isNaN(priceNum) || priceNum <= 0) {
      addToast('Informe um valor de venda válido (maior que zero).', 'warning');
      unregisteredPriceInputRef.current?.focus();
      return;
    }

    const name = unregisteredName.trim() || `Produto Expresso (${unregisteredBarcode || 'S/ Código'})`;
    const isAvulsoShortcut = unregisteredBarcode.startsWith('*');

    try {
      // 1. Cadastra formalmente como produto expresso no ERP e gera tarefa de saneamento fiscal
      const res = await fetch('/api/erp/pos/quick-product', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-name': currentSeller?.name || 'Caixa'
        },
        body: JSON.stringify({
          name,
          sale_price: priceNum,
          barcode_read: isAvulsoShortcut ? '' : unregisteredBarcode,
          category: unregisteredCategory,
          user_name: currentSeller?.name || 'Caixa'
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Erro ao registrar produto provisório.');
      }

      const prod = json.product;

      const newItem: CartItem = {
        code: prod.code,
        barcode: prod.barcode,
        name: prod.name,
        unit_price: prod.sale_price,
        unit_cost: 0,
        quantity: unregisteredQuantity,
        discount: 0,
        total_price: Math.round(unregisteredQuantity * prod.sale_price * 100) / 100,
        recipe_type: null,
        recipe_label: null,
        is_controlado: false,
        category: prod.category || 'Expresso Provisório',
        generic: false,
        is_unregistered: false // VÁLIDO FISCALMENTE COM REGRA 'SEM GTIN'
      };

      setCart(prev => [...prev, newItem]);
      setIsUnregisteredModalOpen(false);
      addToast(`⚡ ${unregisteredQuantity}x ${name.substring(0, 24)} adicionado! Tarefa de saneamento fiscal gerada.`, 'success', 3000);

      // 2. Cria também a tarefa geral do sistema para alerta no quadro
      try {
        const creatorId = currentSeller?.id || 'caixa';
        fetch(`/api/tasks?userId=${creatorId}&userRole=Vendedor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: `task-${Date.now()}`,
            title: `Saneamento Fiscal: ${name}`,
            description: `Produto cadastrado de forma expressa no PDV pelo operador ${currentSeller?.name || 'Caixa'}.\n` +
              `• Valor: R$ ${priceNum.toFixed(2)}\n` +
              `• Código Provisório: ${prod.code}\n` +
              `• Código Lido: ${unregisteredBarcode}\n` +
              `• NCM Provisório: ${prod.ncm}\n` +
              `Ação: Preencher NCM definitivo, custo real e sincronizar no Digifarma.`,
            assignedUser: 'all_users',
            creator: creatorId,
            priority: 'Urgente',
            status: 'A Fazer',
            dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            creationDate: new Date().toISOString(),
            color: 'red'
          })
        }).catch(() => {});
      } catch {}
    } catch (err: any) {
      addToast(`Erro ao registrar: ${err.message}`, 'error');
    }

    focusBarcodeInput();
  };

  // Identificação do vendedor por chave de acesso/login
  const handleIdentifySeller = async (keyToVerify?: string) => {
    const key = (keyToVerify || sellerKeyInput).trim();
    if (!key) {
      addToast('Digite a chave de acesso do vendedor.', 'warning');
      sellerKeyInputRef.current?.focus();
      return;
    }

    setIsIdentifyingSeller(true);
    try {
      const res = await fetch('/api/erp/pos/identify-seller', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessKey: key })
      });

      const json = await res.json();
      if (res.ok && json.success && json.seller) {
        setCurrentSeller(json.seller);
        setIsSellerModalOpen(false);
        setSellerKeyInput('');
        addToast(`👤 Vendedor: ${json.seller.name} identificado com sucesso!`, 'success', 2500);

        // Se o checkout estava aguardando a identificação do vendedor, prossegue imediatamente
        if (isPendingCheckout) {
          setIsPendingCheckout(false);
          setTimeout(() => handleStartCheckoutWithSeller(json.seller), 100);
        } else {
          focusBarcodeInput();
        }
      } else {
        addToast(json.error || 'Chave de acesso não encontrada ou incorreta.', 'error');
        setSellerKeyInput('');
        sellerKeyInputRef.current?.focus();
      }
    } catch (err: any) {
      addToast('Erro na validação da chave de acesso.', 'error');
    } finally {
      setIsIdentifyingSeller(false);
    }
  };

  // Carregar lista de clientes para crediário e fidelidade
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const res = await fetch('/api/customers');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setCustomersList(data.map((c: any) => ({ 
              id: c.id, 
              name: c.name, 
              phone: c.phone || '', 
              cpf: c.cpf || c.document || '' 
            })));
          }
        }
      } catch (e) {}
    };
    fetchCustomers();
  }, []);

  // Atalhos de teclado globais do PDV
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Se estiver na tela de cupom concluído, ENTER ou ESC retorna imediatamente ao caixa
      if (completedSale && (e.key === 'Enter' || e.key === 'Escape')) {
        e.preventDefault();
        setCompletedSale(null);
        focusBarcodeInput();
        return;
      }

      // F1 ou F2 -> Abrir Catálogo / Consulta Inteligente de Produtos (Digifarma F2)
      if (e.key === 'F1' || e.key === 'F2') {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
      // F3 ou F6 -> Cliente / Convênio / Crediário (Digifarma F3)
      else if (e.key === 'F3' || e.key === 'F6') {
        e.preventDefault();
        setIsCustomerModalOpen(true);
      }
      // F4 -> Sangria e Suprimento (Movimentações de Caixa)
      else if (e.key === 'F4') {
        e.preventDefault();
        fetchRecentMovements();
        setIsCashMovementModalOpen(true);
      }
      // F5 -> Identificar / Trocar Vendedor Rápido
      else if (e.key === 'F5') {
        e.preventDefault();
        handleOpenSellerModal();
      }
      // F7 -> Desconto Geral (%) ou Valor
      else if (e.key === 'F7') {
        e.preventDefault();
        setIsDiscountModalOpen(true);
      }
      // F8 ou F10 -> Finalizar Venda / Pagamento Rápido (Digifarma F8)
      else if (e.key === 'F8' || e.key === 'F10') {
        e.preventDefault();
        handleStartCheckout();
      }
      // F9 -> Puxar Pré-Venda / Balcão / WhatsApp (Digifarma Pré-Venda)
      else if (e.key === 'F9') {
        e.preventDefault();
        fetchPreSales();
        setIsPreSaleModalOpen(true);
      }
      // F11 ou Shift+F10 ou F12 -> Cancelar Venda / Consultar Vendas do Dia
      else if (e.key === 'F11' || e.key === 'F12') {
        e.preventDefault();
        handleOpenRecentSales();
      }
      // ESC -> Fechar qualquer modal aberta ou limpar cupom
      else if (e.key === 'Escape') {
        if (isPromotionsModalOpen) setIsPromotionsModalOpen(false);
        else if (isCashMovementModalOpen) setIsCashMovementModalOpen(false);
        else if (isPreSaleModalOpen) setIsPreSaleModalOpen(false);
        else if (isUnregisteredModalOpen) setIsUnregisteredModalOpen(false);
        else if (isSellerModalOpen) {
          setIsSellerModalOpen(false);
          setIsPendingCheckout(false);
        }
        else if (isControlledRecipeOpen) setIsControlledRecipeOpen(false);
        else if (isSearchOpen) setIsSearchOpen(false);
        else if (isDiscountModalOpen) setIsDiscountModalOpen(false);
        else if (isCustomerModalOpen) setIsCustomerModalOpen(false);
        else if (isRecentSalesOpen) {
          if (itemToCancelInPdv) {
            setItemToCancelInPdv(null);
          } else if (inspectedSaleDetail) {
            setInspectedSaleDetail(null);
          } else {
            setIsRecentSalesOpen(false);
            setSaleToCancel(null);
          }
        }
        else if (isClearCartModalOpen) setIsClearCartModalOpen(false);
        else if (completedSale) setCompletedSale(null);
        else if (autocompleteResults.length > 0) setAutocompleteResults([]);
        else if (cart.length > 0) {
          // Se nenhuma modal está aberta e há itens no carrinho, ESC aciona confirmação de limpar cupom
          setIsClearCartModalOpen(true);
        }
        focusBarcodeInput();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    cart, 
    isSearchOpen, 
    isSellerModalOpen,
    isControlledRecipeOpen, 
    isDiscountModalOpen, 
    isCustomerModalOpen, 
    isRecentSalesOpen, 
    isClearCartModalOpen, 
    completedSale, 
    autocompleteResults, 
    focusBarcodeInput,
    handleOpenSellerModal
  ]);

  // Autocomplete ao vivo ao digitar na barra de produto
  useEffect(() => {
    const raw = barcodeInput.trim();
    if (raw.length < 2 || raw.includes('*')) {
      setAutocompleteResults([]);
      return;
    }

    if (autocompleteDebounceRef.current) {
      clearTimeout(autocompleteDebounceRef.current);
    }

    autocompleteDebounceRef.current = setTimeout(async () => {
      try {
        setIsAutocompleteLoading(true);
        const res = await fetch(`/api/erp/products?q=${encodeURIComponent(raw)}&limit=6`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            setAutocompleteResults(json.data);
          }
        }
      } catch (err) {
      } finally {
        setIsAutocompleteLoading(false);
      }
    }, 200);

    return () => {
      if (autocompleteDebounceRef.current) clearTimeout(autocompleteDebounceRef.current);
    };
  }, [barcodeInput]);

  // Polling em tempo real do status fiscal da venda finalizada
  useEffect(() => {
    if (!completedSale?.sale_id) {
      setCompletedSaleFiscalStatus(null);
      return;
    }

    let isMounted = true;
    let timer: NodeJS.Timeout | null = null;

    const checkSaleStatus = async () => {
      try {
        const res = await fetch(`/api/erp/sales/${encodeURIComponent(completedSale.sale_id)}`);
        if (res.ok && isMounted) {
          const json = await res.json();
          if (json.success && json.data) {
            setCompletedSaleFiscalStatus(json.data);
            // Se já foi emitido, contingenciado ou erro definitivo, para o polling
            if (['EMITIDO', 'CONTINGENCIA', 'ERRO', 'NAO_FISCAL'].includes(json.data.fiscal_status)) {
              return;
            }
          }
        }
      } catch (e) {
      }
      if (isMounted) {
        timer = setTimeout(checkSaleStatus, 1500);
      }
    };

    checkSaleStatus();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [completedSale?.sale_id]);

  // Bipagem de produto (Enter no input)
  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = barcodeInput.trim();
    if (!raw) return;

    // Se o vendedor não estiver identificado, bloqueia e abre o modal de vendedor
    if (!currentSeller) {
      addToast('⚠️ Identifique o vendedor com a chave de acesso para iniciar a venda.', 'warning', 3500);
      handleOpenSellerModal();
      return;
    }

    // Suporte para produto sem código de barras (iniciado por *): ex: "*123", "*", "*avulso"
    if (raw.startsWith('*')) {
      handleOpenUnregisteredModal(raw, 1);
      setBarcodeInput('');
      setAutocompleteResults([]);
      return;
    }

    // Suporte para multiplicador: ex: "3*789..." ou "5*186276" ou "3**123"
    let multiplier = 1;
    let codeToSearch = raw;
    if (raw.includes('*')) {
      const parts = raw.split('*');
      if (parts.length === 2 && !isNaN(Number(parts[0])) && Number(parts[0]) > 0) {
        multiplier = parseFloat(parts[0]);
        codeToSearch = parts[1].trim();
        if (!codeToSearch || codeToSearch.startsWith('*')) {
          handleOpenUnregisteredModal(codeToSearch || '*123', multiplier);
          setBarcodeInput('');
          setAutocompleteResults([]);
          return;
        }
      }
    }

    try {
      const res = await fetch(`/api/erp/products/${encodeURIComponent(codeToSearch)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          addItemToCart(json.data, multiplier);
          setBarcodeInput('');
          setAutocompleteResults([]);
          focusBarcodeInput();
          return;
        }
      }

      // Se não achou exato pelo endpoint direto, tenta a busca rápida por query
      const searchRes = await fetch(`/api/erp/products?q=${encodeURIComponent(codeToSearch)}&limit=1`);
      if (searchRes.ok) {
        const searchJson = await searchRes.json();
        if (searchJson.success && searchJson.data && searchJson.data.length > 0) {
          addItemToCart(searchJson.data[0], multiplier);
          setBarcodeInput('');
          setAutocompleteResults([]);
          focusBarcodeInput();
          return;
        }
      }

      // PRODUTO NÃO ENCONTRADO NO BANCO DE DADOS:
      // Abre a modal de entrada manual do produto não cadastrado para informar valor e criar tarefa
      handleOpenUnregisteredModal(codeToSearch, multiplier);
      setBarcodeInput('');
      setAutocompleteResults([]);
    } catch (err: any) {
      addToast('Erro ao consultar produto.', 'error');
    }
  };

  // Adiciona produto ao carrinho
  const addItemToCart = (prod: ProductSearchResult, qty: number = 1) => {
    if (!currentSeller) {
      addToast('⚠️ Identifique o vendedor com a chave de acesso para iniciar a venda.', 'warning', 3500);
      handleOpenSellerModal();
      return;
    }

    const effectivePrice = prod.promo_price > 0 ? prod.promo_price : prod.sale_price;
    const costPrice = prod.cost_price || 0;

    // Desconto automático para genéricos se o cliente estiver identificado
    let initialDiscount = 0;
    if (isCustomerIdentified && prod.generic) {
      initialDiscount = Math.round(effectivePrice * 0.10 * 100) / 100; // 10% de desconto fidelidade
    }

    setCart(prev => {
      const existingIdx = prev.findIndex(it => it.code === prod.code);
      if (existingIdx >= 0) {
        const copy = [...prev];
        const newQty = copy[existingIdx].quantity + qty;
        const unitPrice = copy[existingIdx].unit_price;
        const itemDisc = copy[existingIdx].discount || 0;
        copy[existingIdx] = {
          ...copy[existingIdx],
          quantity: newQty,
          total_price: Math.round(newQty * (unitPrice - itemDisc) * 100) / 100
        };
        return copy;
      } else {
        return [
          ...prev,
          {
            code: prod.code,
            barcode: prod.barcode,
            name: prod.name,
            unit_price: effectivePrice,
            unit_cost: costPrice,
            quantity: qty,
            discount: initialDiscount,
            total_price: Math.round(qty * (effectivePrice - initialDiscount) * 100) / 100,
            recipe_type: prod.recipe_type || null,
            recipe_label: prod.recipe_label || null,
            is_controlado: prod.is_controlado || Boolean(prod.recipe_type),
            category: prod.category || 'Geral',
            generic: prod.generic
          }
        ];
      }
    });

    const isControlled = Boolean(prod.is_controlado || prod.recipe_type);
    if (isControlled) {
      const controlledItem: ControlledProductItem = {
        code: prod.code,
        barcode: prod.barcode,
        name: prod.name,
        quantity: qty,
        unit_price: effectivePrice,
        recipe_type: (prod.recipe_type || 'BRANCA') as any,
        recipe_label: prod.recipe_label || 'Receita de Controle Especial'
      };
      setActiveControlledItem(controlledItem);
      setIsControlledRecipeOpen(true);
      addToast(`⚠️ Medicamento Controlado (${prod.recipe_label || prod.recipe_type}): Preencha os dados da receita retida conforme a legislação.`, 'warning', 4000);
    } else {
      addToast(`${qty}x ${prod.name.substring(0, 24)}... adicionado!`, 'success', 1800);
    }
  };

  // Remover item
  const handleRemoveItem = (index: number) => {
    setCart(prev => prev.filter((_, idx) => idx !== index));
    focusBarcodeInput();
  };

  // Alterar quantidade manualmente
  const handleUpdateQuantity = (index: number, delta: number) => {
    setCart(prev => {
      const copy = [...prev];
      const newQty = Math.max(1, copy[index].quantity + delta);
      const unitPrice = copy[index].unit_price;
      const itemDisc = copy[index].discount || 0;
      copy[index] = {
        ...copy[index],
        quantity: newQty,
        total_price: Math.round(newQty * (unitPrice - itemDisc) * 100) / 100
      };
      return copy;
    });
  };

  // Limpar lista
  const handleClearCart = () => {
    setCart([]);
    setDiscount(0);
    setDiscountPercent(0);
    setCashReceived('');
    setControlledRecipesData(null);
    setIsClearCartModalOpen(false);
    addToast('Cupom cancelado e carrinho esvaziado.', 'info');
    focusBarcodeInput();
  };

  // Busca status de crediário do cliente
  const fetchCustomerCredit = async (term: string) => {
    if (!term) return;
    try {
      const res = await fetch(`/api/erp/pos/customer-credit/${encodeURIComponent(term)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setCustomerCreditInfo(json.data);
        }
      } else {
        setCustomerCreditInfo(null);
      }
    } catch {
      setCustomerCreditInfo(null);
    }
  };

  // Identificação do Cliente
  const handleIdentifyCustomer = (cpf: string, name?: string) => {
    const cleanCpf = cpf.trim();
    const cleanName = (name || '').trim();
    setCustomerCpf(cleanCpf);
    if (cleanName) setCustomerNameInput(cleanName);

    // Tenta encontrar cliente correspondente
    const found = customersList.find(c => 
      (cleanCpf && c.cpf && c.cpf.replace(/\D/g, '') === cleanCpf.replace(/\D/g, '')) ||
      (cleanName && c.name.toLowerCase() === cleanName.toLowerCase())
    );

    if (found) {
      setSelectedCustomer(found);
      setCustomerNameInput(found.name);
      fetchCustomerCredit(found.id || cleanCpf);
    } else if (cleanCpf || cleanName) {
      fetchCustomerCredit(cleanCpf || cleanName);
    }

    // Recalcula descontos de genéricos no carrinho se houver
    setCart(prev => prev.map(it => {
      if (it.generic) {
        const itemDisc = Math.round(it.unit_price * 0.10 * 100) / 100;
        return {
          ...it,
          discount: itemDisc,
          total_price: Math.round(it.quantity * (it.unit_price - itemDisc) * 100) / 100
        };
      }
      return it;
    }));

    setIsCustomerModalOpen(false);
    addToast(`Cliente ${cleanName || cleanCpf || 'Identificado'} vinculado à venda!`, 'success');
  };

  const handleResetCustomer = () => {
    setSelectedCustomer(null);
    setCustomerCpf('');
    setCustomerNameInput('');
    setCustomerCreditInfo(null);
    setCart(prev => prev.map(it => ({
      ...it,
      discount: 0,
      total_price: Math.round(it.quantity * it.unit_price * 100) / 100
    })));
    addToast('Cliente desvinculado.', 'info');
  };

  // Movimentações de Caixa (Sangria e Suprimento)
  const fetchRecentMovements = async () => {
    try {
      const res = await fetch('/api/erp/pos/cash-movements');
      if (res.ok) {
        const json = await res.json();
        setRecentMovements(json.data?.movements || []);
      }
    } catch (err) {
      console.error('Erro ao buscar movimentações de caixa:', err);
    }
  };

  const handleConfirmCashMovement = async () => {
    const numVal = parseFloat(movementAmount.replace(',', '.')) || 0;
    if (numVal <= 0) {
      addToast('Informe um valor válido maior que zero.', 'warning');
      return;
    }

    setIsSavingMovement(true);
    try {
      const res = await fetch('/api/erp/pos/cash-movement', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-name': currentSeller?.name || 'Caixa'
        },
        body: JSON.stringify({
          movement_type: movementType,
          amount: numVal,
          reason: movementReason || (movementType === 'SANGRIA' ? 'Sangria de Caixa' : 'Suprimento / Reforço'),
          user_name: currentSeller?.name || 'Caixa'
        })
      });

      const json = await res.json();
      if (res.ok && json.id) {
        addToast(`✅ ${movementType} de R$ ${numVal.toFixed(2)} lançada com sucesso!`, 'success');
        imprimirComprovanteMovimentacaoCaixa({
          id: json.id,
          movement_type: movementType,
          amount: numVal,
          reason: movementReason || (movementType === 'SANGRIA' ? 'Sangria de Caixa' : 'Suprimento / Reforço'),
          user_name: currentSeller?.name || 'Caixa',
          created_at: json.created_at
        });
        setMovementAmount('');
        setMovementReason('');
        setIsCashMovementModalOpen(false);
        focusBarcodeInput();
      } else {
        addToast(json.error || 'Erro ao registrar movimentação.', 'error');
      }
    } catch (err) {
      addToast('Erro na conexão com o servidor.', 'error');
    } finally {
      setIsSavingMovement(false);
    }
  };

  // Pré-Vendas e Orçamentos (Balcão / WhatsApp)
  const fetchPreSales = async () => {
    setIsLoadingPreSales(true);
    try {
      const res = await fetch('/api/erp/pos/pre-sales?status=ABERTA');
      if (res.ok) {
        const json = await res.json();
        setPreSalesList(json.data || []);
      }
    } catch (err) {
      addToast('Erro ao carregar pré-vendas.', 'error');
    } finally {
      setIsLoadingPreSales(false);
    }
  };

  const handleImportPreSale = async (preSale: any) => {
    if (!preSale || !Array.isArray(preSale.items)) return;

    const importedItems: CartItem[] = preSale.items.map((it: any) => ({
      code: it.product_code,
      barcode: it.barcode || '',
      name: it.product_name,
      unit_price: it.unit_price,
      unit_cost: it.unit_cost || 0,
      quantity: it.quantity,
      discount: 0,
      total_price: it.total_price,
      recipe_type: it.recipe_type || null,
      recipe_label: it.recipe_label || null
    }));

    setCart(importedItems);
    if (preSale.discount_value > 0) {
      setDiscount(preSale.discount_value);
    }
    if (preSale.customer_name) {
      setCustomerNameInput(preSale.customer_name);
      if (preSale.customer_id) {
        const found = customersList.find(c => c.id === preSale.customer_id);
        if (found) {
          setSelectedCustomer(found);
          fetchCustomerCredit(found.id);
        }
      }
    }

    try {
      await fetch(`/api/erp/pos/pre-sales/${preSale.id}/consume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sale_id: 'IMPORTADO_PDV' })
      });
    } catch {}

    setIsPreSaleModalOpen(false);
    addToast(`✅ Pré-venda #${preSale.id} importada com ${importedItems.length} itens!`, 'success');
    focusBarcodeInput();
  };

  const handleSaveAsPreSale = async () => {
    if (cart.length === 0) {
      addToast('Adicione produtos para salvar como orçamento/pré-venda.', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/erp/pos/pre-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedCustomer?.id || null,
          customer_name: selectedCustomer?.name || customerNameInput || null,
          seller_id: currentSeller?.id || null,
          seller_name: currentSeller?.name || null,
          items: cart,
          discount_value: totalDiscount,
          notes: 'Gerado pelo Balcão / PDV'
        })
      });

      const json = await res.json();
      if (res.ok && json.success) {
        addToast(`📋 Pré-Venda #${json.pre_sale_id} gerada com sucesso!`, 'success');
        setCart([]);
        setDiscount(0);
        setDiscountPercent(0);
        setSelectedCustomer(null);
        setCustomerCpf('');
        setCustomerNameInput('');
        setCustomerCreditInfo(null);
        setIsPreSaleModalOpen(false);
        focusBarcodeInput();
      } else {
        addToast(json.error || 'Erro ao gerar pré-venda.', 'error');
      }
    } catch {
      addToast('Erro ao comunicar com o servidor.', 'error');
    }
  };

  // Busca de produtos por nome no modal [F1]
  const handleSearchByName = async () => {
    if (!searchQuery.trim()) return;
    setIsSearchingProducts(true);
    try {
      const res = await fetch(`/api/erp/products?q=${encodeURIComponent(searchQuery.trim())}&limit=30`);
      if (res.ok) {
        const json = await res.json();
        setSearchResults(json.data || []);
      }
    } catch (e) {
      addToast('Erro ao buscar produtos.', 'error');
    } finally {
      setIsSearchingProducts(false);
    }
  };

  // Iniciar finalização de venda (exige identificação do vendedor e controle sanitário)
  const handleStartCheckout = (sellerOverride?: { id: string; name: string }) => {
    if (cart.length === 0) {
      addToast('Adicione pelo menos um produto ao carrinho antes de finalizar.', 'warning');
      return;
    }

    const seller = sellerOverride || currentSeller;
    if (!seller) {
      setIsPendingCheckout(true);
      handleOpenSellerModal();
      addToast('⚠️ Identifique o vendedor com a chave de acesso para concluir a venda.', 'warning', 3500);
      return;
    }

    // Se há itens controlados no carrinho: verificar se todos têm lote e receita preenchidos
    const hasMissingLot = controlledItemsInCart.some(it => {
      const rec = controlledRecipesData?.find(r => r.product_code === it.code);
      return !rec || !rec.batch_lot;
    });

    if (controlledItemsInCart.length > 0 && (!controlledRecipesData || hasMissingLot)) {
      setIsFinishingSale(true);
      setIsControlledRecipeOpen(true);
      addToast('⚠️ Informe o Lote e os dados da receita retida conforme a lei.', 'warning', 3500);
      return;
    }

    handleConfirmCheckout(seller);
  };

  const handleStartCheckoutWithSeller = (seller: { id: string; name: string }) => {
    handleStartCheckout(seller);
  };

  // Finalizar a venda e transmitir para SEFAZ / Bematech
  const handleConfirmCheckout = async (sellerOverride?: { id: string; name: string }) => {
    if (cart.length === 0) return;

    const seller = sellerOverride || currentSeller;
    if (!seller) {
      setIsPendingCheckout(true);
      handleOpenSellerModal();
      addToast('⚠️ Identifique o vendedor com a chave de acesso para concluir a venda.', 'warning', 3500);
      return;
    }

    if (selectedMethod === 'DINHEIRO') {
      if (isCashValueEntered && cashNum < totalFinal) {
        addToast(`Valor em dinheiro informado (R$ ${cashNum.toFixed(2)}) é menor que o total a pagar (R$ ${totalFinal.toFixed(2)}).`, 'warning');
        return;
      }
    }

    if (selectedMethod === 'CREDIARIO' && !selectedCustomer) {
      addToast('Selecione ou vincule o cliente para lançar no Crediário.', 'warning');
      setIsCustomerModalOpen(true);
      return;
    }

    setIsProcessing(true);
    try {
      const paymentPayload: PaymentOption = {
        method: selectedMethod,
        amount: totalFinal,
        change_amount: selectedMethod === 'DINHEIRO' ? cashChange : 0,
        card_brand: ['CARTAO_DEBITO', 'CARTAO_CREDITO'].includes(selectedMethod) ? cardBrand : undefined,
        installments: selectedMethod === 'CARTAO_CREDITO' ? installments : 1
      };

      const payload = {
        items: cart.map(it => ({
          code: it.code,
          barcode: it.barcode,
          product_name: it.name,
          quantity: it.quantity,
          unit_price: it.unit_price,
          unit_cost: it.unit_cost,
          is_unregistered: it.is_unregistered
        })),
        payments: [
          {
            payment_method: paymentPayload.method,
            amount: paymentPayload.amount,
            change_amount: paymentPayload.change_amount,
            card_brand: paymentPayload.card_brand,
            installments: paymentPayload.installments
          }
        ],
        customer_id: selectedCustomer ? selectedCustomer.id : null,
        customer_name: (selectedCustomer ? selectedCustomer.name : customerNameInput.trim()) || null,
        discount_value: totalDiscount,
        user_name: seller.name,
        seller_id: seller.id,
        seller_name: seller.name,
        controlled_recipes: controlledRecipesData || undefined,
        emit_nfce: emitNfce,
        customer_cpf: customerCpf.trim() || null
      };

      const res = await fetch('/api/erp/pos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (res.ok && json.success) {
        const finalCustomerName = selectedCustomer?.name || customerNameInput.trim() || undefined;
        const saleData = {
          sale_id: json.sale_id,
          date: json.sale_date,
          time: json.sale_time,
          items: [...cart],
          total_items_value: subtotal,
          discount_value: totalDiscount,
          total_final: totalFinal,
          payment: paymentPayload,
          customer_name: finalCustomerName,
          seller_id: seller.id,
          seller_name: seller.name,
          change: cashChange,
          digifarma: json.digifarma
        };

        // Limpar carrinho e dados para o próximo atendimento rápido (< 100ms)
        setCart([]);
        setDiscount(0);
        setDiscountPercent(0);
        setCashReceived('');
        setSelectedCustomer(null);
        setControlledRecipesData(null);
        setCustomerCpf('');
        setCustomerNameInput('');

        // Venda finalizada com sucesso imediato no balcão
        setCompletedSale(saleData);
        if (autoPrintCupom) {
          setTimeout(() => {
            imprimirCupomVenda(saleData);
          }, 50);
        }

        const msgFiscal = emitNfce ? ' (NFC-e processando em 2º plano)' : '';
        addToast(`✅ Venda finalizada por ${seller.name}! (R$ ${totalFinal.toFixed(2)})${msgFiscal}`, 'success', 3000);
        focusBarcodeInput();

      } else {
        console.error('[BelinhaPDV Checkout Error]:', res.status, json);
        addToast(json.error || 'Erro ao registrar venda.', 'error');
      }

    } catch (err: any) {
      console.error('[BelinhaPDV Checkout Exception]:', err);
      addToast('Erro na comunicação com o servidor.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Buscar vendas recentes do dia para consulta/cancelamento rápido [F7]
  const fetchRecentSales = async () => {
    setIsLoadingRecent(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/erp/sales?dataInicio=${today}&dataFim=${today}&limit=20`);
      if (res.ok) {
        const json = await res.json();
        setRecentSales(json.data || []);
      }
    } catch (e) {
      addToast('Erro ao carregar últimas vendas.', 'error');
    } finally {
      setIsLoadingRecent(false);
    }
  };

  const handleOpenRecentSales = () => {
    setIsRecentSalesOpen(true);
    fetchRecentSales();
  };

  const [isSyncingDigifarma, setIsSyncingDigifarma] = useState(false);

  const handleSyncPendingDigifarma = async () => {
    setIsSyncingDigifarma(true);
    try {
      const res = await fetch('/api/erp/pos/digifarma/sync-pending', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.total > 0) {
          addToast(`Digifarma: ${data.sucessos} de ${data.total} venda(s) sincronizada(s) com sucesso!`, 'success', 4000);
        } else {
          addToast('Digifarma: Nenhuma venda pendente para sincronizar.', 'info', 3000);
        }
        fetchRecentSales();
      } else {
        addToast(`Digifarma: ${data.error || 'Falha ao sincronizar'}`, 'warning', 4000);
      }
    } catch (e: any) {
      addToast(`Digifarma: Servidor inacessível (${e.message})`, 'error', 4000);
    } finally {
      setIsSyncingDigifarma(false);
    }
  };

  const handleSyncSingleSale = async (saleId: string) => {
    try {
      addToast(`Enviando venda #${saleId} para o Digifarma...`, 'info', 2000);
      const res = await fetch(`/api/erp/pos/digifarma/sync/${saleId}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`Venda #${saleId} sincronizada no Digifarma! (Nota #${data.venda_nota_id})`, 'success', 4000);
        fetchRecentSales();
      } else {
        addToast(`Falha no Digifarma: ${data.error || 'Erro'}`, 'warning', 4000);
      }
    } catch (e: any) {
      addToast(`Erro de conexão com o Digifarma: ${e.message}`, 'error', 4000);
    }
  };

  const handleConfirmCancelSale = async () => {
    if (!saleToCancel) return;
    const cleanReason = cancelReason.trim();

    // Se a venda tiver cupom fiscal emitido na SEFAZ, exige no mínimo 15 caracteres
    const hasNfce = saleToCancel.fiscal_status === 'EMITIDO' || Boolean(saleToCancel.nfe_number);
    if (hasNfce && cleanReason.length < 15) {
      addToast(`A SEFAZ exige justificativa com no mínimo 15 caracteres para cancelamento (atual: ${cleanReason.length}).`, 'warning', 4000);
      return;
    }

    setIsCancelling(true);
    try {
      const res = await fetch(`/api/erp/pos/cancel/${saleToCancel.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cleanReason || 'Cancelamento solicitado no balcão' })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        const msgFiscal = json.protocolo_cancelamento ? ` (SEFAZ Prot: ${json.protocolo_cancelamento})` : '';
        addToast(`✅ Venda #${saleToCancel.id} cancelada na SEFAZ, estornada no Digifarma e estoque recomposto!${msgFiscal}`, 'success', 5000);
        setSaleToCancel(null);
        setCancelReason('');
        if (completedSale?.sale_id === saleToCancel.id) {
          setCompletedSale(null);
        }
        fetchRecentSales();
      } else {
        addToast(json.error || 'Erro ao cancelar venda.', 'error', 6000);
      }
    } catch (e: any) {
      addToast('Erro de comunicação ao cancelar venda.', 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  // Carregar detalhes de uma venda para inspecionar e permitir exclusão individual de itens
  const handleInspectSale = async (saleId: string) => {
    setIsLoadingInspectedDetail(true);
    try {
      const res = await fetch(`/api/erp/sales/${encodeURIComponent(saleId)}`);
      if (res.ok) {
        const json = await res.json();
        setInspectedSaleDetail(json.data);
      } else {
        addToast('Não foi possível carregar os itens desta venda.', 'error');
      }
    } catch (e) {
      addToast('Erro ao obter itens da venda.', 'error');
    } finally {
      setIsLoadingInspectedDetail(false);
    }
  };

  // Confirmar exclusão / devolução individual de item no PDV (Padrão Digifarma)
  const handleConfirmCancelItemInPdv = async () => {
    if (!itemToCancelInPdv) return;
    setIsCancellingItemInPdv(true);
    try {
      const res = await fetch(`/api/erp/pos/sales/${itemToCancelInPdv.saleId}/items/${itemToCancelInPdv.item.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: itemCancelReasonInPdv || 'Devolução / Desistência no Balcão' })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        addToast(`✅ Item "${itemToCancelInPdv.item.product_name}" excluído e estoque estornado com sucesso!`, 'success', 3500);
        setItemToCancelInPdv(null);
        await handleInspectSale(itemToCancelInPdv.saleId);
        fetchRecentSales();
      } else {
        addToast(json.error || 'Erro ao excluir item da venda.', 'error');
      }
    } catch (e) {
      addToast('Erro de comunicação ao excluir item.', 'error');
    } finally {
      setIsCancellingItemInPdv(false);
    }
  };

  const handleEmitFiscalForSale = async (saleId: number | string) => {
    setIsEmittingFiscal(true);
    try {
      const fiscalRes = await fetch(`/api/erp/fiscal/emit/${encodeURIComponent(saleId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_cpf: customerCpf || null })
      });
      const fiscalData = await fiscalRes.json();
      if (fiscalRes.ok && fiscalData.success) {
        setCompletedSale(null);
        setActiveDanfeModal(fiscalData);
        addToast(`NFC-e #${fiscalData.nfe_number} emitida com sucesso!`, 'success');
      } else {
        addToast(`Falha na emissão fiscal: ${fiscalData.error || 'Erro desconhecido'}`, 'error');
      }
    } catch (err: any) {
      console.error('Erro ao emitir NFC-e:', err);
      addToast('Erro de comunicação com o servidor ao emitir NFC-e.', 'error');
    } finally {
      setIsEmittingFiscal(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4.25rem)] sm:h-[calc(100vh-4.5rem)] bg-slate-950 text-slate-100 font-sans select-none overflow-hidden rounded-xl border border-slate-800 shadow-2xl">
      
      {/* 1. TOPO: Identidade Visual Bela Farma Sul, Status do Caixa, SNGPC & Impressora */}
      <header className="bg-slate-950 border-b border-slate-800 px-3 sm:px-4 py-2 sm:py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm shrink-0">
        {/* Logo Oficial Bela Farma Sul & Status do Caixa */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          <BelaFarmaLogo size="sm" lightMode showSubtext={true} className="shrink-0" />
          
          <div className="h-6 w-[1px] bg-slate-800 hidden sm:block" />

          <div className="flex items-center space-x-2 bg-emerald-950/80 text-emerald-400 px-3 py-1 rounded-lg border border-emerald-800/60 font-semibold shadow-sm">
            <Zap className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span className="tracking-wide">CAIXA 01 - OPERANDO</span>
          </div>

          <div className="flex items-center space-x-2 text-slate-300">
            <span className="text-slate-600">|</span>
            <button
              onClick={handleOpenSellerModal}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-bold transition-all shadow-sm ${
                currentSeller
                  ? 'bg-emerald-950/70 border-emerald-600 text-emerald-300 hover:bg-emerald-900/80 ring-1 ring-emerald-500/30'
                  : 'bg-amber-950/80 border-amber-500 text-amber-300 hover:bg-amber-900 ring-1 ring-amber-500/40 animate-pulse'
              }`}
              title="Clique para identificar ou trocar o vendedor (F4)"
            >
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>{currentSeller ? `Vendedor: ${currentSeller.name}` : 'Identificar Vendedor'}</span>
              <span className="text-[10px] bg-slate-900 px-1 py-0.5 rounded text-slate-300 font-mono">F4</span>
            </button>
          </div>
        </div>

        {/* Status Conectado (SNGPC / Anvisa), Spooler de Rede & Relógio ao Vivo */}
        <div className="flex items-center flex-wrap gap-2">
          <div className="hidden md:flex items-center space-x-1.5 text-slate-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>SNGPC Conectado (Anvisa)</span>
          </div>

          <div className="hidden xl:flex items-center space-x-1.5 text-slate-300 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 text-xs" title="Assistência e Responsabilidade Técnica ativa conforme exigência do CRF-MG">
            <ShieldCheck className="w-4 h-4 text-teal-400" />
            <span>RT: CRF-MG Ativo</span>
          </div>

          {/* Botão Auto-Print Bematech */}
          <button
            onClick={() => toggleAutoPrint(!autoPrintCupom)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-sm border ${
              autoPrintCupom
                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800'
                : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
            }`}
            title="Alternar Impressão Automática na Bematech MP-4200 TH ao finalizar venda"
          >
            <Printer className={`w-3.5 h-3.5 ${autoPrintCupom ? 'text-emerald-400' : 'text-slate-500'}`} />
            <span>MP-4200: {autoPrintCupom ? 'Auto ON' : 'Manual'}</span>
          </button>

          {/* Status da Impressora Térmica em Rede */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => togglePrinterStation(!isPrinterStation)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-sm border ${
                isPrinterStation
                  ? 'bg-blue-950/60 text-blue-300 border-blue-800'
                  : 'bg-amber-950/60 text-amber-300 border-amber-800'
              }`}
              title={
                isPrinterStation
                  ? 'Este computador é a Estação Física da Bematech (recebe e imprime cupons de toda a rede automaticamente). Clique para alterar.'
                  : 'Este computador imprime na Bematech do Caixa via Rede. Clique para torná-lo a estação física.'
              }
            >
              <span className={`w-2 h-2 rounded-full ${isPrinterStation ? 'bg-blue-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>{isPrinterStation ? 'Estação Caixa' : 'Imprimir via Rede'}</span>
            </button>

            {!isPrinterStation && (
              <button
                onClick={testNetworkPrint}
                className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-all shadow-sm border border-slate-800"
                title="Disparar cupom de teste para a Bematech conectada no Caixa"
              >
                Testar
              </button>
            )}
          </div>

          {/* Relógio Digital */}
          <div className="text-right font-mono text-xs font-medium text-slate-300 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
            {currentTime.toLocaleDateString('pt-BR')} <span className="text-emerald-400 font-bold ml-1">{currentTime.toLocaleTimeString('pt-BR')}</span>
          </div>
        </div>
      </header>

      {/* 2. BARRA DE ATALHOS RÁPIDOS [F1 a F10 - Padrão Balcão Farmácia] */}
      <nav className="bg-slate-900 border-b border-slate-800 px-3 sm:px-4 py-1.5 flex items-center justify-between text-xs overflow-x-auto gap-2 shrink-0">
        <div className="flex items-center space-x-2 shrink-0">
          <button 
            onClick={() => {
              setIsSearchOpen(true);
              setTimeout(() => searchInputRef.current?.focus(), 100);
            }} 
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg transition border border-slate-700"
            title="Consulta Inteligente de Produtos, Genéricos e Similares (F2)"
          >
            <span className="bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded text-[10px]">F2</span>
            <span>Buscar Produto</span>
          </button>

          <button 
            onClick={() => setIsCustomerModalOpen(true)} 
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg transition border ${
              selectedCustomer 
                ? 'bg-blue-950/80 text-blue-200 border-blue-600'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title="Identificar Cliente, Convênio e Limite de Crediário (F3)"
          >
            <span className="bg-blue-500/20 text-blue-300 font-bold px-1.5 py-0.5 rounded text-[10px]">F3</span>
            <span>{selectedCustomer ? selectedCustomer.name.split(' ')[0] : 'Cliente / Crediário'}</span>
          </button>

          <button 
            onClick={() => {
              fetchRecentMovements();
              setIsCashMovementModalOpen(true);
            }} 
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg transition border border-slate-700"
            title="Lançar Sangria (retirada) ou Suprimento (troco) no Caixa (F4)"
          >
            <span className="bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.5 rounded text-[10px]">F4</span>
            <span>Sangria / Suprimento</span>
          </button>

          <button 
            onClick={handleOpenSellerModal} 
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg transition border ${
              currentSeller
                ? 'bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border-emerald-700/60'
                : 'bg-amber-950/70 hover:bg-amber-900 text-amber-300 border-amber-600 animate-pulse'
            }`}
            title="Identificar ou trocar vendedor por chave de acesso (F5)"
          >
            <span className="bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded text-[10px]">F5</span>
            <span>{currentSeller ? currentSeller.name.split(' ')[0] : 'Vendedor'}</span>
          </button>

          <button 
            onClick={() => setIsDiscountModalOpen(true)} 
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg transition border border-slate-700"
            title="Aplicar Desconto Geral no Cupom (F7)"
          >
            <span className="bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded text-[10px]">F7</span>
            <span>Desconto</span>
          </button>
          
          <button 
            onClick={handleStartCheckout} 
            disabled={cart.length === 0}
            className="flex items-center space-x-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-emerald-100 px-2.5 py-1 rounded-lg transition border border-emerald-500/50 font-medium shadow-sm"
            title="Fechar Venda e Receber Pagamento (F8)"
          >
            <span className="bg-emerald-950 text-emerald-300 font-bold px-1.5 py-0.5 rounded text-[10px]">F8</span>
            <span>Finalizar Venda</span>
          </button>

          <button 
            onClick={() => {
              fetchPreSales();
              setIsPreSaleModalOpen(true);
            }} 
            className="flex items-center space-x-1.5 bg-indigo-950/70 hover:bg-indigo-900 text-indigo-200 px-2.5 py-1 rounded-lg transition border border-indigo-700/60"
            title="Puxar Pré-Vendas e Orçamentos do Balcão / WhatsApp (F9)"
          >
            <span className="bg-indigo-900 text-indigo-300 font-bold px-1.5 py-0.5 rounded text-[10px]">F9</span>
            <span>Pré-Venda / Balcão</span>
          </button>
          
          <button 
            onClick={handleOpenRecentSales} 
            className="flex items-center space-x-1.5 bg-rose-950/60 hover:bg-rose-900 text-rose-300 px-2.5 py-1 rounded-lg transition border border-rose-800/50"
            title="Ver últimas vendas e cancelar com estorno de estoque (F10)"
          >
            <span className="bg-rose-900 text-rose-200 font-bold px-1.5 py-0.5 rounded text-[10px]">F10</span>
            <span>Cancelar / Histórico</span>
          </button>

          <button 
            onClick={() => {
              if (cart.length > 0) setIsClearCartModalOpen(true);
            }} 
            disabled={cart.length === 0}
            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 px-2.5 py-1 rounded-lg transition border border-slate-700"
            title="Cancelar cupom e esvaziar carrinho (ESC)"
          >
            <span className="bg-slate-900 text-slate-400 font-bold px-1.5 py-0.5 rounded text-[10px]">ESC</span>
            <span>Limpar</span>
          </button>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {onNavigate && (
            <button
              onClick={() => onNavigate('erp-vendas')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/60 text-xs font-bold transition-all shadow-sm"
              title="Abrir Histórico Completo de Vendas"
            >
              <Receipt className="w-3.5 h-3.5 text-emerald-400" />
              <span>Vendas do Dia</span>
            </button>
          )}

          <button
            onClick={() => setIsPromotionsModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold transition-all shadow-sm cursor-pointer"
            title="Central de Promoções com Validade e Preços Escalonados"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Promoções & Validade</span>
          </button>

          <button
            onClick={() => setIsFiscalSettingsOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all shadow-sm border border-slate-700"
            title="Configurações Fiscais e Certificado Digital A1"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Config. Fiscal</span>
          </button>
        </div>
      </nav>

      {/* 3. BANNER TEMÁTICO DE RETENÇÃO DE RECEITA CONTROLADA (AMARELA / AZUL / BRANCA / CREME) */}
      {dominantRecipe && (
        <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-2 font-black transition-all shrink-0 ${dominantRecipe.banner}`}>
          <div className="flex items-center gap-2.5">
            <span className="text-xl animate-pulse">⚠️</span>
            <div>
              <p className="text-[10px] uppercase tracking-wider opacity-90">Controle Sanitário & Retenção de Receita (Portaria 344 / Anvisa)</p>
              <h2 className="text-xs font-black tracking-tight">{dominantRecipe.label}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {controlledRecipesData ? (
              <span className="bg-emerald-900/40 text-current px-3 py-1 rounded-xl text-xs font-black uppercase flex items-center gap-1.5 border border-current/20">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                Receita Vinculada ({controlledRecipesData.length} {controlledRecipesData.length === 1 ? 'item' : 'itens'})
              </span>
            ) : (
              <span className="bg-black/20 text-current px-3 py-1 rounded-xl text-xs font-black uppercase">
                Médico e Comprador exigidos ao finalizar
              </span>
            )}
            <button
              onClick={() => setIsControlledRecipeOpen(true)}
              className="px-3 py-1 rounded-xl bg-white/20 hover:bg-white/30 text-current text-xs font-black transition-all border border-current/30 shadow-sm"
            >
              {controlledRecipesData ? 'Editar Receita' : 'Preencher Receita Agora'}
            </button>
          </div>
        </div>
      )}

      {/* 4. WORKSPACE CENTRAL: 2 COLUNAS DE ALTA DENSIDADE */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 p-3 overflow-hidden bg-slate-950 min-h-0">
        
        {/* COLUNA ESQUERDA: BIPAGEM E TABELA DO CARRINHO (Cols 7 ou 8 de 12) */}
        <section className="lg:col-span-7 xl:col-span-8 flex flex-col bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-lg min-h-0">
          
          {/* BARRA DE BIPAGEM / PESQUISA RÁPIDA COM AUTOCOMPLETE */}
          <div className="p-3 bg-slate-900 border-b border-slate-800 relative shrink-0">
            <form onSubmit={handleBarcodeSubmit} className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Barcode className="h-5 w-5 text-emerald-400" />
              </div>
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Escaneie o código de barras (EAN) ou digite... (Ex: 3*789... para multiplicar)"
                className="w-full pl-11 pr-28 py-2.5 sm:py-3 bg-slate-950 text-emerald-300 font-mono text-sm sm:text-base rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-slate-500 shadow-inner font-bold"
                autoFocus
              />
              <div className="absolute right-1.5 top-1.5 bottom-1.5 flex items-center gap-1.5">
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-black uppercase tracking-wider transition-all"
                >
                  Enter
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    setIsSearchOpen(true);
                    setTimeout(() => searchInputRef.current?.focus(), 100);
                  }}
                  className="hidden sm:flex px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-md border border-slate-700 items-center space-x-1"
                >
                  <span>Catálogo</span>
                  <kbd className="text-[9px] bg-slate-900 px-1 py-0.5 rounded text-amber-400 border border-slate-700">F1</kbd>
                </button>
              </div>
            </form>

            {/* Menu Suspenso de Autocomplete ao Vivo */}
            {autocompleteResults.length > 0 && (
              <div className="absolute left-3 right-3 top-16 z-30 bg-slate-900 border border-slate-700 rounded-b-xl shadow-2xl max-h-72 overflow-y-auto divide-y divide-slate-800 animate-in fade-in zoom-in-95 duration-100">
                {autocompleteResults.map((prod) => (
                  <div
                    key={prod.code}
                    onClick={() => {
                      addItemToCart(prod, 1);
                      setBarcodeInput('');
                      setAutocompleteResults([]);
                      focusBarcodeInput();
                    }}
                    className="p-2.5 hover:bg-emerald-950/50 cursor-pointer flex items-center justify-between transition-colors group"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-100 text-xs sm:text-sm group-hover:text-emerald-300">{prod.name}</span>
                        {prod.curve === 'A' && (
                          <span className="bg-emerald-950 text-emerald-300 text-[9px] font-bold px-1.5 py-0.5 rounded border border-emerald-700/60 shrink-0">★ TOP VENDA</span>
                        )}
                        {prod.generic && (
                          <span className="bg-amber-950 text-amber-300 text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-800 shrink-0">GENÉRICO</span>
                        )}
                        {(prod.is_controlado || prod.recipe_type) && (
                          <span className="bg-rose-950 text-rose-300 text-[9px] font-bold px-1.5 py-0.5 rounded border border-rose-800 shrink-0">RECEITA</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        Cód: {prod.code} | EAN: {prod.barcode || 'S/N'} | Est: <span className={prod.stock_qty > 0 ? 'text-emerald-400 font-bold' : 'text-rose-400'}>{prod.stock_qty} un</span>
                        {prod.vendas_30d ? <span className="text-amber-400/90 ml-1.5">| {prod.vendas_30d} vend./mês</span> : null}
                      </div>
                    </div>
                    <div className="text-right pl-3">
                      <div className="text-emerald-400 font-bold font-mono text-sm sm:text-base">
                        R$ {(prod.promo_price > 0 ? prod.promo_price : prod.sale_price).toFixed(2)}
                      </div>
                      <span className="text-[9px] text-slate-400 uppercase font-semibold">Clique para Incluir</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* TABELA DE ITENS NO CARRINHO */}
          <div className="flex-1 overflow-y-auto p-2 bg-slate-950/40 min-h-0">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 p-8 text-center">
                <ShoppingCart className="w-16 h-16 stroke-1 mb-3 opacity-30 text-slate-500 animate-pulse" />
                <p className="text-base font-semibold text-slate-400">Caixa Livre • Nenhum produto no cupom</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Passe o leitor de código de barras ou pressione <strong className="text-emerald-400">F1</strong> para pesquisar no catálogo.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-sm text-slate-400 border-b border-slate-700 font-mono uppercase tracking-wider z-10">
                  <tr>
                    <th className="py-2 px-2.5 text-center w-10">#</th>
                    <th className="py-2 px-2.5 w-28">Código / EAN</th>
                    <th className="py-2 px-2.5">Descrição do Produto</th>
                    <th className="py-2 px-2.5 text-center w-28">Qtd</th>
                    <th className="py-2 px-2.5 text-right w-24">Unit. (R$)</th>
                    <th className="py-2 px-2.5 text-right w-20">Desc.</th>
                    <th className="py-2 px-2.5 text-right w-24">Total (R$)</th>
                    <th className="py-2 px-2 text-center w-10">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono">
                  {cart.map((item, index) => {
                    return (
                      <tr 
                        key={`${item.code}-${index}`} 
                        className={`hover:bg-slate-850/70 transition-colors group ${
                          item.recipe_type === 'AMARELA' ? 'bg-amber-950/20 border-l-2 border-amber-500' :
                          item.recipe_type === 'AZUL' ? 'bg-blue-950/20 border-l-2 border-blue-500' :
                          item.recipe_type === 'CREME' ? 'bg-amber-950/15 border-l-2 border-amber-400' :
                          item.recipe_type === 'BRANCA' ? 'bg-slate-900/40 border-l-2 border-slate-500' :
                          item.is_unregistered ? 'bg-amber-950/15 border-l-2 border-amber-500/80' : ''
                        }`}
                      >
                        <td className="py-2 px-2.5 text-center text-slate-500">{String(index + 1).padStart(2, '0')}</td>
                        <td className="py-2 px-2.5 text-slate-400 font-mono text-[11px]">{item.barcode || item.code}</td>
                        <td className="py-2 px-2.5 font-sans">
                          <div className="font-semibold text-slate-100 flex items-center gap-1.5 flex-wrap">
                            <span>{item.name}</span>
                            {item.generic && (
                              <span className="text-[9px] bg-amber-950 text-amber-300 font-bold px-1 rounded border border-amber-800">GEN</span>
                            )}
                            {String(item.code).startsWith('EXP') && (
                              <span className="text-[9px] bg-emerald-950/80 text-emerald-300 font-bold px-1.5 py-0.5 rounded border border-emerald-700/80 flex items-center gap-1" title="Cadastrado Expressamente no Caixa (SEM GTIN) - Fila de Saneamento Fiscal gerada">
                                <Zap className="w-2.5 h-2.5 text-amber-400" />
                                <span>Expresso • SEM GTIN</span>
                              </span>
                            )}
                            {item.is_unregistered && !String(item.code).startsWith('EXP') && (
                              <span className="text-[9px] bg-slate-800 text-amber-300 font-bold px-1.5 py-0.5 rounded border border-slate-700 flex items-center gap-1" title="Item avulso (gerada tarefa para cadastro com NCM)">
                                <span>🏷️</span>
                                <span>Item Avulso / Rápido</span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-2 mt-0.5 flex-wrap">
                            {(() => {
                              const tiered = getTieredDiscount(item);
                              if (!tiered) return null;
                              return (
                                <span className="text-[9px] text-amber-300 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-700/60 font-bold flex items-center gap-1" title={`Promoção Escalonada: ${tiered.label} (Economia de R$ ${tiered.savings.toFixed(2)})`}>
                                  <Zap className="w-2.5 h-2.5 text-amber-400" />
                                  <span>{tiered.label} (-R$ {tiered.savings.toFixed(2)})</span>
                                </span>
                              );
                            })()}
                            {item.recipe_type && (() => {
                              const recipeData = controlledRecipesData?.find(r => r.product_code === item.code);
                              const hasLot = Boolean(recipeData?.batch_lot);
                              return (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveControlledItem({
                                        code: item.code,
                                        barcode: item.barcode,
                                        name: item.name,
                                        quantity: item.quantity,
                                        unit_price: item.unit_price,
                                        recipe_type: (item.recipe_type || 'BRANCA') as any,
                                        recipe_label: item.recipe_label || 'Receita de Controle Especial'
                                      });
                                      setIsControlledRecipeOpen(true);
                                    }}
                                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1 ${
                                      item.recipe_type === 'AMARELA' ? 'bg-amber-400 text-amber-950 font-black' :
                                      item.recipe_type === 'AZUL' ? 'bg-blue-600 text-white font-black' :
                                      item.recipe_type === 'CREME' ? 'bg-amber-200 text-amber-950 font-black' : 'bg-slate-700 text-white font-bold'
                                    }`}
                                    title="Clique para abrir ou editar o formulário da receita retida"
                                  >
                                    <span>📋</span>
                                    <span>{item.recipe_label || 'Receita Retida (SNGPC)'}</span>
                                  </button>

                                  {hasLot ? (
                                    <span 
                                      onClick={() => {
                                        setActiveControlledItem({
                                          code: item.code,
                                          barcode: item.barcode,
                                          name: item.name,
                                          quantity: item.quantity,
                                          unit_price: item.unit_price,
                                          recipe_type: (item.recipe_type || 'BRANCA') as any,
                                          recipe_label: item.recipe_label || 'Receita de Controle Especial'
                                        });
                                        setIsControlledRecipeOpen(true);
                                      }}
                                      className="text-[9px] font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700 px-1.5 py-0.5 rounded flex items-center gap-1 cursor-pointer hover:bg-emerald-900"
                                      title="Lote registrado no formulário. Clique para alterar."
                                    >
                                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                      <span>Lote: {recipeData?.batch_lot}</span>
                                      {recipeData?.expiry_date && <span className="text-slate-400 font-normal">({recipeData.expiry_date})</span>}
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveControlledItem({
                                          code: item.code,
                                          barcode: item.barcode,
                                          name: item.name,
                                          quantity: item.quantity,
                                          unit_price: item.unit_price,
                                          recipe_type: (item.recipe_type || 'BRANCA') as any,
                                          recipe_label: item.recipe_label || 'Receita de Controle Especial'
                                        });
                                        setIsControlledRecipeOpen(true);
                                      }}
                                      className="text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/60 hover:bg-amber-500/30 px-1.5 py-0.5 rounded flex items-center gap-1 animate-pulse"
                                      title="Obrigatório informar o lote do medicamento"
                                    >
                                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                                      <span>Lote Obrigatório</span>
                                    </button>
                                  )}
                                </div>
                              );
                            })()}
                            {item.discount > 0 && (
                              <span className="text-[9px] text-emerald-400 bg-emerald-950/80 px-1 rounded border border-emerald-800">
                                Desconto Fidelidade
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2.5 text-center">
                          <div className="inline-flex items-center bg-slate-950 border border-slate-700 rounded-md overflow-hidden">
                            <button 
                              onClick={() => handleUpdateQuantity(index, -1)}
                              className="px-1.5 py-0.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="px-2 font-bold text-slate-100 text-xs">{item.quantity}</span>
                            <button 
                              onClick={() => handleUpdateQuantity(index, 1)}
                              className="px-1.5 py-0.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="py-2 px-2.5 text-right text-slate-300">{item.unit_price.toFixed(2)}</td>
                        <td className="py-2 px-2.5 text-right text-amber-400">
                          {(() => {
                            const tiered = getTieredDiscount(item);
                            const totalItemDiscount = (item.discount * item.quantity) + (tiered ? tiered.savings : 0);
                            return totalItemDiscount > 0 ? `-${totalItemDiscount.toFixed(2)}` : '0.00';
                          })()}
                        </td>
                        <td className="py-2 px-2.5 text-right font-bold text-emerald-400 text-xs sm:text-sm">
                          {(() => {
                            const tiered = getTieredDiscount(item);
                            const finalItemTotal = tiered ? tiered.promoTotal : item.total_price;
                            return finalItemTotal.toFixed(2);
                          })()}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button 
                            onClick={() => handleRemoveItem(index)}
                            className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors"
                            title="Remover Item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* RODAPÉ DO CARRINHO */}
          <div className="bg-slate-900 p-2.5 sm:p-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
            <div className="flex items-center space-x-4">
              <span>Total de Itens: <strong className="text-slate-200">{totalQuantity} un</strong></span>
              <span>Volume de Produtos: <strong className="text-slate-200">{cart.length} tipos</strong></span>
            </div>
            {cart.length > 0 && (
              <button 
                onClick={() => setIsClearCartModalOpen(true)}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-rose-300 rounded border border-slate-700 transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Limpar Cupom (F9)</span>
              </button>
            )}
          </div>
        </section>

        {/* COLUNA DIREITA: CLIENTE, RESUMO FINANCEIRO, FORMA DE PAGAMENTO E FINALIZAÇÃO (Cols 4 ou 5 de 12) */}
        <section className="lg:col-span-5 xl:col-span-4 flex flex-col space-y-3 min-h-0 overflow-y-auto pr-0.5">
          
          {/* CARD DE CLIENTE / PROGRAMA DE FIDELIDADE (F3) */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-3 shadow-md shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <span>Cliente / Programa Fidelidade</span>
              </div>
              <span className="text-[10px] bg-slate-800 text-amber-300 font-bold px-1.5 py-0.5 rounded border border-slate-700">F3</span>
            </div>

            {isCustomerIdentified ? (
              <div className="bg-slate-950 p-2.5 rounded-lg border border-emerald-900/50 flex items-start justify-between">
                <div>
                  <div className="font-bold text-xs sm:text-sm text-emerald-300">
                    {selectedCustomer ? selectedCustomer.name : (customerNameInput || 'Consumidor Identificado')}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    CPF/CNPJ: {customerCpf || (selectedCustomer?.cpf || 'Não informado')}
                  </div>
                  <div className="flex items-center space-x-2 mt-1.5 text-[10px]">
                    <span className="bg-emerald-950 text-emerald-300 px-1.5 py-0.5 rounded font-medium border border-emerald-800/80">
                      Pontos: {customerPoints} pts
                    </span>
                    <span className="text-slate-400">{convenioNome}</span>
                  </div>

                  {customerCreditInfo && (
                    <div className="mt-2 pt-1.5 border-t border-slate-800 flex items-center justify-between gap-2 text-[10px]">
                      <div>
                        <span className="text-slate-500">Débito: </span>
                        <span className="text-amber-400 font-mono font-bold">R$ {Number(customerCreditInfo.open_debt).toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Limite Disp: </span>
                        <span className={`font-mono font-bold ${customerCreditInfo.available_limit > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          R$ {Number(customerCreditInfo.available_limit).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <button 
                  onClick={handleResetCustomer}
                  className="text-[11px] text-slate-500 hover:text-slate-300 underline font-semibold cursor-pointer"
                >
                  Trocar
                </button>
              </div>
            ) : (
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="Informe o CPF ou Nome do cliente..."
                  value={customerCpf}
                  onChange={(e) => setCustomerCpf(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleIdentifyCustomer(customerCpf);
                    }
                  }}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500 placeholder-slate-500"
                />
                <button 
                  onClick={() => handleIdentifyCustomer(customerCpf)}
                  className="bg-emerald-700 hover:bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition-all shadow-sm"
                >
                  OK
                </button>
              </div>
            )}
          </div>

          {/* BOX DO RESUMO FINANCEIRO */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-3 sm:p-4 shadow-md flex flex-col justify-between space-y-3">
            <div>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                <span>Resumo Financeiro da Compra</span>
                <DollarSign className="w-4 h-4 text-emerald-400" />
              </h2>
              
              <div className="space-y-1.5 text-xs sm:text-sm">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal Bruto</span>
                  <span className="font-mono text-slate-200 font-semibold">R$ {subtotal.toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-slate-400 items-center">
                  <span className="flex items-center space-x-1">
                    <Tag className="w-3.5 h-3.5 text-amber-400" />
                    <span>Descontos (Fidelidade / Geral)</span>
                  </span>
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="text-amber-400 font-semibold">- R$ {totalDiscount.toFixed(2)}</span>
                    <button
                      onClick={() => setIsDiscountModalOpen(true)}
                      className="text-[10px] bg-slate-800 hover:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-700 text-amber-300"
                      title="Editar desconto geral (F2)"
                    >
                      F2
                    </button>
                  </div>
                </div>

                {tieredSavingsTotal > 0 && (
                  <div className="flex justify-between text-emerald-400 items-center font-bold bg-emerald-950/40 px-2 py-1 rounded border border-emerald-800/40">
                    <span className="flex items-center space-x-1 text-[11px]">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>Preço Escalonado (Qtd)</span>
                    </span>
                    <span className="font-mono text-xs font-black">- R$ {tieredSavingsTotal.toFixed(2)}</span>
                  </div>
                )}

                {discountPercent > 0 && (
                  <div className="flex justify-between text-[11px] text-amber-300/80 pl-4 font-mono">
                    <span>(Inclui {discountPercent}% desc. geral)</span>
                  </div>
                )}
              </div>

              {/* CARD GIGANTE DO TOTAL A PAGAR */}
              <div className="bg-slate-950 p-3 sm:p-4 rounded-xl border border-emerald-900/60 shadow-inner mt-3">
                <div className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider font-semibold">TOTAL A PAGAR</div>
                <div className="text-2xl sm:text-3xl xl:text-4xl font-extrabold text-emerald-400 font-mono mt-1 tracking-tight">
                  R$ {totalFinal.toFixed(2)}
                </div>
              </div>
            </div>

            {/* SELEÇÃO DIRETA DA FORMA DE PAGAMENTO */}
            <div className="space-y-2 pt-1 border-t border-slate-800">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Forma de Pagamento
              </label>
              
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {[
                  { id: 'DINHEIRO', label: 'Dinheiro', icon: Banknote },
                  { id: 'PIX', label: 'PIX QR Code', icon: QrCode },
                  { id: 'CARTAO_DEBITO', label: 'Cartão Débito', icon: CreditCard },
                  { id: 'CARTAO_CREDITO', label: 'Cartão Crédito', icon: CreditCard },
                  { id: 'CREDIARIO', label: 'Crediário', icon: BookOpen }
                ].map((method) => {
                  const Icon = method.icon;
                  const isActive = selectedMethod === method.id;
                  return (
                    <button
                      key={method.id}
                      onClick={() => setSelectedMethod(method.id as any)}
                      className={`flex items-center space-x-2 p-2 rounded-lg border font-bold transition-all ${
                        isActive
                          ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 shadow-md ring-1 ring-emerald-500/50'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                      <span className="truncate">{method.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* CAMPOS ESPECÍFICOS POR FORMA DE PAGAMENTO */}
              {selectedMethod === 'DINHEIRO' && (
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="text-[11px] text-slate-400">Valor Recebido (R$):</span>
                    <button
                      type="button"
                      onClick={() => setCashReceived(totalFinal.toFixed(2))}
                      className="text-[10px] font-bold text-emerald-400 hover:underline cursor-pointer"
                    >
                      Preencher Exato
                    </button>
                  </div>
                  <div className="flex space-x-1.5">
                    <span className="flex items-center px-2 bg-slate-900 text-slate-400 font-mono border border-slate-700 rounded-l-md text-xs">R$</span>
                    <input
                      type="text"
                      placeholder={`Ex: ${totalFinal.toFixed(2)}`}
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleStartCheckout();
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-r-md px-2.5 py-1 font-mono text-emerald-300 font-bold text-sm focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  {cashChange > 0 && (
                    <div className="flex justify-between items-center pt-1.5 text-xs border-t border-slate-800">
                      <span className="text-slate-400">Troco a devolver:</span>
                      <span className="font-mono font-bold text-sm text-emerald-400">
                        R$ {cashChange.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {selectedMethod === 'PIX' && (
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-center space-y-1.5">
                  <div className="inline-block p-1.5 bg-white rounded-md">
                    <div className="w-20 h-20 bg-slate-900 flex items-center justify-center text-white text-[9px] font-mono text-center p-1">
                      [ QR CODE PIX CHAVE BELAFARMA ]
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">Aguardando confirmação do pagamento no sistema bancário...</p>
                </div>
              )}

              {['CARTAO_DEBITO', 'CARTAO_CREDITO'].includes(selectedMethod) && (
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Bandeira:</label>
                      <select
                        value={cardBrand}
                        onChange={(e) => setCardBrand(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 font-bold focus:outline-none focus:border-emerald-500"
                      >
                        <option value="MASTERCARD">Mastercard</option>
                        <option value="VISA">Visa</option>
                        <option value="ELO">Elo</option>
                        <option value="HIPERCARD">Hipercard</option>
                      </select>
                    </div>

                    {selectedMethod === 'CARTAO_CREDITO' && (
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-0.5">Parcelas:</label>
                        <select
                          value={installments}
                          onChange={(e) => setInstallments(parseInt(e.target.value, 10))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 font-bold focus:outline-none focus:border-emerald-500"
                        >
                          <option value="1">1x à vista (R$ {totalFinal.toFixed(2)})</option>
                          <option value="2">2x (R$ {(totalFinal / 2).toFixed(2)})</option>
                          <option value="3">3x (R$ {(totalFinal / 3).toFixed(2)})</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedMethod === 'CREDIARIO' && (
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
                  <label className="block text-[10px] font-bold text-slate-400">Cliente do Crediário:</label>
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Filtrar clientes cadastrados..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-200 font-medium mb-1"
                  />
                  <div className="max-h-24 overflow-y-auto border border-slate-800 rounded-md bg-slate-900 divide-y divide-slate-800">
                    {customersList
                      .filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()))
                      .slice(0, 6)
                      .map(c => (
                        <div
                          key={c.id}
                          onClick={() => {
                            setSelectedCustomer(c);
                            setCustomerNameInput(c.name);
                            if (c.cpf) setCustomerCpf(c.cpf);
                          }}
                          className={`p-1.5 text-xs cursor-pointer font-bold flex justify-between ${
                            selectedCustomer?.id === c.id ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 text-slate-300'
                          }`}
                        >
                          <span>{c.name}</span>
                          <span className="opacity-75">{c.phone}</span>
                        </div>
                      ))}
                  </div>
                  {selectedCustomer && (
                    <p className="text-[11px] font-bold text-emerald-400 mt-1">
                      Vinculado: {selectedCustomer.name}
                    </p>
                  )}
                </div>
              )}

              {/* SEÇÃO FISCAL: EMISSÃO NFC-e & DADOS DO CLIENTE NA NOTA */}
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Cupom Fiscal (NFC-e)
                  </span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={emitNfce}
                      onChange={(e) => toggleEmitNfce(e.target.checked)}
                      className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-700 bg-slate-900 focus:ring-emerald-500"
                    />
                    <span className="text-[11px] font-semibold text-slate-400">
                      Emitir NFC-e
                    </span>
                  </label>
                </div>

                {emitNfce && (
                  <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-800">
                    <div>
                      <input
                        type="text"
                        value={customerCpf}
                        onChange={(e) => setCustomerCpf(e.target.value)}
                        placeholder="CPF/CNPJ na Nota"
                        className="w-full px-2 py-1 text-[11px] font-mono rounded bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={customerNameInput}
                        onChange={(e) => setCustomerNameInput(e.target.value)}
                        placeholder="Nome (Opcional)"
                        className="w-full px-2 py-1 text-[11px] font-medium rounded bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* BOTÃO FINALIZAR GIGANTE */}
              <button
                onClick={handleStartCheckout}
                disabled={cart.length === 0 || isProcessing}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-black text-base rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2 border border-emerald-400/30 active:scale-[0.99] tracking-wide"
              >
                {isProcessing ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
                <span>FINALIZAR VENDA (F4 / F10)</span>
              </button>
            </div>
          </div>
        </section>

      </main>

      {/* 5. RODAPÉ DE STATUS DO SISTEMA */}
      <footer className="bg-slate-950 border-t border-slate-800 px-4 py-1.5 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
        <div>
          <span>BelaFarma PDV Express v4.2.0</span> | <span>Empresa: Bela Farma Sul Ltda (CNPJ: 47.378.578/0001-40)</span>
        </div>
        <div className="flex items-center space-x-4">
          <span className="flex items-center gap-1 text-slate-400">
            <Lock className="w-3 h-3 text-emerald-400" /> 
            {isPrinterStation ? 'Estação Bematech Conectada' : 'Spooler Bematech OK'}
          </span>
          <span className="hidden sm:inline">Juiz de Fora - MG</span>
        </div>
      </footer>

      {/* ========================================================================= */}
      {/* MODAL 1: CATÁLOGO DE PRODUTOS / BUSCA AVANÇADA [F1] */}
      {/* ========================================================================= */}
      {isSearchOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-850">
              <div className="flex items-center space-x-2 text-slate-200 font-black text-base">
                <Search className="w-5 h-5 text-emerald-400" />
                <span>Catálogo de Produtos • Consulta Rápida (F1)</span>
              </div>
              <button 
                onClick={() => {
                  setIsSearchOpen(false);
                  focusBarcodeInput();
                }}
                className="text-slate-400 hover:text-white text-xs bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700"
              >
                ESC Fechar
              </button>
            </div>

            {/* Input de Busca */}
            <div className="p-4 border-b border-slate-800 bg-slate-900">
              <div className="flex gap-2">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchByName()}
                  placeholder="Digite o nome, princípio ativo, laboratório ou EAN..."
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:outline-none focus:border-emerald-500 font-bold text-sm text-slate-100"
                />
                <button
                  onClick={handleSearchByName}
                  disabled={isSearchingProducts}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2"
                >
                  {isSearchingProducts ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Buscar
                </button>
              </div>
            </div>

            {/* Tabela de Produtos */}
            <div className="p-4 flex-1 overflow-y-auto space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-800 text-slate-400 border-b border-slate-700 font-mono">
                      <th className="py-2.5 px-3">Código / EAN</th>
                      <th className="py-2.5 px-3">Nome / Descrição</th>
                      <th className="py-2.5 px-3 text-center">Estoque</th>
                      <th className="py-2.5 px-3 text-right">Preço</th>
                      <th className="py-2.5 px-3 text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {searchResults.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500 font-sans">
                          {searchQuery ? 'Nenhum produto encontrado com este termo.' : 'Digite o termo de busca acima e clique em Buscar.'}
                        </td>
                      </tr>
                    ) : (
                      searchResults.map((prod) => (
                        <tr key={prod.code} className="hover:bg-slate-800/50 transition-colors">
                          <td className="py-2.5 px-3 text-slate-400">{prod.barcode || prod.code}</td>
                          <td className="py-2.5 px-3 font-sans">
                            <div className="font-semibold text-slate-200">{prod.name}</div>
                            <div className="flex items-center gap-1 mt-0.5">
                              {prod.curve === 'A' && (
                                <span className="text-[9px] bg-emerald-950 text-emerald-300 font-bold px-1 rounded border border-emerald-700/60">★ Top Vendas</span>
                              )}
                              {prod.generic && (
                                <span className="text-[9px] bg-amber-950 text-amber-300 font-bold px-1 rounded border border-amber-800">Genérico</span>
                              )}
                              {(prod.is_controlado || prod.recipe_type) && (
                                <span className="text-[9px] bg-rose-950 text-rose-300 font-bold px-1 rounded border border-rose-800">Controlado</span>
                              )}
                              {prod.vendas_30d ? (
                                <span className="text-[10px] text-slate-400 font-mono ml-1">{prod.vendas_30d} vend./mês</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold">
                            <span className={prod.stock_qty > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {prod.stock_qty} un
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                            R$ {(prod.promo_price > 0 ? prod.promo_price : prod.sale_price).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              onClick={() => {
                                addItemToCart(prod, 1);
                                setIsSearchOpen(false);
                                focusBarcodeInput();
                              }}
                              className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-sans font-bold transition-colors"
                            >
                              + Incluir
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
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: DESCONTO GERAL [F2] */}
      {/* ========================================================================= */}
      {isDiscountModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Percent className="w-5 h-5 text-amber-400" />
                <h3 className="font-black text-sm text-slate-100">Aplicar Desconto Geral (F2)</h3>
              </div>
              <button 
                onClick={() => {
                  setIsDiscountModalOpen(false);
                  focusBarcodeInput();
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDiscountInputType('PERCENT')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                  discountInputType === 'PERCENT'
                    ? 'bg-amber-950/80 border-amber-500 text-amber-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
              >
                Porcentagem (%)
              </button>
              <button
                type="button"
                onClick={() => setDiscountInputType('VALUE')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                  discountInputType === 'VALUE'
                    ? 'bg-amber-950/80 border-amber-500 text-amber-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
              >
                Valor Fixo (R$)
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">
                {discountInputType === 'PERCENT' ? 'Porcentagem de Desconto (%):' : 'Valor do Desconto (R$):'}
              </label>
              <input
                type="number"
                min="0"
                step={discountInputType === 'PERCENT' ? '1' : '0.50'}
                value={discountInputVal}
                onChange={(e) => setDiscountInputVal(e.target.value)}
                placeholder={discountInputType === 'PERCENT' ? 'Ex: 5' : 'Ex: 10.00'}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = parseFloat(discountInputVal) || 0;
                    if (discountInputType === 'PERCENT') {
                      setDiscountPercent(val);
                      setDiscount(0);
                    } else {
                      setDiscount(val);
                      setDiscountPercent(0);
                    }
                    setIsDiscountModalOpen(false);
                    focusBarcodeInput();
                  }
                }}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl font-mono text-base font-bold text-amber-300 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDiscountPercent(0);
                  setDiscount(0);
                  setDiscountInputVal('');
                  setIsDiscountModalOpen(false);
                  focusBarcodeInput();
                }}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl"
              >
                Zerar Desconto
              </button>
              <button
                type="button"
                onClick={() => {
                  const val = parseFloat(discountInputVal) || 0;
                  if (discountInputType === 'PERCENT') {
                    setDiscountPercent(val);
                    setDiscount(0);
                  } else {
                    setDiscount(val);
                    setDiscountPercent(0);
                  }
                  setIsDiscountModalOpen(false);
                  focusBarcodeInput();
                }}
                className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-black rounded-xl shadow-md"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: IDENTIFICAÇÃO DE CLIENTE / CPF FIDELIDADE [F3] */}
      {/* ========================================================================= */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="font-black text-sm text-slate-100">Cliente / CPF Fidelidade (F3)</h3>
              </div>
              <button 
                onClick={() => {
                  setIsCustomerModalOpen(false);
                  focusBarcodeInput();
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">CPF ou CNPJ do Cliente:</label>
                <input
                  type="text"
                  value={customerCpf}
                  onChange={(e) => setCustomerCpf(e.target.value)}
                  placeholder="Ex: 123.456.789-00"
                  autoFocus
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl font-mono text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Nome / Razão Social (Opcional):</label>
                <input
                  type="text"
                  value={customerNameInput}
                  onChange={(e) => setCustomerNameInput(e.target.value)}
                  placeholder="Nome do cliente"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Lista Rápida de Clientes Cadastrados */}
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Ou selecione cliente cadastrado:</label>
                <div className="max-h-32 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950 divide-y divide-slate-850 p-1">
                  {customersList.slice(0, 8).map(c => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setSelectedCustomer(c);
                        setCustomerNameInput(c.name);
                        if (c.cpf) setCustomerCpf(c.cpf);
                      }}
                      className="p-1.5 text-xs rounded hover:bg-slate-850 cursor-pointer flex justify-between font-medium text-slate-300"
                    >
                      <span>{c.name}</span>
                      <span className="text-slate-500 font-mono">{c.cpf || c.phone}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleResetCustomer}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl"
              >
                Limpar Cliente
              </button>
              <button
                type="button"
                onClick={() => handleIdentifyCustomer(customerCpf, customerNameInput)}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow-md"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: CONFIRMAÇÃO PARA LIMPAR CUPOM [F9] */}
      {/* ========================================================================= */}
      {isClearCartModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 text-rose-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="font-black text-sm text-slate-100">Cancelar e Limpar Cupom?</h3>
            </div>
            <p className="text-xs text-slate-300">
              Todos os {totalQuantity} itens adicionados serão removidos da tela. Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setIsClearCartModalOpen(false);
                  focusBarcodeInput();
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl"
              >
                Voltar
              </button>
              <button
                onClick={handleClearCart}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-xl shadow-md"
              >
                Sim, Limpar Cupom
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: CUPOM DE VENDA FINALIZADA & IMPRESSÃO TÉRMICA */}
      {/* ========================================================================= */}
      {completedSale && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <style>{`
            @media print {
              @page {
                size: 80mm auto;
                margin: 0mm;
              }
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                color: #000000 !important;
                width: 100% !important;
              }
              body * {
                visibility: hidden !important;
              }
              #thermal-pdv-receipt, #thermal-pdv-receipt * {
                visibility: visible !important;
              }
              #thermal-pdv-receipt {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 72mm !important;
                max-width: 72mm !important;
                margin: 0 auto !important;
                padding: 2mm !important;
                font-family: 'Courier New', Courier, monospace !important;
                font-size: 11px !important;
                line-height: 1.25 !important;
                color: #000000 !important;
                background: #ffffff !important;
                box-shadow: none !important;
                border: none !important;
              }
              .no-print {
                display: none !important;
              }
            }
          `}</style>

          <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200 relative">
            {/* Botão de Fechar Rápido Superior */}
            <button
              onClick={() => {
                setCompletedSale(null);
                focusBarcodeInput();
              }}
              className="absolute right-4 top-4 text-slate-400 hover:text-white p-1 rounded-lg no-print transition-colors"
              title="Voltar para a tela anterior (ESC)"
            >
              <X className="w-5 h-5" />
            </button>

            <div id="thermal-pdv-receipt" className="bg-white text-slate-900 p-4 rounded-xl font-mono text-[11px] leading-tight shadow-inner">
              <div className="text-center border-b border-dashed border-slate-300 pb-3 mb-3">
                <div className="font-bold text-xs uppercase">DROGARIA BELA FARMA SUL</div>
                <div className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">Comprovante de Venda</div>
                <h3 className="font-black text-sm text-slate-900 mt-1">CUPOM #{completedSale.sale_id}</h3>
                <p className="text-[10px] text-slate-500">{completedSale.date} às {completedSale.time}</p>
                {completedSale.customer_name && (
                  <p className="text-[10px] font-bold text-slate-800 mt-0.5">Cliente: {completedSale.customer_name}</p>
                )}
              </div>

              {/* Itens do Cupom */}
              <div className="border-b border-dashed border-slate-300 pb-2 mb-2 max-h-48 overflow-y-auto space-y-1">
                {completedSale.items.map((it: any, i: number) => (
                  <div key={i} className="flex justify-between">
                    <span className="truncate pr-2">{it.quantity}x {it.name}</span>
                    <span className="font-bold">R$ {it.total_price.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Totais do Cupom */}
              <div className="space-y-1 font-mono text-[11px]">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span>R$ {completedSale.total_items_value.toFixed(2)}</span>
                </div>
                {completedSale.discount_value > 0 && (
                  <div className="flex justify-between text-amber-700 font-bold">
                    <span>Descontos:</span>
                    <span>- R$ {completedSale.discount_value.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-sm text-slate-900 pt-1 border-t border-slate-300">
                  <span>TOTAL PAGO:</span>
                  <span className="text-emerald-700">R$ {completedSale.total_final.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600 pt-0.5">
                  <span>Forma de Pagto:</span>
                  <span className="font-bold">{completedSale.payment.method}</span>
                </div>
                {completedSale.change > 0 && (
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Troco Devolvido:</span>
                    <span>R$ {completedSale.change.toFixed(2)}</span>
                  </div>
                )}

                {/* Status da Transmissão Fiscal (SEFAZ) & Digifarma */}
                <div className="pt-2 mt-2 border-t border-dashed border-slate-300 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-slate-700 flex items-center gap-1">
                      <QrCode className="w-3 h-3 text-blue-600" />
                      Emissão NFC-e (SEFAZ):
                    </span>
                    {(() => {
                      const st = completedSaleFiscalStatus?.fiscal_status || (emitNfce ? 'EM_PROCESSAMENTO' : 'NAO_EMITIDO');
                      if (st === 'EMITIDO' || completedSaleFiscalStatus?.nfe_number) {
                        return (
                          <span className="px-2 py-0.5 rounded font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            NFC-e #{completedSaleFiscalStatus?.nfe_number || ''} AUTORIZADA
                          </span>
                        );
                      }
                      if (st === 'CONTINGENCIA') {
                        return (
                          <span className="px-2 py-0.5 rounded font-black bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-600" />
                            CONTINGÊNCIA OFFLINE
                          </span>
                        );
                      }
                      if (st === 'ERRO') {
                        return (
                          <span className="px-2 py-0.5 rounded font-black bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1" title={completedSaleFiscalStatus?.contingency_reason}>
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            PENDENTE SEFAZ
                          </span>
                        );
                      }
                      if (st === 'EM_PROCESSAMENTO') {
                        return (
                          <span className="px-2 py-0.5 rounded font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 text-blue-600 animate-spin" />
                            Transmitindo...
                          </span>
                        );
                      }
                      return (
                        <span className="px-1.5 py-0.5 rounded text-slate-500 bg-slate-100 border border-slate-200 font-medium">
                          Cupom Interno
                        </span>
                      );
                    })()}
                  </div>

                  {/* Resguardo no Digifarma */}
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-slate-700 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-teal-600" />
                      Espelho Digifarma:
                    </span>
                    {(() => {
                      const syncSt = completedSaleFiscalStatus?.digifarma_sync_status;
                      const digiId = completedSaleFiscalStatus?.digifarma_venda_id;
                      if (syncSt === 'SINCRONIZADO') {
                        return (
                          <span className="px-2 py-0.5 rounded font-bold bg-teal-50 text-teal-800 border border-teal-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-teal-600" />
                            Sincronizado {digiId ? `(#${digiId})` : '/ Caixa Ativo'}
                          </span>
                        );
                      }
                      if (syncSt === 'ERRO') {
                        return (
                          <span className="px-2 py-0.5 rounded font-bold bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-1" title={completedSaleFiscalStatus?.digifarma_sync_error}>
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            Falha Sincronização
                          </span>
                        );
                      }
                      return (
                        <span className="px-2 py-0.5 rounded font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-600" />
                          Aguardando Rede / Fila
                        </span>
                      );
                    })()}
                  </div>
                </div>

                <div className="text-[8px] text-slate-400 text-center pt-2 border-t border-dashed border-slate-200 mt-1">
                  Documento auxiliar de conferência de compra
                </div>
              </div>
            </div>

            {/* Ações da Modal de Cupom */}
            <div className="flex flex-col gap-2.5 mt-4 no-print">
              {/* Botão Principal: Retorno Imediato para Adicionar Itens */}
              <button
                onClick={() => {
                  setCompletedSale(null);
                  focusBarcodeInput();
                }}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/60 transition-all border border-emerald-400/30 active:scale-[0.99] cursor-pointer"
                title="Voltar instantaneamente para a tela de bipagem e adicionar itens"
              >
                <ArrowRight className="w-5 h-5 rotate-180" />
                <span>Voltar ao Caixa / Adicionar Itens [ENTER ou ESC]</span>
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => imprimirCupomVenda(completedSale)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors border border-slate-700 cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-emerald-400" />
                  <span>Imprimir (80mm)</span>
                </button>

                {completedSaleFiscalStatus?.nfe_number || completedSaleFiscalStatus?.fiscal_status === 'EMITIDO' ? (
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/erp/fiscal/danfe/${encodeURIComponent(completedSale.sale_id)}`);
                        if (res.ok) {
                          const json = await res.json();
                          if (json.success && json.danfe) {
                            setCompletedSale(null);
                            setActiveDanfeModal(json.danfe);
                            return;
                          }
                        }
                        handleEmitFiscalForSale(completedSale.sale_id);
                      } catch (e) {
                        handleEmitFiscalForSale(completedSale.sale_id);
                      }
                    }}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md transition-colors border border-emerald-500/40 cursor-pointer"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Ver DANFE NFC-e</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleEmitFiscalForSale(completedSale.sale_id)}
                    disabled={isEmittingFiscal}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md transition-colors border border-blue-500/40 cursor-pointer"
                  >
                    {isEmittingFiscal ? <RefreshCw className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                    <span>{completedSaleFiscalStatus?.fiscal_status === 'ERRO' ? 'Retentar NFC-e' : 'Emitir NFC-e'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: HISTÓRICO RÁPIDO & CANCELAMENTO DE VENDAS [F7] */}
      {/* ========================================================================= */}
      {isRecentSalesOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl max-w-2xl w-full p-5 max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center font-bold">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-100">
                    Últimas Vendas • Cancelar & Consultar (F7)
                  </h3>
                  <p className="text-xs text-slate-400">Selecione uma venda para cancelar e estornar o estoque na hora</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSyncPendingDigifarma}
                  disabled={isSyncingDigifarma}
                  className="px-2.5 py-1.5 rounded-xl bg-sky-950/80 hover:bg-sky-900 border border-sky-800/80 text-sky-300 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                  title="Reprocessar e enviar vendas pendentes para o Digifarma"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDigifarma ? 'animate-spin' : ''}`} />
                  Sincronizar Digifarma
                </button>
                <button
                  onClick={() => {
                    setIsRecentSalesOpen(false);
                    setSaleToCancel(null);
                    setInspectedSaleDetail(null);
                    setItemToCancelInPdv(null);
                    focusBarcodeInput();
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Listagem de Vendas ou Detalhes da Venda Selecionada */}
            {inspectedSaleDetail ? (
              <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-150">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setInspectedSaleDetail(null)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1 transition"
                    >
                      ← Voltar à lista
                    </button>
                    <span className="font-bold text-slate-200">
                      Itens do Cupom #{inspectedSaleDetail.id}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      inspectedSaleDetail.status === 'CANCELADA' ? 'bg-rose-900/60 text-rose-300' : 'bg-emerald-950/60 text-emerald-300'
                    }`}>
                      {inspectedSaleDetail.status}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 text-[11px]">Total: </span>
                    <span className="font-mono font-bold text-emerald-400">
                      R$ {Number(inspectedSaleDetail.total_value).toFixed(2)}
                    </span>
                    {Number(inspectedSaleDetail.returned_value || 0) > 0 && (
                      <span className="text-[10px] text-rose-400 ml-2 font-mono">
                        (Estornado: R$ {Number(inspectedSaleDetail.returned_value).toFixed(2)})
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {isLoadingInspectedDetail ? (
                    <div className="text-center py-8 text-slate-500 text-xs">Carregando itens do cupom...</div>
                  ) : inspectedSaleDetail.items?.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-xs">Nenhum item encontrado nesta venda.</div>
                  ) : (
                    inspectedSaleDetail.items?.map((it: any, idx: number) => {
                      const isItemCancelled = it.is_cancelled === 1;
                      return (
                        <div
                          key={idx}
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                            isItemCancelled
                              ? 'bg-rose-950/20 border-rose-900/40 opacity-70'
                              : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-bold ${isItemCancelled ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                                {it.product_name}
                              </span>
                              {isItemCancelled && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-rose-900/60 text-rose-300 border border-rose-700">
                                  Excluído / Devolvido
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-slate-400 font-mono mt-0.5">
                              <span>EAN: {it.barcode || 'S/N'}</span>
                              <span>{it.quantity} un × R$ {Number(it.unit_price).toFixed(2)}</span>
                              {it.cancellation_reason && (
                                <span className="text-rose-400 italic">Motivo: {it.cancellation_reason}</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className={`font-mono font-bold ${isItemCancelled ? 'line-through text-slate-500' : 'text-emerald-400'}`}>
                              R$ {Number(it.total_price).toFixed(2)}
                            </span>

                            {!isItemCancelled && inspectedSaleDetail.status !== 'CANCELADA' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setItemToCancelInPdv({ saleId: inspectedSaleDetail.id, item: it });
                                  setItemCancelReasonInPdv('Devolução / Desistência no Balcão');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/80 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition shadow-sm"
                                title="Excluir este item individualmente e devolver estoque (Padrão Digifarma)"
                              >
                                <Trash2 className="w-3 h-3" />
                                Excluir Item
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Submodal de Confirmação de Exclusão Individual de Item no PDV */}
                {itemToCancelInPdv && (
                  <div className="mt-3 p-3.5 bg-rose-950/50 border border-rose-800 rounded-2xl animate-in fade-in duration-150 space-y-2">
                    <div className="flex items-center justify-between border-b border-rose-900/60 pb-1.5">
                      <span className="text-xs font-black uppercase tracking-wider text-rose-300 flex items-center gap-1.5">
                        <Trash2 className="w-4 h-4 text-rose-400" />
                        Excluir Item: {itemToCancelInPdv.item.product_name}
                      </span>
                      <span className="font-mono text-xs font-bold text-rose-300">
                        R$ {Number(itemToCancelInPdv.item.total_price).toFixed(2)}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-300">
                      Escolha o motivo da exclusão/devolução:
                    </div>
                    <select
                      value={itemCancelReasonInPdv}
                      onChange={(e) => setItemCancelReasonInPdv(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-rose-800 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
                    >
                      <option value="Devolução / Desistência no Balcão">Devolução / Desistência no Balcão</option>
                      <option value="Produto Danificado / Avariado">Produto Danificado / Avariado</option>
                      <option value="Erro no Lançamento da Quantidade">Erro no Lançamento da Quantidade</option>
                      <option value="Troca por outro medicamento">Troca por outro medicamento</option>
                      <option value="Outro">Outro Motivo</option>
                    </select>

                    <div className="flex justify-end gap-2 pt-2 border-t border-rose-900/60">
                      <button
                        onClick={() => setItemToCancelInPdv(null)}
                        className="px-3 py-1 rounded-lg text-xs font-bold text-slate-400 hover:bg-slate-800"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleConfirmCancelItemInPdv}
                        disabled={isCancellingItemInPdv}
                        className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-black text-xs flex items-center gap-1.5 shadow-md transition cursor-pointer"
                      >
                        {isCancellingItemInPdv ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        <span>Confirmar Exclusão e Estornar</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {isLoadingRecent ? (
                  <div className="text-center py-10 text-slate-500 text-xs">Carregando histórico do dia...</div>
                ) : recentSales.length === 0 ? (
                  <div className="text-center py-10 text-slate-500 text-xs">Nenhuma venda realizada hoje até o momento.</div>
                ) : (
                  recentSales.map((s) => (
                    <div
                      key={s.id}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-3 ${
                        s.status === 'CANCELADA'
                          ? 'bg-rose-950/20 border-rose-900/40 opacity-75'
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-slate-200">
                            #{s.id}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            s.status === 'CANCELADA'
                              ? 'bg-rose-900/60 text-rose-300'
                              : 'bg-emerald-950/60 text-emerald-300'
                          }`}>
                            {s.status}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {s.sale_time}
                          </span>
                          {s.digifarma_sync_status === 'SINCRONIZADO' ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-950/70 text-sky-400 border border-sky-800/70 flex items-center gap-1">
                              Digifarma #{s.digifarma_venda_id || 'OK'}
                            </span>
                          ) : (
                            <button
                              title={s.digifarma_sync_error ? `Erro Digifarma: ${s.digifarma_sync_error}` : 'Pendente de envio ao Digifarma (Clique para tentar sincronizar agora)'}
                              onClick={() => handleSyncSingleSale(s.id)}
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950/70 text-amber-300 border border-amber-800/70 hover:bg-amber-900 flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              Digifarma: Pendente <RefreshCw className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {s.total_items} item(s) • Pagto: <strong className="text-slate-300">{s.payment_methods}</strong>
                          {s.customer_name ? ` • Cliente: ${s.customer_name}` : ''}
                        </div>
                        {s.cancellation_reason && (
                          <div className="text-[10px] text-rose-400 mt-0.5 italic">
                            Motivo: {s.cancellation_reason}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-base font-black font-mono text-emerald-400 mr-1">
                          R$ {Number(s.total_value).toFixed(2)}
                        </span>
                        
                        <button
                          onClick={() => handleInspectSale(s.id)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1 border border-slate-700 shadow-sm transition-colors cursor-pointer"
                          title="Ver itens e excluir item individual (Padrão Digifarma)"
                        >
                          <Receipt className="w-3.5 h-3.5 text-sky-400" />
                          Itens
                        </button>

                        {s.status !== 'CANCELADA' && (
                          <button
                            onClick={() => setSaleToCancel(s)}
                            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
                            title="Cancelar toda a venda e estornar estoque completo"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Cancelar Venda
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Submodal de Confirmação de Cancelamento com Regras Fiscais SEFAZ & Digifarma */}
            {saleToCancel && (() => {
              const hasNfce = saleToCancel.fiscal_status === 'EMITIDO' || Boolean(saleToCancel.nfe_number);
              const dataRef = saleToCancel.issued_at ? new Date(saleToCancel.issued_at) : new Date(saleToCancel.created_at);
              const minutosDecorridos = Math.max(0, Math.floor((Date.now() - dataRef.getTime()) / (60 * 1000)));
              const prazoExpirado = minutosDecorridos > 30;
              const minutosRestantes = Math.max(0, 30 - minutosDecorridos);
              const motivoValido = !hasNfce || cancelReason.trim().length >= 15;

              return (
                <div className="mt-3 p-4 bg-rose-950/40 border border-rose-900 rounded-2xl animate-in fade-in duration-150 space-y-3">
                  <div className="flex items-center justify-between border-b border-rose-900/60 pb-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-rose-300 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                      Cancelar Venda #{saleToCancel.id} • R$ {Number(saleToCancel.total_value).toFixed(2)}
                    </h4>
                    {hasNfce && (
                      <span className="font-mono text-[10px] bg-rose-900/60 text-rose-200 px-2 py-0.5 rounded border border-rose-700">
                        NFC-e #{saleToCancel.nfe_number}
                      </span>
                    )}
                  </div>

                  {/* Diagnóstico do Prazo Legal da SEFAZ */}
                  {hasNfce && (
                    <div className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                      prazoExpirado 
                        ? 'bg-amber-950/60 border-amber-800 text-amber-200' 
                        : 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
                    }`}>
                      <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        {prazoExpirado ? (
                          <>
                            <div className="font-bold text-amber-300">⚠️ Prazo Legal da SEFAZ (30 min) Expirado</div>
                            <div className="text-[11px] text-amber-200/90 mt-0.5">
                              Emitido há <strong>{minutosDecorridos} minutos</strong>. Na SEFAZ MG o cancelamento direto por evento é bloqueado após 30 min. O estorno pode ser lançado internamente ou por NF-e de devolução.
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="font-bold text-emerald-300">✅ Dentro do Prazo Legal SEFAZ (30 minutos)</div>
                            <div className="text-[11px] text-emerald-200/90 mt-0.5">
                              Restam <strong>{minutosRestantes} minutos</strong> para envio do Evento 110111 de Cancelamento síncrono à SEFAZ.
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold text-slate-300">
                        Motivo do Cancelamento {hasNfce && <span className="text-rose-400">* (mínimo 15 caracteres)</span>}:
                      </label>
                      {hasNfce && (
                        <span className={`text-[10px] font-mono font-bold ${
                          cancelReason.trim().length >= 15 ? 'text-emerald-400' : 'text-amber-400'
                        }`}>
                          {cancelReason.trim().length} / 15 caracteres
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="Ex: Desistência da compra pelo consumidor no balcão"
                      autoFocus
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-rose-800 text-xs font-medium text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                    />

                    {/* Atalhos de Motivos Válidos para Agilizar o Balcão */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {[
                        'Desistência da compra pelo cliente no balcão',
                        'Erro no lançamento da quantidade de itens',
                        'Forma de pagamento informada incorretamente',
                        'Produto com embalagem danificada na entrega'
                      ].map(mot => (
                        <button
                          key={mot}
                          type="button"
                          onClick={() => setCancelReason(mot)}
                          className="text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded border border-rose-900/60"
                        >
                          {mot}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-rose-900/60">
                    <button
                      onClick={() => {
                        setSaleToCancel(null);
                        setCancelReason('');
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-800"
                    >
                      Voltar
                    </button>
                    <button
                      onClick={handleConfirmCancelSale}
                      disabled={isCancelling || (hasNfce && !motivoValido)}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-black text-xs flex items-center gap-1.5 shadow-md transition"
                    >
                      {isCancelling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                      <span>Confirmar Estorno Completo</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 7: DANFE NFC-e COM QR CODE SEFAZ */}
      {/* ========================================================================= */}
      {activeDanfeModal && (
        <DanfeNfceModal
          danfe={activeDanfeModal}
          onClose={() => {
            setActiveDanfeModal(null);
            focusBarcodeInput();
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 8: CONFIGURAÇÕES FISCAIS & CERTIFICADO A1 */}
      {/* ========================================================================= */}
      {isFiscalSettingsOpen && (
        <FiscalSettingsModal
          isOpen={isFiscalSettingsOpen}
          onClose={() => {
            setIsFiscalSettingsOpen(false);
            focusBarcodeInput();
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 9: RECEITAS RETIDAS & CONTROLE ESPECIAL (SNGPC) */}
      {/* ========================================================================= */}
      <ControlledRecipeModal
        isOpen={isControlledRecipeOpen}
        controlledItems={
          controlledItemsInCart.length > 0
            ? controlledItemsInCart
            : (activeControlledItem ? [activeControlledItem] : [])
        }
        initialBuyer={{
          name: customerNameInput || selectedCustomer?.name,
          cpf: customerCpf || selectedCustomer?.cpf,
          phone: selectedCustomer?.phone
        }}
        existingRecipes={controlledRecipesData}
        onClose={() => {
          setIsControlledRecipeOpen(false);
          setIsFinishingSale(false);
          setActiveControlledItem(null);
          focusBarcodeInput();
        }}
        onConfirm={(recipesData) => {
          setControlledRecipesData(recipesData);
          setIsControlledRecipeOpen(false);
          setActiveControlledItem(null);
          addToast(`Dados da receita retida vinculados com sucesso (${recipesData.length} ${recipesData.length === 1 ? 'item' : 'itens'})!`, 'success');
          if (isFinishingSale) {
            setIsFinishingSale(false);
            handleConfirmCheckout();
          } else {
            focusBarcodeInput();
          }
        }}
      />

      {/* ========================================================================= */}
      {/* MODAL 10: IDENTIFICAÇÃO RÁPIDA DO VENDEDOR (CHAVE DE ACESSO DO LOGIN)     */}
      {/* ========================================================================= */}
      {isSellerModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-emerald-500/70 rounded-3xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="font-black text-sm text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-emerald-400" />
                Identificação do Vendedor
              </h3>
              <button 
                onClick={() => {
                  setIsSellerModalOpen(false);
                  setIsPendingCheckout(false);
                  focusBarcodeInput();
                }} 
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-3 leading-relaxed">
              Digite a <strong className="text-emerald-400">chave de acesso de login</strong> do vendedor ou bipe o crachá:
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleIdentifySeller();
              }}
            >
              <div className="relative mb-4">
                <input
                  ref={sellerKeyInputRef}
                  type="password"
                  autoFocus
                  value={sellerKeyInput}
                  onChange={(e) => setSellerKeyInput(e.target.value)}
                  placeholder="Chave de acesso / PIN"
                  className="w-full pl-4 pr-10 py-3 rounded-2xl bg-slate-950 border-2 border-emerald-500/60 text-emerald-300 font-mono text-center text-lg tracking-widest font-black focus:outline-none focus:border-emerald-400 shadow-inner"
                />
                {isIdentifyingSeller && (
                  <div className="absolute right-3 top-3.5">
                    <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" />
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsSellerModalOpen(false);
                    setIsPendingCheckout(false);
                    focusBarcodeInput();
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
                >
                  Cancelar [ESC]
                </button>
                <button
                  type="submit"
                  disabled={isIdentifyingSeller || !sellerKeyInput.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  {isIdentifyingSeller ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirmar [ENTER]
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 11: CADASTRO EXPRESSO NO CAIXA & SANEAMENTO FISCAL SEFAZ             */}
      {/* ========================================================================= */}
      {isUnregisteredModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-emerald-500/70 rounded-3xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="font-black text-sm text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                Cadastro Expresso no Caixa • Blindagem Fiscal
              </h3>
              <button 
                onClick={() => {
                  setIsUnregisteredModalOpen(false);
                  focusBarcodeInput();
                }} 
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4 bg-emerald-950/40 border border-emerald-600/40 rounded-xl p-3 flex items-start gap-2.5 text-xs text-emerald-200/90 leading-relaxed">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                Item emitido na SEFAZ com regra oficial <strong>SEM GTIN</strong> e NCM provisório. Fila de saneamento gerada automaticamente na retaguarda.
              </span>
            </div>

            <form onSubmit={handleConfirmUnregisteredProduct} className="space-y-3.5">
              {/* Seleção de Categoria Rápida / NCM Provisório */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">
                  Classificação Rápida:
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setUnregisteredCategory('cosmetico')}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all border ${
                      unregisteredCategory === 'cosmetico'
                        ? 'bg-purple-950 border-purple-500 text-purple-200 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Cosméticos
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnregisteredCategory('acessorio')}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all border ${
                      unregisteredCategory === 'acessorio'
                        ? 'bg-blue-950 border-blue-500 text-blue-200 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Acessórios
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnregisteredCategory('medicamento')}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all border ${
                      unregisteredCategory === 'medicamento'
                        ? 'bg-emerald-950 border-emerald-500 text-emerald-200 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Medicamentos
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                  Nome / Descrição do Produto:
                </label>
                <input
                  ref={unregisteredNameInputRef}
                  type="text"
                  value={unregisteredName}
                  onChange={(e) => setUnregisteredName(e.target.value)}
                  placeholder="Ex: Pinça Anatômica Ponta Fina"
                  required
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-sm font-semibold focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Valor de Venda (R$):
                  </label>
                  <input
                    ref={unregisteredPriceInputRef}
                    type="text"
                    inputMode="decimal"
                    value={unregisteredPrice}
                    onChange={(e) => setUnregisteredPrice(e.target.value)}
                    placeholder="0,00"
                    required
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border-2 border-emerald-500/60 text-emerald-300 font-mono text-lg font-black focus:outline-none focus:border-emerald-400 text-right"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Quantidade:
                  </label>
                  <div className="flex items-center bg-slate-950 border border-slate-700 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setUnregisteredQuantity(prev => Math.max(1, prev - 1))}
                      className="px-3 py-2.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={unregisteredQuantity}
                      onChange={(e) => setUnregisteredQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full bg-transparent text-center font-mono font-bold text-slate-200 text-sm focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setUnregisteredQuantity(prev => prev + 1)}
                      className="px-3 py-2.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {unregisteredBarcode && !unregisteredBarcode.startsWith('*') && (
                <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between px-1">
                  <span>Código Lido:</span>
                  <span className="text-slate-300 font-bold">{unregisteredBarcode}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsUnregisteredModalOpen(false);
                    focusBarcodeInput();
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
                >
                  Cancelar [ESC]
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Incluir no Caixa [ENTER]
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 11: MOVIMENTAÇÕES DE CAIXA (SANGRIA & SUPRIMENTO) [F4] */}
      {/* ========================================================================= */}
      {isCashMovementModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Banknote className="w-5 h-5 text-emerald-400" />
                <h3 className="font-black text-sm text-slate-100">Movimentações de Caixa • Sangria & Suprimento [F4]</h3>
              </div>
              <button 
                onClick={() => {
                  setIsCashMovementModalOpen(false);
                  focusBarcodeInput();
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Seletor de Tipo */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMovementType('SANGRIA')}
                className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all ${
                  movementType === 'SANGRIA'
                    ? 'bg-rose-950/80 border-rose-600 text-rose-300 shadow-lg'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Minus className="w-4 h-4 text-rose-400" />
                <span>Sangria (Retirada)</span>
              </button>

              <button
                type="button"
                onClick={() => setMovementType('SUPRIMENTO')}
                className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all ${
                  movementType === 'SUPRIMENTO'
                    ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300 shadow-lg'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Plus className="w-4 h-4 text-emerald-400" />
                <span>Suprimento (Reforço)</span>
              </button>
            </div>

            {/* Formulário de Lançamento */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Valor da Operação (R$):</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-500 font-mono text-sm font-bold">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    autoFocus
                    placeholder="0.00"
                    value={movementAmount}
                    onChange={(e) => setMovementAmount(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleConfirmCashMovement();
                      }
                    }}
                    className="w-full pl-10 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-lg font-mono font-black text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Motivo / Justificativa:</label>
                <input
                  type="text"
                  placeholder={movementType === 'SANGRIA' ? 'Ex: Recolhimento para cofre / pagamento despesa' : 'Ex: Troco inicial em moedas'}
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Sugestões Rápidas de Motivo */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(movementType === 'SANGRIA'
                  ? ['Recolhimento Cofre', 'Pagamento Despesa', 'Sangria Periódica', 'Adiantamento']
                  : ['Troco Inicial', 'Aporte de Moedas', 'Suprimento Troco', 'Reforço de Caixa']
                ).map((motivo) => (
                  <button
                    key={motivo}
                    type="button"
                    onClick={() => setMovementReason(motivo)}
                    className="text-[10px] bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 px-2 py-1 rounded-lg border border-slate-800"
                  >
                    {motivo}
                  </button>
                ))}
              </div>
            </div>

            {/* Ações */}
            <div className="flex gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsCashMovementModalOpen(false);
                  focusBarcodeInput();
                }}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition"
              >
                Cancelar [ESC]
              </button>
              <button
                type="button"
                disabled={isSavingMovement || !movementAmount}
                onClick={handleConfirmCashMovement}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black rounded-xl shadow-md flex items-center justify-center gap-1.5 transition"
              >
                {isSavingMovement ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Printer className="w-4 h-4" />
                )}
                <span>Confirmar & Imprimir</span>
              </button>
            </div>

            {/* Histórico das Últimas Movimentações do Dia */}
            {recentMovements.length > 0 && (
              <div className="pt-2 border-t border-slate-800/80">
                <span className="text-[11px] font-bold text-slate-400 block mb-1.5">Lançamentos Recentes de Hoje:</span>
                <div className="max-h-28 overflow-y-auto space-y-1 bg-slate-950 p-2 rounded-xl border border-slate-800">
                  {recentMovements.slice(0, 6).map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between text-[11px] font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-1 py-0.2 rounded font-bold text-[9px] ${
                          m.movement_type === 'SANGRIA' ? 'bg-rose-950 text-rose-300' : 'bg-emerald-950 text-emerald-300'
                        }`}>
                          {m.movement_type}
                        </span>
                        <span className="text-slate-300 font-sans truncate max-w-[170px]">{m.reason || 'Sem motivo'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-200 font-bold">R$ {Number(m.amount).toFixed(2)}</span>
                        <span className="text-[10px] text-slate-500">{m.created_at ? new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 12: PRÉ-VENDAS E ORÇAMENTOS (BALCÃO / WHATSAPP) [F9] */}
      {/* ========================================================================= */}
      {isPreSaleModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                <h3 className="font-black text-sm text-slate-100">Pré-Vendas & Orçamentos do Balcão [F9]</h3>
              </div>
              <button 
                onClick={() => {
                  setIsPreSaleModalOpen(false);
                  focusBarcodeInput();
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Ação para Salvar o Carrinho Atual como Orçamento */}
            {cart.length > 0 && (
              <div className="bg-indigo-950/40 border border-indigo-800/60 p-3 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-indigo-200">Deseja transformar o carrinho atual em pré-venda?</div>
                  <div className="text-[11px] text-indigo-300/80">Salva os {cart.length} itens atuais como orçamento para faturar depois.</div>
                </div>
                <button
                  onClick={handleSaveAsPreSale}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-sm"
                >
                  Salvar Orçamento
                </button>
              </div>
            )}

            {/* Lista de Pré-Vendas Abertas */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">Pré-Vendas Aguardando Faturamento ({preSalesList.length}):</span>
                <button
                  onClick={fetchPreSales}
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold"
                >
                  <RefreshCw className="w-3 h-3" />
                  Atualizar
                </button>
              </div>

              {isLoadingPreSales ? (
                <div className="py-8 text-center text-slate-500 flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                  <span className="text-xs font-medium">Buscando pré-vendas...</span>
                </div>
              ) : preSalesList.length === 0 ? (
                <div className="py-8 text-center bg-slate-950 rounded-xl border border-slate-800 text-slate-500 text-xs">
                  Nenhuma pré-venda ou orçamento pendente no momento.
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {preSalesList.map((ps: any) => (
                    <div
                      key={ps.id}
                      className="bg-slate-950 hover:bg-slate-850 p-3 rounded-xl border border-slate-800 hover:border-indigo-600/70 transition flex items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-indigo-300">#{ps.id}</span>
                          <span className="text-xs font-black text-slate-200">
                            {ps.customer_name || 'Consumidor Balcão'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2">
                          <span>Vendedor: {ps.seller_name || 'Balcão'}</span>
                          <span>•</span>
                          <span>{ps.items?.length || 0} produto(s)</span>
                          <span>•</span>
                          <span>{new Date(ps.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono font-black text-sm text-emerald-400">
                          R$ {Number(ps.total_value).toFixed(2)}
                        </span>
                        <button
                          onClick={() => handleImportPreSale(ps)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          <span>Puxar</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsPreSaleModalOpen(false);
                  focusBarcodeInput();
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl"
              >
                Fechar [ESC]
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CENTRAL DE PROMOÇÕES & PREÇOS ESCALONADOS COM VALIDADE */}
      {/* ========================================================================= */}
      {isPromotionsModalOpen && (
        <PromotionsManagementModal
          isOpen={isPromotionsModalOpen}
          onClose={() => {
            setIsPromotionsModalOpen(false);
            focusBarcodeInput();
          }}
          onPromotionUpdated={() => {
            fetchTieredRules();
          }}
        />
      )}
    </div>
  );
};
