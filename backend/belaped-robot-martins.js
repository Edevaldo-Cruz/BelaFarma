const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
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
   * Consulta um EAN ou Descrição no catálogo do Martins Atacado com busca por essência e menor preço
   * Aplica a REGRA MASTER DE MG: Descarta produtos faturados fora de MG
   */
  async cotarEAN(ean, descricaoProduto = '', opts = {}) {
    if (!this.page) throw new Error('Robô Martins não iniciado.');

    const eanLimpo = String(ean || '').trim();
    if (!eanLimpo) return { fornecedor: 'MARTINS ATACADO', disponivel: false, preco: null };

    // 1. Busca por EAN original no portal com validação estrita
    const itensEan = await this._executarBuscaMartins(eanLimpo);
    const eanDigitos = eanLimpo.replace(/\D/g, '');
    const itensCorrespondentes = (itensEan || []).filter(it => {
      if (!it.ean) {
        if (it.urlProduto && it.urlProduto.includes(eanDigitos)) return true;
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

    // Se já achou pelo EAN original, ou se o item é um medicamento tarjado que atacado geral não vende, não precisa de 2ª busca
    const isMedicamentoTarjado = /\b(\d+\s*(?:MG|MCG|G|ML)|CPR|COMP|CAPS|XPE|INJ|GOTAS|AMPOLA|SOL(?:UCAO)?)\b/i.test(descricaoProduto);

    if (cotarPorEssencia && !isMedicamentoTarjado && (!melhorEanOriginal || melhorEanOriginal.preco > 50)) {
      try {
        const prep = motorEssencia.prepararBuscaEssencia(eanLimpo, descricaoProduto);
        if (prep.termoBusca && prep.termoBusca.length >= 3) {
          const itensEssencia = await this._executarBuscaMartins(prep.termoBusca);
          for (const it of (itensEssencia || [])) {
            if (!todosCandidatos.some(existente => existente.descricao === it.descricao && existente.preco === it.preco)) {
              todosCandidatos.push(it);
            }
          }
        }
      } catch (eGen) {
        console.warn('[MartinsRobot] Aviso na busca por essência:', eGen.message);
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
        fornecedor: 'MARTINS ATACADO',
        ean: eanLimpo,
        disponivel: false,
        preco: null,
        mensagem: 'Sem estoque ou indisponível em MG no Martins'
      };
    }

    const isSubstituto = Boolean(vencedor.isSubstituto);

    if (!isSubstituto && vencedor.ean) {
      const vencDigitos = String(vencedor.ean).replace(/\D/g, '');
      const bateEan = vencDigitos === eanDigitos ||
                     (vencDigitos.length === 14 && eanDigitos.length === 13 && vencDigitos === '0' + eanDigitos) ||
                     (eanDigitos.length === 14 && vencDigitos.length === 13 && eanDigitos === '0' + vencDigitos);
      if (!bateEan) {
        console.warn(`[MartinsRobot] ⛔ Rejeitando item com EAN divergente: esperado "${eanDigitos}" vs encontrado "${vencDigitos}"`);
        return {
          fornecedor: 'MARTINS ATACADO',
          ean: eanLimpo,
          disponivel: false,
          preco: null,
          mensagem: 'EAN divergente no catálogo do Martins Atacado'
        };
      }
    }

    return {
      fornecedor: 'MARTINS ATACADO',
      ean: vencedor.ean || eanLimpo,
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
      urlProduto: vencedor.urlProduto || `https://www.martinsatacado.com.br/busca?q=${encodeURIComponent(vencedor.ean || eanLimpo)}`,
      origem: 'MG (Filial Local)',
      mensagem: isSubstituto ? `Opção mais barata (${vencedor.laboratorio || ''} - R$ ${vencedor.preco.toFixed(2)})` : ''
    };
  }

  async _executarBuscaMartins(termo) {
    try {
      const urlBusca = `https://www.martinsatacado.com.br/busca?q=${encodeURIComponent(termo)}`;
      await this.page.goto(urlBusca, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 1200));

      return await this.page.evaluate(() => {
        const bodyText = document.body.innerText || '';
        if (
          bodyText.includes('Nenhum resultado') ||
          bodyText.includes('não encontramos nenhum resultado') ||
          bodyText.includes('Ops! Nenhum produto')
        ) {
          return [];
        }

        const cards = Array.from(document.querySelectorAll('[data-testid*="product"], article, [class*="productCard"], [class*="product-card"], .shelf-item'));
        const resultados = [];

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

        for (const card of cards) {
          const cardText = card ? card.innerText : '';
          const cardMinusculo = cardText.toLowerCase();

          // Ignora itens faturados fora de MG
          if (indicadoresForaEstado.some(ind => cardMinusculo.includes(ind))) {
            continue;
          }

          // Checagem de estoque no card do Martins
          if (
            cardMinusculo.includes('esgotado') ||
            cardMinusculo.includes('indisponível') ||
            cardMinusculo.includes('indisponivel') ||
            cardMinusculo.includes('sem estoque') ||
            cardMinusculo.includes('avise-me') ||
            cardMinusculo.includes('avise me') ||
            cardMinusculo.includes('fora de estoque')
          ) {
            continue;
          }

          const matchPreco = cardText.match(/R\$\s*([\d\.]+,\d{2})/i);
          if (!matchPreco) continue;

          const precoNum = parseFloat(matchPreco[1].replace(/\./g, '').replace(',', '.'));
          if (isNaN(precoNum) || precoNum <= 0) continue;

          const linkEl = card.querySelector('a[href*="/p/"], a[href*="produto"], a');
          const urlProd = linkEl ? linkEl.href : null;

          const tituloEl = card.querySelector('h2, h3, [class*="title"], [class*="name"]');
          const descProd = tituloEl ? tituloEl.innerText.trim() : '';

          // Tenta extrair EAN se houver no card
          const matchEan = cardText.match(/\b\d{8,14}\b/);
          const eanItem = matchEan ? matchEan[0] : null;

          resultados.push({
            ean: eanItem,
            descricao: descProd,
            preco: precoNum,
            urlProduto: urlProd,
            origem: 'MG (Filial Local)'
          });
        }

        return resultados;
      });
    } catch (err) {
      console.warn(`[MartinsRobot] Erro na busca:`, err.message);
      return [];
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
