import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShoppingBag, 
  DollarSign, 
  Calendar, 
  FileText, 
  Copy, 
  Printer, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Sliders, 
  Clock, 
  Building2, 
  Phone, 
  CreditCard, 
  Trash2, 
  PlusCircle, 
  X, 
  ExternalLink,
  Wallet,
  TrendingDown,
  TrendingUp,
  Percent
} from 'lucide-react';
import { PedidoCompraFormal, OrcamentoResumo, User } from '../../types';
import { useToast } from '../ToastContext';

interface ComprasPedidosPainelProps {
  user: User;
  theme: 'light' | 'dark';
  preselectedData?: any[];
  onNavigateToTab?: (tab: string) => void;
}

export const ComprasPedidosPainel: React.FC<ComprasPedidosPainelProps> = ({
  user,
  theme,
  preselectedData,
  onNavigateToTab
}) => {
  const { addToast } = useToast();
  const [pedidos, setPedidos] = useState<PedidoCompraFormal[]>([]);
  const [selectedPedido, setSelectedPedido] = useState<PedidoCompraFormal | null>(null);
  const [orcamento, setOrcamento] = useState<OrcamentoResumo>({
    mes: new Date().getMonth() + 1,
    ano: new Date().getFullYear(),
    limiteMensal: 0,
    comprometido: 0,
    disponivel: 0,
    percentualUtilizado: 0,
    boletosProjetados: []
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal: Ajustar Teto Orçamentário
  const [isOrcamentoModalOpen, setIsOrcamentoModalOpen] = useState(false);
  const [novoTetoOrcamento, setNovoTetoOrcamento] = useState<number>(0);

  // Modal: Criar Pedido Direto
  const [isNovoPedidoModalOpen, setIsNovoPedidoModalOpen] = useState(false);
  const [formNovoPedido, setFormNovoPedido] = useState({
    distribuidora: '',
    representante: '',
    telefone: '',
    condicaoPagamento: '28/35/42 dias',
    previsaoEntrega: '2 dias úteis',
    itens: [] as Array<{ descricao: string; ean: string; quantidade: number; precoUnitario: number; subtotal: number }>
  });

  const [itemTemp, setItemTemp] = useState({
    descricao: '',
    ean: '',
    quantidade: 10,
    precoUnitario: 10.00
  });

  const carregarDados = async () => {
    try {
      setLoading(true);
      // 1. Pedidos do banco
      const res = await fetch('/api/central-compras/pedidos');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data?.pedidos)) {
          setPedidos(data.data.pedidos);
          if (data.data.pedidos.length > 0 && !selectedPedido) {
            setSelectedPedido(data.data.pedidos[0]);
          }
        }
      }

      // 2. Orçamento mensal
      const resOrc = await fetch('/api/central-compras/orcamento');
      if (resOrc.ok) {
        const dataOrc = await resOrc.json();
        if (dataOrc.success && dataOrc.data) {
          setOrcamento(dataOrc.data);
          setNovoTetoOrcamento(dataOrc.data.limiteMensal || 0);
        }
      }
    } catch (err: any) {
      addToast('Erro ao carregar pedidos e orçamento: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  // Preenche dados se vier encaminhado de cotação
  useEffect(() => {
    if (preselectedData && preselectedData.length > 0) {
      const primeiro = preselectedData[0];
      setFormNovoPedido({
        distribuidora: primeiro.distribuidora || '',
        representante: primeiro.representante || '',
        telefone: primeiro.telefone || '',
        condicaoPagamento: primeiro.condicaoPagamento || '28/35/42 dias',
        previsaoEntrega: primeiro.previsaoEntrega || '2 dias úteis',
        itens: primeiro.itens || []
      });
      setIsNovoPedidoModalOpen(true);
    }
  }, [preselectedData]);

  const handleSalvarTetoOrcamentario = async () => {
    try {
      setSaving(true);
      const res = await fetch('/api/central-compras/orcamento/definir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mes: orcamento.mes,
          ano: orcamento.ano,
          limite: novoTetoOrcamento
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addToast('✅ Teto orçamentário mensal atualizado com sucesso!', 'success');
        setIsOrcamentoModalOpen(false);
        carregarDados();
      } else {
        addToast('Erro ao salvar teto: ' + (data.error || 'Falha no servidor'), 'error');
      }
    } catch (err: any) {
      addToast('Falha na comunicação: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddItemNovoPedido = () => {
    if (!itemTemp.descricao.trim() || itemTemp.precoUnitario <= 0) {
      addToast('Preencha a descrição e preço unitário válido.', 'warning');
      return;
    }
    const subtotal = itemTemp.quantidade * itemTemp.precoUnitario;
    setFormNovoPedido(p => ({
      ...p,
      itens: [...p.itens, { ...itemTemp, subtotal }]
    }));
    setItemTemp({ descricao: '', ean: '', quantidade: 10, precoUnitario: 10.00 });
  };

  const handleCriarPedidoDireto = async () => {
    if (!formNovoPedido.distribuidora.trim() || formNovoPedido.itens.length === 0) {
      addToast('Informe a distribuidora e adicione ao menos um item.', 'warning');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch('/api/central-compras/pedidos/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formNovoPedido,
          enfileirarAprovacao: true,
          vincularBoletos: true,
          criadoPor: user.name
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addToast('✅ Espelho de Pedido de Compra gerado com sucesso e enviado para a Fila de Aprovação!', 'success');
        setIsNovoPedidoModalOpen(false);
        setFormNovoPedido({
          distribuidora: '',
          representante: '',
          telefone: '',
          condicaoPagamento: '28/35/42 dias',
          previsaoEntrega: '2 dias úteis',
          itens: []
        });
        carregarDados();
      } else {
        addToast('Erro ao gerar pedido: ' + (data.error || 'Falha no servidor'), 'error');
      }
    } catch (err: any) {
      addToast('Falha na comunicação: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCopiarTexto = (texto?: string) => {
    if (!texto) {
      addToast('Texto não disponível para cópia.', 'warning');
      return;
    }
    navigator.clipboard.writeText(texto);
    addToast('📋 Espelho do Pedido copiado para a área de transferência!', 'success');
  };

  const handleImprimirEspelho = () => {
    window.print();
  };

  const valorTotalNovoPedido = useMemo(() => {
    return formNovoPedido.itens.reduce((acc, it) => acc + it.subtotal, 0);
  }, [formNovoPedido.itens]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Termômetro Orçamentário Mensal */}
      <div className="p-6 rounded-[2rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                Termômetro Orçamentário Mensal (Mês {orcamento.mes}/{orcamento.ano})
              </h3>
              <p className="text-xs text-slate-400 font-bold">
                Trava e controle estrito de compras vs. teto financeiro definido
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsOrcamentoModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
          >
            <Sliders className="w-4 h-4" />
            Ajustar Teto Orçamentário
          </button>
        </div>

        {/* Métricas do Termômetro */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-black uppercase text-slate-400 block">Teto Definido (R$)</span>
            <span className="text-xl font-black text-slate-900 dark:text-white">
              R$ {orcamento.limiteMensal?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-black uppercase text-slate-400 block">Já Comprometido (R$)</span>
            <span className="text-xl font-black text-amber-600 dark:text-amber-400">
              R$ {orcamento.comprometido?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-black uppercase text-slate-400 block">Saldo Disponível (R$)</span>
            <span className={`text-xl font-black ${orcamento.disponivel >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400 animate-pulse'}`}>
              R$ {orcamento.disponivel?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Barra Visual de Progresso */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between text-xs font-bold">
            <span className="text-slate-500">Utilização do Orçamento:</span>
            <span className="text-slate-800 dark:text-slate-200">{orcamento.percentualUtilizado?.toFixed(1)}%</span>
          </div>
          <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 rounded-full ${
                orcamento.percentualUtilizado > 100 ? 'bg-red-600' :
                orcamento.percentualUtilizado > 80 ? 'bg-amber-500' :
                'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, orcamento.percentualUtilizado))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Grid de Pedidos e Espelho Estruturado */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna 1: Lista de Pedidos Formais */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">
              Pedidos de Compra ({pedidos.length})
            </span>
            <button
              onClick={() => setIsNovoPedidoModalOpen(true)}
              className="flex items-center gap-1 text-xs font-black text-red-600 hover:text-red-700 cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" /> Novo Pedido
            </button>
          </div>

          {pedidos.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 text-xs font-bold">
              Nenhum pedido formal gerado ainda.
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {pedidos.map(ped => {
                const isSelected = selectedPedido?.id === ped.id;
                return (
                  <div
                    key={ped.id}
                    onClick={() => setSelectedPedido(ped)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-red-500 bg-red-50/60 dark:bg-red-950/30 shadow-sm'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                        {ped.numeroPedido}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                        ped.status === 'Enviado' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' :
                        ped.status === 'Cancelado' ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300' :
                        'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                      }`}>
                        {ped.status}
                      </span>
                    </div>

                    <h4 className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                      {ped.distribuidora}
                    </h4>

                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        R$ {ped.valorTotal?.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {ped.condicaoPagamento}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Coluna 2 e 3: Espelho Estruturado do Pedido Selecionado */}
        <div className="lg:col-span-2 space-y-6">
          {selectedPedido ? (
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
              {/* Header do Espelho */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-slate-400">ESPELHO DE PEDIDO</span>
                    <span className="text-xs font-black text-red-600 dark:text-red-400 uppercase tracking-wider">{selectedPedido.numeroPedido}</span>
                  </div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white mt-1">
                    {selectedPedido.distribuidora}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    {selectedPedido.representante ? `Representante: ${selectedPedido.representante} • ` : ''}
                    {selectedPedido.telefone ? `Tel: ${selectedPedido.telefone} • ` : ''}
                    Previsão: {selectedPedido.previsaoEntrega || '24h/48h'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopiarTexto(selectedPedido.textoFormatado)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                  >
                    <Copy className="w-4 h-4" />
                    Copiar
                  </button>

                  <button
                    onClick={handleImprimirEspelho}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    Imprimir
                  </button>
                </div>
              </div>

              {/* Grade de Produtos */}
              <div className="space-y-3">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Grade de Medicamentos Faturados
                </span>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400">
                        <th className="py-2 px-2">Código / EAN</th>
                        <th className="py-2 px-2">Descrição</th>
                        <th className="py-2 px-2 text-right">Qtd</th>
                        <th className="py-2 px-2 text-right">Preço Unit.</th>
                        <th className="py-2 px-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {(selectedPedido.itens || []).map((it, idx) => (
                        <tr key={idx}>
                          <td className="py-2.5 px-2 font-mono text-[11px] text-slate-400">
                            #{it.codigoDigifarma || '---'} {it.ean ? `[${it.ean}]` : ''}
                          </td>
                          <td className="py-2.5 px-2 font-black text-slate-800 dark:text-slate-200">
                            {it.descricao}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                            {it.quantidade} un
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono text-slate-700 dark:text-slate-300">
                            R$ {it.precoUnitario?.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-black text-slate-900 dark:text-white">
                            R$ {it.subtotal?.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-sm">
                  <span className="font-black text-slate-500 uppercase">Valor Total do Pedido:</span>
                  <span className="text-xl font-black text-slate-900 dark:text-white">
                    R$ {selectedPedido.valorTotal?.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Projeção de Boletos e Parcelas */}
              {selectedPedido.boletosJson && selectedPedido.boletosJson.length > 0 && (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-blue-500" />
                    Projeção de Boletos no Contas a Pagar ({selectedPedido.condicaoPagamento})
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {selectedPedido.boletosJson.map((bol, idx) => (
                      <div key={idx} className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 block">Parcela {bol.parcela} ({bol.dias} dias)</span>
                        <div className="font-black text-slate-800 dark:text-slate-200">
                          R$ {bol.valor?.toFixed(2)}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          Venc: {new Date(bol.vencimento).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 font-bold">
              Selecione um pedido na lista lateral para visualizar o espelho estruturado.
            </div>
          )}
        </div>
      </div>

      {/* Modal: Ajustar Teto Orçamentário */}
      {isOrcamentoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              Definir Teto Orçamentário Mensal
            </h3>
            <p className="text-xs text-slate-400 font-bold">
              Mês de Referência: {orcamento.mes}/{orcamento.ano}
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Limite Mensal Máximo para Compras (R$)
              </label>
              <input
                type="number"
                step="500"
                value={novoTetoOrcamento}
                onChange={(e) => setNovoTetoOrcamento(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-base font-black text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-4">
              <button
                onClick={() => setIsOrcamentoModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black uppercase text-slate-600 dark:text-slate-400"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvarTetoOrcamentario}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                Salvar Teto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Criar Pedido Direto */}
      {isNovoPedidoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl p-6 rounded-[2.5rem] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              Gerar Novo Pedido de Compra Formal
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Distribuidora</label>
                <input
                  type="text"
                  placeholder="Ex: Santa Cruz, Profarma..."
                  value={formNovoPedido.distribuidora}
                  onChange={(e) => setFormNovoPedido(p => ({ ...p, distribuidora: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Representante</label>
                <input
                  type="text"
                  placeholder="Nome do representante"
                  value={formNovoPedido.representante}
                  onChange={(e) => setFormNovoPedido(p => ({ ...p, representante: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Telefone WhatsApp</label>
                <input
                  type="text"
                  placeholder="Ex: 553299999999"
                  value={formNovoPedido.telefone}
                  onChange={(e) => setFormNovoPedido(p => ({ ...p, telefone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Condição de Pagamento</label>
                <input
                  type="text"
                  placeholder="Ex: 28/35/42 dias"
                  value={formNovoPedido.condicaoPagamento}
                  onChange={(e) => setFormNovoPedido(p => ({ ...p, condicaoPagamento: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Adicionar Itens */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 block">Adicionar Produto</span>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    placeholder="Descrição do medicamento"
                    value={itemTemp.descricao}
                    onChange={(e) => setItemTemp(p => ({ ...p, descricao: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Preço Unit (R$)"
                    value={itemTemp.precoUnitario}
                    onChange={(e) => setItemTemp(p => ({ ...p, precoUnitario: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    placeholder="Qtd"
                    value={itemTemp.quantidade}
                    onChange={(e) => setItemTemp(p => ({ ...p, quantidade: parseInt(e.target.value, 10) || 1 }))}
                    className="w-16 px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-center text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleAddItemNovoPedido}
                    className="px-3 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            {/* Resumo dos Itens Adicionados */}
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {formNovoPedido.itens.map((it, idx) => (
                <div key={idx} className="flex justify-between items-center p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs">
                  <span>{it.descricao} ({it.quantidade} un × R$ {it.precoUnitario.toFixed(2)})</span>
                  <span className="font-bold">R$ {it.subtotal.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="text-sm font-black text-slate-800 dark:text-slate-200">
                Total: R$ {valorTotalNovoPedido.toFixed(2)}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsNovoPedidoModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black uppercase text-slate-600 dark:text-slate-400"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCriarPedidoDireto}
                  disabled={saving || formNovoPedido.itens.length === 0}
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  Gerar Espelho e Enviar à Fila
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
