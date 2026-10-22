import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Barcode, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  Sparkles, 
  Building2, 
  Calendar, 
  DollarSign, 
  FileText, 
  Database, 
  ArrowRight, 
  RotateCcw,
  Check,
  X,
  Plus,
  Search,
  HelpCircle,
  ExternalLink
} from 'lucide-react';
import { Boleto, BoletoStatus, User } from '../types';
import { parseBoleto, ParsedBoleto } from '../utils/boletoParser';
import { useToast } from './ToastContext';

interface BoletoScannerTabProps {
  user: User;
  onAddBoleto: (boleto: Partial<Boleto>) => void;
  onLog?: (action: string, details: string) => void;
  existingBoletos: Boleto[];
}

interface SupplierMemory {
  id: number;
  convenio_key: string;
  bank_code?: string;
  bank_name?: string;
  supplier_name: string;
  last_used_at: string;
  use_count: number;
}

interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateType?: 'barcode' | 'triplet' | 'invoice';
  duplicateReason?: string;
  matches: Boleto[];
}

export const BoletoScannerTab: React.FC<BoletoScannerTabProps> = ({
  user,
  onAddBoleto,
  onLog,
  existingBoletos,
}) => {
  const { addToast } = useToast();

  // Estados principais de entrada
  const [barcodeInput, setBarcodeInput] = useState('');
  const [parsedBoleto, setParsedBoleto] = useState<ParsedBoleto | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [value, setValue] = useState<number>(0);
  const [invoiceNumber, setInvoiceNumber] = useState('');

  // Memória inteligente
  const [matchedMemory, setMatchedMemory] = useState<SupplierMemory | null>(null);
  const [allMemories, setAllMemories] = useState<SupplierMemory[]>([]);
  const [suppliersList, setSuppliersList] = useState<string[]>([]);
  const [supplierSearchFilter, setSupplierSearchFilter] = useState('');
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);

  // Anti-duplicidade
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateCheckResult>({ isDuplicate: false, matches: [] });
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);
  const [forceDuplicateConfirm, setForceDuplicateConfirm] = useState(false);

  // Sessão atual de boletos lançados
  const [sessionBoletos, setSessionBoletos] = useState<Boleto[]>([]);
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const supplierInputRef = useRef<HTMLInputElement>(null);

  // Foco inicial no campo do scanner
  useEffect(() => {
    barcodeInputRef.current?.focus();
    fetchSuppliersList();
    fetchSupplierMemories();
  }, []);

  // Busca lista de fornecedores já existentes no BelaFarma para autocomplete
  const fetchSuppliersList = async () => {
    try {
      const res = await fetch('/api/boletos/suppliers-list');
      if (res.ok) {
        const data = await res.json();
        setSuppliersList(data || []);
      }
    } catch (e) {
      console.error('Erro ao buscar lista de fornecedores:', e);
    }
  };

  // Busca todas as memórias cadastradas
  const fetchSupplierMemories = async () => {
    try {
      const res = await fetch('/api/boletos/supplier-memory');
      if (res.ok) {
        const data = await res.json();
        setAllMemories(data || []);
      }
    } catch (e) {
      console.error('Erro ao buscar memórias de fornecedores:', e);
    }
  };

  // Processa o código do boleto quando o input é alterado
  const handleBarcodeChange = (val: string) => {
    setBarcodeInput(val);
    const clean = val.replace(/\D/g, '');

    // Se o código atingir tamanho plausível de código de barras (44) ou linha digitável (47 ou 48)
    if (clean.length === 44 || clean.length === 47 || clean.length === 48) {
      processBarcode(val);
    } else if (clean.length === 0) {
      resetForm();
    }
  };

  const processBarcode = useCallback(async (codeToProcess: string) => {
    const result = parseBoleto(codeToProcess);
    if (!result.isValid) {
      setParsedBoleto(result);
      return;
    }

    setParsedBoleto(result);
    setDueDate(result.dueDate || new Date().toISOString().split('T')[0]);
    setValue(result.value);
    setForceDuplicateConfirm(false);

    // Consulta memória de convênio
    let detectedSupplier = '';
    try {
      const memRes = await fetch(`/api/boletos/supplier-memory?convenio_key=${encodeURIComponent(result.convenioKey)}`);
      if (memRes.ok) {
        const memData: SupplierMemory | null = await memRes.json();
        if (memData && memData.supplier_name) {
          setMatchedMemory(memData);
          detectedSupplier = memData.supplier_name;
          setSupplierName(memData.supplier_name);
        } else {
          setMatchedMemory(null);
          setSupplierName('');
        }
      }
    } catch (err) {
      console.error('Erro ao consultar memória de convênio:', err);
      setMatchedMemory(null);
    }

    // Executa checagem de duplicidade com os dados extraídos
    checkDuplicate(result.barcode || cleanDigits(codeToProcess), detectedSupplier, result.dueDate || '', result.value, '');
  }, []);

  const cleanDigits = (s: string) => s.replace(/\D/g, '');

  // Checagem ativa de duplicidade
  const checkDuplicate = useCallback(async (
    barcodeStr: string,
    supplier: string,
    due: string,
    val: number,
    invoice: string
  ) => {
    if (!barcodeStr && !supplier) return;
    setIsCheckingDuplicate(true);

    try {
      const res = await fetch('/api/boletos/check-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode: barcodeStr,
          supplierName: supplier,
          due_date: due,
          value: val,
          invoice_number: invoice
        })
      });

      if (res.ok) {
        const data: DuplicateCheckResult = await res.json();
        setDuplicateInfo(data);
      }
    } catch (err) {
      console.error('Erro ao verificar duplicidade de boleto:', err);
    } finally {
      setIsCheckingDuplicate(false);
    }
  }, []);

  // Recalcula duplicidade se fornecedor, vencimento ou valor mudarem
  useEffect(() => {
    if (parsedBoleto && parsedBoleto.isValid) {
      const timer = setTimeout(() => {
        checkDuplicate(
          parsedBoleto.barcode || cleanDigits(barcodeInput),
          supplierName,
          dueDate,
          value,
          invoiceNumber
        );
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [supplierName, dueDate, value, invoiceNumber, parsedBoleto, checkDuplicate, barcodeInput]);

  // Reset do formulário para o próximo boleto
  const resetForm = () => {
    setBarcodeInput('');
    setParsedBoleto(null);
    setSupplierName('');
    setDueDate('');
    setValue(0);
    setInvoiceNumber('');
    setMatchedMemory(null);
    setDuplicateInfo({ isDuplicate: false, matches: [] });
    setForceDuplicateConfirm(false);
    barcodeInputRef.current?.focus();
  };

  // Salvar / Lançar Boleto no Contas a Pagar
  const handleSaveBoleto = async () => {
    if (!parsedBoleto || !parsedBoleto.isValid) {
      addToast('Por favor, bipe ou digite um código de boleto válido.', 'error');
      barcodeInputRef.current?.focus();
      return;
    }

    if (!supplierName.trim()) {
      addToast('Por favor, informe ou selecione o Fornecedor para o boleto.', 'warning');
      supplierInputRef.current?.focus();
      return;
    }

    if (!dueDate) {
      addToast('Data de vencimento não informada.', 'warning');
      return;
    }

    if (value <= 0) {
      addToast('O valor do boleto deve ser maior que zero.', 'warning');
      return;
    }

    // Se detectou duplicidade e usuário não marcou confirmação explícita
    if (duplicateInfo.isDuplicate && !forceDuplicateConfirm) {
      addToast('Atenção: Duplicidade detectada! Marque a opção de confirmação se deseja realmente lançar.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const newBoletoPayload: Partial<Boleto> = {
        supplierName: supplierName.trim(),
        due_date: dueDate,
        value: Number(value),
        status: BoletoStatus.PENDENTE,
        invoice_number: invoiceNumber.trim() || undefined,
        barcode: parsedBoleto.barcode || cleanDigits(barcodeInput),
        bank_code: parsedBoleto.bankCode,
        bank_name: parsedBoleto.bankName,
        convenio_key: parsedBoleto.convenioKey,
        installment_number: 1,
        created_at: new Date().toISOString()
      };

      // Dispara callback do App.tsx para atualizar estado pai e tabela de boletos
      await onAddBoleto(newBoletoPayload);

      if (onLog) {
        onLog('Lançou Boleto via Scanner', `Fornecedor: ${supplierName}, Valor: R$ ${value.toFixed(2)}, Vencimento: ${dueDate}`);
      }

      // Adiciona na lista da sessão atual para controle do operador
      const sessionItem: Boleto = {
        id: Math.random().toString(36).substr(2, 9),
        supplierName: supplierName.trim(),
        due_date: dueDate,
        value: Number(value),
        status: BoletoStatus.PENDENTE,
        installment_number: 1,
        invoice_number: invoiceNumber.trim() || undefined,
        barcode: parsedBoleto.barcode,
        bank_name: parsedBoleto.bankName,
      };
      setSessionBoletos(prev => [sessionItem, ...prev]);

      addToast(`Boleto de ${supplierName.trim()} (R$ ${value.toFixed(2)}) lançado com sucesso!`, 'success');

      // Atualiza memórias e fornecedores locais
      fetchSupplierMemories();
      fetchSuppliersList();

      // Limpa e prepara imediatamente para o próximo boleto
      resetForm();
    } catch (err: any) {
      console.error('Erro ao salvar boleto:', err);
      addToast('Erro ao salvar o boleto: ' + (err?.message || 'Tente novamente.'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Excluir memória de convênio
  const handleDeleteMemory = async (id: number) => {
    if (!confirm('Deseja realmente remover esta memória de fornecedor?')) return;
    try {
      const res = await fetch(`/api/boletos/supplier-memory/${id}`, { method: 'DELETE' });
      if (res.ok) {
        addToast('Memória removida com sucesso.', 'info');
        fetchSupplierMemories();
        if (matchedMemory && matchedMemory.id === id) {
          setMatchedMemory(null);
        }
      }
    } catch (err) {
      console.error('Erro ao excluir memória:', err);
    }
  };

  // Atalhos de teclado ergonômicos
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (parsedBoleto && parsedBoleto.isValid && supplierName.trim()) {
        handleSaveBoleto();
      } else if (barcodeInput.trim().length >= 44) {
        processBarcode(barcodeInput);
      }
    } else if (e.key === 'Escape') {
      resetForm();
    }
  };

  // Fornecedores filtrados para dropdown
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearchFilter.trim()) return suppliersList.slice(0, 8);
    const search = supplierSearchFilter.toLowerCase();
    return suppliersList.filter(s => s.toLowerCase().includes(search)).slice(0, 10);
  }, [suppliersList, supplierSearchFilter]);

  // Total da sessão
  const sessionTotal = useMemo(() => {
    return sessionBoletos.reduce((acc, b) => acc + (b.value || 0), 0);
  }, [sessionBoletos]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Cabeçalho do Scanner */}
      <div className="bg-gradient-to-r from-red-600 to-rose-700 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md border border-white/20">
            <Barcode className="w-8 h-8 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black uppercase tracking-tight">Scanner com Memória Inteligente</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-400 text-emerald-950">
                Anti-Duplicidade Ativa
              </span>
            </div>
            <p className="text-white/80 text-xs font-medium mt-0.5">
              Bipe com o leitor USB ou cole a linha digitável para lançar no Contas a Pagar em 1 segundo.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <button
            onClick={() => setShowMemoryModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all backdrop-blur-md border border-white/20 active:scale-95"
            title="Visualizar convênios memorizados"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Memórias ({allMemories.length})</span>
          </button>
        </div>
      </div>

      {/* Caixa de Entrada do Scanner */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
            <Barcode className="w-4 h-4 text-red-600" />
            Código de Barras ou Linha Digitável
          </label>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-bold uppercase tracking-wider">
            <span>[ENTER] Lançar</span>
            <span>•</span>
            <span>[ESC] Limpar</span>
          </div>
        </div>

        <div className="relative">
          <input
            ref={barcodeInputRef}
            type="text"
            value={barcodeInput}
            onChange={(e) => handleBarcodeChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Aponte o leitor de código de barras ou cole a linha digitável aqui..."
            className="w-full pl-5 pr-28 py-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 focus:border-red-500 dark:focus:border-red-500 rounded-2xl outline-none font-mono text-base md:text-lg font-bold text-slate-900 dark:text-white transition-all placeholder:text-slate-400 placeholder:font-sans"
            autoFocus
          />

          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {barcodeInput && (
              <button
                type="button"
                onClick={resetForm}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-all"
                title="Limpar código"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => processBarcode(barcodeInput)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm active:scale-95"
            >
              Decodificar
            </button>
          </div>
        </div>

        {/* Mensagem de Erro de Decodificação */}
        {parsedBoleto && !parsedBoleto.isValid && (
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl flex items-center gap-3 text-amber-800 dark:text-amber-300 text-xs font-bold">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-600" />
            <span>{parsedBoleto.errorMessage || 'Código de boleto não reconhecido. Verifique os dígitos.'}</span>
          </div>
        )}
      </div>

      {/* Card do Boleto Decodificado */}
      {parsedBoleto && parsedBoleto.isValid && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border-2 border-slate-200 dark:border-slate-800 shadow-xl space-y-6 animate-in slide-in-from-top-4 duration-300">
          
          {/* Alerta de Duplicidade */}
          {duplicateInfo.isDuplicate ? (
            <div className="p-5 bg-red-50 dark:bg-red-950/40 border-2 border-red-500 rounded-2xl space-y-3 animate-pulse">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <h3 className="text-sm font-black text-red-800 dark:text-red-300 uppercase tracking-wide">
                    ⚠️ ALERTA: Boleto Duplicado Detectado!
                  </h3>
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                    {duplicateInfo.duplicateReason}
                  </p>
                </div>
              </div>

              {duplicateInfo.matches.length > 0 && (
                <div className="bg-white/80 dark:bg-slate-900/80 rounded-xl p-3 border border-red-200 dark:border-red-900/60 text-xs space-y-1">
                  <span className="font-black text-slate-500 uppercase tracking-widest text-[10px]">
                    Boleto(s) já existente(s) no sistema:
                  </span>
                  {duplicateInfo.matches.slice(0, 3).map((m, idx) => (
                    <div key={idx} className="flex items-center justify-between font-mono text-slate-700 dark:text-slate-300">
                      <span>{m.supplierName || 'Fornecedor'} • Venc: {m.due_date}</span>
                      <span className="font-bold text-red-600">R$ {Number(m.value).toFixed(2)} (Status: {m.status})</span>
                    </div>
                  ))}
                </div>
              )}

              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceDuplicateConfirm}
                  onChange={(e) => setForceDuplicateConfirm(e.target.checked)}
                  className="w-4 h-4 rounded text-red-600 focus:ring-red-500 cursor-pointer"
                />
                <span className="text-xs font-black text-red-800 dark:text-red-300 uppercase tracking-wider">
                  Estou ciente e autorizo lançar este boleto mesmo duplicado
                </span>
              </label>
            </div>
          ) : (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-center gap-3 text-emerald-800 dark:text-emerald-300 text-xs font-bold">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
              <span>Nenhuma duplicidade encontrada no sistema. Liberado para lançamento seguro.</span>
            </div>
          )}

          {/* Grid de Dados do Boleto */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Banco / Emissor */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-1">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Banco Emissor
              </span>
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                <div>
                  <p className="text-sm font-black text-slate-900 dark:text-white uppercase leading-tight">
                    {parsedBoleto.bankName || 'Banco Desconhecido'}
                  </p>
                  {parsedBoleto.bankCode && (
                    <span className="text-[10px] font-mono text-slate-400">
                      Cód. {parsedBoleto.bankCode}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Vencimento */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-1">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center justify-between">
                <span>Vencimento</span>
                {parsedBoleto.dueDaysRemaining !== undefined && (
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                    parsedBoleto.dueDaysRemaining < 0 
                      ? 'bg-red-100 text-red-700' 
                      : parsedBoleto.dueDaysRemaining === 0 
                      ? 'bg-amber-100 text-amber-800' 
                      : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {parsedBoleto.dueDaysRemaining < 0 
                      ? `Vencido há ${Math.abs(parsedBoleto.dueDaysRemaining)}d` 
                      : parsedBoleto.dueDaysRemaining === 0 
                      ? 'Vence hoje' 
                      : `Em ${parsedBoleto.dueDaysRemaining} dias`}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="bg-transparent font-black text-sm text-slate-900 dark:text-white outline-none w-full cursor-pointer"
                />
              </div>
            </div>

            {/* Valor */}
            <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200 dark:border-emerald-800/40 space-y-1">
              <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">
                Valor do Documento
              </span>
              <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                <span className="text-base font-black">R$</span>
                <input
                  type="number"
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(parseFloat(e.target.value) || 0)}
                  className="bg-transparent font-black text-xl text-emerald-800 dark:text-emerald-300 outline-none w-full"
                />
              </div>
            </div>

            {/* Nota Fiscal */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-1">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Nº Nota Fiscal (Opcional)
              </span>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="Ex: 84920"
                  className="bg-transparent font-bold text-sm text-slate-900 dark:text-white outline-none w-full placeholder:text-slate-400"
                />
              </div>
            </div>

          </div>

          {/* Seção do Fornecedor com Memória Inteligente */}
          <div className="p-5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
                <Building2 className="w-4 h-4 text-red-600" />
                Fornecedor / Beneficiário do Boleto*
              </label>

              {matchedMemory ? (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-full text-[11px] font-black uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Reconhecido da memória (usado {matchedMemory.use_count}x)</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 rounded-full text-[11px] font-black uppercase tracking-wider">
                  <Database className="w-3.5 h-3.5 text-amber-600" />
                  <span>Novo convênio: será memorizado ao salvar</span>
                </div>
              )}
            </div>

            {/* Input e Dropdown de Fornecedores */}
            <div className="relative">
              <input
                ref={supplierInputRef}
                type="text"
                value={supplierName}
                onChange={(e) => {
                  setSupplierName(e.target.value);
                  setSupplierSearchFilter(e.target.value);
                  setIsSupplierDropdownOpen(true);
                }}
                onFocus={() => {
                  setSupplierSearchFilter(supplierName);
                  setIsSupplierDropdownOpen(true);
                }}
                placeholder="Digite ou selecione o fornecedor (ex: Santa Cruz, Panpharma, Profarma, etc.)"
                className="w-full px-4 py-3 bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 focus:border-red-500 rounded-xl outline-none font-bold text-sm text-slate-900 dark:text-white transition-all"
              />

              {/* Dropdown com opções cadastradas */}
              {isSupplierDropdownOpen && filteredSuppliers.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl max-h-56 overflow-y-auto p-1 divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredSuppliers.map((supp, sIdx) => (
                    <button
                      key={sIdx}
                      type="button"
                      onClick={() => {
                        setSupplierName(supp);
                        setIsSupplierDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-200 transition-all flex items-center justify-between"
                    >
                      <span>{supp}</span>
                      <Check className="w-4 h-4 text-red-600 opacity-0 group-hover:opacity-100" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIsSupplierDropdownOpen(false)}
                    className="w-full text-center py-2 text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest"
                  >
                    Fechar Lista
                  </button>
                </div>
              )}
            </div>

            {/* Linha digitável formatada */}
            <div className="text-[11px] font-mono text-slate-400 break-all select-all pt-1">
              <span className="font-sans font-bold uppercase tracking-wider text-[10px] text-slate-500 mr-2">
                Linha Digitável:
              </span>
              {parsedBoleto.linhaDigitavel}
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={resetForm}
              className="w-full sm:w-auto px-6 py-3 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
            >
              Cancelar (ESC)
            </button>

            <button
              type="button"
              onClick={handleSaveBoleto}
              disabled={isSubmitting || !supplierName.trim() || (duplicateInfo.isDuplicate && !forceDuplicateConfirm)}
              className={`w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 ${
                duplicateInfo.isDuplicate && !forceDuplicateConfirm
                  ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 dark:shadow-none'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'Lançando...' : 'Lançar no Contas a Pagar (ENTER)'}</span>
            </button>
          </div>

        </div>
      )}

      {/* Histórico da Sessão Atual */}
      {sessionBoletos.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">
                Boletos Lançados Nesta Sessão
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                Conferência rápida dos boletos recém-escaneados.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-500">
                {sessionBoletos.length} {sessionBoletos.length === 1 ? 'boleto' : 'boletos'}
              </span>
              <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-black">
                Total: {sessionTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-2.5 px-3 whitespace-nowrap">Fornecedor</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">NF</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Vencimento</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Banco</th>
                  <th className="py-2.5 px-3 whitespace-nowrap text-right">Valor</th>
                  <th className="py-2.5 px-3 whitespace-nowrap text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {sessionBoletos.map((sb, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {sb.supplierName}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap font-mono">
                      {sb.invoice_number || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap font-mono">
                      {sb.due_date}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                      {sb.bank_name || 'Boleto'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-black text-emerald-700 dark:text-emerald-400 whitespace-nowrap font-mono">
                      {Number(sb.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        Lançado
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Gerenciamento das Memórias de Convênio */}
      {showMemoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-100 dark:border-slate-800">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-950 text-red-600 rounded-xl">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
                    Memória de Convênios & Fornecedores
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    Lista de associações aprendidas pelo scanner para preenchimento automático.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMemoryModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {allMemories.length === 0 ? (
                <div className="text-center py-12 text-slate-400 space-y-2">
                  <Database className="w-12 h-12 mx-auto opacity-30" />
                  <p className="text-sm font-bold">Nenhum convênio memorizado ainda.</p>
                  <p className="text-xs">
                    Ao escanear um boleto e lançar com um fornecedor, o sistema memorizará automaticamente.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400">
                        <th className="py-2 px-3 whitespace-nowrap">Fornecedor Associado</th>
                        <th className="py-2 px-3 whitespace-nowrap">Banco</th>
                        <th className="py-2 px-3 whitespace-nowrap">Chave Convênio</th>
                        <th className="py-2 px-3 whitespace-nowrap text-center">Usos</th>
                        <th className="py-2 px-3 whitespace-nowrap text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {allMemories.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 px-3 font-black text-slate-900 dark:text-white whitespace-nowrap">
                            {m.supplier_name}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {m.bank_name || m.bank_code || 'Banco'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {m.convenio_key}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {m.use_count}x
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <button
                              onClick={() => handleDeleteMemory(m.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-all"
                              title="Remover esta memória"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-end bg-slate-50 dark:bg-slate-800/40">
              <button
                onClick={() => setShowMemoryModal(false)}
                className="px-6 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all"
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
