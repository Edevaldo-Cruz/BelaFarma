// Interface contracts and shared types for BelaFarma Vitrine Pública

export interface VitrineProduto {
  id: string | number;
  produto_id?: number;
  nome: string;
  descricao?: string;
  apresentacao?: string;
  ean?: string;
  categoria?: string;
  laboratorio?: string;
  preco_de: number;
  preco_por: number;
  desconto_percentual?: number;
  estoque: number;
  imagem_url?: string;
}

export interface VitrineCartItem {
  produto: VitrineProduto;
  quantidade: number;
}

export type ModalidadeEntrega = 'retirada' | 'entrega';

export interface CheckoutData {
  nome: string;
  modalidade: ModalidadeEntrega;
  endereco?: string;
  bairro?: string;
  telefone?: string;
}

export interface VitrineApiResponse {
  sucesso: boolean;
  campanha?: {
    id: string;
    titulo: string;
    data_inicio?: string;
    data_fim?: string;
  };
  total?: number;
  categorias?: string[];
  produtos?: VitrineProduto[];
  erro?: string;
}

/**
 * Formata valores numéricos para o padrão monetário brasileiro R$ XX,XX.
 */
export function formatBRL(value: number): string {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return 'R$ ' + rounded.toFixed(2).replace('.', ',');
}

export interface BioConfig {
  instagramHandle: string;
  whatsappNumber: string;
  whatsappDisplay: string;
  storeAddress: string;
  openingHours: string;
  paymentsText: string;
  googleMapsUrl: string;
  googleReviewUrl: string;
  ifoodUrl: string;
  vitrineUrl: string;
  bioHeadline: string;
  bioSubheadline: string;
  showHours: boolean;
  showIfood: boolean;
  showBrasilCard: boolean;
  monthlyAdBudget?: number;
  updatedAt?: string | null;
}

function parseRouteLocation(
  input?: string | { pathname?: string; hash?: string; search?: string }
): { pathname: string; hash: string; search: string; hostname: string } | null {
  let pathname = '';
  let hash = '';
  let search = '';
  let hostname = '';

  if (typeof input === 'string') {
    try {
      if (input.startsWith('http://') || input.startsWith('https://')) {
        const parsed = new URL(input);
        pathname = parsed.pathname;
        hash = parsed.hash;
        search = parsed.search;
        hostname = parsed.hostname;
      } else {
        const hashIdx = input.indexOf('#');
        let remaining = input;
        if (hashIdx !== -1) {
          hash = input.slice(hashIdx);
          remaining = input.slice(0, hashIdx);
        }
        const queryIdx = remaining.indexOf('?');
        if (queryIdx !== -1) {
          search = remaining.slice(queryIdx);
          pathname = remaining.slice(0, queryIdx);
        } else {
          pathname = remaining;
        }
      }
    } catch {
      pathname = input;
    }
  } else if (input && typeof input === 'object') {
    pathname = input.pathname || '';
    hash = input.hash || '';
    search = input.search || '';
  } else if (typeof window !== 'undefined' && window.location) {
    pathname = window.location.pathname || '';
    hash = window.location.hash || '';
    search = window.location.search || '';
    hostname = window.location.hostname || '';
  } else {
    return null;
  }

  return {
    pathname: pathname.toLowerCase(),
    hash: hash.toLowerCase(),
    search: search.toLowerCase(),
    hostname: hostname.toLowerCase(),
  };
}

/**
 * Detects whether the current or provided location corresponds to a public vitrine route.
 * Supports:
 * - pathname === '/promocao' or '/aniversario' (and trailing slashes / subpaths)
 * - hash containing 'promocao', 'aniversario', 'vitrine'
 * - search containing 'vitrine=aniversario', 'promocao', etc.
 */
export function isPublicVitrineRoute(
  input?: string | { pathname?: string; hash?: string; search?: string }
): boolean {
  const loc = parseRouteLocation(input);
  if (!loc) return false;
  const { pathname: p, hash: h, search: s, hostname: host } = loc;

  // 0. Subdomain / Host check (ex: liquida.drogariabelafarma.com.br abre a vitrine direto na raiz)
  const hostMatches = host.startsWith('liquida.') || host.includes('liquida.drogariabelafarma');

  // 1. Direct path check
  const pathMatches =
    p === '/promocao' ||
    p === '/promocao/' ||
    p === '/aniversario' ||
    p === '/aniversario/' ||
    p.startsWith('/promocao') ||
    p.startsWith('/aniversario') ||
    p === '/vitrine' ||
    p === '/ofertas';

  // 2. Hash check (supports #/promocao, #promocao, #/aniversario, etc.)
  const hashMatches =
    h.includes('promocao') ||
    h.includes('aniversario') ||
    h.includes('vitrine') ||
    h.includes('ofertas');

  // 3. Search query check (?vitrine=aniversario, etc.)
  let searchMatches = false;
  try {
    const params = new URLSearchParams(s.startsWith('?') ? s : `?${s}`);
    const vitrine = params.get('vitrine');
    searchMatches =
      vitrine === 'aniversario' ||
      vitrine === 'promocao' ||
      vitrine === 'true' ||
      vitrine === '1' ||
      params.has('promocao') ||
      params.has('aniversario');
  } catch {
    searchMatches = s.includes('vitrine=aniversario') || s.includes('promocao') || s.includes('aniversario');
  }

  return hostMatches || pathMatches || hashMatches || searchMatches;
}

/**
 * Detects whether the current or provided location corresponds to the public Link in Bio route (/bio, /links).
 */
export function isPublicBioRoute(
  input?: string | { pathname?: string; hash?: string; search?: string }
): boolean {
  const loc = parseRouteLocation(input);
  if (!loc) return false;
  const { pathname: p, hash: h, search: s } = loc;

  const pathMatches =
    p === '/bio' ||
    p === '/bio/' ||
    p === '/links' ||
    p === '/links/';

  const hashMatches =
    h.startsWith('#/bio') ||
    h.startsWith('#/links');

  let searchMatches = false;
  try {
    const params = new URLSearchParams(s.startsWith('?') ? s : `?${s}`);
    const bioParam = params.get('bio');
    const linksParam = params.get('links');
    searchMatches =
      bioParam === '1' ||
      bioParam === 'true' ||
      linksParam === '1' ||
      linksParam === 'true';
  } catch {
    searchMatches = s.includes('bio=1') || s.includes('bio=true') || s.includes('links=1');
  }

  return pathMatches || hashMatches || searchMatches;
}
