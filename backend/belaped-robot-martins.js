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
    'MEDIX', 'BRASIL', 'UN', 'UNID', 'CX', 'PDA', 'POM', 'CR', 'CREME', 'FARMAX'
  ]);

  const tokens = s.split(/\s+/).filter(t => t.length >= 2 && !stopWords.has(t));
  return tokens.slice(0, 3).join(' ');
}

/**
 * Robô Oficial de Cotação e Montagem de Pedidos Martins Atacado (BelaPed)
 * Plataforma: https://www.martinsatacado.com.br
 * Pedido Mínimo: R$ 200,00 | Prazo Padrão: 28 dias
 * 
 * Regra Crítica BelaFarma:
 * ⚠️ DESCARTE AUTOMÁTICO DE PRODUTOS DE FORA DO ESTADO (ICMS DIFAL / Outros CDs).
 * Apenas produtos faturados pelo CD de Minas Gerais (Uberlândia/MG) são aceitos.
 * Sessão persistente via userDataDir para salvar autenticação de duas etapas (2FA).
 */
class MartinsRobot {
  constructor(options = {}) {
    this.usuario = options.usuario || '47.378.578/0001-40';
    this.senha = options.senha || 'Drogaria2022@';
    this.headless = options.headless !== undefined ? options.headless : true;
    this.sessionDir = options.sessionDir || path.join(__dirname, '../data/puppeteer_martins');
    this.browser = null;
    this.page = null;
  }

  async iniciar() {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }

    const execPath = findChromeExecutable();
    console.log(`[MartinsRobot] Iniciando navegador com sessão persistente (${this.sessionDir})...`);

    this.browser = await puppeteer.launch({
      headless: this.headless,
      executablePath: execPath,
      userDataDir: this.sessionDir,
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

    // Acessa a home do Martins para verificar se a sessão já está logada
    console.log('[MartinsRobot] Verificando sessão no Martins Atacado...');
    await this.page.goto('https://www.martinsatacado.com.br/', {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });

    await new Promise(r => setTimeout(r, 2000));

    // Checa se já está autenticado
    const isLogado = await this.page.evaluate(() => {
      const text = document.body.innerText || '';
      return text.includes('Minha Conta') || text.includes('Olá, ') || text.includes('Sair') || !text.includes('Entrar');
    });

    if (isLogado) {
      console.log('[MartinsRobot] ✅ Sessão persistente ativa! Usuário já autenticado no Martins Atacado.');
      return;
    }

    // Se não estiver logado, faz o fluxo de autenticação
    console.log('[MartinsRobot] Navegando para página de login pessoa jurídica...');
    await this.page.goto('https://www.martinsatacado.com.br/login/pessoa-juridica?pathName=%2F', {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });

    await new Promise(r => setTimeout(r, 2000));

    // Preenche CNPJ e senha
    try {
      console.log('[MartinsRobot] Preenchendo CNPJ e Senha...');
      await this.page.waitForSelector('input', { timeout: 15000 });

      // Localiza input de CNPJ/E-mail
      const inputs = await this.page.$$('input');
      if (inputs.length >= 2) {
        await inputs[0].click({ clickCount: 3 });
        await inputs[0].type(this.usuario, { delay: 15 });
        await inputs[1].click({ clickCount: 3 });
        await inputs[1].type(this.senha, { delay: 15 });
      }

      // Clica em Continuar
      const botoes = await this.page.$$('button');
      for (const btn of botoes) {
        const txt = await this.page.evaluate(el => el.innerText || '', btn);
        if (txt.includes('Continuar') || txt.includes('Entrar')) {
          await btn.click();
          break;
        }
      }

      await new Promise(r => setTimeout(r, 3500));

      // Verifica se abriu a tela de 2FA (Autenticação de duas etapas)
      const has2FA = await this.page.evaluate(() => {
        const body = document.body.innerText || '';
        return body.includes('Autenticação de duas etapas') || body.includes('duas etapas');
      });

      if (has2FA) {
        console.log('[MartinsRobot] ⚠️ Tela de autenticação em duas etapas detectada!');
        // Clica na opção de E-mail
        await this.page.evaluate(() => {
          const labels = Array.from(document.querySelectorAll('label, div, span'));
          for (const l of labels) {
            if (l.innerText && l.innerText.includes('E-mail') && l.innerText.includes('gmail.com')) {
              l.click();
              const radio = l.querySelector('input[type="radio"]');
              if (radio) radio.checked = true;
              break;
            }
          }
        });

        await new Promise(r => setTimeout(r, 1000));

        // Clica no botão Continuar para disparar o e-mail
        const btns2FA = await this.page.$$('button');
        for (const btn of btns2FA) {
          const txt = await this.page.evaluate(el => el.innerText || '', btn);
          if (txt.includes('Continuar')) {
            await btn.click();
            console.log('[MartinsRobot] ✉️ Código de verificação solicitado com sucesso para o e-mail!');
            break;
          }
        }
      }
    } catch (loginErr) {
      console.warn('[MartinsRobot] Aviso no formulário de login:', loginErr.message);
    }
  }

  /**
   * Conclui a autenticação de duas etapas informando o código de 6 dígitos recebido por e-mail
   */
  async validarCodigo2FA(codigo) {
    if (!this.page) throw new Error('Navegador não iniciado.');
    const codLimpo = String(codigo || '').trim();
    if (!codLimpo) throw new Error('Código de verificação vazio.');

    console.log(`[MartinsRobot] Digitando código de 2FA: ${codLimpo}...`);

    await this.page.evaluate((cod) => {
      const inputs = Array.from(document.querySelectorAll('input'));
      // Se houver 1 campo de código
      const inputCod = inputs.find(i => i.type === 'text' || i.type === 'number' || i.maxLength === 6);
      if (inputCod) {
        inputCod.value = cod;
        inputCod.dispatchEvent(new Event('input', { bubbles: true }));
        inputCod.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // Se houver 6 campos separados de 1 dígito cada
        const inputsDigitos = inputs.filter(i => i.maxLength === 1);
        if (inputsDigitos.length >= cod.length) {
          for (let idx = 0; idx < cod.length; idx++) {
            inputsDigitos[idx].value = cod[idx];
            inputsDigitos[idx].dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      }
    }, codLimpo);

    await new Promise(r => setTimeout(r, 800));

    // Clica no botão Confirmar / Validar / Continuar
    await this.page.evaluate(() => {
      const botoes = Array.from(document.querySelectorAll('button'));
      const btnOk = botoes.find(b => {
        const t = (b.innerText || '').toLowerCase();
        return t.includes('confirmar') || t.includes('continuar') || t.includes('validar') || t.includes('entrar');
      });
      if (btnOk) btnOk.click();
    });

    await new Promise(r => setTimeout(r, 4000));
    console.log('[MartinsRobot] ✅ Autenticação 2FA enviada! A sessão agora está salva permanentemente no disco.');
  }

  /**
   * Consulta um EAN ou Descrição no catálogo do Martins Atacado
   * Aplica a REGRA MASTER DE MG:
   * ❌ Descarta produtos faturados fora de MG (evita DIFAL / CD interestadual)
   */
  async cotarEAN(ean, descricaoProduto = '') {
    if (!this.page) throw new Error('Robô Martins não iniciado.');

    const eanLimpo = String(ean || '').trim();
    const termoLimpo = extrairTermoLimpo(descricaoProduto);

    // 1. Tenta buscar primeiro pelo EAN
    let resultado = await this._executarBuscaMartins(eanLimpo);

    // 2. Se não encontrar pelo EAN e tiver descrição, busca por nome limpo
    if (!resultado.disponivel && termoLimpo) {
      resultado = await this._executarBuscaMartins(termoLimpo);
    }

    return resultado;
  }

  async _executarBuscaMartins(termo) {
    try {
      // 1. Acessa a home ou página de busca e localiza o input
      await this.page.goto('https://www.martinsatacado.com.br/', { waitUntil: 'domcontentloaded', timeout: 35000 });
      await new Promise(r => setTimeout(r, 1500));

      const inputBusca = await this.page.$('input[placeholder*="busc"], input[type="search"], input[name="q"], #search-input');
      if (inputBusca) {
        await inputBusca.click({ clickCount: 3 });
        await inputBusca.type(termo, { delay: 25 });
        await Promise.all([
          this.page.keyboard.press('Enter'),
          this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
        ]);
        await new Promise(r => setTimeout(r, 3000));
      } else {
        const urlBusca = `https://www.martinsatacado.com.br/busca?q=${encodeURIComponent(termo)}`;
        await this.page.goto(urlBusca, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 2500));
      }

      const dadosProduto = await this.page.evaluate(() => {
        const bodyText = document.body.innerText || '';

        // Se nenhum produto foi encontrado
        if (
          bodyText.includes('Nenhum resultado') ||
          bodyText.includes('não encontramos nenhum resultado') ||
          bodyText.includes('Ops! Nenhum produto')
        ) {
          return { disponivel: false, mensagem: 'Produto não encontrado' };
        }

        // ⚠️ REGRA CRÍTICA DE MG: Identifica produtos que vêm de FORA DO ESTADO
        // No Martins, produtos interestaduais exibem tags de CD de outro estado ou aviso de ICMS/DIFAL
        const textoMinusculo = bodyText.toLowerCase();
        const indicadoresForaEstado = [
          'fora do estado',
          'interestadual',
          'cd camaçari',
          'cd ribeirão',
          'cd jaboatão',
          'cd manaus',
          'sujeito a difal',
          'faturamento fora de mg'
        ];

        const isForaDeMg = indicadoresForaEstado.some(ind => textoMinusculo.includes(ind));
        if (isForaDeMg) {
          return {
            disponivel: false,
            mensagem: 'Produto faturado fora de MG (Bloqueado por regra fiscal / DIFAL)'
          };
        }

        // Tenta capturar o card do produto
        const cards = Array.from(document.querySelectorAll('[data-testid*="product"], article, [class*="productCard"], [class*="product-card"], .shelf-item'));
        let cardAlvo = cards[0];
        let cardText = cardAlvo ? cardAlvo.innerText : bodyText;

        // Extrai o preço (ex: R$ 12,50 ou 12,50)
        const matchPreco = cardText.match(/R\$\s*([\d\.]+,\d{2})/i) || cardText.match(/([\d\.]+,\d{2})/);
        if (!matchPreco) {
          return { disponivel: false, mensagem: 'Preço não disponível ou indisponível' };
        }

        const precoNum = parseFloat(matchPreco[1].replace(/\./g, '').replace(',', '.'));
        if (isNaN(precoNum) || precoNum <= 0) {
          return { disponivel: false, mensagem: 'Preço zerado ou inválido' };
        }

        let linkEl = cardAlvo ? cardAlvo.querySelector('a[href*="/p/"], a[href*="produto"], a') : document.querySelector('a[href*="/p/"]');
        let urlProduto = linkEl ? linkEl.href : null;

        let tituloEl = cardAlvo ? cardAlvo.querySelector('h2, h3, [class*="title"], [class*="name"]') : null;
        let descProd = tituloEl ? tituloEl.innerText.trim() : '';

        return {
          disponivel: true,
          preco: precoNum,
          descricao: descProd,
          urlProduto: urlProduto,
          origem: 'MG (Filial Local)'
        };
      });

      return dadosProduto;
    } catch (err) {
      return { disponivel: false, mensagem: `Erro na busca Martins: ${err.message}` };
    }
  }

  /**
   * Adiciona um produto ao carrinho do Martins Atacado
   * (Valida estritamente se o produto é faturado em MG antes de inserir)
   */
  async adicionarAoCarrinho(ean, quantidade, descricaoProduto = '') {
    if (!this.page) throw new Error('Robô Martins não iniciado.');
    const qtdNum = Math.max(1, parseInt(quantidade) || 1);

    try {
      const cotacao = await this.cotarEAN(ean, descricaoProduto);
      if (!cotacao.disponivel) {
        return {
          sucesso: false,
          ean,
          quantidade: qtdNum,
          motivo: cotacao.mensagem || 'Produto indisponível no Martins'
        };
      }

      if (cotacao.urlProduto) {
        await this.page.goto(cotacao.urlProduto, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 1500));
      }

      const adicionou = await this.page.evaluate((qtd) => {
        const inputQtd = document.querySelector('input[type="number"], input[name*="qtd"], input[name*="quantity"]');
        if (inputQtd) {
          inputQtd.focus();
          inputQtd.value = '';
          inputQtd.value = String(qtd);
          inputQtd.dispatchEvent(new Event('input', { bubbles: true }));
          inputQtd.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const botoes = Array.from(document.querySelectorAll('button, a'));
        const btnComprar = botoes.find(b => {
          const t = (b.innerText || '').toLowerCase();
          return t.includes('comprar') || t.includes('adicionar') || t.includes('colocar no carrinho');
        });

        if (btnComprar) {
          btnComprar.click();
          return { sucesso: true };
        }
        return { sucesso: false, motivo: 'Botão comprar não encontrado' };
      }, qtdNum);

      await new Promise(r => setTimeout(r, 2000));
      return {
        sucesso: adicionou.sucesso,
        ean,
        quantidade: qtdNum,
        motivo: adicionou.sucesso ? 'Adicionado com sucesso no carrinho do Martins' : adicionou.motivo
      };
    } catch (err) {
      return {
        sucesso: false,
        ean,
        quantidade: qtdNum,
        motivo: 'Erro ao adicionar item Martins: ' + err.message
      };
    }
  }

  /**
   * Conta quantos itens existem no carrinho do Martins Atacado
   * @returns {Promise<number>}
   */
  async contarItensCarrinho() {
    if (!this.page) throw new Error('Robô Martins não iniciado.');
    try {
      const qtdBadge = await this.page.evaluate(() => {
        const badges = document.querySelectorAll('[class*="cart-badge"], [class*="badge"], [data-testid*="cart-count"], [class*="minicart"] span');
        for (const b of badges) {
          const m = (b.innerText || '').match(/(\d+)/);
          if (m) {
            const n = parseInt(m[1], 10);
            if (!isNaN(n)) return n;
          }
        }
        return null;
      });

      if (qtdBadge !== null) return qtdBadge;

      await this.page.goto('https://www.martinsatacado.com.br/checkout/cart', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await new Promise(r => setTimeout(r, 2000));

      const qtdTela = await this.page.evaluate(() => {
        const text = document.body.innerText || '';
        if (
          text.includes('Seu carrinho está vazio') ||
          text.includes('Carrinho vazio') ||
          text.includes('nenhum produto') ||
          text.includes('0 produtos')
        ) {
          return 0;
        }

        const linhas = document.querySelectorAll('[data-testid*="item"], tr.item, [class*="product-item"], [class*="cart-item"]');
        if (linhas && linhas.length > 0) return linhas.length;

        const botoesRemover = document.querySelectorAll('button[class*="remove"], button[class*="delete"], [data-testid*="remove"]');
        return botoesRemover ? botoesRemover.length : 0;
      });

      return qtdTela;
    } catch (err) {
      console.error('[MartinsRobot] Erro ao contar itens no carrinho:', err.message);
      throw err;
    }
  }

  /**
   * Limpa o carrinho do Martins Atacado e confirma 0 itens
   * @returns {Promise<{ sucesso: boolean, itensRestantes: number }>}
   */
  async limparCarrinho() {
    if (!this.page) throw new Error('Robô Martins não iniciado.');
    try {
      let qtdInicial = await this.contarItensCarrinho();
      if (qtdInicial === 0) {
        console.log('[MartinsRobot] Carrinho já está 100% vazio (0 itens).');
        return { sucesso: true, itensRestantes: 0 };
      }

      console.log(`[MartinsRobot] Limpando carrinho com ${qtdInicial} itens...`);
      await this.page.goto('https://www.martinsatacado.com.br/checkout/cart', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await new Promise(r => setTimeout(r, 2000));

      const clicouGeral = await this.page.evaluate(() => {
        const botoes = Array.from(document.querySelectorAll('button, a'));
        const btnLimpar = botoes.find(b => {
          const t = (b.innerText || '').toLowerCase();
          return t.includes('limpar carrinho') || t.includes('esvaziar carrinho') || t.includes('remover todos');
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
        await new Promise(r => setTimeout(r, 2500));
      } else {
        let tentativas = 0;
        while (tentativas < 100) {
          tentativas++;
          const removeu = await this.page.evaluate(() => {
            const btn = document.querySelector('button[class*="remove"], button[class*="delete"], [data-testid*="remove"], a[class*="remove"]');
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
        console.log('[MartinsRobot] ✅ Carrinho do Martins esvaziado com sucesso (0 itens).');
        return { sucesso: true, itensRestantes: 0 };
      } else {
        throw new Error(`Carrinho do Martins ainda possui ${qtdFinal} itens após tentativa de limpeza.`);
      }
    } catch (err) {
      console.error('[MartinsRobot] Erro ao limpar carrinho:', err.message);
      throw err;
    }
  }

  async fechar() {
    try {
      if (this.browser) {
        await this.browser.close();
      }
    } catch (e) {}
    this.browser = null;
    this.page = null;
  }
}

module.exports = { MartinsRobot };
