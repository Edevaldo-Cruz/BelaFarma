const { DistrimedRobot } = require('./belaped-robot-distrimed.js');

async function testar() {
  const robo = new DistrimedRobot({ headless: true });
  await robo.iniciar();

  const ean = '7896181927594';
  const urls = [
    `https://inovacao.distrimed.com.br/produtos?pesquisa=${ean}`,
    `https://inovacao.distrimed.com.br/produtos?busca=${ean}`,
    `https://inovacao.distrimed.com.br/produtos?q=${ean}`,
    `https://inovacao.distrimed.com.br/produtos?filtro=${ean}`
  ];

  for (const u of urls) {
    console.log(`Testando URL Distrimed: ${u}`);
    await robo.page.goto(u, { waitUntil: 'networkidle2', timeout: 35000 });
    await new Promise(r => setTimeout(r, 2000));
    const info = await robo.page.evaluate(() => {
      const inp = document.querySelector('input[placeholder*="Pesquisar"], input[type="search"]');
      const cards = document.querySelectorAll('.card-produto, .produto-item, div[class*="produto"]').length;
      return {
        inputVal: inp ? inp.value : null,
        cards
      };
    });
    console.log(`-> Resposta Distrimed: input=${info.inputVal}, cards=${info.cards}`);
  }

  await robo.fechar();
}

testar().catch(console.error);
