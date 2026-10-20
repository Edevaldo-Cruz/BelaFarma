const puppeteer = require('puppeteer');
const fs = require('fs');
const { validarCorrespondenciaProduto } = require('./belaped-validador.js');
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
        bodyText.includes('não encontramos') ||
        bodyText.includes('0 produtos encontrados')
      ) {
        return [];
      }

      // Mapeia links de produtos na página para redirecionamento direto
      const mapaLinks = {};
      const linksNaPagina = Array.from(document.querySelectorAll('a[href*="/produtos/"]'));
      for (const a of linksNaPagina) {
        const txt = (a.innerText || '').trim().toUpperCase();
        const href = a.getAttribute('href');
        if (txt && href && !mapaLinks[txt]) {
          mapaLinks[txt] = href.startsWith('http') ? href : ('https://sotonfarma.meuspedidos.com.br' + href);
        }
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
        // Exemplo no MeusPedidos:
        // linhas[i-1]: "APARELHO DE BARBEAR INOX PREMIUM... - VICEROY"
        // linhas[i]:   "Cód. 8244 • UN"
        // linhas[i+1]: "Ops! Já vendemos todo o estoque." ou "R$ 4,79"
        if (linhas[i].startsWith('Cód.') && i > 0 && i + 1 < linhas.length) {
          const titulo = linhas[i - 1];
          const bloco = linhas.slice(Math.max(0, i - 1), Math.min(linhas.length, i + 8));
          const blocoTexto = bloco.join(' ').toLowerCase();

          // 🚨 CHECAGEM CRÍTICA DE ESTOQUE NA SOTON / MEUSPEDIDOS:
          if (
            blocoTexto.includes('vendemos todo o estoque') ||
            blocoTexto.includes('sem estoque') ||
            blocoTexto.includes('indisponível') ||
            blocoTexto.includes('indisponivel') ||
            blocoTexto.includes('esgotado') ||
            blocoTexto.includes('avise-me') ||
            blocoTexto.includes('avise me') ||
            blocoTexto.includes('já vendemos')
          ) {
            continue; // Pula produto sem estoque!
          }

          // Procura o preço no bloco (deve começar com R$)
          let precoNum = null;
          for (let j = i + 1; j < Math.min(linhas.length, i + 6); j++) {
            const linha = linhas[j];
            if (linha.startsWith('Cód.')) break; // Chegou no próximo produto
            if (linha.startsWith('R$') && !linha.includes('shopping_cart')) {
              const num = parseFloat(linha.replace('R$', '').trim().replace(/\./g, '').replace(',', '.'));
              if (!isNaN(num) && num > 0) {
                precoNum = num;
                break;
              }
            }
          }

          if (precoNum !== null) {
            // Tenta encontrar o link direto mais adequado
            let linkDireto = null;
            const titUpper = titulo.toUpperCase();
            for (const [txtLink, href] of Object.entries(mapaLinks)) {
              if (titUpper.includes(txtLink) || txtLink.includes(titUpper)) {
                linkDireto = href;
                break;
              }
            }

            // Tenta extrair EAN do bloco de texto ou do título
            let eanEncontrado = null;
            const matchRotuloEan = (titulo + ' ' + bloco.join(' ')).match(/\b(?:EAN|C[oó]d\.?\s*(?:de\s*)?Barras?|Barras?)\s*:?\s*(\d{8,14})\b/i);
            if (matchRotuloEan) {
              eanEncontrado = matchRotuloEan[1];
            } else {
              const matchDigitos = (titulo + ' ' + bloco.join(' ')).match(/\b(789\d{10}|790\d{10}|\d{13})\b/);
              if (matchDigitos) {
                eanEncontrado = matchDigitos[1] || matchDigitos[0];
              }
            }

            encontrados.push({
              ean: eanEncontrado,
              descricao: titulo,
              preco: precoNum,
              url: linkDireto || null
            });
          }
        }
      }

      return encontrados;
    });
  }

  /**
   * Consulta um EAN no catálogo da Soton Farma com validação estrita de EAN, Semântica e Estoque
   */
  async cotarEAN(ean, descricaoProduto = '', opts = {}) {
    if (!this.page) throw new Error('Robô Soton não iniciado.');

    try {
      const eanLimpo = String(ean || '').trim();
      if (!eanLimpo) return { fornecedor: 'SOTON FARMA', disponivel: false, preco: null };

      // 1. Busca por EAN original no portal com validação estrita
      let itensEan = await this._buscarTermoNaSoton(eanLimpo);
      const eanDigitos = eanLimpo.replace(/\D/g, '');
      let itensCorrespondentes = (itensEan || []).filter(it => {
        if (!it.descricao) return false;

        // Se o item tem EAN raspado, valida correspondência estrita
        if (it.ean) {
          const itDigitos = String(it.ean).replace(/\D/g, '');
          const bateEan = itDigitos === eanDigitos ||
                         (itDigitos.length === 14 && eanDigitos.length === 13 && itDigitos === '0' + eanDigitos) ||
                         (eanDigitos.length === 14 && itDigitos.length === 13 && eanDigitos === '0' + itDigitos);
          return bateEan;
        }

        // Se a descrição contém a sequência numérica exata do EAN
        const descDigitos = String(it.descricao).replace(/\D/g, '');
        if (descDigitos.includes(eanDigitos) || (eanDigitos.length >= 8 && descDigitos.endsWith(eanDigitos))) {
          return true;
        }

        // Se o link direto contiver o EAN
        if (it.url && it.url.includes(eanDigitos)) {
          return true;
        }

        // Se a descrição do produto original foi informada, valida semanticamente (marca, dosagem, apresentação)
        if (descricaoProduto) {
          const checagem = validarCorrespondenciaProduto(descricaoProduto, it.descricao);
          return checagem.valido;
        }

        // Sem EAN correspondente e sem correspondência semântica válida, descarta
        return false;
      });

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
          if (prep.termoBusca && prep.termoBusca.length >= 3) {
            const itensEssencia = await this._buscarTermoNaSoton(prep.termoBusca);
            for (const it of (itensEssencia || [])) {
              if (!todosCandidatos.some(existente => existente.descricao === it.descricao && existente.preco === it.preco)) {
                todosCandidatos.push(it);
              }
            }
          }
        } catch (eGen) {
          console.warn('[SotonRobot] Aviso na busca por essência:', eGen.message);
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
          fornecedor: 'SOTON FARMA',
          ean: eanLimpo,
          disponivel: false,
          preco: null,
          descricao: '',
          mensagem: 'Sem estoque ou não encontrado na Soton Farma'
        };
      }

      const isSubstituto = Boolean(vencedor.isSubstituto);

      if (!isSubstituto && vencedor.ean) {
        const vencDigitos = String(vencedor.ean).replace(/\D/g, '');
        const bateEan = vencDigitos === eanDigitos ||
                       (vencDigitos.length === 14 && eanDigitos.length === 13 && vencDigitos === '0' + eanDigitos) ||
                       (eanDigitos.length === 14 && vencDigitos.length === 13 && eanDigitos === '0' + vencDigitos);
        if (!bateEan) {
          console.warn(`[SotonRobot] ⛔ Rejeitando item com EAN divergente: esperado "${eanDigitos}" vs encontrado "${vencDigitos}"`);
          return {
            fornecedor: 'SOTON FARMA',
            ean: eanLimpo,
            disponivel: false,
            preco: null,
            descricao: '',
            mensagem: 'EAN divergente no catálogo da Soton Farma'
          };
        }
      }

      const urlProduto = vencedor.url || `https://sotonfarma.meuspedidos.com.br/?busca=${encodeURIComponent(vencedor.ean || eanLimpo)}`;

      return {
        fornecedor: 'SOTON FARMA',
        ean: vencedor.ean || eanLimpo, // EAN do vencedor
        eanOriginal: eanLimpo,
        eanEncontrado: vencedor.ean || eanLimpo,
        disponivel: true,
        preco: vencedor.preco,
        descricao: vencedor.descricao || '',
        laboratorio: vencedor.laboratorio || farmacoMatcher.extrairLaboratorio(vencedor.descricao),
        isSubstituto,
        isGenericoEquivalente: isSubstituto,
        precoOriginalEan: melhorEanOriginal ? melhorEanOriginal.preco : null,
        economiaReais: vencedor.economiaReais || (melhorEanOriginal && isSubstituto && melhorEanOriginal.preco > vencedor.preco ? Number((melhorEanOriginal.preco - vencedor.preco).toFixed(2)) : 0),
        economiaPct: vencedor.economiaPct || (melhorEanOriginal && isSubstituto && melhorEanOriginal.preco > vencedor.preco ? Number((((melhorEanOriginal.preco - vencedor.preco) / melhorEanOriginal.preco) * 100).toFixed(1)) : 0),
        todosConcorrentes: resultadoClassificacao.todosConcorrentes || [],
        urlProduto: urlProduto,
        mensagem: isSubstituto ? `Opção mais barata (${vencedor.laboratorio || ''} - R$ ${vencedor.preco.toFixed(2)})` : ''
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
        const input = document.querySelector('input[type="number"]');
        if (!input) return { sucesso: false, motivo: 'Campo de quantidade não encontrado no item' };

        // 1. Remove classe hidden do container
        const container = input.closest('div');
        if (container) {
          container.className = container.className.replace(/AddToCartButton__addToCartContainerHidden___\w+/g, '');
        }

        // 2. React Native Value Setter para atualizar o state interno do React no Mercos
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(input, qtd.toString());
        } else {
          input.value = qtd.toString();
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        // 3. Clica no botão COMPRAR / adicionar do container
        const btn = container ? container.querySelector('button') : document.querySelector('button.catalog-item-b2b-button');
        if (btn) {
          btn.click();
          return { sucesso: true };
        }

        return { sucesso: false, motivo: 'Botão de adicionar não encontrado' };
      }, qtdNum);

      if (adicionou.sucesso) {
        await new Promise(r => setTimeout(r, 2500));
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

        const matchItens = bodyText.match(/(\d+)\s*ITENS/i) || bodyText.match(/(\d+)\s*ITEM/i);
        if (matchItens) {
          return parseInt(matchItens[1], 10);
        }

        const linhas = document.querySelectorAll('.OrderItem__deleteButton___x2z1N, button[class*="deleteButton"], .b2b-checkout-item, [class*="CheckoutItem"]');
        if (linhas && linhas.length > 0) {
          return linhas.length;
        }

        const btnDanger = document.querySelector('button[class*="CartOrderFooter__danger"], button[class*="danger"]');
        if (btnDanger) {
          return 1;
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
      await this.page.goto('https://sotonfarma.meuspedidos.com.br/carrinho', {
        waitUntil: 'networkidle2',
        timeout: 25000
      });
      await new Promise(r => setTimeout(r, 2000));

      const btnDangerSelector = 'button[class*="CartOrderFooter__danger"], button[class*="danger"]';
      let temBotaoExcluir = await this.page.$(btnDangerSelector);

      if (!temBotaoExcluir) {
        temBotaoExcluir = await this.page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const btn = btns.find(b => (b.innerText || '').toLowerCase().includes('excluir carrinho'));
          return !!btn;
        });
      }

      if (temBotaoExcluir) {
        console.log('[SotonRobot] Clicando no botão Excluir carrinho com page.click...');
        try {
          await this.page.$eval(btnDangerSelector, el => el.scrollIntoView());
          await new Promise(r => setTimeout(r, 400));
          await this.page.click(btnDangerSelector);
        } catch (e) {
          await this.page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => (b.innerText || '').toLowerCase().includes('excluir carrinho'));
            if (btn) btn.click();
          });
        }

        console.log('[SotonRobot] Aguardando modal ConfirmDialog abrir...');
        await new Promise(r => setTimeout(r, 1500));

        // Clica no botão EXCLUIR do ConfirmDialog
        const clicouExcluirModal = await this.page.evaluate(() => {
          const dialogBtns = Array.from(document.querySelectorAll('[class*="ConfirmDialog"] button, button'));
          const btnExcluir = dialogBtns.find(b => (b.innerText || '').trim().toUpperCase() === 'EXCLUIR');
          if (btnExcluir) {
            btnExcluir.click();
            return true;
          }
          return false;
        });

        if (clicouExcluirModal) {
          console.log('[SotonRobot] Confirmou exclusão do carrinho no ConfirmDialog.');
          await new Promise(r => setTimeout(r, 3000));
        }
      }

      // Confere se esvaziou
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
