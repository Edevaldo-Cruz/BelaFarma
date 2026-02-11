import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Trash2, Pencil, Save, X, AlertCircle, 
  CheckCircle2, ShoppingBag, DollarSign, UserPlus, Search, AlertTriangle, Package, ArrowRightLeft, Percent
} from 'lucide-react';
import { useToast } from './ToastContext';
import { User, DailyRecordEntry, Customer, ConsignadoSupplier, ConsignadoProduct } from '../types';

interface DailyRecordsProps {
  user: User;
  onLog: (action: string, details: string) => void;
  dailyRecords: DailyRecordEntry[];
  onSave: () => void;
}

type TabType = 'expenses' | 'pix' | 'crediario' | 'non-registered' | 'consignado' | 'ifood';

interface ExpenseItem {
  id: string;
  desc: string;
  val: number;
}

interface PixItem {
  id: string;
  desc: string;
  val: number;
}

interface CrediarioItem {
  id: string;
  client: string;
  val: number;
  customerId?: string;
}

interface NonRegisteredItem {
  id: string;
  desc: string;
  val: number;
}

export const DailyRecords: React.FC<DailyRecordsProps> = ({ user, onLog, dailyRecords, onSave }) => {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('expenses');
  const [todayRecord, setTodayRecord] = useState<DailyRecordEntry | null>(null);
  
  // Form states for each category
  const [expenseForm, setExpenseForm] = useState({ desc: '', val: '', type: 'standard' as 'standard', supplierId: '' });
  const [consignadoSuppliers, setConsignadoSuppliers] = useState<ConsignadoSupplier[]>([]);
  
  // Fetch consignado suppliers
  // Fetch consignado suppliers and iFood fee
  useEffect(() => {
    // Fetch system settings for iFood fee
    fetch('/api/settings/ifood_fee_percent')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.value) {
          setIfoodForm(prev => ({ ...prev, feePercent: data.value }));
        }
      })
      .catch(console.error);

    // Fetch suppliers
    fetch('/api/consignado/suppliers')
      .then(r => r.json())
      .then(setConsignadoSuppliers)
      .catch(console.error);
  }, []);

  const [pixForm, setPixForm] = useState({ desc: '', val: '' });
  const [crediarioForm, setCrediarioForm] = useState({ customerId: '', client: '', val: '' });
  const [nonRegForm, setNonRegForm] = useState({ desc: '', val: '' });
  
  // iFood form state
  const [ifoodForm, setIfoodForm] = useState({ val: '', feePercent: '6.5', desc: '' });
  const [ifoodSaving, setIfoodSaving] = useState(false);
  
  // Customer selection states
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerBalance, setCustomerBalance] = useState<{ totalDebt: number; availableCredit: number; creditLimit: number } | null>(null);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerDueDay, setNewCustomerDueDay] = useState('');
  const [creditLimitWarning, setCreditLimitWarning] = useState<string | null>(null);
  
  // Consignado Tab States
  const [consignadoMode, setConsignadoMode] = useState<'sale' | 'payment'>('sale');
  const [consignadoPaymentForm, setConsignadoPaymentForm] = useState({ supplierId: '', val: '', desc: '' });
  const [consignadoProductsList, setConsignadoProductsList] = useState<(ConsignadoProduct & { supplierName?: string })[]>([]);
  // Sale States
  const [saleItems, setSaleItems] = useState<{ product: ConsignadoProduct & { supplierName?: string }; qty: number }[]>([]);
  const [selectedSaleProduct, setSelectedSaleProduct] = useState<string>('');
  const [saleQty, setSaleQty] = useState<string>('1');

  // Load consignado products
  useEffect(() => {
    fetch('/api/consignado/all-products')
      .then(r => r.json())
      .then(setConsignadoProductsList)
      .catch(console.error);
  }, []);

  const addSaleItem = () => {
    if (!selectedSaleProduct) return;
    const product = consignadoProductsList.find(p => p.id === selectedSaleProduct);
    if (!product) return;
    const qty = parseInt(saleQty) || 1;
    if (qty <= 0) return;

    const existing = saleItems.find(i => i.product.id === product.id);
    if (existing) {
        setSaleItems(saleItems.map(i => i.product.id === product.id ? { ...i, qty: i.qty + qty } : i));
    } else {
        setSaleItems([...saleItems, { product, qty }]);
    }
    setSelectedSaleProduct('');
    setSaleQty('1');
  };

  const removeSaleItem = (id: string) => {
    setSaleItems(saleItems.filter(i => i.product.id !== id));
  };
  
  const totalSaleValue = saleItems.reduce((acc, item) => acc + (item.product.salePrice * item.qty), 0);
  
  // Editing states
  const [editingItem, setEditingItem] = useState<{ type: TabType; id: string } | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  
  // Loading and feedback states
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);


  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Load today's record on mount and when dailyRecords changes
  // Only show records that haven't been processed in cash closing (lancado === false)
  useEffect(() => {
    console.log('=== DailyRecords useEffect ===');
    console.log('All dailyRecords:', dailyRecords);
    
    const today = getTodayDate();
    console.log('Today date:', today);
    
    const record = dailyRecords.find(r => {
      const recordDate = new Date(r.date).toISOString().split('T')[0];
      const isToday = recordDate === today;
      const isNotProcessed = !r.lancado;
      
      console.log('Record:', {
        id: r.id,
        date: recordDate,
        lancado: r.lancado,
        lancadoType: typeof r.lancado,
        isToday,
        isNotProcessed,
        willShow: isToday && isNotProcessed
      });
      
      // Only load if it's today AND hasn't been processed (lancado is false or undefined)
      return isToday && isNotProcessed;
    });
    
    console.log('Selected record:', record);
    
    if (record) {
      setTodayRecord(record);
    } else {
      // Create empty record structure for today
      setTodayRecord({
        id: `temp-${Date.now()}`,
        date: new Date().toISOString(),
        userName: user.name,
        expenses: [],
        pixDiretoList: [],
        crediarioList: [],
        nonRegistered: [],
        lancado: false, // Initialize as not processed
      });
    }
  }, [dailyRecords, user.name]);

  // Fetch customers for crediário dropdown
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const response = await fetch('/api/customers');
        const data = await response.json();
        setCustomers(data);
      } catch (error) {
        console.error('Error fetching customers:', error);
      }
    };
    fetchCustomers();
  }, []);

  // Filtered customers based on search
  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return customers;
    const term = customerSearch.toLowerCase();
    return customers.filter(c => 
      c.name.toLowerCase().includes(term) ||
      c.nickname?.toLowerCase().includes(term)
    );
  }, [customers, customerSearch]);

  // Fetch customer balance when selected
  const selectCustomer = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setCrediarioForm({ ...crediarioForm, customerId: customer.id, client: customer.name });
    setCustomerSearch(customer.nickname ? `${customer.name} (${customer.nickname})` : customer.name);
    setShowCustomerDropdown(false);
    setCreditLimitWarning(null);

    // Fetch balance for limit validation
    try {
      const response = await fetch(`/api/customers/${customer.id}/balance`);
      const data = await response.json();
      setCustomerBalance({
        totalDebt: data.totalDebt,
        availableCredit: data.availableCredit,
        creditLimit: data.creditLimit || 0,
      });
    } catch (error) {
      console.error('Error fetching customer balance:', error);
    }
  };

  // Validate credit limit when value changes
  const validateCreditLimit = (value: string) => {
    if (!selectedCustomer || !customerBalance) return;
    
    const newValue = parseCurrency(value);
    const creditLimit = customerBalance.creditLimit;
    
    if (creditLimit > 0) {
      const newTotal = customerBalance.totalDebt + newValue;
      if (newTotal > creditLimit) {
        setCreditLimitWarning(`Atenção: Este cliente tem limite de ${formatCurrency(creditLimit)} e já possui ${formatCurrency(customerBalance.totalDebt)} em débitos. O novo total será ${formatCurrency(newTotal)}.`);
      } else {
        setCreditLimitWarning(null);
      }
    }
  };

  // Create new customer inline
  const createNewCustomer = async () => {
    if (!newCustomerName.trim()) return;
    
    const newCustomer = {
      id: Date.now().toString(),
      name: newCustomerName.trim(),
      creditLimit: 150.00, // Default credit limit
      dueDay: newCustomerDueDay ? parseInt(newCustomerDueDay, 10) : undefined,
    };

    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCustomer),
      });
      if (response.ok) {
        const created = await response.json();
        setCustomers([...customers, created]);
        selectCustomer(created);
        setShowNewCustomerForm(false);
        setNewCustomerName('');
        setNewCustomerDueDay('');
        onLog('Cadastrou Cliente', `Cliente: ${newCustomerName} (via crediário)`);
      }
    } catch (error) {
      console.error('Error creating customer:', error);
    }
  };

  // Format currency
  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Parse currency input
  const parseCurrency = (value: string): number => {
    const cleaned = value.replace(/\D/g, '');
    return (parseInt(cleaned, 10) || 0) / 100;
  };

  // Currency Mask Handler
  const handleCurrencyMask = (value: string, setFunction: (val: string) => void) => {
    let numeric = value.replace(/\D/g, ''); // Remove all non-digits
    if (!numeric) {
      setFunction('');
      return;
    }
    const floatValue = parseInt(numeric, 10) / 100;
    const formatted = floatValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    setFunction(formatted);
  };

  // Save record to backend
  const saveRecord = async (updatedRecord: DailyRecordEntry) => {
    setIsSaving(true);
    try {
      const isNew = updatedRecord.id.startsWith('temp-');
      const url = isNew ? '/api/daily-records' : `/api/daily-records/${updatedRecord.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const payload = {
        ...updatedRecord,
        id: isNew ? Date.now().toString() : updatedRecord.id,
      };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to save record');
      }

      await onSave(); // Refresh data from parent
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      
      onLog('Lançamento Diário', `${isNew ? 'Criou' : 'Atualizou'} lançamento diário`);
    } catch (error) {
      console.error('Error saving record:', error);
      addToast('Erro ao salvar lançamento. Tente novamente.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Add item to a category
  const addItem = async (type: TabType) => {
    if (!todayRecord) return;

    let newItem: any;
    let updatedRecord = { ...todayRecord };

    switch (type) {
      case 'expenses':
        // Validation
        const amount = parseCurrency(expenseForm.val);
        if (!amount) {
            addToast('Informe um valor válido!', 'warning');
            return;
        }

        if (!expenseForm.desc) {
            addToast('Informe a descrição!', 'warning');
            return;
        }

        newItem = {
          id: Date.now().toString(),
          desc: expenseForm.desc,
          val: amount,
        };
        updatedRecord.expenses = [...updatedRecord.expenses, newItem];
        setExpenseForm({ desc: '', val: '', type: 'standard', supplierId: '' });
        break;

      case 'pix':
        if (!pixForm.desc || !pixForm.val) return;
        newItem = {
          id: Date.now().toString(),
          desc: pixForm.desc,
          val: parseCurrency(pixForm.val),
        };
        updatedRecord.pixDiretoList = [...updatedRecord.pixDiretoList, newItem];
        setPixForm({ desc: '', val: '' });
        break;

      case 'crediario':
        if (!crediarioForm.client || !crediarioForm.val) return;
        
        const numericVal = parseCurrency(crediarioForm.val);
        const debtId = Date.now().toString();
        
        // If linked to a customer, create the debt in the backend immediately
        if (crediarioForm.customerId) {
          try {
            const debtPayload = {
              id: debtId,
              customerId: crediarioForm.customerId,
              purchaseDate: getTodayDate(),
              description: 'Compra Crediário',
              totalValue: numericVal,
              status: 'Pendente',
              userName: user.name
            };
            
            const response = await fetch('/api/customer-debts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(debtPayload)
            });
            
            if (!response.ok) {
              addToast('Erro ao criar registro de dívida. Verifique sua conexão.', 'error');
              return;
            }
          } catch (error) {
            console.error('Error creating debt:', error);
            addToast('Erro ao criar registro de dívida.', 'error');
            return;
          }
        }

        newItem = {
          id: debtId,
          client: crediarioForm.client,
          val: numericVal,
          customerId: crediarioForm.customerId || undefined
        };
        updatedRecord.crediarioList = [...updatedRecord.crediarioList, newItem];
        
        // Reset form
        setCrediarioForm({ customerId: '', client: '', val: '' });
        setCustomerSearch('');
        setSelectedCustomer(null);
        setCustomerBalance(null);
        setCreditLimitWarning(null);
        break;

      case 'non-registered':
        if (!nonRegForm.desc || !nonRegForm.val) return;
        newItem = {
          id: Date.now().toString(),
          desc: nonRegForm.desc,
          val: parseCurrency(nonRegForm.val),
        };
        updatedRecord.nonRegistered = [...updatedRecord.nonRegistered, newItem];
        setNonRegForm({ desc: '', val: '' });
        break;

      case 'consignado':
        if (consignadoMode === 'sale') {
            // VENDA
            if (saleItems.length === 0) {
                addToast('Adicione produtos à venda!', 'warning');
                return;
            }
            // 1. Update Stock
            try {
                const salePayload = { products: saleItems.map(i => ({ id: i.product.id, qty: i.qty })) };
                const res = await fetch('/api/consignado/sales', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(salePayload)
                });
                if (!res.ok) throw new Error('Erro ao atualizar estoque');
            } catch(e: any) {
                addToast(e.message, 'error');
                return;
            }
            // 2. Add Money Entry
            const itemsDesc = saleItems.map(i => `${i.qty}x ${i.product.name}`).join(', ');
            newItem = {
                id: Date.now().toString(),
                desc: `Venda Consignado: ${itemsDesc}`,
                val: totalSaleValue
            };
            updatedRecord.nonRegistered = [...updatedRecord.nonRegistered, newItem];
            setSaleItems([]);
            fetch('/api/consignado/all-products').then(r => r.json()).then(setConsignadoProductsList); // Refresh stock
        } else {
            // PAGAMENTO
            if (!consignadoPaymentForm.supplierId || !consignadoPaymentForm.val) {
                addToast('Preencha fornecedor e valor!', 'warning');
                return;
            }
            const supplier = consignadoSuppliers.find(s => s.id === consignadoPaymentForm.supplierId);
            const desc = `Pgto Consignado: ${supplier?.name}${consignadoPaymentForm.desc ? ` - ${consignadoPaymentForm.desc}` : ''}`;
            
            // Call backend to process payment (reset soldQty)
            try {
                const res = await fetch('/api/consignado/payment-process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ supplierId: consignadoPaymentForm.supplierId })
                });
                if (!res.ok) throw new Error('Erro ao processar pagamento');
                
                const data = await res.json();
                addToast(`Acerto consignado processado! (${data.changes} produtos zerados)`, 'success');
            } catch (err: any) {
                console.error(err);
                addToast(`Erro ao processar acerto backend: ${err.message}`, 'error');
            }

            newItem = {
                id: Date.now().toString(),
                desc: desc,
                val: parseCurrency(consignadoPaymentForm.val),
            };
            updatedRecord.expenses = [...updatedRecord.expenses, newItem];
            setConsignadoPaymentForm({ supplierId: '', val: '', desc: '' });
        }
        break;
    }

    setTodayRecord(updatedRecord);
    await saveRecord(updatedRecord);
  };

  // Start editing an item
  const startEdit = (type: TabType, id: string) => {
    if (!todayRecord) return;

    let item: any;
    switch (type) {
      case 'expenses':
        item = todayRecord.expenses.find(e => e.id === id);
        if (item) setEditForm({ desc: item.desc, val: formatCurrency(item.val) });
        break;
      case 'pix':
        item = todayRecord.pixDiretoList.find(p => p.id === id);
        if (item) setEditForm({ desc: item.desc, val: formatCurrency(item.val) });
        break;
      case 'crediario':
        item = todayRecord.crediarioList.find(c => c.id === id);
        if (item) setEditForm({ client: item.client, val: formatCurrency(item.val) });
        break;
      case 'non-registered':
        item = todayRecord.nonRegistered.find(n => n.id === id);
        if (item) setEditForm({ desc: item.desc, val: formatCurrency(item.val) });
        break;
    }
    setEditingItem({ type, id });
  };

  // Save edited item
  const saveEdit = async () => {
    if (!todayRecord || !editingItem) return;

    const updatedRecord = { ...todayRecord };
    const { type, id } = editingItem;

    switch (type) {
      case 'expenses':
        updatedRecord.expenses = updatedRecord.expenses.map(e =>
          e.id === id ? { ...e, desc: editForm.desc, val: parseCurrency(editForm.val) } : e
        );
        break;
      case 'pix':
        updatedRecord.pixDiretoList = updatedRecord.pixDiretoList.map(p =>
          p.id === id ? { ...p, desc: editForm.desc, val: parseCurrency(editForm.val) } : p
        );
        break;
      case 'crediario':
        updatedRecord.crediarioList = updatedRecord.crediarioList.map(c =>
          c.id === id ? { ...c, client: editForm.client, val: parseCurrency(editForm.val) } : c
        );
        break;
      case 'non-registered':
        updatedRecord.nonRegistered = updatedRecord.nonRegistered.map(n =>
          n.id === id ? { ...n, desc: editForm.desc, val: parseCurrency(editForm.val) } : n
        );
        break;
    }

    setTodayRecord(updatedRecord);
    await saveRecord(updatedRecord);
    setEditingItem(null);
    setEditForm({});
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingItem(null);
    setEditForm({});
  };

  // Delete item
  const deleteItem = async (type: TabType, id: string) => {
    if (!todayRecord) return;

    if (!confirm('Tem certeza que deseja excluir este item?')) return;

    const updatedRecord = { ...todayRecord };

    switch (type) {
      case 'expenses':
        updatedRecord.expenses = updatedRecord.expenses.filter(e => e.id !== id);
        break;
      case 'pix':
        updatedRecord.pixDiretoList = updatedRecord.pixDiretoList.filter(p => p.id !== id);
        break;
      case 'crediario':
        // If item has a linked customer debt, delete it from backend
        const itemToDelete = updatedRecord.crediarioList.find(c => c.id === id);
        if (itemToDelete?.customerId) {
          try {
            await fetch(`/api/customer-debts/${id}`, { method: 'DELETE' });
          } catch (error) {
            console.error('Error deleting debt:', error);
          }
        }
        updatedRecord.crediarioList = updatedRecord.crediarioList.filter(c => c.id !== id);
        break;
      case 'non-registered':
        updatedRecord.nonRegistered = updatedRecord.nonRegistered.filter(n => n.id !== id);
        break;
    }

    setTodayRecord(updatedRecord);
    await saveRecord(updatedRecord);
  };

  // iFood sale handler
  const addIfoodSale = async () => {
    const grossValue = parseCurrency(ifoodForm.val);
    if (grossValue <= 0) {
      addToast('Informe um valor válido para a venda iFood!', 'warning');
      return;
    }

    setIfoodSaving(true);
    try {
      const response = await fetch('/api/ifood-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sale_date: getTodayDate(),
          gross_value: grossValue,
          operator_fee_percent: parseFloat(ifoodForm.feePercent) || 0,
          description: ifoodForm.desc || undefined,
          user_name: user.name,
          daily_record_id: todayRecord?.id || undefined,
        }),
      });

      if (!response.ok) throw new Error('Failed to create iFood sale');
      const createdSale = await response.json();

      const feeValue = grossValue * ((parseFloat(ifoodForm.feePercent) || 0) / 100);
      const netValue = grossValue - feeValue;

      // Também adiciona como item de registro diário para que apareça no fluxo de caixa
      if (todayRecord) {
        const updatedRecord = { ...todayRecord };
        const newItem = {
          id: 'ifood_' + Date.now().toString(),
          desc: `iFood: ${ifoodForm.desc || 'Venda'} (Bruto: ${formatCurrency(grossValue)} | Líquido: ${formatCurrency(netValue)})`,
          val: grossValue,
        };
        // Coloca como item em não-registrado para aparecer nos totais de caixa
        updatedRecord.nonRegistered = [...updatedRecord.nonRegistered, newItem];
        setTodayRecord(updatedRecord);
        await saveRecord(updatedRecord);
      }

      const dueDateStr = new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR');
      addToast(`Venda iFood de ${formatCurrency(grossValue)} registrada! Previsão de depósito: ${dueDateStr}`, 'success');
      onLog('iFood', `Registrou venda iFood: ${formatCurrency(grossValue)}`);
      setIfoodForm({ val: '', feePercent: '6.5', desc: '' });
    } catch (err) {
      console.error('Error creating iFood sale:', err);
      addToast('Erro ao registrar venda iFood.', 'error');
    } finally {
      setIfoodSaving(false);
    }
  };

  // Tab configuration
  const tabs = [
    { id: 'expenses' as TabType, label: 'Despesas do Dia', icon: AlertCircle, color: 'red' },
    { id: 'pix' as TabType, label: 'Pix Direto na Conta', icon: DollarSign, color: 'cyan' },
    { id: 'crediario' as TabType, label: 'Crediário', icon: ShoppingBag, color: 'amber' },
    { id: 'non-registered' as TabType, label: 'Produto Não Cadastrado', icon: Plus, color: 'blue' },
    { id: 'consignado' as TabType, label: 'Consignados', icon: Package, color: 'emerald' },
    { id: 'ifood' as TabType, label: 'iFood', icon: ShoppingBag, color: 'rose' },
  ];

  const activeTabConfig = tabs.find(t => t.id === activeTab)!;

  // Get items for current tab
  const getCurrentItems = (): any[] => {
    if (!todayRecord) return [];
    switch (activeTab) {
      case 'expenses': return todayRecord.expenses;
      case 'pix': return todayRecord.pixDiretoList;
      case 'crediario': return todayRecord.crediarioList;
      case 'non-registered': return todayRecord.nonRegistered.filter(i => !i.desc.startsWith('Venda Consignado:') && !i.desc.startsWith('iFood:'));
      case 'consignado': 
        return [
            ...todayRecord.nonRegistered.filter(i => i.desc.startsWith('Venda Consignado:')),
            ...todayRecord.expenses.filter(i => i.desc.startsWith('Pgto Consignado:'))
        ];
      case 'ifood':
        return todayRecord.nonRegistered.filter(i => i.desc.startsWith('iFood:'));
      default: return [];
    }
  };

  const currentItems = getCurrentItems();

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">
            Lançamentos Diários
          </h1>
          <p className="text-slate-500 font-bold text-sm mt-1">
            {new Date().toLocaleDateString('pt-BR', { dateStyle: 'full' })}
          </p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 p-2 bg-slate-100/50 rounded-[2rem] border border-slate-200/50">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-3xl text-xs font-black uppercase transition-all duration-300 ${
                isActive
                  ? `bg-${tab.color}-600 text-white shadow-xl scale-[1.02]`
                  : 'text-slate-500 hover:bg-white hover:text-slate-900'
              }`}
            >
              <Icon size={16} className={isActive ? 'text-white' : `text-${tab.color}-600`} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="bg-white p-8 rounded-[3rem] border-2 border-slate-100 shadow-xl space-y-6">
        {/* Form Section */}
        <div className="space-y-4">
          <h2 className={`text-lg font-black text-${activeTabConfig.color}-600 uppercase flex items-center gap-2`}>
            <activeTabConfig.icon className="w-5 h-5" />
            Adicionar {activeTabConfig.label}
          </h2>

          {activeTab === 'expenses' && (
            <div className="flex gap-3 items-center">
                <input
                    type="text"
                    placeholder="Descrição da despesa..."
                    value={expenseForm.desc}
                    onChange={(e) => setExpenseForm({ ...expenseForm, desc: e.target.value })}
                    className="flex-1 px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-red-500"
                />
                <input
                    type="text"
                    placeholder="R$ 0,00"
                    value={expenseForm.val}
                    onChange={(e) => handleCurrencyMask(e.target.value, (val) => setExpenseForm({ ...expenseForm, val: val }))}
                    className="w-32 px-4 py-3 bg-slate-50 border-none rounded-2xl font-black text-sm outline-none focus:ring-2 text-red-600 focus:ring-red-500"
                />
                <button
                    onClick={() => addItem('expenses')}
                    disabled={isSaving}
                    className="px-6 py-3 rounded-2xl font-black text-sm text-white hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-red-600"
                >
                    <Plus className="w-5 h-5" />
                </button>
            </div>
          )}

          {activeTab === 'pix' && (
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Descrição do Pix..."
                value={pixForm.desc}
                onChange={(e) => setPixForm({ ...pixForm, desc: e.target.value })}
                className="flex-1 px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <input
                type="text"
                placeholder="R$ 0,00"
                value={pixForm.val}
                onChange={(e) => handleCurrencyMask(e.target.value, (val) => setPixForm({ ...pixForm, val: val }))}
                className="w-32 px-4 py-3 bg-slate-50 border-none rounded-2xl font-black text-sm text-cyan-600 outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <button
                onClick={() => addItem('pix')}
                disabled={isSaving}
                className="px-6 py-3 bg-cyan-600 text-white rounded-2xl font-black text-sm hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          )}

          {activeTab === 'crediario' && (
            <div className="space-y-3">
              <div className="flex gap-3">
                {/* Customer Search Dropdown */}
                <div className="flex-1 relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar cliente cadastrado..."
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setShowCustomerDropdown(true);
                        if (!e.target.value) {
                          setSelectedCustomer(null);
                          setCrediarioForm({ ...crediarioForm, customerId: '', client: '' });
                          setCustomerBalance(null);
                          setCreditLimitWarning(null);
                        }
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  
                  {/* Dropdown */}
                  {showCustomerDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 max-h-60 overflow-y-auto">
                      {filteredCustomers.length > 0 ? (
                        filteredCustomers.map(customer => (
                          <button
                            key={customer.id}
                            onClick={() => selectCustomer(customer)}
                            className="w-full px-4 py-3 text-left hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors flex justify-between items-center"
                          >
                            <div>
                              <span className="font-bold text-slate-800 dark:text-white">{customer.name}</span>
                              {customer.nickname && (
                                <span className="text-xs text-slate-500 ml-2">({customer.nickname})</span>
                              )}
                            </div>
                            {customer.creditLimit && customer.creditLimit > 0 && (
                              <span className="text-xs text-slate-500">
                                Limite: {formatCurrency(customer.creditLimit)}
                              </span>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="p-3 text-center text-slate-500 text-sm">
                          Nenhum cliente encontrado
                        </div>
                      )}
                      
                      {/* Create new customer option */}
                      <button
                        onClick={() => {
                          setShowNewCustomerForm(true);
                          setShowCustomerDropdown(false);
                          setShowCustomerDropdown(false);
                          setNewCustomerName(customerSearch);
                          setNewCustomerDueDay('');
                        }}
                        className="w-full px-4 py-3 text-left bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors flex items-center gap-2 border-t border-slate-200 dark:border-slate-700"
                      >
                        <UserPlus className="w-4 h-4 text-amber-600" />
                        <span className="font-bold text-amber-700">Cadastrar novo cliente</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Value input */}
                <input
                  type="text"
                  placeholder="R$ 0,00"
                  value={crediarioForm.val}
                  onChange={(e) => {
                    handleCurrencyMask(e.target.value, (val) => {
                        setCrediarioForm({ ...crediarioForm, val: val });
                        validateCreditLimit(val);
                    });
                  }}
                  className="w-32 px-4 py-3 bg-slate-50 border-none rounded-2xl font-black text-sm text-amber-600 outline-none focus:ring-2 focus:ring-amber-500"
                />
                
                <button
                  onClick={() => addItem('crediario')}
                  disabled={isSaving || !crediarioForm.customerId}
                  className="px-6 py-3 bg-amber-600 text-white rounded-2xl font-black text-sm hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {/* New Customer Inline Form */}
              {showNewCustomerForm && (
                <div className="flex gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
                  <input
                    type="text"
                    placeholder="Nome do novo cliente..."
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    className="flex-1 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm outline-none focus:border-amber-500"
                    autoFocus
                  />
                  <select
                    value={newCustomerDueDay}
                    onChange={(e) => setNewCustomerDueDay(e.target.value)}
                    className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm outline-none focus:border-amber-500"
                  >
                    <option value="">Vencimento</option>
                    {[...Array(31)].map((_, i) => (
                      <option key={i + 1} value={i + 1}>Dia {i + 1}</option>
                    ))}
                  </select>
                  <button
                    onClick={createNewCustomer}
                    className="px-4 py-2 bg-amber-600 text-white rounded-xl font-bold text-sm hover:bg-amber-700 transition-colors"
                  >
                    Cadastrar
                  </button>
                  <button
                    onClick={() => { setShowNewCustomerForm(false); setNewCustomerName(''); setNewCustomerDueDay(''); }}
                    className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-sm hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              )}

              {/* Credit Limit Warning */}
              {creditLimitWarning && (
                <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 dark:text-red-400 font-medium">{creditLimitWarning}</p>
                </div>
              )}

              {/* Customer Balance Info */}
              {selectedCustomer && customerBalance && customerBalance.creditLimit > 0 && (
                <div className="flex items-center justify-between px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  <span className="text-xs font-bold text-slate-500 uppercase">
                    {selectedCustomer.name}
                  </span>
                  <div className="flex gap-4 text-xs">
                    <span>
                      Limite: <span className="font-black text-slate-800 dark:text-white">{formatCurrency(customerBalance.creditLimit)}</span>
                    </span>
                    <span>
                      Usado: <span className="font-black text-amber-600">{formatCurrency(customerBalance.totalDebt)}</span>
                    </span>
                    <span>
                      Disponível: <span className={`font-black ${customerBalance.availableCredit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatCurrency(customerBalance.availableCredit)}
                      </span>
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'non-registered' && (
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Nome do produto..."
                value={nonRegForm.desc}
                onChange={(e) => setNonRegForm({ ...nonRegForm, desc: e.target.value })}
                className="flex-1 px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="R$ 0,00"
                value={nonRegForm.val}
                onChange={(e) => handleCurrencyMask(e.target.value, (val) => setNonRegForm({ ...nonRegForm, val: val }))}
                className="w-32 px-4 py-3 bg-slate-50 border-none rounded-2xl font-black text-sm text-blue-600 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => addItem('non-registered')}
                disabled={isSaving}
                className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-black text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          )}

          {activeTab === 'consignado' && (
            <div className="space-y-6 animate-in fade-in duration-300">
                {/* Botões de Ação */}
                <div className="flex gap-4 p-2 bg-slate-100 rounded-2xl w-full sm:w-fit border border-slate-200">
                    <button
                        onClick={() => setConsignadoMode('sale')}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-black transition-all ${consignadoMode === 'sale' ? 'bg-white shadow-md text-emerald-600 ring-1 ring-emerald-100' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'}`}
                    >
                        <ArrowRightLeft className="w-4 h-4" />
                        Venda (Entrada)
                    </button>
                    <button
                        onClick={() => setConsignadoMode('payment')}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-black transition-all ${consignadoMode === 'payment' ? 'bg-white shadow-md text-red-600 ring-1 ring-red-100' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'}`}
                    >
                        <DollarSign className="w-4 h-4" />
                        Pagamento (Saída)
                    </button>
                </div>

                {consignadoMode === 'sale' ? (
                    // FORM VENDA
                    <div className="flex flex-col gap-4 bg-emerald-50/50 p-6 rounded-[2rem] border border-emerald-100">
                        <div className="flex flex-col sm:flex-row gap-3 items-end">
                            <div className="flex-1 w-full">
                                <label className="text-xs font-bold text-emerald-600 ml-4 uppercase tracking-wide">Produto (Apenas com Estoque)</label>
                                <select 
                                    value={selectedSaleProduct}
                                    onChange={(e) => setSelectedSaleProduct(e.target.value)}
                                    className="w-full px-6 py-4 bg-white border-2 border-emerald-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all text-slate-700 mt-2 shadow-sm"
                                >
                                    <option value="">Selecione o produto vendido...</option>
                                    {consignadoProductsList.filter(p => p.currentStock > 0).map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.name} ({p.supplierName}) - {formatCurrency(p.salePrice)} (Est: {p.currentStock})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="w-full sm:w-32">
                                <label className="text-xs font-bold text-emerald-600 ml-4 uppercase tracking-wide">Qtd</label>
                                <input 
                                    type="number" 
                                    min="1"
                                    value={saleQty}
                                    onChange={e => setSaleQty(e.target.value)}
                                    className="w-full px-6 py-4 bg-white border-2 border-emerald-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all mt-2 shadow-sm text-center"
                                />
                            </div>
                            <button 
                                onClick={addSaleItem}
                                className="w-full sm:w-auto px-6 py-4 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 active:scale-95 flex items-center justify-center"
                            >
                                <Plus className="w-6 h-6" />
                            </button>
                        </div>
                        
                        {saleItems.length > 0 && (
                            <div className="bg-white p-6 rounded-3xl space-y-4 border border-emerald-100 shadow-sm mt-2">
                                <div className="space-y-3">
                                {saleItems.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-sm font-bold text-slate-600 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                                        <div className="flex items-center gap-3">
                                            <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-xl text-xs font-black">{item.qty}x</span>
                                            <span>{item.product.name}</span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span>{formatCurrency(item.product.salePrice * item.qty)}</span>
                                            <button onClick={() => removeSaleItem(item.product.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                </div>
                                <div className="flex justify-between items-center pt-4 border-t-2 border-slate-100 font-black text-emerald-700 text-lg">
                                    <span>TOTAL DA VENDA</span>
                                    <span>{formatCurrency(totalSaleValue)}</span>
                                </div>
                            </div>
                        )}
                        
                        <button
                            onClick={() => addItem('consignado')}
                            disabled={isSaving || saleItems.length === 0}
                            className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-wider hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-emerald-600/20 mt-2 active:scale-[0.99]"
                        >
                            Confirmar Entrada no Caixa ({formatCurrency(totalSaleValue)})
                        </button>
                    </div>
                ) : (
                    // FORM PAGAMENTO
                    <div className="flex flex-col gap-4 bg-red-50/50 p-6 rounded-[2rem] border border-red-100 animate-in fade-in slide-in-from-right-4 duration-300">
                        <div>
                            <label className="text-xs font-bold text-red-600 ml-4 uppercase tracking-wide">Fornecedor</label>
                            <select
                                value={consignadoPaymentForm.supplierId}
                                onChange={(e) => {
                                    const sId = e.target.value;
                                    const debt = consignadoProductsList
                                        .filter(p => (p as any).supplierId === sId)
                                        .reduce((sum, p) => sum + (p.soldQty * p.costPrice), 0);
                                    
                                    setConsignadoPaymentForm({ 
                                        ...consignadoPaymentForm, 
                                        supplierId: sId,
                                        val: debt.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                    });
                                }}
                                className="w-full px-6 py-4 bg-white border-2 border-red-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-red-500/10 focus:border-red-500 transition-all text-slate-700 mt-2 shadow-sm"
                            >
                                <option value="">Selecione quem você vai pagar...</option>
                                {consignadoSuppliers.map(s => (
                                    <option key={s.id} value={s.id}>
                                        {s.name}
                                    </option>
                                ))}
                            </select>
                            
                            {consignadoPaymentForm.supplierId && (
                                <div className="mt-2 px-4 py-3 bg-white rounded-xl border border-red-100 text-slate-600 text-xs font-medium flex justify-between items-center shadow-sm">
                                    <span className="uppercase tracking-wide font-bold text-red-500">Valor referente aos itens vendidos:</span>
                                    <span className="text-base font-black text-red-600">
                                        {formatCurrency(
                                            consignadoProductsList
                                                .filter(p => (p as any).supplierId === consignadoPaymentForm.supplierId)
                                                .reduce((sum, p) => sum + (p.soldQty * p.costPrice), 0)
                                        )}
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                             <div className="flex-1">
                                <label className="text-xs font-bold text-red-600 ml-4 uppercase tracking-wide">Valor Pago</label>
                                <input
                                    type="text"
                                    placeholder="R$ 0,00"
                                    value={consignadoPaymentForm.val}
                                    onChange={(e) => handleCurrencyMask(e.target.value, (val) => setConsignadoPaymentForm({ ...consignadoPaymentForm, val: val }))}
                                    className="w-full px-6 py-4 bg-white border-2 border-red-100 rounded-2xl font-black text-lg outline-none focus:ring-4 focus:ring-red-500/10 focus:border-red-500 transition-all text-red-600 mt-2 shadow-sm"
                                />
                            </div>
                            <div className="flex-[2]">
                                <label className="text-xs font-bold text-red-600 ml-4 uppercase tracking-wide">Observação</label>
                                <input
                                    type="text"
                                    placeholder="Ex: Acerto parcial..."
                                    value={consignadoPaymentForm.desc}
                                    onChange={(e) => setConsignadoPaymentForm({ ...consignadoPaymentForm, desc: e.target.value })}
                                    className="w-full px-6 py-4 bg-white border-2 border-red-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-red-500/10 focus:border-red-500 transition-all mt-2 shadow-sm"
                                />
                            </div>
                        </div>
                        
                        <div className="p-4 bg-white rounded-2xl border border-red-100 flex gap-3 text-red-700 text-xs font-medium shadow-sm">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <p>Ao registrar este pagamento, o sistema irá zerar a contagem de "Vendidos" para os produtos deste fornecedor, resetando o ciclo de acerto.</p>
                        </div>

                        <button
                            onClick={() => addItem('consignado')}
                            disabled={isSaving || !consignadoPaymentForm.supplierId || !consignadoPaymentForm.val}
                            className="w-full py-5 bg-red-600 text-white rounded-2xl font-black text-sm uppercase tracking-wider hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-red-600/20 mt-2 active:scale-[0.99]"
                        >
                            Confirmar Saída do Caixa
                        </button>
                    </div>
                )}
            </div>
          )}

          {activeTab === 'ifood' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/10 dark:to-rose-900/10 p-6 rounded-[2rem] border border-red-100 dark:border-red-900/30 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-1">
                    <label className="text-xs font-black text-red-500 ml-4 uppercase tracking-wide">Valor Bruto</label>
                    <input
                      type="text"
                      placeholder="R$ 0,00"
                      value={ifoodForm.val}
                      onChange={(e) => handleCurrencyMask(e.target.value, (val) => setIfoodForm({ ...ifoodForm, val }))}
                      className="w-full px-6 py-4 bg-white dark:bg-slate-800 border-2 border-red-100 dark:border-red-900/30 rounded-2xl font-black text-lg text-red-600 outline-none focus:border-red-500 mt-2 shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-black text-red-500 ml-4 uppercase tracking-wide flex items-center gap-1">
                      <Percent className="w-3 h-3" /> Taxa da Operadora
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={ifoodForm.feePercent}
                        readOnly
                        className="w-full px-6 py-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-100 dark:border-red-900/30 rounded-2xl font-bold text-sm outline-none text-red-600 cursor-not-allowed mt-2 shadow-sm"
                      />
                      <span className="absolute right-4 top-[22px] text-xs font-bold text-red-400">Fixado em Configurações</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-black text-red-500 ml-4 uppercase tracking-wide">Descrição (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Ex: Pedidos do almoço..."
                      value={ifoodForm.desc}
                      onChange={(e) => setIfoodForm({ ...ifoodForm, desc: e.target.value })}
                      className="w-full px-6 py-4 bg-white dark:bg-slate-800 border-2 border-red-100 dark:border-red-900/30 rounded-2xl font-bold text-sm outline-none focus:border-red-500 mt-2 shadow-sm"
                    />
                  </div>
                </div>

                {/* Preview de cálculo */}
                {parseCurrency(ifoodForm.val) > 0 && (
                  <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-red-100 dark:border-red-900/30 shadow-sm space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-slate-500">Valor Bruto:</span>
                      <span className="font-black text-slate-800 dark:text-white">{formatCurrency(parseCurrency(ifoodForm.val))}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-slate-500">Taxa ({ifoodForm.feePercent}%):</span>
                      <span className="font-black text-red-500">- {formatCurrency(parseCurrency(ifoodForm.val) * ((parseFloat(ifoodForm.feePercent) || 0) / 100))}</span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-slate-100 dark:border-slate-700">
                      <span className="font-black text-slate-500 uppercase text-xs">Valor Líquido a Receber:</span>
                      <span className="font-black text-emerald-600 text-lg">
                        {formatCurrency(parseCurrency(ifoodForm.val) - (parseCurrency(ifoodForm.val) * ((parseFloat(ifoodForm.feePercent) || 0) / 100)))}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400 pt-1">
                      <span className="font-bold">Previsão de depósito (30 dias):</span>
                      <span className="font-black">
                        {new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>
                )}

                <button
                  onClick={addIfoodSale}
                  disabled={ifoodSaving || parseCurrency(ifoodForm.val) <= 0}
                  className="w-full py-5 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-2xl font-black text-sm uppercase tracking-wider hover:from-red-600 hover:to-rose-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-red-500/20 active:scale-[0.99]"
                >
                  {ifoodSaving ? 'Registrando...' : 'Registrar Venda iFood'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Table Section */}
        <div className="space-y-3">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider">
            Lançamentos de Hoje ({currentItems.length})
          </h3>

          {currentItems.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-sm font-medium italic">Nenhum lançamento registrado ainda.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {currentItems.map((item) => {
                const isEditing = editingItem?.id === item.id && editingItem?.type === activeTab;
                
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                      isEditing
                        ? `bg-${activeTabConfig.color}-50 border-${activeTabConfig.color}-300`
                        : 'bg-white border-slate-100 hover:border-slate-200 hover:shadow-md'
                    }`}
                  >
                    {isEditing ? (
                      <>
                        <div className="flex-1 flex gap-3">
                          {activeTab === 'crediario' ? (
                            <input
                              type="text"
                              value={editForm.client}
                              onChange={(e) => setEditForm({ ...editForm, client: e.target.value })}
                              className="flex-1 px-3 py-2 bg-white border-2 border-amber-300 rounded-xl font-bold text-sm outline-none"
                            />
                          ) : (
                            <input
                              type="text"
                              value={editForm.desc}
                              onChange={(e) => setEditForm({ ...editForm, desc: e.target.value })}
                              className={`flex-1 px-3 py-2 bg-white border-2 border-${activeTabConfig.color}-300 rounded-xl font-bold text-sm outline-none`}
                            />
                          )}
                          <input
                            type="text"
                            value={editForm.val}
                            onChange={(e) => setEditForm({ ...editForm, val: e.target.value })}
                            className={`w-32 px-3 py-2 bg-white border-2 border-${activeTabConfig.color}-300 rounded-xl font-black text-sm text-${activeTabConfig.color}-600 outline-none`}
                          />
                        </div>
                        <div className="flex gap-2 ml-3">
                          <button
                            onClick={saveEdit}
                            className={`p-2 bg-${activeTabConfig.color}-600 text-white rounded-xl hover:bg-${activeTabConfig.color}-700 transition-colors`}
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-2 bg-slate-200 text-slate-600 rounded-xl hover:bg-slate-300 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex-1">
                          <p className="font-bold text-sm text-slate-800">
                            {activeTab === 'crediario' ? (item as CrediarioItem).client : (item as ExpenseItem).desc}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className={`text-sm font-black text-${activeTabConfig.color}-600`}>
                            {activeTab === 'expenses' ? '- ' : '+ '}
                            {formatCurrency(item.val)}
                          </p>
                          <div className="flex gap-1">
                            <button
                              onClick={() => startEdit(activeTab, item.id)}
                              className="p-2 text-blue-500 hover:bg-blue-50 rounded-xl transition-colors"
                              title="Editar"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteItem(activeTab, item.id)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary */}
        {currentItems.length > 0 && (
          <div className={`pt-4 border-t-2 border-${activeTabConfig.color}-100`}>
            <div className="flex justify-between items-center">
              <span className="text-sm font-black text-slate-600 uppercase">Total:</span>
              <span className={`text-xl font-black text-${activeTabConfig.color}-600`}>
                {activeTab === 'expenses' ? '- ' : '+ '}
                {formatCurrency(currentItems.reduce((sum, item) => sum + item.val, 0))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Success Feedback */}
      {saveSuccess && (
        <div className="fixed bottom-8 right-8 bg-emerald-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-300">
          <CheckCircle2 className="w-5 h-5" />
          <span className="font-black text-sm">Salvo com sucesso!</span>
        </div>
      )}
    </div>
  );
};