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
    return false;
  }

  const p = pathname.toLowerCase();
  const h = hash.toLowerCase();
  const s = search.toLowerCase();
  const host = hostname.toLowerCase();

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
