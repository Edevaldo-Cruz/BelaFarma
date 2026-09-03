const crypto = require('crypto');
const defaultDb = require('../database.js');

function getDb(db) {
  return (db && typeof db.prepare === 'function') ? db : defaultDb;
}

const LABS_RECONHECIDOS = [
  'MEDQUIMICA', 'MEDQUIMIC', 'LEGRAND', 'EMS', 'CIMED', 'NEO QUIMICA', 'MEDLEY', 'EUROFARMA',
  'TEUTO', 'GERMED', 'PRATI', 'ACHE', 'SANDOZ', 'BIOLAB', 'NOVA QUIMICA', 'GEOLAB',
  'SANVAL', 'BELFAR', 'PHARLAB', 'LISMED', 'BIOSINTETICA', 'HYPERA', 'GLAXO',
  'ASTRAZENECA', 'SANOFI', 'NOVARTIS', 'BAYER', 'TAKEDA', 'ABBOTT', 'APSEN',
  'CRISTALIA', 'MANTECORP', 'VITAMEDIC', 'VITAPAN', 'GLOBO', 'ONE'
];

/**
 * Extrai atributos de padronização farmacêutica a partir da descrição do produto.
 * - princípio ativo / nome base
 * - dosagem (ex: 150MG, 500MG, 20MG, 1G)
 * - quantidade de unidades/comprimidos (ex: C/ 2, 9X10 = 90, C/ 1)
 * - forma farmacêutica (CÁPSULA, COMPRIMIDO, GOTAS, etc.)
 * - laboratório (se presente no texto)
 */
function extrairAtributosProduto(nome) {
  if (!nome || typeof nome !== 'string') {
    return { principio: 'OUTROS', dosagem: '', unidades: 1, forma: 'UN', laboratorio: null, chave: 'OUTROS 1' };
  }

  const norm = nome.toUpperCase().trim();

  // Detecta laboratório
  let laboratorio = null;
  for (const lab of LABS_RECONHECIDOS) {
    if (norm.includes(lab)) {
      laboratorio = lab;
      break;
    }
  }

  // Detecta unidades na embalagem
  let unidades = 1;
  const multMatch = /(\d+)\s*[Xx]\s*(\d+)/.exec(norm);
  if (multMatch) {
    unidades = parseInt(multMatch[1], 10) * parseInt(multMatch[2], 10);
  } else {
    const unMatch = /(?:C\/|CX\/|COM|\/)\s*(\d+)\s*(?:CPS|CP|CPR|COMP|CAPS|FLAC|AMP|ENV|SACH|TB)?\b/i.exec(norm) ||
                    /\b(\d+)\s*(?:CPS|CPR|COMP|CAPS|FLAC|AMP|ENV)\b/i.exec(norm);
    if (unMatch) {
      unidades = parseInt(unMatch[1], 10);
    }
  }

  // Detecta dosagem
  let dosagem = '';
  const doseMatch = /(\d+(?:[,\.]\d+)?)\s*(MG|G|MCG|ML|L)\b/i.exec(norm);
  if (doseMatch) {
    dosagem = doseMatch[1].replace(',', '.') + doseMatch[2].toUpperCase();
  }

  // Detecta forma
  let forma = 'COMP/CAPS';
  if (norm.includes('GOTAS') || norm.includes('GTS')) forma = 'GOTAS';
  else if (norm.includes('XPE') || norm.includes('XAROPE')) forma = 'XAROPE';
  else if (norm.includes('SUSP')) forma = 'SUSPENSÃO';
  else if (norm.includes('POM') || norm.includes('POMADA')) forma = 'POMADA';
  else if (norm.includes('CREME') || norm.includes('CRM')) forma = 'CREME';
  else if (norm.includes('INJ') || norm.includes('INJETAVEL')) forma = 'INJETÁVEL';
  else if (norm.includes('CPS') || norm.includes('CAPS')) forma = 'CÁPSULA';
  else if (norm.includes('CPR') || norm.includes('COMP')) forma = 'COMPRIMIDO';

  // Extrai princípio ativo / nome base (remove stopwords, labs e números de apresentação)
  const stopwords = new Set([
    'DE', 'DA', 'DO', 'DOS', 'DAS', 'COM', 'PARA', 'POR', 'C', 'MG', 'CPR', 'CAPS', 'CPS', 'COMP',
    'DRG', 'G', 'ML', 'L', 'GEN', 'GENERICO', 'GENÉRICO', 'SIMILAR', 'REF', 'REFERENCIA',
    'LOTES', 'BL', 'CX', 'FR', 'TB', ...LABS_RECONHECIDOS
  ]);

  const tokens = norm.replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopwords.has(w) && !/^\d+$/.test(w));

  let principio = tokens.length > 0 ? tokens[0] : 'OUTROS';
  // Casos compostos comuns (ex: AMOXICILINA CLAVULANATO, LOSARTANA POTASSICA, DIPIRONA MONOIDRATADA)
  if (tokens.length >= 2 && ['POTASSICA', 'CLAVULANATO', 'POTASSICO', 'SODICA', 'SODICO'].includes(tokens[1])) {
    principio = `${tokens[0]} ${tokens[1]}`;
  }

  const chave = `${principio} ${dosagem} C/ ${unidades} ${forma}`.replace(/\s+/g, ' ').trim();

  return {
    principio,
    dosagem,
    unidades,
    forma,
    laboratorio,
    chave
  };
}

/**
 * Consulta o estoque consolidado e histórico de compras de um grupo de equivalentes.
 */
function obterEstoqueConsolidadoGrupo(grupoId, dbInstance) {
  const db = getDb(dbInstance);
  if (!db || !grupoId) return null;

  const grupo = db.prepare('SELECT * FROM compras_grupos_equivalentes WHERE id = ?').get(grupoId);
  if (!grupo) return null;

  const produtos = db.prepare(`
    SELECT 
      pe.id as vinculo_id,
      pe.produto_id,
      pe.ean,
      pe.descricao,
      pe.laboratorio,
      pe.manual_override,
      COALESCE(ec.saldo, 0) as saldo,
      COALESCE(ec.est_minimo_calculado, ec.est_minimo_digifarma, 0) as est_minimo,
      COALESCE(ec.custo_unitario, 0) as custo_unitario,
      COALESCE(ec.ultima_compra_valor, 0) as ultima_compra_valor,
      COALESCE(ec.vmd_ponderado, 0) as vmd_ponderado
    FROM compras_produtos_equivalentes pe
    LEFT JOIN compras_estoque_cache ec ON pe.produto_id = ec.produto_id
    WHERE pe.grupo_id = ?
    ORDER BY ec.saldo DESC, pe.descricao ASC
  `).all(grupoId);

  let saldoTotal = 0;
  let estMinimoTotal = 0;
  let comprasValidas = [];

  for (const p of produtos) {
    saldoTotal += Number(p.saldo || 0);
    // Para produtos equivalentes intercambiáveis, o estoque mínimo do grupo reflete o giro conjunto
    estMinimoTotal = Math.max(estMinimoTotal, Number(p.est_minimo || 0));
    if (p.ultima_compra_valor && Number(p.ultima_compra_valor) > 0) {
      comprasValidas.push(Number(p.ultima_compra_valor));
    }
  }

  // Se o grupo tem um estoque mínimo explicitamente configurado, respeita
  if (grupo.est_minimo_grupo && Number(grupo.est_minimo_grupo) > 0) {
    estMinimoTotal = Number(grupo.est_minimo_grupo);
  }

  const menorUltimaCompra = comprasValidas.length > 0 ? Math.min(...comprasValidas) : 0;
  const mediaUltimaCompra = comprasValidas.length > 0
    ? Number((comprasValidas.reduce((a, b) => a + b, 0) / comprasValidas.length).toFixed(2))
    : 0;

  const emRuptura = saldoTotal <= 0 || (estMinimoTotal > 0 && saldoTotal < estMinimoTotal);

  return {
    grupoId: grupo.id,
    nomeGrupo: grupo.nome_grupo,
    principioAtivo: grupo.principio_ativo,
    dosagem: grupo.dosagem,
    unidadesEmbalagem: grupo.unidades_embalagem,
    formaFarmaceutica: grupo.forma_farmaceutica,
    saldoTotal,
    estMinimoTotal,
    emRuptura,
    menorUltimaCompra,
    mediaUltimaCompra,
    quantidadeProdutos: produtos.length,
    produtos
  };
}

/**
 * Busca se um produto pertence a algum grupo de equivalência existente.
 * Busca por produto_id, EAN ou semelhança estrita de chave.
 */
function buscarGrupoPorProduto(produtoId, ean, produtoNome, dbInstance) {
  const db = getDb(dbInstance);
  if (!db) return null;

  // 1. Busca por produto_id vinculado
  if (produtoId) {
    const vinculo = db.prepare('SELECT grupo_id FROM compras_produtos_equivalentes WHERE produto_id = ? LIMIT 1').get(produtoId);
    if (vinculo) {
      return obterEstoqueConsolidadoGrupo(vinculo.grupo_id, db);
    }
  }

  // 2. Busca por EAN vinculado
  if (ean) {
    const vinculoEan = db.prepare('SELECT grupo_id FROM compras_produtos_equivalentes WHERE ean = ? LIMIT 1').get(ean);
    if (vinculoEan) {
      return obterEstoqueConsolidadoGrupo(vinculoEan.grupo_id, db);
    }
  }

  // 3. Busca por correspondência exata de Princípio Ativo + Dosagem + Unidades
  if (produtoNome) {
    const attr = extrairAtributosProduto(produtoNome);
    if (attr.principio && attr.principio !== 'OUTROS' && attr.unidades > 0) {
      const matchGrupo = db.prepare(`
        SELECT id FROM compras_grupos_equivalentes 
        WHERE principio_ativo = ? 
          AND unidades_embalagem = ?
          AND (dosagem = ? OR (dosagem IS NULL AND ? = ''))
        LIMIT 1
      `).get(attr.principio, attr.unidades, attr.dosagem || '', attr.dosagem || '');

      if (matchGrupo) {
        return obterEstoqueConsolidadoGrupo(matchGrupo.id, db);
      }
    }
  }

  return null;
}

/**
 * Gera ou atualiza grupos automáticos a partir do catálogo em estoque cache.
 * Agrupa itens que compartilham o mesmo princípio ativo, dosagem e quantidade de unidades.
 */
function gerarGruposAutomaticos(dbInstance) {
  const db = getDb(dbInstance);
  if (!db) return { gruposCriados: 0, produtosVinculados: 0 };

  const prods = db.prepare(`
    SELECT produto_id, descricao, ean, saldo, est_minimo_calculado, est_minimo_digifarma, ultima_compra_valor, custo_unitario
    FROM compras_estoque_cache
    WHERE descricao IS NOT NULL AND descricao != ''
  `).all();

  // Agrupa em memória
  const gruposMap = new Map();

  for (const p of prods) {
    const attr = extrairAtributosProduto(p.descricao);
    if (!attr.principio || attr.principio === 'OUTROS' || attr.principio.length < 3) continue;

    const chave = `${attr.principio}|${attr.dosagem}|${attr.unidades}|${attr.forma}`;
    if (!gruposMap.has(chave)) {
      gruposMap.set(chave, {
        nomeGrupo: `${attr.principio} ${attr.dosagem} C/ ${attr.unidades} ${attr.forma}`.replace(/\s+/g, ' ').trim(),
        principio: attr.principio,
        dosagem: attr.dosagem,
        unidades: attr.unidades,
        forma: attr.forma,
        produtos: []
      });
    }

    gruposMap.get(chave).produtos.push({
      ...p,
      laboratorio: attr.laboratorio
    });
  }

  let gruposCriados = 0;
  let produtosVinculados = 0;
  const nowIso = new Date().toISOString();

  // Transação para persistir no banco
  const transaction = db.transaction(() => {
    for (const [chave, gData] of gruposMap.entries()) {
      // Cria grupo para itens que possuem 2 ou mais equivalentes (ou se for princípio farmacêutico reconhecido)
      if (gData.produtos.length < 2) continue;

      let grupo = db.prepare(`
        SELECT id FROM compras_grupos_equivalentes 
        WHERE principio_ativo = ? AND dosagem = ? AND unidades_embalagem = ?
      `).get(gData.principio, gData.dosagem, gData.unidades);

      let grupoId = grupo ? grupo.id : null;

      if (!grupoId) {
        grupoId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO compras_grupos_equivalentes (
            id, nome_grupo, principio_ativo, dosagem, unidades_embalagem, forma_farmaceutica, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          grupoId,
          gData.nomeGrupo,
          gData.principio,
          gData.dosagem,
          gData.unidades,
          gData.forma,
          nowIso,
          nowIso
        );
        gruposCriados++;
      }

      for (const prod of gData.produtos) {
        const existe = db.prepare(`
          SELECT id FROM compras_produtos_equivalentes WHERE produto_id = ?
        `).get(prod.produto_id);

        if (!existe) {
          db.prepare(`
            INSERT INTO compras_produtos_equivalentes (
              id, grupo_id, produto_id, ean, descricao, laboratorio, manual_override, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)
          `).run(
            crypto.randomUUID(),
            grupoId,
            prod.produto_id,
            prod.ean || null,
            prod.descricao,
            prod.laboratorio || null,
            nowIso
          );
          produtosVinculados++;
        }
      }
    }
  });

  transaction();

  return { gruposCriados, produtosVinculados };
}

/**
 * Listagem paginada de grupos equivalentes com saldos consolidados e busca.
 */
function listarGruposEquivalentes(filtros = {}, dbInstance) {
  const db = getDb(dbInstance);
  if (!db) return { total: 0, grupos: [] };

  let sql = `SELECT id FROM compras_grupos_equivalentes WHERE 1=1`;
  const params = [];

  if (filtros.busca) {
    sql += ` AND (nome_grupo LIKE ? OR principio_ativo LIKE ?)`;
    const b = `%${filtros.busca}%`;
    params.push(b, b);
  }

  sql += ` ORDER BY nome_grupo ASC`;

  const rows = db.prepare(sql).all(...params);
  let grupos = rows.map(r => obterEstoqueConsolidadoGrupo(r.id, db)).filter(Boolean);

  if (filtros.apenasRuptura) {
    grupos = grupos.filter(g => g.emRuptura);
  }

  const total = grupos.length;
  const pagina = parseInt(filtros.pagina, 10) || 1;
  const limite = parseInt(filtros.limite, 10) || 20;
  const offset = (pagina - 1) * limite;
  const paginados = grupos.slice(offset, offset + limite);

  return {
    total,
    pagina,
    limite,
    totalPaginas: Math.ceil(total / limite),
    grupos: paginados
  };
}

/**
 * Cria ou atualiza um grupo manualmente.
 */
function salvarGrupoManual(dados, dbInstance) {
  const db = getDb(dbInstance);
  if (!db) throw new Error('Banco de dados indisponível');

  const nowIso = new Date().toISOString();
  const id = dados.id || crypto.randomUUID();

  if (dados.id) {
    db.prepare(`
      UPDATE compras_grupos_equivalentes 
      SET nome_grupo = ?, principio_ativo = ?, dosagem = ?, unidades_embalagem = ?,
          forma_farmaceutica = ?, est_minimo_grupo = ?, observacoes = ?, updated_at = ?
      WHERE id = ?
    `).run(
      dados.nomeGrupo,
      dados.principioAtivo,
      dados.dosagem || '',
      parseInt(dados.unidadesEmbalagem, 10) || 1,
      dados.formaFarmaceutica || 'COMP/CAPS',
      parseFloat(dados.estMinimoGrupo) || 0,
      dados.observacoes || null,
      nowIso,
      id
    );
  } else {
    db.prepare(`
      INSERT INTO compras_grupos_equivalentes (
        id, nome_grupo, principio_ativo, dosagem, unidades_embalagem,
        forma_farmaceutica, est_minimo_grupo, observacoes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      dados.nomeGrupo,
      dados.principioAtivo,
      dados.dosagem || '',
      parseInt(dados.unidadesEmbalagem, 10) || 1,
      dados.formaFarmaceutica || 'COMP/CAPS',
      parseFloat(dados.estMinimoGrupo) || 0,
      dados.observacoes || null,
      nowIso,
      nowIso
    );
  }

  return obterEstoqueConsolidadoGrupo(id, db);
}

/**
 * Vincula um produto existente do estoque ao grupo de equivalentes.
 */
function vincularProdutoAoGrupo(grupoId, produtoId, dbInstance) {
  const db = getDb(dbInstance);
  if (!db) throw new Error('Banco de dados indisponível');

  const grupo = db.prepare('SELECT id FROM compras_grupos_equivalentes WHERE id = ?').get(grupoId);
  if (!grupo) throw new Error('Grupo não encontrado');

  const prodEstoque = db.prepare(`
    SELECT produto_id, descricao, ean FROM compras_estoque_cache WHERE produto_id = ?
  `).get(produtoId) || db.prepare(`
    SELECT produto_id, descricao, codigo_barras as ean FROM digifarma_products_cache WHERE produto_id = ?
  `).get(produtoId);

  if (!prodEstoque) throw new Error('Produto não encontrado no cadastro do Digifarma');

  const attr = extrairAtributosProduto(prodEstoque.descricao);
  const nowIso = new Date().toISOString();

  db.prepare(`
    INSERT INTO compras_produtos_equivalentes (
      id, grupo_id, produto_id, ean, descricao, laboratorio, manual_override, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(grupo_id, produto_id) DO UPDATE SET
      ean = excluded.ean,
      descricao = excluded.descricao,
      laboratorio = excluded.laboratorio,
      manual_override = 1
  `).run(
    crypto.randomUUID(),
    grupoId,
    produtoId,
    prodEstoque.ean || null,
    prodEstoque.descricao,
    attr.laboratorio,
    nowIso
  );

  return obterEstoqueConsolidadoGrupo(grupoId, db);
}

/**
 * Desvincula um produto de um grupo de equivalência.
 */
function desvincularProdutoDoGrupo(grupoId, produtoId, dbInstance) {
  const db = getDb(dbInstance);
  if (!db) throw new Error('Banco de dados indisponível');

  db.prepare(`
    DELETE FROM compras_produtos_equivalentes WHERE grupo_id = ? AND produto_id = ?
  `).run(grupoId, produtoId);

  return obterEstoqueConsolidadoGrupo(grupoId, db);
}

/**
 * Exclui um grupo de equivalência por completo.
 */
function removerGrupoEquivalente(grupoId, dbInstance) {
  const db = getDb(dbInstance);
  if (!db) throw new Error('Banco de dados indisponível');

  db.prepare('DELETE FROM compras_grupos_equivalentes WHERE id = ?').run(grupoId);
  return { success: true };
}

module.exports = {
  extrairAtributosProduto,
  obterEstoqueConsolidadoGrupo,
  buscarGrupoPorProduto,
  gerarGruposAutomaticos,
  listarGruposEquivalentes,
  salvarGrupoManual,
  vincularProdutoAoGrupo,
  desvincularProdutoDoGrupo,
  removerGrupoEquivalente
};
