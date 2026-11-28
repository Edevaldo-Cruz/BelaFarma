const { queryDigifarma } = require('./services/digifarma.service');

const PORTAIS_PESQUISA_LIVRE = [
  'Oriente',
  'Distrimed',
  'MG Med',
  'Divimed',
  'Profarma',
  'Orgafarma',
  'DPC',
  'Soton'
];

const PORTAIS_HTTP_PESQUISA = new Set(['MG Med', 'Orgafarma']);
const MAX_CONCORRENCIA_BROWSER = 3;
const TIMEOUT_PORTAL_MS = 55000;

function normalizarEanChave(ean) {
  const dig = String(ean || '').replace(/\D/g, '');
  if (dig.length < 7 || dig.length > 14) return '';
  return dig.replace(/^0+/, '') || dig;
}

function comTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Tempo limite excedido (${Math.round(ms / 1000)}s) em ${label}`));
    }, ms);
    Promise.resolve(promise)
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function buscarNaOrientePorTermo(termo) {
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const t = r.resourceType();
      if (t === 'image' || t === 'media' || t === 'font') r.abort();
      else r.continue();
    });

    await page
      .goto('https://pedidoweb.orientefarma.com.br/auth/login', { waitUntil: 'networkidle2', timeout: 45000 })
      .catch(() => {});
    await page.waitForSelector('input#email', { timeout: 20000 });
    await page.type('input#email', process.env.ORIENTE_USER || 'belafarmasul@gmail.com', { delay: 10 });
    await page.type('input#senha', process.env.ORIENTE_PASS || 'Bfs@882494', { delay: 10 });
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        (b) => (b.innerText || '').trim() === 'Entrar'
      );
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 3500));
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) =>
        (b.innerText || '').toLowerCase().includes('confirmar')
      );
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 2500));
    await page.evaluate(() => {
      const allEls = Array.from(document.querySelectorAll('div, label, li, button')).filter(
        (el) => (el.innerText || '').trim().length > 0 && (el.innerText || '').trim().length < 90
      );
      const opt = allEls.find(
        (d) => (d.innerText || '').includes('PE ORIENTE FARMA') && (d.innerText || '').includes('96')
      );
      if (opt) opt.click();
    });
    await new Promise((r) => setTimeout(r, 600));
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) =>
        (b.innerText || '').toLowerCase().includes('confirmar')
      );
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 2800));
    await page
      .goto('https://pedidoweb.orientefarma.com.br/pedidos', { waitUntil: 'networkidle2', timeout: 35000 })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 1000));

    return await page.evaluate(async (termoBusca) => {
      let codCliente = 299103;
      try {
        const authUser = JSON.parse(localStorage.getItem('oriente-auth-user') || '{}');
        if (authUser?.state?.clienteSelecionado) {
          codCliente = authUser.state.clienteSelecionado;
        }
      } catch (_) {}

      const url = `/api/produtos/condicao/96?codigoCliente=${codCliente}&termo=${encodeURIComponent(
        termoBusca
      )}&pagina=1&tamanhoPagina=60&apenasComEstoque=true&ordenarPor=5&diasRetroativos=100`;
      const resp = await fetch(url, { method: 'GET', credentials: 'include' });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ao consultar API Oriente`);
      }
      const data = await resp.json();
      const produtos = Array.isArray(data?.produtos) ? data.produtos : [];
      const out = [];

      for (const p of produtos) {
        const qtdEstoque = p.estoque && typeof p.estoque.quantidade === 'number' ? p.estoque.quantidade : 1;
        const nivel = String(p.nivelEstoque || '').toUpperCase();
        if (
          p.ativo === false ||
          qtdEstoque <= 0 ||
          nivel.includes('INDISPON') ||
          nivel.includes('ESGOTADO') ||
          nivel.includes('ZERO')
        ) {
          continue;
        }
        const precoLiq = Number(p.precoFinal || p.valor || (p.melhorPreco && p.melhorPreco.precoFinal) || 0);
        const precoComSt = Number(p.precoComSt || 0);
        const valorSt = Number(p.valorSt || 0);
        const precoNF =
          precoComSt > 0
            ? precoComSt
            : precoLiq + valorSt > precoLiq
            ? Number((precoLiq + valorSt).toFixed(2))
            : precoLiq;
        if (!(precoNF > 0)) continue;

        out.push({
          ean: p.codigoBarras ? String(p.codigoBarras).trim() : '',
          descricao: String(p.descricao || '').trim(),
          laboratorio: p.nomeFantasiaFornecedor ? String(p.nomeFantasiaFornecedor).trim() : '',
          preco: Number(precoNF.toFixed(2)),
          preco_nf: Number(precoNF.toFixed(2)),
          preco_liquido: Number((precoLiq || precoNF).toFixed(2)),
          estoque: p.nivelEstoque || 'Disponível',
          validade: p.dataValidade ? String(p.dataValidade).slice(0, 10) : null
        });
      }
      return out;
    }, String(termo).trim());
  } finally {
    await browser.close().catch(() => {});
  }
}

function normalizarListaPortal(portalName, brutos) {
  const vistos = new Map();
  const semEan = [];

  for (const raw of Array.isArray(brutos) ? brutos : []) {
    const descricao = String(raw?.descricao || '').trim();
    const preco = Number(raw?.preco_nf || raw?.preco || 0);
    const precoSemStRaw = Number(raw?.preco_liquido || raw?.precoSemSt || preco || 0);
    if (!descricao || !(preco > 0)) continue;

    const ean = String(raw?.ean || '').trim();
    const eanChave = normalizarEanChave(ean);

    const item = {
      portal: portalName,
      ean,
      eanChave,
      descricao,
      laboratorio: String(raw?.laboratorio || '').trim(),
      preco: Number(preco.toFixed(2)),
      precoSemSt: Number((precoSemStRaw > 0 ? precoSemStRaw : preco).toFixed(2)),
      estoque: String(raw?.estoque || 'Disponível').trim(),
      validade: raw?.validade ? String(raw.validade).trim() : null,
      url: raw?.url ? String(raw.url).trim() : null
    };

    if (!eanChave) {
      semEan.push(item);
      continue;
    }

    const prev = vistos.get(eanChave);
    if (!prev || item.preco < prev.preco) {
      vistos.set(eanChave, item);
    }
  }

  return [...Array.from(vistos.values()), ...semEan]
    .sort((a, b) => a.preco - b.preco)
    .slice(0, 60);
}

async function executarBuscaPortalLivre(portalName, termo) {
  let brutos = [];
  if (portalName === 'Oriente') {
    brutos = await comTimeout(buscarNaOrientePorTermo(termo), TIMEOUT_PORTAL_MS, portalName);
    return normalizarListaPortal(portalName, brutos);
  }

  let RobotCls = null;
  if (portalName === 'Distrimed') RobotCls = require('./belaped-robot-distrimed').DistrimedRobot;
  else if (portalName === 'Divimed') RobotCls = require('./belaped-robot-divimed').DivimedRobot;
  else if (portalName === 'Profarma') RobotCls = require('./belaped-robot-profarma').ProfarmaRobot;
  else if (portalName === 'DPC') RobotCls = require('./belaped-robot-dpc').DpcRobot;
  else if (portalName === 'Soton') RobotCls = require('./belaped-robot-soton').SotonRobot;
  else if (portalName === 'MG Med') RobotCls = require('./belaped-robot-mgmedicamentos');
  else if (portalName === 'Orgafarma') RobotCls = require('./belaped-robot-orgafarma');

  if (!RobotCls) {
    throw new Error(`Robô não encontrado para ${portalName}`);
  }

  const robot = new RobotCls();
  try {
    brutos = await comTimeout(
      (async () => {
        await robot.iniciar();
        return await robot.buscarTermo(termo);
      })(),
      TIMEOUT_PORTAL_MS,
      portalName
    );
    return normalizarListaPortal(portalName, brutos);
  } finally {
    await Promise.resolve(robot.fechar?.()).catch(() => {});
  }
}

function buildEanCandidates(eans) {
  const set = new Set();
  for (const ean of Array.isArray(eans) ? eans : []) {
    const dig = String(ean || '').replace(/\D/g, '');
    if (dig.length < 7 || dig.length > 14) continue;
    set.add(dig);
    const semZero = dig.replace(/^0+/, '');
    if (semZero) set.add(semZero);
    if (dig.length < 13) set.add(dig.padStart(13, '0'));
    if (dig.length <= 13) set.add(dig.padStart(14, '0'));
  }
  return Array.from(set);
}

function mesclarInfoDigifarma(atual, extra) {
  if (!atual) return extra ? { ...extra } : null;
  if (!extra) return { ...atual };

  const ult =
    Number(extra.ult || 0) > 0 && extra.ultimaCompraFonte === 'NOTA_FISCAL'
      ? Number(extra.ult)
      : Number(atual.ult || 0) > 0
      ? Number(atual.ult)
      : Number(extra.ult || 0);
  const cmv = Number(atual.cmv || 0) > 0 ? Number(atual.cmv) : Number(extra.cmv || 0);
  const refCost = ult > 0 ? ult : cmv;

  const est = Number(atual.est ?? extra.est ?? 0);
  const v30 = Number(atual.v30 || extra.v30 || 0);
  const v90 = Number(atual.v90 || extra.v90 || 0);
  const giroMensal = Math.max(Number(atual.giroMensal || 0), Number(extra.giroMensal || 0));

  return {
    cadastradoNaLoja: Boolean(atual.cadastradoNaLoja || extra.cadastradoNaLoja),
    eanLoja: atual.eanLoja || extra.eanLoja || '',
    produtoLoja: atual.produtoLoja || extra.produtoLoja || '',
    est,
    v30,
    v90,
    giroMensal,
    cmv: Number(cmv.toFixed(2)),
    ult: Number(ult.toFixed(2)),
    refCost: Number(refCost.toFixed(2)),
    prVenda: Number((Number(atual.prVenda || 0) || Number(extra.prVenda || 0)).toFixed(2)),
    ultimaCompraData: extra.ultimaCompraData || atual.ultimaCompraData || null,
    ultimaCompraFornecedor: extra.ultimaCompraFornecedor || atual.ultimaCompraFornecedor || null,
    ultimaCompraNf: extra.ultimaCompraNf || atual.ultimaCompraNf || null,
    ultimaCompraFonte: extra.ultimaCompraFonte || atual.ultimaCompraFonte || null
  };
}

function enriquecerEansSqlite(db, eans) {
  const mapa = {};
  const lista = buildEanCandidates(eans);
  if (!db || lista.length === 0) return mapa;

  const placeholdersFor = (arr) => arr.map(() => '?').join(',');

  // 1. Notas fiscais de entrada reais (cache Digifarma -> SQLite)
  try {
    for (let i = 0; i < lista.length; i += 200) {
      const slice = lista.slice(i, i + 200);
      const rows = db
        .prepare(
          `SELECT ean, descricao, preco_unitario_ult_compra, data_compra, fornecedor_nome, numero_nota_fiscal, fonte, atualizado_em
           FROM digifarma_ultimas_compras_cache
           WHERE (TRIM(COALESCE(ean, '')) IN (${placeholdersFor(slice)})
              OR LTRIM(TRIM(COALESCE(ean, '')), '0') IN (${placeholdersFor(slice)}))
             AND preco_unitario_ult_compra > 0`
        )
        .all(...slice, ...slice);

      for (const r of rows) {
        const eanChave = normalizarEanChave(r.ean);
        if (!eanChave) continue;
        const ult = Number(Number(r.preco_unitario_ult_compra || 0).toFixed(2));
        if (!(ult > 0)) continue;

        const novaInfo = {
          cadastradoNaLoja: true,
          eanLoja: String(r.ean || '').trim(),
          produtoLoja: String(r.descricao || '').trim(),
          est: 0,
          v30: 0,
          v90: 0,
          giroMensal: 0,
          cmv: 0,
          ult,
          refCost: ult,
          prVenda: 0,
          ultimaCompraData: r.data_compra ? String(r.data_compra).trim() : null,
          ultimaCompraFornecedor: r.fornecedor_nome ? String(r.fornecedor_nome).trim() : null,
          ultimaCompraNf: r.numero_nota_fiscal ? String(r.numero_nota_fiscal).trim() : null,
          ultimaCompraFonte: r.fonte ? String(r.fonte).trim() : 'NOTA_FISCAL',
          _ord: `${r.data_compra || ''}|${r.atualizado_em || ''}`
        };

        const prev = mapa[eanChave];
        if (!prev || novaInfo._ord > (prev._ord || '')) {
          mapa[eanChave] = novaInfo;
        }
      }
    }
  } catch (err) {
    console.warn('[PesquisaLivre] Aviso digifarma_ultimas_compras_cache:', err.message);
  }

  for (const k of Object.keys(mapa)) {
    delete mapa[k]._ord;
  }

  // 2. Estoque, giro e última compra consolidados do cache do ERP
  try {
    for (let i = 0; i < lista.length; i += 200) {
      const slice = lista.slice(i, i + 200);
      const rows = db
        .prepare(
          `SELECT ean, descricao, apresentacao, saldo, vendas_30d, vmd_ponderado, custo_unitario,
                  preco_venda_vigente, preco_unitario_ult_compra, ultima_compra_fornecedor,
                  ultima_compra_data, ultima_compra_nf
           FROM compras_estoque_cache
           WHERE TRIM(COALESCE(ean, '')) IN (${placeholdersFor(slice)})
              OR LTRIM(TRIM(COALESCE(ean, '')), '0') IN (${placeholdersFor(slice)})`
        )
        .all(...slice, ...slice);

      for (const r of rows) {
        const eanChave = normalizarEanChave(r.ean);
        if (!eanChave) continue;
        const ult = Number(Number(r.preco_unitario_ult_compra || 0).toFixed(2));
        const cmv = Number(Number(r.custo_unitario || 0).toFixed(2));
        const v30 = Number(r.vendas_30d || 0);
        const giroMensal = Math.max(v30, Math.ceil(Number(r.vmd_ponderado || 0) * 30));

        const infoCache = {
          cadastradoNaLoja: true,
          eanLoja: String(r.ean || '').trim(),
          produtoLoja: `${String(r.descricao || '').trim()} ${String(r.apresentacao || '').trim()}`.trim(),
          est: Number(r.saldo || 0),
          v30,
          v90: 0,
          giroMensal,
          cmv,
          ult,
          refCost: ult > 0 ? ult : cmv,
          prVenda: Number(Number(r.preco_venda_vigente || 0).toFixed(2)),
          ultimaCompraData: r.ultima_compra_data ? String(r.ultima_compra_data).trim() : null,
          ultimaCompraFornecedor: r.ultima_compra_fornecedor ? String(r.ultima_compra_fornecedor).trim() : null,
          ultimaCompraNf: r.ultima_compra_nf ? String(r.ultima_compra_nf).trim() : null,
          ultimaCompraFonte: ult > 0 ? 'ESTOQUE_CACHE' : null
        };

        const existing = mapa[eanChave];
        if (!existing) {
          mapa[eanChave] = infoCache;
        } else {
          // NF-e tem prioridade no preço/fornecedor/data; estoque/giro/CMV vêm do cache de estoque
          mapa[eanChave] = {
            ...existing,
            est: infoCache.est,
            v30: Math.max(existing.v30 || 0, infoCache.v30),
            giroMensal: Math.max(existing.giroMensal || 0, infoCache.giroMensal),
            cmv: infoCache.cmv || existing.cmv,
            prVenda: infoCache.prVenda || existing.prVenda,
            ult: existing.ult > 0 ? existing.ult : infoCache.ult,
            refCost: (existing.ult > 0 ? existing.ult : infoCache.ult) || infoCache.cmv,
            ultimaCompraData: existing.ultimaCompraData || infoCache.ultimaCompraData,
            ultimaCompraFornecedor: existing.ultimaCompraFornecedor || infoCache.ultimaCompraFornecedor,
            ultimaCompraNf: existing.ultimaCompraNf || infoCache.ultimaCompraNf,
            ultimaCompraFonte: existing.ultimaCompraFonte || infoCache.ultimaCompraFonte
          };
        }
      }
    }
  } catch (err) {
    console.warn('[PesquisaLivre] Aviso compras_estoque_cache:', err.message);
  }

  return mapa;
}

async function enriquecerEansDigifarma(eans) {
  const mapa = {};
  const lista = buildEanCandidates(eans);
  if (lista.length === 0) return mapa;

  try {
    for (let i = 0; i < lista.length; i += 80) {
      const slice = lista.slice(i, i + 80);
      const inClause = slice.map((c) => `'${c.replace(/\D/g, '')}'`).join(',');
      if (!inClause) continue;

      const rows = await queryDigifarma(`
        SELECT
          TRIM(COALESCE(p.COD_BARRAS, '')) AS EAN,
          p.PRODUTO,
          p.APRESENTACAO AS APRES,
          COALESCE(p.PROD_SALDO, 0) AS EST,
          COALESCE(p.PROD_CMV, 0) AS CMV,
          COALESCE(p.VALOR_ULT_COMPRA, 0) AS ULT,
          COALESCE(p.PROD_PRVENDA, 0) AS PRVENDA,
          COALESCE(s30.Q30, 0) AS V30,
          COALESCE(s90.Q90, 0) AS V90
        FROM PRODUTOS p
        LEFT JOIN (
          SELECT iv.PRODUTO_ID, SUM(iv.ITEMVEND_QUANT) AS Q30
          FROM ITEM_VENDAS iv JOIN CAB_VENDAS cv ON cv.VENDA_NOTA_ID = iv.VENDA_NOTA_ID
          WHERE cv.CANCELADO <> 'S' AND cv.VENDA_DATA_HORA >= CURRENT_DATE - 30
          GROUP BY iv.PRODUTO_ID
        ) s30 ON s30.PRODUTO_ID = p.PRODUTO_ID
        LEFT JOIN (
          SELECT iv.PRODUTO_ID, SUM(iv.ITEMVEND_QUANT) AS Q90
          FROM ITEM_VENDAS iv JOIN CAB_VENDAS cv ON cv.VENDA_NOTA_ID = iv.VENDA_NOTA_ID
          WHERE cv.CANCELADO <> 'S' AND cv.VENDA_DATA_HORA >= CURRENT_DATE - 90
          GROUP BY iv.PRODUTO_ID
        ) s90 ON s90.PRODUTO_ID = p.PRODUTO_ID
        WHERE COALESCE(p.PROD_ATIVO, 'S') <> 'N'
          AND TRIM(COALESCE(p.COD_BARRAS, '')) IN (${inClause})
      `);

      for (const r of rows || []) {
        const eanLoja = String(r.EAN || '').trim();
        const eanChave = normalizarEanChave(eanLoja);
        if (!eanChave) continue;

        const cmv = Number(r.CMV || 0);
        const ult = Number(r.ULT || 0);
        const refCost = ult > 0 ? ult : cmv;
        const est = Number(r.EST || 0);
        const v30 = Number(r.V30 || 0);
        const v90 = Number(r.V90 || 0);
        const giroMensal = Math.max(v30, Math.ceil(v90 / 3));

        const atual = {
          cadastradoNaLoja: true,
          eanLoja,
          produtoLoja: `${String(r.PRODUTO || '').trim()} ${String(r.APRES || '').trim()}`.trim(),
          est,
          v30,
          v90,
          giroMensal,
          cmv: Number(cmv.toFixed(2)),
          ult: Number(ult.toFixed(2)),
          refCost: Number(refCost.toFixed(2)),
          prVenda: Number(Number(r.PRVENDA || 0).toFixed(2))
        };

        const prev = mapa[eanChave];
        if (!prev || atual.v30 > prev.v30 || atual.est > prev.est) {
          mapa[eanChave] = atual;
        }
      }
    }
  } catch (err) {
    console.warn('[PesquisaLivre] Aviso ao enriquecer com Digifarma:', err.message);
  }

  return mapa;
}

function createTriagemPesquisaLivreManager(db, deps = {}) {
  const pesquisasAtivas = new Map();
  const executorPortal = deps.executorPortal || executarBuscaPortalLivre;
  const enriquecedorDigifarma = deps.enriquecedorDigifarma || enriquecerEansDigifarma;

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS triagem_pesquisas_livres (
        id TEXT PRIMARY KEY,
        termo TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'em_andamento',
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL,
        usuario TEXT DEFAULT '',
        portais_status_json TEXT NOT NULL DEFAULT '{}',
        resultados_json TEXT NOT NULL DEFAULT '{}',
        digifarma_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS triagem_pesquisa_selecoes (
        sessao_id TEXT NOT NULL,
        ean_chave TEXT NOT NULL,
        ean TEXT DEFAULT '',
        portal TEXT NOT NULL,
        descricao TEXT NOT NULL,
        laboratorio TEXT DEFAULT '',
        preco REAL NOT NULL,
        preco_sem_st REAL DEFAULT 0,
        ref_cost REAL DEFAULT 0,
        qtd INTEGER NOT NULL DEFAULT 1,
        termo_origem TEXT DEFAULT '',
        usuario TEXT DEFAULT '',
        atualizado_em TEXT NOT NULL,
        PRIMARY KEY (sessao_id, ean_chave)
      );
    `);
  } catch (err) {
    console.warn('[PesquisaLivre] Aviso ao criar tabelas:', err.message);
  }

  try {
    db.exec(`ALTER TABLE triagem_pesquisas_livres ADD COLUMN digifarma_json TEXT NOT NULL DEFAULT '{}'`);
  } catch (_) {}

  function serializarJob(job) {
    return {
      id: job.id,
      termo: job.termo,
      status: job.status,
      criadoEm: job.criadoEm,
      atualizadoEm: job.atualizadoEm,
      usuario: job.usuario,
      portaisStatus: job.portaisStatus,
      resultadosPorPortal: job.resultadosPorPortal,
      digifarmaPorEan: job.digifarmaPorEan
    };
  }

  function persistirJob(job) {
    job.atualizadoEm = new Date().toISOString();
    db.prepare(`
      UPDATE triagem_pesquisas_livres
      SET status = ?, atualizado_em = ?, portais_status_json = ?, resultados_json = ?, digifarma_json = ?
      WHERE id = ?
    `).run(
      job.status,
      job.atualizadoEm,
      JSON.stringify(job.portaisStatus),
      JSON.stringify(job.resultadosPorPortal),
      JSON.stringify(job.digifarmaPorEan),
      job.id
    );
  }

  function montarResumoPortaisInicial() {
    const map = {};
    for (const portal of PORTAIS_PESQUISA_LIVRE) {
      map[portal] = { status: 'aguardando', count: 0, duracaoMs: 0, erro: null };
    }
    return map;
  }

  function contarOfertas(portaisStatus) {
    let total = 0;
    for (const p of Object.values(portaisStatus || {})) {
      total += Number(p?.count || 0);
    }
    return total;
  }

  async function executarJobEmSegundoPlano(job) {
    const processarPortal = async (portalName) => {
      if (job.cancelado) {
        job.portaisStatus[portalName] = { status: 'cancelado', count: 0, duracaoMs: 0, erro: null };
        persistirJob(job);
        return;
      }

      const inicio = Date.now();
      job.portaisStatus[portalName] = { status: 'buscando', count: 0, duracaoMs: 0, erro: null };
      persistirJob(job);

      try {
        const itens = await executorPortal(portalName, job.termo);
        const lista = Array.isArray(itens) ? itens : [];
        job.resultadosPorPortal[portalName] = lista;
        job.portaisStatus[portalName] = {
          status: 'concluido',
          count: lista.length,
          duracaoMs: Date.now() - inicio,
          erro: null
        };

        const novosEans = [];
        for (const it of lista) {
          if (it.eanChave) {
            novosEans.push(it.ean || it.eanChave);
          }
        }
        if (novosEans.length > 0) {
          const sqliteInfo = enriquecerEansSqlite(db, novosEans);
          for (const [k, v] of Object.entries(sqliteInfo)) {
            job.digifarmaPorEan[k] = mesclarInfoDigifarma(job.digifarmaPorEan[k], v);
          }

          const faltandoAoVivo = novosEans.filter((raw) => {
            const c = normalizarEanChave(raw);
            return c && !job.digifarmaPorEan[c]?.v90;
          });
          if (faltandoAoVivo.length > 0) {
            const liveInfo = await enriquecedorDigifarma(faltandoAoVivo);
            for (const [k, v] of Object.entries(liveInfo || {})) {
              job.digifarmaPorEan[k] = mesclarInfoDigifarma(v, job.digifarmaPorEan[k]);
            }
          }
        }
      } catch (err) {
        job.resultadosPorPortal[portalName] = [];
        job.portaisStatus[portalName] = {
          status: 'erro',
          count: 0,
          duracaoMs: Date.now() - inicio,
          erro: err?.message || 'Falha ao consultar portal'
        };
      }

      persistirJob(job);
    };

    const portaisHttp = PORTAIS_PESQUISA_LIVRE.filter((p) => PORTAIS_HTTP_PESQUISA.has(p));
    const portaisBrowser = PORTAIS_PESQUISA_LIVRE.filter((p) => !PORTAIS_HTTP_PESQUISA.has(p));

    const workersHttp = portaisHttp.map((p) => processarPortal(p));

    let cursor = 0;
    const workersBrowser = Array.from(
      { length: Math.min(MAX_CONCORRENCIA_BROWSER, portaisBrowser.length) },
      async () => {
        while (cursor < portaisBrowser.length) {
          const idx = cursor++;
          await processarPortal(portaisBrowser[idx]);
        }
      }
    );

    await Promise.all([...workersHttp, ...workersBrowser]);

    job.status = job.cancelado ? 'cancelada' : 'concluida';
    persistirJob(job);

    setTimeout(() => {
      pesquisasAtivas.delete(job.id);
    }, 5 * 60 * 1000).unref?.();
  }

  function iniciarPesquisa(termo, usuario = '') {
    const termoLimpo = String(termo || '').trim();
    if (termoLimpo.length < 2) {
      throw new Error('Informe pelo menos 2 caracteres para pesquisar.');
    }

    const now = new Date().toISOString();
    const id = `pesq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const portaisStatus = montarResumoPortaisInicial();
    const resultadosPorPortal = {};
    for (const p of PORTAIS_PESQUISA_LIVRE) resultadosPorPortal[p] = [];

    const job = {
      id,
      termo: termoLimpo,
      status: 'em_andamento',
      criadoEm: now,
      atualizadoEm: now,
      usuario: String(usuario || ''),
      cancelado: false,
      portaisStatus,
      resultadosPorPortal,
      digifarmaPorEan: {}
    };

    db.prepare(`
      INSERT INTO triagem_pesquisas_livres (
        id, termo, status, criado_em, atualizado_em, usuario, portais_status_json, resultados_json, digifarma_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.id,
      job.termo,
      job.status,
      job.criadoEm,
      job.atualizadoEm,
      job.usuario,
      JSON.stringify(job.portaisStatus),
      JSON.stringify(job.resultadosPorPortal),
      JSON.stringify(job.digifarmaPorEan)
    );

    pesquisasAtivas.set(job.id, job);
    setImmediate(() => {
      executarJobEmSegundoPlano(job).catch((err) => {
        console.error('[PesquisaLivre] Erro inesperado no background job:', err);
        job.status = 'erro';
        persistirJob(job);
      });
    });

    return serializarJob(job);
  }

  function listarHistorico(limit = 12) {
    const orfaos = db
      .prepare(`SELECT id FROM triagem_pesquisas_livres WHERE status = 'em_andamento'`)
      .all();
    for (const row of orfaos) {
      if (!pesquisasAtivas.has(row.id)) {
        db.prepare(`UPDATE triagem_pesquisas_livres SET status = 'concluida' WHERE id = ?`).run(row.id);
      }
    }

    const rows = db
      .prepare(`
        SELECT id, termo, status, criado_em, atualizado_em, usuario, portais_status_json
        FROM triagem_pesquisas_livres
        ORDER BY atualizado_em DESC
        LIMIT ?
      `)
      .all(limit);

    const historico = rows.map((r) => {
      const ativa = pesquisasAtivas.get(r.id);
      const portaisStatus = ativa
        ? ativa.portaisStatus
        : JSON.parse(r.portais_status_json || '{}');
      return {
        id: r.id,
        termo: r.termo,
        status: ativa ? ativa.status : r.status,
        criadoEm: r.criado_em,
        atualizadoEm: ativa ? ativa.atualizadoEm : r.atualizado_em,
        usuario: r.usuario || '',
        portaisStatus,
        totalOfertas: contarOfertas(portaisStatus)
      };
    });

    const ativa = Array.from(pesquisasAtivas.values()).find((j) => j.status === 'em_andamento');
    return {
      historico,
      ativaId: ativa ? ativa.id : null
    };
  }

  function obterPesquisa(id) {
    const ativa = pesquisasAtivas.get(id);
    if (ativa) return serializarJob(ativa);

    const row = db
      .prepare(`SELECT * FROM triagem_pesquisas_livres WHERE id = ?`)
      .get(id);
    if (!row) return null;

    const resultadosPorPortal = JSON.parse(row.resultados_json || '{}');
    const digifarmaPorEan = JSON.parse(row.digifarma_json || '{}');
    const todosEans = [];
    for (const lista of Object.values(resultadosPorPortal)) {
      for (const it of Array.isArray(lista) ? lista : []) {
        if (it?.eanChave || it?.ean) todosEans.push(it.ean || it.eanChave);
      }
    }
    if (todosEans.length > 0) {
      const sqliteInfo = enriquecerEansSqlite(db, todosEans);
      for (const [k, v] of Object.entries(sqliteInfo)) {
        digifarmaPorEan[k] = mesclarInfoDigifarma(digifarmaPorEan[k], v);
      }
    }

    return {
      id: row.id,
      termo: row.termo,
      status: row.status,
      criadoEm: row.criado_em,
      atualizadoEm: row.atualizado_em,
      usuario: row.usuario || '',
      portaisStatus: JSON.parse(row.portais_status_json || '{}'),
      resultadosPorPortal,
      digifarmaPorEan
    };
  }

  function cancelarPesquisa(id) {
    const ativa = pesquisasAtivas.get(id);
    if (!ativa) return false;
    ativa.cancelado = true;
    ativa.status = 'cancelada';
    persistirJob(ativa);
    return true;
  }

  function resolverSessaoId(sessaoIdInformada) {
    if (sessaoIdInformada) return String(sessaoIdInformada);
    const row = db
      .prepare(`SELECT id FROM triagem_faltas_sessoes ORDER BY atualizado_em DESC LIMIT 1`)
      .get();
    return row ? row.id : 'sem-sessao';
  }

  function listarSelecoes(sessaoId) {
    const resolvedId = resolverSessaoId(sessaoId);
    const rows = db
      .prepare(`
        SELECT sessao_id, ean_chave, ean, portal, descricao, laboratorio, preco, preco_sem_st, ref_cost, qtd, termo_origem, usuario, atualizado_em
        FROM triagem_pesquisa_selecoes
        WHERE sessao_id = ?
        ORDER BY portal ASC, descricao ASC
      `)
      .all(resolvedId);

    return {
      sessaoId: resolvedId,
      selecoes: rows.map((r) => ({
        sessaoId: r.sessao_id,
        eanChave: r.ean_chave,
        ean: r.ean || '',
        portal: r.portal,
        descricao: r.descricao,
        laboratorio: r.laboratorio || '',
        preco: Number(r.preco || 0),
        precoSemSt: Number(r.preco_sem_st || r.preco || 0),
        refCost: Number(r.ref_cost || 0),
        qtd: Math.max(1, Number(r.qtd) || 1),
        termoOrigem: r.termo_origem || '',
        atualizadoEm: r.atualizado_em
      }))
    };
  }

  function salvarSelecaoItem(payload) {
    const sessaoId = resolverSessaoId(payload?.sessaoId);
    const eanChave = String(payload?.eanChave || '').trim();
    if (!eanChave || !payload?.portal || !payload?.descricao) {
      throw new Error('eanChave, portal e descricao são obrigatórios');
    }

    const now = new Date().toISOString();
    const qtd = Math.max(1, parseInt(payload.qtd, 10) || 1);
    const preco = Number(Number(payload.preco || 0).toFixed(2));
    const precoSemSt = Number(Number(payload.precoSemSt || preco).toFixed(2));
    const refCost = Number(Number(payload.refCost || 0).toFixed(2));

    db.prepare(`
      INSERT INTO triagem_pesquisa_selecoes (
        sessao_id, ean_chave, ean, portal, descricao, laboratorio, preco, preco_sem_st, ref_cost, qtd, termo_origem, usuario, atualizado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sessao_id, ean_chave) DO UPDATE SET
        ean = excluded.ean,
        portal = excluded.portal,
        descricao = excluded.descricao,
        laboratorio = excluded.laboratorio,
        preco = excluded.preco,
        preco_sem_st = excluded.preco_sem_st,
        ref_cost = excluded.ref_cost,
        qtd = excluded.qtd,
        termo_origem = excluded.termo_origem,
        usuario = excluded.usuario,
        atualizado_em = excluded.atualizado_em
    `).run(
      sessaoId,
      eanChave,
      String(payload.ean || ''),
      String(payload.portal),
      String(payload.descricao),
      String(payload.laboratorio || ''),
      preco,
      precoSemSt,
      refCost,
      qtd,
      String(payload.termoOrigem || ''),
      String(payload.usuario || ''),
      now
    );

    return {
      sessaoId,
      eanChave,
      ean: String(payload.ean || ''),
      portal: String(payload.portal),
      descricao: String(payload.descricao),
      laboratorio: String(payload.laboratorio || ''),
      preco,
      precoSemSt,
      refCost,
      qtd,
      termoOrigem: String(payload.termoOrigem || ''),
      atualizadoEm: now
    };
  }

  function removerSelecaoItem(sessaoId, eanChave) {
    const resolvedId = resolverSessaoId(sessaoId);
    const chave = String(eanChave || '').trim();
    if (!chave) throw new Error('eanChave é obrigatório');
    const info = db
      .prepare(`DELETE FROM triagem_pesquisa_selecoes WHERE sessao_id = ? AND ean_chave = ?`)
      .run(resolvedId, chave);
    return info.changes > 0;
  }

  function limparSelecoes(sessaoId) {
    const resolvedId = resolverSessaoId(sessaoId);
    const info = db
      .prepare(`DELETE FROM triagem_pesquisa_selecoes WHERE sessao_id = ?`)
      .run(resolvedId);
    return info.changes;
  }

  return {
    PORTAIS_PESQUISA_LIVRE,
    iniciarPesquisa,
    listarHistorico,
    obterPesquisa,
    cancelarPesquisa,
    listarSelecoes,
    salvarSelecaoItem,
    removerSelecaoItem,
    limparSelecoes
  };
}

module.exports = {
  PORTAIS_PESQUISA_LIVRE,
  normalizarEanChave,
  normalizarListaPortal,
  executarBuscaPortalLivre,
  enriquecerEansSqlite,
  enriquecerEansDigifarma,
  mesclarInfoDigifarma,
  createTriagemPesquisaLivreManager
};
