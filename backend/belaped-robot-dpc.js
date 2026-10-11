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
    const execPath = findChromeExecutable();
    console.log(`[DpcRobot] Iniciando navegador Puppeteer (${execPath || 'default'})...`);
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
   * Consulta um EAN no catálogo da DPC
   */
  async cotarEAN(ean, descricaoProduto = '') {
    if (!this.page) throw new Error('Robô DPC não iniciado.');

    try {
      const eanLimpo = String(ean || '').trim();
      if (!eanLimpo) return { fornecedor: 'DPC DISTRIBUIDORA', disponivel: false, preco: null, motivo: 'EAN_VAZIO' };

      const urlBusca = `https://dpcnet.com.br/catalogo?busca=${encodeURIComponent(eanLimpo)}&visualizacao=bloco-1&ordenacao=ordem-0`;
      await this.page.goto(urlBusca, { waitUntil: 'networkidle2', timeout: 25000 });
      await new Promise(r => setTimeout(r, 900));

      const dados = await this.page.evaluate(() => {
        const bodyText = document.body.innerText || '';
        const idxIni = bodyText.indexOf('Resultado da Busca:');
        const idxFim = bodyText.indexOf('Empresa especializada na distribuição');
        const areaBusca = idxIni >= 0
          ? bodyText.slice(idxIni, idxFim > idxIni ? idxFim : undefined)
          : '';

        if (
          !areaBusca ||
          areaBusca.includes('Foram encontrados 0 produtos') ||
          areaBusca.includes('Não localizamos nenhum resultado')
        ) {
          return { encontrado: false };
        }

        const linhas = areaBusca.split('\n').map(l => l.trim()).filter(Boolean);
        // Estrutura típica no bloco da DPC:
        // "Emb.: 1 unidade"
        // "Gel Fixador Ny Looks 240g Azul"
        // "R$ 8,71"
        // "Info"
        let descricao = '';
        let precoUnit = null;
        let fatorEmbalagem = 1;

        for (let i = 0; i < linhas.length; i++) {
          const l = linhas[i];
          if (l.startsWith('Emb.:')) {
            const matchQtd = l.match(/(\d+)/);
            if (matchQtd) {
              const n = parseInt(matchQtd[1], 10);
              if (n > 1) fatorEmbalagem = n;
            }
            if (i + 1 < linhas.length) {
              descricao = linhas[i + 1];
            }
          } else if (/^R\$\s*[\d.,]+$/.test(l) && precoUnit === null) {
            const num = parseFloat(l.replace('R$', '').trim().replace(/\./g, '').replace(',', '.'));
            if (!isNaN(num) && num > 0) {
              precoUnit = fatorEmbalagem > 1 ? Number((num / fatorEmbalagem).toFixed(2)) : num;
              break;
            }
          }
        }

        return {
          encontrado: precoUnit !== null && precoUnit > 0,
          preco: precoUnit,
          descricao
        };
      });

      if (!dados.encontrado || !dados.preco) {
        return {
          fornecedor: 'DPC DISTRIBUIDORA',
          ean: eanLimpo,
          disponivel: false,
          preco: null,
          mensagem: 'Indisponível na DPC'
        };
      }

      return {
        fornecedor: 'DPC DISTRIBUIDORA',
        ean: eanLimpo,
        disponivel: true,
        descricao: dados.descricao || '',
        preco: dados.preco,
        dataHora: new Date().toISOString()
      };

    } catch (err) {
      console.error(`[DpcRobot] Erro ao cotar EAN ${ean}:`, err.message);
      return {
        fornecedor: 'DPC DISTRIBUIDORA',
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
