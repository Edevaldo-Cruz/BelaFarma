const assert = require('assert');
const path = require('path');
const db = require('./database');
const comprasMineracao = require('./services/compras-mineracao.service');
const horacioAgent = require('./services/horacio-agent.service');

async function runTests() {
  console.log('====================================================');
  console.log('INICIANDO TESTES DE OFERTAS ESCALONADAS (QUANTIDADE MINIMA)');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // TESTE 1: Parser Regex com a Mensagem Real do Print do Usuario
  await testAsync('Teste 1: extrairLinhasDeOferta extrai faixas e limpa nomes de produtos', async () => {
    const msgTexto = `*💊 OFERTAS OVM NEO ESCALONADA*

🔹 NISTATINA+OXIDO DE ZINCO 60G PDA-NQG
• 1 un. → R$ 8,29
• 6 un. → R$ 7,69
• 60 un. → R$ 7,19

🔹 FP LOSARTANA 50MG GEN 30 CPR REV-NQG
• 30 un. → R$ 1,75
• 60 un. → R$ 1,49
• 120 un. → R$ 1,39

🔹 DIPIRONA 1G GEN 20 CPR-NQG
• 1 un. → R$ 8,19
• 30 un. → R$ 7,49
• 120 un. → R$ 6,85`;

    const ofertas = comprasMineracao.extrairLinhasDeOferta(msgTexto);
    assert.strictEqual(ofertas.length, 3, 'Deveria identificar exatamente 3 ofertas de produtos');

    // Nistatina
    const nistatina = ofertas.find(o => o.produtoNome.includes('NISTATINA'));
    assert(nistatina, 'Deveria encontrar a Nistatina');
    assert.strictEqual(nistatina.produtoNome.trim(), 'NISTATINA+OXIDO DE ZINCO 60G PDA-NQG', 'Nome da Nistatina deve estar limpo sem residuo un. ->');
    assert.strictEqual(nistatina.precoOfertado, 8.29, 'Preco base deve ser 8.29');
    assert.strictEqual(nistatina.qtdMinima, 1, 'Qtd minima base deve ser 1');
    assert(Array.isArray(nistatina.faixasPreco), 'faixasPreco deve ser um array');
    assert.strictEqual(nistatina.faixasPreco.length, 3, 'Nistatina deve ter 3 faixas de quantidade');
    assert.deepStrictEqual(nistatina.faixasPreco[0], { qtdMinima: 1, preco: 8.29 });
    assert.deepStrictEqual(nistatina.faixasPreco[1], { qtdMinima: 6, preco: 7.69 });
    assert.deepStrictEqual(nistatina.faixasPreco[2], { qtdMinima: 60, preco: 7.19 });

    // Losartana
    const losartana = ofertas.find(o => o.produtoNome.includes('LOSARTANA'));
    assert(losartana, 'Deveria encontrar a Losartana');
    assert.strictEqual(losartana.produtoNome.trim(), 'FP LOSARTANA 50MG GEN 30 CPR REV-NQG', 'Nome da Losartana deve estar limpo');
    assert.strictEqual(losartana.qtdMinima, 30, 'Qtd minima base da Losartana deve ser 30');
    assert.strictEqual(losartana.faixasPreco.length, 3, 'Losartana deve ter 3 faixas');
    assert.deepStrictEqual(losartana.faixasPreco[0], { qtdMinima: 30, preco: 1.75 });
    assert.deepStrictEqual(losartana.faixasPreco[1], { qtdMinima: 60, preco: 1.49 });
  });

  // TESTE 2: Persistencia no Banco e Leitura em listarOportunidades
  await testAsync('Teste 2: processarMensagemRecebida persiste faixas_preco e listarOportunidades retorna faixasPreco parsed', async () => {
    const msgId = 'test_escalonado_' + Date.now();
    const resultado = await comprasMineracao.processarMensagemRecebida({
      id: msgId,
      text: `🔹 NISTATINA+OXIDO DE ZINCO 60G PDA-NQG\n• 1 un. → R$ 8,29\n• 6 un. → R$ 7,69\n• 60 un. → R$ 7,19`,
      phone: '5532999990001',
      pushName: 'Distribuidora Teste'
    }, db);

    assert(resultado.ofertas.length >= 1, 'Deve ter processado ao menos 1 oferta');
    const ofrGravada = resultado.ofertas[0];
    assert(Array.isArray(ofrGravada.faixasPreco), 'Oferta gravada deve conter faixasPreco');

    // Consulta no banco via listarOportunidades
    const oportunidades = comprasMineracao.listarOportunidades(db, { apenasHoje: false });
    const encontrada = oportunidades.find(o => o.mensagemId === msgId);
    assert(encontrada, 'Deve encontrar a oportunidade no radar');
    assert(Array.isArray(encontrada.faixasPreco), 'faixasPreco deve ser retornado como array');
    assert.strictEqual(encontrada.faixasPreco.length, 3, 'Deve conter as 3 faixas');
    assert.strictEqual(encontrada.faixasPreco[1].qtdMinima, 6);
    assert.strictEqual(encontrada.faixasPreco[1].preco, 7.69);

    // Limpeza
    db.prepare('DELETE FROM compras_oportunidades_mineradas WHERE mensagem_id = ?').run(msgId);
  });

  // TESTE 3: Horacio - Promovendo para Faixa Superior com Giro Prudencial (Curva B)
  await testAsync('Teste 3: Horacio avalia faixas e promove quantidade para atingir desconto seguro', async () => {
    const faixas = [
      { qtdMinima: 1, preco: 8.29 },
      { qtdMinima: 6, preco: 7.69 },
      { qtdMinima: 60, preco: 7.19 }
    ];
    // Produto Curva B com VMD = 0.2 un/dia (6 un/mes), saldo = 1, preco historico = 8.50, necessidade base = 4 un
    const resultado = horacioAgent.avaliarFaixasPrecoEscalonada(
      faixas,
      0.2, // consumo diario
      1,   // saldo atual
      8.50,// preco historico
      'B', // curva ABC
      4    // quantidade base sugerida
    );

    assert(resultado, 'Deveria retornar avaliacao');
    assert.strictEqual(resultado.qtdSugerida, 6, 'Deveria ajustar de 4 para 6 unidades para capturar faixa com desconto');
    assert.strictEqual(resultado.precoOfertado, 7.69, 'Deveria adotar o preco da faixa de 6 unidades');
    assert(resultado.justificativaFaixa.includes('Ajustado para 6 un'), 'Justificativa deve explicar a escolha da faixa');
  });

  // TESTE 4: Horacio - Descartando Faixa de Volume Excessivo para Item de Medio/Baixo Giro
  await testAsync('Teste 4: Horacio descarta faixa de 60 unidades quando geraria mais de 60 dias de estoque', async () => {
    const faixas = [
      { qtdMinima: 1, preco: 8.29 },
      { qtdMinima: 6, preco: 7.69 },
      { qtdMinima: 60, preco: 7.19 }
    ];
    // Para VMD = 0.2, 60 unidades durariam (1+60)/0.2 = 305 dias (quase 1 ano!)
    const resultado = horacioAgent.avaliarFaixasPrecoEscalonada(
      faixas,
      0.2,
      1,
      8.50,
      'B',
      4
    );

    assert.notStrictEqual(resultado.qtdSugerida, 60, 'NAO deve sugerir 60 unidades pois geraria 305 dias de estoque (acima do teto)');
    assert.strictEqual(resultado.qtdSugerida, 6, 'Deve manter a faixa prudente de 6 unidades');
  });

  // TESTE 5: Horacio - Aproveitando Faixa de 60 Unidades para Item Curva A de Alto Giro
  await testAsync('Teste 5: Horacio aprova faixa de volume de 60 unidades para produto Curva A', async () => {
    const faixas = [
      { qtdMinima: 1, preco: 8.29 },
      { qtdMinima: 6, preco: 7.69 },
      { qtdMinima: 60, preco: 7.19 }
    ];
    // Curva A com VMD = 2.0 un/dia (60 un/mes), saldo = 5 un, necessidade base = 30 un
    // (5 + 60) / 2.0 = 32.5 dias de estoque (bem abaixo do teto de 60 dias!)
    const resultado = horacioAgent.avaliarFaixasPrecoEscalonada(
      faixas,
      2.0,
      5,
      8.50,
      'A',
      30
    );

    assert(resultado, 'Deveria retornar avaliacao');
    assert.strictEqual(resultado.qtdSugerida, 60, 'Deve sugerir 60 unidades para capturar o maior desconto (R$ 7,19)');
    assert.strictEqual(resultado.precoOfertado, 7.19, 'Deve adotar R$ 7,19');
  });

  // TESTE 6: Horacio - Curva C mantem teto estrito de 30 dias
  await testAsync('Teste 6: Horacio protege Curva C com teto rigido de 30 dias', async () => {
    const faixas = [
      { qtdMinima: 1, preco: 10.00 },
      { qtdMinima: 12, preco: 7.00 }
    ];
    // Curva C com VMD = 0.1 un/dia (3 un/mes), saldo = 0, necessidade base = 2 un
    // 12 un durariam 120 dias (> 30 dias de teto para Curva C)
    const resultado = horacioAgent.avaliarFaixasPrecoEscalonada(
      faixas,
      0.1,
      0,
      10.50,
      'C',
      2
    );

    assert.strictEqual(resultado.qtdSugerida, 2, 'Curva C nao deve ser sobrecarregada com 12 unidades (120 dias)');
    assert.strictEqual(resultado.precoOfertado, 10.00, 'Mantem o preco da faixa base de 1 un');
  });

  console.log('\n====================================================');
  console.log(`TOTAL: ${passed}/${passed + failed} TESTES PASSARAM COM SUCESSO!`);
  console.log('====================================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
