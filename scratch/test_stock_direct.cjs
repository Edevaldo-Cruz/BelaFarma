const { obterResumoEstoque, listarProdutosEstoque, obterCategorias } = require('../backend/services/stock.service');

async function testDirect() {
  console.log('Iniciando teste direto do stock.service.js...');
  
  try {
    console.log('\n--- 1. Testando obterResumoEstoque() ---');
    const startResumo = Date.now();
    const resumo = await obterResumoEstoque();
    console.log(`Tempo: ${Date.now() - startResumo}ms`);
    console.log('Resultado resumo:', resumo);

    console.log('\n--- 2. Testando obterCategorias() ---');
    const startCats = Date.now();
    const categorias = await obterCategorias();
    console.log(`Tempo: ${Date.now() - startCats}ms`);
    console.log(`Total categorias: ${categorias.length}`);
    console.log('Primeiras 3:', categorias.slice(0, 3));

    console.log('\n--- 3. Testando listarProdutosEstoque() ---');
    const startList = Date.now();
    const produtos = await listarProdutosEstoque({
      limit: 50,
      offset: 0,
      search: '',
      daysWithoutSales: 90,
      stockStatus: 'positivo',
      categoryId: '',
      sort: 'tempo_sem_venda'
    });
    console.log(`Tempo: ${Date.now() - startList}ms`);
    console.log(`Total produtos encontrados: ${produtos.total}`);
    console.log(`Itens retornados nesta página: ${produtos.items.length}`);
    if (produtos.items.length > 0) {
      console.log('Primeiro produto:', produtos.items[0]);
    }

    console.log('\n--- 4. Testando listarProdutosEstoque() com sort contendo modificadores (e.g. tempo_sem_venda:1) ---');
    const startListMod = Date.now();
    const produtosMod = await listarProdutosEstoque({
      limit: 50,
      offset: 0,
      search: '',
      daysWithoutSales: 90,
      stockStatus: 'positivo',
      categoryId: '',
      sort: 'tempo_sem_venda:1'
    });
    console.log(`Tempo: ${Date.now() - startListMod}ms`);
    console.log(`Total produtos (Mod): ${produtosMod.total}`);
    console.log(`Itens retornados (Mod): ${produtosMod.items.length}`);
    if (produtosMod.items.length > 0) {
      console.log('Primeiro produto (Mod):', produtosMod.items[0]);
    }

    console.log('\n--- 5. Testando listarProdutosEstoque() com filtro de produtos girando (daysWithoutSales: -30) ---');
    const startListGirando = Date.now();
    const produtosGirando = await listarProdutosEstoque({
      limit: 50,
      offset: 0,
      search: '',
      daysWithoutSales: -30,
      stockStatus: 'positivo',
      categoryId: '',
      sort: 'nome_asc'
    });
    console.log(`Tempo: ${Date.now() - startListGirando}ms`);
    console.log(`Total produtos girando (30 dias): ${produtosGirando.total}`);
    console.log(`Itens retornados: ${produtosGirando.items.length}`);
    if (produtosGirando.items.length > 0) {
      console.log('Primeiro produto girando:', produtosGirando.items[0]);
    }

    console.log('\n✅ Teste concluído com sucesso!');
  } catch (err) {
    console.error('\n❌ Erro durante teste direto:', err);
  }
}

testDirect();
