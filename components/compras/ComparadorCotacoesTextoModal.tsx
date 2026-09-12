import React, { useState, useMemo, useEffect } from 'react';
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
  Square,
  CheckCircle2,
  HardDrive,
  Trash2,
  HelpCircle,
  Zap,
  ChevronRight,
  ChevronLeft,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  RotateCcw
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

/**
 * Normaliza termos farmacêuticos e sinônimos conhecidos
 */
function normalizarTermoFarmaceutico(s: string): string {
  let n = s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const sinonimos: Record<string, string> = {
    'HIDRO': 'HIDROCLOROTIAZIDA',
    'ROSUVA': 'ROSUVASTATINA',
    'ATORVA': 'ATORVASTATINA',
    'BENEGRIPE': 'BENEGRIP',
    'CLENIL': 'BECLOMETASONA',
    'DIENOGEST': 'DIENOGESTE',
    'NARATANO': 'NARATRIPTANA',
    'ACUFRESH': 'CARMELOSE'
  };
  for (const [k, v] of Object.entries(sinonimos)) {
    n = n.replace(new RegExp(`\\b${k}\\b`, 'g'), v);
  }
  return n;
}

/**
 * Calcula a probabilidade (0.0 a 1.0) de dois textos representarem o mesmo produto farmacêutico.
 * Considera regras farmacêuticas estritas: via de administração, dosagem numérica, quantidade de comprimidos
 * e correspondência da molécula ativa para evitar falsos positivos.
 */
function calcularSimilaridadeStrings(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  const norm1 = normalizarTermoFarmaceutico(s1);
  const norm2 = normalizarTermoFarmaceutico(s2);
  if (norm1 === norm2) return 1.0;

  // 1. Vias incompatíveis (ex: vaginal vs oral)
  const ehVag1 = /\b(VAG|VAGINAL|OVULO|OVULOS)\b/i.test(norm1);
  const ehVag2 = /\b(VAG|VAGINAL|OVULO|OVULOS)\b/i.test(norm2);
  if (ehVag1 !== ehVag2 && (ehVag1 || ehVag2)) return 0;

  const ehOral1 = /\b(ORAL|GTS|GOTAS|SUSP)\b/i.test(norm1);
  const ehOral2 = /\b(ORAL|GTS|GOTAS|SUSP)\b/i.test(norm2);
  if (ehOral1 !== ehOral2 && (ehOral1 || ehOral2) && (ehVag1 || ehVag2)) return 0;

  // 2. Apresentações de unidades diferentes (ex: 15cp vs 30cp não podem unificar)
  const qtdCp1 = norm1.match(/\b(2|4|8|10|12|14|15|20|21|28|30|50|60)\s*(?:CP|CPR|CPS|COMP|DRG|UNI)\b/i)?.[1]
              || norm1.match(/\bC\/?\s*(2|4|8|10|12|14|15|20|21|28|30|50|60)\b/i)?.[1]
              || norm1.match(/\bC(15|30|60)\b/i)?.[1];
  const qtdCp2 = norm2.match(/\b(2|4|8|10|12|14|15|20|21|28|30|50|60)\s*(?:CP|CPR|CPS|COMP|DRG|UNI)\b/i)?.[1]
              || norm2.match(/\bC\/?\s*(2|4|8|10|12|14|15|20|21|28|30|50|60)\b/i)?.[1]
              || norm2.match(/\bC(15|30|60)\b/i)?.[1];

  if (qtdCp1 && qtdCp2 && qtdCp1 !== qtdCp2) {
    return 0;
  }

  // 3. Dosagens com unidades (ex: 50mcg vs 200mcg)
  const doseFmt1 = norm1.match(/\b\d+(?:[\.,]\d+)?\s*(?:MG|G|ML|MCG)\b/i)?.[0]?.replace(/\s+/g, '')?.replace(',', '.');
  const doseFmt2 = norm2.match(/\b\d+(?:[\.,]\d+)?\s*(?:MG|G|ML|MCG)\b/i)?.[0]?.replace(/\s+/g, '')?.replace(',', '.');
  if (doseFmt1 && doseFmt2 && doseFmt1 !== doseFmt2) {
    return 0;
  }

  // Dosagens numéricas puras (ex: Betaistina 16 vs Betaistina 24)
  const numDose1 = norm1.match(/\b(16|20|24|25|30|40|50|60|75|100|150|200|500|600|850)\b/)?.[1];
  const numDose2 = norm2.match(/\b(16|20|24|25|30|40|50|60|75|100|150|200|500|600|850)\b/)?.[1];
  if (numDose1 && numDose2 && numDose1 !== numDose2) {
    return 0;
  }

  const palavrasIgnoradas = new Set([
    'COMP', 'COMPRIMIDO', 'COMPRIMIDOS', 'CAPS', 'CAPSULA', 'CAPSULAS',
    'CPR', 'CPS', 'GENERICO', 'GENÉRICO', 'SIMILAR', 'DRG', 'DRAGEAS',
    'MEDLEY', 'EMS', 'EUROFARMA', 'NEO', 'QUIMICA', 'TEUTO', 'SANDOZ',
    'LEGRAND', 'ACHE', 'NOVAQUIMICA', 'GERMED', 'PRATI', 'CIMED', 'UNICHEM',
    'MEDQUIMICA', 'BIOSINTETICA', 'MULTILAB', 'PHARLAB', 'NATIVITA', 'GEOLAB',
    'VITAMEDIC', 'GREENPHARMA', 'GLEN', 'BRASTERAPICA', 'FORTLIFE', 'SOL', 'OFT',
    'GTS', 'CREME', 'POMADA', 'GEL', 'XPE', 'SUSP', 'DE', 'DO', 'DA', 'C/', 'COM',
    'C15', 'C30', 'C60', 'BLX30', 'ORIGIN', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
    'ADESIVO', 'SEM', 'SABOR'
  ]);

  // Remove números e unidades para isolar o nome da substância / medicamento
  const limpa1 = norm1.replace(/\b\d+(?:[\.,]\d+)?\s*(?:MG|G|ML|MCG|CP|CPR|CPS|COMP|DRG|UNI)\b/gi, ' ')
                      .replace(/\b\d+\b/g, ' ')
                      .replace(/[^A-Z]/g, ' ');
  const limpa2 = norm2.replace(/\b\d+(?:[\.,]\d+)?\s*(?:MG|G|ML|MCG|CP|CPR|CPS|COMP|DRG|UNI)\b/gi, ' ')
                      .replace(/\b\d+\b/g, ' ')
                      .replace(/[^A-Z]/g, ' ');

  const moleculas1 = limpa1.split(/\s+/).filter(w => w.length >= 3 && !palavrasIgnoradas.has(w));
  const moleculas2 = limpa2.split(/\s+/).filter(w => w.length >= 3 && !palavrasIgnoradas.has(w));

  if (moleculas1.length === 0 || moleculas2.length === 0) return 0;

  // Garante que há correspondência da substância ativa
  const temMoleculaComum = moleculas1.some(m1 => moleculas2.some(m2 => m1 === m2 || (m1.length >= 5 && m2.length >= 5 && (m1.startsWith(m2) || m2.startsWith(m1)))));
  if (!temMoleculaComum) return 0;

  const set1 = new Set(moleculas1);
  const set2 = new Set(moleculas2);
  let inter = 0;
  for (const t of set1) if (set2.has(t)) inter++;
  const uniao = new Set([...set1, ...set2]).size;
  const scoreBase = inter / uniao;

  // Bônus se dosagens declaradas forem exatamente compatíveis
  let bonus = 0.3;
  if (doseFmt1 && doseFmt2 && doseFmt1 === doseFmt2) bonus += 0.2;
  if (numDose1 && numDose2 && numDose1 === numDose2) bonus += 0.2;

  return Math.min(1.0, scoreBase + bonus);
}

export const ComparadorCotacoesTextoModal: React.FC<ComparadorCotacoesTextoModalProps> = ({
  isOpen,
  onClose,
  theme,
  onCriarCotacaoOficial
}) => {
  const { addToast } = useToast();
  const CACHE_STORAGE_KEY = 'belafarma_cotacao_texto_cache_v2';

  const [texto, setTexto] = useState('');
  const [usarIA, setUsarIA] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState<any | null>(null);

  // Quantidades digitadas pelo comprador por chave de produto
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});

  // Fornecedor ativo para visualização na tabela ('TODOS' ou nome específico)
  const [fornecedorFiltro, setFornecedorFiltro] = useState<string>('TODOS');

  // Estados de feedback de cópia
  const [copiadoGeral, setCopiadoGeral] = useState(false);
  const [copiadoFornecedor, setCopiadoFornecedor] = useState<Record<string, boolean>>({});

  // Opção de formatação de pedido: 'completo' (com preços e totais) ou 'resumido' (somente produto e quantidade)
  const [formatoTextoPedido, setFormatoTextoPedido] = useState<'completo' | 'resumido'>('completo');

  // Unificações confirmadas e rejeitadas pelo Quiz de Similaridade
  // Ex: { "LAMOTRIGINA 100MG 30CP UNICHEM": "LAMOTRIGINA 100MG" }
  const [unificacoesConfirmadas, setUnificacoesConfirmadas] = useState<Record<string, string>>({});
  const [unificacoesRejeitadas, setUnificacoesRejeitadas] = useState<Record<string, boolean>>({});
  const [quizAberto, setQuizAberto] = useState(true);
  const [quizIndice, setQuizIndice] = useState(0);

  // Estados de Cache / Auto-Save para segurança contra quedas do sistema
  const [ultimoSalvamento, setUltimoSalvamento] = useState<string | null>(null);
  const [cacheRestaurado, setCacheRestaurado] = useState(false);
  const [carregouCacheInicial, setCarregouCacheInicial] = useState(false);

  // 1. Restaura dados salvos em cache do localStorage na montagem
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && (data.texto || data.resultado || (data.quantidades && Object.keys(data.quantidades).length > 0))) {
          if (data.texto) setTexto(data.texto);
          if (data.resultado) setResultado(data.resultado);
          if (data.quantidades) setQuantidades(data.quantidades);
          if (data.fornecedorFiltro) setFornecedorFiltro(data.fornecedorFiltro);
          if (data.unificacoesConfirmadas) setUnificacoesConfirmadas(data.unificacoesConfirmadas);
          if (data.unificacoesRejeitadas) setUnificacoesRejeitadas(data.unificacoesRejeitadas);
          if (data.formatoTextoPedido) setFormatoTextoPedido(data.formatoTextoPedido);
          if (data.salvoEm) setUltimoSalvamento(data.salvoEm);
          setCacheRestaurado(true);
        }
      }
    } catch (err) {
      console.warn('Erro ao restaurar cache de cotações:', err);
    } finally {
      setCarregouCacheInicial(true);
    }
  }, []);

  // 2. Salva automaticamente no cache do navegador a cada alteração
  useEffect(() => {
    if (!carregouCacheInicial) return;

    const timer = setTimeout(() => {
      try {
        const totalItensPreenchidos = Object.values(quantidades).filter(v => (v || 0) > 0).length;
        if (texto.trim() || resultado || totalItensPreenchidos > 0) {
          const agora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const payload = {
            texto,
            resultado,
            quantidades,
            fornecedorFiltro,
            unificacoesConfirmadas,
            unificacoesRejeitadas,
            formatoTextoPedido,
            salvoEm: agora,
            totalItensPreenchidos
          };
          localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(payload));
          setUltimoSalvamento(agora);
        }
      } catch (err) {
        console.warn('Erro ao salvar cache de cotações:', err);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [texto, resultado, quantidades, fornecedorFiltro, unificacoesConfirmadas, unificacoesRejeitadas, formatoTextoPedido, carregouCacheInicial]);

  const handleColarTexto = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (clipboardText && clipboardText.trim()) {
        setTexto(clipboardText.trim());
        addToast('📋 Texto colado da área de transferência!', 'success');
      } else {
        addToast('A área de transferência está vazia.', 'info');
      }
    } catch (err: any) {
      addToast('Não foi possível ler a área de transferência automaticamente. Cole usando Ctrl+V.', 'warning');
    }
  };

  const handleCarregarExemplo = () => {
    setTexto(TEXTO_EXEMPLO);
    addToast('Exemplo carregado na área de texto.', 'info');
  };

  const handleLimpar = () => {
    setTexto('');
    setResultado(null);
    setQuantidades({});
    setFornecedorFiltro('TODOS');
    setUnificacoesConfirmadas({});
    setUnificacoesRejeitadas({});
    setQuizIndice(0);
    setUltimoSalvamento(null);
    setCacheRestaurado(false);
    try {
      localStorage.removeItem(CACHE_STORAGE_KEY);
    } catch (err) {}
    addToast('Campos e rascunho em cache limpos.', 'info');
  };

  // Consulta lote de estoque via API para enriquecer resultados locais
  const enriquecerProdutosComEstoque = async (itens: any[]) => {
    try {
      const produtosNomes = itens.map(i => i.produto || i.produtoNormalizado);
      const res = await fetch('/api/central-compras/cotacoes/consultar-estoque-lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produtos: produtosNomes })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const mapaEstoque = json.data;
          itens.forEach(item => {
            const nome = item.produto || item.produtoNormalizado;
            const estoque = mapaEstoque[nome] || mapaEstoque[item.produtoNormalizado];
            if (estoque) {
              let variacaoVsUltimaCompra = null;
              if (estoque.valorUltimaCompra > 0 && item.menorPreco > 0) {
                variacaoVsUltimaCompra = ((item.menorPreco - estoque.valorUltimaCompra) / estoque.valorUltimaCompra) * 100;
              }
              item.estoqueInfo = {
                ...estoque,
                variacaoVsUltimaCompra: variacaoVsUltimaCompra !== null ? Number(variacaoVsUltimaCompra.toFixed(1)) : null
              };
            }
          });
        }
      }
    } catch (e) {
      console.warn('Não foi possível carregar dados de estoque em lote:', e);
    }
  };

  // Parser local embutido para execução instantânea sem depender de rede
  const executarComparativoLocal = (textoParaProcessar: string) => {
    const PALAVRAS_NAO_FORNECEDOR = new Set([
      'COMP', 'COMPRIMIDO', 'COMPRIMIDOS', 'CAPS', 'CAPSULA', 'CAPSULAS', 'CPR', 'CPS',
      'COLIRIO', 'COLÍRIO', 'GOTAS', 'GTS', 'CREME', 'POMADA', 'GEL',
      'XAROPE', 'XPE', 'SUSP', 'SUSPENSAO', 'SUSPENSÃO', 'SOL', 'SOLUCAO', 'SOLUÇÃO',
      'OFT', 'OFTALMICO', 'VAG', 'VAGINAL', 'DERM', 'DERMATOLOGICO',
      'INJETAVEL', 'AMPOLA', 'SPRAY', 'AEROSOL', 'ENEMA', 'SUPOSITORIO'
    ]);

    const ehFornecedor = (linha: string) => {
      const t = linha.trim();
      if (!t || t.length < 2 || t.length > 40 || /\d/.test(t) || /R\$|[\,\.]\d{2}/.test(t)) return false;
      if (/^(?:FORNECEDOR|DISTRIBUIDORA|DISTRIB|COTACAO|REP|REPRESENTANTE|EMPRESA)\s*[:\-_]/i.test(t)) return true;
      const partes = t.toUpperCase().split(/\s+/);
      for (const p of partes) {
        if (PALAVRAS_NAO_FORNECEDOR.has(p)) return false;
      }
      return true;
    };

    const extrairPreco = (linha: string) => {
      const match = linha.match(/(?:R\$\s*)?(\d+(?:[\.,]\d{2,}))(?!\d)/i);
      if (!match) return null;
      let p = match[1];
      if (p.includes(',') && p.includes('.')) p = p.replace(/\./g, '').replace(',', '.');
      else if (p.includes(',')) p = p.replace(',', '.');
      const num = parseFloat(p);
      return isNaN(num) || num <= 0 ? null : { preco: num, matchStr: match[0] };
    };

    const normalizar = (s: string) => {
      let n = s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const sinonimos: Record<string, string> = {
        'HIDRO': 'HIDROCLOROTIAZIDA',
        'ROSUVA': 'ROSUVASTATINA',
        'ATORVA': 'ATORVASTATINA',
        'BENEGRIPE': 'BENEGRIP'
      };
      for (const [k, v] of Object.entries(sinonimos)) {
        n = n.replace(new RegExp(`\\b${k}\\b`, 'g'), v);
      }
      n = n.replace(/\b(\d+)\s*(MG|G|ML|MCG)\b/g, '$1$2');
      n = n.replace(/\b(\d+)\s*(?:CP|CPR|CPS|COMP|COMPRIMIDOS|CAPS|CAPSULAS|DRG)\b/g, '');
      n = n.replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
      return n;
    };

    const linhas = textoParaProcessar.split(/\r?\n/);
    let fornecedorAtual = 'GERAL';
    const fornecedoresMap = new Map<string, Array<{ produto: string; produtoNormalizado: string; preco: number }>>();

    for (const linha of linhas) {
      const t = linha.trim();
      if (!t) continue;

      if (ehFornecedor(t)) {
        fornecedorAtual = t.replace(/^(?:FORNECEDOR|DISTRIBUIDORA|DISTRIB|COTACAO|REP|REPRESENTANTE|EMPRESA)\s*[:\-_]\s*/i, '').trim().toUpperCase();
        if (!fornecedoresMap.has(fornecedorAtual)) fornecedoresMap.set(fornecedorAtual, []);
        continue;
      }

      const infoPreco = extrairPreco(t);
      if (infoPreco) {
        let nomeProd = t.replace(infoPreco.matchStr, '').replace(/[-–—:]+$/, '').trim();
        if (nomeProd.length >= 2) {
          if (!fornecedoresMap.has(fornecedorAtual)) fornecedoresMap.set(fornecedorAtual, []);
          fornecedoresMap.get(fornecedorAtual)!.push({
            produto: nomeProd,
            produtoNormalizado: normalizar(nomeProd),
            preco: infoPreco.preco
          });
        }
      }
    }

    const ofertasPorProduto = new Map<string, { produtoExibicao: string; ofertas: Array<{ fornecedor: string; preco: number }> }>();
    for (const [forn, prods] of fornecedoresMap.entries()) {
      for (const p of prods) {
        if (!ofertasPorProduto.has(p.produtoNormalizado)) {
          ofertasPorProduto.set(p.produtoNormalizado, { produtoExibicao: p.produto, ofertas: [] });
        }
        ofertasPorProduto.get(p.produtoNormalizado)!.ofertas.push({ fornecedor: forn, preco: p.preco });
      }
    }

    const itensComparados: any[] = [];
    const vencedoresPorFornecedor = new Map<string, any[]>();
    let economiaTotal = 0;

    for (const [k, g] of ofertasPorProduto.entries()) {
      g.ofertas.sort((a, b) => a.preco - b.preco);
      const melhor = g.ofertas[0];
      const concorrentes = g.ofertas.slice(1);

      let concorrenteInfo = '';
      if (concorrentes.length > 0) {
        const segundo = concorrentes[0];
        const dif = segundo.preco - melhor.preco;
        const perc = (dif / melhor.preco) * 100;
        economiaTotal += dif;
        concorrenteInfo = `Melhor preço vs ${segundo.fornecedor} R$ ${segundo.preco.toFixed(2)} (+${perc.toFixed(1)}%)`;
      }

      const itemRes = {
        produto: g.produtoExibicao,
        produtoNormalizado: k,
        vencedor: melhor.fornecedor,
        menorPreco: melhor.preco,
        concorrenteInfo,
        ofertas: g.ofertas
      };

      itensComparados.push(itemRes);
      if (!vencedoresPorFornecedor.has(melhor.fornecedor)) {
        vencedoresPorFornecedor.set(melhor.fornecedor, []);
      }
      vencedoresPorFornecedor.get(melhor.fornecedor)!.push(itemRes);
    }

    const fornecedoresResumo = Array.from(vencedoresPorFornecedor.entries()).map(([fornecedor, produtos]) => ({
      fornecedor,
      totalItens: produtos.length,
      produtos
    }));

    return {
      success: true,
      estatisticas: {
        totalFornecedores: fornecedoresMap.size,
        totalOfertas: Array.from(fornecedoresMap.values()).reduce((acc, l) => acc + l.length, 0),
        totalProdutosUnicos: itensComparados.length,
        economiaTotalEstimada: economiaTotal
      },
      fornecedoresEncontrados: Array.from(fornecedoresMap.keys()),
      itensComparados,
      fornecedoresResumo
    };
  };

  const handleProcessar = async () => {
    if (!texto.trim()) {
      addToast('Cole o texto com as cotações para comparar.', 'warning');
      return;
    }

    try {
      setProcessando(true);
      // Tenta via backend
      const res = await fetch('/api/central-compras/cotacoes/comparar-texto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texto,
          usarIA,
          quantidades
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.fornecedoresResumo?.length > 0) {
          setResultado(data);
          addToast(`✅ Cotações analisadas! ${data.fornecedoresEncontrados?.length || 0} fornecedores separados com histórico de compras.`, 'success');
          return;
        }
      }
      // Fallback: executa comparativo local e enriquece com dados de estoque
      const dataLocal = executarComparativoLocal(texto);
      await enriquecerProdutosComEstoque(dataLocal.itensComparados);
      setResultado(dataLocal);
      addToast(`✅ Cotações processadas localmente! ${dataLocal.fornecedoresEncontrados?.length || 0} fornecedores separados.`, 'success');
    } catch (err: any) {
      const dataLocal = executarComparativoLocal(texto);
      await enriquecerProdutosComEstoque(dataLocal.itensComparados);
      setResultado(dataLocal);
      addToast(`✅ Processado com o motor local (${dataLocal.fornecedoresEncontrados?.length || 0} fornecedores).`, 'info');
    } finally {
      setProcessando(false);
      setQuizIndice(0);
    }
  };

  const handleMudarQuantidade = (chave: string, val: string) => {
    const num = val === '' ? 0 : parseInt(val, 10);
    setQuantidades(prev => ({
      ...prev,
      [chave]: isNaN(num) || num < 0 ? 0 : num
    }));
  };

  // Recalcula o resultado aplicando as unificações confirmadas no Quiz de Similaridade
  const resultadoConsolidado = useMemo(() => {
    if (!resultado || !resultado.itensComparados) return resultado;
    if (Object.keys(unificacoesConfirmadas).length === 0) return resultado;

    const itensAgrupados = new Map<string, any>();

    for (const item of resultado.itensComparados) {
      // Usa a chave canônica se foi unificado
      const chaveCanonica = unificacoesConfirmadas[item.produtoNormalizado] || item.produtoNormalizado;

      if (!itensAgrupados.has(chaveCanonica)) {
        itensAgrupados.set(chaveCanonica, {
          ...item,
          produtoNormalizado: chaveCanonica,
          todasOfertas: [...(item.ofertas || [{ fornecedor: item.vencedor, preco: item.menorPreco }])]
        });
      } else {
        const existente = itensAgrupados.get(chaveCanonica)!;
        existente.todasOfertas.push(...(item.ofertas || [{ fornecedor: item.vencedor, preco: item.menorPreco }]));
        // Preserva o melhor estoqueInfo
        if (!existente.estoqueInfo && item.estoqueInfo) {
          existente.estoqueInfo = item.estoqueInfo;
        }
      }
    }

    const novosItensComparados: any[] = [];
    const vencedoresPorFornecedor = new Map<string, any[]>();
    let economiaTotal = 0;

    for (const [chave, itemData] of itensAgrupados.entries()) {
      itemData.todasOfertas.sort((a: any, b: any) => a.preco - b.preco);
      const melhor = itemData.todasOfertas[0];
      const concorrentes = itemData.todasOfertas.slice(1);

      let concorrenteInfo = '';
      if (concorrentes.length > 0) {
        const segundo = concorrentes[0];
        const dif = segundo.preco - melhor.preco;
        const perc = (dif / melhor.preco) * 100;
        economiaTotal += dif;
        concorrenteInfo = `Melhor preço vs ${segundo.fornecedor} R$ ${segundo.preco.toFixed(2)} (+${perc.toFixed(1)}%)`;
      }

      const itemFinal = {
        ...itemData,
        produtoNormalizado: chave,
        vencedor: melhor.fornecedor,
        menorPreco: melhor.preco,
        concorrenteInfo
      };

      novosItensComparados.push(itemFinal);

      if (!vencedoresPorFornecedor.has(melhor.fornecedor)) {
        vencedoresPorFornecedor.set(melhor.fornecedor, []);
      }
      vencedoresPorFornecedor.get(melhor.fornecedor)!.push(itemFinal);
    }

    const novosFornecedoresResumo = Array.from(vencedoresPorFornecedor.entries()).map(([fornecedor, produtos]) => ({
      fornecedor,
      totalItens: produtos.length,
      produtos
    }));

    return {
      ...resultado,
      estatisticas: {
        ...resultado.estatisticas,
        totalProdutosUnicos: novosItensComparados.length,
        economiaTotalEstimada: economiaTotal
      },
      itensComparados: novosItensComparados,
      fornecedoresResumo: novosFornecedoresResumo
    };
  }, [resultado, unificacoesConfirmadas]);

  // Detector de candidatos para o Quiz de Similaridade
  const candidatosQuiz = useMemo(() => {
    if (!resultado || !resultado.itensComparados || resultado.itensComparados.length < 2) return [];

    const itens = resultado.itensComparados;
    const listaCandidatos: any[] = [];
    const paresVistos = new Set<string>();

    for (let i = 0; i < itens.length; i++) {
      for (let j = i + 1; j < itens.length; j++) {
        const itemA = itens[i];
        const itemB = itens[j];

        if (itemA.produtoNormalizado === itemB.produtoNormalizado) continue;

        const parId = [itemA.produtoNormalizado, itemB.produtoNormalizado].sort().join('||');
        if (paresVistos.has(parId)) continue;
        paresVistos.add(parId);

        // Se já unificado ou rejeitado, ignora
        if (unificacoesConfirmadas[itemA.produtoNormalizado] || unificacoesConfirmadas[itemB.produtoNormalizado]) continue;
        if (unificacoesRejeitadas[parId]) continue;

        const sim = calcularSimilaridadeStrings(itemA.produto, itemB.produto);

        if (sim >= 0.65) {
          const precoA = itemA.menorPreco;
          const precoB = itemB.menorPreco;
          const menor = precoA <= precoB ? itemA : itemB;
          const maior = precoA <= precoB ? itemB : itemA;
          const difPerc = menor.menorPreco > 0 ? ((maior.menorPreco - menor.menorPreco) / menor.menorPreco) * 100 : 0;

          listaCandidatos.push({
            id: parId,
            chaveA: itemA.produtoNormalizado,
            chaveB: itemB.produtoNormalizado,
            itemA,
            itemB,
            score: Math.round(sim * 100),
            vencedorPreco: menor.vencedor,
            menorPreco: menor.menorPreco,
            maiorPreco: maior.menorPreco,
            economiaPerc: Number(difPerc.toFixed(1))
          });
        }
      }
    }

    return listaCandidatos.sort((a, b) => b.score - a.score);
  }, [resultado, unificacoesConfirmadas, unificacoesRejeitadas]);

  // Ações do Quiz de Similaridade
  const handleConfirmarUnificacao = (par: any) => {
    // Unifica B em A (elege A como canônico)
    setUnificacoesConfirmadas(prev => ({
      ...prev,
      [par.chaveB]: par.chaveA
    }));
    addToast(`✅ Produtos unificados! Menor preço eleito: ${par.vencedorPreco} por R$ ${par.menorPreco.toFixed(2)}`, 'success');
    if (quizIndice >= candidatosQuiz.length - 1) {
      setQuizIndice(Math.max(0, candidatosQuiz.length - 2));
    }
  };

  const handleRejeitarUnificacao = (par: any) => {
    setUnificacoesRejeitadas(prev => ({
      ...prev,
      [par.id]: true
    }));
    addToast('Produtos mantidos separados nas tabelas.', 'info');
    if (quizIndice >= candidatosQuiz.length - 1) {
      setQuizIndice(Math.max(0, candidatosQuiz.length - 2));
    }
  };

  const handleUnificarTodosCerteza = () => {
    const certas = candidatosQuiz.filter(c => c.score >= 80);
    if (certas.length === 0) {
      addToast('Nenhum par com certeza >= 80% pendente.', 'info');
      return;
    }

    const novasUnificacoes: Record<string, string> = { ...unificacoesConfirmadas };
    certas.forEach(par => {
      novasUnificacoes[par.chaveB] = par.chaveA;
    });

    setUnificacoesConfirmadas(novasUnificacoes);
    addToast(`⚡ ${certas.length} pares de produtos unificados com sucesso!`, 'success');
  };

  // Preenchimento automático com a sugestão de compra de 30 dias
  const handleAplicarSugestoes30d = () => {
    if (!resultadoConsolidado || !resultadoConsolidado.fornecedoresResumo) return;
    let preenchidos = 0;
    const novasQtds = { ...quantidades };

    for (const bloco of resultadoConsolidado.fornecedoresResumo) {
      for (const prod of (bloco.produtos || [])) {
        const sug = prod.estoqueInfo?.qtdSugerida30d;
        if (typeof sug === 'number' && sug > 0) {
          novasQtds[prod.produtoNormalizado] = sug;
          preenchidos++;
        }
      }
    }

    if (preenchidos === 0) {
      addToast('Nenhum produto necessita de reposição para 30 dias (o estoque atual já cobre o giro).', 'info');
      return;
    }

    setQuantidades(novasQtds);
    addToast(`⚡ ${preenchidos} produtos foram preenchidos com a sugestão calculada para 30 dias de giro!`, 'success');
  };

  // Métricas e totais calculados
  const metricasFornecedores = useMemo(() => {
    if (!resultadoConsolidado || !resultadoConsolidado.fornecedoresResumo) return {};

    const mapa: Record<string, { totalItens: number; itensComQtd: number; valorTotal: number; unidadesTotal: number }> = {};
    let geralValor = 0;
    let geralUnidades = 0;
    let geralItensComQtd = 0;

    for (const bloco of resultadoConsolidado.fornecedoresResumo) {
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
        totalItens: bloco.totalItens,
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
  }, [resultadoConsolidado, quantidades]);

  /**
   * Gera o texto LIMPO individual por fornecedor:
   * REGRA ESTRITA: Apenas produtos com quantidade preenchida (> 0) são incluídos!
   * Produtos sem quantidade são estritamente IGNORADOS.
   */
  /**
   * Gera o texto LIMPO formatado de um fornecedor específico para envio no WhatsApp.
   * Filtra APENAS produtos que têm quantidade > 0.
   * Suporta dois formatos:
   * - 'completo': Inclui Qtd, Preço Unitário, Subtotal e Valor Total do Pedido
   * - 'resumido': Inclui somente o Nome do Produto e a Quantidade (sem preços), mais o resumo de itens e unidades
   */
  const gerarTextoLimpoFornecedor = (fornecedorNome: string, formato: 'completo' | 'resumido' = formatoTextoPedido) => {
    if (!resultadoConsolidado || !resultadoConsolidado.fornecedoresResumo) return '';
    const bloco = resultadoConsolidado.fornecedoresResumo.find((f: any) => f.fornecedor === fornecedorNome);
    if (!bloco) return '';

    // Filtra estritamente os produtos com quantidade preenchida > 0
    const produtosComQtd = (bloco.produtos || []).filter((p: any) => {
      const qtd = quantidades[p.produtoNormalizado];
      return typeof qtd === 'number' && qtd > 0;
    });

    if (produtosComQtd.length === 0) {
      return `PEDIDO DE COMPRA - ${fornecedorNome}\n(Nenhum produto com quantidade preenchida)`;
    }

    let textoOut = `PEDIDO DE COMPRA - ${fornecedorNome}\n`;
    textoOut += `--------------------------------------------------\n`;

    let totalGeralFornecedor = 0;
    let totalUnidadesFornecedor = 0;

    produtosComQtd.forEach((item: any, idx: number) => {
      const num = String(idx + 1).padStart(2, '0');
      const qtd = quantidades[item.produtoNormalizado] || 0;
      const precoUnit = item.menorPreco;
      const subtotal = qtd * precoUnit;

      totalGeralFornecedor += subtotal;
      totalUnidadesFornecedor += qtd;

      textoOut += `${num}. ${item.produto}\n`;
      if (formato === 'resumido') {
        textoOut += `    Qtd: ${qtd} un\n`;
      } else {
        const unitFormatado = precoUnit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const subtotalFormatado = subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        textoOut += `    Qtd: ${qtd} un | Unit: ${unitFormatado} | Subtotal: ${subtotalFormatado}\n`;
      }
    });

    textoOut += `--------------------------------------------------\n`;
    textoOut += `Itens com pedido: ${produtosComQtd.length} (${totalUnidadesFornecedor} unidades no total)\n`;
    textoOut += `VALOR TOTAL DO PEDIDO: ${totalGeralFornecedor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n`;

    return textoOut;
  };

  /**
   * Gera o texto LIMPO consolidado de TODOS os fornecedores com pedido (>0).
   */
  const gerarTextoLimpoConsolidado = (formato: 'completo' | 'resumido' = formatoTextoPedido) => {
    if (!resultadoConsolidado || !resultadoConsolidado.fornecedoresResumo) return '';

    const fornecedoresAtivos = resultadoConsolidado.fornecedoresResumo.filter((f: any) =>
      (f.produtos || []).some((p: any) => (quantidades[p.produtoNormalizado] || 0) > 0)
    );

    if (fornecedoresAtivos.length === 0) {
      return `Nenhum produto possui quantidade preenchida ainda.\nPreencha as quantidades desejadas nas tabelas acima para gerar os pedidos limpos por fornecedor.`;
    }

    const blocos = fornecedoresAtivos.map((f: any) => gerarTextoLimpoFornecedor(f.fornecedor, formato));
    let textoTotal = blocos.join('\n\n==================================================\n\n');

    const metricas = metricasFornecedores.geral;
    if (metricas && metricas.unidadesTotal > 0) {
      textoTotal += `\n\n==================================================\n`;
      textoTotal += `RESUMO GERAL CONSOLIDADO DE COMPRAS\n`;
      textoTotal += `Fornecedores com pedidos: ${fornecedoresAtivos.length}\n`;
      textoTotal += `Total de itens pedidos: ${metricas.itensComQtd}\n`;
      textoTotal += `Total geral de unidades: ${metricas.unidadesTotal}\n`;
      if (metricas.valorTotal > 0) {
        textoTotal += `VALOR TOTAL GERAL: ${metricas.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n`;
      }
      textoTotal += `==================================================\n`;
    }

    return textoTotal;
  };

  const handleCopiarFornecedor = (fornecedorNome: string, formatoForcado?: 'completo' | 'resumido') => {
    const formato = formatoForcado || formatoTextoPedido;
    const bloco = resultadoConsolidado?.fornecedoresResumo?.find((f: any) => f.fornecedor === fornecedorNome);
    const itensComQtd = (bloco?.produtos || []).filter((p: any) => (quantidades[p.produtoNormalizado] || 0) > 0);

    if (itensComQtd.length === 0) {
      addToast(`⚠️ Nenhum produto de ${fornecedorNome} tem quantidade preenchida. Digite a quantidade na tabela antes de copiar.`, 'warning');
      return;
    }

    const textoLimpo = gerarTextoLimpoFornecedor(fornecedorNome, formato);
    const chaveFeedback = `${fornecedorNome}_${formato}`;
    navigator.clipboard.writeText(textoLimpo).then(() => {
      setCopiadoFornecedor(prev => ({ ...prev, [chaveFeedback]: true, [fornecedorNome]: true }));
      setTimeout(() => setCopiadoFornecedor(prev => ({ ...prev, [chaveFeedback]: false, [fornecedorNome]: false })), 2000);
      const desc = formato === 'resumido' ? 'somente produtos e quantidades' : 'com valores';
      addToast(`📋 Pedido (${desc}) de ${fornecedorNome} copiado! (${itensComQtd.length} itens)`, 'success');
    }).catch(() => {
      addToast('Não foi possível copiar automaticamente para a área de transferência.', 'error');
    });
  };

  const handleCopiarTudo = (formatoForcado?: 'completo' | 'resumido') => {
    const formato = formatoForcado || formatoTextoPedido;
    const totalItens = Object.values(quantidades).filter(v => (v || 0) > 0).length;
    if (totalItens === 0) {
      addToast('⚠️ Nenhum produto possui quantidade preenchida ainda.', 'warning');
      return;
    }

    const textoLimpo = gerarTextoLimpoConsolidado(formato);
    navigator.clipboard.writeText(textoLimpo).then(() => {
      setCopiadoGeral(true);
      setTimeout(() => setCopiadoGeral(false), 2000);
      const desc = formato === 'resumido' ? 'somente produtos e quantidades' : 'com valores';
      addToast(`📋 Pedidos consolidados (${desc}) copiados (${totalItens} itens)!`, 'success');
    }).catch(() => {
      addToast('Não foi possível copiar automaticamente.', 'error');
    });
  };

  const handleEnviarParaCotacaoOficial = () => {
    if (!resultadoConsolidado || !resultadoConsolidado.itensComparados) return;

    if (onCriarCotacaoOficial) {
      const itensFormatados = resultadoConsolidado.itensComparados.map((it: any) => ({
        produtoId: it.estoqueInfo?.produtoId || 0,
        descricao: it.produto,
        ean: it.estoqueInfo?.ean || '',
        quantidade: quantidades[it.produtoNormalizado] || it.estoqueInfo?.qtdSugerida30d || 10
      }));
      onCriarCotacaoOficial(itensFormatados);
      onClose();
    }
  };

  // Fornecedores a exibir com base no filtro
  const blocosExibicao = useMemo(() => {
    if (!resultadoConsolidado || !resultadoConsolidado.fornecedoresResumo) return [];
    if (fornecedorFiltro === 'TODOS') return resultadoConsolidado.fornecedoresResumo;
    return resultadoConsolidado.fornecedoresResumo.filter((b: any) => b.fornecedor === fornecedorFiltro);
  }, [resultadoConsolidado, fornecedorFiltro]);

  if (!isOpen) return null;

  const parAtual = candidatosQuiz[quizIndice];

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
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                  Comparador Inteligente de Cotações em Texto
                </h3>
                {ultimoSalvamento && (
                  <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Salvo em cache ({ultimoSalvamento})
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Identifica o menor preço, cruza com o estoque da loja e gera pedidos limpos por fornecedor.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Corpo com Scroll */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar">
          
          {/* Alerta se o rascunho foi restaurado do cache */}
          {cacheRestaurado && (
            <div className="flex items-center justify-between p-3 px-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-300 text-xs">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>
                  Restauramos suas cotações e quantidades digitadas de onde você parou
                  {ultimoSalvamento ? ` (salvo em ${ultimoSalvamento})` : ''}.
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCacheRestaurado(false)}
                  className="text-[11px] font-bold text-amber-900 dark:text-amber-200 hover:underline cursor-pointer"
                >
                  Entendi
                </button>
                <span>•</span>
                <button
                  onClick={handleLimpar}
                  className="text-[11px] font-bold text-red-600 dark:text-red-400 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Limpar / Novo
                </button>
              </div>
            </div>
          )}

          {/* Caixa de Entrada de Texto (Retrátil se já houver resultados) */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-red-500" />
                Texto da Cotação (Cole aqui as mensagens dos representantes com nomes e preços)
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleColarTexto}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-[11px] font-black text-slate-800 dark:text-slate-200 transition-all cursor-pointer shadow-sm"
                  title="Colar texto direto da sua área de transferência"
                >
                  <Copy className="w-3.5 h-3.5 text-red-500" />
                  Colar Texto
                </button>

                <span className="text-slate-300 dark:text-slate-700">•</span>

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
              placeholder="Cole aqui o texto com os fornecedores (ex: SILAS, FELIPE, FRAN, GUILHERME) e os produtos..."
              rows={resultado ? 3 : 6}
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
                    Analisando e Cruzando com Estoque...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    {resultado ? 'Reanalisar Cotações' : 'Comparar e Separar Fornecedores'}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* QUIZ DE SIMILARIDADE DE PRODUTOS */}
          {candidatosQuiz.length > 0 && quizAberto && parAtual && (
            <div className="p-5 rounded-3xl bg-gradient-to-br from-amber-50/80 via-orange-50/50 to-amber-100/40 dark:from-amber-950/40 dark:via-orange-950/20 dark:to-slate-900 border-2 border-amber-300/80 dark:border-amber-700/60 shadow-lg space-y-4 animate-in fade-in duration-300">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-amber-200 dark:border-amber-800/60">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-amber-500 text-white shadow-xs">
                    <HelpCircle className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                      Quiz de Similaridade: Confirmar Produtos Iguais
                      <span className="px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 text-[11px] font-black">
                        Pergunta {quizIndice + 1} de {candidatosQuiz.length}
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                      Detectamos que estes 2 itens de fornecedores diferentes podem ser o mesmo medicamento. Confirme para unificar e eleger o menor preço:
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={handleUnificarTodosCerteza}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black cursor-pointer shadow-xs transition-all"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Unificar Todos (&gt;80%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuizAberto(false)}
                    className="text-[11px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-2 py-1"
                  >
                    Ocultar Quiz
                  </button>
                </div>
              </div>

              {/* Comparação dos 2 itens do Quiz */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Card Item A */}
                <div className={`p-4 rounded-2xl border transition-all ${
                  parAtual.itemA.menorPreco <= parAtual.itemB.menorPreco
                    ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 ring-2 ring-emerald-500/10'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                }`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">
                      <Building2 className="w-3.5 h-3.5 text-red-500" />
                      {parAtual.itemA.vencedor}
                    </span>
                    {parAtual.itemA.menorPreco <= parAtual.itemB.menorPreco && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-white shadow-2xs">
                        Menor Preço
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-sm text-slate-900 dark:text-white">
                    {parAtual.itemA.produto}
                  </div>
                  <div className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-1">
                    {parAtual.itemA.menorPreco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                </div>

                {/* Card Item B */}
                <div className={`p-4 rounded-2xl border transition-all ${
                  parAtual.itemB.menorPreco < parAtual.itemA.menorPreco
                    ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 ring-2 ring-emerald-500/10'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                }`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">
                      <Building2 className="w-3.5 h-3.5 text-red-500" />
                      {parAtual.itemB.vencedor}
                    </span>
                    {parAtual.itemB.menorPreco < parAtual.itemA.menorPreco && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-white shadow-2xs">
                        Menor Preço
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-sm text-slate-900 dark:text-white">
                    {parAtual.itemB.produto}
                  </div>
                  <div className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-1">
                    {parAtual.itemB.menorPreco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                </div>

              </div>

              {/* Resumo da Probabilidade e Ações */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <span className="px-2.5 py-1 rounded-xl bg-amber-200/80 dark:bg-amber-900/60 text-amber-950 dark:text-amber-200 text-xs font-black">
                    Probabilidade: {parAtual.score}%
                  </span>
                  {parAtual.economiaPerc > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Economia de <b>{parAtual.economiaPerc}%</b> comprando de <b>{parAtual.vencedorPreco}</b>!
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRejeitarUnificacao(parAtual)}
                    className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-black transition-all cursor-pointer"
                  >
                    ❌ Não, Manter Separados
                  </button>

                  <button
                    type="button"
                    onClick={() => handleConfirmarUnificacao(parAtual)}
                    className="flex-1 sm:flex-none px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md"
                  >
                    ✅ Sim, Unificar Produtos
                  </button>

                  {candidatosQuiz.length > 1 && (
                    <div className="flex items-center gap-1 pl-2">
                      <button
                        type="button"
                        disabled={quizIndice === 0}
                        onClick={() => setQuizIndice(prev => Math.max(0, prev - 1))}
                        className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 disabled:opacity-30 cursor-pointer"
                        title="Pergunta anterior"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={quizIndice >= candidatosQuiz.length - 1}
                        onClick={() => setQuizIndice(prev => Math.min(candidatosQuiz.length - 1, prev + 1))}
                        className="p-2 rounded-lg bg-slate-200 dark:bg-slate-800 disabled:opacity-30 cursor-pointer"
                        title="Próxima pergunta"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* Banner discreto para reabrir o Quiz se houver perguntas pendentes */}
          {candidatosQuiz.length > 0 && !quizAberto && (
            <div className="flex items-center justify-between p-3 px-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs font-bold text-amber-800 dark:text-amber-300">
              <span className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-amber-500" />
                Existem {candidatosQuiz.length} pares de produtos que podem ser iguais aguardando revisão.
              </span>
              <button
                type="button"
                onClick={() => setQuizAberto(true)}
                className="px-3 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-[11px] cursor-pointer"
              >
                Abrir Quiz de Similaridade
              </button>
            </div>
          )}

          {/* Área de Tabelas por Fornecedor */}
          {resultadoConsolidado && resultadoConsolidado.success && (
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
                  <button
                    type="button"
                    onClick={handleAplicarSugestoes30d}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 shadow-md"
                    title="Preenche automaticamente as quantidades conforme a diretriz de giro de 30 dias da farmácia"
                  >
                    <Zap className="w-4 h-4 text-amber-300" />
                    Aplicar Sugestões de 30 Dias
                  </button>

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
                  Todos os Fornecedores ({resultadoConsolidado.fornecedoresResumo?.length || 0})
                </button>

                {resultadoConsolidado.fornecedoresResumo?.map((bloco: any) => {
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

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleCopiarFornecedor(bloco.fornecedor, 'completo')}
                              title={`Copiar pedido de ${bloco.fornecedor} com preços e total`}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 shadow-sm"
                            >
                              {copiadoFornecedor[`${bloco.fornecedor}_completo`] ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiadoFornecedor[`${bloco.fornecedor}_completo`] ? 'Copiado!' : 'Com Preço'}</span>
                            </button>

                            <button
                              onClick={() => handleCopiarFornecedor(bloco.fornecedor, 'resumido')}
                              title={`Copiar pedido de ${bloco.fornecedor} somente produto e quantidade`}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 shadow-sm"
                            >
                              {copiadoFornecedor[`${bloco.fornecedor}_resumido`] ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiadoFornecedor[`${bloco.fornecedor}_resumido`] ? 'Copiado!' : 'Só Qtd'}</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Tabela Interativa de Produtos com Estoque e Última Compra */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-100/70 dark:bg-slate-800/30 text-slate-500 dark:text-slate-400 font-black uppercase border-b border-slate-200 dark:border-slate-800">
                              <th className="py-3 px-4 w-10 text-center">#</th>
                              <th className="py-3 px-4">Produto</th>
                              <th className="py-3 px-4 text-right w-36">Menor Preço</th>
                              <th className="py-3 px-4 text-center w-36">Sugestão 30d</th>
                              <th className="py-3 px-4 text-center w-28">Quantidade</th>
                              <th className="py-3 px-4 text-right w-32">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-300">
                            {bloco.produtos?.map((prod: any, pIdx: number) => {
                              const qtdAtual = quantidades[prod.produtoNormalizado] || 0;
                              const subtotal = qtdAtual * prod.menorPreco;
                              const temQtd = qtdAtual > 0;
                              const estoque = prod.estoqueInfo;

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
                                  
                                  {/* Coluna do Produto & Dados do Estoque */}
                                  <td className="py-3 px-4">
                                    <div className="font-bold text-slate-900 dark:text-white text-xs">
                                      {prod.produto}
                                    </div>
                                    
                                    {/* Informações de Concorrentes */}
                                    {prod.concorrenteInfo && (
                                      <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                                        {prod.concorrenteInfo}
                                      </div>
                                    )}

                                    {/* Indicadores de Estoque Atual e Giro */}
                                    {estoque && (
                                      <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px]">
                                        <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                                          Estoque: <b>{estoque.saldo} un</b>
                                        </span>
                                        <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                                          Vendas 30d: <b>{estoque.vendas30d} un</b>
                                        </span>
                                      </div>
                                    )}
                                  </td>

                                  {/* Menor Preço e Comparativo com Última Compra */}
                                  <td className="py-3 px-4 text-right">
                                    <div className="font-black text-slate-900 dark:text-white text-xs">
                                      {prod.menorPreco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </div>

                                    {/* Valor da Última Compra */}
                                    {estoque?.valorUltimaCompra > 0 && (
                                      <div className="mt-1 flex flex-col items-end gap-0.5">
                                        <span className="text-[10px] text-slate-400 font-medium">
                                          Última: {estoque.valorUltimaCompra.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </span>
                                        {estoque.variacaoVsUltimaCompra !== null && (
                                          estoque.variacaoVsUltimaCompra < 0 ? (
                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                                              ⬇ {Math.abs(estoque.variacaoVsUltimaCompra)}% economia
                                            </span>
                                          ) : estoque.variacaoVsUltimaCompra > 0 ? (
                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
                                              ⬆ +{estoque.variacaoVsUltimaCompra}% mais caro
                                            </span>
                                          ) : (
                                            <span className="text-[9px] text-slate-400 font-bold">= mesmo preço</span>
                                          )
                                        )}
                                      </div>
                                    )}
                                  </td>

                                  {/* Sugestão de Compra para os próximos 30 dias */}
                                  <td className="py-3 px-4 text-center">
                                    {estoque && estoque.qtdSugerida30d > 0 ? (
                                      <div className="flex flex-col items-center gap-1">
                                        <span className="font-black text-blue-600 dark:text-blue-400 text-xs">
                                          {estoque.qtdSugerida30d} un
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleMudarQuantidade(prod.produtoNormalizado, String(estoque.qtdSugerida30d))}
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/60 hover:bg-blue-200 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[10px] font-black cursor-pointer shadow-2xs transition-all"
                                          title="Preencher com a sugestão calculada para 30 dias"
                                        >
                                          <Zap className="w-2.5 h-2.5 text-amber-500" />
                                          Usar {estoque.qtdSugerida30d}
                                        </button>
                                      </div>
                                    ) : estoque ? (
                                      <span className="text-[11px] text-slate-400 font-medium">0 un (Estoque OK)</span>
                                    ) : (
                                      <span className="text-slate-300 dark:text-slate-600">-</span>
                                    )}
                                  </td>

                                  {/* Input da Quantidade a Comprar */}
                                  <td className="py-3 px-4 text-center">
                                    <input
                                      type="number"
                                      min="0"
                                      placeholder="0"
                                      value={qtdAtual === 0 ? '' : qtdAtual}
                                      onChange={e => handleMudarQuantidade(prod.produtoNormalizado, e.target.value)}
                                      className={`w-20 px-2.5 py-1.5 rounded-xl border text-center font-black text-xs transition-all focus:outline-none focus:ring-2 focus:ring-red-500/20 ${
                                        temQtd
                                          ? 'border-emerald-500 bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 ring-2 ring-emerald-500/10'
                                          : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200'
                                      }`}
                                    />
                                  </td>

                                  {/* Subtotal do Item */}
                                  <td className="py-3 px-4 text-right font-black text-xs">
                                    {subtotal > 0 ? (
                                      <span className="text-emerald-600 dark:text-emerald-400 text-xs">
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
                        <div className="flex flex-wrap items-center gap-3 text-slate-500 dark:text-slate-400 font-bold text-[11px]">
                          <span>Itens ganhos: <b>{bloco.totalItens}</b></span>
                          <span>•</span>
                          <span>Com quantidade informada: <b className="text-emerald-600 dark:text-emerald-400">{m.itensComQtd}</b></span>
                          <span>•</span>
                          <span>Total de unidades: <b>{m.unidadesTotal}</b></span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-bold text-slate-600 dark:text-slate-300">
                            Total {bloco.fornecedor}:
                          </span>
                          <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                            {m.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                          <div className="flex items-center gap-1.5 ml-2">
                            <button
                              onClick={() => handleCopiarFornecedor(bloco.fornecedor, 'completo')}
                              title="Copiar com preços e total"
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-black uppercase transition-all cursor-pointer shadow-xs active:scale-95"
                            >
                              <Copy className="w-3 h-3" />
                              <span>{copiadoFornecedor[`${bloco.fornecedor}_completo`] ? 'Copiado!' : 'Com Preço'}</span>
                            </button>
                            <button
                              onClick={() => handleCopiarFornecedor(bloco.fornecedor, 'resumido')}
                              title="Copiar somente nome do produto e quantidade"
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black uppercase transition-all cursor-pointer shadow-xs active:scale-95"
                            >
                              <Copy className="w-3 h-3" />
                              <span>{copiadoFornecedor[`${bloco.fornecedor}_resumido`] ? 'Copiado!' : 'Só Qtd'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pré-visualização do Texto Limpo que será enviado para o WhatsApp */}
              <div className="p-5 rounded-3xl bg-slate-900 text-slate-100 font-mono text-xs border border-slate-800 shadow-md space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[11px] font-bold text-slate-300 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-400" />
                      {fornecedorFiltro === 'TODOS'
                        ? 'Prévia dos Pedidos Limpos (Separados por Fornecedor - Qtd > 0)'
                        : `Prévia do Pedido Limpo de ${fornecedorFiltro} (Qtd > 0)`}
                    </span>

                    {/* Alternador de Formato: Com Preços vs Somente Produto e Qtd */}
                    <div className="inline-flex p-1 bg-slate-950 rounded-2xl border border-slate-800 font-sans">
                      <button
                        type="button"
                        onClick={() => setFormatoTextoPedido('completo')}
                        className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          formatoTextoPedido === 'completo'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Com Preços
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormatoTextoPedido('resumido')}
                        className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          formatoTextoPedido === 'resumido'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Somente Produto & Qtd
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={fornecedorFiltro === 'TODOS' ? () => handleCopiarTudo() : () => handleCopiarFornecedor(fornecedorFiltro)}
                      className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 shadow-sm"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {fornecedorFiltro === 'TODOS'
                        ? (formatoTextoPedido === 'resumido' ? 'Copiar Todos (Só Qtd)' : 'Copiar Todos os Pedidos')
                        : (formatoTextoPedido === 'resumido' ? 'Copiar Pedido (Só Qtd)' : `Copiar Pedido de ${fornecedorFiltro}`)}
                    </button>
                  </div>
                </div>

                <pre className="whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-64 p-3 bg-slate-950 rounded-xl text-emerald-300 font-mono text-[11px]">
                  {fornecedorFiltro === 'TODOS' ? gerarTextoLimpoConsolidado() : gerarTextoLimpoFornecedor(fornecedorFiltro)}
                </pre>
              </div>

            </div>
          )}
        </div>

        {/* Footer do Modal */}
        <div className="p-4 md:px-7 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400 font-medium">
          <span>O texto gerado pode ser copiado completo (com preços e totais) ou resumido (apenas produtos e quantidades).</span>
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
