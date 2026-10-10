const puppeteer = require('puppeteer');

/**
 * Módulo de Automação e Raspagem B2B da Profarma (BelaPed)
 * Realiza login e cotação de produtos por EAN em tempo real
 */
class ProfarmaRobot {
  constructor(options = {}) {
    this.usuario = options.usuario || '47378578000140';
    this.senha = options.senha || 'Primusdrogaria2022@';
    this.headless = options.headless !== undefined ? options.headless : true;
    this.browser = null;
    this.page = null;
  }

  async iniciar() {
    console.log('[ProfarmaRobot] Iniciando navegador Puppeteer...');
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
    await this.page.setViewport({ width: 1440, height: 900 });

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

    console.log('[ProfarmaRobot] Acessando tela de autenticação...');
    await this.page.goto('https://pedido.profarma.com.br/?callbackUrl=%2Fnovo-pedido', {
      waitUntil: 'networkidle2',
      timeout: 45000
    });

    console.log('[ProfarmaRobot] Efetuando login com CNPJ ' + this.usuario + '...');
    await this.page.waitForSelector('input#email', { timeout: 15000 });
    await this.page.type('input#email', this.usuario, { delay: 10 });
    await this.page.type('input#password', this.senha, { delay: 10 });
    await this.page.click('button[type="submit"]');

    // Aguarda o painel carregar a barra de busca
    const searchInputSel = 'input[placeholder="O que você está buscando?"]';
    await this.page.waitForSelector(searchInputSel, { timeout: 35000 });
    console.log('[ProfarmaRobot] Login realizado com sucesso no portal Profarma!');
  }

  /**
   * Consulta um único EAN na barra de busca do portal Profarma
   * Retorna { encontrado: boolean, ean, descricao, preco, descPct, fabricante }
   */
  async cotarEAN(ean) {
    if (!this.page) throw new Error('Robô não iniciado.');
    const searchInputSel = 'input[placeholder="O que você está buscando?"]';

    try {
      const eanLimpo = String(ean).trim();
      if (!eanLimpo) return { disponivel: false, preco: null, motivo: 'EAN_VAZIO' };

      // Limpa e preenche o campo de busca
      await this.page.focus(searchInputSel);
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('A');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');
      await this.page.type(searchInputSel, eanLimpo, { delay: 15 });

      // Clica na lupa verde de busca
      await this.page.evaluate((sel) => {
        const input = document.querySelector(sel);
        const container = input.closest('div').parentElement;
        const buttons = Array.from(container.querySelectorAll('button'));
        if (buttons.length > 0) buttons[0].click();
      }, searchInputSel);

      // Aguarda até sumir o aviso "Carregando produtos"
      await this.page.waitForFunction(() => !document.body.innerText.includes('Carregando produtos'), {
        timeout: 15000
      }).catch(() => {});

      // Pequena pausa para estabilização do DOM
      await new Promise(r => setTimeout(r, 600));

      // Extrai os dados do produto encontrado
      const dadosExtraidos = await this.page.evaluate((eanBuscado) => {
        const textoCompleto = document.body.innerText;

        if (textoCompleto.includes('Nenhum resultado')) {
          return { encontrado: false, motivo: 'SEM_ESTOQUE_OU_NAO_ENCONTRADO' };
        }

        const cellBlocks = Array.from(document.querySelectorAll('*'))
          .filter(el => (el.innerText || '').includes(eanBuscado) && el.children.length === 0);

        if (cellBlocks.length === 0) {
          return { encontrado: false, motivo: 'NAO_LOCALIZADO' };
        }

        let rowEl = cellBlocks[0];
        while (rowEl && rowEl.parentElement && rowEl.tagName !== 'TR' && !rowEl.className.includes('MuiDataGrid-row')) {
          if (rowEl.parentElement.innerText.includes(eanBuscado) && rowEl.parentElement.innerText.includes('%')) {
            rowEl = rowEl.parentElement;
            break;
          }
          rowEl = rowEl.parentElement;
        }

        const linhaTexto = rowEl ? rowEl.innerText : '';
        const partes = linhaTexto.split('\n').map(p => p.trim()).filter(Boolean);

        return {
          encontrado: true,
          partes
        };
      }, eanLimpo);

      if (!dadosExtraidos.encontrado) {
        return {
          fornecedor: 'PROFARMA',
          ean: eanLimpo,
          disponivel: false,
          preco: null,
          mensagem: dadosExtraidos.motivo || 'Indisponível na Profarma'
        };
      }

      // Processa as partes da linha para extrair Preço Final e Descrição
      const partes = dadosExtraidos.partes;
      let descricao = '';
      let precoFinal = null;
      let descPct = 0;
      let fabricante = '';

      for (let i = 0; i < partes.length; i++) {
        const p = partes[i];
        if (p === eanLimpo && i + 1 < partes.length) {
          descricao = partes[i + 1];
        }
        if (/^\d{1,4},\d{2}$/.test(p) && precoFinal === null) {
          precoFinal = parseFloat(p.replace(',', '.'));
        }
        if (/^\d{1,2}%$/.test(p) && descPct === 0) {
          descPct = parseFloat(p.replace('%', ''));
        }
      }

      return {
        fornecedor: 'PROFARMA',
        ean: eanLimpo,
        disponivel: precoFinal !== null,
        descricao: descricao || partes[1] || '',
        preco: precoFinal,
        descPct,
        fabricante,
        dataHora: new Date().toISOString()
      };

    } catch (err) {
      console.error(`[ProfarmaRobot] Erro ao cotar EAN ${ean}:`, err.message);
      return {
        fornecedor: 'PROFARMA',
        ean,
        disponivel: false,
        preco: null,
        erro: err.message
      };
    }
  }

  async fechar() {
    if (this.browser) {
      console.log('[ProfarmaRobot] Encerrando navegador...');
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.page = null;
    }
  }
}

module.exports = { ProfarmaRobot };
