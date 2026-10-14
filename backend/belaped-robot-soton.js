const puppeteer = require('puppeteer');
const fs = require('fs');

function findChromeExecutable() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Users\\User\\.cache\\puppeteer\\chrome\\win64-148.0.7778.97\\chrome-win64\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function extrairTermoLimpo(descricao) {
  if (!descricao) return '';
  let s = String(descricao).toUpperCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/P344\/98/g, ' ')
    .replace(/\b(\d+)\s*(MG|ML|MCG|G|GR)\b/g, '$1$2')
    .replace(/(\d+)GR\b/g, '$1G')
    .replace(/([A-Z])\./g, '$1 ')
    .replace(/[^A-Z0-9,.\s]/g, ' ');

  const stopWords = new Set([
    'C', 'COM', 'CPR', 'CPS', 'CP', 'COMP', 'CAPS', 'FR', 'SOL', 'AD', 'PED',
    'CLORID', 'CLORIDRATO', 'POTASS', 'POTASSICA', 'SOD', 'SODICO', 'SODICA',
    'FUMARATO', 'FUM', 'SULFATO', 'MALEATO', 'BESILATO', 'HEMITARTARATO',
    'GEN', 'GN', 'GENERICO', 'NEO', 'NEOQ', 'NOVA', 'QUIM', 'QUIMICA', 'CIMED',
    'MEDIX', 'BRASIL', 'UN', 'UNID', 'CX', 'PDA', 'POM', 'CR', 'CREME', 'FARMAX'
  ]);

  const tokens = s.split(/\s+/).filter(t => t.length >= 2 && !stopWords.has(t));
  return tokens.slice(0, 2).join(' ');
}

/**
 * Módulo de Automação e Raspagem B2B da Soton Farma (BelaPed)
 * Plataforma: Mercos / MeusPedidos (sotonfarma.meuspedidos.com.br)
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
    const execPath = findChromeExecutable();
    console.log(`[SotonRobot] Iniciando navegador Puppeteer (${execPath || 'default'})...`);
    this.browser = await puppeteer.launch({
      headless: this.headless,
      executablePath: execPath,
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
    try {
      await this.page.goto('https://sotonfarma.meuspedidos.com.br/entrar', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
    } catch (e) {
      console.warn('[SotonRobot] Timeout de rede inicial na Soton, prosseguindo com domcontentloaded:', e.message);
    }

    console.log('[SotonRobot] Efetuando login...');
    await this.page.waitForSelector('input#email', { timeout: 25000 });
    await this.page.type('input#email', this.usuario, { delay: 10 });
    await this.page.type('input#password', this.senha, { delay: 10 });

    try {
      await Promise.all([
        this.page.keyboard.press('Enter'),
        this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 })
      ]);
    } catch (navErr) {
      console.warn('[SotonRobot] Aguardando estabilização pós-login na Soton...');
      await new Promise(r => setTimeout(r, 4000));
    }

    console.log('[SotonRobot] Login na Soton efetuado com sucesso!');
  }

  async _buscarTermoNaSoton(termo) {
    const urlBusca = `https://sotonfarma.meuspedidos.com.br/?busca=${encodeURIComponent(termo)}`;
    await this.page.goto(urlBusca, { waitUntil: 'networkidle2', timeout: 25000 });
    await new Promise(r => setTimeout(r, 800));

    return await this.page.evaluate(() => {
      const bodyText = document.body.innerText || '';
      if (
        bodyText.includes('Nenhum resultado encontrado') ||
        bodyText.includes('Nenhum produto encontrado') ||
        bodyText.includes('não encontramos')
      ) {
        return [];
      }

      // Na Soton (MeusPedidos), os itens ficam entre "Resultados para" e "contato@sotonfarma"
      const idxInicio = bodyText.indexOf('Resultados para');
      const idxFim = bodyText.indexOf('contato@sotonfarma');
      const trecho = idxInicio >= 0
        ? bodyText.slice(idxInicio, idxFim > idxInicio ? idxFim : undefined)
        : bodyText;

      const linhas = trecho.split('\n').map(l => l.trim()).filter(Boolean);
      const encontrados = [];

      for (let i = 0; i < linhas.length; i++) {
        // Exemplo:
        // linhas[i-1]: "SORO FISIOLOGICO 500ML - FARMAX"
        // linhas[i]:   "Cód. 188 • UN"
        // linhas[i+1]: "R$ 4,79" (ou "Ops! Já vendemos todo o estoque.")
        if (linhas[i].startsWith('Cód.') && i > 0 && i + 1 < linhas.length) {
          const titulo = linhas[i - 1];
          const prox1 = linhas[i + 1] || '';
          const prox2 = linhas[i + 2] || '';

          if (prox1.includes('vendemos todo o estoque') || prox2.includes('vendemos todo o estoque')) {
            continue;
          }

          const linhaPreco = prox1.startsWith('R$') ? prox1 : (prox2.startsWith('R$') ? prox2 : '');
          if (linhaPreco && !linhaPreco.includes('shopping_cart')) {
            const num = parseFloat(linhaPreco.replace('R$', '').trim().replace(/\./g, '').replace(',', '.'));
            if (!isNaN(num) && num > 0) {
              encontrados.push({
                descricao: titulo,
                preco: num
              });
            }
          }
        }
      }

      return encontrados;
    });
  }

  /**
   * Consulta um EAN no catálogo da Soton Farma (com fallback por descrição pois o MeusPedidos nem sempre indexa EAN)
   */
  async cotarEAN(ean, descricaoProduto = '') {
    if (!this.page) throw new Error('Robô Soton não iniciado.');

    try {
      const eanLimpo = String(ean || '').trim();
      if (!eanLimpo) return { fornecedor: 'SOTON FARMA', disponivel: false, preco: null };

      // 1. Tenta pelo EAN
      let itens = await this._buscarTermoNaSoton(eanLimpo);

      // 2. Se não retornou pelo EAN e temos descrição, busca pelo termo limpo
      if (itens.length === 0 && descricaoProduto) {
        const termoNome = extrairTermoLimpo(descricaoProduto);
        if (termoNome && termoNome.length >= 4) {
          const palavras = termoNome.split(' ').filter(p => p.length >= 2);
          const todosNome = await this._buscarTermoNaSoton(termoNome);
          itens = todosNome.filter(it => {
            const descUp = (it.descricao || '').toUpperCase();
            return palavras.every(p => descUp.includes(p));
          });
        }
      }

      if (!itens || itens.length === 0) {
        return {
          fornecedor: 'SOTON FARMA',
          ean: eanLimpo,
          disponivel: false,
          preco: null,
          descricao: '',
          mensagem: 'Indisponível na Soton Farma'
        };
      }

      itens.sort((a, b) => a.preco - b.preco);
      const melhor = itens[0];

      return {
        fornecedor: 'SOTON FARMA',
        ean: eanLimpo,
        disponivel: true,
        preco: melhor.preco,
        descricao: melhor.descricao || '',
        mensagem: ''
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
  async adicionarAoCarrinho(ean, quantidade, descricaoProduto = '') {
    if (!this.page) throw new Error('Robô Soton não iniciado.');
    const qtdNum = Math.max(1, parseInt(quantidade) || 1);

    try {
      let urlBusca = `https://sotonfarma.meuspedidos.com.br/?busca=${encodeURIComponent(ean)}`;
      await this.page.goto(urlBusca, { waitUntil: 'networkidle2', timeout: 25000 });
      await new Promise(r => setTimeout(r, 1800));

      const semResultadoEan = await this.page.evaluate(() => {
        return (document.body.innerText || '').includes('Nenhum resultado encontrado');
      });

      if (semResultadoEan && descricaoProduto) {
        const termoNome = extrairTermoLimpo(descricaoProduto);
        if (termoNome) {
          urlBusca = `https://sotonfarma.meuspedidos.com.br/?busca=${encodeURIComponent(termoNome)}`;
          await this.page.goto(urlBusca, { waitUntil: 'networkidle2', timeout: 25000 });
          await new Promise(r => setTimeout(r, 1800));
        }
      }

      const adicionou = await this.page.evaluate(async (qtd) => {
        const card = document.querySelector('[class*="Catalog__card"]') || document;
        const inputQtd = card.querySelector('input[type="number"]');
        if (!inputQtd) return { sucesso: false, motivo: 'Campo de quantidade não encontrado no item' };

        inputQtd.focus();
        inputQtd.value = '';
        inputQtd.value = qtd.toString();
        inputQtd.dispatchEvent(new Event('input', { bubbles: true }));
        inputQtd.dispatchEvent(new Event('change', { bubbles: true }));

        const botaoComprar = card.querySelector('button.catalog-item-b2b-button, button[class*="AddToCartButton"], button[class*="Button__info"]');
        if (!botaoComprar) return { sucesso: false, motivo: 'Botão COMPRAR não encontrado no item' };

        botaoComprar.click();
        return { sucesso: true };
      }, qtdNum);

      if (adicionou.sucesso) {
        await new Promise(r => setTimeout(r, 2000));
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

  /**
   * Conta quantos itens existem no carrinho da Soton Farma
   * @returns {Promise<number>}
   */
  async contarItensCarrinho() {
    if (!this.page) throw new Error('Robô Soton não iniciado.');
    try {
      await this.page.goto('https://sotonfarma.meuspedidos.com.br/carrinho', {
        waitUntil: 'networkidle2',
        timeout: 25000
      });
      await new Promise(r => setTimeout(r, 1500));

      const qtd = await this.page.evaluate(() => {
        const bodyText = document.body.innerText || '';
        if (
          bodyText.includes('Seu carrinho está vazio') ||
          bodyText.includes('Nenhum item no carrinho') ||
          bodyText.includes('Carrinho vazio')
        ) {
          return 0;
        }

        const matchItens = bodyText.match(/(\d+)\s*ITEN[S]?/i) || bodyText.match(/(\d+)\s*ITEM/i);
        if (matchItens) {
          return parseInt(matchItens[1], 10);
        }

        const linhas = document.querySelectorAll('.b2b-checkout-item, [class*="CheckoutItem"], [class*="CartItem"], .cart-item');
        if (linhas && linhas.length > 0) {
          return linhas.length;
        }

        const badge = document.querySelector('[class*="badge"], [class*="CartButton"] span, [class*="counter"]');
        if (badge) {
          const num = parseInt(badge.innerText.trim(), 10);
          if (!isNaN(num)) return num;
        }

        return 0;
      });

      return qtd;
    } catch (err) {
      console.error('[SotonRobot] Erro ao contar itens no carrinho:', err.message);
      throw err;
    }
  }

  /**
   * Esvazia completamente o carrinho da Soton Farma e confirma 0 itens
   * @returns {Promise<{ sucesso: boolean, itensRestantes: number }>}
   */
  async limparCarrinho() {
    if (!this.page) throw new Error('Robô Soton não iniciado.');
    try {
      let qtdInicial = await this.contarItensCarrinho();
      if (qtdInicial === 0) {
        console.log('[SotonRobot] Carrinho já está 100% vazio (0 itens).');
        return { sucesso: true, itensRestantes: 0 };
      }

      console.log(`[SotonRobot] Limpando carrinho com ${qtdInicial} itens...`);

      const clicouExcluir = await this.page.evaluate(() => {
        const botoes = Array.from(document.querySelectorAll('button, a'));
        const btnExcluir = botoes.find(b => {
          const t = (b.innerText || '').toLowerCase();
          return t.includes('excluir carrinho') || t.includes('limpar carrinho') || t.includes('esvaziar carrinho');
        });
        if (btnExcluir) {
          btnExcluir.click();
          return true;
        }
        return false;
      });

      if (clicouExcluir) {
        await new Promise(r => setTimeout(r, 1200));
        await this.page.evaluate(() => {
          const botoesModal = Array.from(document.querySelectorAll('.modal button, [role="dialog"] button, button'));
          const btnConfirmar = botoesModal.find(b => {
            const t = (b.innerText || '').trim().toLowerCase();
            return t === 'excluir' || t === 'sim' || t === 'confirmar' || t === 'ok' || t.includes('excluir');
          });
          if (btnConfirmar) btnConfirmar.click();
        });
        await new Promise(r => setTimeout(r, 2000));
      } else {
        const botoesRemover = await this.page.evaluate(() => {
          const lixeiras = Array.from(document.querySelectorAll('button[class*="remove"], button[class*="delete"], [data-action*="remove"], a[class*="remove"]'));
          return lixeiras.length;
        });

        for (let i = 0; i < botoesRemover; i++) {
          await this.page.evaluate(() => {
            const btn = document.querySelector('button[class*="remove"], button[class*="delete"], [data-action*="remove"], a[class*="remove"]');
            if (btn) btn.click();
          });
          await new Promise(r => setTimeout(r, 800));
          await this.page.evaluate(() => {
            const b = Array.from(document.querySelectorAll('button')).find(btn => ['sim', 'excluir', 'confirmar'].includes(btn.innerText.trim().toLowerCase()));
            if (b) b.click();
          });
          await new Promise(r => setTimeout(r, 800));
        }
      }

      const qtdFinal = await this.contarItensCarrinho();
      if (qtdFinal === 0) {
        console.log('[SotonRobot] ✅ Carrinho da Soton esvaziado com sucesso (0 itens).');
        return { sucesso: true, itensRestantes: 0 };
      } else {
        throw new Error(`Carrinho da Soton ainda possui ${qtdFinal} itens após tentativa de limpeza.`);
      }
    } catch (err) {
      console.error('[SotonRobot] Erro ao limpar carrinho:', err.message);
      throw err;
    }
  }

  async fechar() {
    if (this.browser) {
      console.log('[SotonRobot] Fechando navegador...');
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.page = null;
    }
  }
}

module.exports = { SotonRobot };
