/**
 * vitrineAnalytics.ts
 * Telemetria silenciosa, não-bloqueante e respeitosa à privacidade da Vitrine Liquida BelaFarma.
 * Monitora acessos, visitantes únicos e recorrentes, localização, carrinhos abandonados e engajamento.
 */

import { VitrineProduto, VitrineCartItem } from './vitrineTypes';

const VISITOR_ID_KEY = 'belafarma_vitrine_vid';
const SESSION_ID_KEY = 'belafarma_vitrine_sid';

function getOrGenerateId(key: string, storage: Storage, prefix: string): string {
  try {
    let id = storage.getItem(key);
    if (!id) {
      id = `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
      storage.setItem(key, id);
    }
    return id;
  } catch (e) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

export function getVisitorId(): string {
  return getOrGenerateId(VISITOR_ID_KEY, window.localStorage, 'vid');
}

export function getSessionId(): string {
  return getOrGenerateId(SESSION_ID_KEY, window.sessionStorage, 'sid');
}

function getDeviceType(): 'mobile' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  return /mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua) || window.innerWidth < 768
    ? 'mobile'
    : 'desktop';
}

function getBrowserName(): string {
  if (typeof window === 'undefined') return 'Desconhecido';
  const ua = navigator.userAgent;
  if (/instagram/i.test(ua)) return 'Instagram In-App';
  if (/whatsapp/i.test(ua)) return 'WhatsApp In-App';
  if (/chrome|crios/i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return 'Safari';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/edg/i.test(ua)) return 'Edge';
  return 'Navegador Web';
}

function getUrlParams(): { utm_source?: string; utm_medium?: string; utm_campaign?: string } {
  if (typeof window === 'undefined') return {};
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source') || params.get('ref') || undefined,
      utm_medium: params.get('utm_medium') || undefined,
      utm_campaign: params.get('utm_campaign') || undefined
    };
  } catch {
    return {};
  }
}

/**
 * Envia o evento de telemetria assincronamente sem bloquear a renderização.
 */
async function sendEvent(eventType: string, payload: Record<string, any> = {}) {
  try {
    const visitor_id = getVisitorId();
    const session_id = getSessionId();
    const device_type = getDeviceType();
    const browser = getBrowserName();
    const { utm_source, utm_medium, utm_campaign } = getUrlParams();
    const referrer = document.referrer || '';

    const body = {
      visitor_id,
      session_id,
      event_type: eventType,
      device_type,
      browser,
      referrer,
      utm_source,
      utm_medium,
      utm_campaign,
      ...payload
    };

    // Usar sendBeacon se disponível durante unload, senão fetch com keepalive
    const jsonStr = JSON.stringify(body);
    if (eventType === 'heartbeat' && navigator.sendBeacon) {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      navigator.sendBeacon('/api/liquidacao/public/analytics/track', blob);
      return;
    }

    fetch('/api/liquidacao/public/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonStr,
      keepalive: true
    }).catch(() => {
      // Falha silenciosa proposital para não atrapalhar o cliente
    });
  } catch (err) {
    // Falha silenciosa
  }
}

export const vitrineAnalytics = {
  /**
   * Registra visualização de página
   */
  trackPageView: () => {
    sendEvent('pageview');
  },

  /**
   * Registra clique ou inspeção de detalhes de um produto
   */
  trackProductClick: (produto: VitrineProduto) => {
    sendEvent('product_click', {
      produto_id: produto.id,
      produto_nome: produto.nome,
      produto_preco: produto.preco_por,
      categoria: produto.categoria
    });
  },

  /**
   * Registra termo de pesquisa buscado pelo cliente
   */
  trackSearch: (searchTerm: string, resultsCount: number) => {
    if (!searchTerm || !searchTerm.trim()) return;
    sendEvent('search', {
      search_term: searchTerm.trim(),
      search_results_count: resultsCount
    });
  },

  /**
   * Registra adição ou atualização no carrinho (para detecção de carrinhos abandonados)
   */
  trackCartUpdate: (
    items: VitrineCartItem[],
    cartTotal: number,
    clientName?: string,
    clientBairro?: string
  ) => {
    sendEvent('cart_update', {
      cart_items: items.map(it => ({
        id: it.produto.id,
        nome: it.produto.nome,
        preco: it.produto.preco_por,
        quantidade: it.quantidade,
        imagem: it.produto.imagem_url
      })),
      cart_total: cartTotal,
      client_name: clientName || undefined,
      client_bairro: clientBairro || undefined
    });
  },

  /**
   * Registra finalização / clique no botão de enviar pedido para o WhatsApp
   */
  trackCheckout: (
    items: VitrineCartItem[],
    cartTotal: number,
    clientName: string,
    clientBairro?: string
  ) => {
    sendEvent('whatsapp_checkout', {
      cart_items: items.map(it => ({
        id: it.produto.id,
        nome: it.produto.nome,
        preco: it.produto.preco_por,
        quantidade: it.quantidade
      })),
      cart_total: cartTotal,
      client_name: clientName,
      client_bairro: clientBairro || undefined
    });
  },

  /**
   * Registra tempo de permanência e scroll
   */
  trackHeartbeat: (durationSeconds: number, scrollPercent: number) => {
    sendEvent('heartbeat', {
      duration_seconds: durationSeconds,
      scroll_percent: scrollPercent
    });
  }
};
