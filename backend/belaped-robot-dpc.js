const puppeteer = require('puppeteer');

/**
 * Módulo de Automação e Raspagem B2B da DPC Distribuidora (BelaPed)
 * Realiza login e cotação de produtos por EAN em tempo real
 */
class DpcRobot {
  constructor(options = {}) {
    this.usuario = options.usuario || '47378578000140';
    this.senha = options.senha || 'Primus2022@';
    this.headless = options.headless !== undefined ? options.headless : true;
    this.browser = null;
    this.page = null;
  }

  async iniciar() {
    console.log('[DpcRobot] Iniciando navegador Puppeteer...');
    this.browser = await puppeteer.launch({
      headless: this.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote'
      ]
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1366, height: 768 });

    // Otimização: bloqueia imagens e fontes para acelerar a pesquisa
    await this.page.setRequestInterception(true);
    this.page.on('request', (req) => {
      const type = req.resourceType();
      if (type === 'image' || type === 'media' || type === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });

    console.log('[DpcRobot] Acessando autenticação da DPC...');
    await this.page.goto('https://cliente.dpcnet.com.br/?redirect=https%3A%2F%2Fdpcnet.com.br%2F', {
      waitUntil: 'networkidle2',
      timeout: 45000
    });

    console.log('[DpcRobot] Efetuando login...');
    await this.page.waitForSelector('input#email', { timeout: 15000 });
    await this.page.type('input#email', this.usuario, { delay: 10 });
    await this.page.type('input#password', this.senha, { delay: 10 });

    await Promise.all([
      this.page.click('button[type="submit"]'),
      this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 35000 })
    ]);

    console.log('[DpcRobot] Login na DPC efetuado com sucesso!');
  }

  /**
   * Consulta um único EAN no catálogo da DPC
   * Retorna { fornecedor: 'DPC', ean, disponivel: boolean, preco: number, descricao: string }
   */
  async cotarEAN(ean) {
    if (!this.page) throw new Error('Robô DPC não iniciado.');

    try {
      const eanLimpo = String(ean).trim();
      if (!eanLimpo) return { fornecedor: 'DPC', disponivel: false, preco: null, motivo: 'EAN_VAZIO' };

      const urlBusca = `https://dpcnet.com.br/catalogo?busca=${eanLimpo}&visualizacao=bloco-1&ordenacao=ordem-0`;
      await this.page.goto(urlBusca, { waitUntil: 'networkidle2', timeout: 25000 });

      // Pausa rápida para hidratação do React
      await new Promise(r => setTimeout(r, 1200));

      const dados = await this.page.evaluate(() => {
        const bodyText = document.body.innerText;
        if (bodyText.includes('Nenhum resultado encontrado') || bodyText.includes('Foram encontrados 0 produtos')) {
          return { encontrado: false };
        }

        // Procura os preços nos cards (excluindo o carrinho do topo)
        const elementosComPreco = Array.from(document.querySelectorAll('*'))
          .filter(el => {
            const t = el.innerText || '';
            // Ignora o valor do carrinho do cabeçalho
            return t.startsWith('R$') && el.children.length === 0 && !el.closest('header');
          })
          .map(el => el.innerText.trim());

        // Procura título do produto
        const titulos = Array.from(document.querySelectorAll('h2, h3, h4, p, a'))
          .filter(el => {
            const t = el.innerText || '';
            return t.length > 5 && t.length < 150 && !el.closest('header') && !el.closest('footer');
          })
          .map(el => el.innerText.trim());

        return {
          encontrado: elementosComPreco.length > 0,
          precos: elementosComPreco,
          titulos
        };
      });

      if (!dados.encontrado || dados.precos.length === 0) {
        return {
          fornecedor: 'DPC',
          ean: eanLimpo,
          disponivel: false,
          preco: null,
          mensagem: 'Indisponível na DPC'
        };
      }

      // Pega o primeiro preço válido do produto
      let precoFinal = null;
      for (const p of dados.precos) {
        // Formato R$ 7,76
        const limpo = p.replace('R$', '').trim().replace('.', '').replace(',', '.');
        const num = parseFloat(limpo);
        if (!isNaN(num) && num > 0) {
          precoFinal = num;
          break;
        }
      }

      return {
        fornecedor: 'DPC',
        ean: eanLimpo,
        disponivel: precoFinal !== null,
        descricao: dados.titulos[0] || '',
        preco: precoFinal,
        dataHora: new Date().toISOString()
      };

    } catch (err) {
      console.error(`[DpcRobot] Erro ao cotar EAN ${ean}:`, err.message);
      return {
        fornecedor: 'DPC',
        ean,
        disponivel: false,
        preco: null,
        erro: err.message
      };
    }
  }

  async fechar() {
    if (this.browser) {
      console.log('[DpcRobot] Encerrando navegador DPC...');
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.page = null;
    }
  }
}

module.exports = { DpcRobot };
