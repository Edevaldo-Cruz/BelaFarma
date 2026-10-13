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
 * Robô Oficial de Cotação e Montagem de Pedidos Divimed (BelaPed)
 * Plataforma: ArtPedidoWeb (https://divimed.artpedidoweb.com.br/#/)
 * Pedido Mínimo: R$ 400,00 | Prazo padrão: 28 dias
 * Montagem: Produto por produto buscando pelo nome do produto
 */
class DivimedRobot {
  constructor(options = {}) {
    this.usuario = options.usuario || 'belafarmasul@gmail.com';
    this.senha = options.senha || '992240';
    this.headless = options.headless !== undefined ? options.headless : true;
    this.browser = null;
    this.page = null;
  }

  async iniciar() {
    const execPath = findChromeExecutable();
    console.log(`[DivimedRobot] Iniciando navegador Puppeteer (${execPath || 'default'})...`);
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

    // Otimização: desabilita imagens pesadas para acelerar a raspagem e cotação
    await this.page.setRequestInterception(true);
    this.page.on('request', (req) => {
      const type = req.resourceType();
      if (type === 'image' || type === 'media' || type === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });

    console.log('[DivimedRobot] Acessando autenticação da Divimed...');
    await this.page.goto('https://divimed.artpedidoweb.com.br/#/', {
      waitUntil: 'networkidle2',
      timeout: 45000
    });

    console.log('[DivimedRobot] Abrindo modal de login...');
    const btnTopo = await this.page.waitForSelector('button.btn-brand', { timeout: 15000 });
    await btnTopo.click();

    console.log('[DivimedRobot] Efetuando login...');
    await this.page.waitForSelector('#login-email', { timeout: 10000 });
    await this.page.click('#login-email');
    await this.page.type('#login-email', this.usuario, { delay: 10 });

    await this.page.waitForSelector('#login-senha', { timeout: 10000 });
    await this.page.click('#login-senha');
    await this.page.type('#login-senha', this.senha, { delay: 10 });

    await this.page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const entrarBtn = btns.filter(b => (b.innerText || '').trim().toLowerCase() === 'entrar').pop();
      if (entrarBtn) entrarBtn.click();
    });

    await this.page.waitForSelector('input.filtro-search-input', { timeout: 35000 });
    console.log('[DivimedRobot] Login na Divimed efetuado com sucesso!');
  }

  /**
   * Consulta cotação na Divimed pelo Nome do Produto (com validação por EAN e Palavras-chave)
   */
  async cotarEAN(ean, descricaoProduto = '') {
    if (!this.page) throw new Error('Robô Divimed não iniciado.');

    try {
      const eanLimpo = String(ean || '').trim();
      const termoNome = extrairTermoLimpo(descricaoProduto);

      if (!termoNome || termoNome.length < 2) {
        return {
          fornecedor: 'DIVIMED',
          ean: eanLimpo,
          disponivel: false,
          preco: null,
          mensagem: 'Descrição insuficiente para busca por nome'
        };
      }

      // Intercepta a resposta da API interna disparada pelo Angular
      const waitResponsePromise = this.page.waitForResponse(
        res => {
          if (!res.url().includes('/api/produto/comprar/all')) return false;
          const req = res.request();
          if (req.method() !== 'POST') return false;
          const postData = req.postData();
          if (!postData) return false;
          try {
            const parsed = JSON.parse(postData);
            return parsed.query === termoNome;
          } catch (_) {
            return false;
          }
        },
        { timeout: 14000 }
      ).catch(() => null);

      // Limpa input e digita o termo limpo
      await this.page.click('input.filtro-search-input');
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('KeyA');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');

      await this.page.type('input.filtro-search-input', termoNome, { delay: 15 });
      await new Promise(r => setTimeout(r, 400)); // Aguarda debounce
      await this.page.keyboard.press('Enter');

      const res = await waitResponsePromise;
      if (!res) {
        return {
          fornecedor: 'DIVIMED',
          ean: eanLimpo,
          disponivel: false,
          preco: null,
          mensagem: 'Sem resposta do catálogo Divimed'
        };
      }

      const data = await res.json().catch(() => ({}));
      const produtos = data.content || [];

      if (!produtos || produtos.length === 0) {
        return {
          fornecedor: 'DIVIMED',
          ean: eanLimpo,
          disponivel: false,
          preco: null,
          descricao: '',
          mensagem: 'Indisponível na Divimed'
        };
      }

      // 1. Prioriza correspondência exata por EAN (código de barra retornado na API da Divimed)
      let item = produtos.find(p => p.codigoBarra && p.codigoBarra.trim() === eanLimpo);

      // 2. Se não achou pelo código de barra exato, filtra por palavras-chave
      if (!item) {
        const palavras = termoNome.split(' ').filter(p => p.length >= 2);
        const compativeis = produtos.filter(p => {
          const nomeProd = (p.nome || '').toUpperCase();
          return palavras.every(palavra => nomeProd.includes(palavra));
        });
        if (compativeis.length > 0) {
          compativeis.sort((a, b) => {
            const prA = a.valorLiquido1 || a.valorLiquido || a.precoProduto || 999999;
            const prB = b.valorLiquido1 || b.valorLiquido || b.precoProduto || 999999;
            return prA - prB;
          });
          item = compativeis[0];
        }
      }

      if (!item) {
        return {
          fornecedor: 'DIVIMED',
          ean: eanLimpo,
          disponivel: false,
          preco: null,
          mensagem: 'Item compatível não localizado no catálogo'
        };
      }

      const precoFinal = item.valorLiquido1 || item.valorLiquido || item.precoProduto;
      const temEstoque = (item.estoqueQuantidade || 0) > 0;

      if (!temEstoque || !precoFinal || precoFinal <= 0) {
        return {
          fornecedor: 'DIVIMED',
          ean: eanLimpo,
          disponivel: false,
          preco: null,
          mensagem: 'Sem estoque na Divimed'
        };
      }

      return {
        fornecedor: 'DIVIMED',
        ean: eanLimpo,
        disponivel: true,
        preco: Number(Number(precoFinal).toFixed(2)),
        descricao: item.nome || '',
        produtoId: item.produtoId,
        urlProduto: 'https://divimed.artpedidoweb.com.br/#/comprar',
        mensagem: ''
      };

    } catch (err) {
      return {
        fornecedor: 'DIVIMED',
        ean,
        disponivel: false,
        preco: null,
        mensagem: 'Erro ao consultar item: ' + err.message
      };
    }
  }

  /**
   * Adiciona um produto ao carrinho da Divimed produto por produto
   */
  async adicionarAoCarrinho(ean, quantidade, descricaoProduto = '') {
    if (!this.page) throw new Error('Robô Divimed não iniciado.');
    const qtdNum = Math.max(1, parseInt(quantidade) || 1);

    try {
      const cotacao = await this.cotarEAN(ean, descricaoProduto);
      if (!cotacao.disponivel || !cotacao.produtoId) {
        return {
          sucesso: false,
          ean,
          quantidade: qtdNum,
          motivo: cotacao.mensagem || 'Produto não encontrado na Divimed'
        };
      }

      const produtoId = cotacao.produtoId;
      const selectorInput = `#qty-${produtoId}`;
      const inputFound = await this.page.waitForSelector(selectorInput, { timeout: 6000 }).catch(() => null);

      if (inputFound) {
        await this.page.click(selectorInput);
        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('KeyA');
        await this.page.keyboard.up('Control');
        await this.page.keyboard.press('Backspace');
        await this.page.type(selectorInput, String(qtdNum), { delay: 20 });
        await this.page.keyboard.press('Enter');
        await new Promise(r => setTimeout(r, 1200));

        return {
          sucesso: true,
          ean,
          produtoId,
          quantidade: qtdNum,
          motivo: 'Adicionado com sucesso no carrinho da Divimed'
        };
      } else {
        const added = await this.page.evaluate(async (pId, qtd) => {
          const inp = document.querySelector(`#qty-${pId}`);
          if (inp) {
            inp.value = String(qtd);
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          return false;
        }, produtoId, qtdNum);

        return {
          sucesso: added,
          ean,
          produtoId,
          quantidade: qtdNum,
          motivo: added ? 'Adicionado com sucesso no carrinho da Divimed' : 'Campo de quantidade não localizado'
        };
      }

    } catch (err) {
      return {
        sucesso: false,
        ean,
        quantidade: qtdNum,
        motivo: 'Erro na adição ao carrinho: ' + err.message
      };
    }
  }

  async fechar() {
    if (this.browser) {
      console.log('[DivimedRobot] Fechando navegador...');
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.page = null;
    }
  }
}

module.exports = { DivimedRobot, extrairTermoLimpo };
