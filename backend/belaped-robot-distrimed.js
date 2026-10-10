const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * Módulo de Automação e Raspagem B2B da Distrimed (BelaPed)
 * Plataforma: Inovação Distrimed (inovacao.distrimed.com.br)
 * Funções:
 * 1. Login automatizado
 * 2. Cotação de produtos por EAN
 * 3. Importação robótica de pedidos via Modal (upload de arquivo ou preenchimento de itens)
 */
class DistrimedRobot {
  constructor(options = {}) {
    this.usuario = options.usuario || 'bela farma sul';
    this.senha = options.senha || 'Bfs@882494';
    this.headless = options.headless !== undefined ? options.headless : true;
    this.browser = null;
    this.page = null;
  }

  async iniciar() {
    console.log('[DistrimedRobot] Iniciando navegador Puppeteer...');
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

    console.log('[DistrimedRobot] Acessando autenticação da Distrimed...');
    await this.page.goto('https://inovacao.distrimed.com.br/login?referencia=/produtos', {
      waitUntil: 'networkidle2',
      timeout: 45000
    });

    console.log('[DistrimedRobot] Efetuando login...');
    await this.page.waitForSelector('input[name="usuario"]', { timeout: 15000 });
    await this.page.type('input[name="usuario"]', this.usuario, { delay: 10 });
    await this.page.type('input[name="senha"]', this.senha, { delay: 10 });

    await this.page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('Entrar'));
      if (btn) btn.click();
    });

    await new Promise(r => setTimeout(r, 6000));

    if (!this.page.url().includes('/produtos')) {
      await this.page.goto('https://inovacao.distrimed.com.br/produtos', {
        waitUntil: 'networkidle2',
        timeout: 35000
      });
    }

    console.log('[DistrimedRobot] Login efetuado com sucesso!');

    // Garante que a condição comercial PADRÃO seja ativada
    await this.ativarCondicaoPadrao();
  }

  /**
   * Garante que a condição comercial PADRÃO está ativa para exibição de preços
   */
  async ativarCondicaoPadrao() {
    try {
      const condicaoAtual = await this.page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('sell'));
        return btn ? btn.innerText : '';
      });

      if (condicaoAtual.includes('Nenhuma')) {
        console.log('[DistrimedRobot] Ativando condição comercial PADRÃO...');
        await this.page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('sell'));
          if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 1500));

        await this.page.evaluate(() => {
          const li = Array.from(document.querySelectorAll('li, div, button')).find(el => (el.innerText || '').trim() === 'PADRÃO');
          if (li) li.click();
        });
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (e) {
      console.warn('[DistrimedRobot] Aviso ao ajustar condição de preço:', e.message);
    }
  }

  /**
   * Consulta um único EAN no catálogo da Distrimed
   */
  async cotarEAN(ean) {
    if (!this.page) throw new Error('Robô Distrimed não iniciado.');

    try {
      const searchSel = 'input[placeholder*="Pesquise por: produtos"]';
      await this.page.waitForSelector(searchSel, { timeout: 15000 });

      // Limpa e digita o EAN
      await this.page.click(searchSel);
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('A');
      await this.page.keyboard.up('Control');
      await page.keyboard.press('Backspace');

      await this.page.type(searchSel, ean, { delay: 15 });

      await this.page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('Buscar'));
        if (btn) btn.click();
      });

      await new Promise(r => setTimeout(r, 3000));

      const dados = await this.page.evaluate(() => {
        const bodyText = document.body.innerText || '';
        if (bodyText.includes('Nenhum produto') || bodyText.includes('não encontrado')) {
          return { disponivel: false, motivo: 'Nenhum produto retornado na busca' };
        }

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

        let titulo = '';
        const titulos = Array.from(document.querySelectorAll('h1, h2, h3, h4, [class*="title"], p'))
          .map(el => (el.innerText || '').trim())
          .filter(t => t.length > 5 && !t.includes('R$') && !t.includes('Buscar') && !t.includes('Menu'));
        if (titulos.length > 0) {
          titulo = titulos[0];
        }

        return {
          disponivel: menorPreco < Infinity,
          preco: menorPreco < Infinity ? menorPreco : null,
          descricao: titulo
        };
      });

      return {
        fornecedor: 'DISTRIMED',
        ean,
        disponivel: dados.disponivel,
        preco: dados.preco,
        descricao: dados.descricao || '',
        mensagem: dados.motivo || ''
      };

    } catch (err) {
      return {
        fornecedor: 'DISTRIMED',
        ean,
        disponivel: false,
        preco: null,
        mensagem: 'Erro ao consultar item: ' + err.message
      };
    }
  }

  /**
   * Importa pedido no carrinho da Distrimed via Modal
   * Faz o upload do arquivo CSV/Excel gerado ou preenche diretamente
   */
  async importarCarrinhoArquivo(caminhoArquivo) {
    if (!this.page) throw new Error('Robô Distrimed não iniciado.');

    try {
      console.log('[DistrimedRobot] Abrindo modal de importação...');
      await this.page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button, a')).find(b => (b.innerText || '').includes('Importar'));
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 2000));

      // Etapa 1: Confirmação da condição comercial
      console.log('[DistrimedRobot] Confirmando condição de preço na modal...');
      await this.page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('Confirmar'));
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 2500));

      // Etapa 2: Upload do arquivo na modal
      console.log(`[DistrimedRobot] Anexando arquivo ${caminhoArquivo}...`);
      const inputFile = await this.page.$('input[type="file"]');
      if (!inputFile) {
        throw new Error('Campo input[type="file"] não encontrado na modal da Distrimed.');
      }

      await inputFile.uploadFile(caminhoArquivo);
      await new Promise(r => setTimeout(r, 2000));

      // Clica em Confirmar da etapa 2 para finalizar a importação
      console.log('[DistrimedRobot] Submetendo importação na modal...');
      await this.page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button')).filter(b => (b.innerText || '').includes('Confirmar'));
        const ultimoBtnConfirmar = btns[btns.length - 1];
        if (ultimoBtnConfirmar) ultimoBtnConfirmar.click();
      });

      await new Promise(r => setTimeout(r, 4000));

      return {
        sucesso: true,
        mensagem: 'Arquivo importado com sucesso na modal da Distrimed!'
      };

    } catch (err) {
      console.error('[DistrimedRobot] Erro ao importar carrinho na modal:', err.message);
      return {
        sucesso: false,
        motivo: err.message
      };
    }
  }

  async fechar() {
    if (this.browser) {
      console.log('[DistrimedRobot] Fechando navegador...');
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

module.exports = { DistrimedRobot };
