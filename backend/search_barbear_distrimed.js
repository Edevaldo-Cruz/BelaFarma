const { DistrimedRobot } = require('./belaped-robot-distrimed');

async function searchBarbearDistrimed() {
  const robot = new DistrimedRobot({ headless: true });
  try {
    await robot.iniciar();
    console.log('[Distrimed] Buscando aparelhos de barbear...');
    
    const termos = ['PROBAK', 'PRESTO', 'BARBEAR', 'BIC', 'VENUS'];
    for (const t of termos) {
      const res = await robot.buscarTermo(t);
      console.log(`\n--- TERMO: "${t}" NA DISTRIMED (${(res || []).length} encontrados) ---`);
      (res || []).slice(0, 10).forEach(it => {
        console.log(`[${it.ean}] ${it.descricao} | Preço: R$ ${it.preco}`);
      });
    }

  } finally {
    await robot.fechar();
  }
}

searchBarbearDistrimed().catch(console.error);
