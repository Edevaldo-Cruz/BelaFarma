
import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  XCircle,
  AlertTriangle,
  Layers,
  RefreshCw,
  X,
  FileText,
  Calendar as CalendarIcon,
  Save,
  ChevronRight,
  RotateCcw
} from 'lucide-react';
import { 
  Order, 
  OrderStatus, 
  User, 
  UserRole,
  Boleto,
  BoletoStatus
} from '../types';
import { useToast } from './ToastContext';
import { OrderForm } from './OrderForm';

interface OrdersProps {
  user: User;
  orders: Order[];
  onAdd: (order: Order) => void;
  onUpdate: (order: Order) => void;
  onDelete: (id: string) => void;
  onUpdateBoletos: (orderId: string, boletos: Boleto[]) => void;
}

export const Orders: React.FC<OrdersProps> = ({ user, orders, onAdd, onUpdate, onDelete, onUpdateBoletos }) => {
  const { addToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | undefined>(undefined);
  
  // Estados para Modal de Status
  const [statusModalOrder, setStatusModalOrder] = useState<Order | null>(null);
  const [tempStatus, setTempStatus] = useState<OrderStatus | null>(null);
  const [invoiceInput, setInvoiceInput] = useState('');
  const [receiptDateInput, setReceiptDateInput] = useState(new Date().toISOString().split('T')[0]);

  const [boletosForConfirmation, setBoletosForConfirmation] = useState<Boleto[]>([]);
  const [isBoletoModalOpen, setIsBoletoModalOpen] = useState(false);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const getEffectiveStatus = (order: Order): OrderStatus => {
    const forecast = new Date(order.arrivalForecast);
    forecast.setHours(0, 0, 0, 0);
    
    if (order.status === OrderStatus.PENDENTE && forecast < now) {
      return OrderStatus.ATRASADO;
    }
    return order.status;
  };

  const filteredOrders = orders.filter(order => {
    const effectiveStatus = getEffectiveStatus(order);
    const matchesSearch = order.distributor.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          order.seller.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Regra: Se o filtro for 'all', não mostra ENTREGUE por padrão
    const matchesStatus = statusFilter === 'all' 
      ? effectiveStatus !== OrderStatus.ENTREGUE 
      : effectiveStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleOpenStatusModal = (order: Order) => {
    setStatusModalOrder(order);
    setTempStatus(order.status);
    setInvoiceInput(order.invoiceNumber || '');
    setReceiptDateInput(order.receiptDate || new Date().toISOString().split('T')[0]);
  };

  const generateAndSaveBoletos = (order: Order) => {
    if (!order.installments || order.installments.length === 0) {
      onUpdateBoletos(order.id, []);
      return;
    }
    const boletos: Boleto[] = order.installments.map((inst, index) => ({
      id: `${order.id}-boleto-${index + 1}`,
      order_id: order.id,
      due_date: inst.dueDate,
      value: inst.value,
      status: BoletoStatus.PENDENTE,
      installment_number: index + 1,
      invoice_number: order.invoiceNumber || '',
    }));
    
    setBoletosForConfirmation(boletos);
    setIsBoletoModalOpen(true);
  }

  const handleConfirmBoletos = () => {
    if (statusModalOrder) {
      onUpdateBoletos(statusModalOrder.id, boletosForConfirmation);
    }
    setIsBoletoModalOpen(false);
    setBoletosForConfirmation([]);
    setStatusModalOrder(null);
  };

  const handleSaveStatus = () => {
    if (!statusModalOrder || !tempStatus) return;

    const updatedData: Partial<Order> = { status: tempStatus };
    let fullOrderData: Order;

    if (tempStatus === OrderStatus.ENTREGUE) {
      if (!invoiceInput) {
        addToast("O número da Nota Fiscal é obrigatório para entregas.", "warning");
        return;
      }
      updatedData.invoiceNumber = invoiceInput;
      updatedData.receiptDate = receiptDateInput;
    }
    
    fullOrderData = { ...statusModalOrder, ...updatedData };
    onUpdate(fullOrderData);

    if (tempStatus === OrderStatus.ENTREGUE) {
      generateAndSaveBoletos(fullOrderData);
    } else {
      setStatusModalOrder(null);
    }
  };

  const handleBoletoChange = (index: number, field: 'due_date' | 'value', value: string | number) => {
    const updatedBoletos = [...boletosForConfirmation];
    const boleto = updatedBoletos[index];

    if (field === 'due_date') {
      // Ensure the value is a string and handle timezone correctly
      boleto.due_date = value as string;
    } else if (field === 'value') {
      // Ensure the value is a number
      const numericValue = typeof value === 'string' ? parseFloat(value) : value;
      if (!isNaN(numericValue)) {
        boleto.value = numericValue;
      }
    }
    
    setBoletosForConfirmation(updatedBoletos);
  };

  const getStatusBadge = (order: Order) => {
    const status = getEffectiveStatus(order);

    if (status === OrderStatus.ENTREGUE) {
      return (
        <div className="flex flex-col items-start gap-1">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" /> Entregue
          </span>
          {order.receiptDate && (
            <span className="text-[10px] font-black text-emerald-600/70 uppercase tracking-tighter ml-1">
              Em: {new Date(order.receiptDate + 'T00:00:00').toLocaleDateString('pt-BR')}
            </span>
          )}
        </div>
      );
    }
    if (status === OrderStatus.CANCELADO) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
          <XCircle className="w-3.5 h-3.5" /> Cancelado
        </span>
      );
    }
    if (status === OrderStatus.DEVOLVIDO) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
          <RotateCcw className="w-3.5 h-3.5" /> Devolvido
        </span>
      );
    }
    if (status === OrderStatus.ATRASADO) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200 animate-pulse">
          <AlertTriangle className="w-3.5 h-3.5" /> Atrasado
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
        <Clock className="w-3.5 h-3.5" /> Pendente
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 uppercase tracking-tighter leading-none">Gestão de Pedidos</h1>
          <p className="text-slate-500 font-medium text-sm">Controle de suprimentos em trânsito e pendentes.</p>
        </div>
        
        {user.role === UserRole.ADM && (
          <button 
            onClick={() => {
              setEditingOrder(undefined);
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 active:scale-95"
          >
            <Plus className="w-5 h-5" /> Novo Pedido
          </button>
        )}
      </header>

      <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar por distribuidora..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative w-full md:w-56">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select 
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold appearance-none focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Visão Ativa (S/ Entregues)</option>
            {Object.values(OrderStatus).map(s => (
              <option key={s} value={s}>{s}s</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Distribuidora</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Cronograma</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Situação</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Faturamento</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.map((order) => {
                const isDelayed = getEffectiveStatus(order) === OrderStatus.ATRASADO;
                return (
                  <tr key={order.id} className={`transition-colors group ${isDelayed ? 'bg-red-50/20' : 'hover:bg-red-50/30'}`}>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className={`font-black uppercase group-hover:text-red-700 transition-colors tracking-tighter ${isDelayed ? 'text-red-700' : 'text-slate-900'}`}>{order.distributor}</span>
                        {order.invoiceNumber && (
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{order.invoiceNumber}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-700">{new Date(order.orderDate).toLocaleDateString('pt-BR')}</span>
                        <span className={`text-[10px] font-black uppercase ${isDelayed ? 'text-red-600' : 'text-slate-400'}`}>
                          Previsão: {new Date(order.arrivalForecast).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 relative">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(order)}
                        <button 
                          onClick={() => handleOpenStatusModal(order)}
                          className="p-1.5 text-slate-300 hover:text-red-600 hover:bg-white rounded-lg transition-all border border-transparent hover:border-red-100 shadow-sm"
                          title="Alterar Status"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-black text-slate-900 text-base tracking-tighter">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.totalValue)}
                        </span>
                        <div className="flex items-center gap-1 mt-0.5">
                          {order.installments && order.installments.length > 0 && (
                            <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[9px] font-black uppercase tracking-widest">
                              {order.installments.length}x
                            </span>
                          )}
                          <span className="text-[9px] text-red-600 font-black uppercase tracking-tighter">{order.paymentMethod}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-1">
                        <button 
                          onClick={() => { setEditingOrder(order); setIsModalOpen(true); }}
                          className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-100 rounded-xl transition-all" 
                          title="Editar Detalhes"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        
                        {user.role === UserRole.ADM && (
                          <button 
                            onClick={() => confirm('Excluir este pedido permanentemente?') && onDelete(order.id)}
                            className="p-2 text-slate-300 hover:text-red-700 hover:bg-red-100 rounded-xl transition-all" 
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredOrders.length === 0 && (
            <div className="py-16 text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-100 mx-auto" />
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Nenhum pedido pendente encontrado.</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL DE ALTERAÇÃO DE STATUS */}
      {statusModalOrder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Atualizar Situação</h2>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  Distribuidora: {statusModalOrder.distributor}
                </p>
              </div>
              <button onClick={() => setStatusModalOrder(null)} className="p-2 text-slate-400 hover:text-red-600 transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Selecione o Novo Status</label>
                <div className="grid grid-cols-1 gap-2">
                  {[OrderStatus.PENDENTE, OrderStatus.ENTREGUE, OrderStatus.CANCELADO, OrderStatus.DEVOLVIDO].map((s) => (
                    <button
                      key={s}
                      onClick={() => setTempStatus(s)}
                      className={`flex items-center justify-between px-5 py-4 rounded-2xl border-2 transition-all font-black uppercase text-[10px] tracking-widest ${
                        tempStatus === s 
                          ? 'border-red-600 bg-red-50 text-red-700 shadow-inner' 
                          : 'border-slate-100 text-slate-400 hover:border-slate-200'
                      }`}
                    >
                      <span>{s}</span>
                      {tempStatus === s && <CheckCircle2 className="w-4 h-4" />}
                    </button>
                  ))}
                </div>
              </div>

              {tempStatus === OrderStatus.ENTREGUE && (
                <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                   <div className="h-px bg-slate-100 w-full" />
                   <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Número da Nota Fiscal (NF)*</label>
                    <div className="relative">
                      <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <input 
                        required
                        type="text"
                        className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold"
                        placeholder="Ex: 000.123.456"
                        value={invoiceInput}
                        onChange={e => setInvoiceInput(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data de Recebimento*</label>
                    <div className="relative">
                      <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <input 
                        type="date"
                        className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-red-500 outline-none font-bold"
                        value={receiptDateInput}
                        onChange={e => setReceiptDateInput(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              <button 
                onClick={handleSaveStatus}
                className="w-full flex items-center justify-center gap-2 py-4 bg-red-600 text-white rounded-2xl font-black shadow-xl shadow-red-100 hover:bg-red-700 transition-all active:scale-[0.98] uppercase tracking-widest text-sm"
              >
                <Save className="w-5 h-5" />
                Confirmar Alteração
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <OrderForm 
          user={user}
          order={editingOrder} 
          onSave={(data) => {
            if (editingOrder) onUpdate({ ...editingOrder, ...data });
            else onAdd({ id: Math.random().toString(36).substr(2, 9), ...data });
            setIsModalOpen(false);
          }} 
          onCancel={() => setIsModalOpen(false)} 
        />
      )}

      {isBoletoModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
            <div className="px-8 py-6 border-b border-slate-100">
              <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">Confirmar Boletos Gerados</h2>
              <p className="text-sm text-slate-500">Confira os valores e vencimentos antes de salvar.</p>
            </div>
            <div className="p-8 space-y-4 max-h-[60vh] overflow-y-auto">
              {boletosForConfirmation.map((boleto, index) => (
                <div key={index} className="grid grid-cols-3 gap-4 items-center bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="col-span-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Parcela {boleto.installment_number}</label>
                     <input 
                        type="date"
                        className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none font-bold text-sm"
                        value={boleto.due_date}
                        onChange={e => handleBoletoChange(index, 'due_date', e.target.value)}
                      />
                  </div>
                  <div className="col-span-2">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor</label>
                     <input 
                        type="number"
                        className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none font-black text-lg text-slate-900"
                        value={boleto.value}
                        onChange={e => handleBoletoChange(index, 'value', e.target.value)}
                      />
                  </div>
                </div>
              ))}
            </div>
            <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100">
               <button 
                onClick={handleConfirmBoletos}
                className="w-full flex items-center justify-center gap-2 py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-[0.98] uppercase tracking-widest text-sm"
              >
                <CheckCircle2 className="w-5 h-5" />
                Salvar Boletos e Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
