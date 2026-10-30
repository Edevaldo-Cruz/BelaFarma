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
      const allEls = Array.from(document.querySelectorAll('div, label, li, button')).filter(
        el => (el.innerText || '').trim().length > 0 && (el.innerText || '').trim().length < 90
      );
      let opt = null;
      if (cond === 'VERAO') {
        opt = allEls.find(d => (d.innerText || '').includes('VERAO') || (d.innerText || '').includes('4774'));
      } else if (cond === 'UNILEVER') {
        opt = allEls.find(d => (d.innerText || '').includes('UNILEVER') && (d.innerText || '').includes('18'));
      } else {
        opt = allEls.find(d => (d.innerText || '').includes('PE ORIENTE FARMA') && (d.innerText || '').includes('96'));
      }
      if (opt) opt.click();
    }, this.condicaoComercial);

    await new Promise(r => setTimeout(r, 600));
    await this.page.evaluate((cond) => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').toLowerCase().includes('confirmar'));
      if (btn) btn.click();
      // Garante também no localStorage a condição selecionada
      if (cond !== 'VERAO' && cond !== 'UNILEVER') {
        try {
          localStorage.setItem('oriente-condicao-mae', JSON.stringify({
            codigo: 96,
            descricao: 'PE ORIENTE FARMA',
            categoria: 'S',
            minValor: 450,
            skuMinimo: 0,
            qtdMinima: 0,
            parcelaMinima: 150
          }));
        } catch (_) {}
      }
    }, this.condicaoComercial);

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
   * Obtém o código numérico da condição comercial ativa na Oriente Farma
   */
  _obterCodigoCondicao() {
    if (this.condicaoComercial === 'VERAO') return 4774;
    if (this.condicaoComercial === 'UNILEVER') return 18;
    return 96; // PE ORIENTE FARMA (GERAL)
  }

  async buscarTermo(termo) {
    return await this._filtrarTabelaOriente(termo);
  }

  /**
   * Filtra e extrai os produtos da Oriente Farma (Modo Turbo via API REST Direta + Fallback DOM)
   */
  async _filtrarTabelaOriente(termo) {
    if (!this.page || !termo) return [];

    // 1. MODO TURBO: Requisição direta na API JSON da Oriente Farma (~250ms)
    const codCondicao = this._obterCodigoCondicao();
    try {
      const resApi = await this.page.evaluate(async (termoBusca, condicao) => {
        try {
          let codCliente = 299103;
          try {
            const authUser = JSON.parse(localStorage.getItem('oriente-auth-user') || '{}');
            if (authUser?.state?.clienteSelecionado) {
              codCliente = authUser.state.clienteSelecionado;
            }
          } catch (_) {}

          const url = `/api/produtos/condicao/${condicao}?codigoCliente=${codCliente}&termo=${encodeURIComponent(termoBusca)}&pagina=1&tamanhoPagina=50&apenasComEstoque=true&ordenarPor=5&diasRetroativos=100`;
          const resp = await fetch(url, { method: 'GET', credentials: 'include' });
          if (!resp.ok) return { ok: false, status: resp.status };
          const data = await resp.json();
          if (!data || !Array.isArray(data.produtos)) return { ok: false };

          const itens = [];
          for (const p of data.produtos) {
            const qtdEstoque = p.estoque && typeof p.estoque.quantidade === 'number' ? p.estoque.quantidade : 1;
            const nivel = String(p.nivelEstoque || '').toUpperCase();
            if (p.ativo === false || qtdEstoque <= 0 || nivel.includes('INDISPON') || nivel.includes('ESGOTADO') || nivel.includes('ZERO')) {
              continue;
            }
            const precoLiq = Number(p.precoFinal || p.valor || (p.melhorPreco && p.melhorPreco.precoFinal) || 0);
            const precoComSt = Number(p.precoComSt || 0);
            const valorSt = Number(p.valorSt || 0);
            const precoNF = precoComSt > 0 ? precoComSt : (precoLiq + valorSt > precoLiq ? Number((precoLiq + valorSt).toFixed(2)) : precoLiq);
            if (precoNF > 0) {
              itens.push({
                ean: p.codigoBarras ? String(p.codigoBarras).trim() : null,
                codigo: p.codigoProduto ? String(p.codigoProduto) : null,
                descricao: p.descricao || '',
                laboratorio: p.nomeFantasiaFornecedor ? String(p.nomeFantasiaFornecedor).trim() : null,
                preco: precoNF,
                preco_nf: precoNF,
                preco_liquido: precoLiq,
                valor_st: valorSt,
                pmc: p.pmc ? Number(p.pmc) : null,
                desconto: p.desconto ? Number(p.desconto) : null,
                estoque: p.nivelEstoque || 'Disponível',
                embalagem: Number(p.embalagem) || 1
              });
            }
          }
          return { ok: true, itens };
        } catch (err) {
          return { ok: false, error: err.message };
        }
      }, String(termo).trim(), codCondicao);

      if (resApi && resApi.ok && Array.isArray(resApi.itens)) {
        return resApi.itens;
      }
    } catch (apiErr) {
      console.warn('[OrienteRobot] Fallback para DOM após aviso na API direta:', apiErr.message);
    }

    // 2. FALLBACK DOM: Caso a chamada direta falhe
    try {
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
      await this.page.type(inputSelector, termo, { delay: 15 });
      await this.page.keyboard.press('Enter');

      await new Promise(r => setTimeout(r, 1800));

      return await this.page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table tbody tr'));
        const resultados = [];

        for (const row of rows) {
          const text = row.innerText || '';
          if (text.includes('Indisponível') || text.includes('Esgotado') || text.includes('Sem estoque')) {
            continue;
          }

          const cells = Array.from(row.querySelectorAll('td')).map(c => (c.innerText || '').trim());
          let codOriente = null;
          let eanItem = null;
          let descricaoItem = '';
          let precoLiq = null;
          let pmc = null;
          let descontoPct = null;
          let estoqueDesc = 'Disponível';
          let emb = 1;

          if (cells.length >= 9) {
            const linhaCod = cells[1].split('\n').map(s => s.trim()).filter(Boolean);
            codOriente = linhaCod[0] || null;
            const matchEan = cells[1].match(/\b\d{8,14}\b/) || text.match(/\b\d{8,14}\b/);
            if (matchEan) eanItem = matchEan[0];

            descricaoItem = cells[2].split('\n')[0] || '';
            emb = parseInt(cells[4].replace(/\D/g, ''), 10) || 1;
            estoqueDesc = cells[5].replace(/\n+/g, ' ');

            const matchPmc = cells[6].match(/R\$\s*([\d\.,]+)/);
            if (matchPmc) pmc = parseFloat(matchPmc[1].replace(/\./g, '').replace(',', '.'));

            const matchDesc = cells[7].match(/([\d\.,]+)%/);
            if (matchDesc) descontoPct = parseFloat(matchDesc[1].replace(',', '.'));

            const matchPreco = cells[8].match(/R\$\s*([\d\.,]+)/);
            if (matchPreco) precoLiq = parseFloat(matchPreco[1].replace(/\./g, '').replace(',', '.'));

            let valorSt = 0;
            const matchSt = cells[8].match(/ST:\s*R\$\s*([\d\.,]+)/i);
            if (matchSt) valorSt = parseFloat(matchSt[1].replace(/\./g, '').replace(',', '.'));

            const precoNF = (precoLiq || 0) + (valorSt || 0);
          }

          if (precoLiq && precoLiq > 0) {
            const precoFinalNF = precoNF > 0 ? Number(precoNF.toFixed(2)) : precoLiq;
            resultados.push({
              ean: eanItem,
              codigo: codOriente,
              descricao: descricaoItem || text.slice(0, 100),
              preco: precoFinalNF,
              preco_nf: precoFinalNF,
              preco_liquido: precoLiq,
              valor_st: valorSt,
              pmc,
              desconto: descontoPct,
              estoque: estoqueDesc,
              embalagem: emb
            });
          }
        }
        return resultados;
      });
    } catch (e) {
      console.warn('[OrienteRobot] Erro ao filtrar tabela:', e.message);
      return [];
    }
  }

  /**
   * Cota um EAN no catálogo da Oriente Farma com busca por essência e menor preço geral
   */
  async cotarEAN(ean, descricaoProduto = '', opts = {}) {
    if (!this.page) throw new Error('Robô Oriente Farma não iniciado.');

    try {
      const eanLimpo = String(ean || '').trim();
      if (!eanLimpo) {
        return { fornecedor: 'ORIENTE FARMA', disponivel: false, preco: null, motivo: 'EAN_VAZIO' };
      }

      // 1. Busca por EAN original no portal
      const itensEan = await this._filtrarTabelaOriente(eanLimpo);
      const eanDigitos = eanLimpo.replace(/\D/g, '');
      const itensCorrespondentes = (itensEan || []).filter(it => {
        if (!it.ean) return false;
        const itDigitos = String(it.ean).replace(/\D/g, '');
        return itDigitos === eanDigitos ||
               (itDigitos.length >= 8 && eanDigitos.length >= 8 && (itDigitos.endsWith(eanDigitos) || eanDigitos.endsWith(itDigitos)));
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
            const itensEssencia = await this._filtrarTabelaOriente(prep.termoBusca);
            for (const it of (itensEssencia || [])) {
              if (!todosCandidatos.some(existente => existente.ean && it.ean && String(existente.ean) === String(it.ean))) {
                todosCandidatos.push(it);
              }
            }
          }
        } catch (eGen) {
          console.warn('[OrienteRobot] Aviso na busca por essência:', eGen.message);
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

      // Validação Estrita de EAN: Se o produto original existir e não houver solicitação explícita de substituição,
      // a cotação oficial SEMPRE preserva o produto e preço do EAN original pesquisado
      const vencedor = (melhorEanOriginal && !opts.aceitarSubstituto)
        ? melhorEanOriginal
        : (resultadoClassificacao.vencedor || melhorEanOriginal);

      if (!vencedor) {
        return {
          fornecedor: 'ORIENTE FARMA',
          ean: eanLimpo,
          disponivel: false,
          preco: null,
          motivo: 'NAO_ENCONTRADO'
        };
      }

      const isSubstituto = Boolean(vencedor.isSubstituto || (vencedor.ean && String(vencedor.ean).replace(/\D/g, '') !== eanDigitos));

      return {
        fornecedor: 'ORIENTE FARMA',
        disponivel: true,
        ean: vencedor.ean, // EAN do vencedor para compras e carrinho
        eanOriginal: eanLimpo,
        eanEncontrado: vencedor.ean,
        codigo: vencedor.codigo,
        descricao: vencedor.descricao,
        laboratorio: vencedor.laboratorio || farmacoMatcher.extrairLaboratorio(vencedor.descricao),
        preco: Number(vencedor.preco.toFixed(2)),
        preco_unitario: Number(vencedor.preco.toFixed(2)),
        isSubstituto,
        isGenericoEquivalente: isSubstituto,
        precoOriginalEan: melhorEanOriginal ? melhorEanOriginal.preco : null,
        economiaReais: vencedor.economiaReais || (melhorEanOriginal && isSubstituto && melhorEanOriginal.preco > vencedor.preco ? Number((melhorEanOriginal.preco - vencedor.preco).toFixed(2)) : 0),
        economiaPct: vencedor.economiaPct || (melhorEanOriginal && isSubstituto && melhorEanOriginal.preco > vencedor.preco ? Number((((melhorEanOriginal.preco - vencedor.preco) / melhorEanOriginal.preco) * 100).toFixed(1)) : 0),
        todosConcorrentes: resultadoClassificacao.todosConcorrentes || [],
        pmc: vencedor.pmc ? Number(vencedor.pmc.toFixed(2)) : null,
        desconto: vencedor.desconto,
        estoque: vencedor.estoque,
        embalagem: vencedor.embalagem,
        mensagem: isSubstituto ? `Opção mais barata (${vencedor.laboratorio || ''} - R$ ${vencedor.preco.toFixed(2)})` : ''
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

      // 1. MODO TURBO: Inserção direta no carrinho via POST /api/carrinho/<id>/itens (~300ms)
      const codCondicao = this._obterCodigoCondicao();
      try {
        const resApiAdd = await this.page.evaluate(async (eanAlvo, qtd, condicao) => {
          try {
            let codCliente = 299103;
            try {
              const authUser = JSON.parse(localStorage.getItem('oriente-auth-user') || '{}');
              if (authUser?.state?.clienteSelecionado) {
                codCliente = authUser.state.clienteSelecionado;
              }
            } catch (_) {}

            // 1a. Obtém o codigoProduto a partir do EAN na condição ativa
            const urlProd = `/api/produtos/condicao/${condicao}?codigoCliente=${codCliente}&termo=${encodeURIComponent(eanAlvo)}&pagina=1&tamanhoPagina=20&apenasComEstoque=true&ordenarPor=5&diasRetroativos=100`;
            const rProd = await fetch(urlProd, { method: 'GET', credentials: 'include' });
            if (!rProd.ok) return { ok: false };
            const dProd = await rProd.json();
            const prod = (dProd.produtos || []).find(p => String(p.codigoBarras || '').trim() === eanAlvo) || (dProd.produtos || [])[0];
            if (!prod || !prod.codigoProduto) return { ok: false };

            // 1b. Obtém o ID do carrinho ativo para o cliente e condição comercial
            const urlCart = `/api/carrinho/cliente/${codCliente}?codigoCondicaoComercial=${condicao}`;
            const rCart = await fetch(urlCart, { method: 'GET', credentials: 'include' });
            if (!rCart.ok) return { ok: false };
            const dCart = await rCart.json();
            const idCarrinho = dCart.codigoCarrinho || dCart.id || (dCart.carrinho && (dCart.carrinho.codigoCarrinho || dCart.carrinho.id));
            if (!idCarrinho) return { ok: false };

            // 1c. Envia POST direto de inclusão/atualização do item no carrinho
            const rPost = await fetch(`/api/carrinho/${idCarrinho}/itens`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                codigoProduto: Number(prod.codigoProduto),
                codigoCondicaoComercial: Number(condicao),
                quantidade: Number(qtd)
              })
            });

            if (rPost.ok) {
              return { ok: true, idCarrinho, codigoProduto: prod.codigoProduto };
            }
            return { ok: false, status: rPost.status };
          } catch (e) {
            return { ok: false, error: e.message };
          }
        }, eanLimpo, qtdDesejada, codCondicao);

        if (resApiAdd && resApiAdd.ok) {
          console.log(`[OrienteRobot] ⚡ EAN ${eanLimpo} adicionado via API direta (Carrinho #${resApiAdd.idCarrinho}, Qtd: ${qtdDesejada}).`);
          return {
            sucesso: true,
            ean: eanLimpo,
            quantidadeAdicionada: qtdDesejada,
            viaApi: true
          };
        }
      } catch (eApi) {
        console.warn('[OrienteRobot] Fallback para teclado DOM ao adicionar item:', eApi.message);
      }

      // 2. FALLBACK DOM: Garante que está na grade de pedidos e digita via teclado real
      if (!this.page.url().includes('/pedidos')) {
        await this.page.goto('https://pedidoweb.orientefarma.com.br/pedidos', {
          waitUntil: 'networkidle2',
          timeout: 30000
        });
      }

      const inputSelector = 'input[placeholder*="Filtrar produtos" i]';
      await this.page.waitForSelector(inputSelector, { timeout: 10000 });

      // Digita o EAN na busca da grade
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

      await new Promise(r => setTimeout(r, 1800));

      // Localiza e foca o campo de quantidade na linha do EAN
      const resFoco = await this.page.evaluate((eanAlvo) => {
        const rows = Array.from(document.querySelectorAll('table tbody tr'));
        const row = rows.find(r => (r.innerText || '').includes(eanAlvo));
        if (!row) {
          return { sucesso: false, motivo: `Produto EAN ${eanAlvo} não localizado na tabela.` };
        }

        const inputQtd = row.querySelector('input[type="number"]') || row.querySelector('input');
        if (!inputQtd) {
          return { sucesso: false, motivo: `Campo de quantidade não encontrado na linha do EAN ${eanAlvo}.` };
        }

        inputQtd.focus();
        if (typeof inputQtd.select === 'function') inputQtd.select();
        return { sucesso: true };
      }, eanLimpo);

      if (!resFoco.sucesso) {
        throw new Error(resFoco.motivo);
      }

      // Digita a quantidade via teclado real do Puppeteer para disparar o onChange/onBlur do React
      // e enviar o POST /api/carrinho/<id>/itens (NÃO clicar no primeiro <button> da linha pois é o botão de menos "-")
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('A');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Backspace');
      await this.page.keyboard.type(String(qtdDesejada), { delay: 40 });
      await this.page.keyboard.press('Enter');
      await this.page.keyboard.press('Tab');

      await new Promise(r => setTimeout(r, 2200));

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

  /**
   * Consulta a lista de pedidos no Gerenciador de Pedidos da Oriente Farma
   * URL: https://pedidoweb.orientefarma.com.br/gerenciar-pedidos
   */
  async consultarPedidosGerenciador(limite = 20) {
    if (!this.page) throw new Error('Robô Oriente Farma não iniciado.');

    try {
      console.log(`[OrienteRobot] Consultando pedidos em /gerenciar-pedidos (limite: ${limite})...`);
      const pedidos = await this.page.evaluate(async (take) => {
        const clienteId = 299103;
        const res = await fetch(`/api/pedidos?clienteId=${clienteId}&skip=0&take=${take}`);
        if (!res.ok) throw new Error(`Falha ao buscar pedidos da Oriente (HTTP ${res.status})`);
        const json = await res.json();
        return json.items || [];
      }, limite);

      return pedidos;
    } catch (err) {
      console.error('[OrienteRobot] Erro ao consultar pedidos no gerenciador:', err.message);
      throw err;
    }
  }

  /**
   * Consulta os detalhes completos (incluindo produtos, quantidades atendidas e cortes) de um pedido na Oriente
   */
  async consultarDetalhesPedido(codigoPedido) {
    if (!this.page) throw new Error('Robô Oriente Farma não iniciado.');

    try {
      const cod = parseInt(String(codigoPedido).replace(/\D/g, ''), 10);
      console.log(`[OrienteRobot] Consultando detalhes do pedido #${cod} na Oriente Farma...`);
      const detalhes = await this.page.evaluate(async (num) => {
        const res = await fetch(`/api/pedidos/${num}`);
        if (!res.ok) throw new Error(`Pedido #${num} não encontrado na Oriente (HTTP ${res.status})`);
        return await res.json();
      }, cod);

      return detalhes;
    } catch (err) {
      console.error(`[OrienteRobot] Erro ao consultar detalhes do pedido #${codigoPedido}:`, err.message);
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
