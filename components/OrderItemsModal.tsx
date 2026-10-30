import React from 'react';
import { X, Package, AlertCircle, CheckCircle2, DollarSign, Calendar, Truck, FileText } from 'lucide-react';
import { Order, OrderItem } from '../types';

interface OrderItemsModalProps {
  order: Order | null;
  onClose: () => void;
}

export const OrderItemsModal: React.FC<OrderItemsModalProps> = ({ order, onClose }) => {
  if (!order) return null;

  const items: OrderItem[] = order.items || [];
  const itemsComCorte = items.filter(i => i.status === 'Corte' || (i.quantidadeCorte && i.quantidadeCorte > 0));
  const valorTotalCortes = itemsComCorte.reduce((sum, i) => sum + (Number(i.subtotal) || 0), 0);
  const totalUnidadesAtendidas = items.reduce((sum, i) => sum + (Number(i.quantidadeAtendida !== undefined ? i.quantidadeAtendida : i.quantidade) || 0), 0);

  const brl = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-red-100 text-red-600 rounded-xl">
                <Package className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  Pedido {order.invoiceNumber ? `#${order.invoiceNumber}` : order.id}
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-slate-200 text-slate-700">
                    {order.distributor}
                  </span>
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  {order.seller && `Vendedor: ${order.seller} • `}Data: {new Date(order.orderDate).toLocaleDateString('pt-BR')} • Previsão: {new Date(order.arrivalForecast).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumo Financeiro & Alertas de Cortes */}
        <div className="p-5 bg-white border-b border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">Total do Pedido</span>
            <span className="text-base font-black text-slate-900 tracking-tight">{brl(order.totalValue)}</span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">Produtos / Unidades</span>
            <span className="text-base font-black text-slate-900 tracking-tight">{items.length} itens ({totalUnidadesAtendidas} un)</span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">Forma de Pagamento</span>
            <span className="text-base font-black text-slate-900 tracking-tight flex items-center gap-1">
              {order.paymentMethod} {order.installments && order.installments.length > 0 && `(${order.installments.length}x)`}
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">Mês Orçamento</span>
            <span className="text-base font-black text-red-600 tracking-tight">{order.paymentMonth}</span>
          </div>
        </div>

        {itemsComCorte.length > 0 && (
          <div className="mx-6 mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-900 text-xs">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Aviso de Cortes na Distribuidora:</span> Há {itemsComCorte.length} item(ns) com corte/não atendido pelo fornecedor. O valor de cortes totalizou {brl(valorTotalCortes)}, e o valor efetivo a pagar já reflete o desconto dos itens não faturados.
            </div>
          </div>
        )}

        {/* Tabela de Itens */}
        <div className="p-6 flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <Package className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm font-bold">Nenhum item discriminado individualmente para este pedido.</p>
              {order.notes && <p className="text-xs text-slate-500 max-w-md mx-auto">{order.notes}</p>}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                    <th className="px-3.5 py-3 whitespace-nowrap">Cód / EAN</th>
                    <th className="px-3.5 py-3">Produto</th>
                    <th className="px-3.5 py-3 text-center whitespace-nowrap">Qtd Sol.</th>
                    <th className="px-3.5 py-3 text-center whitespace-nowrap">Qtd Atend.</th>
                    <th className="px-3.5 py-3 text-right whitespace-nowrap">Preço Unit.</th>
                    <th className="px-3.5 py-3 text-right whitespace-nowrap">ST Unit.</th>
                    <th className="px-3.5 py-3 text-right whitespace-nowrap">Subtotal</th>
                    <th className="px-3.5 py-3 text-center whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it, idx) => {
                    const isCorte = it.status === 'Corte' || (it.quantidadeCorte && it.quantidadeCorte > 0 && it.quantidadeAtendida === 0);
                    return (
                      <tr key={idx} className={`hover:bg-slate-50/80 transition-colors ${isCorte ? 'bg-rose-50/40 text-slate-400 line-through' : ''}`}>
                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500">
                          {it.codigo || it.codigoProduto ? `#${it.codigo || it.codigoProduto}` : (it.ean || it.codigoBarras || '-')}
                        </td>
                        <td className="px-3.5 py-2.5 font-bold text-slate-900">
                          {it.descricao}
                          {it.ean && it.ean !== (it.codigo || it.codigoProduto) && (
                            <span className="block text-[10px] font-mono text-slate-400 font-normal">{it.ean}</span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-bold text-slate-700">
                          {it.quantidadeSolicitada || it.quantidade || 0}
                        </td>
                        <td className="px-3.5 py-2.5 text-center font-black text-slate-900">
                          {it.quantidadeAtendida !== undefined ? it.quantidadeAtendida : it.quantidade}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-medium text-slate-700">
                          {brl(it.precoUnitario)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-medium text-slate-500">
                          {it.valorST ? brl(it.valorST) : '-'}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-black text-slate-900">
                          {brl(it.subtotal)}
                        </td>
                        <td className="px-3.5 py-2.5 text-center">
                          {isCorte ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700">
                              Corte
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-700">
                              <CheckCircle2 className="w-3 h-3" /> Atendido
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Boletos Vinculados */}
          {order.installments && order.installments.length > 0 && (
            <div className="mt-5 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <span className="text-[11px] font-black uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-red-600" /> Boletos e Vencimentos Vinculados ({order.installments.length}x)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {order.installments.map((inst, i) => (
                  <div key={i} className="p-2.5 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-600">Parcela {inst.id || i + 1}</span>
                    <div className="text-right">
                      <span className="font-black text-slate-900 block">{brl(inst.value)}</span>
                      <span className="text-[10px] text-slate-400 font-medium">Vence: {new Date(inst.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">
            Registrado no Belinha com controle orçamentário ativo.
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
