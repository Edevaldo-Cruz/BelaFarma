import test from 'node:test';
import assert from 'node:assert/strict';

import {
  htmlEtiqueta,
  htmlFolhaA4Etiquetas,
  FORMATOS_ETIQUETAS,
  ESTILO_ETIQUETA_PADRAO
} from '../components/etiquetasTemplates.ts';

test('etiquetasTemplates - htmlEtiqueta renderiza corretamente produto unitário', () => {
  const item = {
    id: 1,
    produto_id: 501,
    descricao: 'DORFLEX 36 COMPRIMIDOS',
    apresentacao: 'CAIXA',
    ean: '7891058001234',
    preco_normal: 24.90,
    preco_promocional: 16.90,
    desconto_percentual: 32,
    quantidadeCopias: 1
  };

  const formato = FORMATOS_ETIQUETAS['termica_60x40'];
  const html = htmlEtiqueta(item, formato, ESTILO_ETIQUETA_PADRAO, '31/10/2026');

  assert.ok(html.includes('DORFLEX 36 COMPRIMIDOS'), 'Deve incluir a descrição do produto');
  assert.ok(html.includes('16.90') || html.includes('16,90'), 'Deve incluir o preço promocional');
  assert.ok(html.includes('7891058001234'), 'Deve incluir o código EAN no SVG');
});

test('etiquetasTemplates - htmlFolhaA4Etiquetas gera folha A4 não vazia para todos os formatos', () => {
  const item = {
    id: 1,
    produto_id: 501,
    descricao: 'DORFLEX 36 COMPRIMIDOS',
    apresentacao: 'CAIXA',
    ean: '7891058001234',
    preco_normal: 24.90,
    preco_promocional: 16.90,
    desconto_percentual: 32,
    quantidadeCopias: 1
  };

  Object.keys(FORMATOS_ETIQUETAS).forEach(formatoKey => {
    const formato = FORMATOS_ETIQUETAS[formatoKey];
    const slots = [item, null, item];
    const htmlA4 = htmlFolhaA4Etiquetas(slots, formato, ESTILO_ETIQUETA_PADRAO, 1, 1, '31/10/2026');

    assert.ok(htmlA4.length > 100, `HTML da folha A4 para ${formatoKey} não deve ser vazio`);
    assert.ok(htmlA4.includes('210mm'), `Folha A4 para ${formatoKey} deve ter largura 210mm`);
    assert.ok(htmlA4.includes('297mm'), `Folha A4 para ${formatoKey} deve ter altura 297mm`);
    assert.ok(htmlA4.includes('DORFLEX 36 COMPRIMIDOS'), `Folha A4 para ${formatoKey} deve conter o produto`);
  });
});
