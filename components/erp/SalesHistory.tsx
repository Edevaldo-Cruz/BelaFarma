import React, { useState, useEffect } from 'react';
import { 
  Receipt, 
  Search, 
  Calendar, 
  Clock, 
  User, 
  CheckCircle2, 
  XCircle, 
  RotateCcw, 
  Eye, 
  DollarSign, 
  TrendingUp, 
  RefreshCw,
  X,
  CreditCard,
  ShieldCheck,
  Printer
} from 'lucide-react';
import { useToast } from '../ToastContext';
import { DanfeNfceModal } from './DanfeNfceModal';

interface SaleSummary {
  id: string;
  sale_date: string;
  sale_time: string;
  total_items_value: number;
  discount_value: number;
  total_value: number;
  customer_name: string | null;
  user_name: string;
  status: 'CONCLUIDA' | 'CANCELADA';
  total_items: number;
  payment_methods: string;
  cancellation_reason?: string;
  fiscal_status?: string;
  nfe_number?: number;
  nfe_series?: number;
  access_key?: string;
}

export const SalesHistory: React.FC = () => {
  const { addToast } = useToast();
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'CONCLUIDA' | 'CANCELADA'>('TODOS');

  // Detalhes da Venda
  const [activeSaleDetail, setActiveSaleDetail] = useState<any | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Fiscal
  const [activeDanfeModal, setActiveDanfeModal] = useState<any | null>(null);
  const [isEmittingFiscal, setIsEmittingFiscal] = useState<string | null>(null);

  // Modal de Cancelamento
  const [saleToCancel, setSaleToCancel] = useState<SaleSummary | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // Carregar Vendas
  const fetchSales = async () => {
    setIsLoading(true);
    try {
      const statusParam = statusFilter !== 'TODOS' ? `&status=${statusFilter}` : '';
      const res = await fetch(`/api/erp/sales?dataInicio=${selectedDate}&dataFim=${selectedDate}${statusParam}&limit=100`);
      if (res.ok) {
        const json = await res.json();
        setSales(json.data || []);
      }
    } catch (e) {
      addToast('Erro ao carregar histórico de vendas.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [selectedDate, statusFilter]);

  // Carregar Detalhes de uma Venda
  const handleOpenDetail = async (saleId: string) => {
    setIsLoadingDetail(true);
    try {
      const res = await fetch(`/api/erp/sales/${saleId}`);
      if (res.ok) {
        const json = await res.json();
        setActiveSaleDetail(json.data);
      }
    } catch (e) {
      addToast('Erro ao obter detalhes da venda.', 'error');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Confirmar Cancelamento
  const handleConfirmCancel = async () => {
    if (!saleToCancel) return;
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/erp/pos/cancel/${saleToCancel.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason || 'Cancelamento no caixa' })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        addToast(`Venda #${saleToCancel.id} cancelada e estoque estornado!`, 'success');
        setSaleToCancel(null);
        setCancelReason('');
        fetchSales();
      } else {
        addToast(json.error || 'Erro ao cancelar venda.', 'error');
      }
    } catch (e) {
      addToast('Erro de comunicação ao cancelar venda.', 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  // Abrir DANFE NFC-e com QR Code
  const handleImprimirDanfe = async (saleId: string) => {
    try {
      const res = await fetch(`/api/erp/fiscal/danfe/${encodeURIComponent(saleId)}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setActiveDanfeModal(data);
      } else {
        addToast(data.error || 'Não foi possível carregar o cupom fiscal.', 'error');
      }
    } catch (err) {
      addToast('Erro ao carregar DANFE NFC-e.', 'error');
    }
  };

  // Emitir Cupom Fiscal para venda que não foi emitida
  const handleEmitirNfce = async (saleId: string) => {
    setIsEmittingFiscal(saleId);
    try {
      const res = await fetch(`/api/erp/fiscal/emit/${encodeURIComponent(saleId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`NFC-e #${data.nfe_number} emitida com sucesso!`, 'success');
        setActiveDanfeModal(data);
        fetchSales();
      } else {
        addToast(data.error || 'Erro ao emitir NFC-e.', 'error');
      }
    } catch (err) {
      addToast('Erro ao comunicar com o emissor fiscal.', 'error');
    } finally {
      setIsEmittingFiscal(null);
    }
  };

  // Filtragem local
  const filteredSales = sales.filter(s => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return s.id.toLowerCase().includes(q) || (s.customer_name && s.customer_name.toLowerCase().includes(q));
  });

  // Métricas
  const totalFaturado = filteredSales
    .filter(s => s.status === 'CONCLUIDA')
    .reduce((acc, s) => acc + s.total_value, 0);

  const totalCancelado = filteredSales
    .filter(s => s.status === 'CANCELADA')
    .reduce((acc, s) => acc + s.total_value, 0);

  const concluidasCount = filteredSales.filter(s => s.status === 'CONCLUIDA').length;
  const ticketMedio = concluidasCount > 0 ? totalFaturado / concluidasCount : 0;

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-3 sm:p-5 overflow-y-auto">
      {/* 1. TOPO: Título e Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm mb-4">
        <div>
          <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Receipt className="w-6 h-6 text-emerald-600" />
            Histórico de Vendas do PDV
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Consulta rápida de cupons emitidos, conferência de pagamentos e estorno
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Data */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-bold focus:outline-none"
            />
          </div>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-bold"
          >
            <option value="TODOS">Todos os Status</option>
            <option value="CONCLUIDA">Apenas Concluídas</option>
            <option value="CANCELADA">Apenas Canceladas</option>
          </select>

          {/* Botão Atualizar */}
          <button
            onClick={fetchSales}
            disabled={isLoading}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. CARDS DE RESUMO DO DIA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-black uppercase text-slate-400 mb-1">Total Faturado</p>
          <p className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
            R$ {totalFaturado.toFixed(2)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">{concluidasCount} cupons emitidos</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-black uppercase text-slate-400 mb-1">Ticket Médio</p>
          <p className="text-2xl font-black font-mono text-blue-600 dark:text-blue-400">
            R$ {ticketMedio.toFixed(2)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Média por venda concluída</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-black uppercase text-slate-400 mb-1">Total Cancelado</p>
          <p className="text-2xl font-black font-mono text-red-600 dark:text-red-400">
            R$ {totalCancelado.toFixed(2)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Estornos realizados</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-center">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              placeholder="Filtrar por cupom ou cliente..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* 3. TABELA DE VENDAS */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex-1">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-black uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-3 px-4 whitespace-nowrap">Cupom #</th>
                <th className="py-3 px-4 whitespace-nowrap">Horário</th>
                <th className="py-3 px-4 whitespace-nowrap">Cliente</th>
                <th className="py-3 px-4 whitespace-nowrap">Operador</th>
                <th className="py-3 px-4 whitespace-nowrap">Itens</th>
                <th className="py-3 px-4 whitespace-nowrap">Formas de Pagto</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">Total</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">Status</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">Cupom Fiscal</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400 text-xs font-bold">
                    Nenhuma venda encontrada para esta data.
                  </td>
                </tr>
              ) : (
                filteredSales.map(s => {
                  const isConcluida = s.status === 'CONCLUIDA';
                  return (
                    <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-xs text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {s.id}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                        {s.sale_time}
                      </td>
                      <td className="py-3 px-4 font-medium text-xs text-slate-900 dark:text-white whitespace-nowrap">
                        {s.customer_name || 'Balcão / Consumidor'}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                        {s.user_name}
                      </td>
                      <td className="py-3 px-4 text-xs font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {s.total_items} un
                      </td>
                      <td className="py-3 px-4 text-xs font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {s.payment_methods}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm text-slate-900 dark:text-white whitespace-nowrap">
                        R$ {s.total_value.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          isConcluida 
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' 
                            : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                        }`}>
                          {isConcluida ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {s.fiscal_status === 'EMITIDO' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                            <ShieldCheck className="w-3 h-3" />
                            NFC-e #{s.nfe_number}
                          </span>
                        ) : s.fiscal_status === 'CONTINGENCIA' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            <ShieldCheck className="w-3 h-3" />
                            Contingência #{s.nfe_number}
                          </span>
                        ) : s.fiscal_status === 'CANCELADO' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                            NFC-e Cancelada
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium">
                            Não Emitido
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenDetail(s.id)}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300"
                            title="Ver Detalhes do Cupom"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Botão Imprimir DANFE se emitido */}
                          {(s.fiscal_status === 'EMITIDO' || s.fiscal_status === 'CONTINGENCIA') && (
                            <button
                              onClick={() => handleImprimirDanfe(s.id)}
                              className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-600 dark:text-emerald-400"
                              title="Imprimir DANFE NFC-e com QR Code"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Botão Emitir NFC-e se concluída e não emitida */}
                          {isConcluida && (!s.fiscal_status || s.fiscal_status === 'NAO_EMITIDO') && (
                            <button
                              onClick={() => handleEmitirNfce(s.id)}
                              disabled={isEmittingFiscal === s.id}
                              className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-600 dark:text-emerald-400"
                              title="Emitir Cupom Fiscal (NFC-e)"
                            >
                              {isEmittingFiscal === s.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ShieldCheck className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}

                          {isConcluida && (
                            <button
                              onClick={() => setSaleToCancel(s)}
                              className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 hover:bg-red-100 text-red-600"
                              title="Cancelar Venda e Estornar Estoque"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. MODAL: DETALHES DA VENDA */}
      {activeSaleDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-xl w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-white">
                  Detalhes do Cupom #{activeSaleDetail.id}
                </h3>
                <p className="text-xs text-slate-400">{activeSaleDetail.sale_date} às {activeSaleDetail.sale_time}</p>
              </div>
              <button onClick={() => setActiveSaleDetail(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto mb-4 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {activeSaleDetail.items?.map((it: any, i: number) => (
                <div key={i} className="p-3 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">{it.product_name}</p>
                    <p className="font-mono text-[10px] text-slate-400">EAN: {it.barcode || 'S/N'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold">{it.quantity}x R$ {it.unit_price.toFixed(2)}</p>
                    <p className="font-mono font-bold text-emerald-600">R$ {it.total_price.toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Formas de Pagamento */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 mb-4 text-xs space-y-1">
              <p className="font-black text-slate-500 uppercase text-[10px]">Pagamento Realizado:</p>
              {activeSaleDetail.payments?.map((p: any, i: number) => (
                <div key={i} className="flex justify-between font-mono">
                  <span>{p.payment_method} {p.card_brand ? `(${p.card_brand})` : ''}</span>
                  <span className="font-bold">R$ {p.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center font-bold text-sm">
              <span>Total da Venda:</span>
              <span className="text-lg font-black font-mono text-emerald-600">R$ {activeSaleDetail.total_value.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL: CONFIRMAÇÃO DE CANCELAMENTO & ESTORNO */}
      {saleToCancel && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-base font-black text-red-600 flex items-center gap-2 mb-2">
              <RotateCcw className="w-5 h-5" />
              Confirmar Cancelamento de Venda
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
              Esta ação cancelará o cupom <strong className="text-slate-900 dark:text-white">#{saleToCancel.id}</strong> (R$ {saleToCancel.total_value.toFixed(2)}) e <strong>estornará automaticamente os itens de volta ao estoque</strong> físico.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                Motivo do Cancelamento:
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Ex: Cliente desistiu da compra"
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-bold"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setSaleToCancel(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold"
              >
                Voltar
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={isCancelling}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md"
              >
                {isCancelling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                Confirmar Estorno
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL: DANFE NFC-e COM QR CODE */}
      {activeDanfeModal && (
        <DanfeNfceModal
          danfe={activeDanfeModal}
          onClose={() => setActiveDanfeModal(null)}
        />
      )}
    </div>
  );
};
