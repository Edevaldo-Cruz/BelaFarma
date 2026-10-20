import React, { useState, useEffect } from 'react';
import { X, Download, RefreshCw, CheckCircle2, AlertTriangle, ExternalLink, Calendar, Package } from 'lucide-react';
import { useToast } from './ToastContext';

interface OrienteImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderImported: () => void;
}

export const OrienteImportModal: React.FC<OrienteImportModalProps> = ({ isOpen, onClose, onOrderImported }) => {
  const { addToast } = useToast();
  const [numeroDigitado, setNumeroDigitado] = useState('');
  const [pedidosRecentes, setPedidosRecentes] = useState<any[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [importandoId, setImportandoId] = useState<string | null>(null);

  const carregarPedidosRecentes = async () => {
    setCarregandoLista(true);
    try {
      const res = await fetch('/api/belaped/oriente/pedidos-recentes?limite=10');
      const data = await res.json();
      if (data.success && Array.isArray(data.pedidos)) {
        setPedidosRecentes(data.pedidos);
      } else {
        addToast(data.error || 'Não foi possível carregar os pedidos recentes.', 'error');
      }
    } catch (err: any) {
      addToast('Erro ao conectar com robô da Oriente: ' + err.message, 'error');
    } finally {
      setCarregandoLista(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      carregarPedidosRecentes();
    }
  }, [isOpen]);

  const handleImportar = async (codigo: string) => {
    const codLimpo = codigo.trim().replace(/\D/g, '');
    if (!codLimpo) {
      addToast('Informe o número do pedido.', 'warning');
      return;
    }

    setImportandoId(codLimpo);
    try {
      const res = await fetch('/api/belaped/oriente/importar-pedido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigoPedido: codLimpo })
      });
      const data = await res.json();
      if (data.success) {
        addToast(`Pedido #${codLimpo} importado com sucesso da Oriente Farma!`, 'success');
        onOrderImported();
        onClose();
      } else {
        addToast(data.error || `Erro ao importar pedido #${codLimpo}`, 'error');
      }
    } catch (err: any) {
      addToast('Falha na requisição de importação: ' + err.message, 'error');
    } finally {
      setImportandoId(null);
    }
  };

  if (!isOpen) return null;

  const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl">
              <Download className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                Importar Pedido da Oriente Farma
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Sincroniza pedidos de <span className="font-mono text-emerald-700 font-bold">pedidoweb.orientefarma.com.br/gerenciar-pedidos</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-xl transition-all cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Input Manual de Pedido */}
        <div className="p-6 border-b border-slate-100 bg-white">
          <label className="block text-xs font-black uppercase text-slate-500 mb-2 tracking-wider">
            Importar por Número do Pedido
          </label>
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Ex: 68334 ou 68333" 
              className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={numeroDigitado}
              onChange={(e) => setNumeroDigitado(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleImportar(numeroDigitado); }}
            />
            <button 
              onClick={() => handleImportar(numeroDigitado)}
              disabled={importandoId !== null || !numeroDigitado.trim()}
              className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-200"
            >
              {importandoId === numeroDigitado.trim() ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Importar
            </button>
          </div>
        </div>

        {/* Lista de Pedidos Recentes do Portal */}
        <div className="p-6 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black uppercase text-slate-500 tracking-wider">
              Últimos Pedidos no Portal da Oriente
            </span>
            <button 
              onClick={carregarPedidosRecentes} 
              disabled={carregandoLista}
              className="text-xs text-emerald-700 font-bold flex items-center gap-1 hover:underline cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${carregandoLista ? 'animate-spin' : ''}`} /> Atualizar Portal
            </button>
          </div>

          {carregandoLista ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-600" />
              <p className="text-xs font-bold">Conectando ao portal da Oriente Farma via robô...</p>
            </div>
          ) : pedidosRecentes.length === 0 ? (
            <div className="py-8 text-center text-slate-400 space-y-1">
              <Package className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs font-bold">Nenhum pedido recente retornado pelo portal.</p>
              <p className="text-[11px] text-slate-400">Você pode digitar o número do pedido acima para importar diretamente.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pedidosRecentes.map((ped) => {
                const cod = String(ped.codigoPedido);
                const isImporting = importandoId === cod;
                return (
                  <div key={cod} className="p-3.5 rounded-xl border border-slate-200 hover:border-emerald-300 bg-white hover:bg-emerald-50/20 transition-all flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 text-sm">Pedido #{cod}</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          ped.status === 'Confirmado' || ped.status === 'Faturado' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {ped.status || 'Pendente'}
                        </span>
                        {ped.codigoPedidoERP && (
                          <span className="text-[10px] text-slate-400 font-mono font-bold">ERP: {ped.codigoPedidoERP}</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 font-medium">
                        {ped.dataCriacao ? new Date(ped.dataCriacao).toLocaleDateString('pt-BR') : 'Hoje'} • Vendedor: {ped.vendedorNome || 'Franceliza Costa'}
                      </p>
                    </div>

                    <button
                      onClick={() => handleImportar(cod)}
                      disabled={importandoId !== null}
                      className="px-3.5 py-1.5 bg-slate-100 hover:bg-emerald-700 text-slate-700 hover:text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      {isImporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      Importar
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>O pedido será importado com todos os itens, boletos e controle orçamentário.</span>
          <button onClick={onClose} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold transition-all cursor-pointer">
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
