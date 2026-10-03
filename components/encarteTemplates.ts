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

// ─── IDENTIDADE & DADOS DA LOJA (edite aqui para refletir a realidade da unidade) ───
export const LOJA = {
  nome: 'BELA FARMA SUL',
  endereco: 'Santa Luzia, Juiz de Fora - MG',
  horario: '', // Ex.: 'Seg a Sáb: 07h às 22h | Dom: 08h às 20h' (omitido do layout se vazio)
  whatsapp: '(32) 9822-8189',
  site: '', // Ex.: '@belafarmasul' (omitido do layout se vazio)
  pagamentos: 'Pix • Cartão de Crédito e Débito • Dinheiro',
  aviso: 'Imagens meramente ilustrativas. Ofertas válidas enquanto durarem os estoques.',
  campanha: 'FESTIVAL DE ANIVERSÁRIO • 1 ANO BELA FARMA SUL',
  tituloTopo: 'MEGA',
  titulo: 'LIQUIDAÇÃO'
};

const COR = {
  vermelho: '#d6192b',
  vermelhoEscuro: '#a50f20',
  azul: '#1f4fa8',
  azulEscuro: '#12306b',
  azulProfundo: '#0b1f47',
  amarelo: '#ffc20e',
  amareloClaro: '#ffe27a',
  cinza: '#64748b'
};

const FONT_TITULO = "Impact, 'Arial Black', 'Helvetica Neue', Arial, sans-serif";
const FONT_CORPO = "'Segoe UI', Arial, Helvetica, sans-serif";

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
 * e recorta o excesso transparente. Se algo falhar (ex.: CORS), devolve a URL original.
 */
async function recortarFundo(url: string): Promise<string> {
  try {
    const img = await carregarImagem(url);
    const maxLado = 720;
    const escala = Math.min(1, maxLado / Math.max(img.naturalWidth, img.naturalHeight));
    const W = Math.max(1, Math.round(img.naturalWidth * escala));
    const H = Math.max(1, Math.round(img.naturalHeight * escala));

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return url;
    ctx.drawImage(img, 0, 0, W, H);

    const dados = ctx.getImageData(0, 0, W, H);
    const px = dados.data;

    const ehFundo = (p: number) => {
      const i = p * 4;
      if (px[i + 3] < 16) return true;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      return r > 242 && g > 242 && b > 242 && Math.max(r, g, b) - Math.min(r, g, b) < 14;
    };

    const removido = new Uint8Array(W * H);
    const pilha = new Int32Array(W * H);
    let topo = 0;
    const empilha = (p: number) => {
      if (!removido[p] && ehFundo(p)) {
        removido[p] = 1;
        pilha[topo++] = p;
      }
    };

    for (let x = 0; x < W; x++) { empilha(x); empilha((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { empilha(y * W); empilha(y * W + W - 1); }

    while (topo > 0) {
      const p = pilha[--topo];
      const x = p % W;
      const y = (p - x) / W;
      if (x > 0) empilha(p - 1);
      if (x < W - 1) empilha(p + 1);
      if (y > 0) empilha(p - W);
      if (y < H - 1) empilha(p + W);
    }

    let totalRemovido = 0;
    for (let p = 0; p < W * H; p++) if (removido[p]) totalRemovido++;
    const fracao = totalRemovido / (W * H);
    // Imagem quase toda branca (ou nada removido): não é seguro recortar.
    if (fracao > 0.97) return url;

    // Suaviza a borda: pixels claros vizinhos ao fundo removido ficam semitransparentes
    const borda: number[] = [];
    for (let p = 0; p < W * H; p++) {
      if (removido[p]) continue;
      const x = p % W;
      const y = (p - x) / W;
      if (
        (x > 0 && removido[p - 1]) || (x < W - 1 && removido[p + 1]) ||
        (y > 0 && removido[p - W]) || (y < H - 1 && removido[p + W])
      ) borda.push(p);
    }
    for (let p = 0; p < W * H; p++) if (removido[p]) px[p * 4 + 3] = 0;
    for (const p of borda) {
      const i = p * 4;
      const claro = Math.min(px[i], px[i + 1], px[i + 2]);
      if (claro > 205) {
        const a = 255 * (1 - (claro - 205) / 50);
        px[i + 3] = Math.max(0, Math.min(255, a));
      }
    }
    ctx.putImageData(dados, 0, 0);

    // Recorta o excesso transparente
    let minX = W, minY = H, maxX = 0, maxY = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (px[(y * W + x) * 4 + 3] > 24) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX || maxY <= minY) return url;
    const pad = 3;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(W - 1, maxX + pad); maxY = Math.min(H - 1, maxY + pad);

    const saida = document.createElement('canvas');
    saida.width = maxX - minX + 1;
    saida.height = maxY - minY + 1;
    saida.getContext('2d')!.drawImage(canvas, minX, minY, saida.width, saida.height, 0, 0, saida.width, saida.height);
    return saida.toDataURL('image/png');
  } catch (e) {
    return url; // CORS/arquivo inválido: usa a imagem original
  }
}

export function prepararImagem(url?: string): Promise<string> {
  if (!url) return Promise.resolve('');
  if (cacheImagens.has(url)) return Promise.resolve(cacheImagens.get(url)!);
  if (pendentes.has(url)) return pendentes.get(url)!;
  const promessa = recortarFundo(url).then(res => {
    cacheImagens.set(url, res);
    pendentes.delete(url);
    return res;
  });
  pendentes.set(url, promessa);
  return promessa;
}

/** Processa (em lotes) todas as fotos dos itens + a figura de apoio. */
export async function prepararImagensArte(itens: ItemArte[], incluirFigura = true): Promise<void> {
  const urls = Array.from(new Set(itens.map(i => i.imagem_url).filter(Boolean) as string[]));
  if (incluirFigura) urls.push(IMG_FIGURA);
  for (let i = 0; i < urls.length; i += 6) {
    await Promise.all(urls.slice(i, i + 6).map(u => prepararImagem(u)));
  }
}

// ─── HELPERS DE MARCAÇÃO ──────────────────────────────────────────────────────
const esc = (s: string = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const brl = (v: number) => 'R$ ' + (v || 0).toFixed(2).replace('.', ',');

const calc = (it: ItemArte) => {
  const promo = Number(it.preco_promocional) || 0;
  const normal = Number(it.preco_normal) > 0 ? Number(it.preco_normal) : promo;
  const pct = it.desconto_percentual || (normal > 0 ? Math.round(((normal - promo) / normal) * 100) : 0);
  return { promo, normal, pct: Math.max(0, pct), eco: Math.max(0, normal - promo) };
};

/** Preço no estilo varejo: R$ pequeno, reais grandes, centavos elevados. */
const precoHtml = (v: number, big: number, cor: string) => {
  const [reais, cents] = (v || 0).toFixed(2).split('.');
  return `<div style="display:flex;align-items:flex-start;justify-content:center;line-height:1;color:${cor};font-family:${FONT_TITULO};">
    <span style="font-size:${Math.round(big * 0.3)}px;margin-top:${Math.round(big * 0.14)}px;margin-right:3px;font-family:${FONT_CORPO};font-weight:900;">R$</span>
    <span style="font-size:${big}px;letter-spacing:-1px;">${reais}</span>
    <span style="font-size:${Math.round(big * 0.42)}px;margin-top:${Math.round(big * 0.1)}px;font-family:${FONT_CORPO};font-weight:900;">,${cents}</span>
  </div>`;
};

const burst = (s: number, fill: string, stroke: string, spikes = 16) => {
  let pts = '';
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 48 : 40;
    const a = (Math.PI * i) / spikes - Math.PI / 2;
    pts += `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)} `;
  }
  return `<svg width="${s}" height="${s}" viewBox="0 0 100 100" style="position:absolute;left:0;top:0;"><polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/></svg>`;
};

/** Selo de desconto (estrela de 16 pontas, vermelho vivo com contorno amarelo). */
const seloDesconto = (pct: number, size: number) => {
  if (pct <= 0) return '';
  return `<div style="position:relative;width:${size}px;height:${size}px;flex:none;">
    ${burst(size, COR.vermelho, COR.amarelo)}
    <div style="position:absolute;left:0;top:0;width:${size}px;height:${size}px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:${FONT_TITULO};line-height:.95;">
      <span style="font-size:${Math.round(size * 0.3)}px;">-${pct}%</span>
      <span style="font-size:${Math.round(size * 0.16)}px;letter-spacing:1px;color:${COR.amareloClaro};font-family:${FONT_CORPO};font-weight:900;">OFF</span>
    </div>
  </div>`;
};

const sombraChao = (altura: number) =>
  `<div style="position:absolute;left:15%;bottom:0;width:70%;height:${altura}px;background:radial-gradient(ellipse at center, rgba(15,23,42,0.32) 0%, rgba(15,23,42,0) 70%);"></div>`;

const imgProduto = (it: ItemArte, estilo = '') => {
  const src = getImagemPronta(it.imagem_url);
  if (!src) {
    return `<img src="${IMG_PLACEHOLDER}" style="position:absolute;left:18%;top:18%;width:64%;height:64%;object-fit:contain;opacity:0.35;${estilo}" />`;
  }
  return `<img src="${esc(src)}" style="position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;${estilo}" />`;
};

const ondaTopo = (W: number, H: number, id: string) => `
  <svg width="${W}" height="${H}" viewBox="0 0 800 300" preserveAspectRatio="none" style="position:absolute;left:0;top:0;">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${COR.vermelhoEscuro}"/>
        <stop offset="0.6" stop-color="${COR.vermelho}"/>
        <stop offset="1" stop-color="${COR.azulEscuro}"/>
      </linearGradient>
    </defs>
    <path d="M0 0H800V225C650 292 470 205 305 248C185 280 85 252 0 276Z" fill="url(#${id})"/>
    <path d="M0 286C125 254 205 288 335 254C470 216 655 300 800 236V252C655 316 472 232 338 270C205 302 112 274 0 302Z" fill="${COR.azulEscuro}"/>
    <path d="M0 270C120 240 200 272 330 240C470 204 650 286 800 224" fill="none" stroke="${COR.amarelo}" stroke-width="3"/>
  </svg>`;

const ondaBase = (W: number, H: number, id: string) => `
  <svg width="${W}" height="${H}" viewBox="0 0 800 160" preserveAspectRatio="none" style="position:absolute;left:0;top:0;">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${COR.vermelhoEscuro}"/>
        <stop offset="0.55" stop-color="${COR.vermelho}"/>
        <stop offset="1" stop-color="${COR.azulEscuro}"/>
      </linearGradient>
    </defs>
    <path d="M0 40C150 0 300 62 470 26C620 -4 720 32 800 10V160H0Z" fill="url(#${id})"/>
    <path d="M0 36C150 -4 300 58 470 22C620 -8 720 28 800 6" fill="none" stroke="${COR.amarelo}" stroke-width="3"/>
  </svg>`;

const placaLogo = (w: number, h: number, left: number, top: number) => `
  <div style="position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px;background:#fff;border-radius:${Math.round(h * 0.2)}px;box-shadow:0 6px 16px rgba(11,31,71,0.28);padding:4px;box-sizing:border-box;">
    <img src="${IMG_LOGO}" style="width:100%;height:100%;object-fit:contain;" />
  </div>`;

const faixaValidade = (periodo: PeriodoArte, W: number, top: number, fs: number, h: number) => `
  <div style="position:absolute;left:${Math.round(W * 0.05)}px;top:${top}px;width:${Math.round(W * 0.9)}px;height:${h}px;background:${COR.amarelo};border-radius:${h}px;box-shadow:0 4px 10px rgba(11,31,71,0.3);display:flex;align-items:center;justify-content:center;color:${COR.azulProfundo};font-family:${FONT_CORPO};font-weight:900;font-size:${fs}px;letter-spacing:0.3px;text-align:center;white-space:nowrap;">
    OFERTAS VÁLIDAS DE ${periodo.inicio} A ${periodo.termino} OU ENQUANTO DURAR O ESTOQUE
  </div>`;

const tituloPromo = (fsTopo: number, fsTitulo: number) => `
  <div style="font-family:${FONT_TITULO};text-align:left;line-height:0.95;">
    <div style="font-size:${fsTopo}px;color:#fff;letter-spacing:3px;text-shadow:2px 2px 0 ${COR.azulProfundo};">${esc(LOJA.tituloTopo)}</div>
    <div style="font-size:${fsTitulo}px;color:${COR.amarelo};letter-spacing:1px;font-style:italic;text-shadow:3px 3px 0 ${COR.azulEscuro}, 5px 5px 0 ${COR.azulProfundo}, 0 9px 14px rgba(0,0,0,0.35);">${esc(LOJA.titulo)}</div>
  </div>`;

const fitaCampanha = (fs: number, pad: string) => `
  <div style="display:inline-block;background:${COR.azulProfundo};color:${COR.amarelo};font-family:${FONT_CORPO};font-weight:900;font-size:${fs}px;letter-spacing:0.6px;padding:${pad};border-radius:6px;border-left:5px solid ${COR.amarelo};white-space:nowrap;">${esc(LOJA.campanha)}</div>`;

const rodapeHtml = (W: number, H: number, id: string, fs: number, extraDireita = '') => {
  const linhas: string[] = [];
  const contato = `<span style="font-size:${Math.round(fs * 1.55)}px;font-weight:900;color:${COR.amarelo};">🛵 WHATSAPP ${esc(LOJA.whatsapp)}</span><span style="margin-left:10px;font-weight:800;">ENTREGA RÁPIDA${LOJA.site ? ' • ' + esc(LOJA.site) : ''}</span>`;
  linhas.push(`<div style="white-space:nowrap;">${contato}</div>`);
  const loc = [`📍 ${esc(LOJA.endereco)}`, LOJA.horario ? `🕒 ${esc(LOJA.horario)}` : ''].filter(Boolean).join('  |  ');
  linhas.push(`<div style="white-space:nowrap;font-weight:800;">${loc}</div>`);
  linhas.push(`<div style="white-space:nowrap;font-size:${Math.round(fs * 0.82)}px;opacity:0.95;">💳 ${esc(LOJA.pagamentos)}${extraDireita ? '   |   ' + extraDireita : ''}</div>`);
  linhas.push(`<div style="white-space:nowrap;font-size:${Math.round(fs * 0.74)}px;opacity:0.85;">${esc(LOJA.aviso)}</div>`);
  return `
    <div style="position:absolute;left:0;bottom:0;width:${W}px;height:${H}px;">
      ${ondaBase(W, H, id)}
      <div style="position:absolute;left:0;right:0;bottom:${Math.round(H * 0.07)}px;text-align:center;color:#fff;font-family:${FONT_CORPO};font-size:${fs}px;line-height:1.38;">
        ${linhas.join('')}
      </div>
    </div>`;
};

// ─── ARTE UNITÁRIA (STORY 9:16 / FEED 4:5) ────────────────────────────────────
export function htmlArteUnitaria(item: ItemArte, formato: FormatoUnitario, periodo: PeriodoArte): string {
  const { w: W, h: H } = DIMENSOES_UNITARIO[formato];
  const story = formato === 'story';
  const { promo, normal, pct, eco } = calc(item);

  const headerH = story ? 285 : 195;
  const footerH = story ? 170 : 128;
  const bodyTop = headerH + (story ? 22 : 18);
  const bodyH = H - bodyTop - footerH + (story ? 6 : 4);

  const header = story
    ? `${ondaTopo(W, headerH, 'gHu')}
       ${placaLogo(168, 84, 24, 20)}
       <div style="position:absolute;left:214px;top:34px;">${fitaCampanha(11, '5px 10px')}</div>
       <div style="position:absolute;left:30px;top:118px;">${tituloPromo(30, 70)}</div>
       ${faixaValidade(periodo, W, headerH - 38, 11.5, 36)}`
    : `${ondaTopo(W, headerH, 'gHu')}
       ${placaLogo(130, 65, 22, 14)}
       <div style="position:absolute;left:170px;top:26px;">${fitaCampanha(9.5, '4px 8px')}</div>
       <div style="position:absolute;left:28px;top:84px;">${tituloPromo(22, 52)}</div>
       ${faixaValidade(periodo, W, headerH - 32, 10.5, 30)}`;

  const nomeBloco = `
    <div style="font-family:${FONT_CORPO};font-weight:900;color:${COR.azulEscuro};text-transform:uppercase;text-align:${story ? 'center' : 'left'};font-size:${story ? 25 : 20}px;line-height:1.15;max-height:${story ? 58 : 46}px;overflow:hidden;">${esc(item.descricao)}</div>
    ${item.apresentacao ? `<div style="font-family:${FONT_CORPO};font-weight:700;color:${COR.cinza};text-align:${story ? 'center' : 'left'};font-size:${story ? 15 : 13}px;margin-top:3px;white-space:nowrap;overflow:hidden;">${esc(item.apresentacao)}</div>` : ''}`;

  const badgePreco = `
    <div style="position:relative;width:${story ? 430 : 270}px;background:linear-gradient(160deg, ${COR.azul} 0%, ${COR.azulProfundo} 100%);border-radius:${story ? 26 : 20}px;padding:${story ? '12px 20px 22px' : '9px 14px 18px'};box-sizing:border-box;box-shadow:0 8px 18px rgba(11,31,71,0.35);text-align:center;border:3px solid ${COR.amarelo};">
      ${normal > promo ? `<div style="font-family:${FONT_CORPO};font-weight:800;color:#cfe0ff;font-size:${story ? 17 : 13}px;text-decoration:line-through;">DE ${brl(normal)}</div>` : ''}
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:2px;">
        <span style="font-family:${FONT_CORPO};font-weight:900;color:${COR.amarelo};font-size:${story ? 22 : 16}px;">POR</span>
        ${precoHtml(promo, story ? 86 : 56, '#ffffff')}
      </div>
      ${eco > 0 ? `<div style="position:absolute;left:50%;bottom:-15px;margin-left:${story ? -110 : -80}px;width:${story ? 220 : 160}px;height:${story ? 30 : 24}px;background:${COR.amarelo};color:${COR.azulProfundo};border-radius:30px;display:flex;align-items:center;justify-content:center;font-family:${FONT_CORPO};font-weight:900;font-size:${story ? 14 : 11}px;box-shadow:0 3px 8px rgba(0,0,0,0.3);white-space:nowrap;">VOCÊ ECONOMIZA ${brl(eco)}</div>` : ''}
    </div>`;

  const stageW = story ? 300 : 232;
  const stageH = story ? 250 : 262;
  const palco = `
    <div style="position:relative;width:${stageW}px;height:${stageH}px;flex:none;">
      <div style="position:absolute;left:50%;top:50%;width:${stageW - 20}px;height:${stageW - 20}px;margin-left:${-(stageW - 20) / 2}px;margin-top:${-(stageW - 20) / 2 - 6}px;border-radius:50%;background:radial-gradient(circle at 50% 45%, #ffffff 0%, #e6efff 62%, rgba(230,239,255,0) 72%);"></div>
      <div style="position:absolute;left:${story ? 22 : 14}px;top:${story ? 8 : 10}px;right:${story ? 22 : 14}px;bottom:${story ? 22 : 20}px;">${imgProduto(item)}</div>
      <div style="position:absolute;left:0;right:0;bottom:0;height:24px;">${sombraChao(22)}</div>
      <div style="position:absolute;right:${story ? -34 : -26}px;top:${story ? -4 : 0}px;">${seloDesconto(pct, story ? 112 : 88)}</div>
    </div>`;

  const corpo = story
    ? `<div style="position:absolute;left:0;top:${bodyTop}px;width:${W}px;height:${bodyH}px;display:flex;flex-direction:column;align-items:center;justify-content:space-around;padding:0 28px 14px;box-sizing:border-box;">
         ${palco}
         <div style="width:100%;">${nomeBloco}</div>
         ${badgePreco}
       </div>`
    : `<div style="position:absolute;left:0;top:${bodyTop}px;width:${W}px;height:${bodyH}px;display:flex;flex-direction:row;align-items:center;justify-content:center;gap:26px;padding:0 30px 4px 24px;box-sizing:border-box;">
         ${palco}
         <div style="display:flex;flex-direction:column;align-items:flex-start;gap:14px;width:270px;">
           <div style="width:100%;">${nomeBloco}</div>
           ${badgePreco}
         </div>
       </div>`;

  return `
    <div style="position:relative;width:${W}px;height:${H}px;background:#ffffff;overflow:hidden;font-family:${FONT_CORPO};box-sizing:border-box;">
      <div style="position:absolute;right:-90px;top:${headerH}px;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle, rgba(31,79,168,0.08) 0%, rgba(31,79,168,0) 70%);"></div>
      <div style="position:absolute;left:-80px;top:${H - footerH - 300}px;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle, rgba(214,25,43,0.07) 0%, rgba(214,25,43,0) 70%);"></div>
      ${header}
      ${corpo}
      ${rodapeHtml(W, footerH, 'gFu', story ? 13 : 10.5)}
    </div>`;
}

// ─── ENCARTE TABLOIDE A4 ──────────────────────────────────────────────────────
interface OpcoesCard { estrela: boolean; k: number }

const cardProduto = (it: ItemArte, { estrela, k }: OpcoesCard, extraStyle = '') => {
  const { promo, normal, pct } = calc(it);
  const bordaEstrela = estrela ? `border:3px solid ${COR.amarelo};box-shadow:0 8px 22px rgba(214,25,43,0.28);` : 'box-shadow:0 4px 14px rgba(18,48,107,0.14);';
  const nomeFs = Math.round(11.5 * k);
  const nomeLh = Math.round(nomeFs * 1.18);
  return `
    <div style="position:relative;min-height:0;min-width:0;background:#fff;border-radius:${estrela ? 22 : 16}px;overflow:hidden;display:flex;flex-direction:column;box-sizing:border-box;${bordaEstrela}${extraStyle}">
      ${estrela ? `<div style="position:absolute;left:0;top:0;right:0;height:${Math.round(22 * k * 0.85)}px;background:linear-gradient(90deg, ${COR.vermelho}, ${COR.vermelhoEscuro});color:${COR.amarelo};font-family:${FONT_TITULO};font-size:${Math.round(14 * k * 0.85)}px;letter-spacing:2px;display:flex;align-items:center;justify-content:center;z-index:3;">★ SUPER OFERTA ★</div>` : ''}
      <div style="position:absolute;right:${Math.round(4 * k)}px;top:${estrela ? Math.round(26 * k) : 4}px;z-index:4;">${seloDesconto(pct, Math.round(44 * k))}</div>
      <div style="position:relative;flex:1;min-height:0;margin:${estrela ? Math.round(24 * k) : 8}px 8px 4px;">
        ${imgProduto(it)}
        <div style="position:absolute;left:0;right:0;bottom:0;height:12px;">${sombraChao(10)}</div>
      </div>
      <div style="padding:0 ${Math.round(7 * k)}px;text-align:center;font-family:${FONT_CORPO};font-weight:900;color:${COR.azulEscuro};text-transform:uppercase;font-size:${nomeFs}px;line-height:${nomeLh}px;height:${nomeLh * 2}px;overflow:hidden;">${esc(it.descricao)}</div>
      <div style="padding:0 ${Math.round(7 * k)}px;text-align:center;font-family:${FONT_CORPO};font-weight:700;color:${COR.cinza};font-size:${Math.round(9.5 * k)}px;height:${Math.round(13 * k)}px;line-height:${Math.round(13 * k)}px;white-space:nowrap;overflow:hidden;">${esc(it.apresentacao || '')}</div>
      <div style="margin-top:4px;background:linear-gradient(160deg, ${COR.azul} 0%, ${COR.azulProfundo} 100%);border-top:3px solid ${COR.amarelo};padding:${Math.round(4 * k)}px 4px ${Math.round(6 * k)}px;text-align:center;">
        ${normal > promo ? `<div style="font-family:${FONT_CORPO};font-weight:800;color:#cfe0ff;font-size:${Math.round(9.5 * k)}px;text-decoration:line-through;line-height:1.2;">DE ${brl(normal)}</div>` : ''}
        <div style="display:flex;align-items:center;justify-content:center;gap:5px;">
          <span style="font-family:${FONT_CORPO};font-weight:900;color:${COR.amarelo};font-size:${Math.round(11 * k)}px;">POR</span>
          ${precoHtml(promo, Math.round(34 * k), '#ffffff')}
        </div>
      </div>
    </div>`;
};

export function htmlPaginaEncarte(
  itensPagina: ItemArte[],
  paginaNum: number,
  totalPaginas: number,
  periodo: PeriodoArte,
  colunas: 3 | 4 = 4
): string {
  const { w: W, h: H } = DIMENSOES_A4;
  const primeira = paginaNum === 1;
  const headerH = primeira ? 300 : 150;
  const footerH = 132;
  const margem = 26;
  const bodyTop = headerH + 8;
  const bodyH = H - bodyTop - footerH + 2;

  // Produto Estrela: maior desconto da página (prefere os que têm foto)
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
        return cardProduto(it, { estrela: true, k: kBase * 1.6 }, 'grid-column:span 2;grid-row:span 2;');
      }
      const ultimo = i === ordenados.length - 1 && faltam > 0;
      return cardProduto(it, { estrela: false, k: kBase }, ultimo ? `grid-column:span ${1 + faltam};` : '');
    })
    .join('');

  const figura = getImagemPronta(IMG_FIGURA) || IMG_FIGURA;

  const header = primeira
    ? `${ondaTopo(W, headerH, 'gHe')}
       ${placaLogo(190, 95, 26, 20)}
       <div style="position:absolute;left:232px;top:38px;">${fitaCampanha(11.5, '6px 12px')}</div>
       <div style="position:absolute;left:30px;top:126px;">${tituloPromo(38, 82)}</div>
       <div style="position:absolute;left:${W - 236}px;top:14px;width:208px;height:208px;border-radius:50%;background:linear-gradient(160deg, #3b6fd0 0%, ${COR.azulProfundo} 100%);border:5px solid ${COR.amarelo};box-shadow:0 8px 18px rgba(11,31,71,0.4);overflow:hidden;">
         <img src="${esc(figura)}" style="position:absolute;left:-14px;bottom:-8px;width:236px;height:290px;object-fit:cover;object-position:50% 12%;" onerror="this.style.display='none'" />
       </div>
       ${faixaValidade(periodo, W, headerH - 40, 13, 38)}`
    : `${ondaTopo(W, headerH, 'gHe')}
       ${placaLogo(128, 64, 24, 14)}
       <div style="position:absolute;left:176px;top:16px;">${tituloPromo(20, 50)}</div>
       <div style="position:absolute;right:26px;top:26px;">${fitaCampanha(10, '5px 10px')}</div>
       ${faixaValidade(periodo, W, headerH - 33, 11.5, 30)}`;

  return `
    <div style="position:relative;width:${W}px;height:${H}px;background:#ffffff;overflow:hidden;font-family:${FONT_CORPO};box-sizing:border-box;">
      <div style="position:absolute;left:-120px;top:${H * 0.38}px;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle, rgba(31,79,168,0.08) 0%, rgba(31,79,168,0) 70%);"></div>
      <div style="position:absolute;right:-140px;top:${H * 0.62}px;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle, rgba(214,25,43,0.07) 0%, rgba(214,25,43,0) 70%);"></div>
      ${header}
      <div style="position:absolute;left:${margem}px;top:${bodyTop}px;width:${W - margem * 2}px;height:${bodyH - 8}px;display:grid;grid-template-columns:repeat(${colunas}, 1fr);grid-template-rows:repeat(${linhas}, 1fr);grid-auto-flow:dense;gap:12px;box-sizing:border-box;padding:10px 0 12px;">
        ${cards}
      </div>
      ${rodapeHtml(W, footerH, 'gFe', 12, `Página ${paginaNum} de ${totalPaginas}`)}
    </div>`;
}

// ─── EXPORTAÇÃO ───────────────────────────────────────────────────────────────
const aguardarImagens = async (raiz: HTMLElement) => {
  const imgs = Array.from(raiz.querySelectorAll('img'));
  await Promise.all(
    imgs.map(img =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>(res => {
            img.onload = () => res();
            img.onerror = () => res();
          })
    )
  );
};

/** Renderiza uma string HTML (em tamanho nativo, fora da tela) para canvas. */
export async function renderizarHtmlParaCanvas(html: string, w: number, h: number, scale = 2): Promise<HTMLCanvasElement> {
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-99999px;top:0;width:${w}px;height:${h}px;overflow:hidden;`;
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    await aguardarImagens(host);
    const alvo = host.firstElementChild as HTMLElement;
    return await html2canvas(alvo, {
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: w,
      height: h,
      logging: false
    });
  } finally {
    document.body.removeChild(host);
  }
}
