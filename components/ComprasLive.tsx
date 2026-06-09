import React, { useState, useEffect } from 'react';
import { Package, RefreshCw, Send, AlertTriangle } from 'lucide-react';
import { useToast } from './ToastContext';

interface Suggestion {
  id: string;
  name: string;
  currentStock: number;
  minStock: number;
  price: number;
  turnover30d: number;
  suggestedQuantity: number;
}

export function ComprasLive() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { addToast } = useToast();

  const fetchSuggestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/purchasing/live-suggestions');
      if (response.status === 503) {
        throw new Error('Servidor do Digifarma está Offline (Fora do expediente).');
      }
      if (!response.ok) throw new Error('Erro ao buscar sugestões');
      
      const data = await response.json();
      setSuggestions(data.items || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSendToWhatsApp = async () => {
    if (selectedIds.size === 0) return;

    const selectedItems = suggestions.filter(s => selectedIds.has(s.id));
    const listText = selectedItems.map(s => `- ${s.name} (Qtd: ${s.suggestedQuantity})`).join('\n');

    try {
      const response = await fetch('/api/purchasing/send-to-edevaldo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list: listText })
      });

      if (!response.ok) throw new Error('Falha ao enviar mensagem');
      
      addToast('Lista enviada para o WhatsApp com sucesso!', 'success');
      setSelectedIds(new Set()); // limpa selecao
    } catch (err) {
      addToast('Erro ao enviar lista.', 'error');
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertTriangle className="w-12 h-12 text-yellow-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">{error}</h2>
        <p className="text-slate-600 dark:text-slate-400 mt-2 max-w-md">
          Não foi possível conectar ao banco de dados da farmácia. Verifique se o servidor do Digifarma está ligado e conectado à rede.
        </p>
        <button 
          onClick={fetchSuggestions}
          className="mt-6 flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <RefreshCw className="w-4 h-4" /> Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-indigo-600" />
            Sugestão de Compras (Tempo Real)
          </h2>
          <p className="text-slate-500 dark:text-slate-400">
            Produtos com estoque baixo ou zerado no Digifarma
          </p>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={fetchSuggestions}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            onClick={handleSendToWhatsApp}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            Enviar (\${selectedIds.size})
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse responsive-table">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <th className="p-4 w-12">
                  <input 
                    type="checkbox"
                    checked={suggestions.length > 0 && selectedIds.size === suggestions.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(new Set(suggestions.map(s => s.id)));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                <th className="p-4 text-sm font-semibold text-slate-600 dark:text-slate-300">Produto</th>
                <th className="p-4 text-sm font-semibold text-slate-600 dark:text-slate-300 text-center">Giro (30d)</th>
                <th className="p-4 text-sm font-semibold text-slate-600 dark:text-slate-300 text-center">Estoque Atual</th>
                <th className="p-4 text-sm font-semibold text-slate-600 dark:text-slate-300 text-center">Sugestão (Qtd)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Carregando do Digifarma...
                  </td>
                </tr>
              ) : suggestions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    Nenhum produto com estoque crítico no momento.
                  </td>
                </tr>
              ) : (
                suggestions.map(item => (
                  <tr 
                    key={item.id} 
                    className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                    onClick={() => toggleSelect(item.id)}
                  >
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="p-4 text-slate-800 dark:text-slate-200 font-medium">
                      {item.name}
                    </td>
                    <td className="p-4 text-center font-semibold text-slate-600 dark:text-slate-400">
                      {item.turnover30d}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-sm font-medium ${item.currentStock <= 0 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                        {item.currentStock}
                      </span>
                    </td>
                    <td className="p-4 text-center text-slate-800 dark:text-slate-200 font-bold">
                      {item.suggestedQuantity}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
