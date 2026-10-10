const puppeteer = require('puppeteer');

/**
 * Módulo de Automação e Raspagem B2B da Soton Farma (BelaPed)
 * Plataforma: Mercos / MeusPedidos (sotonfarma.meuspedidos.com.br)
 * Funções:
 * 1. Login automatizado
 * 2. Cotação de produtos por EAN em tempo real
 * 3. Montagem robótica de carrinho produto a produto
 */
class SotonRobot {
  constructor(options = {}) {
    this.usuario = options.usuario || 'belafarmasul@gmail.com';
    this.senha = options.senha || '935301';
    this.headless = options.headless !== undefined ? options.headless : true;
    this.browser = null;
    this.page = null;
  }

  async iniciar() {
    console.log('[SotonRobot] Iniciando navegador Puppeteer...');
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

    // Otimização: desabilita carregamento de imagens pesadas para acelerar a cotação
    await this.page.setRequestInterception(true);
    this.page.on('request', (req) => {
      const type = req.resourceType();
      if (type === 'image' || type === 'media' || type === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });

    console.log('[SotonRobot] Acessando autenticação da Soton...');
    await this.page.goto('https://sotonfarma.meuspedidos.com.br/entrar', {
      waitUntil: 'networkidle2',
      timeout: 45000
    });

    console.log('[SotonRobot] Efetuando login...');
    await this.page.waitForSelector('input#email', { timeout: 15000 });
    await this.page.type('input#email', this.usuario, { delay: 10 });
    await this.page.type('input#password', this.senha, { delay: 10 });

    await Promise.all([
      this.page.keyboard.press('Enter'),
      this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 35000 })
    ]);

    console.log('[SotonRobot] Login na Soton efetuado com sucesso!');
  }

  /**
   * Consulta um único EAN no catálogo da Soton Farma
   * Retorna { fornecedor: 'SOTON FARMA', ean, disponivel: boolean, preco: number, descricao: string }
   */
  async cotarEAN(ean) {
    if (!this.page) throw new Error('Robô Soton não iniciado.');

    try {
      const urlBusca = `https://sotonfarma.meuspedidos.com.br/?busca=${encodeURIComponent(ean)}`;
      await this.page.goto(urlBusca, { waitUntil: 'networkidle2', timeout: 25000 });
      await new Promise(r => setTimeout(r, 2000));

      const dados = await this.page.evaluate(() => {
        const bodyText = document.body.innerText || '';
        if (bodyText.includes('Nenhum produto encontrado') || bodyText.includes('não encontramos')) {
          return { disponivel: false, motivo: 'Nenhum produto retornado na busca' };
        }

        // Procura cartões de produto na Mercos
        const cards = document.querySelectorAll('[class*="Catalog__card"]');
        if (cards && cards.length > 0) {
          const primeiroCard = cards[0];
          const linhas = (primeiroCard.innerText || '').split('\n').map(l => l.trim()).filter(Boolean);
          const titulo = linhas[0] || '';

          // Acha a linha com R$
          let preco = null;
          for (const l of linhas) {
            if (l.startsWith('R$')) {
              const clean = l.replace('R$', '').trim().replace(/\./g, '').replace(',', '.');
              const val = parseFloat(clean);
              if (!isNaN(val) && val > 0) {
                preco = val;
                break;
              }
            }
          }

          if (preco) {
            return {
              disponivel: true,
              preco,
              descricao: titulo
            };
          }
        }

        // Fallback genérico para elementos de preço
        const elementosPreco = Array.from(document.querySelectorAll('*'))
          .filter(el => {
            const t = el.innerText || '';
            return t.startsWith('R$') && el.children.length === 0 && !el.closest('header');
          });

        if (elementosPreco.length === 0) {
          return { disponivel: false, motivo: 'Preço não localizado' };
        }

        let menorPreco = Infinity;
        for (const el of elementosPreco) {
          const txt = el.innerText.replace('R$', '').trim().replace(/\./g, '').replace(',', '.');
          const val = parseFloat(txt);
          if (!isNaN(val) && val > 0 && val < menorPreco) {
            menorPreco = val;
          }
        }

        return {
          disponivel: menorPreco < Infinity,
          preco: menorPreco < Infinity ? menorPreco : null,
          descricao: 'Produto localizado na Soton Farma'
        };
      });

      return {
        fornecedor: 'SOTON FARMA',
        ean,
        disponivel: dados.disponivel,
        preco: dados.preco,
        descricao: dados.descricao || '',
        mensagem: dados.motivo || ''
      };

    } catch (err) {
      return {
        fornecedor: 'SOTON FARMA',
        ean,
        disponivel: false,
        preco: null,
        mensagem: 'Erro ao consultar item: ' + err.message
      };
    }
  }

  /**
   * Adiciona um produto ao carrinho produto a produto na plataforma Mercos
   */
  async adicionarAoCarrinho(ean, quantidade) {
    if (!this.page) throw new Error('Robô Soton não iniciado.');
    const qtdNum = Math.max(1, parseInt(quantidade) || 1);

    try {
      const urlBusca = `https://sotonfarma.meuspedidos.com.br/?busca=${encodeURIComponent(ean)}`;
      await this.page.goto(urlBusca, { waitUntil: 'networkidle2', timeout: 25000 });
      await new Promise(r => setTimeout(r, 2000));

      const adicionou = await this.page.evaluate(async (qtd) => {
        const card = document.querySelector('[class*="Catalog__card"]') || document;
        
        // Encontra o input de quantidade do primeiro card
        const inputQtd = card.querySelector('input[type="number"]');
        if (!inputQtd) return { sucesso: false, motivo: 'Campo de quantidade não encontrado no item' };

        // Foca e altera o valor
        inputQtd.focus();
        inputQtd.value = '';
        inputQtd.value = qtd.toString();
        inputQtd.dispatchEvent(new Event('input', { bubbles: true }));
        inputQtd.dispatchEvent(new Event('change', { bubbles: true }));

        // Clica no botão de comprar
        const botaoComprar = card.querySelector('button.catalog-item-b2b-button, button[class*="AddToCartButton"], button[class*="Button__info"]');
        if (!botaoComprar) return { sucesso: false, motivo: 'Botão COMPRAR não encontrado no item' };

        botaoComprar.click();
        return { sucesso: true };
      }, qtdNum);

      if (adicionou.sucesso) {
        await new Promise(r => setTimeout(r, 2000)); // Aguarda requisição da Mercos
      }

      return {
        sucesso: adicionou.sucesso,
        ean,
        quantidade: qtdNum,
        motivo: adicionou.motivo || 'Adicionado com sucesso no carrinho da Soton'
      };

    } catch (err) {
      return {
        sucesso: false,
        ean,
        quantidade: qtdNum,
        motivo: 'Erro na adição: ' + err.message
      };
    }
  }

  async fechar() {
    if (this.browser) {
      console.log('[SotonRobot] Fechando navegador...');
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

module.exports = { SotonRobot };
