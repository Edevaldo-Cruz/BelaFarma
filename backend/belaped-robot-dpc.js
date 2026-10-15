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
    try {
      await this.page.goto('https://cliente.dpcnet.com.br/?redirect=https%3A%2F%2Fdpcnet.com.br%2F', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
    } catch (e) {
      console.warn('[DpcRobot] Timeout na navegação da DPC, prosseguindo com domcontentloaded:', e.message);
    }

    console.log('[DpcRobot] Efetuando login...');
    await this.page.waitForSelector('input#email', { timeout: 25000 });
    await this.page.type('input#email', this.usuario, { delay: 10 });
    await this.page.type('input#password', this.senha, { delay: 10 });

    try {
      await Promise.all([
        this.page.click('button[type="submit"]'),
        this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 })
      ]);
    } catch (navErr) {
      console.warn('[DpcRobot] Aguardando estabilização pós-clique de login na DPC...');
      await new Promise(r => setTimeout(r, 4000));
    }

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
      await new Promise(r => setTimeout(r, 500));

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
          areaBusca.includes('Não localizamos nenhum resultado') ||
          areaBusca.includes('Sem estoque') ||
          areaBusca.includes('Indisponível') ||
          areaBusca.includes('indisponível') ||
          areaBusca.includes('Esgotado') ||
          areaBusca.includes('Avise-me')
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

      // 🛡️ VALIDAÇÃO ESTRITA SEMÂNTICA ANTI-ALUCINAÇÃO
      if (descricaoProduto && dados.descricao) {
        const checagem = validarCorrespondenciaProduto(descricaoProduto, dados.descricao);
        if (!checagem.valido) {
          console.warn(`[DpcRobot] ⛔ Rejeitando item incompatível retornado na DPC: esperado "${descricaoProduto}" vs encontrado "${dados.descricao}" (${checagem.motivo})`);
          return {
            fornecedor: 'DPC DISTRIBUIDORA',
            ean: eanLimpo,
            disponivel: false,
            preco: null,
            descricao: dados.descricao,
            mensagem: 'Produto divergente do catálogo na DPC'
          };
        }
      }

      return {
        fornecedor: 'DPC DISTRIBUIDORA',
        ean: eanLimpo,
        disponivel: true,
        descricao: dados.descricao || '',
        preco: dados.preco,
        urlProduto: urlBusca,
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

  /**
   * Adiciona um produto ao carrinho da DPC Distribuidora
   */
  async adicionarAoCarrinho(ean, quantidade, descricaoProduto = '') {
    if (!this.page) throw new Error('Robô DPC não iniciado.');
    const qtdNum = Math.max(1, parseInt(quantidade) || 1);

    try {
      const eanLimpo = String(ean || '').trim();
      const urlBusca = `https://dpcnet.com.br/catalogo?busca=${encodeURIComponent(eanLimpo)}&visualizacao=bloco-1&ordenacao=ordem-0`;
      await this.page.goto(urlBusca, { waitUntil: 'networkidle2', timeout: 25000 });
      await new Promise(r => setTimeout(r, 1000));

      const adicionou = await this.page.evaluate((qtd) => {
        const card = document.querySelector('.bloco-produto, .card-produto, [class*="produto"], .item') || document;
        const inputQtd = card.querySelector('input[type="number"], input[name*="qtd"], input[name*="quantidade"]');
        if (!inputQtd) return { sucesso: false, motivo: 'Campo de quantidade não localizado no produto' };

        inputQtd.focus();
        inputQtd.value = '';
        inputQtd.value = String(qtd);
        inputQtd.dispatchEvent(new Event('input', { bubbles: true }));
        inputQtd.dispatchEvent(new Event('change', { bubbles: true }));

        const btnComprar = card.querySelector('button[type="submit"], button.btn-success, button[class*="comprar"], button[class*="add"]');
        if (!btnComprar) return { sucesso: false, motivo: 'Botão de comprar não localizado' };

        btnComprar.click();
        return { sucesso: true };
      }, qtdNum);

      if (adicionou.sucesso) {
        await new Promise(r => setTimeout(r, 2000));
      }

      return {
        sucesso: adicionou.sucesso,
        ean,
        quantidade: qtdNum,
        motivo: adicionou.sucesso ? 'Adicionado com sucesso no carrinho da DPC' : adicionou.motivo
      };
    } catch (err) {
      return {
        sucesso: false,
        ean,
        quantidade: qtdNum,
        motivo: 'Erro ao adicionar item DPC: ' + err.message
      };
    }
  }

  /**
   * Conta quantos itens existem no carrinho da DPC
   * @returns {Promise<number>}
   */
  async contarItensCarrinho() {
    if (!this.page) throw new Error('Robô DPC não iniciado.');
    try {
      const qtdBadge = await this.page.evaluate(() => {
        const btnFloating = document.querySelector('.btn-floating-cart, [class*="floating-cart"], [class*="badge-cart"]');
        if (btnFloating) {
          const t = (btnFloating.innerText || '').trim();
          const m = t.match(/(\d+)/);
          if (m) return parseInt(m[1], 10);
        }
        return null;
      });

      if (qtdBadge !== null) return qtdBadge;

      await this.page.goto('https://dpcnet.com.br/checkout/review', {
        waitUntil: 'networkidle2',
        timeout: 25000
      });
      await new Promise(r => setTimeout(r, 1500));

      const qtdTela = await this.page.evaluate(() => {
        const bodyText = document.body.innerText || '';
        if (
          bodyText.includes('Seu carrinho está vazio') ||
          bodyText.includes('Nenhum produto no carrinho') ||
          bodyText.includes('0 produtos')
        ) {
          return 0;
        }

        const linhas = document.querySelectorAll('tr.item, .item-carrinho, [class*="cart-item"], [data-item-id]');
        if (linhas && linhas.length > 0) return linhas.length;

        const botoesRemover = document.querySelectorAll('a[href*="remover"], button[class*="remove"], [class*="delete"]');
        return botoesRemover ? botoesRemover.length : 0;
      });

      return qtdTela;
    } catch (err) {
      console.error('[DpcRobot] Erro ao contar itens no carrinho:', err.message);
      throw err;
    }
  }

  /**
   * Limpa o carrinho da DPC e confirma 0 itens
   * @returns {Promise<{ sucesso: boolean, itensRestantes: number }>}
   */
  async limparCarrinho() {
    if (!this.page) throw new Error('Robô DPC não iniciado.');
    try {
      let qtdInicial = await this.contarItensCarrinho();
      if (qtdInicial === 0) {
        console.log('[DpcRobot] Carrinho já está 100% vazio (0 itens).');
        return { sucesso: true, itensRestantes: 0 };
      }

      console.log(`[DpcRobot] Limpando carrinho com ${qtdInicial} itens...`);
      await this.page.goto('https://dpcnet.com.br/checkout/review', {
        waitUntil: 'networkidle2',
        timeout: 25000
      });
      await new Promise(r => setTimeout(r, 1500));

      const clicouGeral = await this.page.evaluate(() => {
        const botoes = Array.from(document.querySelectorAll('button, a'));
        const btnLimpar = botoes.find(b => {
          const t = (b.innerText || '').toLowerCase();
          return t.includes('esvaziar carrinho') || t.includes('limpar carrinho') || t.includes('excluir todos');
        });
        if (btnLimpar) {
          btnLimpar.click();
          return true;
        }
        return false;
      });

      if (clicouGeral) {
        await new Promise(r => setTimeout(r, 1200));
        await this.page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const btnConf = btns.find(b => ['sim', 'confirmar', 'esvaziar', 'ok'].includes((b.innerText || '').trim().toLowerCase()));
          if (btnConf) btnConf.click();
        });
        await new Promise(r => setTimeout(r, 2000));
      } else {
        let tentativas = 0;
        while (tentativas < 100) {
          tentativas++;
          const removeu = await this.page.evaluate(() => {
            const btn = document.querySelector('a[href*="remover"], button[class*="remove"], [class*="btn-remove"], [class*="delete"]');
            if (btn) {
              btn.click();
              return true;
            }
            return false;
          });

          if (!removeu) break;
          await new Promise(r => setTimeout(r, 800));

          await this.page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btnConf = btns.find(b => ['sim', 'confirmar', 'remover', 'ok'].includes((b.innerText || '').trim().toLowerCase()));
            if (btnConf) btnConf.click();
          });
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      await new Promise(r => setTimeout(r, 1500));
      const qtdFinal = await this.contarItensCarrinho();
      if (qtdFinal === 0) {
        console.log('[DpcRobot] ✅ Carrinho da DPC esvaziado com sucesso (0 itens).');
        return { sucesso: true, itensRestantes: 0 };
      } else {
        throw new Error(`Carrinho da DPC ainda possui ${qtdFinal} itens após tentativa de limpeza.`);
      }
    } catch (err) {
      console.error('[DpcRobot] Erro ao limpar carrinho:', err.message);
      throw err;
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
