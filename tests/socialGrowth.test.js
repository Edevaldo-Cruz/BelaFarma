import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  isPublicBioRoute,
  isPublicVitrineRoute,
} from '../components/vitrine/vitrineTypes.ts';
import {
  htmlArteUnitaria,
  ESTILO_PADRAO,
  LOJA,
} from '../components/encarteTemplates.ts';

const require = createRequire(import.meta.url);
const security = require('../backend/security.js');
const { formatarPlanoSocialWhatsApp } = require('../backend/services/marketing-agent.service.js');

function runMiddleware(middleware, reqOverrides = {}) {
  let statusCode = 200;
  let jsonBody = null;
  let nextCalled = false;

  const req = {
    path: '/',
    method: 'GET',
    headers: {},
    query: {},
    ...reqOverrides,
  };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      jsonBody = data;
      return this;
    },
  };
  const next = () => {
    nextCalled = true;
  };

  middleware(req, res, next);
  return { statusCode, jsonBody, nextCalled };
}

describe('Crescimento Social & Link na Bio — Bela Farma Sul', () => {
  it('detecta rotas públicas /bio e /links sem colidir com a Vitrine', () => {
    assert.strictEqual(isPublicBioRoute('/bio'), true);
    assert.strictEqual(isPublicBioRoute('/bio/'), true);
    assert.strictEqual(isPublicBioRoute('/links'), true);
    assert.strictEqual(isPublicBioRoute('#/bio'), true);
    assert.strictEqual(isPublicBioRoute('/?bio=1'), true);

    assert.strictEqual(isPublicBioRoute('/'), false);
    assert.strictEqual(isPublicBioRoute('/promocao'), false);
    assert.strictEqual(isPublicBioRoute('/crediario'), false);

    assert.strictEqual(isPublicVitrineRoute('/bio'), false);
    assert.strictEqual(isPublicVitrineRoute('/links'), false);
  });

  it('libera apenas rotas públicas do /bio e bloqueia rotas administrativas de Crescimento Social', () => {
    const pubGet = runMiddleware(security.apiAuthMiddleware, {
      path: '/marketing/public/bio-config',
      method: 'GET',
    });
    assert.strictEqual(pubGet.nextCalled, true);

    const pubPost = runMiddleware(security.apiAuthMiddleware, {
      path: '/marketing/public/bio-click',
      method: 'POST',
    });
    assert.strictEqual(pubPost.nextCalled, true);

    const privOverview = runMiddleware(security.apiAuthMiddleware, {
      path: '/marketing/social-growth/overview',
      method: 'GET',
    });
    assert.strictEqual(privOverview.nextCalled, false);
    assert.strictEqual(privOverview.statusCode, 401);
    assert.strictEqual(privOverview.jsonBody?.code, 'UNAUTHORIZED');

    const privConfig = runMiddleware(security.apiAuthMiddleware, {
      path: '/marketing/social-growth/config',
      method: 'PUT',
    });
    assert.strictEqual(privConfig.nextCalled, false);
    assert.strictEqual(privConfig.statusCode, 401);
    assert.strictEqual(privConfig.jsonBody?.code, 'UNAUTHORIZED');
  });

  it('renderiza dados atualizados da loja nos templates de artes e respeita lojaOverrides', () => {
    const item = {
      produto_id: 202,
      descricao: 'PROTETOR SOLAR FPS 60 200ML',
      apresentacao: 'FRASCO',
      preco_normal: 79.9,
      preco_promocional: 54.9,
      desconto_percentual: 31,
    };
    const periodo = { inicio: '01/11/2026', termino: '30/11/2026' };

    assert.strictEqual(LOJA.site, '@belafarmasul');
    assert.strictEqual(LOJA.whatsapp, '(32) 99822-8189');
    assert.ok(LOJA.pagamentos.includes('Cartão Brasil Card'));
    assert.ok(LOJA.horario.includes('07h30'));

    const estiloComRodape = {
      ...ESTILO_PADRAO,
      imagemFundoCustom: undefined,
      exibirRodape: true,
    };

    const htmlDefault = htmlArteUnitaria(item, 'story', periodo, estiloComRodape);
    assert.ok(htmlDefault.includes('@belafarmasul'));
    assert.ok(htmlDefault.includes('(32) 99822-8189'));
    assert.ok(htmlDefault.includes('Cartão Brasil Card'));
    assert.ok(htmlDefault.includes('Seg–Sáb 07h30 às 20h • Dom 07h30 às 13h'));

    const htmlCustom = htmlArteUnitaria(item, 'feed', periodo, {
      ...estiloComRodape,
      lojaOverrides: {
        site: '@belafarmasul.jf',
        whatsapp: '(32) 99999-0000',
        pagamentos: 'Cartão Brasil Card • Pix',
      },
    });
    assert.ok(htmlCustom.includes('@belafarmasul.jf'));
    assert.ok(htmlCustom.includes('(32) 99999-0000'));
    assert.ok(htmlCustom.includes('Cartão Brasil Card • Pix'));
  });

  it('formata pauta semanal social para WhatsApp sem erros', () => {
    const msg = formatarPlanoSocialWhatsApp(
      {
        temaSemana: 'Semana do Cuidado no Ipiranga',
        climateContext: '22°C — Tempo variável (Ipiranga/JF)',
        postsFeed: [
          {
            dia: 'Terça-feira',
            formato: 'Reels (30-45s)',
            titulo: '3 cuidados na mudança de tempo',
            gancho3s: 'Morador do Ipiranga, o tempo virou de novo?',
          },
        ],
        googlePerfil: {
          titulo: 'Entrega Grátis e Cartão Brasil Card',
        },
      },
      { instagramHandle: '@belafarmasul' }
    );

    assert.ok(msg.includes('PAUTA DA SEMANA — BELA FARMA SUL'));
    assert.ok(msg.includes('@belafarmasul'));
    assert.ok(msg.includes('Terça-feira'));
    assert.ok(msg.includes('drogariabelafarma.com.br/bio'));
  });
});
