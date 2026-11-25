import React, { useEffect, useMemo, useState } from 'react';
import {
  MessageCircle,
  ShoppingBag,
  CreditCard,
  Sparkles,
  MapPin,
  Star,
  Instagram,
  UtensilsCrossed,
  Clock,
  Truck,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { BelaFarmaLogo } from '../BelaFarmaLogo';
import { BioConfig } from './vitrineTypes';

export interface BioLinksPageProps {
  onExit?: () => void;
}

const DEFAULT_BIO_CONFIG: BioConfig = {
  instagramHandle: '@belafarmasul',
  whatsappNumber: '5532998228189',
  whatsappDisplay: '(32) 99822-8189',
  storeAddress: 'Bairro Ipiranga, Juiz de Fora - MG',
  openingHours: 'Seg–Sáb 07h30 às 20h • Dom 07h30 às 13h',
  paymentsText: 'Cartão Brasil Card • Pix • Crédito/Débito • Dinheiro',
  googleMapsUrl:
    'https://www.google.com/maps/search/?api=1&query=Drogaria+Bela+Farma+Sul+Ipiranga+Juiz+de+Fora+MG',
  googleReviewUrl: '',
  ifoodUrl: '',
  vitrineUrl: '/promocao',
  bioHeadline: 'Bela Farma Sul • Bairro Ipiranga, JF',
  bioSubheadline:
    'Entrega super rápida e grátis nos bairros próximos • Aceitamos Cartão Brasil Card',
  showHours: true,
  showIfood: false,
  showBrasilCard: true,
};

function buildWhatsAppUrl(phoneDigits: string, text: string): string {
  const clean = (phoneDigits || '5532998228189').replace(/\D/g, '') || '5532998228189';
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}

function buildVitrineTarget(baseUrl: string, utmSource: string): string {
  const raw = (baseUrl || '/promocao').trim() || '/promocao';
  try {
    const isAbs = raw.startsWith('http://') || raw.startsWith('https://');
    const url = new URL(raw, window.location.origin);
    url.searchParams.set('utm_source', utmSource || 'bio_direto');
    url.searchParams.set('utm_medium', 'bio');
    url.searchParams.set('utm_campaign', 'bio_links');
    return isAbs ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return `/promocao?utm_source=${encodeURIComponent(utmSource || 'bio_direto')}&utm_medium=bio&utm_campaign=bio_links`;
  }
}

function buildInstagramUrl(handle: string): string {
  const clean = (handle || '').trim().replace(/^@+/, '');
  if (!clean) return 'https://www.instagram.com/';
  return `https://www.instagram.com/${encodeURIComponent(clean)}/`;
}

export const BioLinksPage: React.FC<BioLinksPageProps> = ({ onExit }) => {
  const [config, setConfig] = useState<BioConfig>(DEFAULT_BIO_CONFIG);

  const utmInfo = useMemo(() => {
    if (typeof window === 'undefined') {
      return { utmSource: 'bio_direto', utmMedium: '', utmCampaign: '' };
    }
    try {
      const params = new URLSearchParams(window.location.search);
      return {
        utmSource: params.get('utm_source') || params.get('ref') || 'bio_direto',
        utmMedium: params.get('utm_medium') || '',
        utmCampaign: params.get('utm_campaign') || '',
      };
    } catch {
      return { utmSource: 'bio_direto', utmMedium: '', utmCampaign: '' };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/marketing/public/bio-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data === 'object') {
          setConfig((prev) => ({
            ...prev,
            ...data,
          }));
        }
      })
      .catch(() => {
        // Fallback imediato garantido pelo estado inicial
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const trackBioClick = (buttonId: string, buttonLabel: string) => {
    try {
      const deviceType =
        typeof window !== 'undefined' &&
        (/mobile|android|iphone|ipad/i.test(navigator.userAgent) || window.innerWidth < 768)
          ? 'mobile'
          : 'desktop';

      const payload = JSON.stringify({
        buttonId,
        buttonLabel,
        utmSource: utmInfo.utmSource,
        utmMedium: utmInfo.utmMedium,
        utmCampaign: utmInfo.utmCampaign,
        referrer: typeof document !== 'undefined' ? document.referrer || '' : '',
        deviceType,
      });

      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([payload], { type: 'application/json' });
        const sent = navigator.sendBeacon('/api/marketing/public/bio-click', blob);
        if (sent) return;
      }

      fetch('/api/marketing/public/bio-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Falha silenciosa para nunca bloquear a navegação do cliente
    }
  };

  const origemTexto =
    utmInfo.utmSource && utmInfo.utmSource !== 'bio_direto'
      ? ` (${utmInfo.utmSource})`
      : '';

  const whatsappPedidoUrl = buildWhatsAppUrl(
    config.whatsappNumber,
    `Olá! Vim pelo link da bio da Bela Farma Sul${origemTexto} e gostaria de fazer um pedido com entrega rápida!`
  );

  const whatsappBrasilCardUrl = buildWhatsAppUrl(
    config.whatsappNumber,
    `Olá! Vim pelo link da bio da Bela Farma Sul${origemTexto} e quero saber sobre compras e condições usando o Cartão Brasil Card.`
  );

  const whatsappConsultoriaUrl = buildWhatsAppUrl(
    config.whatsappNumber,
    `Olá! Vim pelo link da bio da Bela Farma Sul${origemTexto} e gostaria de tirar uma dúvida sobre dermocosméticos, linha infantil ou cuidados de saúde.`
  );

  const vitrineTargetUrl = buildVitrineTarget(config.vitrineUrl, utmInfo.utmSource);
  const instagramUrl = config.instagramHandle ? buildInstagramUrl(config.instagramHandle) : '';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-red-50/40 text-slate-900 flex flex-col justify-between">
      {/* Faixa superior institucional */}
      <header className="w-full bg-gradient-to-r from-blue-950 via-blue-900 to-red-700 text-white px-4 pt-6 pb-8 shadow-md">
        <div className="max-w-lg mx-auto flex flex-col items-center text-center gap-3">
          <div className="bg-white/95 px-4 py-2.5 rounded-2xl shadow-lg">
            <BelaFarmaLogo size="md" showSubtext={true} />
          </div>

          <h1
            className="text-xl sm:text-2xl font-black tracking-tight text-white mt-1"
            style={{ textWrap: 'balance' }}
          >
            {config.bioHeadline || DEFAULT_BIO_CONFIG.bioHeadline}
          </h1>

          <p className="text-xs sm:text-sm text-blue-100 font-medium max-w-md leading-relaxed break-words">
            {config.bioSubheadline || DEFAULT_BIO_CONFIG.bioSubheadline}
          </p>

          {/* Selos de Confiança */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-300/40 text-emerald-100 text-xs font-bold">
              <Truck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Entrega Rápida e Grátis nos Bairros Próximos
            </span>

            {config.showBrasilCard && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-100 text-xs font-bold">
                <CreditCard className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                Aceitamos Cartão Brasil Card
              </span>
            )}

            {config.showHours && config.openingHours && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-white/95 text-xs font-semibold">
                <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {config.openingHours}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Lista Principal de Ações */}
      <main className="flex-1 w-full max-w-lg mx-auto px-4 -mt-4 pb-8">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200/80 p-4 sm:p-6 space-y-3">
          <h2
            className="text-xs font-black uppercase tracking-widest text-slate-400 text-center pb-1"
            style={{ textWrap: 'balance' }}
          >
            Escolha como prefere falar ou comprar agora
          </h2>

          {/* 1. Botão Principal WhatsApp */}
          <a
            href={whatsappPedidoUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackBioClick('whatsapp_pedido', 'Pedir agora no WhatsApp')}
            className="min-h-[60px] w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5" aria-hidden="true" />
              </span>
              <div className="text-left min-w-0">
                <div className="font-black text-sm sm:text-base leading-tight">
                  Pedir agora no WhatsApp
                </div>
                <div className="text-xs text-emerald-50 font-medium leading-snug">
                  Entrega super rápida e grátis • {config.whatsappDisplay}
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 shrink-0 text-emerald-100" aria-hidden="true" />
          </a>

          {/* 2. Botão Vitrine de Ofertas */}
          <a
            href={vitrineTargetUrl}
            onClick={() => trackBioClick('vitrine_ofertas', 'Ver Vitrine de Ofertas da Semana')}
            className="min-h-[58px] w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-md shadow-red-600/15 transition-all active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-xl bg-amber-300 text-red-950 flex items-center justify-center shrink-0">
                <ShoppingBag className="w-5 h-5" aria-hidden="true" />
              </span>
              <div className="text-left min-w-0">
                <div className="font-black text-sm sm:text-base leading-tight">
                  Ver Vitrine de Ofertas da Semana
                </div>
                <div className="text-xs text-rose-100 font-medium leading-snug">
                  Monte seu carrinho online e finalize no WhatsApp
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 shrink-0 text-amber-200" aria-hidden="true" />
          </a>

          {/* 3. Botão Cartão Brasil Card */}
          {config.showBrasilCard && (
            <a
              href={whatsappBrasilCardUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackBioClick('brasil_card', 'Comprar com Cartão Brasil Card')}
              className="min-h-[56px] w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-amber-50 hover:bg-amber-100/80 border-2 border-amber-300 text-slate-900 transition-all active:scale-[0.99]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-xl bg-amber-400 text-amber-950 flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5" aria-hidden="true" />
                </span>
                <div className="text-left min-w-0">
                  <div className="font-extrabold text-sm leading-tight text-slate-900">
                    Comprar com Cartão Brasil Card
                  </div>
                  <div className="text-xs text-slate-600 font-medium leading-snug">
                    Facilidade na loja ou na entrega — tire dúvidas aqui
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 shrink-0 text-amber-700" aria-hidden="true" />
            </a>
          )}

          {/* 4. Atendimento Farmacêutico / Skincare / Infantil */}
          <a
            href={whatsappConsultoriaUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackBioClick('atendimento_especialista', 'Dúvidas sobre Dermocosméticos, Infantil ou Saúde')
            }
            className="min-h-[56px] w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-blue-50 hover:bg-blue-100/70 border border-blue-200 text-slate-900 transition-all active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" aria-hidden="true" />
              </span>
              <div className="text-left min-w-0">
                <div className="font-extrabold text-sm leading-tight text-slate-900">
                  Dúvidas sobre Dermocosméticos, Infantil ou Saúde
                </div>
                <div className="text-xs text-slate-600 font-medium leading-snug">
                  Fale com nossa equipe humana no Bairro Ipiranga
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 shrink-0 text-blue-600" aria-hidden="true" />
          </a>

          {/* 5. Como Chegar (Google Maps) */}
          {config.googleMapsUrl && (
            <a
              href={config.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackBioClick('google_maps', 'Como Chegar — Bairro Ipiranga, JF')}
              className="min-h-[56px] w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-900 transition-all active:scale-[0.99]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5" aria-hidden="true" />
                </span>
                <div className="text-left min-w-0">
                  <div className="font-extrabold text-sm leading-tight text-slate-900">
                    Como Chegar — Bairro Ipiranga, JF
                  </div>
                  <div className="text-xs text-slate-600 font-medium leading-snug break-words">
                    {config.storeAddress}
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 shrink-0 text-slate-400" aria-hidden="true" />
            </a>
          )}

          {/* 6. iFood (opcional) */}
          {config.showIfood && config.ifoodUrl && (
            <a
              href={config.ifoodUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackBioClick('ifood', 'Pedir pelo iFood')}
              className="min-h-[56px] w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-rose-50 hover:bg-rose-100/70 border border-rose-200 text-slate-900 transition-all active:scale-[0.99]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                  <UtensilsCrossed className="w-5 h-5" aria-hidden="true" />
                </span>
                <div className="text-left min-w-0">
                  <div className="font-extrabold text-sm leading-tight text-slate-900">
                    Pedir pelo iFood
                  </div>
                  <div className="text-xs text-slate-600 font-medium leading-snug">
                    Veja nossa loja oficial no aplicativo
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 shrink-0 text-rose-500" aria-hidden="true" />
            </a>
          )}

          {/* 7. Avaliação no Google (opcional) */}
          {config.googleReviewUrl && (
            <a
              href={config.googleReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackBioClick('google_review', 'Avaliar a Bela Farma Sul no Google')}
              className="min-h-[56px] w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-yellow-50 hover:bg-yellow-100/70 border border-yellow-200 text-slate-900 transition-all active:scale-[0.99]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-xl bg-yellow-500 text-white flex items-center justify-center shrink-0">
                  <Star className="w-5 h-5" aria-hidden="true" />
                </span>
                <div className="text-left min-w-0">
                  <div className="font-extrabold text-sm leading-tight text-slate-900">
                    Avaliar a Bela Farma Sul no Google ⭐
                  </div>
                  <div className="text-xs text-slate-600 font-medium leading-snug">
                    Sua opinião ajuda vizinhos a encontrarem nossa farmácia
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 shrink-0 text-yellow-600" aria-hidden="true" />
            </a>
          )}

          {/* 8. Seguir no Instagram */}
          {config.instagramHandle && (
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackBioClick('instagram_perfil', `Seguir no Instagram (${config.instagramHandle})`)}
              className="min-h-[56px] w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-fuchsia-50 via-pink-50 to-amber-50 hover:from-fuchsia-100 hover:to-amber-100 border border-pink-200 text-slate-900 transition-all active:scale-[0.99]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600 text-white flex items-center justify-center shrink-0">
                  <Instagram className="w-5 h-5" aria-hidden="true" />
                </span>
                <div className="text-left min-w-0">
                  <div className="font-extrabold text-sm leading-tight text-slate-900">
                    Seguir no Instagram ({config.instagramHandle})
                  </div>
                  <div className="text-xs text-slate-600 font-medium leading-snug">
                    Dicas de saúde, beleza, novidades e ofertas do bairro
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 shrink-0 text-pink-500" aria-hidden="true" />
            </a>
          )}
        </div>

        {/* Selo de Compliance e Segurança */}
        <div className="mt-4 px-4 py-3 rounded-2xl bg-white/80 border border-slate-200/70 text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
            <span>Saúde com confiança • Atendimento farmacêutico humanizado</span>
          </div>
          {config.paymentsText && (
            <p className="text-[11px] text-slate-500 font-medium break-words">
              💳 {config.paymentsText}
            </p>
          )}
        </div>
      </main>

      {/* Rodapé Institucional */}
      <footer
        className="w-full border-t border-slate-200 bg-white/90 px-4 pt-4 text-center text-xs text-slate-500"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="max-w-lg mx-auto flex flex-col items-center gap-1.5">
          <p className="font-bold text-slate-700 break-words">
            Bela Farma Sul • {config.storeAddress}
          </p>
          {config.showHours && config.openingHours && (
            <p className="text-[11px] text-slate-500">{config.openingHours}</p>
          )}
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="mt-1 min-h-[44px] px-3 inline-flex items-center justify-center text-[11px] font-bold text-slate-400 hover:text-red-600 underline underline-offset-2 cursor-pointer"
            >
              Acesso Administrativo
            </button>
          )}
        </div>
      </footer>
    </div>
  );
};
