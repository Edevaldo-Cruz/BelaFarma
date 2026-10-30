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
import { formatBRL } from '../components/vitrine/vitrineTypes.ts';

describe('Milestone M4: Frictionless Cart Drawer & WhatsApp Checkout', () => {

  describe('whatsappUtils: Phone Canonicalization & Precision', () => {
    it('M4-01: canonicalizeWhatsAppPhone sempre assegura 5532998228189 para o número oficial', () => {
      assert.strictEqual(OFFICIAL_WHATSAPP_PHONE, '5532998228189');
      assert.strictEqual(canonicalizeWhatsAppPhone('32 99822-8189'), '5532998228189');
      assert.strictEqual(canonicalizeWhatsAppPhone('(32) 99822-8189'), '5532998228189');
      assert.strictEqual(canonicalizeWhatsAppPhone('+55 (32) 99822-8189'), '5532998228189');
      assert.strictEqual(canonicalizeWhatsAppPhone('5532998228189'), '5532998228189');
      assert.strictEqual(canonicalizeWhatsAppPhone(''), '5532998228189');
      assert.strictEqual(canonicalizeWhatsAppPhone(null), '5532998228189');
      assert.strictEqual(canonicalizeWhatsAppPhone(undefined), '5532998228189');
    });

    it('M4-02: roundCents evita imprecisão de dízima periódica IEEE 754 em cálculos de centavos', () => {
      // 3 * 9.99 em IEEE 754 é 29.970000000000002
      assert.strictEqual(roundCents(3 * 9.99), 29.97);
      assert.strictEqual(roundCents(0.1 + 0.2), 0.3);
      assert.strictEqual(roundCents(19.999), 20);
    });
  });

  describe('whatsappUtils: extractCartTotals & Form Validation', () => {
    const sampleItems = [
      {
        produto: {
          id: 'prod_1',
          nome: 'Vitamina C Efervescente 1g',
          apresentacao: '10 CPR',
          preco_de: 22.90,
          preco_por: 14.90,
          estoque: 10,
        },
        quantidade: 2,
      },
      {
        produto: {
          id: 'prod_2',
          nome: 'Sabonete Dove Original',
          apresentacao: '90g',
          preco_de: 6.50,
          preco_por: 4.50,
          estoque: 5,
        },
        quantidade: 3,
      },
    ];

    it('M4-03: extractCartTotals aceita array direto de VitrineCartItem', () => {
      const totals = extractCartTotals(sampleItems);
      assert.strictEqual(totals.totalItems, 5);
      // Subtotal: 2 * 14.90 (29.80) + 3 * 4.50 (13.50) = 43.30
      assert.strictEqual(totals.subtotal, 43.30);
      // Economia: 2 * (22.90 - 14.90 = 8.00) = 16.00 + 3 * (6.50 - 4.50 = 2.00) = 6.00 -> 22.00
      assert.strictEqual(totals.savings, 22.00);
      assert.strictEqual(totals.items.length, 2);
    });

    it('M4-04: extractCartTotals aceita CartManager (padrão de interface)', () => {
      const cartManager = {
        getItems: () => sampleItems,
        getSubtotal: () => 43.30,
        getTotalSavings: () => 22.00,
        getTotalItems: () => 5,
      };

      const totals = extractCartTotals(cartManager);
      assert.strictEqual(totals.totalItems, 5);
      assert.strictEqual(totals.subtotal, 43.30);
      assert.strictEqual(totals.savings, 22.00);
    });

    it('M4-05: validateCheckoutForm valida regras mínimas sem burocracia', () => {
      // Nome vazio -> inválido
      const resEmpty = validateCheckoutForm({ nome: '', modalidade: 'retirada' });
      assert.strictEqual(resEmpty.isValid, false);
      assert.ok(resEmpty.errors[0].includes('Nome'));

      // Nome com espaços em branco -> inválido
      const resSpaces = validateCheckoutForm({ nome: '   ', modalidade: 'retirada' });
      assert.strictEqual(resSpaces.isValid, false);

      // Modalidade desconhecida -> inválido
      const resBadMode = validateCheckoutForm({ nome: 'João', modalidade: 'motoboy' });
      assert.strictEqual(resBadMode.isValid, false);

      // Retirada válida
      const resRetirada = validateCheckoutForm({ nome: 'Maria Silva', modalidade: 'retirada' });
      assert.strictEqual(resRetirada.isValid, true);
      assert.strictEqual(resRetirada.errors.length, 0);

      // Entrega válida
      const resEntrega = validateCheckoutForm({
        nome: 'Carlos Santos',
        modalidade: 'entrega',
        endereco: 'Rua São Mateus, 100',
        bairro: 'Cascatinha',
      });
      assert.strictEqual(resEntrega.isValid, true);
    });
  });

  describe('whatsappUtils: Message & URL Generation (R5)', () => {
    const cart = [
      {
        produto: {
          id: 'liq_16399',
          nome: 'KURAMED SEPT SOL 30 ML',
          apresentacao: '1% SOL TOP FR 30ML',
          preco_de: 11.99,
          preco_por: 6.99,
          estoque: 12,
        },
        quantidade: 2,
      },
    ];

    it('M4-06: formatWhatsAppOrderMessage gera mensagem estruturada com itens, subtotal e economia', () => {
      const msg = formatWhatsAppOrderMessage(cart, {
        nome: 'Juliana Paes',
        modalidade: 'retirada',
      });

      assert.ok(msg.includes('🎉 *NOVO PEDIDO - ANIVERSÁRIO & LIQUIDAÇÃO BELAFARMA* 🎉'));
      assert.ok(msg.includes('*Cliente:* Juliana Paes'));
      assert.ok(msg.includes('🏪 Retirada na Loja'));
      assert.strictEqual(msg.includes('Endereço:'), false);
      assert.ok(msg.includes('1. *KURAMED SEPT SOL 30 ML* (1% SOL TOP FR 30ML)'));
      assert.ok(msg.includes('2x a R$ 6,99 = *R$ 13,98*'));
      assert.ok(msg.includes('*VALOR TOTAL DO PEDIDO: R$ 13,98*'));
      assert.ok(msg.includes('*Você economizou:* R$ 10,00'));
      assert.ok(msg.includes('⚡ _Pedido gerado pela Vitrine de Aniversário BelaFarma_'));
    });

    it('M4-07: formatWhatsAppOrderMessage inclui endereço e bairro quando modalidade é entrega', () => {
      const msg = formatWhatsAppOrderMessage(cart, {
        nome: 'Juliana Paes',
        modalidade: 'entrega',
        endereco: 'Rua das Flores, 88',
        bairro: 'Cascatinha',
      });

      assert.ok(msg.includes('🚚 Entrega / Delivery'));
      assert.ok(msg.includes('📍 *Endereço:* Rua das Flores, 88 - Cascatinha'));
    });

    it('M4-08: generateWhatsAppOrderUrl e buildWhatsAppUrl geram link oficial wa.me para 5532998228189', () => {
      const url = generateWhatsAppOrderUrl(cart, {
        nome: 'Ana Carolina',
        modalidade: 'retirada',
      });

      assert.ok(url.startsWith('https://wa.me/5532998228189?text='));
      assert.strictEqual(buildWhatsAppUrl(cart, { nome: 'Ana Carolina', modalidade: 'retirada' }), url);

      const decoded = decodeURIComponent(url.split('?text=')[1]);
      assert.ok(decoded.includes('Ana Carolina'));
      assert.ok(decoded.includes('KURAMED SEPT SOL 30 ML'));
      assert.ok(decoded.includes('R$ 13,98'));
    });
  });

  describe('VitrineCartDrawer: Component Contracts & Architecture (R4)', () => {
    it('M4-09: components/vitrine/VitrineCartDrawer.tsx existe e implementa os requisitos', () => {
      const drawerFile = path.resolve('components/vitrine/VitrineCartDrawer.tsx');
      assert.ok(fs.existsSync(drawerFile), 'VitrineCartDrawer.tsx deve existir');

      const content = fs.readFileSync(drawerFile, 'utf-8');
      assert.ok(content.includes('export const VitrineCartDrawer'));
      assert.ok(content.includes('Meu Carrinho'));
      assert.ok(content.includes('Finalizar Pedido pelo WhatsApp'));
      assert.ok(content.includes('Seu carrinho está vazio'));
      assert.ok(content.includes('Continuar Comprando'));
      assert.ok(content.includes('generateWhatsAppOrderUrl') || content.includes('buildWhatsAppUrl'));
      assert.ok(content.includes('Retirar na Loja'));
      assert.ok(content.includes('Entrega'));
    });

    it('M4-10: VitrineAniversario.tsx importa e monta VitrineCartDrawer', () => {
      const vitrineFile = path.resolve('components/vitrine/VitrineAniversario.tsx');
      const content = fs.readFileSync(vitrineFile, 'utf-8');

      assert.ok(
        content.includes('import { VitrineCartDrawer } from \'./VitrineCartDrawer\''),
        'VitrineAniversario.tsx deve importar VitrineCartDrawer'
      );
      assert.ok(
        content.includes('<VitrineCartDrawer'),
        'VitrineAniversario.tsx deve renderizar <VitrineCartDrawer'
      );
      assert.ok(
        content.includes('isOpen={isCartOpen}'),
        'Deve conectar o estado isOpen ao isCartOpen'
      );
      assert.ok(
        content.includes('onClose={() => setIsCartOpen(false)}'),
        'Deve conectar o fechamento do carrinho'
      );
    });

    it('M4-11: Adição de produto aciona abertura imediata da gaveta do carrinho', () => {
      const vitrineFile = path.resolve('components/vitrine/VitrineAniversario.tsx');
      const content = fs.readFileSync(vitrineFile, 'utf-8');

      // Verifica que handleAddToCart inclui setIsCartOpen(true)
      const addToCartFn = content.slice(content.indexOf('const handleAddToCart ='));
      const fnBody = addToCartFn.slice(0, addToCartFn.indexOf('// Ajuste de Quantidade'));
      assert.ok(
        fnBody.includes('setIsCartOpen(true)'),
        'handleAddToCart deve abrir a gaveta automaticamente para feedback 1-clique'
      );
    });
  });
});
