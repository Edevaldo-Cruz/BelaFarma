const db = require('../database');
const { queryDigifarma } = require('./digifarma.service');
let equivService = null;
try {
  equivService = require('./compras-equivalentes.service');
} catch (e) {}

function mapearTipoPorCategoria(categoriaId, productName) {
  const cat = Number(categoriaId || 0);
  if (cat === 7) return 'Genérico';
  if (cat === 2) return 'Similar';
  if (cat === 1) return 'Marca (Referência)';
  if (cat === 5) return 'Perfumaria';
  if (cat === 6) return 'Outros';
  const nomeLower = (productName || '').toLowerCase();
  if (nomeLower.includes('gen')) return 'Genérico';
  return 'Sistema';
}

/**
 * Pré-carrega saldos reais do Firebird para os itens críticos e todos os seus possíveis equivalentes.
 */
async function carregarSaldosReaisEquivalentes(results) {
  const saldosReaisMap = new Map();
  if (!Array.isArray(results) || results.length === 0) return saldosReaisMap;

  const idsParaConsultar = new Set();
  const cacheSubMap = new Map();

  for (const r of results) {
    const pid = Number(r.PRODUTO_ID);
    if (pid > 0) {
      idsParaConsultar.add(pid);
      saldosReaisMap.set(pid, Number(r.ESTOQUE) || 0);
    }
  }

  try {
    const pids = [...idsParaConsultar];
    for (let i = 0; i < pids.length; i += 100) {
      const lote = pids.slice(i, i + 100);
      const placeholders = lote.map(() => '?').join(',');
      const cacheRows = db.prepare(`
        SELECT produto_id, substancia_nome, apresentacao
        FROM compras_estoque_cache
        WHERE produto_id IN (${placeholders})
      `).all(...lote);
      for (const cr of cacheRows) {
        cacheSubMap.set(Number(cr.produto_id), cr);
      }

      const membros = db.prepare(`
        SELECT pe2.produto_id
        FROM compras_produtos_equivalentes pe1
        JOIN compras_produtos_equivalentes pe2 ON pe2.grupo_id = pe1.grupo_id
        WHERE pe1.produto_id IN (${placeholders})
      `).all(...lote);
      for (const m of membros) {
        if (Number(m.produto_id) > 0) idsParaConsultar.add(Number(m.produto_id));
      }
    }

    // Inclui também possíveis equivalentes no cache por chave canônica quando ainda não vinculados
    if (equivService) {
      for (const r of results) {
        if (Number(r.CATEGORIA_ID) === 5) continue;
        const pid = Number(r.PRODUTO_ID);
        const cacheInfo = cacheSubMap.get(pid);
        const attr = equivService.extrairAtributosProduto(r.DESCRICAO, {
          apresentacao: r.APRESENTACAO || cacheInfo?.apresentacao,
          substanciaNome: cacheInfo?.substancia_nome,
          categoriaId: r.CATEGORIA_ID,
          ean: r.EAN
        });
        if (attr && attr.isMedicamento && attr.chave) {
          const g = db.prepare('SELECT id FROM compras_grupos_equivalentes WHERE chave_canonica = ? LIMIT 1').get(attr.chave);
          if (g) {
            const mems = db.prepare('SELECT produto_id FROM compras_produtos_equivalentes WHERE grupo_id = ?').all(g.id);
            for (const m of mems) {
              if (Number(m.produto_id) > 0) idsParaConsultar.add(Number(m.produto_id));
            }
          }
          const prefixo = attr.principio.split(/[\s+]+/)[0];
          if (prefixo && prefixo.length >= 4) {
            const cands = db.prepare(`
              SELECT produto_id FROM compras_estoque_cache
              WHERE categoria_id != 5 AND saldo > 0 AND (descricao LIKE ? OR substancia_nome LIKE ?)
              LIMIT 40
            `).all(`%${prefixo.slice(0, 6)}%`, `%${prefixo.slice(0, 6)}%`);
            for (const c of cands) {
              if (Number(c.produto_id) > 0) idsParaConsultar.add(Number(c.produto_id));
            }
          }
        }
      }
    }

    // Consulta o estoque real atual no Firebird em lotes de 100 IDs literais
    const allIds = [...idsParaConsultar].filter(id => id > 0);
    for (let i = 0; i < allIds.length; i += 100) {
      const lote = allIds.slice(i, i + 100);
      const placeholders = lote.map(() => '?').join(',');
      const rowsFb = await queryDigifarma(
        `SELECT PRODUTO_ID, PROD_SALDO FROM PRODUTOS WHERE PRODUTO_ID IN (${placeholders})`,
        lote,
        10000
      );
      for (const rowFb of (rowsFb || [])) {
        saldosReaisMap.set(Number(rowFb.PRODUTO_ID), Number(rowFb.PROD_SALDO) || 0);
      }
    }
  } catch (errLoad) {
    console.warn('[AutoShortages] Aviso ao carregar saldos ao vivo de equivalentes:', errLoad.message);
  }

  return { saldosReaisMap, cacheSubMap };
}

/**
 * Busca vendas no Digifarma dos últimos X dias onde o estoque atual <= 1
 * e os insere na tabela shortages silenciosamente — ignorando itens cobertos por equivalentes em estoque.
 * @param {number} daysAgo - Quantos dias atrás (0 para hoje apenas, 5 para últimos 5 dias, etc.)
 */
async function runAutoShortages(daysAgo = 0) {
  try {
    console.log(`[AutoShortages] Buscando itens vendidos nos últimos ${daysAgo} dias com estoque crítico (<= 1)...`);
    
    const days = Number(daysAgo) || 0;
    const sql = `
      SELECT DISTINCT
        P.PRODUTO_ID, 
        P.PRODUTO as DESCRICAO,
        P.APRESENTACAO,
        P.COD_BARRAS as EAN,
        P.CATEGORIA_ID,
        P.PROD_SALDO as ESTOQUE,
        COALESCE(P.PROD_PRCOMPRA, P.VALOR_ULT_COMPRA, 0) as VALOR_COMPRA
      FROM CAB_VENDAS C
      JOIN ITEM_VENDAS I ON C.VENDA_NOTA_ID = I.VENDA_NOTA_ID
      JOIN PRODUTOS P ON I.PRODUTO_ID = P.PRODUTO_ID
      WHERE 
        CAST(C.VENDA_DATA_HORA AS DATE) >= DATEADD(-${days} DAY TO CURRENT_DATE)
        AND C.CANCELADO <> 'S'
        AND P.PROD_SALDO <= 1
    `;
    
    let results = [];
    try {
      results = await queryDigifarma(sql, []);
    } catch (fallbackErr) {
      const sqlFallback = `
        SELECT DISTINCT
          P.PRODUTO_ID, 
          P.PRODUTO as DESCRICAO,
          P.APRESENTACAO,
          P.COD_BARRAS as EAN,
          P.CATEGORIA_ID,
          P.PROD_SALDO as ESTOQUE,
          COALESCE(P.PROD_PRCOMPRA, P.VALOR_ULT_COMPRA, 0) as VALOR_COMPRA
        FROM CAB_VENDAS C
        JOIN ITEM_VENDAS I ON C.VENDA_NOTA_ID = I.VENDA_NOTA_ID
        JOIN PRODUTOS P ON I.PRODUTO_ID = P.PRODUTO_ID
        WHERE 
          CAST(C.VENDA_DATA_HORA AS DATE) >= CURRENT_DATE - ${days}
          AND C.CANCELADO <> 'S'
          AND P.PROD_SALDO <= 1
      `;
      results = await queryDigifarma(sqlFallback, []);
    }

    if (!results || results.length === 0) {
      console.log(`[AutoShortages] Nenhum item crítico encontrado.`);
      return { added: 0, attention: 0, skippedByEquivalent: 0 };
    }

    const { saldosReaisMap, cacheSubMap } = await carregarSaldosReaisEquivalentes(results);

    const insertShortage = db.prepare(`
      INSERT INTO shortages (
        id, productName, type, clientInquiry, notes, createdAt, userName, source,
        purchased, ordered, saldo, valorUltimaCompra, coberto_por_equivalente, equivalente_info
      )
      VALUES (?, ?, ?, 0, ?, ?, 'Sistema (Automático)', 'auto', 0, 0, ?, ?, 0, ?)
    `);

    const checkExisting = db.prepare(`
      SELECT id FROM shortages 
      WHERE UPPER(TRIM(productName)) = UPPER(TRIM(?)) AND purchased = 0 AND ordered = 0
      LIMIT 1
    `);

    const faltasAbertasRows = db.prepare(`
      SELECT UPPER(TRIM(productName)) as nome FROM shortages WHERE purchased = 0 AND ordered = 0
    `).all();
    const faltasAbertasSet = new Set(faltasAbertasRows.map(r => r.nome).filter(Boolean));

    let countZero = 0;
    let countOne = 0;
    let skippedByEquivalent = 0;
    const now = new Date().toISOString();

    db.transaction(() => {
      for (const row of results) {
        const productName = (row.DESCRICAO || '').trim();
        if (!productName) continue;
        
        const nomeUp = productName.toUpperCase();
        if (faltasAbertasSet.has(nomeUp) || checkExisting.get(productName)) {
          continue;
        }

        const pid = Number(row.PRODUTO_ID);
        const cacheInfo = cacheSubMap.get(pid);
        let aval = null;

        if (equivService && typeof equivService.avaliarCoberturaEquivalente === 'function') {
          aval = equivService.avaliarCoberturaEquivalente({
            produto_id: pid,
            descricao: productName,
            apresentacao: (row.APRESENTACAO || cacheInfo?.apresentacao || '').trim(),
            ean: (row.EAN || '').trim(),
            categoria_id: Number(row.CATEGORIA_ID || 0),
            substancia_nome: cacheInfo?.substancia_nome || null,
            saldo: Number(row.ESTOQUE) || 0
          }, {
            limiteMinimoSaldoGrupo: 1,
            saldosReaisMap
          }, db);

          // Regra A2: Se saldo consolidado de equivalentes elegíveis > 1, NÃO lança falta!
          if (aval.coberto) {
            skippedByEquivalent++;
            console.log(`[AutoShortages] 🛡️ Ignorado por equivalente: ${productName} (saldo próprio=${row.ESTOQUE}) -> ${aval.motivo}`);
            continue;
          }

          // Evita duplicar falta se outro laboratório equivalente (não Referência) já tem falta aberta na lista
          if (!aval.isReferencia && Array.isArray(aval.todosMembrosGrupo) && aval.todosMembrosGrupo.length > 1) {
            const outroJaNaLista = aval.todosMembrosGrupo.some(m => {
              const mNome = String(m.descricao || '').trim().toUpperCase();
              if (!mNome) return false;
              if (faltasAbertasSet.has(mNome)) return true;
              // Também checa prefixo caso shortages tenha gravado sem apresentação
              for (const aberto of faltasAbertasSet) {
                if (aberto.length >= 10 && mNome.startsWith(aberto)) return true;
              }
              return false;
            });
            if (outroJaNaLista) {
              skippedByEquivalent++;
              console.log(`[AutoShortages] 🔗 Evitada falta duplicada no grupo ${aval.grupoNome}: ${productName}`);
              continue;
            }
          }
        }

        const saldoProprio = Number(row.ESTOQUE) || 0;
        const saldoGrupo = aval ? aval.saldoGrupo : Math.max(0, saldoProprio);
        const temUmEmEquivalente = saldoProprio <= 0 && saldoGrupo === 1 && aval && aval.equivalentesComEstoque.length > 0;
        const isAttention = saldoProprio === 1 || temUmEmEquivalente;

        let notes = '';
        if (saldoProprio === 1) {
          notes = '[ATENÇÃO: RESTA 1 NO ESTOQUE]';
        } else if (temUmEmEquivalente) {
          const eq1 = aval.equivalentesComEstoque[0];
          notes = `[ATENÇÃO: RESTA 1 NO ESTOQUE] (Equiv: ${eq1.descricao})`;
        }

        const equivInfoJson = aval && aval.grupoNome
          ? JSON.stringify({
              coberto: false,
              grupoNome: aval.grupoNome,
              saldoGrupo: aval.saldoGrupo,
              equivalentesComEstoque: aval.equivalentesComEstoque.slice(0, 5)
            })
          : null;

        const productType = mapearTipoPorCategoria(row.CATEGORIA_ID, productName);
        const id = 'sh_auto_' + Date.now().toString() + '_' + Math.random().toString(36).substring(2, 10);
        
        insertShortage.run(
          id,
          productName,
          productType,
          notes,
          now,
          saldoProprio,
          row.VALOR_COMPRA || 0,
          equivInfoJson
        );
        faltasAbertasSet.add(nomeUp);
        
        if (isAttention) countOne++;
        else countZero++;
      }
    })();

    console.log(`[AutoShortages] Concluído. Adicionados ${countZero} zerados, ${countOne} atenção, ${skippedByEquivalent} evitados por equivalentes.`);
    
    // Avisa o Vigilante em caso de sucesso
    try {
      const watcher = require('./watcher.service');
      watcher.registerServiceRun('auto_shortages', 'SUCCESS');
      
      const adminPhone = (process.env.ADMIN_WHATSAPP || '').replace(/\D/g, '');
      if (adminPhone) {
        const baileys = require('../baileys-service');
        const msg = `🛡️ *[Vigilante BelaFarma]*\n\nA rotina de faltas automáticas (últimos ${days} dias) foi finalizada.\n\n✅ *${countZero}* itens zerados inseridos.\n⚠️ *${countOne}* itens com atenção inseridos.\n💊 *${skippedByEquivalent}* falsas faltas evitadas por equivalentes em estoque.`;
        if (baileys.getStatus().connected) {
          baileys.sendTextMessage(adminPhone, msg).catch(e => console.error('Erro ao enviar whatsapp auto-shortages:', e));
        }
      }
    } catch (watcherErr) {
      console.error('[AutoShortages] Erro ao registrar sucesso no Vigilante:', watcherErr.message);
    }

    return { added: countZero, attention: countOne, skippedByEquivalent };

  } catch (err) {
    console.error('[AutoShortages] Erro ao rodar rotina:', err);
    
    try {
      const watcher = require('./watcher.service');
      watcher.registerServiceRun('auto_shortages', 'FAILED', err.message);
    } catch (watcherErr) {
      console.error('[AutoShortages] Erro ao registrar falha no Vigilante:', watcherErr.message);
    }

    return { error: err.message };
  }
}

module.exports = {
  runAutoShortages
};
