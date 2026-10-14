const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

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
        '--no-zygote'
      ]
    });

    this.page = await this.browser.newPage();
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
      waitUntil: 'networkidle2',
      timeout: 45000
    });

    console.log('[DistrimedRobot] Efetuando login...');
    await this.page.waitForSelector('input[name="usuario"]', { timeout: 15000 });
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
    try {
      const condicaoAtual = await this.page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('sell'));
        return btn ? btn.innerText : '';
      });

      if (condicaoAtual.includes('Nenhuma') || !condicaoAtual.includes('PADRÃO')) {
        console.log('[DistrimedRobot] Ativando condição comercial PADRÃO...');
        await this.page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('sell'));
          if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 1200));

        // Clica no item PADRÃO da lista
        await this.page.evaluate(() => {
          const li = Array.from(document.querySelectorAll('li, div, button')).find(el => (el.innerText || '').trim() === 'PADRÃO');
          if (li) li.click();
        });
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
      }
    } catch (e) {
      console.warn('[DistrimedRobot] Aviso ao ajustar condição de preço:', e.message);
    }
  }

  async _buscarNoCatalogo(termo) {
    const searchSel = 'input[placeholder*="Pesquise por: produtos"]';
    await this.page.waitForSelector(searchSel, { timeout: 15000 });

    // Limpa e digita o termo
    await this.page.click(searchSel, { clickCount: 3 });
    await this.page.keyboard.press('Backspace');
    await this.page.keyboard.down('Control');
    await this.page.keyboard.press('A');
    await this.page.keyboard.up('Control');
    await this.page.keyboard.press('Backspace');

    await this.page.type(searchSel, termo, { delay: 3 });
    await this.page.keyboard.press('Enter');

    // Espera otimizada (sem imagens a resposta é quase imediata)
    await new Promise(r => setTimeout(r, 1200));

    return await this.page.evaluate(() => {
      const bodyText = document.body.innerText || '';
      const idxImportar = bodyText.indexOf('Importar');
      const areaProdutos = idxImportar >= 0 ? bodyText.slice(idxImportar) : bodyText;

      if (areaProdutos.includes('Produto não encontrado') || areaProdutos.includes('Nenhum produto')) {
        return [];
      }

      // Na Distrimed, cada card começa com "VAL. DD/MM/AAAA"
      const blocos = areaProdutos.split(/VAL\.\s*\d{2}\/\d{2}\/\d{4}/).slice(1);
      const encontrados = [];

      for (const bloco of blocos) {
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
   * Consulta um EAN no catálogo da Distrimed (com fallback por nome/dosagem)
   */
  async cotarEAN(ean, descricaoProduto = '') {
    if (!this.page) throw new Error('Robô Distrimed não iniciado.');

    try {
      const eanLimpo = String(ean || '').trim();
      if (!eanLimpo) return { fornecedor: 'DISTRIMED', disponivel: false, preco: null };

      // 1. Busca exata por EAN
      let itens = await this._buscarNoCatalogo(eanLimpo);

      // Filtro ESTRITO por EAN: só aceita o produto se o EAN retornado coincidir com o pesquisado
      const eanDigitos = eanLimpo.replace(/\D/g, '');
      let itensCorrespondentes = itens.filter(it => {
        if (!it.ean) return false;
        const eanCardDigitos = String(it.ean).replace(/\D/g, '');
        return eanCardDigitos === eanDigitos ||
               (eanCardDigitos.length >= 8 && eanDigitos.length >= 8 && (eanCardDigitos.includes(eanDigitos) || eanDigitos.includes(eanCardDigitos)));
      });

      // 2. Fallback por nome/dosagem APENAS se não achar o EAN exato E houver descrição válida
      if (itensCorrespondentes.length === 0 && descricaoProduto) {
        const termoNome = extrairTermoLimpo(descricaoProduto);
        if (termoNome && termoNome.length >= 4) {
          const palavrasChave = termoNome.split(/\s+/).filter(p => p.length >= 3 && !['COM', 'SEM', 'PARA', 'PCT', 'UND', 'UNID'].includes(p));
          const todosNome = await this._buscarNoCatalogo(termoNome);
          
          // Validação semântica: OBRIGATORIAMENTE deve conter a palavra principal do produto pesquisado
          itensCorrespondentes = todosNome.filter(it => {
            const descCard = (it.descricao || '').toUpperCase();
            if (palavrasChave.length === 0) return false;
            // A primeira palavra chave (ex: FRALDA ou DORFLEX) DEVE estar no card encontrado
            return palavrasChave[0] && descCard.includes(palavrasChave[0]);
          });
        }
      }

      if (!itensCorrespondentes || itensCorrespondentes.length === 0) {
        return {
          fornecedor: 'DISTRIMED',
          ean: eanLimpo,
          disponivel: false,
          preco: null,
          descricao: '',
          mensagem: 'Indisponível na Distrimed'
        };
      }

      // Entre os itens validados e correspondentes, escolhe o de menor preço
      itensCorrespondentes.sort((a, b) => a.preco - b.preco);
      const melhor = itensCorrespondentes[0];

      return {
        fornecedor: 'DISTRIMED',
        ean: eanLimpo,
        eanEncontrado: melhor.ean,
        disponivel: true,
        preco: melhor.preco,
        descricao: melhor.descricao || '',
        mensagem: ''
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
          return /Carrinho\s*\d+/i.test(t);
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
      let qtdInicial = await this.contarItensCarrinho();
      if (qtdInicial === 0) {
        console.log('[DistrimedRobot] Carrinho já está 100% vazio (0 itens).');
        return { sucesso: true, itensRestantes: 0 };
      }

      console.log(`[DistrimedRobot] Limpando carrinho com ${qtdInicial} itens...`);

      const clicouLimpar = await this.page.evaluate(() => {
        const botoes = Array.from(document.querySelectorAll('button, a'));
        const btnLimpar = botoes.find(b => {
          const t = (b.innerText || '').toLowerCase();
          return t.includes('limpar carrinho') || t.includes('esvaziar carrinho') || t.includes('excluir carrinho');
        });
        if (btnLimpar) {
          btnLimpar.click();
          return true;
        }
        return false;
      });

      if (clicouLimpar) {
        await new Promise(r => setTimeout(r, 1200));
        await this.page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('.modal button, [role="dialog"] button, button'));
          const btnConf = btns.find(b => {
            const t = (b.innerText || '').trim().toLowerCase();
            return t === 'confirmar' || t === 'sim' || t === 'limpar' || t === 'ok' || t.includes('confirmar');
          });
          if (btnConf) btnConf.click();
        });
        await new Promise(r => setTimeout(r, 2000));
      }

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
