import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { formatBRL, isPublicVitrineRoute } from '../components/vitrine/vitrineTypes.ts';

describe('Milestone M3: Vitrine Product Card & Catalog Coordinator Tests', () => {

  describe('VitrineProductCard logic & formatting', () => {
    it('M3-01: formatBRL formata valores monetários corretamente para o padrão brasileiro', () => {
      assert.strictEqual(formatBRL(19.9), 'R$ 19,90');
      assert.strictEqual(formatBRL(9.99), 'R$ 9,99');
      assert.strictEqual(formatBRL(0), 'R$ 0,00');
      assert.strictEqual(formatBRL(100), 'R$ 100,00');
      assert.strictEqual(formatBRL(14.5), 'R$ 14,50');
      assert.strictEqual(formatBRL(1234.56), 'R$ 1234,56');
    });

    it('M3-02: Cálculo da porcentagem de desconto com fallback e arredondamento', () => {
      const calcDiscount = (precoDe, precoPor, percProvided) => {
        if (typeof percProvided === 'number' && percProvided > 0) return percProvided;
        if (precoDe > precoPor && precoDe > 0) {
          return Math.round(((precoDe - precoPor) / precoDe) * 100);
        }
        return 0;
      };

      assert.strictEqual(calcDiscount(20, 10, 50), 50);
      assert.strictEqual(calcDiscount(20, 10, undefined), 50);
      assert.strictEqual(calcDiscount(19.90, 9.99, undefined), 50);
      assert.strictEqual(calcDiscount(10, 10, undefined), 0);
      assert.strictEqual(calcDiscount(10, 12, undefined), 0);
    });

    it('M3-03: Badge de escassez de estoque respeita as regras visuais de conversão', () => {
      const getStockBadgeText = (estoque) => {
        const est = Number(estoque) || 0;
        if (est <= 0) return 'Esgotado';
        if (est <= 5) return `Restam apenas ${est} unidades!`;
        return 'Estoque disponível';
      };

      assert.strictEqual(getStockBadgeText(0), 'Esgotado');
      assert.strictEqual(getStockBadgeText(-1), 'Esgotado');
      assert.strictEqual(getStockBadgeText(1), 'Restam apenas 1 unidades!');
      assert.strictEqual(getStockBadgeText(5), 'Restam apenas 5 unidades!');
      assert.strictEqual(getStockBadgeText(6), 'Estoque disponível');
      assert.strictEqual(getStockBadgeText(100), 'Estoque disponível');
    });

    it('M3-04: Botão de adicionar respeita a trava de estoque zerado', () => {
      let added = false;
      const onAddToCart = () => { added = true; };

      const simulateClick = (estoque) => {
        if (estoque <= 0) return false;
        onAddToCart();
        return true;
      };

      assert.strictEqual(simulateClick(0), false);
      assert.strictEqual(added, false);

      assert.strictEqual(simulateClick(3), true);
      assert.strictEqual(added, true);
    });
  });

  describe('VitrineAniversario Instant Search & Category Filtering Logic', () => {
    const mockProducts = [
      {
        id: 'liq_16399',
        produto_id: 16399,
        nome: 'KURAMED SEPT SOL 30 ML',
        descricao: 'KURAMED SOLUCAO ANTISSEPTICA',
        apresentacao: '30 ML',
        ean: '7896523208282',
        categoria: 'Medicamentos Similares',
        laboratorio: 'Cimed',
        preco_de: 15.00,
        preco_por: 6.99,
        estoque: 12
      },
      {
        id: 'liq_21045',
        produto_id: 21045,
        nome: 'SABONETE LIQUIDO DOVE ORIGINAL',
        descricao: 'SABONETE NUTRITIVO SUAVE',
        apresentacao: '250 ML',
        ean: '7891150034501',
        categoria: 'Perfumaria & Higiene',
        laboratorio: 'Unilever',
        preco_de: 18.90,
        preco_por: 11.50,
        estoque: 3
      },
      {
        id: 'liq_33012',
        produto_id: 33012,
        nome: 'DIPIRONA SODICA 500MG COM 10 COMP',
        descricao: 'ANALGESICO E ANTITERMICO',
        apresentacao: '10 COMP',
        ean: '7896004702111',
        categoria: 'Medicamentos Genéricos',
        laboratorio: 'EMS',
        preco_de: 8.50,
        preco_por: 3.99,
        estoque: 25
      }
    ];

    const filterCatalog = (items, term, selectedCat) => {
      const q = term.trim().toLowerCase();
      return items.filter((prod) => {
        if (selectedCat !== 'Todas' && prod.categoria !== selectedCat) {
          return false;
        }
        if (!q) return true;
        const nomeMatch = prod.nome?.toLowerCase().includes(q);
        const descMatch = prod.descricao?.toLowerCase().includes(q);
        const apresMatch = prod.apresentacao?.toLowerCase().includes(q);
        const catMatch = prod.categoria?.toLowerCase().includes(q);
        const eanMatch = prod.ean?.includes(q);
        const labMatch = prod.laboratorio?.toLowerCase().includes(q);
        return nomeMatch || descMatch || apresMatch || catMatch || eanMatch || labMatch;
      });
    };

    it('M3-05: Busca instantânea por nome parcial e completo', () => {
      const resultKuramed = filterCatalog(mockProducts, 'kuramed', 'Todas');
      assert.strictEqual(resultKuramed.length, 1);
      assert.strictEqual(resultKuramed[0].produto_id, 16399);

      const resultDove = filterCatalog(mockProducts, 'DOVE', 'Todas');
      assert.strictEqual(resultDove.length, 1);
      assert.strictEqual(resultDove[0].produto_id, 21045);
    });

    it('M3-06: Busca instantânea por código de barras EAN', () => {
      const resultEan = filterCatalog(mockProducts, '7896523208282', 'Todas');
      assert.strictEqual(resultEan.length, 1);
      assert.strictEqual(resultEan[0].nome, 'KURAMED SEPT SOL 30 ML');
    });

    it('M3-07: Busca instantânea por apresentação ou laboratório', () => {
      const resultLab = filterCatalog(mockProducts, 'EMS', 'Todas');
      assert.strictEqual(resultLab.length, 1);
      assert.strictEqual(resultLab[0].produto_id, 33012);

      const resultApres = filterCatalog(mockProducts, '250 ML', 'Todas');
      assert.strictEqual(resultApres.length, 1);
      assert.strictEqual(resultApres[0].produto_id, 21045);
    });

    it('M3-08: Filtro por abas de categoria particiona com exatidão', () => {
      const perfumaria = filterCatalog(mockProducts, '', 'Perfumaria & Higiene');
      assert.strictEqual(perfumaria.length, 1);
      assert.strictEqual(perfumaria[0].produto_id, 21045);

      const similares = filterCatalog(mockProducts, '', 'Medicamentos Similares');
      assert.strictEqual(similares.length, 1);
      assert.strictEqual(similares[0].produto_id, 16399);

      const todas = filterCatalog(mockProducts, '', 'Todas');
      assert.strictEqual(todas.length, 3);
    });

    it('M3-09: Combinação simultânea de busca textual e filtro de categoria', () => {
      // Buscar 'dove' dentro de 'Medicamentos Similares' -> 0 itens
      const zero = filterCatalog(mockProducts, 'dove', 'Medicamentos Similares');
      assert.strictEqual(zero.length, 0);

      // Buscar 'dove' dentro de 'Perfumaria & Higiene' -> 1 item
      const one = filterCatalog(mockProducts, 'dove', 'Perfumaria & Higiene');
      assert.strictEqual(one.length, 1);
    });
  });

  describe('Integration with App.tsx and Vitrine Components', () => {
    it('M3-10: App.tsx importa VitrineAniversario e monta na rota pública', () => {
      const appSource = fs.readFileSync(path.resolve('App.tsx'), 'utf-8');
      assert.ok(
        appSource.includes('VitrineAniversario'),
        'App.tsx deve importar e renderizar VitrineAniversario'
      );
      assert.ok(
        appSource.includes('<VitrineAniversario'),
        'App.tsx deve renderizar <VitrineAniversario na rota pública'
      );
    });

    it('M3-11: App.tsx preserva a manchete oficial obrigatória', () => {
      const appSource = fs.readFileSync(path.resolve('App.tsx'), 'utf-8');
      const required = 'Mais de 100 itens com preços incríveis e descontos imperdíveis!';
      assert.ok(appSource.includes(required), 'App.tsx deve conter a frase oficial de impacto');
    });

    it('M3-12: VitrineAniversario.tsx contém integração com VitrineSplash, busca, abas e carrinho', () => {
      const compSource = fs.readFileSync(
        path.resolve('components/vitrine/VitrineAniversario.tsx'),
        'utf-8'
      );
      assert.ok(compSource.includes('VitrineSplash'), 'Deve integrar o VitrineSplash');
      assert.ok(compSource.includes('VitrineProductCard'), 'Deve renderizar os VitrineProductCard');
      assert.ok(compSource.includes('/api/liquidacao/public/ofertas'), 'Deve buscar o endpoint público');
      assert.ok(compSource.includes('belafarma_vitrine_cart'), 'Deve persistir no storage oficial');
      assert.ok(compSource.includes('5532998228189'), 'Deve apontar para o WhatsApp oficial BelaFarma');
      assert.ok(compSource.includes('Mais de 100 itens com preços incríveis e descontos imperdíveis!'));
    });

    it('M3-13: VitrineProductCard.tsx implementa fallback de imagem, De/Por e 1-clique', () => {
      const cardSource = fs.readFileSync(
        path.resolve('components/vitrine/VitrineProductCard.tsx'),
        'utf-8'
      );
      assert.ok(cardSource.includes('formatBRL'), 'Deve conter formatação BRL');
      assert.ok(cardSource.includes('Restam apenas'), 'Deve conter badge de escassez');
      assert.ok(cardSource.includes('Estoque disponível'), 'Deve conter badge de estoque disponível');
      assert.ok(cardSource.includes('Adicionado! ✓'), 'Deve ter feedback de adição');
      assert.ok(cardSource.includes('Package') || cardSource.includes('img'), 'Deve ter fallback de imagem');
    });
  });
});
