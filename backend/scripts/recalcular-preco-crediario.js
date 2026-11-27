/**
 * backend/scripts/recalcular-preco-crediario.js
 *
 * Recalcula o preço de crediário (PROD_PRCREDIARIO no Digifarma + crediario_price/preco_crediario no Belinha)
 * para todos os produtos ativos com estoque positivo (PROD_ATIVO = 'S' AND COALESCE(PROD_SALDO, 0) > 0).
 *
 * Regras:
 * 1. Base de cálculo:
 *    - Se tiver PROD_PRPROMOCAO > 0 (vigente) E PROD_PRPROMOCAO <= PROD_PRVENDA (ou PROD_PRVENDA <= 0): usa PROD_PRPROMOCAO.
 *    - Se PROD_PRPROMOCAO > PROD_PRVENDA (anomalia): usa PROD_PRVENDA como base e lista em relatório separado.
 *    - Se não tiver promoção vigente: usa PROD_PRVENDA.
 * 2. Fórmula: base × 1,20 arredondado para cima com centavo final 0, 5 ou 9 (ex.: 14,21 -> 14,25; 14,26 -> 14,29).
 * 3. Sem trava de teto para TIPO_PRECO = 'M'; pode aumentar ou baixar valores já existentes.
 * 4. Backup obrigatório antes de qualquer escrita (JSON + CSV do Firebird + backup WAL-safe do SQLite Belinha).
 * 5. Suporte completo a --dry-run (padrão), --execute e --rollback <arquivo_backup.json>.
 */

const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');

const backendRequire = createRequire(path.join(__dirname, '../package.json'));
const dotenv = backendRequire('dotenv');
dotenv.config({ path: path.join(__dirname, '../../.env') });

const firebird = backendRequire('node-firebird');
const Database = backendRequire('better-sqlite3');
const config = require('../config');

const firebirdOpts = {
  host: process.env.DIGIFARMA_HOST || '192.168.1.7',
  port: parseInt(process.env.DIGIFARMA_PORT || '3050', 10),
  database: process.env.DIGIFARMA_DB_PATH || 'C:\\Digifarma\\Dados\\digifarma6.fdb',
  user: process.env.DIGIFARMA_USER || 'SYSDBA',
  password: process.env.DIGIFARMA_PASSWORD || 'masterkey',
  lowercase_keys: false,
  role: null,
  pageSize: 4096
};

const SELECT_ACTIVE_IN_STOCK_SQL = `
  SELECT
    PRODUTO_ID,
    PRODUTO,
    APRESENTACAO,
    COD_BARRAS,
    PROD_PRCOMPRA,
    PROD_PRVENDA,
    PROD_PRPROMOCAO,
    PROD_PRCREDIARIO,
    PROD_SALDO,
    TIPO_PRECO,
    PROMOCAO_PERMANENTE,
    INICIO_PROMOCAO,
    TERMINO_PROMOCAO,
    PROMOCAO_VISTA
  FROM PRODUTOS
  WHERE PROD_ATIVO = 'S'
    AND COALESCE(PROD_SALDO, 0) > 0
  ORDER BY PRODUTO_ID ASC
`;

function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * Aplica +20% sobre o preço base e arredonda para cima para o próximo centavo terminado em 0, 5 ou 9.
 * Ex.: 10,00 -> 12,00 | 11,84 -> 14,208 -> 14,25 | 11,88 -> 14,256 -> 14,29
 */
function roundCrediario(baseVal) {
  const num = Number(baseVal);
  if (!Number.isFinite(num) || num <= 0) return 0;

  const raw = num * 1.2;
  const exactCents = Math.round(raw * 10000) / 100;
  let cents = Math.ceil(exactCents - 1e-9);

  const lastDigit = ((cents % 10) + 10) % 10;
  let diff = 0;
  if (lastDigit === 0 || lastDigit === 5 || lastDigit === 9) {
    diff = 0;
  } else if (lastDigit < 5) {
    diff = 5 - lastDigit;
  } else {
    diff = 9 - lastDigit;
  }

  cents += diff;
  return Number((cents / 100).toFixed(2));
}

function toDateYMD(input) {
  if (!input) return '';
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return '';
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, '0');
    const d = String(input.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(input).trim();
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function isPromoActive(row, now = new Date()) {
  const promo = Number(row.PROD_PRPROMOCAO || 0);
  if (!Number.isFinite(promo) || promo <= 0) return false;
  if (String(row.PROMOCAO_PERMANENTE || '').trim().toUpperCase() === 'S') return true;

  const nowYMD = toDateYMD(now);
  const inicioYMD = toDateYMD(row.INICIO_PROMOCAO);
  const terminoYMD = toDateYMD(row.TERMINO_PROMOCAO);

  if (inicioYMD && nowYMD < inicioYMD) return false;
  if (terminoYMD && nowYMD > terminoYMD) return false;
  return true;
}

function buildCrediarioPlan(rows, now = new Date()) {
  const items = [];
  const updates = [];
  const anomalies = [];

  const stats = {
    totalAnalisados: rows.length,
    totalAtualizaveis: 0,
    totalSemAlteracao: 0,
    totalSemPreco: 0,
    basePromocional: 0,
    baseVendaNormal: 0,
    baseVendaPorAnomaliaPromo: 0,
    novosDoZero: 0,
    aumentos: 0,
    reducoes: 0,
    anomaliasPromoMaior: 0,
    terminacoes: { zero: 0, cinco: 0, nove: 0, invalido: 0 }
  };

  for (const r of rows) {
    const produtoId = Number(r.PRODUTO_ID);
    const nome = String(r.PRODUTO || '').trim();
    const apresentacao = String(r.APRESENTACAO || '').trim();
    const ean = String(r.COD_BARRAS || '').trim();
    const saldo = round2(r.PROD_SALDO || 0);
    const tipoPreco = String(r.TIPO_PRECO || '').trim().toUpperCase() || null;

    const precoVenda = round2(r.PROD_PRVENDA || 0);
    const precoPromocao = round2(r.PROD_PRPROMOCAO || 0);
    const rawCredAnterior = r.PROD_PRCREDIARIO;
    const precoCrediarioAnterior =
      rawCredAnterior === null || rawCredAnterior === undefined ? null : round2(rawCredAnterior);
    const credAnteriorNum = precoCrediarioAnterior || 0;

    const promoAtiva = isPromoActive(r, now);
    let precoBase = 0;
    let origemBase = 'SEM_PRECO';
    let isAnomaliaPromoMaior = false;

    if (promoAtiva) {
      if (precoVenda > 0 && precoPromocao > precoVenda + 0.004) {
        precoBase = precoVenda;
        origemBase = 'VENDA_ANOMALIA_PROMO_MAIOR';
        isAnomaliaPromoMaior = true;
        stats.baseVendaPorAnomaliaPromo++;
        stats.anomaliasPromoMaior++;
      } else {
        precoBase = precoPromocao;
        origemBase = 'PROMOCIONAL';
        stats.basePromocional++;
      }
    } else if (precoVenda > 0) {
      precoBase = precoVenda;
      origemBase = 'VENDA_NORMAL';
      stats.baseVendaNormal++;
    } else {
      stats.totalSemPreco++;
    }

    const precoCrediarioNovo = precoBase > 0 ? roundCrediario(precoBase) : 0;
    const diferenca = precoCrediarioNovo > 0 ? round2(precoCrediarioNovo - credAnteriorNum) : 0;

    let direcao = 'SEM_PRECO';
    if (precoCrediarioNovo > 0) {
      const lastDigit = Math.round(precoCrediarioNovo * 100) % 10;
      if (lastDigit === 0) stats.terminacoes.zero++;
      else if (lastDigit === 5) stats.terminacoes.cinco++;
      else if (lastDigit === 9) stats.terminacoes.nove++;
      else stats.terminacoes.invalido++;

      if (Math.abs(diferenca) < 0.005) {
        direcao = 'IGUAL';
        stats.totalSemAlteracao++;
      } else if (credAnteriorNum <= 0) {
        direcao = 'NOVO';
        stats.novosDoZero++;
        stats.totalAtualizaveis++;
      } else if (diferenca > 0) {
        direcao = 'AUMENTO';
        stats.aumentos++;
        stats.totalAtualizaveis++;
      } else {
        direcao = 'REDUCAO';
        stats.reducoes++;
        stats.totalAtualizaveis++;
      }
    }

    const entry = {
      produtoId,
      nome,
      apresentacao,
      ean,
      saldo,
      tipoPreco,
      precoVenda,
      precoPromocao,
      promoAtiva,
      precoCrediarioAnterior,
      precoBase,
      origemBase,
      precoCrediarioNovo,
      diferenca,
      direcao,
      isAnomaliaPromoMaior
    };

    items.push(entry);
    if (isAnomaliaPromoMaior) {
      anomalies.push(entry);
    }
    if (direcao === 'NOVO' || direcao === 'AUMENTO' || direcao === 'REDUCAO') {
      updates.push(entry);
    }
  }

  return { items, updates, anomalies, stats };
}

function formatTimestampFile(date = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`;
}

function escapeCsvCell(val) {
  const s = val === null || val === undefined ? '' : String(val);
  if (s.includes(';') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatBrNum(val) {
  if (val === null || val === undefined) return '';
  return Number(val).toFixed(2).replace('.', ',');
}

function writeCsv(filePath, headers, rows) {
  const lines = [
    headers.map(escapeCsvCell).join(';'),
    ...rows.map(r => r.map(escapeCsvCell).join(';'))
  ];
  fs.writeFileSync(filePath, '\uFEFF' + lines.join('\r\n'), 'utf-8');
}

function attachFirebird() {
  return new Promise((resolve, reject) => {
    firebird.attach(firebirdOpts, (err, db) => {
      if (err) return reject(err);
      resolve(db);
    });
  });
}

function fbQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => {
      if (err) return reject(err);
      resolve(result || []);
    });
  });
}

async function applyUpdatesToFirebird(fbDb, records, getValueFn) {
  return new Promise((resolve, reject) => {
    fbDb.transaction(firebird.ISOLATION_READ_COMMITTED, async (err, tr) => {
      if (err) return reject(err);
      try {
        const updateSql =
          'UPDATE PRODUTOS SET PROD_PRCREDIARIO = ?, LASTUPDATE = CURRENT_TIMESTAMP WHERE PRODUTO_ID = ?';
        let count = 0;
        for (const rec of records) {
          const val = getValueFn(rec);
          await new Promise((resQ, rejQ) => {
            tr.query(updateSql, [val, rec.produtoId], errQ => {
              if (errQ) return rejQ(errQ);
              count++;
              resQ();
            });
          });
        }
        tr.commit(errCommit => {
          if (errCommit) {
            return tr.rollback(() => reject(errCommit));
          }
          resolve(count);
        });
      } catch (execErr) {
        tr.rollback(() => reject(execErr));
      }
    });
  });
}

async function backupAndUpdateBelinhaSqlite(records, getValueFn, stamp, modeLabel = 'update') {
  if (!fs.existsSync(config.dbPath)) {
    console.warn(`[Belinha SQLite] ⚠️ Arquivo ${config.dbPath} não encontrado neste host — pulando atualização local.`);
    return { updatedProducts: 0, updatedCache: 0, backupPath: null };
  }

  const sqliteDb = new Database(config.dbPath);
  try {
    const sqliteBackupPath = path.join(config.backupDir, `belafarma_pre_crediario_${modeLabel}_${stamp}.db`);
    await sqliteDb.backup(sqliteBackupPath);
    console.log(`[Backup SQLite] ✅ Cópia segura salva em: ${sqliteBackupPath}`);

    const hasProducts = Boolean(
      sqliteDb.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='products'").get()
    );
    const hasCache = Boolean(
      sqliteDb.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='digifarma_products_cache'").get()
    );

    let updatedProducts = 0;
    let updatedCache = 0;

    sqliteDb.transaction(() => {
      const updProd = hasProducts
        ? sqliteDb.prepare(
            "UPDATE products SET crediario_price = ?, updated_at = datetime('now', 'localtime') WHERE code = ?"
          )
        : null;
      const updCache = hasCache
        ? sqliteDb.prepare(
            "UPDATE digifarma_products_cache SET preco_crediario = ?, atualizado_em = datetime('now', 'localtime') WHERE produto_id = ?"
          )
        : null;

      for (const rec of records) {
        const val = getValueFn(rec);
        const numVal = val === null || val === undefined ? 0 : Number(val);
        const codeStr = String(rec.produtoId);
        if (updProd) {
          updatedProducts += updProd.run(numVal, codeStr).changes;
        }
        if (updCache) {
          updatedCache += updCache.run(numVal, codeStr).changes;
        }
      }
    })();

    return { updatedProducts, updatedCache, backupPath: sqliteBackupPath };
  } finally {
    sqliteDb.close();
  }
}

function saveAnomalyCsv(anomalies, stamp) {
  const anomalyCsvPath = path.join(config.backupDir, `crediario_precos_anomalias_${stamp}.csv`);
  writeCsv(
    anomalyCsvPath,
    [
      'PRODUTO_ID',
      'PRODUTO',
      'APRESENTACAO',
      'EAN',
      'ESTOQUE',
      'TIPO_PRECO',
      'PRECO_VENDA_USADO_BASE',
      'PRECO_PROMOCAO_ANOMALO',
      'CREDIARIO_ANTERIOR',
      'CREDIARIO_CALCULADO_20PCT'
    ],
    anomalies.map(a => [
      a.produtoId,
      a.nome,
      a.apresentacao,
      a.ean,
      a.saldo,
      a.tipoPreco || '',
      formatBrNum(a.precoVenda),
      formatBrNum(a.precoPromocao),
      formatBrNum(a.precoCrediarioAnterior),
      formatBrNum(a.precoCrediarioNovo)
    ])
  );
  return anomalyCsvPath;
}

function printSummary(plan) {
  const { stats, updates, anomalies } = plan;
  console.log('\n==================== RESUMO DO RECÁLCULO DE CREDIÁRIO ====================');
  console.log(`Total de produtos ativos c/ estoque > 0:      ${stats.totalAnalisados}`);
  console.log(`- Base no Preço Promocional (+20%):           ${stats.basePromocional}`);
  console.log(`- Base no Preço de Venda Normal (+20%):       ${stats.baseVendaNormal}`);
  console.log(`- Base no Preço de Venda (Promo > Venda):     ${stats.baseVendaPorAnomaliaPromo}  <-- ANOMALIAS`);
  console.log(`- Ignorados (sem preço base cadastrado):      ${stats.totalSemPreco}`);
  console.log('--------------------------------------------------------------------------');
  console.log(`Total que SERÃO ALTERADOS:                    ${stats.totalAtualizaveis}`);
  console.log(`  • Novos (antes eram R$ 0 ou NULL):          ${stats.novosDoZero}`);
  console.log(`  • Aumentos de preço:                        ${stats.aumentos}`);
  console.log(`  • Reduções de preço:                        ${stats.reducoes}`);
  console.log(`Total sem mudança (já estavam no padrão):     ${stats.totalSemAlteracao}`);
  console.log('--------------------------------------------------------------------------');
  console.log(
    `Auditoria de centavos (0 / 5 / 9 / inválidos): ${stats.terminacoes.zero} / ${stats.terminacoes.cinco} / ${stats.terminacoes.nove} / ${stats.terminacoes.invalido}`
  );
  console.log('==========================================================================\n');

  const topAumentos = [...updates]
    .filter(u => u.direcao === 'AUMENTO')
    .sort((a, b) => b.diferenca - a.diferenca)
    .slice(0, 8);
  const topReducoes = [...updates]
    .filter(u => u.direcao === 'REDUCAO')
    .sort((a, b) => a.diferenca - b.diferenca)
    .slice(0, 8);

  if (topAumentos.length > 0) {
    console.log('--- TOP 8 MAIORES AUMENTOS ---');
    console.table(
      topAumentos.map(u => ({
        ID: u.produtoId,
        Produto: u.nome.slice(0, 34),
        Base: `R$ ${u.precoBase.toFixed(2)} (${u.origemBase === 'PROMOCIONAL' ? 'Promo' : 'Venda'})`,
        Antes: `R$ ${(u.precoCrediarioAnterior || 0).toFixed(2)}`,
        Depois: `R$ ${u.precoCrediarioNovo.toFixed(2)}`,
        Diff: `+R$ ${u.diferenca.toFixed(2)}`
      }))
    );
  }

  if (topReducoes.length > 0) {
    console.log('--- TOP 8 MAIORES REDUÇÕES ---');
    console.table(
      topReducoes.map(u => ({
        ID: u.produtoId,
        Produto: u.nome.slice(0, 34),
        Base: `R$ ${u.precoBase.toFixed(2)} (${u.origemBase === 'PROMOCIONAL' ? 'Promo' : 'Venda'})`,
        Antes: `R$ ${(u.precoCrediarioAnterior || 0).toFixed(2)}`,
        Depois: `R$ ${u.precoCrediarioNovo.toFixed(2)}`,
        Diff: `-R$ ${Math.abs(u.diferenca).toFixed(2)}`
      }))
    );
  }

  if (anomalies.length > 0) {
    console.log(`--- LISTA DOS ${anomalies.length} PRODUTOS COM PROMOÇÃO MAIOR QUE PREÇO DE VENDA (usando Venda + 20%) ---`);
    console.table(
      anomalies.map(a => ({
        ID: a.produtoId,
        Produto: a.nome.slice(0, 36),
        Venda: `R$ ${a.precoVenda.toFixed(2)}`,
        Promo: `R$ ${a.precoPromocao.toFixed(2)}`,
        CredAntes: `R$ ${(a.precoCrediarioAnterior || 0).toFixed(2)}`,
        CredNovo: `R$ ${a.precoCrediarioNovo.toFixed(2)}`
      }))
    );
  }
}

async function runCli() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  const rollbackIdx = args.indexOf('--rollback');
  const rollbackFile = rollbackIdx >= 0 ? args[rollbackIdx + 1] : null;
  const stamp = formatTimestampFile(new Date());

  if (rollbackFile) {
    if (!fs.existsSync(rollbackFile)) {
      console.error(`❌ Arquivo de backup não encontrado: ${rollbackFile}`);
      process.exit(1);
    }
    const payload = JSON.parse(fs.readFileSync(rollbackFile, 'utf-8'));
    const records = Array.isArray(payload.items) ? payload.items : [];
    if (records.length === 0) {
      console.error('❌ Backup sem registros válidos para restaurar.');
      process.exit(1);
    }

    console.log(`↩️ [Rollback] Restaurando ${records.length} produtos a partir de ${rollbackFile}...`);
    const fbDb = await attachFirebird();
    try {
      const restoredFb = await applyUpdatesToFirebird(fbDb, records, r => r.precoCrediarioAnterior);
      console.log(`✅ [Rollback Digifarma] ${restoredFb} produtos restaurados com sucesso!`);
    } finally {
      fbDb.detach();
    }

    const sqRes = await backupAndUpdateBelinhaSqlite(records, r => r.precoCrediarioAnterior, stamp, 'rollback');
    console.log(
      `✅ [Rollback Belinha] products: ${sqRes.updatedProducts} atualizados | digifarma_products_cache: ${sqRes.updatedCache} atualizados.`
    );
    return;
  }

  console.log(`[Recálculo Crediário] Conectando ao Digifarma (${firebirdOpts.host}:${firebirdOpts.port})...`);
  const fbDb = await attachFirebird();

  try {
    const rows = await fbQuery(fbDb, SELECT_ACTIVE_IN_STOCK_SQL);
    const plan = buildCrediarioPlan(rows, new Date());

    if (plan.stats.terminacoes.invalido > 0) {
      throw new Error(`Falha de auditoria: ${plan.stats.terminacoes.invalido} preços com terminação inválida!`);
    }

    printSummary(plan);

    const anomalyCsvPath = saveAnomalyCsv(plan.anomalies, stamp);
    console.log(`📄 Relatório das ${plan.anomalies.length} anomalias salvo em: ${anomalyCsvPath}`);

    if (!isExecute) {
      const previewJsonPath = path.join(config.backupDir, `crediario_precos_preview_${stamp}.json`);
      fs.writeFileSync(
        previewJsonPath,
        JSON.stringify(
          {
            mode: 'DRY_RUN',
            generatedAt: new Date().toISOString(),
            host: firebirdOpts.host,
            stats: plan.stats,
            anomalies: plan.anomalies,
            updates: plan.updates
          },
          null,
          2
        ),
        'utf-8'
      );
      console.log(`🔎 [DRY-RUN] Prévia completa salva em: ${previewJsonPath}`);
      console.log('ℹ️  NENHUM banco foi alterado. Para aplicar com backup automático, execute com --execute.');
      return;
    }

    const backupJsonPath = path.join(config.backupDir, `crediario_precos_backup_${stamp}.json`);
    const backupCsvPath = path.join(config.backupDir, `crediario_precos_backup_${stamp}.csv`);

    fs.writeFileSync(
      backupJsonPath,
      JSON.stringify(
        {
          mode: 'BACKUP_PRE_EXECUTE',
          createdAt: new Date().toISOString(),
          host: firebirdOpts.host,
          stats: plan.stats,
          items: plan.items
        },
        null,
        2
      ),
      'utf-8'
    );

    writeCsv(
      backupCsvPath,
      [
        'PRODUTO_ID',
        'PRODUTO',
        'EAN',
        'ESTOQUE',
        'TIPO_PRECO',
        'PRECO_VENDA',
        'PRECO_PROMOCAO',
        'ORIGEM_BASE',
        'PRECO_BASE',
        'CREDIARIO_ANTERIOR',
        'CREDIARIO_NOVO',
        'DIFERENCA',
        'DIRECAO'
      ],
      plan.items.map(it => [
        it.produtoId,
        it.nome,
        it.ean,
        it.saldo,
        it.tipoPreco || '',
        formatBrNum(it.precoVenda),
        formatBrNum(it.precoPromocao),
        it.origemBase,
        formatBrNum(it.precoBase),
        formatBrNum(it.precoCrediarioAnterior),
        formatBrNum(it.precoCrediarioNovo),
        formatBrNum(it.diferenca),
        it.direcao
      ])
    );

    console.log(`💾 [Backup Digifarma] JSON salvo em: ${backupJsonPath}`);
    console.log(`💾 [Backup Digifarma] CSV salvo em:  ${backupCsvPath}`);

    if (plan.updates.length === 0) {
      console.log('✅ Todos os produtos já estão exatamente no padrão +20%. Nenhuma escrita necessária.');
      return;
    }

    console.log(`🚀 [Digifarma] Aplicando ${plan.updates.length} atualizações em transação atômica...`);
    const updatedFb = await applyUpdatesToFirebird(fbDb, plan.updates, r => r.precoCrediarioNovo);
    console.log(`✅ [Digifarma] ${updatedFb} produtos atualizados com COMMIT confirmado!`);

    const sqRes = await backupAndUpdateBelinhaSqlite(plan.updates, r => r.precoCrediarioNovo, stamp, 'execute');
    console.log(
      `✅ [Belinha SQLite] products: ${sqRes.updatedProducts} atualizados | digifarma_products_cache: ${sqRes.updatedCache} atualizados.`
    );
    console.log(`\n🛡️  Para desfazer se necessário:\n    node backend/scripts/recalcular-preco-crediario.js --rollback "${backupJsonPath}"`);
  } finally {
    try {
      fbDb.detach();
    } catch (_) {}
  }
}

if (require.main === module) {
  runCli()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Erro fatal no recálculo de crediário:', err.message);
      process.exit(1);
    });
}

module.exports = {
  roundCrediario,
  isPromoActive,
  buildCrediarioPlan
};
