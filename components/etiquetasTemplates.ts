/**
 * etiquetasTemplates.ts
 * Motor de Templates, Formatos e Renderização de Etiquetas de Preço e Cartazes da BelaFarma.
 * 
 * Suporta:
 * - Térmica 60x40mm, 100x30mm, 100x50mm
 * - Folhas A4 Pimaco (3x10 / 30 por folha, 2x7 / 14 por folha)
 * - Cartazes de Gôndola e Ponta de Gôndola (A6 105x148mm, A5 148x210mm)
 * - Modelos Visuais Prontos (Amarelo Varejo, Vermelho Liquidação, BelaFarma Institucional, Gôndola com EAN, Cartaz com Foto)
 * - Totalmente customizável em tempo real no Estúdio Visual.
 */

export type FormatoEtiquetaId = 
  | 'termica_60x40'
  | 'termica_100x30'
  | 'termica_100x50'
  | 'a4_pimaco_3x10'
  | 'a4_pimaco_2x7'
  | 'a4_oferta_2x3'
  | 'cartaz_a6'
  | 'cartaz_a5';

export interface FormatoEtiquetaConfig {
  id: FormatoEtiquetaId;
  nome: string;
  tipo: 'termica' | 'folha_a4' | 'cartaz';
  wMm: number;
  hMm: number;
  wPx: number;
  hPx: number;
  cols?: number;
  rows?: number;
  margemTopMm?: number;
  margemEsqMm?: number;
  gapColMm?: number;
  gapRowMm?: number;
  descricao: string;
}

export const FORMATOS_ETIQUETAS: Record<FormatoEtiquetaId, FormatoEtiquetaConfig> = {
  a4_oferta_2x3: {
    id: 'a4_oferta_2x3',
    nome: 'Folha A4 2x3 (6 etiquetas • 98 x 88 mm - Oferta Destaque Seta)',
    tipo: 'folha_a4',
    wMm: 98,
    hMm: 88,
    wPx: 370,
    hPx: 332,
    cols: 2,
    rows: 3,
    margemTopMm: 10,
    margemEsqMm: 6,
    gapColMm: 4,
    gapRowMm: 4,
    descricao: '6 etiquetas por folha A4 com seta vermelha OFERTA, nome e desconto % (Modelo da foto).'
  },
  termica_60x40: {
    id: 'termica_60x40',
    nome: 'Térmica 60 x 40 mm (Padrão Farmácia)',
    tipo: 'termica',
    wMm: 60,
    hMm: 40,
    wPx: 360,
    hPx: 240,
    cols: 3,
    rows: 6,
    margemTopMm: 8,
    margemEsqMm: 7,
    gapColMm: 2,
    gapRowMm: 1,
    descricao: 'Tamanho clássico para bobina térmica (rolo) ou folha A4 (18 por folha sem cortes).'
  },
  termica_100x30: {
    id: 'termica_100x30',
    nome: 'Térmica 100 x 30 mm (Gôndola Alongada)',
    tipo: 'termica',
    wMm: 100,
    hMm: 30,
    wPx: 520,
    hPx: 160,
    cols: 2,
    rows: 8,
    margemTopMm: 10,
    margemEsqMm: 4,
    gapColMm: 2,
    gapRowMm: 1,
    descricao: 'Formato horizontal estendido (16 por folha A4 ou rolo contínuo).'
  },
  termica_100x50: {
    id: 'termica_100x50',
    nome: 'Térmica 100 x 50 mm (Destaque Grande)',
    tipo: 'termica',
    wMm: 100,
    hMm: 50,
    wPx: 520,
    hPx: 260,
    cols: 2,
    rows: 5,
    margemTopMm: 15,
    margemEsqMm: 4,
    gapColMm: 2,
    gapRowMm: 2,
    descricao: 'Etiqueta ampla de destaque (10 por folha A4 ou rolo contínuo).'
  },
  a4_pimaco_3x10: {
    id: 'a4_pimaco_3x10',
    nome: 'Folha A4 Pimaco 3x10 (30 etiquetas • 70 x 29.7 mm)',
    tipo: 'folha_a4',
    wMm: 70,
    hMm: 29.7,
    wPx: 350,
    hPx: 148,
    cols: 3,
    rows: 10,
    margemTopMm: 0,
    margemEsqMm: 0,
    gapColMm: 0,
    gapRowMm: 0,
    descricao: 'Folha A4 adesiva 30 etiquetas sem sobras (3 colunas x 10 linhas encaixe total).'
  },
  a4_pimaco_2x7: {
    id: 'a4_pimaco_2x7',
    nome: 'Folha A4 Pimaco 2x7 (14 etiquetas • 101.6 x 38.1 mm)',
    tipo: 'folha_a4',
    wMm: 101.6,
    hMm: 38.1,
    wPx: 460,
    hPx: 172,
    cols: 2,
    rows: 7,
    margemTopMm: 14,
    margemEsqMm: 3.4,
    gapColMm: 0,
    gapRowMm: 0,
    descricao: 'Etiquetas médias adesivas em folha A4 com alta legibilidade (tipo Pimaco 6182).'
  },
  cartaz_a6: {
    id: 'cartaz_a6',
    nome: 'Mini-Cartaz Gôndola A6 (105 x 148 mm)',
    tipo: 'cartaz',
    wMm: 105,
    hMm: 144,
    wPx: 420,
    hPx: 576,
    cols: 2,
    rows: 2,
    margemTopMm: 2,
    margemEsqMm: 0,
    gapColMm: 0,
    gapRowMm: 2,
    descricao: 'Cartaz intermediário para fixação em acrílico (4 por folha A4).'
  },
  cartaz_a5: {
    id: 'cartaz_a5',
    nome: 'Cartaz Ponta de Gôndola A5 (148 x 210 mm)',
    tipo: 'cartaz',
    wMm: 148,
    hMm: 210,
    wPx: 592,
    hPx: 840,
    cols: 1,
    rows: 1,
    margemTopMm: 0,
    margemEsqMm: 0,
    gapColMm: 0,
    gapRowMm: 0,
    descricao: 'Cartaz chamativo para ilhas e pontas de gôndola (1 por folha A4).'
  }
};

export interface CoordenadasElemento {
  x: number;
  y: number;
}

export interface PosicoesEtiqueta {
  foto?: CoordenadasElemento;
  nome?: CoordenadasElemento;
  preco?: CoordenadasElemento;
  barras?: CoordenadasElemento;
  faixa?: CoordenadasElemento;
}

export interface EstiloEtiqueta {
  modeloId: string;
  // Cores
  corFundo: string;
  corFaixa: string;
  corTextoFaixa: string;
  corPrecoDe: string;
  corPrecoPor: string;
  corBadge: string;
  corTextoBadge: string;
  corTexto: string;
  // Fontes & Escalas
  fonteTitulo: string;
  fonteCorpo: string;
  tamanhoTituloMultiplicador: number; // 0.8 a 1.4
  tamanhoPrecoMultiplicador: number; // 0.8 a 1.5
  tamanhoPrecoDeMultiplicador?: number; // 0.8 a 2.0
  tamanhoBadgeMultiplicador?: number; // 0.8 a 2.0
  // Elementos Visuais (Toggles)
  exibirFoto: boolean;
  exibirCodigoBarras: boolean;
  exibirDePor: boolean;
  exibirSeloDesconto: boolean;
  exibirValidade: boolean;
  exibirLogo: boolean;
  exibirAvisoAvista: boolean;
  // Textos
  tituloPromocional: string;
  textoAviso: string;
  // Ajustes de Imagem
  zoomFoto: number;
  offsetYFoto: number;
  // Posições arrastáveis
  posicoes?: PosicoesEtiqueta;
}

export const MODELOS_PRONTOS_ETIQUETA: Record<string, { nome: string; descricao: string; estilo: Partial<EstiloEtiqueta> }> = {
  verde_preco_baixo_destaque: {
    nome: '🟢 Verde Preço Baixo (Tag % & Preço "De:" Ampliados)',
    descricao: 'Modelo idêntico à imagem enviada: Faixa verde, tag de desconto % em destaque vermelho e preço antigo "De:" ampliado',
    estilo: {
      corFundo: '#ffffff',
      corFaixa: '#00a651',
      corTextoFaixa: '#ffffff',
      corPrecoDe: '#dc2626',
      corPrecoPor: '#0b2545',
      corBadge: '#dc2626',
      corTextoBadge: '#ffffff',
      corTexto: '#000000',
      fonteTitulo: "Impact, 'Arial Black', sans-serif",
      fonteCorpo: "'Segoe UI', Arial, sans-serif",
      tituloPromocional: 'PREÇO BAIXO',
      textoAviso: 'Válido até o fim do estoque',
      exibirDePor: true,
      exibirSeloDesconto: true,
      exibirCodigoBarras: true,
      exibirLogo: true,
      exibirFoto: false,
      exibirValidade: true,
      exibirAvisoAvista: true,
      tamanhoTituloMultiplicador: 1.0,
      tamanhoPrecoMultiplicador: 1.0,
      tamanhoPrecoDeMultiplicador: 1.45,
      tamanhoBadgeMultiplicador: 1.4
    }
  },
  oferta_amarela_6x: {
    nome: '🎯 Oferta 6 por Folha A4 (Seta + Nome + Desconto %)',
    descricao: 'Modelo Amarela com borda vermelha, seta OFERTA, Nome e Desconto %',
    estilo: {
      corFundo: '#ffea00',
      corFaixa: '#d6192b',
      corTextoFaixa: '#ffffff',
      corPrecoDe: '#64748b',
      corPrecoPor: '#000000',
      corBadge: '#d6192b',
      corTextoBadge: '#ffffff',
      corTexto: '#000000',
      fonteTitulo: "Impact, 'Arial Black', sans-serif",
      fonteCorpo: "'Segoe UI', Arial, sans-serif",
      tituloPromocional: 'OFERTA',
      textoAviso: '',
      exibirDePor: false,
      exibirSeloDesconto: true,
      exibirCodigoBarras: false,
      exibirLogo: false,
      exibirFoto: false,
      exibirValidade: false,
      exibirAvisoAvista: false
    }
  },
  amarelo_oferta: {
    nome: '🌟 Amarelo Impacto / Super Oferta',
    descricao: 'Fundo amarelo vivo, faixa vermelha chamativa e preço de máximo contraste',
    estilo: {
      corFundo: '#ffea00',
      corFaixa: '#d6192b',
      corTextoFaixa: '#ffffff',
      corPrecoDe: '#64748b',
      corPrecoPor: '#d6192b',
      corBadge: '#d6192b',
      corTextoBadge: '#ffffff',
      corTexto: '#111827',
      fonteTitulo: "Impact, 'Arial Black', sans-serif",
      fonteCorpo: "'Segoe UI', Arial, sans-serif",
      tituloPromocional: 'SUPER OFERTA',
      textoAviso: 'À vista ou no cartão',
      exibirDePor: true,
      exibirSeloDesconto: true,
      exibirCodigoBarras: true,
      exibirLogo: true,
      exibirFoto: true,
      exibirValidade: true,
      exibirAvisoAvista: true
    }
  },
  vermelho_liquidacao: {
    nome: '🔥 Vermelho Liquidação / Queima',
    descricao: 'Impacto visual total, contrastes fortes em amarelo e preto',
    estilo: {
      corFundo: '#dc2626',
      corFaixa: '#111827',
      corTextoFaixa: '#fde047',
      corPrecoDe: '#fecaca',
      corPrecoPor: '#fde047',
      corBadge: '#000000',
      corTextoBadge: '#fde047',
      corTexto: '#ffffff',
      fonteTitulo: "Impact, 'Arial Black', sans-serif",
      fonteCorpo: "'Segoe UI', Arial, sans-serif",
      tituloPromocional: 'QUEIMA DE ESTOQUE',
      textoAviso: 'Preço promocional à vista',
      exibirDePor: true,
      exibirSeloDesconto: true,
      exibirCodigoBarras: true,
      exibirLogo: true,
      exibirFoto: true,
      exibirValidade: true,
      exibirAvisoAvista: true
    }
  },
  belafarma_institucional: {
    nome: '🏥 BelaFarma Institucional (Oficial)',
    descricao: 'Elegância azul escuro e vermelho BelaFarma com logo oficial da loja',
    estilo: {
      corFundo: '#ffffff',
      corFaixa: '#0b3b82',
      corTextoFaixa: '#ffffff',
      corPrecoDe: '#64748b',
      corPrecoPor: '#c8102e',
      corBadge: '#c8102e',
      corTextoBadge: '#ffffff',
      corTexto: '#0b3b82',
      fonteTitulo: "'Montserrat', 'Arial Black', sans-serif",
      fonteCorpo: "'Segoe UI', Arial, sans-serif",
      tituloPromocional: 'OFERTA BELAFARMA',
      textoAviso: 'Cuidar de você com confiança',
      exibirDePor: true,
      exibirSeloDesconto: true,
      exibirCodigoBarras: true,
      exibirLogo: true,
      exibirFoto: true,
      exibirValidade: true,
      exibirAvisoAvista: true
    }
  },
  gondola_clean_ean: {
    nome: '📊 Gôndola Limpa com Código de Barras (EAN)',
    descricao: 'Fundo branco limpo, alta legibilidade de prateleira e leitor ótico veloz',
    estilo: {
      corFundo: '#ffffff',
      corFaixa: '#f1f5f9',
      corTextoFaixa: '#0f172a',
      corPrecoDe: '#64748b',
      corPrecoPor: '#0f172a',
      corBadge: '#dc2626',
      corTextoBadge: '#ffffff',
      corTexto: '#0f172a',
      fonteTitulo: "'Montserrat', 'Arial Black', sans-serif",
      fonteCorpo: "'Segoe UI', Arial, sans-serif",
      tituloPromocional: 'PREÇO BAIXO',
      textoAviso: 'Válido até o fim do estoque',
      exibirDePor: true,
      exibirSeloDesconto: true,
      exibirCodigoBarras: true,
      exibirLogo: false,
      exibirFoto: false,
      exibirValidade: true,
      exibirAvisoAvista: false
    }
  },
  cartaz_destaque_foto: {
    nome: '📸 Cartaz Promocional com Foto',
    descricao: 'Foto ampla com sombra em evidência, de/por e grande visibilidade à distância',
    estilo: {
      corFundo: '#ffffff',
      corFaixa: '#d6192b',
      corTextoFaixa: '#ffffff',
      corPrecoDe: '#64748b',
      corPrecoPor: '#d6192b',
      corBadge: '#0b3b82',
      corTextoBadge: '#ffffff',
      corTexto: '#0f172a',
      fonteTitulo: "Impact, 'Arial Black', sans-serif",
      fonteCorpo: "'Segoe UI', Arial, sans-serif",
      tituloPromocional: 'SUPER OFERTA',
      textoAviso: 'Aproveite enquanto durar o estoque!',
      exibirDePor: true,
      exibirSeloDesconto: true,
      exibirCodigoBarras: false,
      exibirLogo: true,
      exibirFoto: true,
      exibirValidade: true,
      exibirAvisoAvista: true
    }
  }
};

export const ESTILO_ETIQUETA_PADRAO: EstiloEtiqueta = {
  modeloId: 'amarelo_oferta',
  corFundo: '#ffea00',
  corFaixa: '#d6192b',
  corTextoFaixa: '#ffffff',
  corPrecoDe: '#64748b',
  corPrecoPor: '#d6192b',
  corBadge: '#d6192b',
  corTextoBadge: '#ffffff',
  corTexto: '#111827',
  fonteTitulo: "Impact, 'Arial Black', sans-serif",
  fonteCorpo: "'Segoe UI', Arial, sans-serif",
  tamanhoTituloMultiplicador: 1,
  tamanhoPrecoMultiplicador: 1,
  exibirFoto: true,
  exibirCodigoBarras: true,
  exibirDePor: true,
  exibirSeloDesconto: true,
  exibirValidade: true,
  exibirLogo: true,
  exibirAvisoAvista: true,
  tituloPromocional: 'SUPER OFERTA',
  textoAviso: 'À vista ou no cartão',
  zoomFoto: 1,
  offsetYFoto: 0
};

// ─── GERADOR DE CÓDIGO DE BARRAS SVG PURO (CODE-39) ───────────────────────────
export function gerarSvgCodigoBarras(codigo: string, larguraMaxPx = 200, alturaPx = 30, corBarras = '#000000'): string {
  const limpo = (codigo || '').toUpperCase().replace(/[^A-Z0-9\-\.\s\$\/\+\%]/g, '');
  if (!limpo) return '';

  const alfabeto: Record<string, string> = {
    '0': '101001101101', '1': '110100101011', '2': '101100101011', '3': '110110010101',
    '4': '101001101011', '5': '110100110101', '6': '101100110101', '7': '101001011011',
    '8': '110100101101', '9': '101100101101', 'A': '110101001011', 'B': '101101001011',
    'C': '110110100101', 'D': '101011001011', 'E': '110101100101', 'F': '101101100101',
    'G': '101010011011', 'H': '110101001101', 'I': '101101001101', 'J': '101011001101',
    'K': '110101010011', 'L': '101101010011', 'M': '110110101001', 'N': '101011010011',
    'O': '110101101001', 'P': '101101101001', 'Q': '101010110011', 'R': '110101011001',
    'S': '101101011001', 'T': '101011011001', 'U': '110010101011', 'V': '100110101011',
    'W': '110011010101', 'X': '100101101011', 'Y': '110010110101', 'Z': '100110110101',
    '-': '100101011011', '.': '110010101101', ' ': '100110101101', '*': '100101101101'
  };

  const codeStr = `*${limpo}*`;
  let fullEncoding = '';
  for (let i = 0; i < codeStr.length; i++) {
    const char = codeStr[i];
    fullEncoding += (alfabeto[char] || alfabeto[' ']) + '0';
  }

  const numBits = fullEncoding.length;
  const barWidth = Math.max(0.9, larguraMaxPx / numBits);
  const totalW = Math.round(numBits * barWidth);

  let rects = '';
  for (let j = 0; j < numBits; j++) {
    if (fullEncoding[j] === '1') {
      rects += `<rect x="${(j * barWidth).toFixed(2)}" y="0" width="${barWidth.toFixed(2)}" height="${alturaPx}" fill="${corBarras}" />`;
    }
  }

  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;">
      <svg width="${totalW}" height="${alturaPx}" viewBox="0 0 ${totalW} ${alturaPx}" style="max-width:100%;height:${alturaPx}px;display:block;">
        ${rects}
      </svg>
      <span style="font-family:'Segoe UI', Arial, monospace;font-size:9px;font-weight:700;letter-spacing:0.18em;color:${corBarras};margin-top:2px;">${limpo}</span>
    </div>`;
}

// ─── ESCAPE HTML ─────────────────────────────────────────────────────────────
function esc(str: any): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const fmtMoeda = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export interface ItemEtiqueta {
  id: string;
  produto_id: number;
  descricao: string;
  apresentacao?: string;
  ean?: string;
  preco_normal: number;
  preco_promocional: number;
  desconto_percentual: number;
  imagem_url?: string;
  quantidadeCopias?: number;
}

// ─── GERADOR HTML DA ETIQUETA UNITÁRIA ─────────────────────────────────────────
export function htmlEtiqueta(
  item: ItemEtiqueta,
  formato: FormatoEtiquetaConfig,
  estilo: EstiloEtiqueta,
  dataValidade?: string
): string {
  const { wPx: W, hPx: H } = formato;
  const precoStr = fmtMoeda(item.preco_promocional);
  const precoDeStr = fmtMoeda(item.preco_normal);
  const descPercent = Math.round(item.desconto_percentual || 0);
  const temFoto = estilo.exibirFoto && !!item.imagem_url && formato.id !== 'termica_100x30';
  const temBarras = estilo.exibirCodigoBarras && !!item.ean;

  // Tamanhos de fonte proporcionais ao tamanho da etiqueta
  const escalaBase = Math.min(W / 360, H / 240);
  const fsFaixa = Math.round(11 * escalaBase * estilo.tamanhoTituloMultiplicador);
  const fsDesc = Math.round(13 * escalaBase);
  const fsPreco = Math.round(36 * escalaBase * estilo.tamanhoPrecoMultiplicador);
  const fsPrecoDe = Math.round(11 * escalaBase * (estilo.tamanhoPrecoDeMultiplicador ?? 1));
  const fsBadge = Math.round(11 * escalaBase * (estilo.tamanhoBadgeMultiplicador ?? 1));
  const fsAviso = Math.round(9 * escalaBase);

  // Logo BelaFarma reduzida (se habilitada)
  const logoHtml = estilo.exibirLogo
    ? `<div style="display:flex;align-items:center;gap:4px;">
        <span style="display:inline-block;width:${Math.round(10 * escalaBase)}px;height:${Math.round(10 * escalaBase)}px;border-radius:2px;background:#c8102e;"></span>
        <span style="font-family:'Montserrat', sans-serif;font-weight:900;font-size:${Math.round(10 * escalaBase)}px;letter-spacing:0.04em;color:${estilo.corTextoFaixa};">BELA FARMA</span>
       </div>`
    : '';

  const posFoto = estilo.posicoes?.foto || { x: 0, y: 0 };
  const posNome = estilo.posicoes?.nome || { x: 0, y: 0 };
  const posPreco = estilo.posicoes?.preco || { x: 0, y: 0 };
  const posBarras = estilo.posicoes?.barras || { x: 0, y: 0 };
  const posFaixa = estilo.posicoes?.faixa || { x: 0, y: 0 };

  // Foto do produto
  const fotoW = Math.round((formato.tipo === 'cartaz' ? W * 0.45 : W * 0.28) * estilo.zoomFoto);
  const fotoH = Math.round((formato.tipo === 'cartaz' ? H * 0.38 : H * 0.48) * estilo.zoomFoto);
  const fotoHtml = temFoto
    ? `<div data-drag-el="foto" style="flex-shrink:0;width:${fotoW}px;height:${fotoH}px;display:flex;align-items:center;justify-content:center;position:relative;margin-top:${estilo.offsetYFoto}px;transform:translate(${posFoto.x}px,${posFoto.y}px);cursor:grab;touch-action:none;z-index:3;">
        <img src="${esc(item.imagem_url)}" style="max-width:100%;max-height:100%;object-fit:contain;filter:drop-shadow(0 4px 6px rgba(0,0,0,0.18));" onerror="this.style.display='none'" />
       </div>`
    : '';

  // Código de barras SVG
  const barrasHtml = temBarras
    ? `<div data-drag-el="barras" style="transform:translate(${posBarras.x}px,${posBarras.y}px);cursor:grab;touch-action:none;z-index:3;">${gerarSvgCodigoBarras(item.ean || '', Math.min(W * 0.48, 170), Math.round(22 * escalaBase), '#000000')}</div>`
    : '';

  // Layout Diferenciado por Tipo:
  // 0. FORMATO ESPECIAL: OFERTA SETA (6 POR FOLHA A4) - MODELO IDÊNTICO À FOTO DO USUÁRIO
  if (formato.id === 'a4_oferta_2x3' || estilo.modeloId === 'oferta_amarela_6x') {
    const fsNome = Math.round(22 * escalaBase);
    const fsBanner = Math.round(24 * escalaBase);
    const fsDescPerc = Math.round(15 * escalaBase);
    const fsPrecoGiga = Math.round(58 * escalaBase * estilo.tamanhoPrecoMultiplicador);

    return `
      <div style="position:relative;width:${W}px;height:${H}px;background:${estilo.corFundo};box-sizing:border-box;padding:8px;border-radius:18px;border:3px solid ${estilo.corFundo};overflow:hidden;font-family:${estilo.fonteCorpo};display:flex;flex-direction:column;align-items:center;justify-content:space-between;">
        <!-- Moldura Interna Arredondada -->
        <div style="position:absolute;inset:5px;border:3.5px solid ${estilo.corFaixa};border-radius:14px;pointer-events:none;z-index:1;"></div>

        <!-- Banner Seta Vermelha OFERTA -->
        <div data-drag-el="faixa" style="position:relative;z-index:2;margin-top:-2px;background:${estilo.corFaixa};color:${estilo.corTextoFaixa};font-family:${estilo.fonteTitulo};font-weight:900;font-size:${fsBanner}px;text-transform:uppercase;letter-spacing:0.06em;padding:4px 20px 10px;width:68%;text-align:center;clip-path:polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%);display:flex;align-items:center;justify-content:center;text-shadow:1px 1px 2px rgba(0,0,0,0.3);transform:translate(${posFaixa.x}px,${posFaixa.y}px);cursor:grab;">
          ${esc(estilo.tituloPromocional || 'OFERTA')}
        </div>

        <!-- Nome do Produto + Desconto % -->
        <div data-drag-el="nome" style="position:relative;z-index:2;margin-top:6px;text-align:center;padding:0 8px;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;transform:translate(${posNome.x}px,${posNome.y}px);cursor:grab;">
          <div style="font-family:${estilo.fonteTitulo};font-weight:900;font-size:${fsNome}px;line-height:1.1;color:${estilo.corTexto};text-transform:uppercase;text-align:center;word-break:break-word;max-height:${fsNome * 2.4}px;overflow:hidden;">
            ${esc(item.descricao)}
          </div>
          ${descPercent > 0 ? `
            <div style="margin-top:5px;background:${estilo.corBadge};color:${estilo.corTextoBadge};font-family:${estilo.fonteTitulo};font-weight:900;font-size:${fsDescPerc}px;padding:3px 12px;border-radius:12px;display:inline-block;box-shadow:0 2px 4px rgba(0,0,0,0.15);">
              -${descPercent}% OFF
            </div>` : ''}
        </div>

        <!-- Preço de Venda Destacado -->
        <div data-drag-el="preco" style="position:relative;z-index:2;margin-bottom:8px;display:flex;align-items:baseline;justify-content:center;gap:3px;transform:translate(${posPreco.x}px,${posPreco.y}px);cursor:grab;">
          <span style="font-family:${estilo.fonteTitulo};font-size:${Math.round(18 * escalaBase)}px;font-weight:900;color:${estilo.corPrecoPor};">R$</span>
          <span style="font-family:${estilo.fonteTitulo};font-size:${fsPrecoGiga}px;font-weight:900;line-height:0.85;color:${estilo.corPrecoPor};letter-spacing:-0.04em;">
            ${precoStr.replace('R$', '').trim()}
          </span>
          <span style="font-family:${estilo.fonteTitulo};font-size:${Math.round(12 * escalaBase)}px;font-weight:900;color:${estilo.corPrecoPor};">UND</span>
        </div>
      </div>`;
  }

  // 1. FORMATO CARTAZ (A6 / A5)
  if (formato.tipo === 'cartaz') {
    return `
      <div style="position:relative;width:${W}px;height:${H}px;background:${estilo.corFundo};box-sizing:border-box;border:3px solid ${estilo.corFaixa};overflow:hidden;display:flex;flex-direction:column;font-family:${estilo.fonteCorpo};box-shadow:0 6px 14px rgba(0,0,0,0.1);">
        <!-- Faixa Superior -->
        <div data-drag-el="faixa" style="background:${estilo.corFaixa};color:${estilo.corTextoFaixa};padding:10px 16px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 3px 6px rgba(0,0,0,0.15);transform:translate(${posFaixa.x}px,${posFaixa.y}px);cursor:grab;touch-action:none;">
          ${logoHtml}
          <div style="font-family:${estilo.fonteTitulo};font-weight:900;font-size:${fsFaixa * 1.4}px;letter-spacing:0.05em;text-transform:uppercase;">
            ${esc(estilo.tituloPromocional)}
          </div>
          ${estilo.exibirValidade && dataValidade ? `<div style="font-size:11px;font-weight:700;opacity:0.9;">Até ${esc(dataValidade)}</div>` : '<div></div>'}
        </div>

        <!-- Descrição do Produto -->
        <div data-drag-el="nome" style="padding:14px 18px 6px;text-align:center;transform:translate(${posNome.x}px,${posNome.y}px);cursor:grab;touch-action:none;z-index:2;">
          <h2 style="margin:0;font-family:${estilo.fonteTitulo};font-weight:900;font-size:${fsDesc * 1.6}px;line-height:1.15;color:${estilo.corTexto};text-transform:uppercase;word-break:break-word;">
            ${esc(item.descricao)}
          </h2>
          ${item.apresentacao ? `<p style="margin:4px 0 0;font-size:13px;font-weight:700;color:${estilo.corPrecoDe};">${esc(item.apresentacao)}</p>` : ''}
        </div>

        <!-- Centro: Foto e Preço Gigante -->
        <div style="flex:1;display:flex;align-items:center;justify-content:center;gap:16px;padding:8px 18px;">
          ${fotoHtml}
          <div data-drag-el="preco" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;transform:translate(${posPreco.x}px,${posPreco.y}px);cursor:grab;touch-action:none;z-index:3;">
            ${estilo.exibirDePor && item.preco_normal > item.preco_promocional ? `
              <div style="font-size:${fsPrecoDe * 1.4}px;font-weight:700;color:${estilo.corPrecoDe};text-decoration:line-through;margin-bottom:2px;">
                DE: ${precoDeStr}
              </div>` : ''}

            <div style="display:flex;align-items:baseline;justify-content:center;gap:4px;">
              <span style="font-family:${estilo.fonteTitulo};font-size:${fsPreco * 0.45}px;font-weight:900;color:${estilo.corPrecoPor};">POR</span>
              <span style="font-family:${estilo.fonteTitulo};font-size:${fsPreco * 1.5}px;font-weight:900;line-height:0.95;color:${estilo.corPrecoPor};letter-spacing:-0.03em;">
                ${precoStr}
              </span>
            </div>

            ${estilo.exibirSeloDesconto && descPercent > 0 ? `
              <div style="margin-top:8px;background:${estilo.corBadge};color:${estilo.corTextoBadge};font-family:${estilo.fonteTitulo};font-weight:900;font-size:${fsBadge * 1.3}px;padding:4px 14px;border-radius:20px;box-shadow:0 3px 6px rgba(0,0,0,0.2);">
                ECONOMIZE ${descPercent}%
              </div>` : ''}
          </div>
        </div>

        <!-- Rodapé do Cartaz -->
        <div style="padding:8px 16px;background:${estilo.corFaixa};color:${estilo.corTextoFaixa};display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:700;">
          <span>${esc(estilo.textoAviso)}</span>
          ${barrasHtml}
        </div>
      </div>`;
  }

  // 2. FORMATO TÉRMICO E FOLHA A4 (60x40, 100x30, 100x50, Pimaco 3x10, Pimaco 2x7)
  const corBorda = (estilo.corFaixa && estilo.corFaixa.toLowerCase() !== '#ffffff' && estilo.corFaixa.toLowerCase() !== '#f1f5f9') ? estilo.corFaixa : '#cbd5e1';
  return `
    <div style="position:relative;width:${W}px;height:${H}px;background:${estilo.corFundo};box-sizing:border-box;border:1.5px solid ${corBorda};overflow:hidden;display:flex;flex-direction:column;font-family:${estilo.fonteCorpo};">
      <!-- Faixa Superior de Oferta -->
      <div data-drag-el="faixa" style="background:${estilo.corFaixa};color:${estilo.corTextoFaixa};padding:3px 8px;display:flex;align-items:center;justify-content:space-between;line-height:1.1;flex-shrink:0;transform:translate(${posFaixa.x}px,${posFaixa.y}px);cursor:grab;touch-action:none;">
        ${logoHtml}
        <div style="font-family:${estilo.fonteTitulo};font-weight:900;font-size:${fsFaixa}px;letter-spacing:0.04em;text-transform:uppercase;">
          ${esc(estilo.tituloPromocional)}
        </div>
        ${estilo.exibirSeloDesconto && descPercent > 0 ? `
          <div style="background:${estilo.corBadge};color:${estilo.corTextoBadge};font-family:${estilo.fonteTitulo};font-weight:900;font-size:${fsBadge}px;padding:1px 6px;border-radius:4px;">
            -${descPercent}%
          </div>` : '<div></div>'}
      </div>

      <!-- Nome do Produto -->
      <div data-drag-el="nome" style="padding:4px 8px 2px;flex-shrink:0;transform:translate(${posNome.x}px,${posNome.y}px);cursor:grab;touch-action:none;z-index:2;">
        <div style="font-family:${estilo.fonteTitulo};font-weight:900;font-size:${fsDesc}px;line-height:1.1;color:${estilo.corTexto};text-transform:uppercase;max-height:${fsDesc * 2.3}px;overflow:hidden;text-overflow:ellipsis;word-break:break-word;">
          ${esc(item.descricao)}
        </div>
        ${item.apresentacao ? `<div style="font-size:${Math.round(fsDesc * 0.75)}px;font-weight:600;color:${estilo.corPrecoDe};line-height:1;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(item.apresentacao)}</div>` : ''}
      </div>

      <!-- Área Central: Foto (opcional) + Preço Destaque -->
      <div style="flex:1;display:flex;align-items:center;justify-content:space-between;padding:2px 8px;gap:6px;min-height:0;">
        ${fotoHtml}

        <div data-drag-el="preco" style="flex:1;display:flex;flex-direction:column;justify-content:center;${temFoto ? 'text-align:right;' : 'text-align:center;'}transform:translate(${posPreco.x}px,${posPreco.y}px);cursor:grab;touch-action:none;z-index:3;">
          ${estilo.exibirDePor && item.preco_normal > item.preco_promocional ? `
            <div style="font-size:${fsPrecoDe}px;font-weight:700;color:${estilo.corPrecoDe};text-decoration:line-through;line-height:1;">
              De: ${precoDeStr}
            </div>` : ''}

          <div style="display:inline-flex;align-items:baseline;justify-content:${temFoto ? 'flex-end' : 'center'};gap:3px;margin-top:1px;">
            <span style="font-family:${estilo.fonteTitulo};font-size:${Math.round(fsPreco * 0.42)}px;font-weight:900;color:${estilo.corPrecoPor};">POR R$</span>
            <span style="font-family:${estilo.fonteTitulo};font-size:${fsPreco}px;font-weight:900;line-height:0.95;color:${estilo.corPrecoPor};letter-spacing:-0.03em;">
              ${precoStr.replace('R$', '').trim()}
            </span>
          </div>

          ${estilo.exibirAvisoAvista ? `
            <div style="font-size:${fsAviso}px;font-weight:700;color:${estilo.corTexto};opacity:0.85;line-height:1;margin-top:2px;">
              ${esc(estilo.textoAviso)}
            </div>` : ''}
        </div>
      </div>

      <!-- Rodapé: Validade e Código de Barras -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:2px 8px 4px;border-top:1px dashed rgba(0,0,0,0.15);flex-shrink:0;">
        <div style="font-size:8px;font-weight:700;color:${estilo.corPrecoDe};">
          ${estilo.exibirValidade && dataValidade ? `Válido até: ${esc(dataValidade)}` : `Cód: ${item.produto_id}`}
        </div>
        ${barrasHtml}
      </div>
    </div>`;
}

export interface GridOverride {
  cols?: number;
  rows?: number;
  margemTopMm?: number;
  margemEsqMm?: number;
  gapColMm?: number;
  gapRowMm?: number;
}

// ─── GERADOR HTML DE FOLHA A4 COMPLETA DE ETIQUETAS (PIMACO & TÉRMICA) ───────────────────
export function htmlFolhaA4Etiquetas(
  itensPagina: (ItemEtiqueta | null)[],
  formato: FormatoEtiquetaConfig,
  estilo: EstiloEtiqueta,
  paginaNum: number,
  totalPaginas: number,
  dataValidade?: string,
  gridOverride?: GridOverride
): string {
  const grade = calcularGradeA4Otima(formato, itensPagina.length, gridOverride);
  const cols = grade.cols;
  const rows = grade.rows;
  const mTopMm = gridOverride?.margemTopMm ?? formato.margemTopMm ?? 8;
  const mEsqMm = gridOverride?.margemEsqMm ?? formato.margemEsqMm ?? 6;
  const gapColMm = gridOverride?.gapColMm ?? formato.gapColMm ?? 2;
  const gapRowMm = gridOverride?.gapRowMm ?? formato.gapRowMm ?? 1;

  const wMm = formato.wMm;
  const hMm = formato.hMm;

  // Calculamos dimensões em pixels para os elementos internos da etiqueta com fator 96/25.4 exato
  const etiquetaW = Math.round(wMm * 3.779527559);
  const etiquetaH = Math.round(hMm * 3.779527559);

  const slotsHtml = itensPagina.map(item => {
    if (!item) {
      return `<div style="width:${wMm}mm;height:${hMm}mm;box-sizing:border-box;border:1px dashed rgba(0,0,0,0.08);background:transparent;"></div>`;
    }
    return `
      <div style="width:${wMm}mm;height:${hMm}mm;overflow:hidden;box-sizing:border-box;">
        ${htmlEtiqueta(item, { ...formato, wPx: etiquetaW, hPx: etiquetaH }, estilo, dataValidade)}
      </div>`;
  }).join('');

  return `
    <div style="position:relative;width:210mm;height:297mm;max-height:297mm;background:#ffffff;box-sizing:border-box;padding-top:${mTopMm}mm;padding-left:${mEsqMm}mm;overflow:hidden;page-break-after:always;break-after:page;page-break-inside:avoid;break-inside:avoid;">
      <div style="display:grid;grid-template-columns:repeat(${cols}, ${wMm}mm);grid-template-rows:repeat(${rows}, ${hMm}mm);column-gap:${gapColMm}mm;row-gap:${gapRowMm}mm;max-height:calc(297mm - ${mTopMm}mm);overflow:hidden;">
        ${slotsHtml}
      </div>
      <div style="position:absolute;bottom:2mm;right:8mm;font-family:sans-serif;font-size:8px;color:#94a3b8;pointer-events:none;z-index:10;">
        BelaFarma • Folha ${paginaNum} de ${totalPaginas} (${formato.nome})
      </div>
    </div>`;
}

export interface CalculoGradeA4 {
  cols: number;
  rows: number;
  etiquetasPorFolha: number;
  totalFolhas: number;
  etiquetasUltimaFolha: number;
  slotsVaziosUltimaFolha: number;
  alturaUtilizadaMm: number;
  larguraUtilizadaMm: number;
  margemInferiorMm: number;
  margemDireitaMm: number;
  semCortes: boolean;
  resumoTexto: string;
}

/**
 * Calcula milimetricamente a grade A4 para garantir que NENHUMA etiqueta seja cortada no papel A4 (210 x 297 mm).
 */
export function calcularGradeA4Otima(
  formato: FormatoEtiquetaConfig,
  totalEtiquetas: number,
  gridOverride?: GridOverride
): CalculoGradeA4 {
  let cols = gridOverride?.cols ?? formato.cols ?? 2;
  let rows = gridOverride?.rows ?? formato.rows ?? 3;
  const mTopMm = gridOverride?.margemTopMm ?? formato.margemTopMm ?? 8;
  const mEsqMm = gridOverride?.margemEsqMm ?? formato.margemEsqMm ?? 6;
  const gapColMm = gridOverride?.gapColMm ?? formato.gapColMm ?? 2;
  const gapRowMm = gridOverride?.gapRowMm ?? formato.gapRowMm ?? 1;

  const wMm = formato.wMm;
  const hMm = formato.hMm;

  // Garante que a altura total não ultrapasse 282mm (respiro de segurança contra cortes de impressão)
  const maxAltura = formato.id === 'a4_pimaco_3x10' ? 297 : 282;
  let alturaTotal = mTopMm + (rows * hMm) + (Math.max(0, rows - 1) * gapRowMm);
  while (rows > 1 && alturaTotal > maxAltura) {
    rows -= 1;
    alturaTotal = mTopMm + (rows * hMm) + (Math.max(0, rows - 1) * gapRowMm);
  }

  // Garante que a largura total não ultrapasse 208mm
  const maxLargura = 208;
  let larguraTotal = mEsqMm + (cols * wMm) + (Math.max(0, cols - 1) * gapColMm);
  while (cols > 1 && larguraTotal > maxLargura) {
    cols -= 1;
    larguraTotal = mEsqMm + (cols * wMm) + (Math.max(0, cols - 1) * gapColMm);
  }

  const etiquetasPorFolha = cols * rows;
  const totalFolhas = Math.ceil(totalEtiquetas / etiquetasPorFolha) || 1;
  const resto = totalEtiquetas % etiquetasPorFolha;
  const etiquetasUltimaFolha = totalEtiquetas === 0 ? 0 : (resto === 0 ? etiquetasPorFolha : resto);
  const slotsVaziosUltimaFolha = totalEtiquetas === 0 ? etiquetasPorFolha : (resto === 0 ? 0 : etiquetasPorFolha - resto);

  const margemInferiorMm = Math.max(0, Math.round((297 - alturaTotal) * 10) / 10);
  const margemDireitaMm = Math.max(0, Math.round((210 - larguraTotal) * 10) / 10);
  const semCortes = alturaTotal <= 297 && larguraTotal <= 210;

  const resumoTexto = `${etiquetasPorFolha} etiquetas/folha (${cols} col x ${rows} lin) • ${totalFolhas} folha${totalFolhas > 1 ? 's' : ''} A4 • 100% sem cortes`;

  return {
    cols,
    rows,
    etiquetasPorFolha,
    totalFolhas,
    etiquetasUltimaFolha,
    slotsVaziosUltimaFolha,
    alturaUtilizadaMm: Math.round(alturaTotal * 10) / 10,
    larguraUtilizadaMm: Math.round(larguraTotal * 10) / 10,
    margemInferiorMm,
    margemDireitaMm,
    semCortes,
    resumoTexto
  };
}
