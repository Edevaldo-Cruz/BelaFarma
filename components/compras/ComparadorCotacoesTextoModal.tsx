import React, { useState, useMemo } from 'react';
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
  Filter,
  CheckSquare,
  Square
} from 'lucide-react';
import { useToast } from '../ToastContext';

interface ComparadorCotacoesTextoModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  onCriarCotacaoOficial?: (itens: any[]) => void;
}

const TEXTO_EXEMPLO = `SILAS 
Lamotrigina 100mg 6,79
Melatonina gotas 8,52
Megafix 20g 8,99
Betaistina 16 7,91

FELIPE
LAMOTRIGINA 100MG 30CP UNICHEM 7,48
CETOPROFENO 150MG 10CPS MEDLEY 4,86
BILASTINA 20MG 15CPR 15,16

FRAN
rosuvastatina 20 5,98
Aciclovir 200 8,89
Dienogest 13,15

GUILHERME
hidro 25 0,99
Dienogest 12,45
Fluconazol c/ 2 1,18
Acetilcisteina 600 8,99`;

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
  
  // Controle de quantidades por produtoNormalizado
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  
  // Fornecedor ativo para visualização na tabela ('TODOS' ou nome específico)
  const [fornecedorFiltro, setFornecedorFiltro] = useState<string>('TODOS');
  
  // Opção: copiar apenas os itens que tiveram quantidade > 0 preenchida
  const [apenasComQuantidade, setApenasComQuantidade] = useState(false);

  // Estados de feedback de cópia
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
    setFornecedorFiltro('TODOS');
  };

  const handleProcessar = async () => {
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
          quantidades
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setResultado(data);
        addToast(`✅ Cotações analisadas! ${data.fornecedoresEncontrados?.length || 0} fornecedores separados.`, 'success');
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
    setQuantidades(prev => ({
      ...prev,
      [chave]: isNaN(num) || num < 0 ? 0 : num
    }));
  };

  // Calcula totais individuais por fornecedor
  const metricasFornecedores = useMemo(() => {
    if (!resultado || !resultado.fornecedoresResumo) return {};

    const mapa: Record<string, { totalItens: number; itensComQtd: number; valorTotal: number; unidadesTotal: number }> = {};
    let geralValor = 0;
    let geralUnidades = 0;
    let geralItensComQtd = 0;

    for (const bloco of resultado.fornecedoresResumo) {
      let valorFornecedor = 0;
      let unidadesFornecedor = 0;
      let itensComQtd = 0;

      for (const prod of (bloco.produtos || [])) {
        const qtd = quantidades[prod.produtoNormalizado] || 0;
        if (qtd > 0) {
          itensComQtd++;
          unidadesFornecedor += qtd;
          valorFornecedor += qtd * prod.menorPreco;
        }
      }

      mapa[bloco.fornecedor] = {
        totalItens: (bloco.produtos || []).length,
        itensComQtd,
        valorTotal: valorFornecedor,
        unidadesTotal: unidadesFornecedor
      };

      geralValor += valorFornecedor;
      geralUnidades += unidadesFornecedor;
      geralItensComQtd += itensComQtd;
    }

    return {
      porFornecedor: mapa,
      geral: {
        valorTotal: geralValor,
        unidadesTotal: geralUnidades,
        itensComQtd: geralItensComQtd
      }
    };
  }, [resultado, quantidades]);

  /**
   * Gera o texto LIMPO por fornecedor:
   * Apenas Produto | Quantidade | Preço Unitário | Subtotal e Totalizadores.
   */
  const gerarTextoLimpoFornecedor = (fornecedorNome: string, apenasComQtd = apenasComQuantidade) => {
    if (!resultado || !resultado.fornecedoresResumo) return '';
    const bloco = resultado.fornecedoresResumo.find((f: any) => f.fornecedor === fornecedorNome);
    if (!bloco) return '';

    let produtosParaListar = bloco.produtos || [];
    if (apenasComQtd) {
      produtosParaListar = produtosParaListar.filter((p: any) => (quantidades[p.produtoNormalizado] || 0) > 0);
    }

    if (produtosParaListar.length === 0) {
      return `PEDIDO DE COMPRA - ${fornecedorNome}\n(Nenhum produto com quantidade preenchida)`;
    }

    let textoOut = `==================================================\n`;
    textoOut += `PEDIDO DE COMPRA - ${fornecedorNome}\n`;
    textoOut += `==================================================\n`;

    let totalGeralFornecedor = 0;
    let totalUnidadesFornecedor = 0;

    produtosParaListar.forEach((item: any, idx: number) => {
      const num = String(idx + 1).padStart(2, '0');
      const qtd = quantidades[item.produtoNormalizado] || 0;
      const precoUnit = item.menorPreco;
      const subtotal = qtd * precoUnit;

      totalGeralFornecedor += subtotal;
      totalUnidadesFornecedor += qtd;

      const unitFormatado = precoUnit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const subtotalFormatado = subtotal > 0
        ? subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : 'R$ 0,00';

      const qtdTexto = qtd > 0 ? String(qtd).padStart(4, ' ') : '____';

      textoOut += `${num}. ${item.produto} | Qtd: ${qtdTexto} | Unit: ${unitFormatado} | Total: ${subtotalFormatado}\n`;
    });

    textoOut += `--------------------------------------------------\n`;
    textoOut += `Itens no pedido: ${produtosParaListar.length}\n`;
    if (totalUnidadesFornecedor > 0) {
      textoOut += `Total de unidades: ${totalUnidadesFornecedor}\n`;
    }
    textoOut += `VALOR TOTAL DO PEDIDO: ${totalGeralFornecedor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n`;
    textoOut += `==================================================\n`;

    return textoOut;
  };

  /**
   * Gera o texto LIMPO consolidado de TODOS os fornecedores.
   */
  const gerarTextoLimpoConsolidado = (apenasComQtd = apenasComQuantidade) => {
    if (!resultado || !resultado.fornecedoresResumo) return '';
    const blocos = resultado.fornecedoresResumo.map((f: any) => gerarTextoLimpoFornecedor(f.fornecedor, apenasComQtd));
    
    let textoTotal = blocos.join('\n\n');
    const metricas = metricasFornecedores.geral;
    if (metricas && metricas.valorTotal > 0) {
      textoTotal += `\n\n==================================================\n`;
      textoTotal += `RESUMO GERAL CONSOLIDADO DE COMPRAS\n`;
      textoTotal += `Total de itens pedidos: ${metricas.itensComQtd}\n`;
      textoTotal += `Total geral de unidades: ${metricas.unidadesTotal}\n`;
      textoTotal += `VALOR TOTAL GERAL: ${metricas.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n`;
      textoTotal += `==================================================\n`;
    }

    return textoTotal;
  };

  const handleCopiarFornecedor = (fornecedorNome: string) => {
    const textoLimpo = gerarTextoLimpoFornecedor(fornecedorNome);
    navigator.clipboard.writeText(textoLimpo).then(() => {
      setCopiadoFornecedor(prev => ({ ...prev, [fornecedorNome]: true }));
      setTimeout(() => setCopiadoFornecedor(prev => ({ ...prev, [fornecedorNome]: false })), 2000);
      addToast(`📋 Pedido limpo de ${fornecedorNome} copiado com sucesso!`, 'success');
    });
  };

  const handleCopiarTudo = () => {
    const textoLimpo = gerarTextoLimpoConsolidado();
    navigator.clipboard.writeText(textoLimpo).then(() => {
      setCopiadoGeral(true);
      setTimeout(() => setCopiadoGeral(false), 2000);
      addToast('📋 Todos os pedidos consolidados copiados!', 'success');
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

  // Fornecedores a exibir com base no filtro
  const blocosExibicao = useMemo(() => {
    if (!resultado || !resultado.fornecedoresResumo) return [];
    if (fornecedorFiltro === 'TODOS') return resultado.fornecedoresResumo;
    return resultado.fornecedoresResumo.filter((b: any) => b.fornecedor === fornecedorFiltro);
  }, [resultado, fornecedorFiltro]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-2 sm:p-4 md:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden">
        
        {/* Topo / Header */}
        <div className="flex items-center justify-between p-4 md:px-7 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-red-500 to-orange-500 text-white rounded-2xl shadow-md">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                Comparador de Cotações em Texto
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400">
                  Tabelas por Fornecedor & Pedidos Limpos
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Digite as quantidades diretamente nas tabelas de cada fornecedor e gere textos limpos com unitário, subtotal e total geral.
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

        {/* Corpo com Scroll */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar">
          
          {/* Caixa de Entrada de Texto (Retrátil se já houver resultados) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-red-500" />
                Texto da Cotação (Cole aqui o texto recebido de todos os representantes)
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

            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              placeholder="Cole aqui o texto da cotação com os nomes dos representantes (ex: SILAS, FELIPE, FRAN, GUILHERME) e seus produtos/preços..."
              rows={resultado ? 4 : 7}
              className="w-full p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all resize-y shadow-inner"
            />

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={usarIA}
                  onChange={e => setUsarIA(e.target.checked)}
                  className="rounded text-red-600 focus:ring-red-500 h-4 w-4"
                />
                <span className="flex items-center gap-1 font-bold">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Modo com IA (opcional)
                </span>
              </label>

              <button
                type="button"
                onClick={handleProcessar}
                disabled={processando || !texto.trim()}
                className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-2xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              >
                {processando ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Separando Fornecedores...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    {resultado ? 'Reanalisar Texto' : 'Comparar e Separar Fornecedores'}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Área de Tabelas por Fornecedor */}
          {resultado && resultado.success && (
            <div className="space-y-6 animate-in fade-in duration-300">
              
              {/* Barra de Ações Rápidas & Total Geral Consolidado */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900 text-white shadow-md">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Totalizador Consolidado de Todas as Compras
                  </span>
                  <div className="flex flex-wrap items-baseline gap-4">
                    <span className="text-2xl font-black text-emerald-400">
                      {(metricasFornecedores.geral?.valorTotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                    <span className="text-xs text-slate-300 font-bold">
                      {metricasFornecedores.geral?.unidadesTotal || 0} unidades em {metricasFornecedores.geral?.itensComQtd || 0} itens selecionados
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold cursor-pointer select-none border border-slate-700">
                    <input
                      type="checkbox"
                      checked={apenasComQuantidade}
                      onChange={e => setApenasComQuantidade(e.target.checked)}
                      className="rounded text-red-600 focus:ring-red-500 h-4 w-4"
                    />
                    <span>Copiar apenas itens com Qtd {'>'} 0</span>
                  </label>

                  <button
                    onClick={handleCopiarTudo}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 shadow-md"
                  >
                    {copiadoGeral ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
                    {copiadoGeral ? 'Copiado!' : 'Copiar Todos os Pedidos'}
                  </button>

                  {onCriarCotacaoOficial && (
                    <button
                      onClick={handleEnviarParaCotacaoOficial}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-black transition-all cursor-pointer border border-slate-700"
                    >
                      <PlusCircle className="w-4 h-4" />
                      Cotação ERP
                    </button>
                  )}
                </div>
              </div>

              {/* Filtro por Abas de Fornecedor */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                <button
                  onClick={() => setFornecedorFiltro('TODOS')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black uppercase transition-all cursor-pointer shrink-0 ${
                    fornecedorFiltro === 'TODOS'
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Todos os Fornecedores ({resultado.fornecedoresResumo?.length || 0})
                </button>

                {resultado.fornecedoresResumo?.map((bloco: any) => {
                  const isSelected = fornecedorFiltro === bloco.fornecedor;
                  const m = metricasFornecedores.porFornecedor?.[bloco.fornecedor];
                  return (
                    <button
                      key={bloco.fornecedor}
                      onClick={() => setFornecedorFiltro(bloco.fornecedor)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black uppercase transition-all cursor-pointer shrink-0 border ${
                        isSelected
                          ? 'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                      }`}
                    >
                      <Building2 className="w-3.5 h-3.5 text-red-500" />
                      <span>{bloco.fornecedor}</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 font-bold">
                        {bloco.totalItens} itens
                      </span>
                      {m && m.valorTotal > 0 && (
                        <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400">
                          {m.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Lista de Tabelas Separadas por Fornecedor */}
              <div className="space-y-6">
                {blocosExibicao.map((bloco: any) => {
                  const m = metricasFornecedores.porFornecedor?.[bloco.fornecedor] || {
                    totalItens: bloco.totalItens,
                    itensComQtd: 0,
                    valorTotal: 0,
                    unidadesTotal: 0
                  };

                  return (
                    <div
                      key={bloco.fornecedor}
                      className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
                    >
                      {/* Cabeçalho da Tabela do Fornecedor */}
                      <div className="p-4 md:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                          <span className="p-2.5 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 font-black">
                            <Building2 className="w-5 h-5" />
                          </span>
                          <div>
                            <h4 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                              {bloco.fornecedor}
                              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                {bloco.totalItens} itens com o menor preço
                              </span>
                            </h4>
                            <span className="text-xs text-slate-400 font-medium">
                              {m.itensComQtd} itens com quantidade preenchida ({m.unidadesTotal} unidades)
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {m.valorTotal > 0 && (
                            <div className="text-right sm:mr-2">
                              <span className="text-[10px] font-black uppercase text-slate-400 block">
                                Subtotal deste Fornecedor
                              </span>
                              <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                                {m.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </span>
                            </div>
                          )}

                          <button
                            onClick={() => handleCopiarFornecedor(bloco.fornecedor)}
                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 shadow-sm"
                          >
                            {copiadoFornecedor[bloco.fornecedor] ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                            {copiadoFornecedor[bloco.fornecedor] ? 'Copiado!' : `Copiar Pedido Limpo de ${bloco.fornecedor}`}
                          </button>
                        </div>
                      </div>

                      {/* Tabela Interativa de Produtos */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-100/70 dark:bg-slate-800/30 text-slate-500 dark:text-slate-400 font-black uppercase border-b border-slate-200 dark:border-slate-800">
                              <th className="py-3 px-4 w-12 text-center">#</th>
                              <th className="py-3 px-4">Produto</th>
                              <th className="py-3 px-4 text-right w-28">Preço Unit.</th>
                              <th className="py-3 px-4 text-center w-32">Quantidade</th>
                              <th className="py-3 px-4 text-right w-32">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-300">
                            {bloco.produtos?.map((prod: any, pIdx: number) => {
                              const qtdAtual = quantidades[prod.produtoNormalizado] || 0;
                              const subtotal = qtdAtual * prod.menorPreco;
                              const temQtd = qtdAtual > 0;

                              return (
                                <tr
                                  key={pIdx}
                                  className={`transition-colors ${
                                    temQtd
                                      ? 'bg-emerald-50/40 dark:bg-emerald-950/20'
                                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                                  }`}
                                >
                                  <td className="py-3 px-4 text-center font-bold text-slate-400">
                                    {String(pIdx + 1).padStart(2, '0')}
                                  </td>
                                  
                                  <td className="py-3 px-4">
                                    <div className="font-bold text-slate-900 dark:text-white">
                                      {prod.produto}
                                    </div>
                                    <div className="text-[11px] text-slate-400 font-medium">
                                      {prod.concorrenteInfo}
                                    </div>
                                  </td>

                                  <td className="py-3 px-4 text-right font-black text-slate-900 dark:text-white text-xs">
                                    {prod.menorPreco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                  </td>

                                  <td className="py-3 px-4 text-center">
                                    <input
                                      type="number"
                                      min="0"
                                      placeholder="0"
                                      value={qtdAtual === 0 ? '' : qtdAtual}
                                      onChange={e => handleMudarQuantidade(prod.produtoNormalizado, e.target.value)}
                                      className={`w-24 px-3 py-1.5 rounded-xl border text-center font-black text-xs transition-all focus:outline-none focus:ring-2 focus:ring-red-500/20 ${
                                        temQtd
                                          ? 'border-emerald-500 bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 ring-2 ring-emerald-500/10'
                                          : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200'
                                      }`}
                                    />
                                  </td>

                                  <td className="py-3 px-4 text-right font-black text-xs">
                                    {subtotal > 0 ? (
                                      <span className="text-emerald-600 dark:text-emerald-400 text-sm">
                                        {subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 dark:text-slate-600">-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Rodapé da Tabela do Fornecedor com Totalizador */}
                      <div className="p-4 md:px-6 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400 font-bold">
                          <span>Total de itens no fornecedor: <b>{bloco.totalItens}</b></span>
                          <span>•</span>
                          <span>Com quantidade preenchida: <b className="text-emerald-600 dark:text-emerald-400">{m.itensComQtd}</b></span>
                          <span>•</span>
                          <span>Unidades: <b>{m.unidadesTotal}</b></span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-bold text-slate-600 dark:text-slate-300">
                            Total {bloco.fornecedor}:
                          </span>
                          <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                            {m.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                          <button
                            onClick={() => handleCopiarFornecedor(bloco.fornecedor)}
                            className="ml-2 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black uppercase transition-all cursor-pointer"
                          >
                            {copiadoFornecedor[bloco.fornecedor] ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            Copiar Pedido Limpo
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pré-visualização do Texto Limpo que será enviado */}
              <div className="p-5 rounded-3xl bg-slate-900 text-slate-100 font-mono text-xs border border-slate-800 shadow-md space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="text-[11px] font-bold text-slate-400 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    Prévia do Texto Limpo para WhatsApp (Apenas Produto, Quantidade, Unitário e Totais)
                  </span>

                  <button
                    onClick={handleCopiarTudo}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95"
                  >
                    {copiadoGeral ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiadoGeral ? 'Copiado!' : 'Copiar Texto Completo Limpo'}
                  </button>
                </div>

                <pre className="whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-64 p-3 bg-slate-950 rounded-xl text-emerald-300 font-mono text-[11px]">
                  {gerarTextoLimpoConsolidado()}
                </pre>
              </div>

            </div>
          )}
        </div>

        {/* Footer do Modal */}
        <div className="p-4 md:px-7 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between text-xs text-slate-400 font-medium">
          <span>O texto copiado contém apenas o produto, a quantidade digitada, o preço unitário e os totalizadores.</span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-black transition-all cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
