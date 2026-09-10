import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Copy,
  Check,
  FileText,
  TrendingDown,
  Building2,
  Package,
  Layers,
  Send,
  AlertCircle,
  PlusCircle,
  HelpCircle
} from 'lucide-react';
import { useToast } from '../ToastContext';

interface ComparadorCotacoesTextoModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  onCriarCotacaoOficial?: (itens: any[]) => void;
}

const TEXTO_EXEMPLO = `SANTA CRUZ:
1. Dipirona 500mg cx 100 - R$ 12,50
2. Amoxicilina 500mg 21caps - R$ 10,90
3. Dorflex c/ 36 comp - R$ 18,90
4. Losartana Potassica 50mg c/ 30 - R$ 4,50

PANPHARMA:
- Dipirona 500mg c/ 100: R$ 11,80
- Amoxicilina 500mg 21caps: R$ 11,50
- Omeprazol 20mg c/ 28: R$ 6,20
- Losartana Potassica 50mg c/ 30: R$ 4,10

DISTRIBUIDORA GAM:
Dorflex c/ 36 - 17,95
Omeprazol 20mg c/ 28 - 6,50`;

export const ComparadorCotacoesTextoModal: React.FC<ComparadorCotacoesTextoModalProps> = ({
  isOpen,
  onClose,
  theme,
  onCriarCotacaoOficial
}) => {
  const { addToast } = useToast();
  const [texto, setTexto] = useState('');
  const [usarIA, setUsarIA] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState<any | null>(null);
  const [abaResultado, setAbaResultado] = useState<'texto' | 'tabela'>('texto');
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [copiadoGeral, setCopiadoGeral] = useState(false);
  const [copiadoFornecedor, setCopiadoFornecedor] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const handleCarregarExemplo = () => {
    setTexto(TEXTO_EXEMPLO);
    addToast('Exemplo carregado na área de texto.', 'info');
  };

  const handleLimpar = () => {
    setTexto('');
    setResultado(null);
    setQuantidades({});
  };

  const handleProcessar = async (quantidadesAtuais = quantidades) => {
    if (!texto.trim()) {
      addToast('Cole o texto com as cotações para comparar.', 'warning');
      return;
    }

    try {
      setProcessando(true);
      const res = await fetch('/api/central-compras/cotacoes/comparar-texto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texto,
          usarIA,
          quantidades: quantidadesAtuais
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setResultado(data);
        addToast('✅ Cotações analisadas! Menores preços separados.', 'success');
      } else {
        addToast('Aviso: ' + (data.mensagem || data.error || 'Nenhum dado extraído.'), 'warning');
      }
    } catch (err: any) {
      addToast('Erro ao processar cotações: ' + err.message, 'error');
    } finally {
      setProcessando(false);
    }
  };

  const handleMudarQuantidade = (chave: string, val: string) => {
    const num = val === '' ? 0 : parseInt(val, 10);
    const novasQtds = {
      ...quantidades,
      [chave]: isNaN(num) ? 0 : num
    };
    setQuantidades(novasQtds);
    // Atualiza o texto gerado com a nova quantidade informada
    if (resultado) {
      handleProcessar(novasQtds);
    }
  };

  const handleCopiarTexto = (textoParaCopiar: string, fornecedorKey?: string) => {
    if (!textoParaCopiar) return;
    navigator.clipboard.writeText(textoParaCopiar).then(() => {
      if (fornecedorKey) {
        setCopiadoFornecedor(prev => ({ ...prev, [fornecedorKey]: true }));
        setTimeout(() => {
          setCopiadoFornecedor(prev => ({ ...prev, [fornecedorKey]: false }));
        }, 2000);
      } else {
        setCopiadoGeral(true);
        setTimeout(() => setCopiadoGeral(false), 2000);
      }
      addToast('📋 Texto copiado para a área de transferência!', 'success');
    }).catch(() => {
      addToast('Falha ao copiar automaticamente. Selecione e copie manualmente.', 'error');
    });
  };

  const handleEnviarParaCotacaoOficial = () => {
    if (!resultado || !resultado.itensComparados) return;
    if (onCriarCotacaoOficial) {
      const itensFormatados = resultado.itensComparados.map((it: any) => ({
        produtoId: 0,
        descricao: it.produto,
        ean: '',
        quantidade: quantidades[it.produtoNormalizado] || 10
      }));
      onCriarCotacaoOficial(itensFormatados);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 md:px-7 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-red-500 to-orange-500 text-white rounded-2xl shadow-md">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                Comparador de Cotações em Texto
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400">
                  Menor Preço Automático
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Cole as cotações recebidas dos seus fornecedores. O sistema separa os itens com o menor preço e devolve o texto pronto para preencher as quantidades.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Modal com Scroll */}
        <div className="flex-1 overflow-y-auto p-5 md:p-7 space-y-6 custom-scrollbar">
          
          {/* Seção 1: Entrada do Texto */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-red-500" />
                Texto da Cotação (Cole aqui o texto dos fornecedores)
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCarregarExemplo}
                  className="text-[11px] font-bold text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                >
                  Carregar Exemplo
                </button>
                {texto && (
                  <>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <button
                      type="button"
                      onClick={handleLimpar}
                      className="text-[11px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      Limpar
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="relative">
              <textarea
                value={texto}
                onChange={e => setTexto(e.target.value)}
                placeholder="Exemplo:&#10;&#10;DISTRIBUIDORA SANTA CRUZ:&#10;Dipirona 500mg cx 100 - R$ 12,50&#10;Amoxicilina 500mg c/ 21 - R$ 10,90&#10;&#10;PANPHARMA:&#10;Dipirona 500mg c/ 100: R$ 11,80&#10;Amoxicilina 500mg c/ 21: R$ 11,50"
                rows={7}
                className="w-full p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-800 dark:text-slate-200 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all resize-y shadow-inner"
              />
            </div>

            {/* Ações e Alternadores */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={usarIA}
                  onChange={e => setUsarIA(e.target.checked)}
                  className="rounded text-red-600 focus:ring-red-500 h-4 w-4"
                />
                <span className="flex items-center gap-1 font-bold">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Modo Avançado com IA (para textos altamente informais)
                </span>
              </label>

              <button
                type="button"
                onClick={() => handleProcessar()}
                disabled={processando || !texto.trim()}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              >
                {processando ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Separando Melhores Preços...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Comparar e Separar Melhores Preços
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Seção 2: Resultados */}
          {resultado && resultado.success && (
            <div className="space-y-5 pt-4 border-t border-slate-200 dark:border-slate-800 animate-in fade-in duration-300">
              
              {/* Badges de Resumo Estatístico */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                  <span className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-red-500" /> Fornecedores
                  </span>
                  <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                    {resultado.estatisticas?.totalFornecedores || 0}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                  <span className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1">
                    <Package className="w-3 h-3 text-blue-500" /> Produtos Únicos
                  </span>
                  <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                    {resultado.estatisticas?.totalProdutosUnicos || 0}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                  <span className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1">
                    <Layers className="w-3 h-3 text-amber-500" /> Ofertas Lidas
                  </span>
                  <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                    {resultado.estatisticas?.totalOfertas || 0}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
                  <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <TrendingDown className="w-3 h-3" /> Economia Est.
                  </span>
                  <div className="text-lg font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                    {(Number(resultado.estatisticas?.economiaTotalEstimada) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                </div>
              </div>

              {/* Seletor de Visualização (Texto para Pedido vs Tabela) */}
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAbaResultado('texto')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all cursor-pointer ${
                      abaResultado === 'texto'
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    📝 Texto Pronto para Pedido
                  </button>

                  <button
                    onClick={() => setAbaResultado('tabela')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all cursor-pointer ${
                      abaResultado === 'tabela'
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    📊 Comparativo em Tabela
                  </button>
                </div>

                {onCriarCotacaoOficial && (
                  <button
                    type="button"
                    onClick={handleEnviarParaCotacaoOficial}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-100 hover:bg-red-200 dark:bg-red-950/60 dark:hover:bg-red-900 text-red-700 dark:text-red-300 text-xs font-black transition-all cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Salvar como Cotação no BelaFarma
                  </button>
                )}
              </div>

              {/* Visão 1: Texto Pronto para Pedido */}
              {abaResultado === 'texto' && (
                <div className="space-y-6">
                  {/* Bloco Geral com Botão Copiar Tudo */}
                  <div className="p-4 rounded-2xl bg-slate-900 text-slate-100 font-mono text-xs border border-slate-800 shadow-md space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <span className="text-[11px] font-bold text-slate-400">
                        Texto Completo Estruturado com Campos de Quantidade
                      </span>
                      <button
                        onClick={() => handleCopiarTexto(resultado.textoFormatado)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95"
                      >
                        {copiadoGeral ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiadoGeral ? 'Copiado!' : 'Copiar Texto Completo'}
                      </button>
                    </div>

                    <pre className="whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-72 p-2 bg-slate-950/60 rounded-xl text-slate-300">
                      {resultado.textoFormatado}
                    </pre>
                  </div>

                  {/* Cartões Individuais por Fornecedor (Com inputs de quantidade) */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Separado por Fornecedor Vencedor (Permite preencher quantidades na tela):
                    </h4>

                    {resultado.fornecedoresResumo?.map((bloco: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                          <div className="flex items-center gap-2">
                            <span className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-red-500 font-black">
                              <Building2 className="w-4 h-4" />
                            </span>
                            <div>
                              <h5 className="text-sm font-black text-slate-900 dark:text-white">
                                {bloco.fornecedor}
                              </h5>
                              <span className="text-xs text-slate-400">
                                {bloco.totalItens} {bloco.totalItens === 1 ? 'item com o menor preço' : 'itens com o menor preço'}
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => handleCopiarTexto(bloco.textoIndividual, bloco.fornecedor)}
                            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-700 dark:text-slate-300 hover:text-red-600 text-xs font-black transition-all cursor-pointer active:scale-95"
                          >
                            {copiadoFornecedor[bloco.fornecedor] ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiadoFornecedor[bloco.fornecedor] ? 'Copiado!' : `Copiar Pedido de ${bloco.fornecedor}`}
                          </button>
                        </div>

                        {/* Itens do Fornecedor com input de Quantidade */}
                        <div className="space-y-2">
                          {bloco.produtos?.map((prod: any, pIdx: number) => {
                            const qtdAtual = quantidades[prod.produtoNormalizado] || '';
                            return (
                              <div
                                key={pIdx}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/80 text-xs"
                              >
                                <div className="space-y-0.5 flex-1">
                                  <div className="font-black text-slate-800 dark:text-slate-200">
                                    {prod.produto}
                                  </div>
                                  <div className="text-[11px] text-slate-400 font-medium">
                                    {prod.concorrenteInfo}
                                  </div>
                                </div>

                                <div className="flex items-center gap-4 shrink-0">
                                  <div className="text-right">
                                    <div className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                                      {(Number(prod.menorPreco) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </div>
                                    <span className="text-[10px] text-slate-400">unitário</span>
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    <label className="text-[11px] font-bold text-slate-500">Qtd:</label>
                                    <input
                                      type="number"
                                      min="1"
                                      placeholder="____"
                                      value={qtdAtual}
                                      onChange={e => handleMudarQuantidade(prod.produtoNormalizado, e.target.value)}
                                      className="w-16 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-center font-bold text-slate-800 dark:text-slate-100 text-xs focus:ring-1 focus:ring-red-500 focus:outline-none"
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Visão 2: Comparativo em Tabela */}
              {abaResultado === 'tabela' && (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-black uppercase border-b border-slate-200 dark:border-slate-800">
                          <th className="p-3.5">Produto</th>
                          <th className="p-3.5">Melhor Fornecedor</th>
                          <th className="p-3.5 text-right">Menor Preço</th>
                          <th className="p-3.5">Todas as Ofertas</th>
                          <th className="p-3.5 text-right">Economia</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-300">
                        {resultado.itensComparados?.map((item: any, iIdx: number) => (
                          <tr key={iIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                              {item.produto}
                            </td>
                            <td className="p-3.5">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-black text-[11px]">
                                <Check className="w-3 h-3" />
                                {item.vencedor}
                              </span>
                            </td>
                            <td className="p-3.5 text-right font-black text-emerald-600 dark:text-emerald-400 text-sm">
                              {(Number(item.menorPreco) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                            <td className="p-3.5">
                              <div className="flex flex-wrap gap-1.5">
                                {item.todasOfertas?.map((of: any, oIdx: number) => (
                                  <span
                                    key={oIdx}
                                    className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                                      of.isVencedor
                                        ? 'bg-emerald-500/10 text-emerald-600 font-bold'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                    }`}
                                  >
                                    {of.fornecedor}: {(Number(of.preco) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="p-3.5 text-right">
                              {item.economiaUnitario > 0 ? (
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                  -{(Number(item.economiaPercentual) || 0).toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 md:px-7 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between text-xs text-slate-400 font-medium">
          <span>Dica: Você pode copiar o texto completo ou apenas os itens de cada fornecedor específico para enviar pelo WhatsApp.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold transition-all cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
