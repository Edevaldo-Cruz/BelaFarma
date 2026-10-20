const puppeteer = require('puppeteer');
const fs = require('fs');
const farmacoMatcher = require('./belaped-farmaco-matcher.js');
const motorEssencia = require('./belaped-motor-essencia.js');

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
      protocolTimeout: 180000,
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
    if (!this.headless) {
      try {
        const session = await this.page.target().createCDPSession();
        const { windowId } = await session.send('Browser.getWindowForTarget');
        await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
      } catch (e) {}
    }
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
   * Executa busca de produtos na API do catálogo da Divimed
   */
  async _buscarProdutosDivimed(termo) {
    if (!this.page || !termo) return [];
    try {
      const waitResponsePromise = this.page.waitForResponse(
        res => {
          if (!res.url().includes('/api/produto/comprar/all')) return false;
          const req = res.request();
          if (req.method() !== 'POST') return false;
          const postData = req.postData();
          if (!postData) return false;
          try {
            const parsed = JSON.parse(postData);
            return parsed.query === termo;
          } catch (_) {
            return false;
          }
        },
        { timeout: 12000 }
      ).catch(() => null);

      await this.page.click('input.filtro-search-input');
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('KeyA');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');

      await this.page.type('input.filtro-search-input', termo, { delay: 15 });
      await new Promise(r => setTimeout(r, 400));
      await this.page.keyboard.press('Enter');

      const res = await waitResponsePromise;
      if (!res) return [];

      const data = await res.json().catch(() => ({}));
      const produtos = data.content || [];

      return produtos.map(p => ({
        ean: p.codigoBarra ? String(p.codigoBarra).trim() : null,
        descricao: p.nome || '',
        preco: Number(p.valorLiquido1 || p.valorLiquido || p.precoProduto || 0),
        estoque: p.estoqueQuantidade || 0,
        produtoId: p.produtoId
      })).filter(p => p.preco > 0 && p.estoque > 0);
    } catch (e) {
      console.warn('[DivimedRobot] Erro ao buscar produtos:', e.message);
      return [];
    }
  }

  /**
   * Consulta um EAN no catálogo da Divimed com busca por essência e menor preço
   */
  async cotarEAN(ean, descricaoProduto = '', opts = {}) {
    if (!this.page) throw new Error('Robô Divimed não iniciado.');

    try {
      const eanLimpo = String(ean || '').trim();
      if (!eanLimpo) return { fornecedor: 'DIVIMED', disponivel: false, preco: null, motivo: 'EAN_VAZIO' };

      const eanDigitos = eanLimpo.replace(/\D/g, '');
      const termoNome = extrairTermoLimpo(descricaoProduto);

      // 1. Busca inicial por termo limpo da descrição no portal da Divimed (se houver)
      let itensOriginais = termoNome ? await this._buscarProdutosDivimed(termoNome) : [];
      let itensCorrespondentes = (itensOriginais || []).filter(it => {
        if (!it.ean) return false;
        const codLimpo = String(it.ean).replace(/\D/g, '');
        const bateEan = codLimpo === eanDigitos ||
                       (codLimpo.length === 14 && eanDigitos.length === 13 && codLimpo === '0' + eanDigitos) ||
                       (eanDigitos.length === 14 && codLimpo.length === 13 && eanDigitos === '0' + codLimpo);
        return bateEan;
      });

      // Fallback: Se a busca por descrição não retornou resultados ou se a descrição não foi informada
      // ou não encontrou o EAN correspondente, executa busca direta pelos dígitos do EAN no input da Divimed
      if ((!termoNome || itensOriginais.length === 0 || itensCorrespondentes.length === 0) && eanDigitos) {
        try {
          const itensEan = await this._buscarProdutosDivimed(eanDigitos);
          if (itensEan && itensEan.length > 0) {
            for (const it of itensEan) {
              if (!itensOriginais.some(existente => existente.produtoId === it.produtoId)) {
                itensOriginais.push(it);
              }
            }
            itensCorrespondentes = (itensOriginais || []).filter(it => {
              if (!it.ean) return false;
              const codLimpo = String(it.ean).replace(/\D/g, '');
              const bateEan = codLimpo === eanDigitos ||
                             (codLimpo.length === 14 && eanDigitos.length === 13 && codLimpo === '0' + eanDigitos) ||
                             (eanDigitos.length === 14 && codLimpo.length === 13 && eanDigitos === '0' + codLimpo);
              return bateEan;
            });
          }
        } catch (eFallback) {
          console.warn('[DivimedRobot] Aviso na busca fallback por EAN:', eFallback.message);
        }
      }

      let melhorEanOriginal = null;
      if (itensCorrespondentes && itensCorrespondentes.length > 0) {
        itensCorrespondentes.sort((a, b) => a.preco - b.preco);
        melhorEanOriginal = itensCorrespondentes[0];
      }

      // 2. Busca por Essência (Menor Preço Geral) - Ativada por padrão
      const cotarPorEssencia = opts.cotarPorEssencia !== false && Boolean(descricaoProduto);
      let todosCandidatos = [...itensCorrespondentes];

      if (cotarPorEssencia) {
        try {
          const prep = motorEssencia.prepararBuscaEssencia(eanLimpo, descricaoProduto);
          if (prep.termoBusca && prep.termoBusca !== termoNome && prep.termoBusca.length >= 3) {
            const itensEssencia = await this._buscarProdutosDivimed(prep.termoBusca);
            for (const it of (itensEssencia || [])) {
              if (!todosCandidatos.some(existente => existente.produtoId === it.produtoId)) {
                todosCandidatos.push(it);
              }
            }
          }
        } catch (eGen) {
          console.warn('[DivimedRobot] Aviso na busca por essência:', eGen.message);
        }
      }

      // 3. Classificação e Seleção do Vencedor pelo Menor Preço e Desempate por Histórico
      const itemOrigConfig = {
        ean: eanLimpo,
        descricao: descricaoProduto,
        precoOriginal: melhorEanOriginal ? melhorEanOriginal.preco : null,
        tipo_categoria: opts.tipo_categoria || 'MEDICAMENTO'
      };

      const resultadoClassificacao = motorEssencia.filtrarEClassificarCandidatos(todosCandidatos, itemOrigConfig, opts.db || this.db);
      const vencedor = resultadoClassificacao.vencedor || melhorEanOriginal;

      if (!vencedor) {
        return {
          fornecedor: 'DIVIMED',
          ean: eanLimpo,
          disponivel: false,
          preco: null,
          mensagem: 'Indisponível na Divimed'
        };
      }

      const isSubstituto = Boolean(vencedor.isSubstituto);

      if (!isSubstituto && vencedor.ean) {
        const vencDigitos = String(vencedor.ean).replace(/\D/g, '');
        const bateEan = vencDigitos === eanDigitos ||
                       (vencDigitos.length === 14 && eanDigitos.length === 13 && vencDigitos === '0' + eanDigitos) ||
                       (eanDigitos.length === 14 && vencDigitos.length === 13 && eanDigitos === '0' + vencDigitos);
        if (!bateEan) {
          console.warn(`[DivimedRobot] ⛔ Rejeitando item com EAN divergente: esperado "${eanDigitos}" vs encontrado "${vencDigitos}"`);
          return {
            fornecedor: 'DIVIMED',
            ean: eanLimpo,
            disponivel: false,
            preco: null,
            mensagem: 'EAN divergente no catálogo da Divimed'
          };
        }
      }

      return {
        fornecedor: 'DIVIMED',
        ean: vencedor.ean || eanLimpo,
        eanOriginal: eanLimpo,
        eanEncontrado: vencedor.ean || eanLimpo,
        disponivel: true,
        preco: Number(Number(vencedor.preco).toFixed(2)),
        descricao: vencedor.descricao || '',
        laboratorio: vencedor.laboratorio || farmacoMatcher.extrairLaboratorio(vencedor.descricao),
        isSubstituto,
        isGenericoEquivalente: isSubstituto,
        precoOriginalEan: melhorEanOriginal ? melhorEanOriginal.preco : null,
        economiaReais: vencedor.economiaReais || (melhorEanOriginal && isSubstituto && melhorEanOriginal.preco > vencedor.preco ? Number((melhorEanOriginal.preco - vencedor.preco).toFixed(2)) : 0),
        economiaPct: vencedor.economiaPct || (melhorEanOriginal && isSubstituto && melhorEanOriginal.preco > vencedor.preco ? Number((((melhorEanOriginal.preco - vencedor.preco) / melhorEanOriginal.preco) * 100).toFixed(1)) : 0),
        todosConcorrentes: resultadoClassificacao.todosConcorrentes || [],
        produtoId: vencedor.produtoId,
        urlProduto: 'https://divimed.artpedidoweb.com.br/#/comprar',
        mensagem: isSubstituto ? `Opção mais barata (${vencedor.laboratorio || ''} - R$ ${vencedor.preco.toFixed(2)})` : ''
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

  /**
   * Conta quantos itens existem no carrinho da Divimed
   * @returns {Promise<number>}
   */
  async contarItensCarrinho() {
    if (!this.page) throw new Error('Robô Divimed não iniciado.');
    try {
      const qtdTopo = await this.page.evaluate(() => {
        const botoes = Array.from(document.querySelectorAll('button, a, div'));
        const btnCarrinho = botoes.find(b => {
          const t = (b.innerText || '').trim();
          return t.includes('Carrinho') && /\d+/.test(t);
        });

        if (btnCarrinho) {
          const m = btnCarrinho.innerText.match(/(\d+)\s*Carrinho|Carrinho\s*(\d+)|\n(\d+)\nCarrinho/);
          if (m) {
            const n = parseInt(m[1] || m[2] || m[3], 10);
            if (!isNaN(n)) return n;
          }
        }
        return null;
      });

      if (qtdTopo !== null) return qtdTopo;

      await this.page.goto('https://divimed.artpedidoweb.com.br/#/carrinho', {
        waitUntil: 'networkidle2',
        timeout: 25000
      });
      await new Promise(r => setTimeout(r, 1500));

      const qtdTela = await this.page.evaluate(() => {
        const bodyText = document.body.innerText || '';
        if (
          bodyText.includes('Carrinho vazio') ||
          bodyText.includes('Nenhum item') ||
          bodyText.includes('Nenhum produto adicionado')
        ) {
          return 0;
        }

        const lixeiras = document.querySelectorAll('button.qty-btn-delete, button[class*="delete"], button[class*="trash"]');
        return lixeiras ? lixeiras.length : 0;
      });

      return qtdTela;
    } catch (err) {
      console.error('[DivimedRobot] Erro ao contar itens no carrinho:', err.message);
      throw err;
    }
  }

  /**
   * Esvazia o carrinho da Divimed e confirma 0 itens
   * @returns {Promise<{ sucesso: boolean, itensRestantes: number }>}
   */
  async limparCarrinho() {
    if (!this.page) throw new Error('Robô Divimed não iniciado.');
    try {
      let qtdInicial = await this.contarItensCarrinho();
      if (qtdInicial === 0) {
        console.log('[DivimedRobot] Carrinho já está 100% vazio (0 itens).');
        return { sucesso: true, itensRestantes: 0 };
      }

      console.log(`[DivimedRobot] Limpando carrinho com ${qtdInicial} itens...`);
      await this.page.goto('https://divimed.artpedidoweb.com.br/#/carrinho', {
        waitUntil: 'networkidle2',
        timeout: 25000
      });
      await new Promise(r => setTimeout(r, 1500));

      const clicouGeral = await this.page.evaluate(() => {
        const botoes = Array.from(document.querySelectorAll('button, a'));
        const btnLimpar = botoes.find(b => {
          const t = (b.innerText || '').toLowerCase();
          return t.includes('limpar carrinho') || t.includes('esvaziar') || t.includes('excluir todos');
        });
        if (btnLimpar) {
          btnLimpar.click();
          return true;
        }
        return false;
      });

      if (clicouGeral) {
        await new Promise(r => setTimeout(r, 1000));
        await this.page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const btnConf = btns.find(b => ['sim', 'confirmar', 'excluir', 'ok'].includes((b.innerText || '').trim().toLowerCase()));
          if (btnConf) btnConf.click();
        });
        await new Promise(r => setTimeout(r, 2000));
      } else {
        let tentativas = 0;
        while (tentativas < 100) {
          tentativas++;
          const temLixeira = await this.page.evaluate(() => {
            const btn = document.querySelector('button.qty-btn-delete, button[class*="delete"], button[class*="trash"]');
            if (btn) {
              btn.click();
              return true;
            }
            return false;
          });

          if (!temLixeira) break;
          await new Promise(r => setTimeout(r, 600));

          await this.page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btnConf = btns.find(b => ['sim', 'confirmar', 'excluir'].includes((b.innerText || '').trim().toLowerCase()));
            if (btnConf) btnConf.click();
          });
          await new Promise(r => setTimeout(r, 800));
        }
      }

      await new Promise(r => setTimeout(r, 1500));
      const qtdFinal = await this.contarItensCarrinho();
      if (qtdFinal === 0) {
        console.log('[DivimedRobot] ✅ Carrinho da Divimed esvaziado com sucesso (0 itens).');
        return { sucesso: true, itensRestantes: 0 };
      } else {
        throw new Error(`Carrinho da Divimed ainda possui ${qtdFinal} itens após tentativa de limpeza.`);
      }
    } catch (err) {
      console.error('[DivimedRobot] Erro ao limpar carrinho:', err.message);
      throw err;
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
