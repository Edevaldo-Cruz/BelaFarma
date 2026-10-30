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
        this.page.evaluate(() => {
          const btn = document.querySelector('button[type="submit"]');
          if (btn) btn.click();
        }),
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
  async buscarTermo(termo) {
    return await this._buscarNoCatalogoDpc(termo);
  }

  /**
   * Busca produtos no catálogo da DPC
   */
  async _buscarNoCatalogoDpc(termo) {
    if (!this.page) return [];
    try {
      const urlBusca = `https://dpcnet.com.br/catalogo?busca=${encodeURIComponent(termo)}&visualizacao=bloco-1&ordenacao=ordem-0`;
      await this.page.goto(urlBusca, { waitUntil: 'networkidle2', timeout: 25000 });
      await new Promise(r => setTimeout(r, 600));

      return await this.page.evaluate(() => {
        const bodyText = document.body.innerText || '';
        const idxIni = bodyText.indexOf('Resultado da Busca:');
        const idxFim = bodyText.indexOf('Empresa especializada na distribuição');
        const areaBusca = idxIni >= 0 ? bodyText.slice(idxIni, idxFim > idxIni ? idxFim : undefined) : '';

        if (!areaBusca || areaBusca.includes('Foram encontrados 0 produtos') || areaBusca.includes('Não localizamos nenhum resultado')) {
          return [];
        }

        const linhas = areaBusca.split('\n').map(l => l.trim()).filter(Boolean);
        const encontrados = [];

        // 1. Tentar raspar cards de produtos no DOM
        const cards = Array.from(document.querySelectorAll('.bloco-produto, .card-produto, [class*="produto-card"], .shelf-item, .item-produto'));
        if (cards.length > 0) {
          for (const card of cards) {
            const cardText = card.innerText || '';
            if (
              cardText.includes('Sem estoque') ||
              cardText.includes('Indisponível') ||
              cardText.includes('Esgotado') ||
              cardText.includes('Avise-me')
            ) {
              continue;
            }

            const matchPreco = cardText.match(/R\$\s*([\d\.]+,\d{2})/i);
            if (!matchPreco) continue;
            const precoNum = parseFloat(matchPreco[1].replace(/\./g, '').replace(',', '.'));
            if (isNaN(precoNum) || precoNum <= 0) continue;

            let fatorEmbalagem = 1;
            const matchEmb = cardText.match(/Emb\.:\s*(\d+)/i);
            if (matchEmb) {
              const n = parseInt(matchEmb[1], 10);
              if (n > 1) fatorEmbalagem = n;
            }

            const precoFinal = fatorEmbalagem > 1 ? Number((precoNum / fatorEmbalagem).toFixed(2)) : precoNum;

            const tituloEl = card.querySelector('h2, h3, [class*="title"], [class*="name"], .desc-produto');
            const descProd = tituloEl ? tituloEl.innerText.trim() : (cardText.split('\n')[0] || '');

            const matchEan = cardText.match(/\b(?:EAN|C[oó]d\.?\s*(?:de\s*)?Barras?|Barras?)\s*:?\s*(\d{8,14})\b/i) ||
                             cardText.match(/\b(789\d{10}|790\d{10}|\d{13}|\d{8,14})\b/);
            const eanItem = matchEan ? (matchEan[1] || matchEan[0]) : null;

            encontrados.push({
              ean: eanItem,
              descricao: descProd,
              preco: precoFinal,
              fatorEmbalagem
            });
          }
          if (encontrados.length > 0) return encontrados;
        }

        // 2. Extração resiliente linha a linha em areaBusca
        for (let i = 0; i < linhas.length; i++) {
          const l = linhas[i];
          if (l.startsWith('Emb.:')) {
            let fatorEmbalagem = 1;
            const matchQtd = l.match(/(\d+)/);
            if (matchQtd) {
              const n = parseInt(matchQtd[1], 10);
              if (n > 1) fatorEmbalagem = n;
            }
            const desc = (i + 1 < linhas.length) ? linhas[i + 1] : '';

            // Extrai EAN no bloco adjacente
            let eanEncontrado = null;
            for (let j = Math.max(0, i - 1); j < Math.min(i + 8, linhas.length); j++) {
              const subL = linhas[j];
              if (subL.startsWith('Emb.:') && j !== i) break;
              const matchRotuloEan = subL.match(/\b(?:EAN|C[oó]d\.?\s*(?:de\s*)?Barras?|Barras?)\s*:?\s*(\d{8,14})\b/i);
              if (matchRotuloEan) {
                eanEncontrado = matchRotuloEan[1];
                break;
              }
              const matchDigitos = subL.match(/\b(789\d{10}|790\d{10}|\d{13})\b/);
              if (matchDigitos && !subL.includes('R$')) {
                eanEncontrado = matchDigitos[1] || matchDigitos[0];
                break;
              }
            }
            if (!eanEncontrado && desc) {
              const matchDesc = desc.match(/\b(789\d{10}|790\d{10}|\d{13}|\d{8,14})\b/);
              if (matchDesc) eanEncontrado = matchDesc[1] || matchDesc[0];
            }

            for (let j = i + 2; j < Math.min(i + 7, linhas.length); j++) {
              const subL = linhas[j];
              if (/^R\$\s*[\d.,]+$/.test(subL)) {
                const num = parseFloat(subL.replace('R$', '').trim().replace(/\./g, '').replace(',', '.'));
                if (!isNaN(num) && num > 0) {
                  const precoFinal = fatorEmbalagem > 1 ? Number((num / fatorEmbalagem).toFixed(2)) : num;
                  encontrados.push({
                    ean: eanEncontrado,
                    descricao: desc,
                    preco: precoFinal,
                    fatorEmbalagem
                  });
                  break;
                }
              }
            }
          }
        }
        return encontrados;
      });
    } catch (e) {
      console.warn('[DpcRobot] Erro ao buscar no catálogo:', e.message);
      return [];
    }
  }

  /**
   * Consulta um EAN no catálogo da DPC com busca por essência e menor preço
   */
  async cotarEAN(ean, descricaoProduto = '', opts = {}) {
    if (!this.page) throw new Error('Robô DPC não iniciado.');

    try {
      const eanLimpo = String(ean || '').trim();
      if (!eanLimpo) return { fornecedor: 'DPC DISTRIBUIDORA', disponivel: false, preco: null, motivo: 'EAN_VAZIO' };

      // 1. Busca por EAN original no portal com validação estrita
      const itensEan = await this._buscarNoCatalogoDpc(eanLimpo);
      const eanDigitos = eanLimpo.replace(/\D/g, '');
      const itensCorrespondentes = (itensEan || []).filter(it => {
        if (!it.ean) {
          if (it.descricao && it.descricao.replace(/\D/g, '').includes(eanDigitos)) return true;
          if (descricaoProduto && it.descricao) {
            const checagem = validarCorrespondenciaProduto(descricaoProduto, it.descricao);
            return checagem.valido;
          }
          return false;
        }
        const itDigitos = String(it.ean).replace(/\D/g, '');
        const bateEan = itDigitos === eanDigitos ||
                       (itDigitos.length === 14 && eanDigitos.length === 13 && itDigitos === '0' + eanDigitos) ||
                       (eanDigitos.length === 14 && itDigitos.length === 13 && eanDigitos === '0' + itDigitos);
        return bateEan;
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
            const itensEssencia = await this._buscarNoCatalogoDpc(prep.termoBusca);
            for (const it of (itensEssencia || [])) {
              if (!todosCandidatos.some(existente => existente.descricao === it.descricao && existente.preco === it.preco)) {
                todosCandidatos.push(it);
              }
            }
          }
        } catch (eGen) {
          console.warn('[DpcRobot] Aviso na busca por essência:', eGen.message);
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
          fornecedor: 'DPC DISTRIBUIDORA',
          ean: eanLimpo,
          disponivel: false,
          preco: null,
          mensagem: 'Indisponível na DPC'
        };
      }

      const isSubstituto = Boolean(vencedor.isSubstituto);

      // Trava estrita de integridade: se não for substituto validado pelo motorEssencia, o EAN do vencedor DEVE bater com o EAN alvo
      if (!isSubstituto) {
        const vencDigitos = vencedor.ean ? String(vencedor.ean).replace(/\D/g, '') : '';
        const bateEan = vencDigitos === eanDigitos ||
                       (vencDigitos.length === 14 && eanDigitos.length === 13 && vencDigitos === '0' + eanDigitos) ||
                       (eanDigitos.length === 14 && vencDigitos.length === 13 && eanDigitos === '0' + vencDigitos);
        if (vencedor.ean && !bateEan) {
          console.warn(`[DpcRobot] ⛔ Rejeitando item com EAN divergente: esperado "${eanDigitos}" vs encontrado "${vencDigitos}"`);
          return {
            fornecedor: 'DPC DISTRIBUIDORA',
            ean: eanLimpo,
            disponivel: false,
            preco: null,
            mensagem: 'EAN divergente no catálogo da DPC'
          };
        }
      }
      const urlBusca = `https://dpcnet.com.br/catalogo?busca=${encodeURIComponent(vencedor.ean || eanLimpo)}`;

      return {
        fornecedor: 'DPC DISTRIBUIDORA',
        ean: vencedor.ean || eanLimpo,
        eanOriginal: eanLimpo,
        eanEncontrado: vencedor.ean || eanLimpo,
        disponivel: true,
        descricao: vencedor.descricao || '',
        preco: vencedor.preco,
        laboratorio: vencedor.laboratorio || farmacoMatcher.extrairLaboratorio(vencedor.descricao),
        isSubstituto,
        isGenericoEquivalente: isSubstituto,
        precoOriginalEan: melhorEanOriginal ? melhorEanOriginal.preco : null,
        economiaReais: vencedor.economiaReais || (melhorEanOriginal && isSubstituto && melhorEanOriginal.preco > vencedor.preco ? Number((melhorEanOriginal.preco - vencedor.preco).toFixed(2)) : 0),
        economiaPct: vencedor.economiaPct || (melhorEanOriginal && isSubstituto && melhorEanOriginal.preco > vencedor.preco ? Number((((melhorEanOriginal.preco - vencedor.preco) / melhorEanOriginal.preco) * 100).toFixed(1)) : 0),
        todosConcorrentes: resultadoClassificacao.todosConcorrentes || [],
        urlProduto: urlBusca,
        mensagem: isSubstituto ? `Opção mais barata (${vencedor.laboratorio || ''} - R$ ${vencedor.preco.toFixed(2)})` : '',
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
        let descricao = '';
        for (let i = 0; i < linhas.length; i++) {
          const l = linhas[i];
          if (l.startsWith('Emb.:') && i + 1 < linhas.length) {
            descricao = linhas[i + 1];
            break;
          }
        }
        return { encontrado: true, descricao };
      });

      if (!dados.encontrado) {
        return {
          sucesso: false,
          ean,
          quantidade: qtdNum,
          motivo: 'Item sem estoque ou não localizado no catálogo da DPC'
        };
      }

      // Validação semântica de marca e descrição
      if (descricaoProduto && dados.descricao) {
        const checagem = validarCorrespondenciaProduto(descricaoProduto, dados.descricao);
        if (!checagem.valido) {
          console.warn(`[DpcRobot] ⛔ Rejeitando adição ao carrinho DPC: esperado "${descricaoProduto}" vs encontrado "${dados.descricao}" (${checagem.motivo})`);
          return {
            sucesso: false,
            ean,
            quantidade: qtdNum,
            motivo: `Incompatível no portal DPC: ${checagem.motivo}`
          };
        }
      }

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
      // Se já estiver na página de checkout/review, conta diretamente os elementos .item-remove
      const currentUrl = this.page.url() || '';
      if (currentUrl.includes('/checkout/review') || currentUrl.includes('/checkout')) {
        const qtdDireta = await this.page.evaluate(() => {
          const bodyText = document.body.innerText || '';
          if (
            bodyText.includes('Seu carrinho está vazio') ||
            bodyText.includes('Nenhum produto no carrinho') ||
            bodyText.includes('0 produtos')
          ) {
            return 0;
          }
          return document.querySelectorAll('.item-remove').length;
        });
        return qtdDireta;
      }

      // Tenta ler o botão flutuante de carrinho no topo: a quantidade fica na última linha
      const qtdBadge = await this.page.evaluate(() => {
        const btnFloating = document.querySelector('.btn-floating-cart, [class*="floating-cart"], [class*="badge-cart"]');
        if (btnFloating) {
          const t = (btnFloating.innerText || '').trim();
          const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
          // O formato é: linha 1 = valor em R$, linha 2 = quantidade inteira de itens
          if (lines.length >= 2) {
            const m = lines[lines.length - 1].match(/^(\d+)$/);
            if (m) return parseInt(m[1], 10);
          } else if (lines.length === 1) {
            const m = lines[0].match(/^(\d+)$/);
            if (m) return parseInt(m[1], 10);
          }
        }
        return null;
      });

      if (qtdBadge !== null && qtdBadge >= 0) return qtdBadge;

      // Se não encontrou no badge ou está na dúvida, navega para /checkout/review
      await this.page.goto('https://dpcnet.com.br/checkout/review', {
        waitUntil: 'domcontentloaded',
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

        const removes = document.querySelectorAll('.item-remove');
        if (removes && removes.length > 0) return removes.length;

        const inputsQty = document.querySelectorAll('input.qty');
        if (inputsQty && inputsQty.length > 0) return inputsQty.length;

        return 0;
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
      console.log('[DpcRobot] Acessando checkout da DPC para verificar e limpar carrinho...');
      await this.page.goto('https://dpcnet.com.br/checkout/review', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await new Promise(r => setTimeout(r, 1500));

      let qtdInicial = await this.contarItensCarrinho();
      if (qtdInicial === 0) {
        console.log('[DpcRobot] ✅ Carrinho DPC já está 100% vazio (0 itens).');
        return { sucesso: true, itensRestantes: 0 };
      }

      console.log(`[DpcRobot] Limpando carrinho DPC com ${qtdInicial} itens...`);
      let tentativas = 0;
      while (tentativas < 250) {
        tentativas++;
        const removeu = await this.page.evaluate(() => {
          const btn = document.querySelector('.item-remove');
          if (btn) {
            btn.click();
            return true;
          }
          return false;
        });

        if (!removeu) break;
        await new Promise(r => setTimeout(r, 350));

        if (tentativas % 10 === 0) {
          const restantes = await this.page.evaluate(() => document.querySelectorAll('.item-remove').length);
          console.log(`[DpcRobot] Limpeza em andamento: ${restantes} itens restantes...`);
          if (restantes === 0) break;
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
