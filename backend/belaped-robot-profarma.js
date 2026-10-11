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
    'MEDIX', 'BRASIL', 'UN', 'UNID', 'CX', 'PDA', 'POM', 'CR', 'CREME'
  ]);

  const tokens = s.split(/\s+/).filter(t => t.length >= 2 && !stopWords.has(t));
  return tokens.slice(0, 2).join(' ');
}

/**
 * Módulo de Automação e Raspagem B2B da Profarma (BelaPed)
 * Realiza login e cotação de produtos por EAN (com fallback inteligente por nome/dosagem)
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
    const execPath = findChromeExecutable();
    console.log(`[ProfarmaRobot] Iniciando navegador Puppeteer (${execPath || 'default'})...`);
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

  async _executarBuscaNoPortal(termo) {
    const searchInputSel = 'input[placeholder="O que você está buscando?"]';
    await this.page.waitForSelector(searchInputSel, { timeout: 10000 });

    // Limpa o input com clique triplo + Backspace + Ctrl+A
    await this.page.click(searchInputSel, { clickCount: 3 });
    await this.page.keyboard.press('Backspace');
    await this.page.keyboard.down('Control');
    await this.page.keyboard.press('A');
    await this.page.keyboard.up('Control');
    await this.page.keyboard.press('Backspace');

    await this.page.type(searchInputSel, termo, { delay: 15 });

    // Clica especificamente no botão verde de busca (MuiButton-containedSuccess) ou último botão do container
    await this.page.evaluate((sel) => {
      const btnVerde = document.querySelector('button.MuiButton-containedSuccess');
      if (btnVerde) {
        btnVerde.click();
        return;
      }
      const input = document.querySelector(sel);
      if (input) {
        const container = input.closest('div').parentElement;
        const buttons = Array.from(container.querySelectorAll('button'));
        if (buttons.length > 0) buttons[buttons.length - 1].click();
      }
    }, searchInputSel);

    // Pequena espera para iniciar o estado de carregamento
    await new Promise(r => setTimeout(r, 400));

    // Aguarda finalizar "Carregando produtos"
    await this.page.waitForFunction(() => !document.body.innerText.includes('Carregando produtos'), {
      timeout: 15000
    }).catch(() => {});

    await new Promise(r => setTimeout(r, 600));

    // Extrai linhas da tabela de resultados da Profarma
    return await this.page.evaluate(() => {
      const texto = document.body.innerText || '';
      if (texto.includes('Nenhum resultado')) {
        return [];
      }

      // Na Profarma (modo LISTA), os itens vêm após o cabeçalho "Importado"
      const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
      const resultados = [];

      for (let i = 0; i < linhas.length; i++) {
        // Procura um EAN de 8 a 14 dígitos
        if (/^\d{8,14}$/.test(linhas[i]) && i + 4 < linhas.length) {
          const eanLinha = linhas[i];
          const descLinha = linhas[i + 1] || '';
          const bloco = linhas.slice(i, i + 12);
          const semEstoque = bloco.some(b => b.toUpperCase().includes('AVISE-ME') || b.toUpperCase().includes('INDISPON'));

          let preco = null;
          let descPct = 0;

          for (let j = i + 2; j < Math.min(i + 8, linhas.length); j++) {
            const valStr = linhas[j];
            if (/^\d{1,4},\d{2}$/.test(valStr) && preco === null) {
              preco = parseFloat(valStr.replace('.', '').replace(',', '.'));
            } else if (/^\d{1,2}(\.\d+)?%$/.test(valStr) && descPct === 0) {
              descPct = parseFloat(valStr.replace('%', ''));
            }
          }

          if (preco !== null && preco > 0 && !semEstoque) {
            resultados.push({
              ean: eanLinha,
              descricao: descLinha,
              preco,
              descPct
            });
          }
        }
      }

      return resultados;
    });
  }

  /**
   * Consulta um EAN na Profarma (com fallback pelo nome/dosagem quando for genérico/similar de outro laboratório)
   */
  async cotarEAN(ean, descricaoProduto = '') {
    if (!this.page) throw new Error('Robô não iniciado.');

    try {
      const eanLimpo = String(ean || '').trim();
      if (!eanLimpo) return { fornecedor: 'PROFARMA', disponivel: false, preco: null, motivo: 'EAN_VAZIO' };

      // 1. Tenta busca exata pelo EAN
      let itens = await this._executarBuscaNoPortal(eanLimpo);

      // 2. Se não encontrou pelo EAN e temos a descrição do produto, tenta busca pelo nome/dosagem
      if (itens.length === 0 && descricaoProduto) {
        const termoNome = extrairTermoLimpo(descricaoProduto);
        if (termoNome && termoNome.length >= 4) {
          const primeiraPalavra = termoNome.split(' ')[0];
          const todosNome = await this._executarBuscaNoPortal(termoNome);
          itens = todosNome.filter(it => it.descricao.toUpperCase().includes(primeiraPalavra));
        }
      }

      if (!itens || itens.length === 0) {
        return {
          fornecedor: 'PROFARMA',
          ean: eanLimpo,
          disponivel: false,
          preco: null,
          mensagem: 'Indisponível na Profarma'
        };
      }

      // Ordena pelo menor preço disponível em estoque
      itens.sort((a, b) => a.preco - b.preco);
      const melhor = itens[0];

      return {
        fornecedor: 'PROFARMA',
        ean: eanLimpo,
        eanEncontrado: melhor.ean,
        disponivel: true,
        descricao: melhor.descricao,
        preco: melhor.preco,
        descPct: melhor.descPct || 0,
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
