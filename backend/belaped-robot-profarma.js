const puppeteer = require('puppeteer');
const fs = require('fs');
const { validarCorrespondenciaProduto } = require('./belaped-validador.js');

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
        '--no-zygote',
        '--start-minimized'
      ]
    });

    this.page = await this.browser.newPage();
    try {
      const session = await this.page.target().createCDPSession();
      const { windowId } = await session.send('Browser.getWindowForTarget');
      await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
    } catch (e) {}
    await this.page.setViewport({ width: 1440, height: 900 });

    // Otimização: desabilita carregamento de imagens pesadas para acelerar a cotação
    await this.page.setRequestInterception(true);
    this.page.on('request', (req) => {
      const type = req.resourceType();
      if (type === 'image' || type === 'media') {
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

      // 1. Busca pelo EAN no portal
      let itens = await this._executarBuscaNoPortal(eanLimpo);

      // Filtro ESTRITO por EAN: só aceita se o EAN retornado coincidir exatamente com o pesquisado
      const eanDigitos = eanLimpo.replace(/\D/g, '');
      let itensCorrespondentes = itens.filter(it => {
        if (!it.ean) return false;
        const itDigitos = String(it.ean).replace(/\D/g, '');
        return itDigitos === eanDigitos ||
               (itDigitos.length >= 8 && eanDigitos.length >= 8 && (itDigitos.endsWith(eanDigitos) || eanDigitos.endsWith(itDigitos)));
      });

      if (!itensCorrespondentes || itensCorrespondentes.length === 0) {
        return {
          fornecedor: 'PROFARMA',
          ean: eanLimpo,
          disponivel: false,
          preco: null,
          mensagem: 'Sem estoque ou não encontrado na Profarma'
        };
      }

      // Ordena pelo menor preço disponível em estoque
      itensCorrespondentes.sort((a, b) => a.preco - b.preco);
      const melhor = itensCorrespondentes[0];

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

  /**
   * Adiciona um produto ao carrinho da Profarma
   */
  async adicionarAoCarrinho(ean, quantidade, descricaoProduto = '') {
    if (!this.page) throw new Error('Robô Profarma não iniciado.');
    const qtdNum = Math.max(1, parseInt(quantidade) || 1);

    try {
      const eanLimpo = String(ean || '').trim();
      const itens = await this._executarBuscaNoPortal(eanLimpo);
      if (!itens || itens.length === 0) {
        return {
          sucesso: false,
          ean: eanLimpo,
          quantidade: qtdNum,
          motivo: 'Produto indisponível ou não localizado na Profarma'
        };
      }

      if (descricaoProduto && itens[0]?.descricao) {
        const checagem = validarCorrespondenciaProduto(descricaoProduto, itens[0].descricao);
        if (!checagem.valido) {
          console.warn(`[ProfarmaRobot] ⛔ Rejeitando adição ao carrinho Profarma: esperado "${descricaoProduto}" vs encontrado "${itens[0].descricao}" (${checagem.motivo})`);
          return {
            sucesso: false,
            ean: eanLimpo,
            quantidade: qtdNum,
            motivo: `Incompatível no portal Profarma: ${checagem.motivo}`
          };
        }
      }

      // Localiza o input do produto (que não seja a barra de busca principal)
      const inputElement = await this.page.$('input.MuiOutlinedInput-input:not([placeholder*="buscando"])');
      if (!inputElement) {
        return {
          sucesso: false,
          ean: eanLimpo,
          quantidade: qtdNum,
          motivo: 'Campo de quantidade não encontrado na tabela de produtos da Profarma'
        };
      }

      // Foca, limpa e digita a quantidade desejada + Enter para submeter imediatamente
      await inputElement.click({ clickCount: 3 });
      await this.page.keyboard.press('Backspace');
      await inputElement.type(String(qtdNum));
      await this.page.keyboard.press('Enter');

      await new Promise(r => setTimeout(r, 1800));

      console.log(`[ProfarmaRobot] ✅ EAN ${eanLimpo} - ${qtdNum} un adicionado com sucesso via Enter no input!`);
      return {
        sucesso: true,
        ean: eanLimpo,
        quantidade: qtdNum,
        motivo: 'Adicionado com sucesso no carrinho da Profarma'
      };
    } catch (err) {
      return {
        sucesso: false,
        ean,
        quantidade: qtdNum,
        motivo: 'Erro ao adicionar item Profarma: ' + err.message
      };
    }
  }

  /**
   * Importa um lote de produtos no carrinho via modal/arquivo CSV oficial da Profarma
   * Cabeçalho obrigatório: "Codigo/EAN;Quantidade"
   * @param {string} caminhoArquivo
   * @returns {Promise<{ sucesso: boolean, totalItens?: number, detalhes?: any }>}
   */
  async importarCarrinhoArquivo(caminhoArquivo) {
    if (!this.page) throw new Error('Robô Profarma não iniciado.');

    try {
      console.log('[ProfarmaRobot] Abrindo modal de importação...');
      await this.page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => (b.innerText || '').trim() === 'Importação');
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 2000));

      const inputFile = await this.page.$('input[type="file"]');
      if (!inputFile) {
        throw new Error('Campo input[type="file"] não encontrado na tela da Profarma.');
      }

      console.log(`[ProfarmaRobot] Anexando arquivo ${caminhoArquivo}...`);
      await inputFile.uploadFile(caminhoArquivo);
      await new Promise(r => setTimeout(r, 2500));

      console.log('[ProfarmaRobot] Clicando em ENVIAR para processar importação...');
      let importResult = null;
      const respPromise = new Promise(resolve => {
        const handler = async res => {
          if (res.url().includes('import-order-file')) {
            try {
              const json = await res.json();
              resolve(json);
            } catch (e) {
              resolve(null);
            }
          }
        };
        this.page.on('response', handler);
        setTimeout(() => resolve(null), 15000);
      });

      await this.page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btnEnviar = btns.find(b => (b.innerText || '').trim().toUpperCase() === 'ENVIAR');
        if (btnEnviar) btnEnviar.click();
      });

      importResult = await respPromise;
      await new Promise(r => setTimeout(r, 3000));

      if (importResult && importResult.status === 'SUCCESS') {
        const qtdSucesso = (importResult.dados && importResult.dados.successItems) ? importResult.dados.successItems.length : 0;
        console.log(`[ProfarmaRobot] ✅ Importação concluída com sucesso: ${qtdSucesso} itens importados!`);
        return {
          sucesso: true,
          totalItens: qtdSucesso,
          detalhes: importResult.dados
        };
      } else {
        const msg = importResult?.message || 'Falha desconhecida no retorno da importação da Profarma';
        console.warn(`[ProfarmaRobot] ⚠️ Retorno da importação: ${msg}`);
        return {
          sucesso: false,
          motivo: msg,
          detalhes: importResult
        };
      }
    } catch (err) {
      console.error('[ProfarmaRobot] Erro ao importar carrinho via arquivo:', err.message);
      throw err;
    }
  }

  /**
   * Conta quantos itens existem no carrinho da Profarma
   * @returns {Promise<number>}
   */
  async contarItensCarrinho() {
    if (!this.page) throw new Error('Robô Profarma não iniciado.');
    try {
      const qtd = await this.page.evaluate(() => {
        // 1. Procura especificamente o botão do carrinho de compras
        const btnCart = document.querySelector('button[aria-label="Abrir Carrinho de Compras"], button[aria-label*="Carrinho" i]');
        if (btnCart) {
          const t = (btnCart.innerText || '').trim();
          // Se o texto for "R$ 0,00" ou "0\n\nR$ 0,00", está vazio
          if (t === 'R$ 0,00' || t.includes('0,00') && !t.match(/R\$\s*[1-9]/)) {
            return 0;
          }

          // Se tem valor monetário diferente de 0, tenta ler a badge ou deduzir
          const m = t.match(/^(\d+)\s*(?:\n+|\s+)*R\$/i);
          if (m) return parseInt(m[1], 10);

          const badge = btnCart.querySelector('[class*="MuiBadge-badge"]');
          if (badge && badge.innerText.trim()) {
            const num = parseInt(badge.innerText.trim(), 10);
            if (!isNaN(num)) return num;
          }

          // Se há valor em R$ maior que zero, tem ao menos 1 item
          if (t.includes('R$')) return 1;
        }

        // Se estiver na tela de /carrinho-compras, lê o total de itens
        const corpo = document.body ? document.body.innerText : '';
        const mTotal = corpo.match(/Total\s*\(\s*(\d+)\s*itens?\s*\)/i);
        if (mTotal) {
          return parseInt(mTotal[1], 10);
        }

        if (corpo.includes('Carrinho de compras atualizado!\nTotal (0 itens)') || corpo.includes('Total (0 itens)')) {
          return 0;
        }

        return 0;
      });

      return qtd;
    } catch (err) {
      console.error('[ProfarmaRobot] Erro ao contar itens no carrinho:', err.message);
      throw err;
    }
  }

  /**
   * Limpa o carrinho da Profarma e confirma 0 itens
   * @returns {Promise<{ sucesso: boolean, itensRestantes: number }>}
   */
  async limparCarrinho() {
    if (!this.page) throw new Error('Robô Profarma não iniciado.');
    try {
      let qtdInicial = await this.contarItensCarrinho();
      if (qtdInicial === 0) {
        console.log('[ProfarmaRobot] Carrinho já está 100% vazio (0 itens / R$ 0,00).');
        return { sucesso: true, itensRestantes: 0 };
      }

      console.log(`[ProfarmaRobot] Limpando carrinho com itens... Acessando /carrinho-compras...`);
      await this.page.goto('https://pedido.profarma.com.br/carrinho-compras', { waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));

      let tentativas = 0;
      while (tentativas < 50) {
        tentativas++;
        // Procura os botões de Menos (-) que decrementam/removem os itens
        const clicouMenos = await this.page.evaluate(() => {
          const botoes = Array.from(document.querySelectorAll('button'));
          const btnMenos = botoes.find(b => {
            const path = b.querySelector('svg path');
            return path && path.getAttribute('d') && path.getAttribute('d').includes('104.11');
          });
          if (btnMenos) {
            btnMenos.click();
            return true;
          }
          return false;
        });

        if (!clicouMenos) break;
        await new Promise(r => setTimeout(r, 1200));

        // Confirma modal de diálogo caso apareça
        await this.page.evaluate(() => {
          const dialog = document.querySelector('[role="dialog"]');
          if (dialog) {
            const btns = Array.from(dialog.querySelectorAll('button'));
            const btnConf = btns.find(b => ['sim', 'confirmar', 'excluir', 'remover', 'ok'].includes((b.innerText || '').trim().toLowerCase()));
            if (btnConf) btnConf.click();
          }
        });

        await new Promise(r => setTimeout(r, 800));

        // Verifica se já zerou
        const zerou = await this.page.evaluate(() => {
          const t = document.body ? document.body.innerText : '';
          return t.includes('Total (0 itens)') || t.includes('Carrinho vazio');
        });
        if (zerou) break;
      }

      // Volta para a tela de novo pedido
      await this.page.goto('https://pedido.profarma.com.br/novo-pedido', { waitUntil: 'networkidle2', timeout: 25000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 1500));

      const qtdFinal = await this.contarItensCarrinho();
      if (qtdFinal === 0) {
        console.log('[ProfarmaRobot] ✅ Carrinho da Profarma esvaziado com sucesso (0 itens).');
        return { sucesso: true, itensRestantes: 0 };
      } else {
        throw new Error(`Carrinho da Profarma ainda possui ${qtdFinal} itens após tentativa de limpeza.`);
      }
    } catch (err) {
      console.error('[ProfarmaRobot] Erro ao limpar carrinho:', err.message);
      throw err;
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
