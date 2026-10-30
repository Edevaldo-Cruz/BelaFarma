import test from 'node:test';
import assert from 'node:assert/strict';

import {
  htmlArteUnitaria,
  htmlPaginaEncarte,
  ESTILO_PADRAO
} from '../components/encarteTemplates.ts';

test('htmlArteUnitaria - Valida posições absolutas diretas sem transform translate', () => {
  const item = {
    produto_id: 101,
    descricao: 'SAND HAV TRACK GO PRETO 39/40',
    apresentacao: 'PAR',
    preco_normal: 29.90,
    preco_promocional: 19.90,
    desconto_percentual: 33,
    imagem_url: '/images/chinelo.png'
  };

  const periodo = { inicio: '05/10/2026', termino: '31/10/2026' };

  const estiloComArrasto = {
    ...ESTILO_PADRAO,
    imagemFundoCustom: '/images/tema-bela-farma-sul.png',
    posicoes: {
      foto: { x: 50, y: -20 },
      nome: { x: 10, y: 15 },
      preco: { x: -5, y: 30 },
      validade: { x: 0, y: 10 }
    }
  };

  const html = htmlArteUnitaria(item, 'story', periodo, estiloComArrasto);

  // Verificações
  assert.ok(html.includes('SAND HAV TRACK GO PRETO 39/40'), 'Nome do produto deve estar no HTML');
  assert.ok(html.includes('19'), 'Preço promocional deve conter 19');
  assert.ok(html.includes('90'), 'Preço promocional deve conter 90');

  // Coordenadas Absolutas Calculadas:
  // stageLeft = (540 - 320) / 2 = 110. posFoto.x = 50 => left: 160px
  // stageTop = 175. posFoto.y = -20 => top: 155px
  assert.ok(html.includes('left:160px;top:155px;'), 'Foto deve ter posição absoluta exata somando o delta de arrasto (left:160px;top:155px;)');

  // nomeLeft = (540 - 480) / 2 = 30. posNome.x = 10 => left: 40px
  // nomeTop = 450. posNome.y = 15 => top: 465px
  assert.ok(html.includes('left:40px;top:465px;'), 'Nome deve ter posição absoluta exata somando o delta de arrasto (left:40px;top:465px;)');

  // precoLeft = (540 - 400) / 2 = 70. posPreco.x = -5 => left: 65px
  // precoTop = 545. posPreco.y = 30 => top: 575px
  assert.ok(html.includes('left:65px;top:575px;'), 'Preço deve ter posição absoluta exata somando o delta de arrasto (left:65px;top:575px;)');

  // Não deve conter transform:translate nos containers principais
  assert.strictEqual(html.includes('transform:translate('), false, 'Nenhum container principal deve usar CSS transform:translate');
});

test('htmlPaginaEncarte - Valida geração de página A4 do tabloide', () => {
  const itens = [
    {
      produto_id: 101,
      descricao: 'DORFLEX 36 COMPRIMIDOS',
      preco_normal: 24.90,
      preco_promocional: 16.90,
      desconto_percentual: 32
    }
  ];
  const periodo = { inicio: '05/10/2026', termino: '31/10/2026' };
  const html = htmlPaginaEncarte(itens, 1, 1, periodo, 4, ESTILO_PADRAO);

  assert.ok(html.includes('DORFLEX 36 COMPRIMIDOS'), 'Deve conter a descrição do produto');
  assert.ok(html.includes('16'), 'Deve conter o valor promocional');
});
