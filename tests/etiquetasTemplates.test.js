import test from 'node:test';
import assert from 'node:assert/strict';

import {
  htmlEtiqueta,
  htmlFolhaA4Etiquetas,
  FORMATOS_ETIQUETAS,
  MODELOS_PRONTOS_ETIQUETA,
  ESTILO_ETIQUETA_PADRAO
} from '../components/etiquetasTemplates.ts';

test('etiquetasTemplates - htmlEtiqueta renderiza corretamente produto unitário', () => {
  const item = {
    id: '1',
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

test('etiquetasTemplates - modelo verde_preco_baixo_destaque e multiplicadores de fonte', () => {
  const item = {
    id: '1',
    produto_id: 101,
    descricao: 'SAND HAV TRACK GO PRETO 39/40',
    apresentacao: 'PAR',
    ean: '7909989680551',
    preco_normal: 29.90,
    preco_promocional: 19.90,
    desconto_percentual: 33,
    quantidadeCopias: 1
  };

  const modeloVerde = MODELOS_PRONTOS_ETIQUETA['verde_preco_baixo_destaque'];
  assert.ok(modeloVerde, 'Modelo verde_preco_baixo_destaque deve existir');

  const estiloCustom = {
    ...ESTILO_ETIQUETA_PADRAO,
    ...modeloVerde.estilo,
    tamanhoPrecoDeMultiplicador: 1.5,
    tamanhoBadgeMultiplicador: 1.4
  };

  const formato = FORMATOS_ETIQUETAS['termica_60x40'];
  const html = htmlEtiqueta(item, formato, estiloCustom, '31/10/2026');

  assert.ok(html.includes('PREÇO BAIXO'), 'Deve conter o título da faixa PREÇO BAIXO');
  assert.ok(html.includes('-33%'), 'Deve conter o selo de desconto -33%');
  assert.ok(html.includes('#00a651'), 'Deve conter a cor verde da faixa #00a651');
  assert.ok(html.includes('De: R$ 29,90') || html.includes('De: R$&nbsp;29,90') || html.includes('29,90'), 'Deve conter o preço antigo De: R$ 29,90');
});

test('etiquetasTemplates - htmlFolhaA4Etiquetas aceita gridOverride customizado', () => {
  const item = {
    id: '1',
    produto_id: 501,
    descricao: 'DORFLEX 36 COMPRIMIDOS',
    preco_normal: 24.90,
    preco_promocional: 16.90,
    desconto_percentual: 32
  };

  const formato = FORMATOS_ETIQUETAS['termica_60x40'];
  const slots = [item, item, item, item, item];
  const gridOverride = { cols: 2, rows: 5 };

  const htmlA4 = htmlFolhaA4Etiquetas(slots, formato, ESTILO_ETIQUETA_PADRAO, 1, 1, '31/10/2026', gridOverride);

  assert.ok(htmlA4.includes('grid-template-columns:repeat(2'), 'Deve conter 2 colunas na grade');
  assert.ok(htmlA4.includes('grid-template-rows:repeat(5'), 'Deve conter 5 linhas na grade');
});
