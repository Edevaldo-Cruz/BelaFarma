const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const farmacoMatcher = require('./belaped-farmaco-matcher');
const motorEssencia = require('./belaped-motor-essencia');

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
 * Módulo de Automação e Raspagem B2B da Distrimed (BelaPed)
 * Plataforma: Inovação Distrimed (inovacao.distrimed.com.br)
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
    const execPath = findChromeExecutable();
    console.log(`[DistrimedRobot] Iniciando navegador Puppeteer (${execPath || 'default'})...`);
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

    // Otimização de Performance: Bloqueia imagens, mídias e fontes para cotações ultra-rápidas
    await this.page.setRequestInterception(true);
    this.page.on('request', (req) => {
      const type = req.resourceType();
      if (type === 'image' || type === 'media' || type === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });

    console.log('[DistrimedRobot] Acessando autenticação da Distrimed...');
    await this.page.goto('https://inovacao.distrimed.com.br/login?referencia=/produtos', {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });

    console.log('[DistrimedRobot] Efetuando login...');
    await this.page.waitForSelector('input[name="usuario"]', { timeout: 20000 });
    await this.page.type('input[name="usuario"]', this.usuario, { delay: 5 });
    await this.page.type('input[senha="senha"]', this.senha, { delay: 5 }).catch(async () => {
      await this.page.type('input[name="senha"]', this.senha, { delay: 5 });
    });

    await this.page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('Entrar'));
      if (btn) btn.click();
    });

    await new Promise(r => setTimeout(r, 5000));

    if (!this.page.url().includes('/produtos')) {
      await this.page.goto('https://inovacao.distrimed.com.br/produtos', {
        waitUntil: 'networkidle2',
        timeout: 35000
      });
    }

    console.log('[DistrimedRobot] Login efetuado com sucesso!');

    // Garante que a condição comercial PADRÃO seja ativada e confirmada
    await this.ativarCondicaoPadrao();
  }

  /**
   * Garante que a condição comercial PADRÃO está ativa e confirmada para exibição de preços
   */
  async ativarCondicaoPadrao() {
    return this.selecionarCondicaoComercial('PADRÃO');
  }

  /**
   * Seleciona e confirma uma condição comercial na modal da Distrimed (ex: PADRÃO, PHARMALINK - UNILEVER, NIVEA, etc.)
   */
  async selecionarCondicaoComercial(nomeCondicao = 'PADRÃO') {
    try {
      const alvo = String(nomeCondicao || 'PADRÃO').toUpperCase().trim();
      const condicaoAtual = await this.page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('sell'));
        return btn ? btn.innerText.toUpperCase() : '';
      });

      if (condicaoAtual.includes('NENHUMA') || !condicaoAtual.includes(alvo)) {
        console.log(`[DistrimedRobot] Alternando condição comercial para: "${alvo}"...`);
        await this.page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('sell'));
          if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 1200));

        // Clica no item correspondente da lista na modal
        const clicou = await this.page.evaluate((termo) => {
          const itens = Array.from(document.querySelectorAll('li, div, button, span, [role="option"]'));
          const exato = itens.find(el => (el.innerText || '').trim().toUpperCase() === termo);
          if (exato) {
            exato.click();
            return true;
          }
          const parcial = itens.find(el => (el.innerText || '').trim().toUpperCase().includes(termo));
          if (parcial) {
            parcial.click();
            return true;
          }
          return false;
        }, alvo);

        if (!clicou) {
          console.warn(`[DistrimedRobot] Opção comercial "${alvo}" não encontrada na modal da Distrimed.`);
          // Fecha modal se estiver aberta
          await this.page.evaluate(() => {
            const btnClose = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('close'));
            if (btnClose) btnClose.click();
          });
          return false;
        }

        await new Promise(r => setTimeout(r, 800));

        // Clica no botão Confirmar da modal de condição de preços
        await this.page.evaluate(() => {
          const btnConfirmar = document.querySelector('button.botao-confirmar') ||
            Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('Confirmar'));
          if (btnConfirmar) btnConfirmar.click();
        });
        await new Promise(r => setTimeout(r, 2500));

        // Fecha eventual aviso "Entendido"
        await this.page.evaluate(() => {
          const btnEntendido = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('Entendido'));
          if (btnEntendido) btnEntendido.click();
        });

        console.log(`[DistrimedRobot] Condição comercial "${alvo}" confirmada com sucesso!`);
        return true;
      }
      return true;
    } catch (e) {
      console.warn('[DistrimedRobot] Aviso ao ajustar condição de preço:', e.message);
      return false;
    }
  }

  async _buscarNoCatalogo(termo) {
    const searchSel = 'input[placeholder*="Pesquise por: produtos"]';
    await this.page.waitForSelector(searchSel, { timeout: 15000 });

    // Limpa o input de forma garantida
    await this.page.$eval(searchSel, el => {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }).catch(() => {});

    await this.page.click(searchSel, { clickCount: 3 });
    await this.page.keyboard.press('Backspace');
    await this.page.keyboard.down('Control');
    await this.page.keyboard.press('A');
    await this.page.keyboard.up('Control');
    await this.page.keyboard.press('Backspace');

    await this.page.type(searchSel, termo, { delay: 5 });
    await this.page.keyboard.press('Enter');

    // Clica também no botão de busca da Distrimed (botão "Buscar" com ícone de lupa)
    await this.page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btnBuscar = btns.find(b => (b.innerText || '').trim().toUpperCase().includes('BUSCAR'));
      if (btnBuscar) btnBuscar.click();
    }).catch(() => {});

    // Espera a resposta da busca
    await new Promise(r => setTimeout(r, 1600));

    return await this.page.evaluate(() => {
      const bodyText = document.body.innerText || '';
      const idxImportar = bodyText.indexOf('Importar');
      const areaProdutos = idxImportar >= 0 ? bodyText.slice(idxImportar) : bodyText;

      if (
        areaProdutos.includes('Produto não encontrado') ||
        areaProdutos.includes('Nenhum produto') ||
        areaProdutos.includes('não encontramos nenhum produto')
      ) {
        return [];
      }

      // Na Distrimed, cada card começa com "VAL. DD/MM/AAAA"
      const blocos = areaProdutos.split(/VAL\.\s*\d{2}\/\d{2}\/\d{4}/).slice(1);
      const encontrados = [];

      for (const bloco of blocos) {
        const blocoUpper = bloco.toUpperCase();

        // 🚨 VERIFICAÇÃO CRÍTICA DE ESTOQUE:
        // Na Distrimed, produtos esgotados exibem o botão "Avise-me quando chegar" ou "Sem estoque"
        const semEstoque =
          blocoUpper.includes('AVISE-ME') ||
          blocoUpper.includes('AVISE ME') ||
          blocoUpper.includes('SEM ESTOQUE') ||
          blocoUpper.includes('INDISPONÍVEL') ||
          blocoUpper.includes('INDISPONIVEL') ||
          blocoUpper.includes('ESGOTADO') ||
          blocoUpper.includes('PRODUTO NÃO DISPONÍVEL');

        if (semEstoque) {
          // PRODUTO SEM ESTOQUE: O preço no card é apenas de catálogo, não pode ser comprado!
          continue;
        }

        const linhas = bloco.split('\n').map(l => l.trim()).filter(Boolean);
        let eanCard = '';
        let descricaoCard = '';
        let precoUnit = null;

        for (let i = 0; i < linhas.length; i++) {
          const l = linhas[i];
          if (l.startsWith('EAN:')) {
            eanCard = l.replace('EAN:', '').split('/')[0].trim();
          } else if (/^R\$\s*[\d.,]+$/.test(l)) {
            const num = parseFloat(l.replace('R$', '').trim().replace(/\./g, '').replace(',', '.'));
            if (!isNaN(num) && num > 0 && precoUnit === null) {
              precoUnit = num;
              if (i > 0 && !linhas[i - 1].startsWith('PMC')) {
                descricaoCard = linhas[i - 1];
              } else if (i > 1) {
                descricaoCard = linhas[i - 1];
              }
            }
          }
        }

        if (precoUnit !== null && precoUnit > 0) {
          encontrados.push({
            ean: eanCard,
            descricao: descricaoCard,
            preco: precoUnit
          });
        }
      }

      return encontrados;
    });
  }

  /**
   * Consulta um EAN no catálogo da Distrimed com validação estrita de EAN,
   * suporte a busca por princípio ativo/genérico mais barato e validação de equivalência
   */
  async cotarEAN(ean, descricaoProduto = '', opts = {}) {
    if (!this.page) throw new Error('Robô Distrimed não iniciado.');

    try {
      const eanLimpo = String(ean || '').trim();
      if (!eanLimpo) return { fornecedor: 'DISTRIMED', disponivel: false, preco: null };

      // 1. Busca exata por EAN primeiro
      let itensEan = await this._buscarNoCatalogo(eanLimpo);

      const eanDigitos = eanLimpo.replace(/\D/g, '');
      let itensCorrespondentes = itensEan.filter(it => {
        if (!it.ean) return false;
        const eanCardDigitos = String(it.ean).replace(/\D/g, '');
        return eanCardDigitos === eanDigitos ||
               (eanCardDigitos.length >= 8 && eanDigitos.length >= 8 && (eanCardDigitos.endsWith(eanDigitos) || eanDigitos.endsWith(eanCardDigitos)));
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
            const itensEssencia = await this._buscarNoCatalogo(prep.termoBusca);
            for (const it of itensEssencia) {
              if (!todosCandidatos.some(existente => existente.ean && it.ean && String(existente.ean) === String(it.ean))) {
                todosCandidatos.push(it);
              }
            }
          }
        } catch (eGen) {
          console.warn('[DistrimedRobot] Aviso na busca por essência:', eGen.message);
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
          fornecedor: 'DISTRIMED',
          ean: eanLimpo,
          disponivel: false,
          preco: null,
          descricao: '',
          mensagem: 'Sem estoque ou indisponível na Distrimed'
        };
      }

      const isSubstituto = Boolean(vencedor.isSubstituto || (vencedor.ean && String(vencedor.ean).replace(/\D/g, '') !== eanDigitos));

      return {
        fornecedor: 'DISTRIMED',
        ean: vencedor.ean, // EAN vencedor (usado no faturamento e carrinho)
        eanOriginal: eanLimpo,
        eanEncontrado: vencedor.ean,
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
        mensagem: isSubstituto ? `Opção mais barata (${vencedor.laboratorio || ''} - R$ ${vencedor.preco.toFixed(2)})` : ''
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
   */
  async importarCarrinhoArquivo(caminhoArquivo) {
    if (!this.page) throw new Error('Robô Distrimed não iniciado.');

    try {
      console.log('[DistrimedRobot] Abrindo modal de importação...');
      await this.page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => (b.innerText || '').includes('Importar'));
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 2000));

      // Etapa 1: Upload do arquivo na modal
      console.log(`[DistrimedRobot] Anexando arquivo ${caminhoArquivo}...`);
      const inputFile = await this.page.$('input[type="file"]');
      if (!inputFile) {
        throw new Error('Campo input[type="file"] não encontrado na modal da Distrimed.');
      }

      await inputFile.uploadFile(caminhoArquivo);
      await new Promise(r => setTimeout(r, 2500));

      // Etapa 2: Mapeamento automático das colunas (Select 1: EAN/Código, Select 2: Quantidade)
      console.log('[DistrimedRobot] Mapeando colunas EAN e Quantidade nos selects da modal...');
      await this.page.evaluate(() => {
        const modal = document.querySelector('.modal, [role="dialog"], [class*="modal"]');
        const selects = modal ? Array.from(modal.querySelectorAll('select')) : Array.from(document.querySelectorAll('select'));

        // Coluna 1 -> EAN/Código
        if (selects.length >= 1) {
          const s1 = selects[0];
          for (let i = 0; i < s1.options.length; i++) {
            if (/ean|código|codigo/i.test(s1.options[i].text)) {
              s1.selectedIndex = i;
              s1.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        }

        // Coluna 2 -> Quantidade
        if (selects.length >= 2) {
          const s2 = selects[1];
          for (let i = 0; i < s2.options.length; i++) {
            if (/quantidade|qtd/i.test(s2.options[i].text)) {
              s2.selectedIndex = i;
              s2.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        }
      });

      await new Promise(r => setTimeout(r, 1500));

      // Etapa 3: Clica em Confirmar para submeter o pedido
      console.log('[DistrimedRobot] Submetendo importação na modal...');
      const confirmou = await this.page.evaluate(() => {
        const modal = document.querySelector('.modal, [role="dialog"], [class*="modal"]');
        const btns = modal ? Array.from(modal.querySelectorAll('button')) : Array.from(document.querySelectorAll('button'));
        const btnConfirmar = btns.find(b => {
          const t = (b.innerText || '').toLowerCase();
          return t.includes('confirmar') || t.includes('check');
        });
        if (btnConfirmar) {
          btnConfirmar.click();
          return true;
        }
        return false;
      });

      if (!confirmou) {
        throw new Error('Botão Confirmar não encontrado na modal da Distrimed.');
      }

      await new Promise(r => setTimeout(r, 5000));

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

  /**
   * Adiciona um produto ao carrinho da Distrimed (utilizando modal de importação por arquivo com 1 item)
   */
  async adicionarAoCarrinho(ean, quantidade, descricaoProduto = '') {
    if (!this.page) throw new Error('Robô Distrimed não iniciado.');
    const qtdNum = Math.max(1, parseInt(quantidade) || 1);
    const tempFile = path.resolve(__dirname, `temp_distrimed_item_${ean}_${Date.now()}.csv`);
    try {
      const csvContent = `EAN;Quantidade\r\n${ean};${qtdNum}\r\n`;
      fs.writeFileSync(tempFile, csvContent, 'utf-8');
      const res = await this.importarCarrinhoArquivo(tempFile);
      return {
        sucesso: res.sucesso,
        ean,
        quantidade: qtdNum,
        motivo: res.sucesso ? 'Adicionado com sucesso no carrinho da Distrimed' : (res.motivo || 'Falha na importação')
      };
    } catch (err) {
      return {
        sucesso: false,
        ean,
        quantidade: qtdNum,
        motivo: 'Erro ao adicionar item Distrimed: ' + err.message
      };
    } finally {
      try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) {}
    }
  }

  /**
   * Conta quantos itens existem no carrinho da Distrimed
   * @returns {Promise<number>}
   */
  async contarItensCarrinho() {
    if (!this.page) throw new Error('Robô Distrimed não iniciado.');
    try {
      const qtd = await this.page.evaluate(() => {
        const botoes = Array.from(document.querySelectorAll('button, a, div, span'));
        const btnCarrinho = botoes.find(b => {
          const t = (b.innerText || '').trim();
          return t.includes('Carrinho');
        });

        if (btnCarrinho) {
          const m = btnCarrinho.innerText.match(/Carrinho\s*(\d+)/i);
          if (m) return parseInt(m[1], 10);
        }

        const iconesCarrinho = document.querySelectorAll('[class*="cart"], [class*="shopping"], [data-icon*="cart"]');
        for (const icone of iconesCarrinho) {
          const parent = icone.closest('button, a, div');
          if (parent) {
            const m = parent.innerText.match(/(\d+)/);
            if (m) return parseInt(m[1], 10);
          }
        }

        if (document.body.innerText.includes('Carrinho vazio') || document.body.innerText.includes('Carrinho 0')) {
          return 0;
        }

        return 0;
      });

      return qtd;
    } catch (err) {
      console.error('[DistrimedRobot] Erro ao contar itens no carrinho:', err.message);
      throw err;
    }
  }

  /**
   * Limpa o carrinho da Distrimed e confirma 0 itens
   * @returns {Promise<{ sucesso: boolean, itensRestantes: number }>}
   */
  async limparCarrinho() {
    if (!this.page) throw new Error('Robô Distrimed não iniciado.');
    try {
      console.log('[DistrimedRobot] Abrindo drawer do Carrinho para limpeza...');
      await this.page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btnCart = btns.find(b => (b.innerText || '').includes('Carrinho'));
        if (btnCart) btnCart.click();
      });
      await new Promise(r => setTimeout(r, 1500));

      console.log('[DistrimedRobot] Clicando em Limpar carrinho...');
      const clicouLimpar = await this.page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => (b.innerText || '').includes('Limpar carrinho'));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });

      if (clicouLimpar) {
        await new Promise(r => setTimeout(r, 1500));
        // Clica no botão Sim do modal de confirmação (texto contém "Sim")
        await this.page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const btnSim = btns.find(b => (b.innerText || '').includes('Sim'));
          if (btnSim) btnSim.click();
        });
        await new Promise(r => setTimeout(r, 2500));
      }

      // Fecha eventuais modais/gavetas clicando no fechar ou fora
      await this.page.evaluate(() => {
        const btnClose = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').trim() === 'close');
        if (btnClose) btnClose.click();
      }).catch(() => {});

      const qtdFinal = await this.contarItensCarrinho();
      if (qtdFinal === 0) {
        console.log('[DistrimedRobot] ✅ Carrinho da Distrimed esvaziado com sucesso (0 itens).');
        return { sucesso: true, itensRestantes: 0 };
      } else {
        throw new Error(`Carrinho da Distrimed ainda possui ${qtdFinal} itens após tentativa de limpeza.`);
      }
    } catch (err) {
      console.error('[DistrimedRobot] Erro ao limpar carrinho:', err.message);
      throw err;
    }
  }

  /**
   * Cotação em Lote Inteligente com comparação de múltiplas condições comerciais (Unilever, Nívea, Dapa, etc.)
   */
  async cotarLoteDistrimedMultiCondicoes(itens, campanhas = []) {
    if (!this.page) throw new Error('Robô Distrimed não iniciado.');

    const resultados = new Map();

    // 1. Fase 1: Garante que a condição PADRÃO está ativa e cota todos os itens
    await this.ativarCondicaoPadrao();

    console.log(`[DistrimedRobot] Cotando ${itens.length} itens na condição PADRÃO...`);
    for (const item of itens) {
      const resPadrao = await this.cotarEAN(item.ean, item.descricao, { tipo_categoria: item.tipo_categoria });
      resPadrao.condicao_comercial = 'PADRÃO';
      resPadrao.preco_padrao = resPadrao.preco;
      resultados.set(String(item.ean).trim(), resPadrao);
    }

    // Se não houver campanhas cadastradas ou nenhum item, encerra
    if (!campanhas || campanhas.length === 0) {
      return resultados;
    }

    // 2. Fase 2: Agrupa produtos por campanha elegível
    for (const campanha of campanhas) {
      const termos = (campanha.termos_busca || '').split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
      if (termos.length === 0) continue;

      const itensCampanha = itens.filter(item => {
        const desc = (item.descricao || '').toUpperCase();
        return termos.some(termo => desc.includes(termo));
      });

      if (itensCampanha.length === 0) continue;

      console.log(`[DistrimedRobot] Encontrados ${itensCampanha.length} itens elegíveis para campanha "${campanha.nome_opcao}"`);

      // Alterna a condição comercial no portal
      const ativou = await this.selecionarCondicaoComercial(campanha.nome_opcao);
      if (!ativou) {
        console.warn(`[DistrimedRobot] Não foi possível ativar "${campanha.nome_opcao}". Pulando campanha.`);
        continue;
      }

      // Cota os itens nesta condição especial
      const cotacoesCampanha = [];
      let totalValorCampanha = 0;
      let totalQtdCampanha = 0;

      for (const item of itensCampanha) {
        const resCamp = await this.cotarEAN(item.ean, item.descricao, { tipo_categoria: item.tipo_categoria });
        const qtdSugerida = Number(item.quantidade || 1);
        if (resCamp.disponivel && resCamp.preco > 0) {
          totalValorCampanha += (resCamp.preco * qtdSugerida);
          totalQtdCampanha += qtdSugerida;
        }
        cotacoesCampanha.push({ item, resCamp, qtdSugerida });
      }

      // Validação de requisitos mínimos da campanha
      const minimoValor = Number(campanha.minimo_valor || 0);
      const minimoQtd = Number(campanha.minimo_qtd || 0);
      const atendeValor = minimoValor <= 0 || totalValorCampanha >= minimoValor;
      const atendeQtd = minimoQtd <= 0 || totalQtdCampanha >= minimoQtd;

      if (!atendeValor || !atendeQtd) {
        console.log(`[DistrimedRobot] Lote da campanha "${campanha.nome_opcao}" NÃO atingiu os mínimos exigidos (Valor: R$ ${totalValorCampanha.toFixed(2)}/${minimoValor}, Qtd: ${totalQtdCampanha}/${minimoQtd}). Mantendo PADRÃO.`);
        continue;
      }

      // Aplica a condição especial para os itens em que o preço da campanha for menor
      for (const { item, resCamp } of cotacoesCampanha) {
        if (!resCamp.disponivel || !resCamp.preco) continue;
        const eanKey = String(item.ean).trim();
        const resPadrao = resultados.get(eanKey);

        if (!resPadrao || !resPadrao.disponivel || resCamp.preco < resPadrao.preco) {
          const precoPadrao = resPadrao && resPadrao.preco ? resPadrao.preco : resCamp.preco;
          const economiaPct = precoPadrao > resCamp.preco
            ? Number((((precoPadrao - resCamp.preco) / precoPadrao) * 100).toFixed(1))
            : 0;

          resultados.set(eanKey, {
            ...resCamp,
            condicao_comercial: campanha.nome_opcao,
            preco_padrao: precoPadrao,
            economia_campanha_pct: economiaPct,
            mensagem: `Preço reduzido pela campanha ${campanha.nome_opcao} (-${economiaPct}%)`
          });
        }
      }
    }

    // 4. Retorna para a condição PADRÃO
    await this.ativarCondicaoPadrao();

    return resultados;
  }

  async fechar() {
    if (this.browser) {
      console.log('[DistrimedRobot] Fechando navegador...');
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.page = null;
    }
  }
}

module.exports = { DistrimedRobot };
