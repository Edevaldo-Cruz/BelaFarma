const { ProfarmaRobot } = require('./belaped-robot-profarma.js');

async function testar() {
  const robo = new ProfarmaRobot({ headless: true });
  await robo.iniciar();

  const ean = '7891721024481';
  const urls = [
    `https://pedido.profarma.com.br/novo-pedido?termo=${ean}`,
    `https://pedido.profarma.com.br/novo-pedido?busca=${ean}`,
    `https://pedido.profarma.com.br/novo-pedido?search=${ean}`,
    `https://pedido.profarma.com.br/novo-pedido?q=${ean}`
  ];

  for (const u of urls) {
    console.log(`Testando URL: ${u}`);
    await robo.page.goto(u, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1500));
    const info = await robo.page.evaluate(() => {
      const inp = document.querySelector('input[placeholder*="buscando"]');
      return {
        inputVal: inp ? inp.value : null,
        temProdutos: document.querySelectorAll('tr, .MuiTableRow-root').length
      };
    });
    console.log(`-> Resposta: input=${info.inputVal}, linhas=${info.temProdutos}`);
  }

  await robo.fechar();
}

testar().catch(console.error);
