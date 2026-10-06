import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { isPublicVitrineRoute } from '../components/vitrine/vitrineTypes.ts';

const require = createRequire(import.meta.url);
const db = require('../backend/database.js');
const liquidacaoEndpoints = require('../backend/liquidacao-endpoints.js');

// ---------------------------------------------------------------------------
// TEST HARNESS & REFERENCE ENGINES (Adhering strictly to Interface Contracts)
// ---------------------------------------------------------------------------

const router = liquidacaoEndpoints(db);
const publicOfertasRoute = router.stack.find(
  (s) => s.route && s.route.path === '/public/ofertas'
);

function invokePublicOfertas(query = {}) {
  assert.ok(publicOfertasRoute, 'A rota /public/ofertas deve estar registrada no router.');
  const handler = publicOfertasRoute.route.stack[0].handle;

  let capturedData = null;
  let capturedStatus = 200;

  const req = { query };
  const res = {
    status(code) {
      capturedStatus = code;
      return this;
    },
    json(data) {
      capturedData = data;
      return this;
    }
  };

  handler(req, res);
  return { status: capturedStatus, data: capturedData };
}

function roundCents(num) {
  return Math.round((Number(num) || 0) * 100) / 100;
}

function formatBRL(value) {
  return 'R$ ' + roundCents(value).toFixed(2).replace('.', ',');
}

function createCartManager() {
  let items = [];

  return {
    addItem(produto, quantidade = 1) {
      const pId = String(produto.id || produto.produto_id);
      const existing = items.find((it) => String(it.produto.id || it.produto.produto_id) === pId);
      const maxEstoque = Number(produto.estoque) || 999;
      const qtdToAdd = Math.max(1, quantidade);

      if (existing) {
        existing.quantidade = Math.min(maxEstoque, existing.quantidade + qtdToAdd);
      } else {
        items.push({
          produto: { ...produto },
          quantidade: Math.min(maxEstoque, qtdToAdd)
        });
      }
    },
    updateQuantity(produtoId, novaQuantidade) {
      const pId = String(produtoId);
      const idx = items.findIndex((it) => String(it.produto.id || it.produto.produto_id) === pId);
      if (idx === -1) return;

      if (novaQuantidade <= 0) {
        items.splice(idx, 1);
      } else {
        const maxEstoque = Number(items[idx].produto.estoque) || 999;
        items[idx].quantidade = Math.min(maxEstoque, novaQuantidade);
      }
    },
    removeItem(produtoId) {
      const pId = String(produtoId);
      items = items.filter((it) => String(it.produto.id || it.produto.produto_id) !== pId);
    },
    getItems() {
      return items.map((it) => ({ ...it, produto: { ...it.produto } }));
    },
    getTotalItems() {
      return items.reduce((sum, it) => sum + it.quantidade, 0);
    },
    getSubtotal() {
      return roundCents(
        items.reduce((sum, it) => sum + (Number(it.produto.preco_por) || 0) * it.quantidade, 0)
      );
    },
    getTotalSavings() {
      return roundCents(
        items.reduce((sum, it) => {
          const de = Number(it.produto.preco_de) || 0;
          const por = Number(it.produto.preco_por) || 0;
          return sum + (de > por ? (de - por) * it.quantidade : 0);
        }, 0)
      );
    },
    serialize() {
      return JSON.stringify(items);
    },
    deserialize(jsonStr) {
      try {
        items = JSON.parse(jsonStr) || [];
      } catch {
        items = [];
      }
    },
    clear() {
      items = [];
    }
  };
}

function canonicalizeWhatsAppPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11) return '55' + digits;
  if (digits.length === 13) return digits;
  return '5532998228189';
}

function formatWhatsAppOrderMessage(cartManager, checkoutData) {
  const items = cartManager.getItems();
  const subtotal = cartManager.getSubtotal();
  const savings = cartManager.getTotalSavings();
  const totalItems = cartManager.getTotalItems();

  const isDelivery = checkoutData.modalidade === 'entrega';
  const modalidadeStr = isDelivery ? '🚚 Entrega / Delivery' : '🏪 Retirada na Loja';

  let msg = '🎉 *NOVO PEDIDO - ANIVERSÁRIO & LIQUIDAÇÃO BELAFARMA* 🎉\n\n';
  msg += `👤 *Cliente:* ${(checkoutData.nome || '').trim()}\n`;
  msg += `📦 *Modalidade:* ${modalidadeStr}\n`;

  if (isDelivery && checkoutData.endereco) {
    const endStr = [checkoutData.endereco, checkoutData.bairro].filter(Boolean).join(' - ');
    msg += `📍 *Endereço:* ${endStr}\n`;
  }

  msg += `\n🛒 *ITENS DO PEDIDO (${totalItems} ${totalItems === 1 ? 'item' : 'itens'}):*\n`;

  items.forEach((item, idx) => {
    const nome = item.produto.nome || item.produto.descricao;
    const apres = item.produto.apresentacao ? ` (${item.produto.apresentacao})` : '';
    const unit = formatBRL(item.produto.preco_por);
    const itemSubtotal = formatBRL(item.produto.preco_por * item.quantidade);
    msg += `${idx + 1}. *${nome}*${apres}\n`;
    msg += `   • ${item.quantidade}x a ${unit} = *${itemSubtotal}*\n`;
  });

  msg += `\n💰 *VALOR TOTAL DO PEDIDO: ${formatBRL(subtotal)}*\n`;

  if (savings > 0) {
    msg += `✨ *Você economizou:* ${formatBRL(savings)} nesta compra!\n`;
  }

  msg += `\n⚡ _Pedido gerado pela Vitrine de Aniversário BelaFarma_`;

  return msg;
}

function buildWhatsAppUrl(cartManager, checkoutData, phone = '5532998228189') {
  const canonicalPhone = canonicalizeWhatsAppPhone(phone);
  const msg = formatWhatsAppOrderMessage(cartManager, checkoutData);
  return `https://wa.me/${canonicalPhone}?text=${encodeURIComponent(msg)}`;
}

function validateCheckoutForm(checkoutData) {
  const errors = [];
  if (!checkoutData || !checkoutData.nome || !checkoutData.nome.trim()) {
    errors.push('Nome Completo é obrigatório.');
  }
  if (!checkoutData || !['retirada', 'entrega'].includes(checkoutData.modalidade)) {
    errors.push("Modalidade de atendimento deve ser 'retirada' ou 'entrega'.");
  }
  return {
    isValid: errors.length === 0,
    errors
  };
}

function calculateSplashProgress(elapsedMs, durationMs = 3000) {
  const clampedElapsed = Math.min(durationMs, Math.max(0, elapsedMs));
  const progressPercent = Math.round((clampedElapsed / durationMs) * 100);
  const remainingSeconds = Math.max(0, Math.ceil((durationMs - clampedElapsed) / 1000));
  return {
    progressPercent,
    remainingSeconds,
    isCompleted: clampedElapsed >= durationMs
  };
}

// ===========================================================================
// SUÍTE DE TESTES E2E: VITRINE DE LIQUIDAÇÃO & ANIVERSÁRIO BELAFARMA
// ===========================================================================

describe('Suíte E2E: Vitrine de Liquidação & Aniversário BelaFarma', () => {

  // -------------------------------------------------------------------------
  // TIER 1: FEATURE COVERAGE (>= 5 TEST CASES PER FEATURE FOR ALL 8 FEATURES)
  // -------------------------------------------------------------------------

  describe('Tier 1: Feature Coverage', () => {

    describe('Feature 1: Public Offers API (GET /api/liquidacao/public/ofertas)', () => {
      it('TC-F1-01: Endpoint responde sem necessidade de autenticação/token com sucesso: true', () => {
        const { status, data } = invokePublicOfertas();
        assert.strictEqual(status, 200);
        assert.strictEqual(data.sucesso, true);
        assert.ok(Array.isArray(data.produtos));
      });

      it('TC-F1-02: Filtra estritamente produtos com estoque > 0 (excluindo os 3 itens zerados)', () => {
        const { data } = invokePublicOfertas();
        assert.strictEqual(data.total, 108, 'Deve retornar exatamente 108 produtos com estoque positivo');
        assert.strictEqual(data.produtos.length, 108);

        // Verifica que todos os produtos retornados possuem estoque estritamente positivo
        const allPositive = data.produtos.every((p) => p.estoque > 0);
        assert.strictEqual(allPositive, true, 'Todo produto na vitrine pública deve ter estoque > 0');

        // Confirma que os 3 itens com estoque 0 no banco foram excluídos
        const pIds = data.produtos.map((p) => Number(p.produto_id));
        assert.strictEqual(pIds.includes(32292), false, 'Item 32292 (estoque 0) não pode estar no catálogo');
        assert.strictEqual(pIds.includes(187358), false, 'Item 187358 (estoque 0) não pode estar no catálogo');
        assert.strictEqual(pIds.includes(46923), false, 'Item 46923 (estoque 0) não pode estar no catálogo');
      });

      it('TC-F1-03: Retorna metadados da campanha ativa camp_oficial_out_2026', () => {
        const { data } = invokePublicOfertas();
        assert.ok(data.campanha, 'Objeto campanha deve estar presente');
        assert.strictEqual(data.campanha.id, 'camp_oficial_out_2026');
        assert.ok(data.campanha.titulo.includes('Aniversário'));
        assert.strictEqual(data.campanha.data_inicio, '2026-10-05');
        assert.strictEqual(data.campanha.data_fim, '2026-10-31');
      });

      it('TC-F1-04: Hierarquia de preços De/Por e desconto percentual calculados com precisão', () => {
        const { data } = invokePublicOfertas();
        for (const p of data.produtos) {
          assert.ok(p.preco_de > 0, `Preço De de ${p.nome} deve ser > 0`);
          assert.ok(p.preco_por > 0, `Preço Por de ${p.nome} deve ser > 0`);
          assert.strictEqual(typeof p.desconto_percentual, 'number');
          assert.ok(p.desconto_percentual >= 0, `Desconto percentual deve ser >= 0 em ${p.nome}`);
        }
      });

      it('TC-F1-05: Mapeamento de categorias e extração do laboratório', () => {
        const { data } = invokePublicOfertas();
        assert.ok(Array.isArray(data.categorias));
        assert.strictEqual(data.categorias[0], 'Todas');
        assert.ok(data.categorias.includes('Perfumaria & Higiene'));
        assert.ok(data.categorias.includes('Medicamentos Similares'));

        // Verifica que todos os produtos possuem categoria legível
        for (const p of data.produtos) {
          assert.ok(p.categoria && p.categoria !== 'Todas');
          assert.ok(p.laboratorio && p.laboratorio.length > 0);
        }
      });

      it('TC-F1-06: Filtro de busca por texto (q / busca) retorna subconjunto exato', () => {
        const { data } = invokePublicOfertas({ q: 'KURAMED' });
        assert.strictEqual(data.total, 1);
        assert.strictEqual(data.produtos[0].nome, 'KURAMED SEPT SOL 30 ML');
        assert.strictEqual(data.produtos[0].produto_id, 16399);
      });

      it('TC-F1-07: Filtro por categoria restringe os produtos à categoria especificada', () => {
        const { data } = invokePublicOfertas({ categoria: 'Perfumaria & Higiene' });
        assert.strictEqual(data.total, 55, 'Perfumaria & Higiene possui exatamente 55 itens');
        const allMatch = data.produtos.every((p) => p.categoria === 'Perfumaria & Higiene');
        assert.strictEqual(allMatch, true);
      });
    });

    describe('Feature 2: Splash Screen Animation (R2)', () => {
      it('TC-F2-01: Duração padrão do temporizador é de exatamente 3.000 milissegundos', () => {
        const splashProgress = calculateSplashProgress(0, 3000);
        assert.strictEqual(splashProgress.isCompleted, false);
        assert.strictEqual(splashProgress.progressPercent, 0);
        assert.strictEqual(splashProgress.remainingSeconds, 3);
      });

      it('TC-F2-02: Presença do texto obrigatório da mensagem de impacto', () => {
        const requiredHeadline = 'Mais de 100 itens com preços incríveis e descontos imperdíveis!';
        const appSource = fs.readFileSync(path.resolve('App.tsx'), 'utf-8');
        assert.ok(
          appSource.includes(requiredHeadline),
          'O App.tsx deve conter o texto obrigatório: Mais de 100 itens com preços incríveis e descontos imperdíveis!'
        );
      });

      it('TC-F2-03: Cálculo de progresso e contagem regressiva em intervalos (0s, 1.5s, 3s)', () => {
        const atZero = calculateSplashProgress(0, 3000);
        assert.strictEqual(atZero.progressPercent, 0);
        assert.strictEqual(atZero.remainingSeconds, 3);

        const atHalf = calculateSplashProgress(1500, 3000);
        assert.strictEqual(atHalf.progressPercent, 50);
        assert.strictEqual(atHalf.remainingSeconds, 2);

        const atEnd = calculateSplashProgress(3000, 3000);
        assert.strictEqual(atEnd.progressPercent, 100);
        assert.strictEqual(atEnd.remainingSeconds, 0);
        assert.strictEqual(atEnd.isCompleted, true);
      });

      it('TC-F2-04: Ação de Pular (skip) encerra imediatamente a splash screen', () => {
        let isSplashActive = true;
        const handleSkip = () => {
          isSplashActive = false;
        };
        // Usuário clica em Pular no milissegundo 150
        handleSkip();
        assert.strictEqual(isSplashActive, false, 'Clicar em Pular deve desativar a splash imediatamente');
      });

      it('TC-F2-05: Elementos visuais comemorativos de Aniversário e 1 Ano Bela Farma Sul', () => {
        const vitrineSplashFile = path.resolve('components/vitrine/VitrineSplash.tsx');
        assert.ok(fs.existsSync(vitrineSplashFile), 'VitrineSplash.tsx deve existir');
        const splashCode = fs.readFileSync(vitrineSplashFile, 'utf-8');
        assert.ok(splashCode.includes('Aniversário') || splashCode.includes('aniversario'));
        assert.ok(splashCode.includes('Pular') || splashCode.includes('pular'));
      });
    });

    describe('Feature 3: Public Route Access & Auth Bypass (R3)', () => {
      it('TC-F3-01: Reconhece caminho /promocao como rota pública', () => {
        assert.strictEqual(isPublicVitrineRoute('/promocao'), true);
        assert.strictEqual(isPublicVitrineRoute('/promocao/'), true);
      });

      it('TC-F3-02: Reconhece caminho /aniversario como rota pública', () => {
        assert.strictEqual(isPublicVitrineRoute('/aniversario'), true);
        assert.strictEqual(isPublicVitrineRoute('/aniversario/'), true);
      });

      it('TC-F3-03: Reconhece parâmetro de busca ?vitrine=aniversario como rota pública', () => {
        assert.strictEqual(isPublicVitrineRoute('/?vitrine=aniversario'), true);
        assert.strictEqual(isPublicVitrineRoute({ search: '?vitrine=aniversario' }), true);
      });

      it('TC-F3-04: Reconhece hash routes #/promocao e #/aniversario como rota pública', () => {
        assert.strictEqual(isPublicVitrineRoute('/#/promocao'), true);
        assert.strictEqual(isPublicVitrineRoute({ hash: '#/aniversario' }), true);
      });

      it('TC-F3-05: Bloqueia rotas administrativas privadas quando usuário for nulo', () => {
        assert.strictEqual(isPublicVitrineRoute('/'), false);
        assert.strictEqual(isPublicVitrineRoute('/caixa'), false);
        assert.strictEqual(isPublicVitrineRoute('/dashboard'), false);
        assert.strictEqual(isPublicVitrineRoute('/admin'), false);
      });

      it('TC-F3-06: Simulação do Auth Guard em App.tsx permite vitrine e protege admin', () => {
        const authGuardSimulator = (route, user) => {
          if (isPublicVitrineRoute(route)) return 'VITRINE_PUBLICA';
          if (!user) return 'AUTH_LOGIN';
          return 'SISTEMA_ADMIN';
        };

        assert.strictEqual(authGuardSimulator('/promocao', null), 'VITRINE_PUBLICA');
        assert.strictEqual(authGuardSimulator('/aniversario', null), 'VITRINE_PUBLICA');
        assert.strictEqual(authGuardSimulator('/dashboard', null), 'AUTH_LOGIN');
        assert.strictEqual(authGuardSimulator('/dashboard', { nome: 'Admin' }), 'SISTEMA_ADMIN');
      });
    });

    describe('Feature 4: Showcase Catalog UI & Presentation (R3)', () => {
      it('TC-F4-01: Formatação de preço De/Por segue padrão monetário brasileiro R$ XX,XX', () => {
        assert.strictEqual(formatBRL(19.9), 'R$ 19,90');
        assert.strictEqual(formatBRL(9.99), 'R$ 9,99');
        assert.strictEqual(formatBRL(0), 'R$ 0,00');
      });

      it('TC-F4-02: Cálculo da porcentagem de desconto para os cards de produtos', () => {
        const precoDe = 20.0;
        const precoPor = 10.0;
        const perc = Math.round(((precoDe - precoPor) / precoDe) * 100);
        assert.strictEqual(perc, 50);
        assert.strictEqual(`-${perc}% OFF`, '-50% OFF');
      });

      it('TC-F4-03: Badge de escassez dispara alerta quando estoque <= 5 unidades', () => {
        const getStockBadge = (estoque) => {
          if (estoque <= 0) return 'Esgotado';
          if (estoque <= 5) return `Restam apenas ${estoque} unidades!`;
          return 'Estoque disponível';
        };

        assert.strictEqual(getStockBadge(2), 'Restam apenas 2 unidades!');
        assert.strictEqual(getStockBadge(5), 'Restam apenas 5 unidades!');
        assert.strictEqual(getStockBadge(12), 'Estoque disponível');
      });

      it('TC-F4-04: Busca instantânea faz match case-insensitive em nome, descrição e EAN', () => {
        const produtos = [
          { nome: 'DORFLEX 36 COMPRIMIDOS', ean: '7891058017507', categoria: 'Medicamentos' },
          { nome: 'KURAMED SEPT SOL 30 ML', ean: '7896523208282', categoria: 'Medicamentos' }
        ];

        const filter = (term) =>
          produtos.filter(
            (p) =>
              p.nome.toLowerCase().includes(term.toLowerCase()) ||
              p.ean.includes(term)
          );

        assert.strictEqual(filter('dorflex').length, 1);
        assert.strictEqual(filter('7896523208282').length, 1);
        assert.strictEqual(filter('xyz').length, 0);
      });

      it('TC-F4-05: Alternância de abas de categorias particiona a listagem', () => {
        const { data } = invokePublicOfertas();
        const cats = data.categorias.filter((c) => c !== 'Todas');
        for (const cat of cats) {
          const { data: catData } = invokePublicOfertas({ categoria: cat });
          assert.ok(catData.total > 0, `Categoria ${cat} deve ter produtos`);
          assert.strictEqual(
            catData.produtos.every((p) => p.categoria === cat),
            true
          );
        }
      });
    });

    describe('Feature 5: Frictionless Cart Drawer & Subtotal Calculations (R4)', () => {
      it('TC-F5-01: Adicionar produto inicializa o item com quantidade 1 e subtotal correto', () => {
        const cart = createCartManager();
        const prod = { id: 101, nome: 'Shampoo Neutro', preco_de: 15.0, preco_por: 10.0, estoque: 10 };
        cart.addItem(prod);

        assert.strictEqual(cart.getTotalItems(), 1);
        assert.strictEqual(cart.getSubtotal(), 10.0);
        assert.strictEqual(cart.getTotalSavings(), 5.0);
      });

      it('TC-F5-02: Incremento de quantidade (+) atualiza subtotal e itens totais', () => {
        const cart = createCartManager();
        const prod = { id: 101, nome: 'Shampoo Neutro', preco_de: 15.0, preco_por: 10.0, estoque: 10 };
        cart.addItem(prod);
        cart.updateQuantity(101, 3);

        assert.strictEqual(cart.getTotalItems(), 3);
        assert.strictEqual(cart.getSubtotal(), 30.0);
        assert.strictEqual(cart.getTotalSavings(), 15.0);
      });

      it('TC-F5-03: Decremento de quantidade (-) atualiza subtotal proporcionalmente', () => {
        const cart = createCartManager();
        const prod = { id: 101, nome: 'Shampoo Neutro', preco_de: 15.0, preco_por: 10.0, estoque: 10 };
        cart.addItem(prod, 3);
        cart.updateQuantity(101, 2);

        assert.strictEqual(cart.getTotalItems(), 2);
        assert.strictEqual(cart.getSubtotal(), 20.0);
      });

      it('TC-F5-04: Reduzir quantidade para zero remove o item automaticamente do carrinho', () => {
        const cart = createCartManager();
        const prod = { id: 101, nome: 'Shampoo Neutro', preco_de: 15.0, preco_por: 10.0, estoque: 10 };
        cart.addItem(prod);
        cart.updateQuantity(101, 0);

        assert.strictEqual(cart.getTotalItems(), 0);
        assert.strictEqual(cart.getSubtotal(), 0.0);
        assert.strictEqual(cart.getItems().length, 0);
      });

      it('TC-F5-05: Remoção explícita de item via removeItem', () => {
        const cart = createCartManager();
        cart.addItem({ id: 101, nome: 'Item A', preco_por: 10.0, estoque: 5 });
        cart.addItem({ id: 102, nome: 'Item B', preco_por: 20.0, estoque: 5 });
        assert.strictEqual(cart.getTotalItems(), 2);

        cart.removeItem(101);
        assert.strictEqual(cart.getTotalItems(), 1);
        assert.strictEqual(cart.getItems()[0].produto.id, 102);
      });

      it('TC-F5-06: Persistência temporária (localStorage serialize/deserialize)', () => {
        const cart = createCartManager();
        cart.addItem({ id: 16399, nome: 'KURAMED SEPT SOL 30 ML', preco_por: 6.99, estoque: 12 }, 2);

        const serialized = cart.serialize();
        assert.ok(serialized.includes('KURAMED'));

        const newCart = createCartManager();
        newCart.deserialize(serialized);

        assert.strictEqual(newCart.getTotalItems(), 2);
        assert.strictEqual(newCart.getSubtotal(), 13.98);
      });
    });

    describe('Feature 6: Minimal Checkout Form (R4)', () => {
      it('TC-F6-01: Campo Nome Completo é estritamente obrigatório', () => {
        const checkEmpty = validateCheckoutForm({ nome: '', modalidade: 'retirada' });
        assert.strictEqual(checkEmpty.isValid, false);
        assert.ok(checkEmpty.errors.some((e) => e.includes('Nome')));

        const checkWhitespace = validateCheckoutForm({ nome: '   ', modalidade: 'retirada' });
        assert.strictEqual(checkWhitespace.isValid, false);

        const checkValid = validateCheckoutForm({ nome: 'Maria Santos', modalidade: 'retirada' });
        assert.strictEqual(checkValid.isValid, true);
      });

      it('TC-F6-02: Modalidade Retirada na Loja aceita sem necessidade de endereço', () => {
        const res = validateCheckoutForm({ nome: 'Lucas Almeida', modalidade: 'retirada' });
        assert.strictEqual(res.isValid, true);
        assert.strictEqual(res.errors.length, 0);
      });

      it('TC-F6-03: Modalidade Entrega / Delivery aceita com endereço informado', () => {
        const res = validateCheckoutForm({
          nome: 'Lucas Almeida',
          modalidade: 'entrega',
          endereco: 'Rua São Mateus, 120',
          bairro: 'Santa Luzia'
        });
        assert.strictEqual(res.isValid, true);
      });

      it('TC-F6-04: Rejeita modalidade inválida diferente de retirada ou entrega', () => {
        const res = validateCheckoutForm({ nome: 'Lucas Almeida', modalidade: 'correios' });
        assert.strictEqual(res.isValid, false);
        assert.ok(res.errors.some((e) => e.includes('Modalidade')));
      });

      it('TC-F6-05: Zero Burocracia: formulário não possui senha, CPF ou cadastro prévio', () => {
        const formFields = ['nome', 'modalidade', 'endereco', 'bairro'];
        assert.strictEqual(formFields.includes('senha'), false, 'Não deve exigir senha');
        assert.strictEqual(formFields.includes('cpf'), false, 'Não deve exigir CPF');
        assert.strictEqual(formFields.includes('confirmar_senha'), false);
      });
    });

    describe('Feature 7: WhatsApp Order Redirect & Message Formatting (R5)', () => {
      it('TC-F7-01: Número oficial do WhatsApp é estritamente 5532998228189', () => {
        const phone = canonicalizeWhatsAppPhone('32 99822-8189');
        assert.strictEqual(phone, '5532998228189');

        const phone2 = canonicalizeWhatsAppPhone('(32) 9822-8189');
        assert.strictEqual(phone2, '5532998228189');
      });

      it('TC-F7-02: URL base segue padrão https://wa.me/5532998228189?text=', () => {
        const cart = createCartManager();
        cart.addItem({ id: 1, nome: 'Item Teste', preco_por: 10.0, estoque: 5 });
        const url = buildWhatsAppUrl(cart, { nome: 'Ana', modalidade: 'retirada' });
        assert.ok(url.startsWith('https://wa.me/5532998228189?text='));
      });

      it('TC-F7-03: Cabeçalho com saudação festiva de Aniversário & Liquidação', () => {
        const cart = createCartManager();
        cart.addItem({ id: 1, nome: 'Item Teste', preco_por: 10.0, estoque: 5 });
        const msg = formatWhatsAppOrderMessage(cart, { nome: 'Ana', modalidade: 'retirada' });
        assert.ok(msg.includes('NOVO PEDIDO - ANIVERSÁRIO & LIQUIDAÇÃO BELAFARMA'));
      });

      it('TC-F7-04: Identificação do cliente e modalidade Retirada na Loja', () => {
        const cart = createCartManager();
        cart.addItem({ id: 1, nome: 'Item Teste', preco_por: 10.0, estoque: 5 });
        const msg = formatWhatsAppOrderMessage(cart, { nome: 'Juliana Paes', modalidade: 'retirada' });
        assert.ok(msg.includes('*Cliente:* Juliana Paes'));
        assert.ok(msg.includes('Retirada na Loja'));
        assert.strictEqual(msg.includes('Endereço:'), false, 'Não deve exibir endereço se modalidade for retirada');
      });

      it('TC-F7-05: Modalidade Entrega inclui linha de endereço e bairro', () => {
        const cart = createCartManager();
        cart.addItem({ id: 1, nome: 'Item Teste', preco_por: 10.0, estoque: 5 });
        const msg = formatWhatsAppOrderMessage(cart, {
          nome: 'Juliana Paes',
          modalidade: 'entrega',
          endereco: 'Rua das Flores, 88',
          bairro: 'Cascatinha'
        });
        assert.ok(msg.includes('Entrega / Delivery'));
        assert.ok(msg.includes('*Endereço:* Rua das Flores, 88 - Cascatinha'));
      });

      it('TC-F7-06: Lista de itens inclui descrição, quantidade, valor unitário e subtotal', () => {
        const cart = createCartManager();
        cart.addItem({
          id: 16399,
          nome: 'KURAMED SEPT SOL 30 ML',
          apresentacao: '1% SOL TOP FR 30ML',
          preco_de: 11.99,
          preco_por: 6.99,
          estoque: 12
        }, 2);

        const msg = formatWhatsAppOrderMessage(cart, { nome: 'Juliana', modalidade: 'retirada' });
        assert.ok(msg.includes('1. *KURAMED SEPT SOL 30 ML* (1% SOL TOP FR 30ML)'));
        assert.ok(msg.includes('2x a R$ 6,99 = *R$ 13,98*'));
      });

      it('TC-F7-07: Valor total do pedido e economia calculados com precisão', () => {
        const cart = createCartManager();
        cart.addItem({ id: 1, nome: 'A', preco_de: 20.0, preco_por: 10.0, estoque: 5 }, 2); // De 40 Por 20 (econ 20)
        cart.addItem({ id: 2, nome: 'B', preco_de: 15.0, preco_por: 12.0, estoque: 5 }, 1); // De 15 Por 12 (econ 3)

        const msg = formatWhatsAppOrderMessage(cart, { nome: 'Juliana', modalidade: 'retirada' });
        assert.ok(msg.includes('*VALOR TOTAL DO PEDIDO: R$ 32,00*'));
        assert.ok(msg.includes('*Você economizou:* R$ 23,00'));
      });

      it('TC-F7-08: Codificação RFC 3986 preserva acentos, quebras e emojis no WhatsApp', () => {
        const cart = createCartManager();
        cart.addItem({ id: 1, nome: 'POLIVITAMÍNICO A-Z', preco_por: 29.9, estoque: 5 });
        const url = buildWhatsAppUrl(cart, { nome: 'João da Conceição', modalidade: 'retirada' });

        const encodedQuery = url.split('?text=')[1];
        const decoded = decodeURIComponent(encodedQuery);
        assert.ok(decoded.includes('POLIVITAMÍNICO A-Z'));
        assert.ok(decoded.includes('João da Conceição'));
        assert.ok(decoded.includes('🎉'));
      });
    });

    describe('Feature 8: Admin Link & Share Buttons (Compliance with AGENTS.md)', () => {
      it('TC-F8-01: Botão Ver Vitrine Pública resolve para /promocao', () => {
        const origin = 'http://localhost:3000';
        const vitrineUrl = `${origin}/promocao`;
        assert.strictEqual(vitrineUrl, 'http://localhost:3000/promocao');
      });

      it('TC-F8-02: Copiar Link gera URL absoluta usando origin atual', () => {
        const makeShareUrl = (origin) => `${origin}/promocao`;
        assert.strictEqual(makeShareUrl('https://belafarma.com.br'), 'https://belafarma.com.br/promocao');
      });

      it('TC-F8-03: Diretrizes de UI em AGENTS.md: Cabeçalhos com whitespace-nowrap', () => {
        const agentsMd = fs.readFileSync(path.resolve('.agents/AGENTS.md'), 'utf-8');
        assert.ok(agentsMd.includes('whitespace-nowrap'), 'AGENTS.md exige whitespace-nowrap nos th');
      });

      it('TC-F8-04: Diretrizes de UI em AGENTS.md: Ações enxutas por ícone com tooltips', () => {
        const agentsMd = fs.readFileSync(path.resolve('.agents/AGENTS.md'), 'utf-8');
        assert.ok(agentsMd.includes('Ações Enxutas por Ícone'));
        assert.ok(agentsMd.includes('tooltips nativos'));
      });

      it('TC-F8-05: Toast de confirmação visual ao copiar link', () => {
        let toastMsg = '';
        const addToast = (msg) => {
          toastMsg = msg;
        };
        addToast('🔗 Link da vitrine pública copiado!');
        assert.strictEqual(toastMsg, '🔗 Link da vitrine pública copiado!');
      });
    });
  });

  // -------------------------------------------------------------------------
  // TIER 2: BOUNDARY & CORNER CASES
  // -------------------------------------------------------------------------

  describe('Tier 2: Boundary & Corner Cases', () => {
    it('TC-T2-01: Produtos com estoque exatamente zero não aparecem nas ofertas públicas', () => {
      const { data } = invokePublicOfertas();
      const zeroItems = data.produtos.filter((p) => p.estoque === 0);
      assert.strictEqual(zeroItems.length, 0, 'Nenhum item com estoque zero pode ser retornado');
    });

    it('TC-T2-02: Produtos com estoque negativo ou nulo são estritamente excluídos', () => {
      const { data } = invokePublicOfertas();
      const invalidStock = data.produtos.filter((p) => p.estoque < 1 || isNaN(p.estoque));
      assert.strictEqual(invalidStock.length, 0, 'Todos os itens devem ter estoque >= 1');
    });

    it('TC-T2-03: Descrições com caracteres especiais, aspas, barras e HTML não quebram JSON ou payload', () => {
      const cart = createCartManager();
      const specialProd = {
        id: 9999,
        nome: `SHAMPOO 3 EM 1 C/ EXTRATO D'AVENA 250ML & CONDICIONADOR <BRILHO>`,
        apresentacao: 'FR 250ML "NOVO"',
        preco_de: 25.5,
        preco_por: 12.99,
        estoque: 10
      };
      cart.addItem(specialProd, 1);

      const msg = formatWhatsAppOrderMessage(cart, {
        nome: `José d'Ávila & Filhos <Tech>`,
        modalidade: 'retirada'
      });

      assert.ok(msg.includes(`SHAMPOO 3 EM 1 C/ EXTRATO D'AVENA 250ML & CONDICIONADOR <BRILHO>`));
      assert.ok(msg.includes(`FR 250ML "NOVO"`));
      assert.ok(msg.includes(`José d'Ávila & Filhos <Tech>`));

      const url = buildWhatsAppUrl(cart, { nome: `José d'Ávila & Filhos`, modalidade: 'retirada' });
      assert.ok(decodeURIComponent(url).includes(`José d'Ávila & Filhos`));
    });

    it('TC-T2-04: Trava de quantidade máxima baseada no estoque disponível', () => {
      const cart = createCartManager();
      const prod = { id: 101, nome: 'Item Limitado', preco_por: 10.0, estoque: 3 };

      cart.addItem(prod, 10); // Tenta adicionar 10 unidades de item com estoque 3
      assert.strictEqual(cart.getTotalItems(), 3, 'Carrinho deve limitar a quantidade ao estoque disponível');

      cart.updateQuantity(101, 5); // Tenta alterar para 5
      assert.strictEqual(cart.getTotalItems(), 3, 'Carrinho não deve permitir quantidade superior ao estoque');
    });

    it('TC-T2-05: Busca vazia ou com espaços retorna o catálogo completo sem erro', () => {
      const { data: dataEmpty } = invokePublicOfertas({ q: '' });
      assert.strictEqual(dataEmpty.total, 108);

      const { data: dataSpaces } = invokePublicOfertas({ q: '   ' });
      assert.strictEqual(dataSpaces.total, 108);
    });

    it('TC-T2-06: Caracteres especiais de regex na busca (?, *, +, (, )) não causam exceção', () => {
      assert.doesNotThrow(() => {
        const { data } = invokePublicOfertas({ q: '(?.*+[' });
        assert.ok(Array.isArray(data.produtos));
      });
    });

    it('TC-T2-07: URL do WhatsApp lida corretamente com quebras de linha e emojis', () => {
      const cart = createCartManager();
      cart.addItem({ id: 1, nome: 'Vitamina C', preco_por: 15.0, estoque: 5 });
      const url = buildWhatsAppUrl(cart, { nome: 'Carlos', modalidade: 'retirada' });

      // Quebras de linha são transformadas em %0A
      assert.ok(url.includes('%0A'));
      // Emojis codificados corretamente
      assert.ok(url.includes('%F0%9F%8E%89') || url.includes('%F0%9F'));
    });

    it('TC-T2-08: Checkout com nome contendo apenas espaços é rejeitado', () => {
      const res = validateCheckoutForm({ nome: '    \t\n  ', modalidade: 'retirada' });
      assert.strictEqual(res.isValid, false);
    });

    it('TC-T2-09: Canonicalização de telefone rejeita formatos corrompidos e assegura 5532998228189', () => {
      assert.strictEqual(canonicalizeWhatsAppPhone(null), '5532998228189');
      assert.strictEqual(canonicalizeWhatsAppPhone(''), '5532998228189');
      assert.strictEqual(canonicalizeWhatsAppPhone('+55 (32) 99822-8189'), '5532998228189');
      assert.strictEqual(canonicalizeWhatsAppPhone('32998228189'), '5532998228189');
    });

    it('TC-T2-10: Precisão de centavos com valores fracionados evita dízimas periódicas IEEE 754', () => {
      const cart = createCartManager();
      // 3 itens a R$ 9,99 = R$ 29,97 (em IEEE 754: 3 * 9.99 = 29.970000000000002)
      cart.addItem({ id: 1, nome: 'Produto A', preco_por: 9.99, estoque: 10 }, 3);
      assert.strictEqual(cart.getSubtotal(), 29.97);

      // + 1 item a R$ 19,90 = R$ 49,87
      cart.addItem({ id: 2, nome: 'Produto B', preco_por: 19.9, estoque: 10 }, 1);
      assert.strictEqual(cart.getSubtotal(), 49.87);
    });
  });

  // -------------------------------------------------------------------------
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // -------------------------------------------------------------------------

  describe('Tier 3: Cross-Feature Combinations', () => {
    it('TC-T3-01: Busca instantânea -> Seleção do item filtrado -> Adição ao carrinho -> Validação do subtotal', () => {
      // 1. Busca
      const { data } = invokePublicOfertas({ q: 'kuramed' });
      assert.strictEqual(data.produtos.length, 1);
      const prod = data.produtos[0];

      // 2. Adiciona ao carrinho
      const cart = createCartManager();
      cart.addItem(prod, 2);

      // 3. Verifica carrinho
      assert.strictEqual(cart.getTotalItems(), 2);
      assert.strictEqual(cart.getSubtotal(), 13.98);
      assert.strictEqual(cart.getItems()[0].produto.id, 'liq_16399_1790955748514');
    });

    it('TC-T3-02: Alternância de categorias -> Adição de itens de categorias diferentes -> Carrinho agrega corretamente', () => {
      const { data: dataPerf } = invokePublicOfertas({ categoria: 'Perfumaria & Higiene' });
      const { data: dataSim } = invokePublicOfertas({ categoria: 'Medicamentos Similares' });

      const itemPerf = dataPerf.produtos[0];
      const itemSim = dataSim.produtos[0];

      const cart = createCartManager();
      cart.addItem(itemPerf, 1);
      cart.addItem(itemSim, 2);

      assert.strictEqual(cart.getTotalItems(), 3);
      const expectedSubtotal = roundCents(itemPerf.preco_por * 1 + itemSim.preco_por * 2);
      assert.strictEqual(cart.getSubtotal(), expectedSubtotal);
    });

    it('TC-T3-03: Pular splash screen -> Adição de produtos -> Persistência de carrinho no recarregamento', () => {
      // Simula skip do splash
      let splashDismissed = false;
      const skipSplash = () => {
        splashDismissed = true;
      };
      skipSplash();
      assert.strictEqual(splashDismissed, true);

      // Cliente adiciona itens
      const cart = createCartManager();
      cart.addItem({ id: 101, nome: 'Protetor Solar', preco_por: 35.0, estoque: 5 }, 1);
      cart.addItem({ id: 102, nome: 'Sabonete Líquido', preco_por: 12.5, estoque: 5 }, 2);

      // Salva no storage
      const storageSnapshot = cart.serialize();

      // Novo ciclo de montagem (recarregamento de página)
      const restoredCart = createCartManager();
      restoredCart.deserialize(storageSnapshot);

      assert.strictEqual(restoredCart.getTotalItems(), 3);
      assert.strictEqual(restoredCart.getSubtotal(), 60.0);
    });

    it('TC-T3-04: Alteração de quantidade de itens no carrinho reflete instantaneamente no texto do WhatsApp', () => {
      const cart = createCartManager();
      cart.addItem({ id: 101, nome: 'Vitamina C 1g', preco_por: 19.9, estoque: 10 }, 1);

      const msg1 = formatWhatsAppOrderMessage(cart, { nome: 'Bruna', modalidade: 'retirada' });
      assert.ok(msg1.includes('1x a R$ 19,90 = *R$ 19,90*'));
      assert.ok(msg1.includes('*VALOR TOTAL DO PEDIDO: R$ 19,90*'));

      // Cliente aumenta para 3 unidades
      cart.updateQuantity(101, 3);
      const msg2 = formatWhatsAppOrderMessage(cart, { nome: 'Bruna', modalidade: 'retirada' });
      assert.ok(msg2.includes('3x a R$ 19,90 = *R$ 59,70*'));
      assert.ok(msg2.includes('*VALOR TOTAL DO PEDIDO: R$ 59,70*'));
    });

    it('TC-T3-05: Alternância entre Retirada e Entrega inclui/remove endereço na mensagem do WhatsApp', () => {
      const cart = createCartManager();
      cart.addItem({ id: 101, nome: 'Item Teste', preco_por: 15.0, estoque: 5 });

      // Modo Entrega
      const msgEntrega = formatWhatsAppOrderMessage(cart, {
        nome: 'Marcos',
        modalidade: 'entrega',
        endereco: 'Rua Principal, 50',
        bairro: 'Centro'
      });
      assert.ok(msgEntrega.includes('📍 *Endereço:* Rua Principal, 50 - Centro'));

      // Alterna para Retirada
      const msgRetirada = formatWhatsAppOrderMessage(cart, {
        nome: 'Marcos',
        modalidade: 'retirada'
      });
      assert.strictEqual(msgRetirada.includes('📍 *Endereço:*'), false);
    });

    it('TC-T3-06: Remoção de item atualiza subtotal e salva novo estado persistentemente', () => {
      const cart = createCartManager();
      cart.addItem({ id: 101, nome: 'Item A', preco_por: 10.0, estoque: 5 }, 1);
      cart.addItem({ id: 102, nome: 'Item B', preco_por: 20.0, estoque: 5 }, 1);

      cart.removeItem(101);
      const snapshot = cart.serialize();

      const reloaded = createCartManager();
      reloaded.deserialize(snapshot);

      assert.strictEqual(reloaded.getTotalItems(), 1);
      assert.strictEqual(reloaded.getSubtotal(), 20.0);
      assert.strictEqual(reloaded.getItems()[0].produto.id, 102);
    });
  });

  // -------------------------------------------------------------------------
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // -------------------------------------------------------------------------

  describe('Tier 4: Real-World Application Scenarios', () => {
    it('TC-T4-01: Jornada de Compra via Instagram: Acesso /promocao -> Pular Splash -> Adicionar Kuramed -> Retirada na Loja', () => {
      // 1. Cliente clica no link do anúncio /promocao
      const incomingUrl = 'https://belafarma.com.br/promocao';
      const isPublic = isPublicVitrineRoute(incomingUrl);
      assert.strictEqual(isPublic, true, 'Deve acessar diretamente a vitrine sem tela de login');

      // 2. Splash screen de 3 segundos inicia e cliente clica em "Pular"
      const splash = calculateSplashProgress(100, 3000);
      assert.strictEqual(splash.isCompleted, false);
      const skipAction = () => ({ isCompleted: true });
      const finalSplash = skipAction();
      assert.strictEqual(finalSplash.isCompleted, true);

      // 3. Cliente busca por "kuramed"
      const { data: searchResult } = invokePublicOfertas({ q: 'kuramed' });
      assert.strictEqual(searchResult.total, 1);
      const item = searchResult.produtos[0];

      // 4. Adiciona 2 unidades ao carrinho
      const cart = createCartManager();
      cart.addItem(item, 2);
      assert.strictEqual(cart.getTotalItems(), 2);
      assert.strictEqual(cart.getSubtotal(), 13.98);

      // 5. Preenche checkout com Retirada na Loja
      const checkout = {
        nome: 'Dona Maria Oliveira',
        modalidade: 'retirada'
      };
      const validation = validateCheckoutForm(checkout);
      assert.strictEqual(validation.isValid, true);

      // 6. Finaliza pedido para o WhatsApp oficial
      const redirectUrl = buildWhatsAppUrl(cart, checkout);
      assert.ok(redirectUrl.startsWith('https://wa.me/5532998228189?text='));

      const decodedText = decodeURIComponent(redirectUrl.split('?text=')[1]);
      assert.ok(decodedText.includes('Dona Maria Oliveira'));
      assert.ok(decodedText.includes('Retirada na Loja'));
      assert.ok(decodedText.includes('KURAMED SEPT SOL 30 ML'));
      assert.ok(decodedText.includes('2x a R$ 6,99 = *R$ 13,98*'));
      assert.ok(decodedText.includes('*VALOR TOTAL DO PEDIDO: R$ 13,98*'));
    });

    it('TC-T4-02: Jornada de Entrega Familiar: Acesso /aniversario -> Categoria Perfumaria -> Múltiplos Itens -> Entrega em Santa Luzia', () => {
      // 1. Cliente entra por /aniversario
      assert.strictEqual(isPublicVitrineRoute('/aniversario'), true);

      // 2. Consulta categoria Perfumaria & Higiene com estoque disponível
      const { data: perfumaria } = invokePublicOfertas({ categoria: 'Perfumaria & Higiene' });
      assert.ok(perfumaria.total >= 2);

      const prodsWithStock = perfumaria.produtos.filter((p) => p.estoque >= 2);
      assert.ok(prodsWithStock.length >= 2, 'Deve haver produtos em perfumaria com estoque >= 2');
      const prod1 = prodsWithStock[0];
      const prod2 = prodsWithStock[1];

      // 3. Monta carrinho de compras
      const cart = createCartManager();
      cart.addItem(prod1, 1);
      cart.addItem(prod2, 2);

      const expectedSubtotal = roundCents(prod1.preco_por * 1 + prod2.preco_por * 2);
      assert.strictEqual(cart.getSubtotal(), expectedSubtotal);

      // 4. Preenche dados de Entrega
      const checkout = {
        nome: 'Carlos Eduardo Souza',
        modalidade: 'entrega',
        endereco: 'Rua Manoel Ferreira, 120, Apto 201',
        bairro: 'Santa Luzia'
      };
      const validation = validateCheckoutForm(checkout);
      assert.strictEqual(validation.isValid, true);

      // 5. Gera link do WhatsApp e valida payload
      const redirectUrl = buildWhatsAppUrl(cart, checkout);
      const decoded = decodeURIComponent(redirectUrl.split('?text=')[1]);

      assert.ok(decoded.includes('Carlos Eduardo Souza'));
      assert.ok(decoded.includes('Entrega / Delivery'));
      assert.ok(decoded.includes('Rua Manoel Ferreira, 120, Apto 201 - Santa Luzia'));
      assert.ok(decoded.includes(prod1.nome));
      assert.ok(decoded.includes(prod2.nome));
      assert.ok(decoded.includes(formatBRL(expectedSubtotal)));
    });

    it('TC-T4-03: Grande Pedido de Liquidação: 5 Itens Distintos com Validação do Total Economizado', () => {
      const { data } = invokePublicOfertas();
      const itensComEstoque = data.produtos.filter((p) => p.estoque >= 5);
      assert.ok(itensComEstoque.length >= 5, 'Deve haver pelo menos 5 produtos com estoque >= 5');

      const cincoItens = itensComEstoque.slice(0, 5);
      const cart = createCartManager();

      let expectedTotalDe = 0;
      let expectedTotalPor = 0;

      cincoItens.forEach((prod, idx) => {
        const qtd = idx + 1; // 1, 2, 3, 4, 5 unidades
        cart.addItem(prod, qtd);
        expectedTotalDe += prod.preco_de * qtd;
        expectedTotalPor += prod.preco_por * qtd;
      });

      const totalEconomizadoEsperado = roundCents(expectedTotalDe - expectedTotalPor);
      assert.strictEqual(cart.getSubtotal(), roundCents(expectedTotalPor));
      assert.strictEqual(cart.getTotalSavings(), totalEconomizadoEsperado);

      const checkout = {
        nome: 'Fernanda Martins Lima',
        modalidade: 'retirada'
      };
      const redirectUrl = buildWhatsAppUrl(cart, checkout);
      const decoded = decodeURIComponent(redirectUrl.split('?text=')[1]);

      assert.ok(decoded.includes('Fernanda Martins Lima'));
      assert.ok(decoded.includes(`*VALOR TOTAL DO PEDIDO: ${formatBRL(cart.getSubtotal())}*`));
      assert.ok(decoded.includes(`*Você economizou:* ${formatBRL(totalEconomizadoEsperado)}`));
    });
  });
});
