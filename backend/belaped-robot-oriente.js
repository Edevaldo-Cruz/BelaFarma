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
 * Identifica a condição comercial ideal na Oriente Farma com base na descrição ou categoria do item
 */
function identificarCondicaoIdeal(descricao = '') {
  const d = String(descricao || '').toUpperCase();
  // Regra Unilever
  const termosUnilever = [
    'UNILEVER', 'DOVE', 'REXONA', 'SEDA', 'TRESEMME', 'LUX', 'CLEAR', 'CLOSE UP', 
    'CLOSE-UP', 'BABY DOVE', 'SUAVE', 'VASELINA'
  ];
  if (termosUnilever.some(t => d.includes(t))) {
    return 'UNILEVER';
  }

  // Regra Verão (protetor solar, bronzeador, pós sol, etc.)
  const termosVerao = [
    'PROTETOR SOLAR', 'BLOQUEADOR SOLAR', 'BRONZEADOR', 'POS SOL', 'PÓS-SOL', 
    'SUNDOWN', 'CENOURA & BRONZE', 'CENOURA E BRONZE', 'AUSTRALIAN GOLD', 
    'NEUTROGENA SUN', 'EPISOL', 'ANTHELIOS', 'MINESOL', 'FPS '
  ];
  if (termosVerao.some(t => d.includes(t))) {
    return 'VERAO';
  }

  return 'GERAL';
}

/**
 * Módulo de Automação e Raspagem B2B da Oriente Farma (BelaPed)
 * URL: https://pedidoweb.orientefarma.com.br
 */
class OrienteRobot {
  constructor(options = {}) {
    this.usuario = options.usuario || 'belafarmasul@gmail.com';
    this.senha = options.senha || 'Bfs@882494';
    this.headless = options.headless !== undefined ? options.headless : true;
    this.condicaoComercial = options.condicaoComercial || 'GERAL'; // 'GERAL' | 'VERAO' | 'UNILEVER'
    this.browser = null;
    this.page = null;
  }

  async iniciar(options = {}) {
    if (options.condicaoComercial) {
      this.condicaoComercial = options.condicaoComercial;
    }

    const execPath = findChromeExecutable();
    console.log(`[OrienteRobot] Iniciando navegador Puppeteer (${execPath || 'default'})...`);
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

    // Bloqueia imagens pesadas para cotação mais rápida
    await this.page.setRequestInterception(true);
    this.page.on('request', (req) => {
      const type = req.resourceType();
      if (type === 'image' || type === 'media' || type === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });

    console.log('[OrienteRobot] Acessando autenticação da Oriente Farma...');
    try {
      await this.page.goto('https://pedidoweb.orientefarma.com.br/auth/login', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
    } catch (e) {
      console.warn('[OrienteRobot] Timeout inicial, prosseguindo...');
    }

    console.log('[OrienteRobot] Efetuando login...');
    await this.page.waitForSelector('input#email', { timeout: 25000 });
    await this.page.type('input#email', this.usuario, { delay: 10 });
    await this.page.type('input#senha', this.senha, { delay: 10 });

    await this.page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').trim() === 'Entrar');
      if (btn) btn.click();
    });

    // 1. Confirma Loja (DROGARIA BELO AURORA PRIMUS LTDA)
    console.log('[OrienteRobot] Aguardando modal de Loja...');
    await new Promise(r => setTimeout(r, 3500));
    await this.page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').toLowerCase().includes('confirmar'));
      if (btn) btn.click();
    });

    // 2. Confirma Condição Comercial
    console.log(`[OrienteRobot] Selecionando Condição Comercial: ${this.condicaoComercial}...`);
    await new Promise(r => setTimeout(r, 2500));
    await this.page.evaluate((cond) => {
      const allDivs = Array.from(document.querySelectorAll('div, label, li, button'));
      let opt = null;
      if (cond === 'VERAO') {
        opt = allDivs.find(d => (d.innerText || '').includes('VERAO') || (d.innerText || '').includes('4774'));
      } else if (cond === 'UNILEVER') {
        opt = allDivs.find(d => (d.innerText || '').includes('UNILEVER') || (d.innerText || '').includes('18'));
      } else {
        opt = allDivs.find(d => (d.innerText || '').includes('PE ORIENTE FARMA') && (d.innerText || '').includes('96'));
      }
      if (opt) opt.click();
    }, this.condicaoComercial);

    await new Promise(r => setTimeout(r, 600));
    await this.page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').toLowerCase().includes('confirmar'));
      if (btn) btn.click();
    });

    await new Promise(r => setTimeout(r, 3000));

    // Fecha banner de cookies se existir
    await this.page.evaluate(() => {
      const btnCookie = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').includes('Aceitar Todos'));
      if (btnCookie) btnCookie.click();
    });

    // Navega para a grade de pedidos
    console.log('[OrienteRobot] Navegando para o catálogo de Criar Pedido...');
    try {
      await this.page.goto('https://pedidoweb.orientefarma.com.br/pedidos', {
        waitUntil: 'networkidle2',
        timeout: 45000
      });
    } catch (e) {
      console.warn('[OrienteRobot] Timeout ao navegar para /pedidos:', e.message);
    }

    await this.page.waitForSelector('input[placeholder*="Filtrar produtos" i]', { timeout: 20000 });
    console.log('[OrienteRobot] ✅ Login e inicialização da Oriente Farma concluídos com sucesso!');
  }

  /**
   * Cota um EAN no catálogo da Oriente Farma
   */
  async cotarEAN(ean, descricaoProduto = '') {
    if (!this.page) throw new Error('Robô Oriente Farma não iniciado.');

    try {
      const eanLimpo = String(ean || '').trim();
      if (!eanLimpo) {
        return { fornecedor: 'ORIENTE FARMA', disponivel: false, preco: null, motivo: 'EAN_VAZIO' };
      }

      // Certifica que está na página de pedidos
      if (!this.page.url().includes('/pedidos')) {
        await this.page.goto('https://pedidoweb.orientefarma.com.br/pedidos', {
          waitUntil: 'networkidle2',
          timeout: 30000
        });
      }

      const inputSelector = 'input[placeholder*="Filtrar produtos" i]';
      await this.page.waitForSelector(inputSelector, { timeout: 10000 });

      await this.page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) el.focus();
      }, inputSelector);
      await this.page.focus(inputSelector).catch(() => {});
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('A');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');
      await this.page.type(inputSelector, eanLimpo, { delay: 15 });
      await this.page.keyboard.press('Enter');

      // Aguarda tabela filtrar
      await new Promise(r => setTimeout(r, 1800));

      const dados = await this.page.evaluate((eanAlvo) => {
        const rows = Array.from(document.querySelectorAll('table tbody tr'));
        if (rows.length === 0) {
          return { encontrado: false, motivo: 'SEM_RESULTADOS' };
        }

        // Validação estrita de EAN: busca linha que tenha o EAN exato
        for (const row of rows) {
          const text = row.innerText || '';
          
          // EAN costuma estar na coluna de código ou no texto geral
          if (!text.includes(eanAlvo)) {
            continue;
          }

          // Se estiver indisponível ou esgotado
          if (text.includes('Indisponível') || text.includes('Esgotado') || text.includes('Sem estoque')) {
            return { encontrado: false, motivo: 'SEM_ESTOQUE' };
          }

          // Extração do preço líquido:
          // Na tabela da Oriente o "Preço Líq." aparece com "R$ 0,38"
          // Exemplo de texto: "... R$ 1,02 | P.F: R$ 0,72 | 47.08% | R$ 0,38 | ST: R$ 0,03 ..."
          const partesReais = text.match(/R\$\s*([\d\.,]+)/g) || [];
          if (partesReais.length === 0) continue;

          // Extração específica por células
          const cells = Array.from(row.querySelectorAll('td')).map(c => (c.innerText || '').trim());
          
          let precoLiq = null;
          let pmc = null;
          let descontoPct = null;
          let estoqueDesc = null;
          let emb = null;
          let codOriente = null;
          let descricaoItem = null;

          // Se temos colunas estruturadas:
          // [0] Imagem, [1] Código + EAN, [2] Descrição, [3] Condição, [4] Emb, [5] Estoque, [6] PMC, [7] Desc, [8] Preço Líq, [9] Qtd, [10] Subtotal
          if (cells.length >= 9) {
            codOriente = cells[1].split('\n')[0] || null;
            descricaoItem = cells[2].split('\n')[0] || '';
            emb = parseInt(cells[4].replace(/\D/g, ''), 10) || 1;
            estoqueDesc = cells[5].replace(/\n+/g, ' ');
            
            const matchPmc = cells[6].match(/R\$\s*([\d\.,]+)/);
            if (matchPmc) pmc = parseFloat(matchPmc[1].replace(/\./g, '').replace(',', '.'));

            const matchDesc = cells[7].match(/([\d\.,]+)%/);
            if (matchDesc) descontoPct = parseFloat(matchDesc[1].replace(',', '.'));

            const matchPreco = cells[8].match(/R\$\s*([\d\.,]+)/);
            if (matchPreco) precoLiq = parseFloat(matchPreco[1].replace(/\./g, '').replace(',', '.'));
          } else {
            // Fallback via regex no texto da linha
            const matchDesc = text.match(/([\d\.,]+)%/);
            if (matchDesc) descontoPct = parseFloat(matchDesc[1].replace(',', '.'));

            // Último ou penúltimo R$ antes do subtotal costuma ser o preço líquido
            const precos = partesReais.map(p => parseFloat(p.replace(/[^\d,]/g, '').replace(',', '.'))).filter(n => !isNaN(n) && n > 0);
            if (precos.length > 0) {
              precoLiq = precos[precos.length - 1]; // Menor ou último
            }
          }

          if (precoLiq && precoLiq > 0) {
            return {
              encontrado: true,
              ean: eanAlvo,
              codigo: codOriente,
              descricao: descricaoItem || text.slice(0, 100),
              preco: precoLiq,
              pmc,
              desconto: descontoPct,
              estoque: estoqueDesc || 'Disponível',
              embalagem: emb || 1
            };
          }
        }

        return { encontrado: false, motivo: 'EAN_DIVERGENTE_OU_SEM_PRECO' };
      }, eanLimpo);

      if (!dados.encontrado || !dados.preco) {
        return {
          fornecedor: 'ORIENTE FARMA',
          disponivel: false,
          preco: null,
          motivo: dados.motivo || 'NAO_ENCONTRADO'
        };
      }

      // Validação semântica adicional
      if (descricaoProduto && dados.descricao) {
        const check = validarCorrespondenciaProduto(descricaoProduto, dados.descricao);
        if (!check.valido) {
          console.warn(`[OrienteRobot] ⚠️ Divergência semântica para EAN ${eanLimpo}: ${check.motivo}`);
          return {
            fornecedor: 'ORIENTE FARMA',
            disponivel: false,
            preco: null,
            motivo: check.motivo
          };
        }
      }

      return {
        fornecedor: 'ORIENTE FARMA',
        disponivel: true,
        ean: dados.ean,
        codigo: dados.codigo,
        descricao: dados.descricao,
        preco: Number(dados.preco.toFixed(2)),
        preco_unitario: Number(dados.preco.toFixed(2)),
        pmc: dados.pmc ? Number(dados.pmc.toFixed(2)) : null,
        desconto: dados.desconto,
        estoque: dados.estoque,
        embalagem: dados.embalagem
      };

    } catch (err) {
      console.error(`[OrienteRobot] Erro ao cotar EAN ${ean}:`, err.message);
      return {
        fornecedor: 'ORIENTE FARMA',
        disponivel: false,
        preco: null,
        motivo: `ERRO_ROBO: ${err.message}`
      };
    }
  }

  /**
   * Adiciona um produto ao carrinho da Oriente Farma
   */
  async adicionarAoCarrinho(ean, quantidade, descricao = '') {
    if (!this.page) throw new Error('Robô Oriente Farma não iniciado.');

    try {
      const eanLimpo = String(ean || '').trim();
      const qtdDesejada = parseInt(quantidade, 10) || 1;

      console.log(`[OrienteRobot] Adicionando EAN ${eanLimpo} (Qtd: ${qtdDesejada}) ao carrinho...`);

      // Garante que está na grade de pedidos
      if (!this.page.url().includes('/pedidos')) {
        await this.page.goto('https://pedidoweb.orientefarma.com.br/pedidos', {
          waitUntil: 'networkidle2',
          timeout: 30000
        });
      }

      const inputSelector = 'input[placeholder*="Filtrar produtos" i]';
      await this.page.waitForSelector(inputSelector, { timeout: 10000 });

      // Digita o EAN na busca da grade
      await this.page.click(inputSelector);
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('A');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');
      await this.page.type(inputSelector, eanLimpo, { delay: 15 });
      await this.page.keyboard.press('Enter');

      await new Promise(r => setTimeout(r, 1800));

      // Localiza a linha do produto com validação estrita de EAN
      const rowHandle = await this.page.evaluateHandle((eanAlvo) => {
        const rows = Array.from(document.querySelectorAll('table tbody tr'));
        return rows.find(r => (r.innerText || '').includes(eanAlvo)) || null;
      }, eanLimpo);

      if (!rowHandle || !rowHandle.asElement()) {
        throw new Error(`Produto EAN ${eanLimpo} não encontrado na grade para adicionar.`);
      }

      // Localiza o input de quantidade dentro da linha
      const inputQtdHandle = await rowHandle.asElement().$('input[type="number"]');
      if (!inputQtdHandle) {
        throw new Error(`Campo de quantidade não encontrado para EAN ${eanLimpo}.`);
      }

      await inputQtdHandle.click();
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('A');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');
      await this.page.keyboard.type(String(qtdDesejada), { delay: 20 });
      await this.page.keyboard.press('Tab');

      // Aguarda confirmação de produto adicionado
      await new Promise(r => setTimeout(r, 2000));

      console.log(`[OrienteRobot] ✅ EAN ${eanLimpo} adicionado com sucesso (Qtd: ${qtdDesejada}).`);
      return {
        sucesso: true,
        ean: eanLimpo,
        quantidadeAdicionada: qtdDesejada
      };

    } catch (err) {
      console.error(`[OrienteRobot] Erro ao adicionar EAN ${ean} ao carrinho:`, err.message);
      return {
        sucesso: false,
        ean,
        erro: err.message
      };
    }
  }

  /**
   * Conta o total de itens no carrinho da Oriente Farma
   * @returns {Promise<number>}
   */
  async contarItensCarrinho() {
    if (!this.page) throw new Error('Robô Oriente Farma não iniciado.');

    try {
      if (!this.page.url().includes('/carrinho')) {
        await this.page.goto('https://pedidoweb.orientefarma.com.br/carrinho', {
          waitUntil: 'networkidle2',
          timeout: 30000
        });
        await new Promise(r => setTimeout(r, 1500));
      }

      const totalItens = await this.page.evaluate(() => {
        const bodyText = document.body.innerText || '';
        if (bodyText.includes('Seu carrinho está vazio')) {
          return 0;
        }

        // Procura por "Meu Carrinho (X produto"
        const matchTitle = bodyText.match(/Meu Carrinho\s*\(\s*(\d+)\s*produto/i);
        if (matchTitle) {
          return parseInt(matchTitle[1], 10);
        }

        // Conta botões de lixeira de itens na lista
        const trashBtns = Array.from(document.querySelectorAll('button')).filter(b => {
          return b.querySelector('svg.lucide-trash, svg.lucide-trash-2') ||
                 (b.className || '').includes('text-red');
        });
        if (trashBtns.length > 0) return trashBtns.length;

        return 0;
      });

      return totalItens;

    } catch (err) {
      console.error('[OrienteRobot] Erro ao contar itens no carrinho:', err.message);
      throw err;
    }
  }

  /**
   * Esvazia o carrinho da Oriente Farma e confirma 0 itens
   * @returns {Promise<{ sucesso: boolean, itensRestantes: number }>}
   */
  async limparCarrinho() {
    if (!this.page) throw new Error('Robô Oriente Farma não iniciado.');

    try {
      console.log('[OrienteRobot] Acessando carrinho para verificar e limpar...');
      await this.page.goto('https://pedidoweb.orientefarma.com.br/carrinho', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      await new Promise(r => setTimeout(r, 1500));

      let qtdInicial = await this.contarItensCarrinho();
      if (qtdInicial === 0) {
        console.log('[OrienteRobot] ✅ Carrinho Oriente Farma já está 100% vazio (0 itens).');
        return { sucesso: true, itensRestantes: 0 };
      }

      console.log(`[OrienteRobot] Limpando carrinho Oriente com ${qtdInicial} itens...`);

      // Clica no botão "Limpar"
      const clicouLimpar = await this.page.evaluate(() => {
        const btnLimpar = Array.from(document.querySelectorAll('button')).find(b => {
          const t = (b.innerText || '').toLowerCase().trim();
          return t === 'limpar' || t.includes('limpar carrinho');
        });
        if (btnLimpar) {
          btnLimpar.click();
          return true;
        }
        return false;
      });

      if (clicouLimpar) {
        await new Promise(r => setTimeout(r, 1000));
        // Se abrir modal de confirmação
        await this.page.evaluate(() => {
          const modalBtn = Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => {
            const t = (b.innerText || '').toLowerCase();
            return t.includes('confirmar') || t.includes('sim') || t.includes('limpar') || t.includes('excluir');
          });
          if (modalBtn) modalBtn.click();
        });
      }

      // Aguarda até 4 segundos para esvaziar
      await new Promise(r => setTimeout(r, 2500));

      const qtdFinal = await this.contarItensCarrinho();
      if (qtdFinal === 0) {
        console.log('[OrienteRobot] ✅ Carrinho Oriente Farma esvaziado com sucesso (0 itens).');
        return { sucesso: true, itensRestantes: 0 };
      } else {
        // Fallback: tenta remover item por item pelas lixeiras
        console.log('[OrienteRobot] Tentando remoção item a item por lixeira...');
        for (let i = 0; i < 50; i++) {
          const removeuUm = await this.page.evaluate(() => {
            const trash = Array.from(document.querySelectorAll('button')).find(b => {
              return b.querySelector('svg.lucide-trash, svg.lucide-trash-2') || (b.className || '').includes('text-red');
            });
            if (trash) {
              trash.click();
              return true;
            }
            return false;
          });
          if (!removeuUm) break;
          await new Promise(r => setTimeout(r, 400));
        }

        const qtdPosLixeira = await this.contarItensCarrinho();
        if (qtdPosLixeira === 0) {
          console.log('[OrienteRobot] ✅ Carrinho Oriente Farma esvaziado via lixeiras (0 itens).');
          return { sucesso: true, itensRestantes: 0 };
        } else {
          throw new Error(`Carrinho Oriente Farma ainda possui ${qtdPosLixeira} itens após limpeza.`);
        }
      }

    } catch (err) {
      console.error('[OrienteRobot] Erro ao limpar carrinho:', err.message);
      throw err;
    }
  }

  async fechar() {
    if (this.browser) {
      console.log('[OrienteRobot] Encerrando navegador Oriente Farma...');
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.page = null;
    }
  }
}

module.exports = { OrienteRobot, identificarCondicaoIdeal };
