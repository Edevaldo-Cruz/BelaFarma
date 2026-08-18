import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Search, 
  RefreshCw, 
  Plus, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  ExternalLink, 
  Trash2, 
  X, 
  Package, 
  Info,
  Building2,
  Calendar,
  HelpCircle,
  RotateCcw
} from 'lucide-react';
import { AnvisaAlert } from '../types';
import { useToast } from './ToastContext';

interface AnvisaAlertsProps {
  theme?: 'light' | 'dark';
}

export const AnvisaAlerts: React.FC<AnvisaAlertsProps> = ({ theme = 'dark' }) => {
  const { addToast } = useToast();
  const [alerts, setAlerts] = useState<AnvisaAlert[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Filter tab: 'todos' | 'comEstoque' | 'duvidoso'
  const [filterTab, setFilterTab] = useState<'todos' | 'comEstoque' | 'duvidoso'>('todos');

  // Modal de Adicionar/Colar Resolução
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [pasteText, setPasteText] = useState<string>('');
  const [parsing, setParsing] = useState<boolean>(false);

  // Modal de Detalhes da Resolução
  const [selectedAlert, setSelectedAlert] = useState<AnvisaAlert | null>(null);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      let queryParam = '';
      if (filterTab === 'comEstoque') queryParam = '&soComEstoque=true';
      if (filterTab === 'duvidoso') queryParam = '&soDuvidosos=true';

      const res = await fetch(`/api/anvisa/alerts?busca=${encodeURIComponent(searchTerm)}${queryParam}`);
      const data = await res.json();
      if (data.success) {
        setAlerts(data.alerts || []);
      } else {
        addToast(data.error || 'Erro ao carregar alertas da ANVISA', 'error');
      }
    } catch (err: any) {
      console.error('Erro ao buscar alertas:', err);
      addToast('Não foi possível conectar ao servidor de alertas da ANVISA.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [filterTab, searchTerm]);

  const handleSyncAnvisa = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/anvisa/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        addToast(data.message || `Varredura concluída. ${data.countNew} novas resoluções encontradas!`, 'success');
        fetchAlerts();
      } else {
        addToast(data.error || 'Falha ao sincronizar com a ANVISA.', 'error');
      }
    } catch (err) {
      addToast('Erro ao sincronizar com portal da ANVISA.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleParseAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteText.trim()) {
      addToast('Por favor, cole o texto ou link da resolução da ANVISA.', 'warning');
      return;
    }

    setParsing(true);
    try {
      const res = await fetch('/api/anvisa/parse-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasteText })
      });
      const data = await res.json();

      if (data.success && data.alert) {
        addToast(
          data.alert.temEstoque 
            ? `⚠️ Resolução adicionada! ATENÇÃO: Produto (${data.alert.nome_produto}) encontrado no estoque!` 
            : 'Resolução ANVISA analisada e registrada com sucesso.', 
          data.alert.temEstoque ? 'warning' : 'success'
        );
        setPasteText('');
        setIsModalOpen(false);
        fetchAlerts();
      } else {
        addToast(data.error || 'Erro ao processar o texto da ANVISA.', 'error');
      }
    } catch (err) {
      addToast('Erro de comunicação ao enviar resolução.', 'error');
    } finally {
      setParsing(false);
    }
  };

  const handleToggleManualStock = async (alertId: string, newVal: number | null) => {
    try {
      const res = await fetch(`/api/anvisa/alerts/${alertId}/toggle-stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temEstoqueManual: newVal })
      });
      const data = await res.json();
      if (data.success) {
        addToast(
          newVal === 1 
            ? 'Confirmado: Marcado que possuímos no estoque!' 
            : newVal === 0 
              ? 'Confirmado: Marcado que NÃO temos no estoque.' 
              : 'Status redefinido para verificação automática.',
          'info'
        );
        fetchAlerts();
      }
    } catch (err) {
      addToast('Erro ao atualizar confirmação de estoque.', 'error');
    }
  };

  const handleDeleteAlert = async (id: string) => {
    if (!confirm('Deseja realmente remover este alerta da ANVISA?')) return;

    try {
      const res = await fetch(`/api/anvisa/alerts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        addToast('Alerta removido.', 'info');
        setAlerts(prev => prev.filter(a => a.id !== id));
      } else {
        addToast(data.error || 'Erro ao remover alerta.', 'error');
      }
    } catch (err) {
      addToast('Erro ao remover alerta.', 'error');
    }
  };

  // Métricas rápidas
  const totalAlerts = alerts.length;
  const inStockCount = alerts.filter(a => a.statusEstoque === 'comEstoque' || a.tem_estoque_manual === 1).length;
  const duvidosoCount = alerts.filter(a => a.statusEstoque === 'duvidoso' && a.tem_estoque_manual === null).length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-500/10 text-red-500 rounded-xl border border-red-500/20">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Alertas Sanitários ANVISA</h1>
              <p className="text-sm text-gray-400">
                Varredura diária automática de produtos proibidos/interditados e verificação com o estoque.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncAnvisa}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium rounded-xl border border-gray-700 transition duration-150 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin text-blue-400' : ''}`} />
            {syncing ? 'Varrendo ANVISA...' : 'Varredura Diária ANVISA'}
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-red-600/20 transition duration-150"
          >
            <Plus className="w-4 h-4" />
            Colar / Inserir Resolução
          </button>
        </div>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-gray-900/60 border border-gray-800 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-400">Total de Resoluções</span>
            <FileText className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-3xl font-extrabold mt-2 text-white">{totalAlerts}</p>
          <span className="text-xs text-gray-500 mt-1 block">Varredura contínua em segundo plano</span>
        </div>

        <div className={`p-5 rounded-2xl border transition-all backdrop-blur-sm ${
          inStockCount > 0 
            ? 'bg-red-950/40 border-red-500/50 shadow-lg shadow-red-950/50 animate-pulse' 
            : 'bg-gray-900/60 border-gray-800'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-red-400">Possuímos no Estoque</span>
            <Package className="w-5 h-5 text-red-400" />
          </div>
          <p className="text-3xl font-extrabold mt-2 text-red-400">{inStockCount}</p>
          <span className="text-xs font-medium text-red-300/80 mt-1 block">
            {inStockCount > 0 ? '⚠️ Produtos confirmados com saldo ativo!' : 'Nenhum produto proibido confirmado'}
          </span>
        </div>

        <div className={`p-5 rounded-2xl border transition-all backdrop-blur-sm ${
          duvidosoCount > 0 
            ? 'bg-amber-950/40 border-amber-500/50 shadow-lg shadow-amber-950/30' 
            : 'bg-gray-900/60 border-gray-800'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-amber-400">Requer Verificação (Dúvidas)</span>
            <HelpCircle className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-3xl font-extrabold mt-2 text-amber-400">{duvidosoCount}</p>
          <span className="text-xs text-amber-300/80 mt-1 block">
            {duvidosoCount > 0 ? '❓ Produtos semelhantes com saldo (Confira no balcão)' : 'Nenhuma dúvida pendente'}
          </span>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-900/70 p-4 rounded-2xl border border-gray-800">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por medicamento, resolução RE, motivo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-950 border border-gray-800 rounded-xl text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-red-500 transition duration-150"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setFilterTab('todos')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold border transition ${
              filterTab === 'todos'
                ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
            }`}
          >
            Todos ({totalAlerts})
          </button>
          <button
            onClick={() => setFilterTab('comEstoque')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 ${
              filterTab === 'comEstoque'
                ? 'bg-red-600 text-white border-red-500 shadow-sm'
                : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            No Estoque ({inStockCount})
          </button>
          <button
            onClick={() => setFilterTab('duvidoso')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 ${
              filterTab === 'duvidoso'
                ? 'bg-amber-600 text-white border-amber-500 shadow-sm'
                : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            Requer Verificação ({duvidosoCount})
          </button>
        </div>
      </div>

      {/* Tabela de Alertas */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-gray-950/80 text-xs uppercase font-semibold text-gray-400 border-b border-gray-800">
              <tr>
                <th className="py-4 px-5">Data / Resolução</th>
                <th className="py-4 px-5">Nome do Produto / Fabricante</th>
                <th className="py-4 px-5 text-center">Status no Estoque</th>
                <th className="py-4 px-5">Motivo da Proibição</th>
                <th className="py-4 px-5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-red-500" />
                    Carregando resoluções da ANVISA...
                  </td>
                </tr>
              ) : alerts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-500">
                    <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-40 text-gray-400" />
                    Nenhuma resolução encontrada com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                alerts.map((alert) => {
                  const isManual = alert.tem_estoque_manual !== null && alert.tem_estoque_manual !== undefined;
                  const isComEstoque = alert.statusEstoque === 'comEstoque' || alert.tem_estoque_manual === 1;
                  const isDuvidoso = alert.statusEstoque === 'duvidoso' && alert.tem_estoque_manual === null;

                  return (
                    <tr 
                      key={alert.id}
                      className={`hover:bg-gray-800/40 transition duration-150 ${
                        isComEstoque 
                          ? 'bg-red-950/20 border-l-4 border-l-red-500' 
                          : isDuvidoso 
                            ? 'bg-amber-950/15 border-l-4 border-l-amber-500' 
                            : ''
                      }`}
                    >
                      {/* Data / Resolução */}
                      <td className="py-4 px-5 whitespace-nowrap">
                        <div className="font-bold text-gray-100 flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-red-400 shrink-0" />
                          {alert.numero_resolucao}
                        </div>
                        <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3 text-gray-500" />
                          {new Date(alert.data_publicacao).toLocaleDateString('pt-BR')}
                          {alert.tipo_acao && (
                            <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-gray-800 text-gray-300">
                              {alert.tipo_acao}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Nome do Produto / Fabricante */}
                      <td className="py-4 px-5">
                        <div className="font-semibold text-white tracking-wide">
                          {alert.nome_produto}
                        </div>
                        <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3 text-gray-500" />
                          {alert.fabricante || 'Fabricante não informado'}
                          {alert.lote && alert.lote !== 'Não especificado' && (
                            <span className="text-amber-400 ml-1"> (Lote: {alert.lote})</span>
                          )}
                        </div>
                      </td>

                      {/* Status no Estoque & Confirmação Rápida */}
                      <td className="py-4 px-5 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1.5">
                          {isComEstoque ? (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/40 shadow-sm">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              🛑 NO ESTOQUE {isManual ? '(Manual)' : alert.saldoEstoque ? `(${alert.saldoEstoque} un.)` : ''}
                            </div>
                          ) : isDuvidoso ? (
                            <div 
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm"
                              title={alert.produtoEncontradoEstoque || 'Encontrados produtos semelhantes no Digifarma com saldo'}
                            >
                              <HelpCircle className="w-3.5 h-3.5" />
                              ❓ DÚVIDA / VERIFICAR
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              ✅ NÃO TEMOS
                            </div>
                          )}

                          {/* Seletor Rápido de Confirmação Manual */}
                          <div className="flex items-center gap-1 bg-gray-950 p-1 rounded-lg border border-gray-800 text-[11px]">
                            <button
                              onClick={() => handleToggleManualStock(alert.id, 1)}
                              className={`px-2 py-0.5 rounded font-bold transition ${
                                alert.tem_estoque_manual === 1 
                                  ? 'bg-red-600 text-white shadow-sm' 
                                  : 'text-gray-400 hover:text-red-400 hover:bg-gray-800'
                              }`}
                              title="Confirmar que TEMOS este produto na farmácia"
                            >
                              Sim
                            </button>
                            <button
                              onClick={() => handleToggleManualStock(alert.id, 0)}
                              className={`px-2 py-0.5 rounded font-bold transition ${
                                alert.tem_estoque_manual === 0 
                                  ? 'bg-emerald-600 text-white shadow-sm' 
                                  : 'text-gray-400 hover:text-emerald-400 hover:bg-gray-800'
                              }`}
                              title="Confirmar que NÃO temos este produto"
                            >
                              Não
                            </button>
                            {isManual && (
                              <button
                                onClick={() => handleToggleManualStock(alert.id, null)}
                                className="px-1.5 py-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition"
                                title="Redefinir para verificação automática"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Motivo */}
                      <td className="py-4 px-5 max-w-md">
                        <p className="text-xs text-gray-300 line-clamp-2 leading-relaxed">
                          {alert.motivo}
                        </p>
                        {alert.produtoEncontradoEstoque && (
                          <span className="text-[10px] text-amber-400/90 block mt-1">
                            Ref. Digifarma: {alert.produtoEncontradoEstoque}
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="py-4 px-5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedAlert(alert)}
                            className="p-1.5 hover:bg-gray-800 text-gray-400 hover:text-white rounded-lg transition"
                            title="Ver detalhes"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                          {alert.fonte_url && (
                            <a
                              href={alert.fonte_url}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 hover:bg-gray-800 text-blue-400 hover:text-blue-300 rounded-lg transition"
                              title="Abrir no portal ANVISA"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                          <button
                            onClick={() => handleDeleteAlert(alert.id)}
                            className="p-1.5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-lg transition"
                            title="Remover alerta"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

      {/* Modal para Colar / Inserir Resolução ANVISA */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-800 bg-gray-950">
              <div className="flex items-center gap-2 text-red-500 font-bold">
                <ShieldAlert className="w-5 h-5" />
                <span>Colar ou Inserir Resolução ANVISA</span>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleParseAndSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-2">
                  Cole o texto do Diário Oficial / Notícia da ANVISA ou link da resolução:
                </label>
                <textarea
                  rows={6}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Exemplo: RESOLUÇÃO RE Nº 2.451/2026. Proibir a comercialização e recolhimento do produto DIPIRONA 500MG da empresa HYPOFARMA no lote 240890 devido a desvio de qualidade..."
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-xl text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="bg-gray-950/60 p-3 rounded-xl border border-gray-800 text-xs text-gray-400 flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span>
                  O sistema irá identificar automaticamente o número da RE, a data, o nome do produto, o fabricante e o lote, e em seguida fará o cruzamento com o seu estoque.
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={parsing}
                  className="flex items-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-red-600/20 transition disabled:opacity-50"
                >
                  {parsing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Analisando...
                    </>
                  ) : (
                    'Processar & Salvar'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Detalhes da Resolução */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-800 bg-gray-950">
              <div className="flex items-center gap-2 text-white font-bold">
                <FileText className="w-5 h-5 text-red-500" />
                <span>{selectedAlert.numero_resolucao}</span>
              </div>
              <button 
                onClick={() => setSelectedAlert(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm text-gray-300">
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase block">Produto Afetado</span>
                <p className="text-base font-bold text-white mt-0.5">{selectedAlert.nome_produto}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase block">Fabricante</span>
                  <p className="font-medium text-gray-200 mt-0.5">{selectedAlert.fabricante || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase block">Data de Publicação</span>
                  <p className="font-medium text-gray-200 mt-0.5">
                    {new Date(selectedAlert.data_publicacao).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase block">Tipo de Ação</span>
                  <span className="inline-block mt-1 px-2.5 py-0.5 rounded text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                    {selectedAlert.tipo_acao || 'Proibição'}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase block">Lotes Afetados</span>
                  <p className="font-medium text-amber-400 mt-0.5">{selectedAlert.lote || 'Todos / Não informado'}</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-gray-950 border border-gray-800">
                <span className="text-xs font-semibold text-red-400 uppercase block mb-1">Status no Estoque da Farmácia</span>
                {selectedAlert.statusEstoque === 'comEstoque' ? (
                  <p className="text-red-400 font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    ATENÇÃO: Marcado como presente no estoque!
                  </p>
                ) : selectedAlert.statusEstoque === 'duvidoso' ? (
                  <p className="text-amber-400 font-bold flex items-center gap-1.5">
                    <HelpCircle className="w-4 h-4" />
                    REQUER VERIFICAÇÃO: Produto semelhante com saldo encontrado ({selectedAlert.produtoEncontradoEstoque})
                  </p>
                ) : (
                  <p className="text-emerald-400 font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Produto sem saldo / não possuímos no estoque.
                  </p>
                )}
              </div>

              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase block mb-1">Motivo Sanitário</span>
                <p className="p-3 bg-gray-950 border border-gray-800 rounded-xl text-gray-300 text-xs leading-relaxed">
                  {selectedAlert.motivo}
                </p>
              </div>

              {selectedAlert.fonte_url && (
                <a
                  href={selectedAlert.fonte_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 font-semibold rounded-xl border border-blue-500/30 transition text-xs"
                >
                  <ExternalLink className="w-4 h-4" />
                  Ver publicação original no portal da ANVISA
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
