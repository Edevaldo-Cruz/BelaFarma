import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  canonicalizeWhatsAppPhone,
  formatWhatsAppOrderMessage,
  generateWhatsAppOrderUrl,
  buildWhatsAppUrl,
  validateCheckoutForm,
  roundCents,
  extractCartTotals,
  OFFICIAL_WHATSAPP_PHONE,
} from '../components/vitrine/whatsappUtils.ts';
import {
  formatBRL,
  isPublicVitrineRoute,
} from '../components/vitrine/vitrineTypes.ts';

describe('Adversarial & Stress Testing: Challenger 2 Harness', () => {

  // =========================================================================
  // SUITE 1: WhatsApp Payload Formatting & URL Construction Stress Testing
  // =========================================================================
  describe('Suite 1: WhatsApp Payload Formatting & RFC 3986 URL Construction', () => {

    // -----------------------------------------------------------------------
    // 1.1 Huge Carts (Dozens / Hundreds of Items)
    // -----------------------------------------------------------------------
    describe('1.1 Huge Carts Stress Test', () => {
      it('ST-01: Carts with 50 distinct items calculate subtotal, savings and item count with exact precision', () => {
        const largeCart = [];
        let expectedSubtotal = 0;
        let expectedSavings = 0;
        let expectedItemCount = 0;

        for (let i = 1; i <= 50; i++) {
          const preco_de = roundCents(10 + (i * 0.75));
          const preco_por = roundCents(5 + (i * 0.45));
          const quantidade = (i % 5) + 1; // 1 to 5 units

          largeCart.push({
            produto: {
              id: `prod_${i}`,
              nome: `Medicamento Especial Lote ${i}`,
              apresentacao: `${i * 10}mg Cx ${quantidade * 10} Comprimidos`,
              preco_de,
              preco_por,
              estoque: 100,
            },
            quantidade,
          });

          expectedSubtotal = roundCents(expectedSubtotal + preco_por * quantidade);
          expectedSavings = roundCents(expectedSavings + (preco_de - preco_por) * quantidade);
          expectedItemCount += quantidade;
        }

        const totals = extractCartTotals(largeCart);
        assert.strictEqual(totals.items.length, 50, 'Deve conter exatamente 50 itens distintos');
        assert.strictEqual(totals.totalItems, expectedItemCount, 'Contagem total de unidades deve ser exata');
        assert.strictEqual(totals.subtotal, expectedSubtotal, 'Subtotal acumulado de 50 itens deve ser exato');
        assert.strictEqual(totals.savings, expectedSavings, 'Economia acumulada de 50 itens deve ser exata');

        const message = formatWhatsAppOrderMessage(largeCart, {
          nome: 'Cliente Pedido Massivo 50 Itens',
          modalidade: 'retirada',
        });

        assert.ok(message.includes(`ITENS DO PEDIDO (${expectedItemCount} itens):`));
        assert.ok(message.includes(`1. *Medicamento Especial Lote 1*`));
        assert.ok(message.includes(`50. *Medicamento Especial Lote 50*`));
        assert.ok(message.includes(`VALOR TOTAL DO PEDIDO: ${formatBRL(expectedSubtotal)}`));
        assert.ok(message.includes(`Você economizou:* ${formatBRL(expectedSavings)}`));

        const url = generateWhatsAppOrderUrl(largeCart, {
          nome: 'Cliente Pedido Massivo 50 Itens',
          modalidade: 'retirada',
        });

        // RFC 3986 URL Verification
        const parsedUrl = new URL(url);
        assert.strictEqual(parsedUrl.protocol, 'https:');
        assert.strictEqual(parsedUrl.hostname, 'wa.me');
        assert.strictEqual(parsedUrl.pathname, '/5532998228189');
        assert.ok(parsedUrl.searchParams.has('text'));

        const decodedText = parsedUrl.searchParams.get('text');
        assert.strictEqual(decodedText, message, 'O payload decodificado deve ser 100% idêntico à mensagem gerada');
      });

      it('ST-02: Carts with 100 distinct items produce a valid wa.me URL without URIError or data corruption', () => {
        const massiveCart = [];
        for (let i = 1; i <= 100; i++) {
          massiveCart.push({
            produto: {
              id: `mass_${i}`,
              nome: `Item de Teste de Estresse ${i}`,
              apresentacao: `Apresentação Técnica ${i}`,
              preco_de: 19.99,
              preco_por: 9.99,
              estoque: 50,
            },
            quantidade: 1,
          });
        }

        const totals = extractCartTotals(massiveCart);
        assert.strictEqual(totals.totalItems, 100);
        assert.strictEqual(totals.subtotal, 999.00);
        assert.strictEqual(totals.savings, 1000.00);

        let url = '';
        assert.doesNotThrow(() => {
          url = generateWhatsAppOrderUrl(massiveCart, {
            nome: 'Super Comprador BelaFarma',
            modalidade: 'retirada',
          });
        });

        const parsedUrl = new URL(url);
        assert.strictEqual(parsedUrl.hostname, 'wa.me');
        assert.strictEqual(parsedUrl.pathname, '/5532998228189');
        assert.ok(url.length > 5000, 'Payload de 100 itens deve ter tamanho expressivo');
        assert.ok(!url.includes('undefined') && !url.includes('NaN'));
      });
    });

    // -----------------------------------------------------------------------
    // 1.2 Malicious / Unusual Customer Names
    // -----------------------------------------------------------------------
    describe('1.2 Malicious & Unusual Customer Names Stress Test', () => {
      const sampleCart = [
        {
          produto: {
            id: 'p_test',
            nome: 'Dipirona Monoidratada 500mg',
            apresentacao: '10 CPR',
            preco_de: 8.50,
            preco_por: 4.25,
            estoque: 20,
          },
          quantidade: 2,
        },
      ];

      it('ST-03: Names with single/double quotes, backticks and nested punctuation do not break formatting', () => {
        const dangerousNames = [
          `D'Angelo O'Connor`,
          `"Maria" das Dores`,
          `'Pedro' Alvarez`,
          `\`Robert \${7*7}\``,
          `«Dra. Heloísa» & “Sr. Marcos”`,
          `Nome com Barra / Contrabarra \\ e Pipe |`,
        ];

        for (const name of dangerousNames) {
          const val = validateCheckoutForm({ nome: name, modalidade: 'retirada' });
          assert.strictEqual(val.isValid, true, `Nome '${name}' deve ser considerado válido`);

          const msg = formatWhatsAppOrderMessage(sampleCart, { nome: name, modalidade: 'retirada' });
          assert.ok(msg.includes(`*Cliente:* ${name.trim()}`));

          const url = generateWhatsAppOrderUrl(sampleCart, { nome: name, modalidade: 'retirada' });
          const parsed = new URL(url);
          const recovered = parsed.searchParams.get('text');
          assert.strictEqual(recovered, msg, `Payload com nome '${name}' deve ser recuperado intacto`);
        }
      });

      it('ST-04: Names with festive emojis, unicode symbols and multi-byte characters are preserved', () => {
        const emojiNames = [
          '🎉🥳 Aniversariante Feliz 🎂🎈',
          '💊 Dr. Sebastião da Silva ⚕️🩺',
          'João 👨‍👩‍👧‍👦 Família Silva',
          'Maria José — Bela Farma Sul ❤️',
          '🇯🇵 Kenji Tanaka (田中)',
          '🇷🇺 Vladimir (Владимир)',
          '🇸🇦 Ahmed (أحمد)',
        ];

        for (const name of emojiNames) {
          const msg = formatWhatsAppOrderMessage(sampleCart, { nome: name, modalidade: 'retirada' });
          assert.ok(msg.includes(`*Cliente:* ${name}`));

          const url = generateWhatsAppOrderUrl(sampleCart, { nome: name, modalidade: 'retirada' });
          const parsed = new URL(url);
          assert.strictEqual(parsed.searchParams.get('text'), msg);
        }
      });

      it('ST-05: Names containing newlines, tabs and trailing whitespaces are safely normalized', () => {
        const whitespaceNames = [
          '   Maria dos Santos   ',
          '\tCarlos Alberto\t',
          'Luciana\nAlves',
          'Roberto\r\nFerreira',
        ];

        for (const rawName of whitespaceNames) {
          const msg = formatWhatsAppOrderMessage(sampleCart, { nome: rawName, modalidade: 'retirada' });
          // Note: .trim() removes leading/trailing whitespace
          assert.ok(msg.includes(`*Cliente:* ${rawName.trim()}`));

          const url = generateWhatsAppOrderUrl(sampleCart, { nome: rawName, modalidade: 'retirada' });
          assert.doesNotThrow(() => new URL(url));
        }
      });

      it('ST-06: Names with XSS vectors (<script>, <img>, <iframe>) and SQL injection strings do not crash or corrupt URL', () => {
        const attackVectors = [
          `<script>alert('xss')</script>`,
          `<img src="x" onerror="alert(document.cookie)" />`,
          `<svg/onload=alert(1)>`,
          `' OR '1'='1' -- DROP TABLE users;`,
          `admin' --`,
          `<?php echo 'pwned'; ?>`,
          `${`process.exit()`}`,
          `{{ 7 * 7 }}`,
        ];

        for (const attack of attackVectors) {
          const msg = formatWhatsAppOrderMessage(sampleCart, { nome: attack, modalidade: 'retirada' });
          assert.ok(msg.includes(`*Cliente:* ${attack}`));

          const url = generateWhatsAppOrderUrl(sampleCart, { nome: attack, modalidade: 'retirada' });
          const parsed = new URL(url);
          assert.strictEqual(parsed.searchParams.get('text'), msg);
        }
      });

      it('ST-07: Names of extreme length (1,000 to 3,000 characters) generate valid RFC 3986 URLs without crashing', () => {
        const longName = 'A'.repeat(2000);
        const msg = formatWhatsAppOrderMessage(sampleCart, { nome: longName, modalidade: 'retirada' });
        assert.ok(msg.includes(`*Cliente:* ${longName}`));

        const url = generateWhatsAppOrderUrl(sampleCart, { nome: longName, modalidade: 'retirada' });
        const parsed = new URL(url);
        assert.strictEqual(parsed.searchParams.get('text'), msg);
      });

      it('ST-08: Empty, blank or whitespace-only names are strictly rejected by validateCheckoutForm', () => {
        const emptyVariations = ['', '   ', '\t', '\n', '\r\n', null, undefined];
        for (const emptyVal of emptyVariations) {
          const res = validateCheckoutForm({ nome: emptyVal, modalidade: 'retirada' });
          assert.strictEqual(res.isValid, false, `Valor '${emptyVal}' deve ser inválido`);
          assert.ok(res.errors.some((e) => e.includes('Nome Completo é obrigatório')));
        }
      });
    });

    // -----------------------------------------------------------------------
    // 1.3 Unusual Delivery Addresses
    // -----------------------------------------------------------------------
    describe('1.3 Unusual Delivery Addresses Stress Test', () => {
      const sampleCart = [
        {
          produto: {
            id: 'p_shampoo',
            nome: 'Shampoo Anticaspa Clear Men',
            apresentacao: '400ml',
            preco_de: 28.90,
            preco_por: 19.90,
            estoque: 15,
          },
          quantidade: 1,
        },
      ];

      it('ST-09: Delivery with complex address, special characters and accents formats cleanly', () => {
        const checkout = {
          nome: 'Beatriz Vasconcelos',
          modalidade: 'entrega',
          endereco: 'Av. Barão do Rio Branco, nº 3.450 / Bloco B - Apto 1.204 (Próximo à Curva do Lacet)',
          bairro: 'Cascatinha / Alto dos Passos',
        };

        const msg = formatWhatsAppOrderMessage(sampleCart, checkout);
        assert.ok(msg.includes('🚚 Entrega / Delivery'));
        assert.ok(msg.includes('📍 *Endereço:* Av. Barão do Rio Branco, nº 3.450 / Bloco B - Apto 1.204 (Próximo à Curva do Lacet) - Cascatinha / Alto dos Passos'));

        const url = generateWhatsAppOrderUrl(sampleCart, checkout);
        const parsed = new URL(url);
        assert.strictEqual(parsed.searchParams.get('text'), msg);
      });

      it('ST-10: Multi-line delivery addresses are preserved and encoded safely', () => {
        const checkout = {
          nome: 'Marcos Vinicius',
          modalidade: 'entrega',
          endereco: 'Rua das Margaridas, 45\nFundos - Casa 2\nInterfone tocar 2x',
          bairro: 'Santa Luzia',
        };

        const msg = formatWhatsAppOrderMessage(sampleCart, checkout);
        assert.ok(msg.includes('Rua das Margaridas, 45\nFundos - Casa 2\nInterfone tocar 2x - Santa Luzia'));

        const url = generateWhatsAppOrderUrl(sampleCart, checkout);
        const parsed = new URL(url);
        assert.strictEqual(parsed.searchParams.get('text'), msg);
      });

      it('ST-11: Pickup modality strictly ignores address even if address fields are populated', () => {
        const checkout = {
          nome: 'Carolina Mendes',
          modalidade: 'retirada',
          endereco: 'Rua São Mateus, 999',
          bairro: 'São Mateus',
        };

        const msg = formatWhatsAppOrderMessage(sampleCart, checkout);
        assert.ok(msg.includes('🏪 Retirada na Loja'));
        assert.strictEqual(msg.includes('📍 *Endereço:*'), false, 'Não deve exibir endereço para retirada');
        assert.strictEqual(msg.includes('Rua São Mateus, 999'), false);
      });

      it('ST-12: Delivery modality handles missing bairro or missing endereco gracefully without trailing delimiters', () => {
        // Apenas endereço, sem bairro
        const msgOnlyEndereco = formatWhatsAppOrderMessage(sampleCart, {
          nome: 'Lucas',
          modalidade: 'entrega',
          endereco: 'Rua Halfeld, 500',
        });
        assert.ok(msgOnlyEndereco.includes('📍 *Endereço:* Rua Halfeld, 500\n'));
        assert.strictEqual(msgOnlyEndereco.includes('Rua Halfeld, 500 - '), false);

        // Apenas bairro, sem endereço (caso campo endereco seja vazio ou omitido)
        const msgOnlyBairro = formatWhatsAppOrderMessage(sampleCart, {
          nome: 'Lucas',
          modalidade: 'entrega',
          endereco: '',
          bairro: 'Centro',
        });
        // Se endereco for '', o if (isDelivery && checkoutData.endereco) não renderiza a linha
        assert.strictEqual(msgOnlyBairro.includes('📍 *Endereço:*'), false);
      });

      it('ST-13: Invalid modality values are strictly rejected by validateCheckoutForm', () => {
        const invalidModalities = ['correios', 'motoboy', 'sedex', 'retirar', 'entregar', '', null, undefined];
        for (const badMode of invalidModalities) {
          const res = validateCheckoutForm({
            nome: 'Test Client',
            modalidade: badMode,
          });
          assert.strictEqual(res.isValid, false, `Modalidade '${badMode}' deve ser rejeitada`);
          assert.ok(res.errors.some((e) => e.includes('Modalidade de atendimento deve ser')));
        }
      });
    });

    // -----------------------------------------------------------------------
    // 1.4 Phone Canonicalization (Target strictly 5532998228189)
    // -----------------------------------------------------------------------
    describe('1.4 Phone Canonicalization & Target Enforcement Stress Test', () => {
      it('ST-14: OFFICIAL_WHATSAPP_PHONE constant is exactly 5532998228189', () => {
        assert.strictEqual(OFFICIAL_WHATSAPP_PHONE, '5532998228189');
      });

      it('ST-15: All realistic input variations of BelaFarma official number canonicalize to 5532998228189', () => {
        const variations = [
          '5532998228189',
          '32998228189',
          '32 99822-8189',
          '(32) 99822-8189',
          '(32) 9 9822-8189',
          '+55 32 99822-8189',
          '+55 (32) 99822-8189',
          '+5532998228189',
          '032998228189',     // 12 digits -> fallback strictly 5532998228189
          '32-99822-8189',
          'tel:+55 (32) 99822-8189',
          'whatsapp://send?phone=5532998228189',
        ];

        for (const input of variations) {
          const canonical = canonicalizeWhatsAppPhone(input);
          assert.strictEqual(canonical, '5532998228189', `Falha ao canonicalizar '${input}'`);
        }
      });

      it('ST-16: Corrupt, empty, null, or out-of-range phone inputs fallback strictly to 5532998228189', () => {
        const fallbacks = [
          '',
          '   ',
          null,
          undefined,
          'invalid',
          'abc',
          '123',
          '000000000',      // 9 digits -> fallback
          '3298228189',     // 10 digits -> fallback
          '553298228189',   // 12 digits -> fallback
          '5532998228189999', // 16 digits -> fallback
          '0',
        ];

        for (const fb of fallbacks) {
          const canonical = canonicalizeWhatsAppPhone(fb);
          assert.strictEqual(canonical, '5532998228189', `Fallback incorreto para input '${fb}'`);
        }
      });

      it('ST-17: generateWhatsAppOrderUrl and buildWhatsAppUrl always route to 5532998228189 by default', () => {
        const dummyCart = [
          {
            produto: {
              id: 'p1',
              nome: 'Teste',
              preco_de: 10,
              preco_por: 5,
              estoque: 10,
            },
            quantidade: 1,
          },
        ];
        const checkout = { nome: 'Maria', modalidade: 'retirada' };

        const url1 = generateWhatsAppOrderUrl(dummyCart, checkout);
        const url2 = buildWhatsAppUrl(dummyCart, checkout);

        assert.ok(url1.startsWith('https://wa.me/5532998228189?text='));
        assert.ok(url2.startsWith('https://wa.me/5532998228189?text='));
        assert.strictEqual(url1, url2);
      });
    });

    // -----------------------------------------------------------------------
    // 1.5 URL Encoding Validation (RFC 3986 Compliance)
    // -----------------------------------------------------------------------
    describe('1.5 RFC 3986 URL Encoding & Structural Validation Stress Test', () => {
      it('ST-18: Generated WhatsApp URL conforms strictly to RFC 3986 and WHATWG URL standard', () => {
        const cart = [
          {
            produto: {
              id: 'p_shampoo',
              nome: 'Shampoo & Condicionador Seda 2em1 (325ml) - Edição Especial',
              apresentacao: 'Frasco c/ 325ml',
              preco_de: 18.90,
              preco_por: 11.90,
              estoque: 5,
            },
            quantidade: 3,
          },
        ];
        const checkout = {
          nome: 'João Pedro de Oliveira & Filhos',
          modalidade: 'entrega',
          endereco: 'Rua São Mateus, 120/Apto 301 #Bloco 2 ? Referência: Padaria',
          bairro: 'São Mateus',
        };

        const rawUrl = generateWhatsAppOrderUrl(cart, checkout);

        // 1. WHATWG URL parseability
        const parsed = new URL(rawUrl);
        assert.strictEqual(parsed.protocol, 'https:');
        assert.strictEqual(parsed.host, 'wa.me');
        assert.strictEqual(parsed.pathname, '/5532998228189');

        // 2. Query param validation: no raw unescaped '&', '#', '?' in the value
        assert.ok(parsed.search.startsWith('?text='));
        const textParam = parsed.searchParams.get('text');
        assert.ok(textParam, 'Parâmetro text deve existir');

        // 3. Characters &, #, ? in customer name and address must NOT split or create extra URL params or hash
        assert.strictEqual(parsed.hash, '', 'URL não deve conter fragment/hash acidental');
        assert.strictEqual(Array.from(parsed.searchParams.keys()).length, 1, 'Deve haver apenas 1 parâmetro de query (text)');

        // 4. Round-trip integrity
        assert.ok(textParam.includes('João Pedro de Oliveira & Filhos'));
        assert.ok(textParam.includes('Rua São Mateus, 120/Apto 301 #Bloco 2 ? Referência: Padaria'));
        assert.ok(textParam.includes('Shampoo & Condicionador Seda 2em1 (325ml) - Edição Especial'));
      });

      it('ST-19: Encoded URL contains no raw spaces or illegal RFC 3986 characters in raw string', () => {
        const cart = [
          {
            produto: {
              id: 'p_item',
              nome: 'Item Teste',
              preco_de: 10,
              preco_por: 8,
              estoque: 10,
            },
            quantidade: 1,
          },
        ];
        const url = generateWhatsAppOrderUrl(cart, {
          nome: 'Fulano da Silva',
          modalidade: 'retirada',
        });

        // Nenhuma quebra de linha crua, nenhum espaço cru
        assert.strictEqual(url.includes(' '), false, 'URL bruta não deve conter caracteres de espaço em branco');
        assert.strictEqual(url.includes('\n'), false, 'URL bruta não deve conter newlines');
        assert.strictEqual(url.includes('\r'), false, 'URL bruta não deve conter carriage returns');
      });
    });
  });

  // =========================================================================
  // SUITE 2: Public Route Detection & Navigation Stress Testing
  // =========================================================================
  describe('Suite 2: Public Route Detection & Navigation Resilience', () => {

    // -----------------------------------------------------------------------
    // 2.1 Pathname Variations
    // -----------------------------------------------------------------------
    describe('2.1 Pathname Variations', () => {
      it('ST-20: Canonical pathnames /promocao and /aniversario evaluate to true', () => {
        assert.strictEqual(isPublicVitrineRoute('/promocao'), true);
        assert.strictEqual(isPublicVitrineRoute('/aniversario'), true);
        assert.strictEqual(isPublicVitrineRoute('/vitrine'), true);
        assert.strictEqual(isPublicVitrineRoute('/ofertas'), true);
      });

      it('ST-21: Required pathname variations (/promocao, /aniversario, /promocao/, /aniversario/) evaluate to true', () => {
        assert.strictEqual(isPublicVitrineRoute('/promocao'), true);
        assert.strictEqual(isPublicVitrineRoute('/aniversario'), true);
        assert.strictEqual(isPublicVitrineRoute('/promocao/'), true);
        assert.strictEqual(isPublicVitrineRoute('/aniversario/'), true);
      });

      it('ST-21b: Boundary observation: /vitrine and /ofertas evaluate to true without trailing slash', () => {
        assert.strictEqual(isPublicVitrineRoute('/vitrine'), true);
        assert.strictEqual(isPublicVitrineRoute('/ofertas'), true);
        // Note: isPublicVitrineRoute uses exact match for /vitrine and /ofertas, so trailing slash /vitrine/ is false
        assert.strictEqual(isPublicVitrineRoute('/vitrine/'), false, 'Empirical finding: /vitrine/ returns false without trailing slash normalization');
        assert.strictEqual(isPublicVitrineRoute('/ofertas/'), false, 'Empirical finding: /ofertas/ returns false without trailing slash normalization');
      });

      it('ST-22: Subpath variations (/promocao/item-123, /aniversario/categoria) evaluate to true', () => {
        assert.strictEqual(isPublicVitrineRoute('/promocao/item-123'), true);
        assert.strictEqual(isPublicVitrineRoute('/aniversario/perfumaria'), true);
        assert.strictEqual(isPublicVitrineRoute('/promocao/ofertas/destaques'), true);
      });

      it('ST-23: Case-insensitive pathnames (/Promocao, /ANIVERSARIO, /ViTrInE) evaluate to true', () => {
        assert.strictEqual(isPublicVitrineRoute('/Promocao'), true);
        assert.strictEqual(isPublicVitrineRoute('/ANIVERSARIO'), true);
        assert.strictEqual(isPublicVitrineRoute('/PROMOCAO/'), true);
        assert.strictEqual(isPublicVitrineRoute('/Aniversario/'), true);
        assert.strictEqual(isPublicVitrineRoute('/ViTrInE'), true);
        assert.strictEqual(isPublicVitrineRoute('/OFERTAS'), true);
      });

      it('ST-24: Full URL strings with protocols evaluate to true', () => {
        assert.strictEqual(isPublicVitrineRoute('https://belafarma.com.br/promocao'), true);
        assert.strictEqual(isPublicVitrineRoute('http://localhost:5173/aniversario'), true);
        assert.strictEqual(isPublicVitrineRoute('https://app.belafarma.com/promocao/'), true);
        assert.strictEqual(isPublicVitrineRoute('http://192.168.1.100:3000/aniversario/'), true);
      });

      it('ST-25: Object format { pathname: ... } evaluates accurately', () => {
        assert.strictEqual(isPublicVitrineRoute({ pathname: '/promocao' }), true);
        assert.strictEqual(isPublicVitrineRoute({ pathname: '/aniversario/' }), true);
        assert.strictEqual(isPublicVitrineRoute({ pathname: '/dashboard' }), false);
      });

      it('ST-26: Administrative and unrelated pathnames strictly evaluate to false', () => {
        const nonPublicPaths = [
          '/',
          '/dashboard',
          '/orders',
          '/pedidos',
          '/financial',
          '/safe',
          '/cash-closing',
          '/users',
          '/login',
          '/auth',
          '/settings',
          '/logs',
          '/agenda',
          '/central-compras',
          '/stock',
        ];

        for (const p of nonPublicPaths) {
          assert.strictEqual(isPublicVitrineRoute(p), false, `Path '${p}' não deve ser rota pública`);
          assert.strictEqual(isPublicVitrineRoute(`https://belafarma.com.br${p}`), false);
        }
      });
    });

    // -----------------------------------------------------------------------
    // 2.2 Query Param Variations
    // -----------------------------------------------------------------------
    describe('2.2 Query Param Variations', () => {
      it('ST-27: Standard query params (?vitrine=aniversario, ?vitrine=promocao, ?vitrine=true, ?vitrine=1) evaluate to true', () => {
        assert.strictEqual(isPublicVitrineRoute('?vitrine=aniversario'), true);
        assert.strictEqual(isPublicVitrineRoute('?vitrine=promocao'), true);
        assert.strictEqual(isPublicVitrineRoute('?vitrine=true'), true);
        assert.strictEqual(isPublicVitrineRoute('?vitrine=1'), true);
        assert.strictEqual(isPublicVitrineRoute('/?vitrine=aniversario'), true);
        assert.strictEqual(isPublicVitrineRoute('/?vitrine=promocao'), true);
      });

      it('ST-28: Flag query params (?promocao, ?aniversario, ?promocao=1) evaluate to true', () => {
        assert.strictEqual(isPublicVitrineRoute('?promocao'), true);
        assert.strictEqual(isPublicVitrineRoute('?aniversario'), true);
        assert.strictEqual(isPublicVitrineRoute('?promocao=1'), true);
        assert.strictEqual(isPublicVitrineRoute('?aniversario=true'), true);
        assert.strictEqual(isPublicVitrineRoute('/?promocao'), true);
      });

      it('ST-29: Multi-param queries with tracking parameters evaluate to true', () => {
        assert.strictEqual(isPublicVitrineRoute('/?utm_source=instagram&vitrine=aniversario&utm_campaign=aniv2026'), true);
        assert.strictEqual(isPublicVitrineRoute('/?ref=whatsapp&promocao=true&tag=liquidacao'), true);
        assert.strictEqual(isPublicVitrineRoute({ pathname: '/', search: '?vitrine=aniversario' }), true);
      });

      it('ST-30: Negative or unrelated query params strictly evaluate to false', () => {
        const negativeQueries = [
          '?view=dashboard',
          '?user=admin',
          '?token=xyz',
          '?search=dipirona',
          '?vitrine=false',
          '?vitrine=0',
          '?vitrine=nao',
          '?other=123',
          '?',
          '',
        ];

        for (const q of negativeQueries) {
          assert.strictEqual(isPublicVitrineRoute(`/${q}`), false, `Query '${q}' não deve ativar rota pública`);
          assert.strictEqual(isPublicVitrineRoute({ pathname: '/', search: q }), false);
        }
      });
    });

    // -----------------------------------------------------------------------
    // 2.3 Hash Variations
    // -----------------------------------------------------------------------
    describe('2.3 Hash Variations', () => {
      it('ST-31: Standard hash routes (#/promocao, #/aniversario, #promocao, #aniversario) evaluate to true', () => {
        assert.strictEqual(isPublicVitrineRoute('#/promocao'), true);
        assert.strictEqual(isPublicVitrineRoute('#/aniversario'), true);
        assert.strictEqual(isPublicVitrineRoute('#promocao'), true);
        assert.strictEqual(isPublicVitrineRoute('#aniversario'), true);
        assert.strictEqual(isPublicVitrineRoute('#/vitrine'), true);
        assert.strictEqual(isPublicVitrineRoute('#vitrine'), true);
        assert.strictEqual(isPublicVitrineRoute('#/ofertas'), true);
        assert.strictEqual(isPublicVitrineRoute('#ofertas'), true);
      });

      it('ST-32: Full URLs with hash routes evaluate to true', () => {
        assert.strictEqual(isPublicVitrineRoute('http://localhost:5173/#/promocao'), true);
        assert.strictEqual(isPublicVitrineRoute('https://belafarma.com.br/#/aniversario'), true);
        assert.strictEqual(isPublicVitrineRoute('http://localhost:5173/#promocao'), true);
        assert.strictEqual(isPublicVitrineRoute({ pathname: '/', hash: '#/promocao' }), true);
      });

      it('ST-33: Administrative or unrelated hashes strictly evaluate to false', () => {
        const negativeHashes = [
          '#/dashboard',
          '#dashboard',
          '#/orders',
          '#admin',
          '#/login',
          '#settings',
          '#top',
          '#',
        ];

        for (const h of negativeHashes) {
          assert.strictEqual(isPublicVitrineRoute(h), false, `Hash '${h}' não deve ativar rota pública`);
          assert.strictEqual(isPublicVitrineRoute({ pathname: '/', hash: h }), false);
        }
      });
    });

    // -----------------------------------------------------------------------
    // 2.4 Showcase to Admin Transitions & State Isolation
    // -----------------------------------------------------------------------
    describe('2.4 Showcase to Admin Transitions & State Isolation', () => {
      it('ST-34: App.tsx handles public route without triggering admin auth guard', () => {
        const appFile = path.resolve('App.tsx');
        const content = fs.readFileSync(appFile, 'utf-8');

        // Regex multiplataforma imune a CRLF / LF
        const publicMatch = content.search(/if\s*\(isPublicRoute\)\s*\{/);
        const authMatch = content.search(/if\s*\(!user\)\s*return\s*\(\s*<Auth/);

        assert.ok(publicMatch !== -1, 'App.tsx deve conter render branch if (isPublicRoute)');
        assert.ok(authMatch !== -1, 'App.tsx deve conter render branch if (!user) return (<Auth');
        assert.ok(
          publicMatch < authMatch,
          'A renderização da rota pública DEVE ocorrer estritamente antes do Auth guard !user return (<Auth'
        );
      });

      it('ST-35: App.tsx implementa handleExitPublicRoute que limpa histórico de rotas e fecha vitrine', () => {
        const appFile = path.resolve('App.tsx');
        const content = fs.readFileSync(appFile, 'utf-8');

        assert.ok(content.includes('handleExitPublicRoute'));
        assert.ok(content.includes('window.location.hash = ""'));
        assert.ok(content.includes('window.history.pushState({}, "", "/")'));
        assert.ok(content.includes('setIsPublicRoute(false)'));
      });

      it('ST-36: VitrineAniversario footer connects onExit to allow administrative transition', () => {
        const vitrineFile = path.resolve('components/vitrine/VitrineAniversario.tsx');
        const content = fs.readFileSync(vitrineFile, 'utf-8');

        assert.ok(content.includes('onExit &&'));
        assert.ok(content.includes('Acesso Administrativo'));
      });

      it('ST-37: Storage keys between Vitrine and Admin are completely partitioned to prevent state leaks', () => {
        const vitrineFile = path.resolve('components/vitrine/VitrineAniversario.tsx');
        const vitrineContent = fs.readFileSync(vitrineFile, 'utf-8');

        const appFile = path.resolve('App.tsx');
        const appContent = fs.readFileSync(appFile, 'utf-8');

        // Vitrine armazena em belafarma_vitrine_cart
        assert.ok(vitrineContent.includes('belafarma_vitrine_cart'));

        // Admin usa belinha_session_user e belinha_theme
        assert.ok(appContent.includes('belinha_session_user'));
        assert.ok(appContent.includes('belinha_theme'));

        // Vitrine NUNCA deve tocar nem modificar a chave da sessão de login do admin
        assert.strictEqual(
          vitrineContent.includes('belinha_session_user'),
          false,
          'Vitrine pública não deve referenciar nem sobreescrever a sessão do admin'
        );
      });
    });
  });
});
