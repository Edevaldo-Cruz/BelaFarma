/**
 * encarteTemplates.ts
 * Motor de design do Encarte Tabloide (A4) e das Artes Unitárias (Story 9:16 / Feed 4:5)
 * da BelaFarma Sul.
 *
 * Uma única fonte da verdade: as mesmas strings HTML alimentam o preview na tela
 * e a exportação (PNG / PDF / ZIP via html2canvas), garantindo que "o que você vê é o que baixa".
 *
 * Observação: html2canvas NÃO suporta `filter: drop-shadow`, `mix-blend-mode` nem `clip-path`
 * de forma confiável. Por isso sombras de produto são elipses com radial-gradient e as
 * ondas decorativas são SVG inline.
 */
import html2canvas from 'html2canvas';

// ─── IDENTIDADE & DADOS DA LOJA ───────────────────────────────────────────────
export const LOJA = {
  nome: 'BELA FARMA SUL',
  endereco: 'Ipiranga, Juiz de Fora - MG',
  horario: '', // Ex.: 'Seg a Sáb: 07h às 22h | Dom: 08h às 20h' (omitido se vazio)
  whatsapp: '(32) 9822-8189',
  site: '', // Ex.: '@belafarmasul' (omitido se vazio)
  pagamentos: 'Pix • Cartão de Crédito e Débito • Dinheiro',
  aviso: 'Imagens meramente ilustrativas. Ofertas válidas enquanto durarem os estoques.',
  campanha: 'FESTIVAL DE ANIVERSÁRIO • 1 ANO BELA FARMA SUL',
  tituloTopo: 'MEGA',
  titulo: 'LIQUIDAÇÃO'
};

export interface CoordenadasElemento {
  x: number;
  y: number;
}

export interface PosicoesArte {
  foto?: CoordenadasElemento;
  nome?: CoordenadasElemento;
  preco?: CoordenadasElemento;
  validade?: CoordenadasElemento;
  titulo?: CoordenadasElemento;
  selo?: CoordenadasElemento;
}

export interface EstiloArte {
  temaId?: string;
  // Cores
  corFundo: string;
  corPrimaria: string;
  corSecundaria: string;
  corDestaque: string;
  corPrecoDe: string;
  corPrecoPor: string;
  corTexto: string;
  // Fontes
  fonteTitulo: string;
  fonteCorpo: string;
  tamanhoTituloMultiplicador: number; // 0.8 a 1.4
  tamanhoPrecoMultiplicador: number; // 0.8 a 1.4
  // Embalagem e Imagem
  zoomProduto: number; // 0.7 a 1.3
  offsetYProduto: number; // -30 a 30 (px)
  exibirSombraProduto: boolean;
  usarRecorteTransparente: boolean;
  // Elementos e Selos
  exibirLogo: boolean;
  exibirFarmaceutica: boolean;
  exibirSeloDesconto: boolean;
  exibirRodape: boolean;
  exibirValidade: boolean;
  tituloCampanhaTopo: string;
  tituloPrincipal: string;
  imagemFundoCustom?: string;
  // Posições personalizadas (arrastar e soltar)
  posicoes?: PosicoesArte;
}

export const ESTILO_PADRAO: EstiloArte = {
  temaId: 'bela_farma_sul',
  corFundo: '#ffffff',
  corPrimaria: '#c8102e',
  corSecundaria: '#0b3b82',
  corDestaque: '#c8102e',
  corPrecoDe: '#64748b',
  corPrecoPor: '#ffffff',
  corTexto: '#0b3b82',
  fonteTitulo: "'Montserrat', 'Arial Black', sans-serif",
  fonteCorpo: "'Segoe UI', Arial, sans-serif",
  tamanhoTituloMultiplicador: 1,
  tamanhoPrecoMultiplicador: 1,
  zoomProduto: 1,
  offsetYProduto: 0,
  exibirSombraProduto: true,
  usarRecorteTransparente: true,
  exibirLogo: false,
  exibirFarmaceutica: false,
  exibirSeloDesconto: true,
  exibirRodape: false,
  exibirValidade: true,
  tituloCampanhaTopo: 'BELA FARMA SUL • CUIDAR DE VOCÊ',
  tituloPrincipal: 'OFERTA ESPECIAL',
  imagemFundoCustom: '/images/tema-bela-farma-sul.png'
};

export const TEMAS_PRONTOS: Record<string, { nome: string; descricao: string; estilo: Partial<EstiloArte> }> = {
  bela_farma_sul: {
    nome: '🏥 BelaFarma Sul (Papel Timbrado Oficial)',
    descricao: 'Template com logo oficial BelaFarma Sul, ondas azul/vermelha e selo Cuidar/Saúde/Bem-Estar',
    estilo: {
      corFundo: '#ffffff',
      corPrimaria: '#c8102e',
      corSecundaria: '#0b3b82',
      corDestaque: '#c8102e',
      corPrecoDe: '#64748b',
      corPrecoPor: '#ffffff',
      corTexto: '#0b3b82',
      fonteTitulo: "'Montserrat', 'Arial Black', sans-serif",
      tituloCampanhaTopo: 'BELA FARMA SUL • CUIDAR DE VOCÊ',
      tituloPrincipal: 'OFERTA ESPECIAL',
      exibirLogo: false,
      exibirRodape: false,
      exibirFarmaceutica: false,
      imagemFundoCustom: '/images/tema-bela-farma-sul.png'
    }
  },
  aniversario: {
    nome: '🎂 Aniversário BelaFarma (Oficial)',
    descricao: 'Vermelho Farma, Azul Profissional e Dourado',
    estilo: {
      corFundo: '#ffffff',
      corPrimaria: '#d6192b',
      corSecundaria: '#1f4fa8',
      corDestaque: '#ffc20e',
      corPrecoDe: '#64748b',
      corPrecoPor: '#ffffff',
      corTexto: '#0f172a',
      fonteTitulo: "Impact, 'Arial Black', sans-serif",
      tituloCampanhaTopo: '🎂 1º ANIVERSÁRIO BELA FARMA SUL',
      tituloPrincipal: 'MEGA LIQUIDAÇÃO',
      exibirLogo: true,
      exibirRodape: true,
      exibirFarmaceutica: true,
      imagemFundoCustom: ''
    }
  },
  liquidacao: {
    nome: '🔥 Liquidação Explosiva (Amarelo & Vermelho)',
    descricao: 'Alto impacto visual, cores quentes de varejo',
    estilo: {
      corFundo: '#fffdf5',
      corPrimaria: '#dc2626',
      corSecundaria: '#ea580c',
      corDestaque: '#f59e0b',
      corPrecoDe: '#78350f',
      corPrecoPor: '#ffffff',
      corTexto: '#1e293b',
      fonteTitulo: "Impact, 'Arial Black', sans-serif",
      tituloCampanhaTopo: '🔥 LIQUIDAÇÃO TOTAL DE ESTOQUE',
      tituloPrincipal: 'PREÇO DE CUSTO'
    }
  },
  farmacia_azul: {
    nome: '💊 Farmácia & Confiança (Azul & Turquesa)',
    descricao: 'Design clean, clínico e moderno',
    estilo: {
      corFundo: '#f8fafc',
      corPrimaria: '#0284c7',
      corSecundaria: '#0f766e',
      corDestaque: '#e11d48',
      corPrecoDe: '#64748b',
      corPrecoPor: '#ffffff',
      corTexto: '#0f172a',
      fonteTitulo: "'Montserrat', 'Arial Black', sans-serif",
      tituloCampanhaTopo: '💊 BELA FARMA • CUIDANDO DA SUA SAÚDE',
      tituloPrincipal: 'FESTIVAL DA SAÚDE'
    }
  },
  beleza_rosa: {
    nome: '✨ Beleza & Cosméticos (Rosa & Roxo)',
    descricao: 'Perfeito para skincare, protetor e perfumaria',
    estilo: {
      corFundo: '#fdf4ff',
      corPrimaria: '#be185d',
      corSecundaria: '#7e22ce',
      corDestaque: '#fbbf24',
      corPrecoDe: '#831843',
      corPrecoPor: '#ffffff',
      corTexto: '#374151',
      fonteTitulo: "'Poppins', 'Montserrat', sans-serif",
      tituloCampanhaTopo: '✨ BELEZA, CABELOS & PERFUMARIA',
      tituloPrincipal: 'SEMANA DA BELEZA'
    }
  },
  black_gold: {
    nome: '⚡ Black & Dourado (Premium / Noturno)',
    descricao: 'Preto luxo com dourado metálico e neon',
    estilo: {
      corFundo: '#0f172a',
      corPrimaria: '#eab308',
      corSecundaria: '#334155',
      corDestaque: '#ef4444',
      corPrecoDe: '#94a3b8',
      corPrecoPor: '#fde047',
      corTexto: '#f8fafc',
      fonteTitulo: "Impact, 'Arial Black', sans-serif",
      tituloCampanhaTopo: '⚡ OFERTA RELÂMPAGO EXCLUSIVA',
      tituloPrincipal: 'OPORTUNIDADE ÚNICA'
    }
  }
};

export const FONTES_DISPONIVEIS = [
  { id: "Impact, 'Arial Black', sans-serif", nome: 'Impact (Varejo Forte)' },
  { id: "'Montserrat', 'Arial Black', sans-serif", nome: 'Montserrat (Moderna/Bold)' },
  { id: "'Poppins', sans-serif", nome: 'Poppins (Geométrica Limpa)' },
  { id: "'Inter', sans-serif", nome: 'Inter (Alta Legibilidade)' },
  { id: "'Segoe UI', Arial, sans-serif", nome: 'Segoe UI (Padrão Windows)' }
];

const IMG_LOGO = '/images/logo-bela-farma.jpg';
const IMG_PLACEHOLDER = '/images/logo-icon.png';
export const IMG_FIGURA = '/images/figura-farmaceutica.jpg';

export interface ItemArte {
  produto_id: number;
  descricao: string;
  apresentacao?: string;
  preco_normal: number;
  preco_promocional: number;
  desconto_percentual: number;
  imagem_url?: string;
}

export interface PeriodoArte {
  inicio: string; // dd/mm/aaaa
  termino: string; // dd/mm/aaaa
}

export type FormatoUnitario = 'story' | 'feed';

export const DIMENSOES_UNITARIO: Record<FormatoUnitario, { w: number; h: number }> = {
  story: { w: 540, h: 960 }, // 9:16  → 1080x1920 em scale 2
  feed: { w: 540, h: 675 } // 4:5   → 1080x1350 em scale 2
};
export const DIMENSOES_A4 = { w: 794, h: 1123 };

// ─── RECORTE AUTOMÁTICO DE FUNDO (PNG transparente) ───────────────────────────
const cacheImagens = new Map<string, string>();
const pendentes = new Map<string, Promise<string>>();

/** Retorna a versão já recortada (se processada) ou a URL original. */
export const getImagemPronta = (url?: string): string => {
  if (!url) return '';
  return cacheImagens.get(url) ?? url;
};

const carregarImagem = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('falha ao carregar ' + url));
    img.src = url;
  });

/**
 * Remove o fundo branco/claro conectado às bordas (flood-fill), suaviza a borda
 * e recorta o excesso transparente com tolerância configurável.
 */
export async function recortarFundo(url: string, sensibilidade: number = 25): Promise<string> {
  try {
    const img = await carregarImagem(url);
    const maxLado = 2048;
    const escala = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight));
    const W = Math.max(1, Math.round(img.naturalWidth * escala));
    const H = Math.max(1, Math.round(img.naturalHeight * escala));

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return url;

    ctx.drawImage(img, 0, 0, W, H);
    const idata = ctx.getImageData(0, 0, W, H);
    const d = idata.data;
    const total = W * H;

    const t = Math.max(160, 255 - Math.round(sensibilidade * 1.5));
    const limiarClaro = (i: number) => {
      const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
      if (a < 30) return true;
      if (r > t && g > t && b > t) return true;
      const media = (r + g + b) / 3;
      const maxDiff = Math.max(Math.abs(r - g), Math.abs(r - b), Math.abs(g - b));
      return media > (t - 15) && maxDiff < (10 + Math.round(sensibilidade * 0.4));
    };

    const visitado = new Uint8Array(total);
    const fila = new Int32Array(total);
    let head = 0, tail = 0;

    const empilhar = (idx: number) => {
      if (idx < 0 || idx >= total || visitado[idx]) return;
      visitado[idx] = 1;
      if (limiarClaro(idx * 4)) fila[tail++] = idx;
    };

    for (let x = 0; x < W; x++) { empilhar(x); empilhar((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { empilhar(y * W); empilhar(y * W + (W - 1)); }

    while (head < tail) {
      const cur = fila[head++];
      const cx = cur % W;
      const cy = (cur / W) | 0;
      if (cx > 0) empilhar(cur - 1);
      if (cx < W - 1) empilhar(cur + 1);
      if (cy > 0) empilhar(cur - W);
      if (cy < H - 1) empilhar(cur + W);
    }

    const removidos = tail;
    if (removidos < total * 0.03 || removidos > total * 0.94) return url;

    for (let i = 0; i < total; i++) {
      if (visitado[i]) {
        const off = i * 4;
        d[off] = 0; d[off + 1] = 0; d[off + 2] = 0; d[off + 3] = 0;
      }
    }
    ctx.putImageData(idata, 0, 0);

    let minX = W, minY = H, maxX = 0, maxY = 0;
    const finalData = ctx.getImageData(0, 0, W, H).data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (finalData[(y * W + x) * 4 + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (minX > maxX || minY > maxY) return url;

    const pad = 4;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(W - 1, maxX + pad);
    maxY = Math.min(H - 1, maxY + pad);
    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cctx = cropCanvas.getContext('2d');
    if (!cctx) return url;

    cctx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
    return cropCanvas.toDataURL('image/png');
  } catch {
    return url;
  }
}

export function prepararImagem(url?: string): Promise<string> {
  if (!url) return Promise.resolve('');
  if (cacheImagens.has(url)) return Promise.resolve(cacheImagens.get(url)!);
  if (pendentes.has(url)) return pendentes.get(url)!;

  const p = recortarFundo(url)
    .then(res => {
      cacheImagens.set(url, res);
      pendentes.delete(url);
      return res;
    })
    .catch(() => {
      cacheImagens.set(url, url);
      pendentes.delete(url);
      return url;
    });

  pendentes.set(url, p);
  return p;
}

export async function prepararImagensArte(itens: ItemArte[]): Promise<void> {
  const urls = Array.from(new Set(itens.map(i => i.imagem_url).filter(Boolean) as string[]));
  for (let i = 0; i < urls.length; i += 6) {
    await Promise.all(urls.slice(i, i + 6).map(u => prepararImagem(u)));
  }
  await prepararImagem(IMG_FIGURA);
  await prepararImagem('/images/tema-bela-farma-sul.png');
}

// ─── AUXILIARES DE FORMATAÇÃO E CÁLCULO ─────────────────────────────────────────
const esc = (s = '') =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const brl = (v: number) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const calc = (it: ItemArte) => {
  const promo = Number(it.preco_promocional) || 0;
  const normal = Number(it.preco_normal) || promo;
  let pct = Math.round(Number(it.desconto_percentual) || 0);
  if (pct <= 0 && normal > promo && normal > 0) {
    pct = Math.round(((normal - promo) / normal) * 100);
  }
  const eco = normal > promo ? normal - promo : 0;
  return { promo, normal, pct, eco };
};

const precoHtml = (valor: number, fontSize: number, corNum = '#ffffff') => {
  const [inteiro, centavos = '00'] = (valor || 0).toFixed(2).split('.');
  const fsInt = fontSize;
  const fsCents = Math.round(fontSize * 0.44);
  const fsCifrao = Math.round(fontSize * 0.34);
  return `
    <span style="display:inline-flex;align-items:baseline;line-height:1.15;padding:2px 0;font-family:Impact, 'Arial Black', sans-serif;font-weight:900;color:${corNum};vertical-align:middle;">
      <span style="font-size:${fsCifrao}px;margin-right:2px;opacity:0.92;line-height:1;">R$</span>
      <span style="font-size:${fsInt}px;letter-spacing:-1px;line-height:1;display:inline-block;padding:0 1px;">${inteiro}</span>
      <span style="font-size:${fsCents}px;margin-left:1px;text-decoration:underline;text-underline-offset:2px;line-height:1;display:inline-block;">,${centavos}</span>
    </span>`;
};

// ─── BLOCOS GRÁFICOS SVG E COMPONENTES VISUAIS ────────────────────────────────
const burst = (s: number, fill: string, stroke: string, spikes = 16) => {
  let pts = '';
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 48 : 40;
    const a = (Math.PI * i) / spikes - Math.PI / 2;
    pts += `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)} `;
  }
  return `<svg width="${s}" height="${s}" viewBox="0 0 100 100" style="position:absolute;left:0;top:0;"><polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/></svg>`;
};

const seloDesconto = (pct: number, size: number, corFundo: string, corBorda: string, corOff: string, fontTitulo: string, fontCorpo: string) => {
  if (pct <= 0) return '';
  return `<div style="position:relative;width:${size}px;height:${size}px;flex:none;">
    ${burst(size, corFundo, corBorda)}
    <div style="position:absolute;left:0;top:0;width:${size}px;height:${size}px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:${fontTitulo};line-height:.95;">
      <span style="font-size:${Math.round(size * 0.3)}px;">-${pct}%</span>
      <span style="font-size:${Math.round(size * 0.16)}px;letter-spacing:1px;color:${corOff};font-family:${fontCorpo};font-weight:900;">OFF</span>
    </div>
  </div>`;
};

const sombraChao = (altura: number) =>
  `<div style="position:absolute;left:15%;bottom:0;width:70%;height:${altura}px;background:radial-gradient(ellipse at center, rgba(15,23,42,0.32) 0%, rgba(15,23,42,0) 70%);"></div>`;

const imgProduto = (it: ItemArte, estilo = '', usarRecorte = true, zoom = 1, offsetY = 0) => {
  const src = usarRecorte ? getImagemPronta(it.imagem_url) : (it.imagem_url || '');
  const transform = `transform: scale(${zoom}) translateY(${offsetY}px); transform-origin: center bottom; image-rendering: high-quality;`;
  if (!src) {
    return `<img src="${IMG_PLACEHOLDER}" style="position:absolute;left:18%;top:18%;width:64%;height:64%;object-fit:contain;opacity:0.35;${transform}${estilo}" />`;
  }
  return `<img src="${esc(src)}" style="position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;${transform}${estilo}" />`;
};

const ondaTopo = (W: number, H: number, id: string, c1: string, c2: string, cAcento: string) => `
  <svg width="${W}" height="${H}" viewBox="0 0 800 300" preserveAspectRatio="none" style="position:absolute;left:0;top:0;">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${c1}"/>
        <stop offset="0.6" stop-color="${c1}"/>
        <stop offset="1" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <path d="M0 0H800V225C650 292 470 205 305 248C185 280 85 252 0 276Z" fill="url(#${id})"/>
    <path d="M0 286C125 254 205 288 335 254C470 216 655 300 800 236V252C655 316 472 232 338 270C205 302 112 274 0 302Z" fill="${c2}"/>
    <path d="M0 270C120 240 200 272 330 240C470 204 650 286 800 224" fill="none" stroke="${cAcento}" stroke-width="3"/>
  </svg>`;

const ondaBase = (W: number, H: number, id: string, c1: string, c2: string, cAcento: string) => `
  <svg width="${W}" height="${H}" viewBox="0 0 800 160" preserveAspectRatio="none" style="position:absolute;left:0;top:0;">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${c1}"/>
        <stop offset="0.55" stop-color="${c1}"/>
        <stop offset="1" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <path d="M0 40C150 0 300 62 470 26C620 -4 720 32 800 10V160H0Z" fill="url(#${id})"/>
    <path d="M0 36C150 -4 300 58 470 22C620 -8 720 28 800 6" fill="none" stroke="${cAcento}" stroke-width="3"/>
  </svg>`;

const placaLogo = (w: number, h: number, left: number, top: number) => `
  <div style="position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px;background:#fff;border-radius:${Math.round(h * 0.2)}px;box-shadow:0 6px 16px rgba(11,31,71,0.28);padding:4px;box-sizing:border-box;">
    <img src="${IMG_LOGO}" style="width:100%;height:100%;object-fit:contain;" />
  </div>`;

const faixaValidade = (periodo: PeriodoArte, W: number, top: number, fs: number, h: number, corFundo: string, corTexto: string, fontCorpo: string) => `
  <div style="position:absolute;left:${Math.round(W * 0.05)}px;top:${top}px;width:${Math.round(W * 0.9)}px;height:${h}px;background:${corFundo};border-radius:${h}px;box-shadow:0 4px 10px rgba(11,31,71,0.3);display:flex;align-items:center;justify-content:center;color:${corTexto};font-family:${fontCorpo};font-weight:900;font-size:${fs}px;letter-spacing:0.3px;text-align:center;white-space:nowrap;">
    OFERTAS VÁLIDAS DE ${periodo.inicio} A ${periodo.termino} OU ENQUANTO DURAR O ESTOQUE
  </div>`;

const tituloPromo = (fsTopo: number, fsTitulo: number, textoTopo: string, textoPrincipal: string, corDestaque: string, corSecundaria: string, fontTitulo: string) => `
  <div style="font-family:${fontTitulo};text-align:left;line-height:0.95;">
    <div style="font-size:${fsTopo}px;color:#fff;letter-spacing:3px;text-shadow:2px 2px 0 ${corSecundaria};">${esc(textoTopo)}</div>
    <div style="font-size:${fsTitulo}px;color:${corDestaque};letter-spacing:1px;font-style:italic;text-shadow:3px 3px 0 ${corSecundaria}, 5px 5px 0 #0b1f47, 0 9px 14px rgba(0,0,0,0.35);">${esc(textoPrincipal)}</div>
  </div>`;

const fitaCampanha = (fs: number, pad: string, texto: string, corFundo: string, corTexto: string, corBorda: string, fontCorpo: string) => `
  <div style="display:inline-block;background:${corFundo};color:${corTexto};font-family:${fontCorpo};font-weight:900;font-size:${fs}px;letter-spacing:0.6px;padding:${pad};border-radius:6px;border-left:5px solid ${corBorda};white-space:nowrap;">${esc(texto)}</div>`;

const rodapeHtml = (W: number, H: number, id: string, fs: number, extraDireita = '', c1: string, c2: string, cAcento: string, fontCorpo: string) => {
  const linhas: string[] = [];
  const contato = `<span style="font-size:${Math.round(fs * 1.55)}px;font-weight:900;color:${cAcento};">🛵 WHATSAPP ${esc(LOJA.whatsapp)}</span><span style="margin-left:10px;font-weight:800;">ENTREGA RÁPIDA${LOJA.site ? ' • ' + esc(LOJA.site) : ''}</span>`;
  linhas.push(`<div style="white-space:nowrap;">${contato}</div>`);
  const loc = [`📍 ${esc(LOJA.endereco)}`, LOJA.horario ? `🕒 ${esc(LOJA.horario)}` : ''].filter(Boolean).join('  |  ');
  linhas.push(`<div style="white-space:nowrap;font-weight:800;">${loc}</div>`);
  linhas.push(`<div style="white-space:nowrap;font-size:${Math.round(fs * 0.82)}px;opacity:0.95;">💳 ${esc(LOJA.pagamentos)}${extraDireita ? '   |   ' + extraDireita : ''}</div>`);
  linhas.push(`<div style="white-space:nowrap;font-size:${Math.round(fs * 0.74)}px;opacity:0.85;">${esc(LOJA.aviso)}</div>`);
  return `
    <div style="position:absolute;left:0;bottom:0;width:${W}px;height:${H}px;">
      ${ondaBase(W, H, id, c1, c2, cAcento)}
      <div style="position:absolute;left:0;right:0;bottom:${Math.round(H * 0.07)}px;text-align:center;color:#fff;font-family:${fontCorpo};font-size:${fs}px;line-height:1.38;">
        ${linhas.join('')}
      </div>
    </div>`;
};

// ─── ARTE UNITÁRIA (STORY 9:16 / FEED 4:5) ────────────────────────────────────
export function htmlArteUnitaria(
  item: ItemArte,
  formato: FormatoUnitario,
  periodo: PeriodoArte,
  estiloCustom?: Partial<EstiloArte>
): string {
  const e: EstiloArte = { ...ESTILO_PADRAO, ...estiloCustom };
  const { w: W, h: H } = DIMENSOES_UNITARIO[formato];
  const story = formato === 'story';
  const { promo, normal, pct, eco } = calc(item);
  const temFundoCustom = !!e.imagemFundoCustom;

  // Posições personalizadas dos elementos (arrastar e soltar)
  const posFoto = e.posicoes?.foto || { x: 0, y: 0 };
  const posNome = e.posicoes?.nome || { x: 0, y: 0 };
  const posPreco = e.posicoes?.preco || { x: 0, y: 0 };
  const posValidade = e.posicoes?.validade || { x: 0, y: 0 };
  const posTitulo = e.posicoes?.titulo || { x: 0, y: 0 };
  const posSelo = e.posicoes?.selo || { x: 0, y: 0 };

  // Usamos object-fit: fill para que textos e artes laterais do fundo timbrado oficial
  // nunca sejam recortados nas laterais em Story (9:16) ou Feed (4:5)
  const bgCustomHtml = temFundoCustom
    ? `<img src="${esc(e.imagemFundoCustom)}" style="position:absolute;left:0;top:0;width:${W}px;height:${H}px;object-fit:fill;pointer-events:none;z-index:0;" />`
    : '';

  const headerH = temFundoCustom
    ? (story ? 150 : 105)
    : (story ? 285 : 195);
  const footerH = temFundoCustom
    ? (story ? 155 : 110)
    : (e.exibirRodape ? (story ? 170 : 128) : 20);
  const bodyTop = headerH + (story ? 12 : 8);
  const bodyH = H - bodyTop - footerH;

  const fsTopo = Math.round((story ? 30 : 22) * e.tamanhoTituloMultiplicador);
  const fsPrincipal = Math.round((story ? 70 : 52) * e.tamanhoTituloMultiplicador);

  const header = temFundoCustom
    ? ''
    : (story
        ? `${ondaTopo(W, headerH, 'gHu', e.corPrimaria, e.corSecundaria, e.corDestaque)}
           ${e.exibirLogo ? placaLogo(168, 84, 24, 20) : ''}
           <div data-drag-el="titulo" style="position:absolute;left:${(e.exibirLogo ? 214 : 26) + posTitulo.x}px;top:${34 + posTitulo.y}px;cursor:grab;touch-action:none;">${fitaCampanha(11, '5px 10px', e.tituloCampanhaTopo, e.corSecundaria, e.corDestaque, e.corDestaque, e.fonteCorpo)}</div>
           <div style="position:absolute;left:${30 + posTitulo.x}px;top:${118 + posTitulo.y}px;cursor:grab;touch-action:none;">${tituloPromo(fsTopo, fsPrincipal, LOJA.tituloTopo, e.tituloPrincipal, e.corDestaque, e.corSecundaria, e.fonteTitulo)}</div>`
        : `${ondaTopo(W, headerH, 'gHu', e.corPrimaria, e.corSecundaria, e.corDestaque)}
           ${e.exibirLogo ? placaLogo(130, 65, 22, 14) : ''}
           <div data-drag-el="titulo" style="position:absolute;left:${(e.exibirLogo ? 170 : 22) + posTitulo.x}px;top:${26 + posTitulo.y}px;cursor:grab;touch-action:none;">${fitaCampanha(9.5, '4px 8px', e.tituloCampanhaTopo, e.corSecundaria, e.corDestaque, e.corDestaque, e.fonteCorpo)}</div>
           <div style="position:absolute;left:${28 + posTitulo.x}px;top:${84 + posTitulo.y}px;cursor:grab;touch-action:none;">${tituloPromo(fsTopo, fsPrincipal, LOJA.tituloTopo, e.tituloPrincipal, e.corDestaque, e.corSecundaria, e.fonteTitulo)}</div>`
      );

  const stageW = story ? 320 : 220;
  const stageH = story ? 260 : 220;
  const stageLeft = story ? Math.round((W - stageW) / 2) : 18;
  const stageTop = story ? (temFundoCustom ? 175 : 240) : (temFundoCustom ? 130 : 180);

  const palco = `
    <div data-drag-el="foto" style="position:absolute;left:${stageLeft + posFoto.x}px;top:${stageTop + posFoto.y}px;width:${stageW}px;height:${stageH}px;cursor:grab;touch-action:none;z-index:3;">
      <div style="position:absolute;left:50%;top:50%;width:${stageW - 20}px;height:${stageW - 20}px;margin-left:${-(stageW - 20) / 2}px;margin-top:${-(stageW - 20) / 2 - 6}px;border-radius:50%;background:radial-gradient(circle at 50% 45%, #ffffff 0%, #e6efff 62%, rgba(230,239,255,0) 72%);"></div>
      <div style="position:absolute;left:${story ? 20 : 12}px;top:${story ? 8 : 8}px;right:${story ? 20 : 12}px;bottom:${story ? 20 : 16}px;">
        ${imgProduto(item, '', e.usarRecorteTransparente, e.zoomProduto, e.offsetYProduto)}
      </div>
      ${e.exibirSombraProduto ? `<div style="position:absolute;left:0;right:0;bottom:0;height:22px;">${sombraChao(20)}</div>` : ''}
      ${e.exibirSeloDesconto ? `<div data-drag-el="selo" style="position:absolute;right:${(story ? -20 : -15) - posSelo.x}px;top:${(-5) + posSelo.y}px;cursor:grab;touch-action:none;z-index:4;">${seloDesconto(pct, story ? 105 : 82, e.corPrimaria, e.corDestaque, '#ffe27a', e.fonteTitulo, e.fonteCorpo)}</div>` : ''}
    </div>`;

  const nomeW = story ? 480 : 265;
  const nomeLeft = story ? Math.round((W - nomeW) / 2) : 255;
  const nomeTop = story ? (temFundoCustom ? 450 : 515) : (temFundoCustom ? 135 : 185);

  const nomeFs = story ? 24 : 18;
  const nomeLh = Math.round(nomeFs * 1.25);
  const nomeBloco = `
    <div data-drag-el="nome" style="position:absolute;left:${nomeLeft + posNome.x}px;top:${nomeTop + posNome.y}px;width:${nomeW}px;box-sizing:border-box;cursor:grab;touch-action:none;z-index:3;">
      <div style="font-family:${e.fonteCorpo};font-weight:900;color:${e.corTexto};text-transform:uppercase;text-align:${story ? 'center' : 'left'};font-size:${nomeFs}px;line-height:${nomeLh}px;max-height:${nomeLh * 2 + 10}px;padding:2px 2px;overflow:hidden;word-break:break-word;overflow-wrap:break-word;box-sizing:border-box;">${esc(item.descricao)}</div>
      ${item.apresentacao ? `<div style="font-family:${e.fonteCorpo};font-weight:700;color:#64748b;text-align:${story ? 'center' : 'left'};font-size:${story ? 14 : 12}px;margin-top:2px;padding:1px 0;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(item.apresentacao)}</div>` : ''}
    </div>`;

  const precoW = story ? 400 : 260;
  const precoLeft = story ? Math.round((W - precoW) / 2) : 255;
  const precoTop = story ? (temFundoCustom ? 545 : 610) : (temFundoCustom ? 245 : 295);

  const tamPreco = Math.round((story ? 84 : 52) * e.tamanhoPrecoMultiplicador);
  const corDeEfetiva = (e.corPrecoDe === '#64748b' || !e.corPrecoDe) ? '#cbd5e1' : e.corPrecoDe;
  const corPorLabel = (e.corDestaque === '#c8102e' || e.corDestaque === '#d6192b' || e.corDestaque === '#dc2626') ? '#fde047' : e.corDestaque;

  const badgePreco = `
    <div data-drag-el="preco" style="position:absolute;left:${precoLeft + posPreco.x}px;top:${precoTop + posPreco.y}px;width:${precoW}px;background:linear-gradient(160deg, ${e.corSecundaria} 0%, #061a3d 100%);border-radius:${story ? 24 : 18}px;padding:${story ? '12px 18px 24px' : '8px 12px 18px'};box-sizing:border-box;box-shadow:0 8px 18px rgba(11,31,71,0.35);text-align:center;border:3px solid ${e.corDestaque};cursor:grab;touch-action:none;z-index:3;">
      ${normal > promo ? `<div style="font-family:${e.fonteCorpo};font-weight:800;color:${corDeEfetiva};font-size:${story ? 16 : 12}px;text-decoration:line-through;line-height:1.2;margin-bottom:2px;">DE ${brl(normal)}</div>` : ''}
      <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin:2px 0;">
        <span style="font-family:${e.fonteCorpo};font-weight:900;color:${corPorLabel};font-size:${story ? 20 : 15}px;line-height:1;">POR</span>
        ${precoHtml(promo, tamPreco, e.corPrecoPor)}
      </div>
      ${eco > 0 ? `<div style="position:absolute;left:50%;bottom:-14px;margin-left:${story ? -100 : -75}px;width:${story ? 200 : 150}px;height:${story ? 28 : 22}px;background:${e.corDestaque};color:#ffffff;border-radius:30px;display:flex;align-items:center;justify-content:center;font-family:${e.fonteCorpo};font-weight:900;font-size:${story ? 13 : 10.5}px;box-shadow:0 3px 8px rgba(0,0,0,0.3);white-space:nowrap;z-index:4;">VOCÊ ECONOMIZA ${brl(eco)}</div>` : ''}
    </div>`;

  const valW = story ? 480 : 490;
  const valLeft = story ? Math.round((W - valW) / 2) : 25;
  const valTop = story ? (temFundoCustom ? 735 : 780) : (temFundoCustom ? 495 : 535);

  const faixaValidadeBloco = e.exibirValidade
    ? `<div data-drag-el="validade" style="position:absolute;left:${valLeft + posValidade.x}px;top:${valTop + posValidade.y}px;width:${valW}px;text-align:center;cursor:grab;touch-action:none;z-index:4;">
        <div style="font-family:${e.fonteCorpo};font-weight:800;font-size:${story ? 12 : 10}px;color:${temFundoCustom ? '#1e293b' : e.corTexto};letter-spacing:0.5px;text-align:center;white-space:nowrap;line-height:1.2;">
          OFERTAS VÁLIDAS DE ${periodo.inicio} A ${periodo.termino} OU ENQUANTO DURAR O ESTOQUE
        </div>
      </div>`
    : '';

  return `
    <div style="position:relative;width:${W}px;height:${H}px;background:${e.corFundo};overflow:hidden;font-family:${e.fonteCorpo};box-sizing:border-box;">
      ${bgCustomHtml}
      ${!temFundoCustom ? `
        <div style="position:absolute;right:-90px;top:${headerH}px;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle, rgba(31,79,168,0.08) 0%, rgba(31,79,168,0) 70%);"></div>
        <div style="position:absolute;left:-80px;top:${H - footerH - 300}px;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle, rgba(214,25,43,0.07) 0%, rgba(214,25,43,0) 70%);"></div>
      ` : ''}
      <div style="position:relative;width:100%;height:100%;z-index:2;">
        ${header}
        ${palco}
        ${nomeBloco}
        ${badgePreco}
        ${faixaValidadeBloco}
        ${!temFundoCustom && e.exibirRodape ? rodapeHtml(W, footerH, 'gFu', story ? 13 : 10.5, '', e.corPrimaria, e.corSecundaria, e.corDestaque, e.fonteCorpo) : ''}
      </div>
    </div>`;
}

// ─── ENCARTE TABLOIDE A4 ──────────────────────────────────────────────────────
interface OpcoesCard { estrela: boolean; k: number; estilo: EstiloArte }

const cardProduto = (it: ItemArte, { estrela, k, estilo }: OpcoesCard, extraStyle = '') => {
  const { promo, normal, pct } = calc(it);
  const bordaEstrela = estrela ? `border:3px solid ${estilo.corDestaque};box-shadow:0 8px 22px rgba(214,25,43,0.28);` : 'box-shadow:0 4px 14px rgba(18,48,107,0.14);';
  const nomeFs = Math.round(11.5 * k);
  const nomeLh = Math.round(nomeFs * 1.18);
  return `
    <div style="position:relative;min-height:0;min-width:0;background:#fff;border-radius:${estrela ? 22 : 16}px;overflow:hidden;display:flex;flex-direction:column;box-sizing:border-box;${bordaEstrela}${extraStyle}">
      ${estrela ? `<div style="position:absolute;left:0;top:0;right:0;height:${Math.round(22 * k * 0.85)}px;background:linear-gradient(90deg, ${estilo.corPrimaria}, #a50f20);color:${estilo.corDestaque};font-family:${estilo.fonteTitulo};font-size:${Math.round(14 * k * 0.85)}px;letter-spacing:2px;display:flex;align-items:center;justify-content:center;z-index:3;">★ SUPER OFERTA ★</div>` : ''}
      ${estilo.exibirSeloDesconto ? `<div style="position:absolute;right:${Math.round(4 * k)}px;top:${estrela ? Math.round(26 * k) : 4}px;z-index:4;">${seloDesconto(pct, Math.round(44 * k), estilo.corPrimaria, estilo.corDestaque, '#ffe27a', estilo.fonteTitulo, estilo.fonteCorpo)}</div>` : ''}
      <div style="position:relative;flex:1;min-height:0;margin:${estrela ? Math.round(24 * k) : 8}px 8px 4px;">
        ${imgProduto(it, '', estilo.usarRecorteTransparente, estilo.zoomProduto, estilo.offsetYProduto)}
        ${estilo.exibirSombraProduto ? `<div style="position:absolute;left:0;right:0;bottom:0;height:12px;">${sombraChao(10)}</div>` : ''}
      </div>
      <div style="padding:2px ${Math.round(7 * k)}px;text-align:center;font-family:${estilo.fonteCorpo};font-weight:900;color:${estilo.corTexto};text-transform:uppercase;font-size:${nomeFs}px;line-height:${nomeLh}px;max-height:${nomeLh * 2 + 6}px;overflow:hidden;box-sizing:border-box;">${esc(it.descricao)}</div>
      <div style="padding:0 ${Math.round(7 * k)}px;text-align:center;font-family:${estilo.fonteCorpo};font-weight:700;color:#64748b;font-size:${Math.round(9.5 * k)}px;height:${Math.round(14 * k)}px;line-height:${Math.round(14 * k)}px;white-space:nowrap;overflow:hidden;">${esc(it.apresentacao || '')}</div>
      <div style="margin-top:4px;background:linear-gradient(160deg, ${estilo.corSecundaria} 0%, #0b1f47 100%);border-top:3px solid ${estilo.corDestaque};padding:${Math.round(4 * k)}px 4px ${Math.round(6 * k)}px;text-align:center;">
        ${normal > promo ? `<div style="font-family:${estilo.fonteCorpo};font-weight:800;color:${estilo.corPrecoDe};font-size:${Math.round(9.5 * k)}px;text-decoration:line-through;line-height:1.2;">DE ${brl(normal)}</div>` : ''}
        <div style="display:flex;align-items:center;justify-content:center;gap:5px;">
          <span style="font-family:${estilo.fonteCorpo};font-weight:900;color:${estilo.corDestaque};font-size:${Math.round(11 * k)}px;line-height:1;">POR</span>
          ${precoHtml(promo, Math.round(34 * k * estilo.tamanhoPrecoMultiplicador), estilo.corPrecoPor)}
        </div>
      </div>
    </div>`;
};

export function htmlPaginaEncarte(
  itensPagina: ItemArte[],
  paginaNum: number,
  totalPaginas: number,
  periodo: PeriodoArte,
  colunas: 3 | 4 = 4,
  estiloCustom?: Partial<EstiloArte>
): string {
  const estilo: EstiloArte = { ...ESTILO_PADRAO, ...estiloCustom };
  const { w: W, h: H } = DIMENSOES_A4;
  const primeira = paginaNum === 1;
  const temFundoCustom = !!estilo.imagemFundoCustom;

  const bgCustomHtml = temFundoCustom
    ? `<img src="${esc(estilo.imagemFundoCustom)}" style="position:absolute;left:0;top:0;width:${W}px;height:${H}px;object-fit:fill;pointer-events:none;z-index:0;" />`
    : '';

  const headerH = temFundoCustom
    ? (primeira ? 200 : 125)
    : (primeira ? 300 : 150);
  const footerH = temFundoCustom
    ? 135
    : (estilo.exibirRodape ? 132 : 20);
  const margem = 26;
  const bodyTop = headerH + 6;
  const bodyH = H - bodyTop - footerH;

  // Produto Estrela: maior desconto da página
  const n = itensPagina.length;
  const temEstrela = n >= colunas + 1;
  let idxEstrela = -1;
  if (temEstrela) {
    let melhor = -1;
    itensPagina.forEach((it, i) => {
      const score = calc(it).pct + (it.imagem_url ? 1000 : 0);
      if (score > melhor) { melhor = score; idxEstrela = i; }
    });
  }
  const ordenados = temEstrela
    ? [itensPagina[idxEstrela], ...itensPagina.filter((_, i) => i !== idxEstrela)]
    : itensPagina;

  const celulas = temEstrela ? n - 1 + 4 : n;
  const linhas = Math.max(1, Math.ceil(celulas / colunas));
  const faltam = temEstrela ? linhas * colunas - celulas : 0;
  const kBase = colunas === 3 ? 1.25 : 1;

  const cards = ordenados
    .map((it, i) => {
      if (temEstrela && i === 0) {
        return cardProduto(it, { estrela: true, k: kBase * 1.6, estilo }, 'grid-column:span 2;grid-row:span 2;');
      }
      const ultimo = i === ordenados.length - 1 && faltam > 0;
      return cardProduto(it, { estrela: false, k: kBase, estilo }, ultimo ? `grid-column:span ${1 + faltam};` : '');
    })
    .join('');

  const figura = getImagemPronta(IMG_FIGURA) || IMG_FIGURA;

  const fsTopo = Math.round(38 * estilo.tamanhoTituloMultiplicador);
  const fsPrincipal = Math.round(82 * estilo.tamanhoTituloMultiplicador);

  const header = temFundoCustom
    ? `<div style="position:absolute;left:0;top:${primeira ? 140 : 80}px;width:${W}px;text-align:center;z-index:2;">
        ${estilo.exibirValidade ? `<div style="font-family:${estilo.fonteCorpo};font-weight:800;font-size:12px;color:#1e293b;letter-spacing:0.5px;text-align:center;">OFERTAS VÁLIDAS DE ${periodo.inicio} A ${periodo.termino} OU ENQUANTO DURAR O ESTOQUE</div>` : ''}
       </div>`
    : (primeira
        ? `${ondaTopo(W, headerH, 'gHe', estilo.corPrimaria, estilo.corSecundaria, estilo.corDestaque)}
           ${estilo.exibirLogo ? placaLogo(190, 95, 26, 20) : ''}
           <div style="position:absolute;left:${estilo.exibirLogo ? 232 : 26}px;top:38px;">${fitaCampanha(11.5, '6px 12px', estilo.tituloCampanhaTopo, estilo.corSecundaria, estilo.corDestaque, estilo.corDestaque, estilo.fonteCorpo)}</div>
           <div style="position:absolute;left:30px;top:126px;">${tituloPromo(fsTopo, fsPrincipal, LOJA.tituloTopo, estilo.tituloPrincipal, estilo.corDestaque, estilo.corSecundaria, estilo.fonteTitulo)}</div>
           ${estilo.exibirFarmaceutica ? `<div style="position:absolute;left:${W - 236}px;top:14px;width:208px;height:208px;border-radius:50%;background:linear-gradient(160deg, #3b6fd0 0%, #0b1f47 100%);border:5px solid ${estilo.corDestaque};box-shadow:0 8px 18px rgba(11,31,71,0.4);overflow:hidden;">
             <img src="${esc(figura)}" style="position:absolute;left:-14px;bottom:-8px;width:236px;height:290px;object-fit:cover;object-position:50% 12%;" onerror="this.style.display='none'" />
           </div>` : ''}
           ${estilo.exibirValidade ? faixaValidade(periodo, W, headerH - 40, 13, 38, estilo.corDestaque, '#0b1f47', estilo.fonteCorpo) : ''}`
        : `${ondaTopo(W, headerH, 'gHe', estilo.corPrimaria, estilo.corSecundaria, estilo.corDestaque)}
           ${estilo.exibirLogo ? placaLogo(128, 64, 24, 14) : ''}
           <div style="position:absolute;left:${estilo.exibirLogo ? 176 : 24}px;top:16px;">${tituloPromo(20, 50, LOJA.tituloTopo, estilo.tituloPrincipal, estilo.corDestaque, estilo.corSecundaria, estilo.fonteTitulo)}</div>
           <div style="position:absolute;right:26px;top:26px;">${fitaCampanha(10, '5px 10px', estilo.tituloCampanhaTopo, estilo.corSecundaria, estilo.corDestaque, estilo.corDestaque, estilo.fonteCorpo)}</div>
           ${estilo.exibirValidade ? faixaValidade(periodo, W, headerH - 33, 11.5, 30, estilo.corDestaque, '#0b1f47', estilo.fonteCorpo) : ''}`
      );

  return `
    <div style="position:relative;width:${W}px;height:${H}px;background:${estilo.corFundo};overflow:hidden;font-family:${estilo.fonteCorpo};box-sizing:border-box;">
      ${bgCustomHtml}
      ${!temFundoCustom ? `
        <div style="position:absolute;left:-120px;top:${H * 0.38}px;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle, rgba(31,79,168,0.08) 0%, rgba(31,79,168,0) 70%);"></div>
        <div style="position:absolute;right:-140px;top:${H * 0.62}px;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle, rgba(214,25,43,0.07) 0%, rgba(214,25,43,0) 70%);"></div>
      ` : ''}
      <div style="position:relative;width:100%;height:100%;z-index:2;">
        ${header}
        <div style="position:absolute;left:${margem}px;top:${bodyTop}px;width:${W - margem * 2}px;height:${bodyH}px;display:grid;grid-template-columns:repeat(${colunas}, 1fr);grid-template-rows:repeat(${linhas}, 1fr);grid-auto-flow:dense;gap:12px;box-sizing:border-box;padding:10px 0 12px;">
          ${cards}
        </div>
        ${!temFundoCustom && estilo.exibirRodape ? rodapeHtml(W, footerH, 'gFe', 12, `Página ${paginaNum} de ${totalPaginas}`, estilo.corPrimaria, estilo.corSecundaria, estilo.corDestaque, estilo.fonteCorpo) : ''}
        ${temFundoCustom ? `<div style="position:absolute;left:0;right:0;bottom:8px;text-align:center;font-family:${estilo.fonteCorpo};font-weight:900;font-size:11px;color:#ffffff;text-shadow:1px 1px 2px rgba(0,0,0,0.5);z-index:3;">Página ${paginaNum} de ${totalPaginas}</div>` : ''}
      </div>
    </div>`;
}

// ─── EXPORTAÇÃO ───────────────────────────────────────────────────────────────
const aguardarImagens = async (raiz: HTMLElement) => {
  const imgs = Array.from(raiz.querySelectorAll('img'));
  if (imgs.length === 0) return;

  const loadPromises = imgs.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise<void>(res => {
      img.onload = () => res();
      img.onerror = () => res();
    });
  });

  // Timeout de segurança de 1.5s para não travar a compilação caso alguma imagem falhe ou demore
  const timeoutPromise = new Promise<void>(res => setTimeout(res, 1500));
  await Promise.race([Promise.all(loadPromises), timeoutPromise]);
};

/** Renderiza uma string HTML (em tamanho nativo, fora da tela) para canvas. */
export async function renderizarHtmlParaCanvas(html: string, w: number, h: number, scale = 2): Promise<HTMLCanvasElement> {
  const host = document.createElement('div');
  // Usamos left: -9999px e opacity: 1 para que o html2canvas capture todas as camadas,
  // subpixel antialiasing de fontes e sombras com 100% de opacidade e nitidez perfeita.
  host.style.cssText = `position:fixed;left:-9999px;top:0;width:${w}px;height:${h}px;z-index:99999;opacity:1;pointer-events:none;overflow:hidden;background:#ffffff;`;
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    // 1. Aguardar carregamento das imagens com limite de tempo seguro
    await aguardarImagens(host);

    // 2. Aguardar fontes com timeout máximo de 1s
    if ((document as any).fonts?.ready) {
      const fontTimeout = new Promise(r => setTimeout(r, 1000));
      await Promise.race([(document as any).fonts.ready, fontTimeout]);
    }

    // 3. Respiro curto para estabilização de layout
    await new Promise(r => setTimeout(r, 40));

    const alvo = (host.firstElementChild as HTMLElement) || host;
    return await html2canvas(alvo, {
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: w,
      height: h,
      windowWidth: w,
      windowHeight: h,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      logging: false
    });
  } finally {
    if (document.body.contains(host)) {
      document.body.removeChild(host);
    }
  }
}
