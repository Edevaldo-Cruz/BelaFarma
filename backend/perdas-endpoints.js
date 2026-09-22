const express = require('express');
const { queryDigifarma } = require('./services/digifarma.service');

function isControlledProduct(p) {
  if (!p) return false;
  const psico = String(p.PSICOTROPICO || '').toUpperCase().trim();
  if (psico === 'S') return true;

  const desc = String(p.PRODUTO || p.descricao || '').toUpperCase();
  // Padrões de listas de controle especial (Portaria 344 e antimicrobianos comuns)
  const pattern = /\b(A1|A2|A3|B1|B2|C1|C2|C3|C4|C5)\b|\((A[1-3]|B[1-2]|C[1-5])\)/i;
  if (pattern.test(desc)) return true;

  return false;
}

module.exports = function (db) {
  const router = express.Router();

  // 1. Buscar produto por código de barras ou nome
  router.get('/buscar-produto', async (req, res) => {
    try {
      const q = (req.query.q || '').trim();
      if (!q || q.length < 2) {
        return res.json([]);
      }

      const isNumeric = /^\d+$/.test(q);
      const isBarcode = isNumeric && q.length >= 7;

      let sql = '';
      let params = [];

      if (isBarcode) {
        sql = `
          SELECT FIRST 10
            p.PRODUTO_ID,
            p.PRODUTO,
            p.APRESENTACAO,
            p.COD_BARRAS,
            COALESCE(p.PROD_SALDO, 0) as PROD_SALDO,
            COALESCE(p.PROD_PRVENDA, 0) as PROD_PRVENDA,
            COALESCE(p.PROD_PRCOMPRA, p.VALOR_ULT_COMPRA, 0) as PROD_PRCOMPRA,
            p.PSICOTROPICO,
            p.PROD_LISTA
          FROM PRODUTOS p
          WHERE p.COD_BARRAS = ? OR p.COD_BARRAS LIKE ?
        `;
        params = [q, `%${q}%`];
      } else if (isNumeric && q.length <= 6) {
        // Possível PRODUTO_ID interno
        sql = `
          SELECT FIRST 10
            p.PRODUTO_ID,
            p.PRODUTO,
            p.APRESENTACAO,
            p.COD_BARRAS,
            COALESCE(p.PROD_SALDO, 0) as PROD_SALDO,
            COALESCE(p.PROD_PRVENDA, 0) as PROD_PRVENDA,
            COALESCE(p.PROD_PRCOMPRA, p.VALOR_ULT_COMPRA, 0) as PROD_PRCOMPRA,
            p.PSICOTROPICO,
            p.PROD_LISTA
          FROM PRODUTOS p
          WHERE p.PRODUTO_ID = ? OR p.COD_BARRAS = ?
        `;
        params = [parseInt(q, 10), q];
      } else {
        // Busca textual por nome
        sql = `
          SELECT FIRST 15
            p.PRODUTO_ID,
            p.PRODUTO,
            p.APRESENTACAO,
            p.COD_BARRAS,
            COALESCE(p.PROD_SALDO, 0) as PROD_SALDO,
            COALESCE(p.PROD_PRVENDA, 0) as PROD_PRVENDA,
            COALESCE(p.PROD_PRCOMPRA, p.VALOR_ULT_COMPRA, 0) as PROD_PRCOMPRA,
            p.PSICOTROPICO,
            p.PROD_LISTA
          FROM PRODUTOS p
          WHERE p.PRODUTO LIKE ?
          ORDER BY p.PRODUTO ASC
        `;
        params = [`%${q.toUpperCase()}%`];
      }

      let rows = [];
      try {
        rows = await queryDigifarma(sql, params);
      } catch (err) {
        console.warn('[Perdas API] Falha na busca Firebird, tentando cache SQLite:', err.message);
        // Fallback para o cache local SQLite se houver
        const cacheRows = db.prepare(`
          SELECT codigo_barras, produto_id, descricao, estoque_atual, preco_venda
          FROM digifarma_products_cache
          WHERE codigo_barras = ? OR descricao LIKE ?
          LIMIT 15
        `).all(q, `%${q}%`);

        rows = cacheRows.map(c => ({
          PRODUTO_ID: c.produto_id,
          PRODUTO: c.descricao,
          COD_BARRAS: c.codigo_barras,
          PROD_SALDO: c.estoque_atual || 0,
          PROD_PRVENDA: c.preco_venda || 0,
          PROD_PRCOMPRA: (c.preco_venda || 0) * 0.65, // Estimativa se sem custo
          PSICOTROPICO: 'N'
        }));
      }

      const products = rows.map(r => {
        const fullDesc = r.APRESENTACAO ? `${r.PRODUTO} ${r.APRESENTACAO}`.trim() : (r.PRODUTO || '').trim();
        const controlled = isControlledProduct(r);
        return {
          produto_id: r.PRODUTO_ID,
          codigo_barras: r.COD_BARRAS ? String(r.COD_BARRAS).trim() : '',
          descricao: fullDesc,
          saldo: Number(r.PROD_SALDO) || 0,
          preco_custo: Number(r.PROD_PRCOMPRA) || 0,
          preco_venda: Number(r.PROD_PRVENDA) || 0,
          is_controlado: controlled
        };
      });

      res.json(products);
    } catch (err) {
      console.error('[Perdas API] Erro em /buscar-produto:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Criar e Confirmar Lote de Baixa de Perdas
  router.post('/lotes', async (req, res) => {
    try {
      const { usuario_id, usuario_nome, observacao_geral, itens } = req.body;

      if (!itens || !Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ error: 'O lote deve conter pelo menos um item.' });
      }

      const userName = usuario_nome || 'Operador';
      const userId = usuario_id || 'system';

      // Validação Prévia: Nenhum item controlado pode ser baixado por aqui
      for (const it of itens) {
        if (it.is_controlado) {
          return res.status(400).json({
            error: `O produto "${it.descricao}" é controlado (Portaria 344/SNGPC) e sua baixa não é permitida neste módulo. Realize a baixa diretamente pelo sistema regulatório do Digifarma.`
          });
        }
        if (!it.quantidade || Number(it.quantidade) <= 0) {
          return res.status(400).json({
            error: `Quantidade inválida para o item "${it.descricao}". Deve ser maior que 0.`
          });
        }
        const validMotivos = ['Vencido', 'Avariado', 'Furto/Roubo', 'Uso Interno/Descarte'];
        if (!validMotivos.includes(it.motivo)) {
          return res.status(400).json({
            error: `Motivo inválido para o item "${it.descricao}". Escolha entre: ${validMotivos.join(', ')}.`
          });
        }
      }

      // 1. Processar baixa no Digifarma Firebird para cada item
      const processedItems = [];
      let totalCusto = 0;
      let totalVenda = 0;
      let totalQtd = 0;

      for (const it of itens) {
        const qty = Number(it.quantidade);
        const custoUnit = Number(it.preco_custo) || 0;
        const vendaUnit = Number(it.preco_venda) || 0;

        totalQtd += qty;
        totalCusto += custoUnit * qty;
        totalVenda += vendaUnit * qty;

        let saldoAnterior = 0;
        let saldoBaixado = 0;

        try {
          // Consultar saldo atual no Firebird
          let currentProduct = [];
          if (it.produto_id) {
            currentProduct = await queryDigifarma(
              "SELECT FIRST 1 PRODUTO_ID, PROD_SALDO, PSICOTROPICO FROM PRODUTOS WHERE PRODUTO_ID = ?",
              [it.produto_id]
            );
          } else if (it.codigo_barras) {
            currentProduct = await queryDigifarma(
              "SELECT FIRST 1 PRODUTO_ID, PROD_SALDO, PSICOTROPICO FROM PRODUTOS WHERE COD_BARRAS = ?",
              [it.codigo_barras]
            );
          }

          if (currentProduct && currentProduct.length > 0) {
            const prodRow = currentProduct[0];
            // Re-validação rigorosa de psicotrópico no banco
            if (isControlledProduct(prodRow)) {
              throw new Error(`O produto "${it.descricao}" foi identificado no Digifarma como controlado (Portaria 344). Baixa cancelada.`);
            }

            saldoAnterior = Number(prodRow.PROD_SALDO) || 0;
            // Regra: Limitar a zero no Digifarma (abate até o saldo existente, não deixa negativo)
            const novoSaldo = Math.max(0, saldoAnterior - qty);
            saldoBaixado = saldoAnterior - novoSaldo;

            // Executa baixa no Firebird
            await queryDigifarma(
              "UPDATE PRODUTOS SET PROD_SALDO = ?, LASTUPDATESALDO = CURRENT_TIMESTAMP WHERE PRODUTO_ID = ?",
              [novoSaldo, prodRow.PRODUTO_ID]
            );

            console.log(`[Perdas API] ✅ Baixa efetuada no Digifarma para Prod #${prodRow.PRODUTO_ID} (${it.descricao}): Saldo Anterior: ${saldoAnterior}, Novo Saldo: ${novoSaldo}`);
          } else {
            console.warn(`[Perdas API] ⚠️ Produto "${it.descricao}" não localizado no Firebird. Registrando perda apenas no BelaFarma.`);
          }
        } catch (dbErr) {
          console.error(`[Perdas API] Erro ao abater item no Firebird (${it.descricao}):`, dbErr.message);
          if (dbErr.message.includes('controlado')) {
            return res.status(400).json({ error: dbErr.message });
          }
          // Se o Digifarma falhar por estar offline ou timeout, repassa erro para não gerar inconsistência
          return res.status(500).json({
            error: `Falha na comunicação com o Digifarma ao dar baixa no item "${it.descricao}": ${dbErr.message}. O lote não foi confirmado.`
          });
        }

        processedItems.push({
          ...it,
          quantidade: qty,
          preco_custo: custoUnit,
          preco_venda: vendaUnit,
          saldo_anterior_digifarma: saldoAnterior,
          saldo_baixado_digifarma: saldoBaixado
        });
      }

      // 2. Persistir Lote e Itens no SQLite (Transação)
      const loteId = 'lote_perda_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      const dataHora = new Date().toISOString();

      const insertLoteTx = db.transaction(() => {
        db.prepare(`
          INSERT INTO lotes_perdas (
            id, data_hora, usuario_id, usuario_nome, total_itens, total_custo, total_venda, observacao_geral
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          loteId,
          dataHora,
          userId,
          userName,
          processedItems.length,
          Number(totalCusto.toFixed(2)),
          Number(totalVenda.toFixed(2)),
          observacao_geral || null
        );

        const insertItemStmt = db.prepare(`
          INSERT INTO itens_lote_perdas (
            id, lote_id, produto_id, codigo_barras, descricao, quantidade, motivo,
            preco_custo, preco_venda, saldo_anterior_digifarma, saldo_baixado_digifarma, observacao
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of processedItems) {
          const itemId = 'item_perda_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
          insertItemStmt.run(
            itemId,
            loteId,
            item.produto_id ? String(item.produto_id) : null,
            item.codigo_barras || '',
            item.descricao,
            item.quantidade,
            item.motivo,
            item.preco_custo,
            item.preco_venda,
            item.saldo_anterior_digifarma,
            item.saldo_baixado_digifarma,
            item.observacao || null
          );
        }

        // Registrar no log de auditoria
        try {
          const logId = 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
          db.prepare(`
            INSERT INTO logs (id, timestamp, userName, userId, action, category, details)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            logId,
            dataHora,
            userName,
            userId,
            'BAIXA_PERDAS_ESTOQUE',
            'Estoque',
            `Lote de baixa de perdas #${loteId} confirmado: ${processedItems.length} itens. Custo Total: R$ ${totalCusto.toFixed(2)}, Venda Total: R$ ${totalVenda.toFixed(2)}`
          );
        } catch (logErr) {
          console.warn('[Perdas API] Falha ao registrar log de auditoria:', logErr.message);
        }
      });

      insertLoteTx();

      res.status(201).json({
        success: true,
        lote: {
          id: loteId,
          data_hora: dataHora,
          usuario_nome: userName,
          total_itens: processedItems.length,
          total_custo: totalCusto,
          total_venda: totalVenda,
          observacao_geral
        },
        itens: processedItems
      });
    } catch (err) {
      console.error('[Perdas API] Erro ao criar lote de perdas:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Listar histórico simples de lotes de baixa
  router.get('/lotes', (req, res) => {
    try {
      const { data_inicio, data_fim, search } = req.query;

      let sql = 'SELECT * FROM lotes_perdas WHERE 1=1';
      const params = [];

      if (data_inicio) {
        sql += ' AND data_hora >= ?';
        params.push(data_inicio);
      }
      if (data_fim) {
        sql += ' AND data_hora <= ?';
        params.push(data_fim);
      }
      if (search) {
        sql += ' AND (usuario_nome LIKE ? OR observacao_geral LIKE ? OR id LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      sql += ' ORDER BY datetime(data_hora) DESC LIMIT 100';

      const lotes = db.prepare(sql).all(...params);

      // Calcular totais somados
      let somaCusto = 0;
      let somaVenda = 0;
      let somaQtdItens = 0;

      for (const l of lotes) {
        somaCusto += l.total_custo || 0;
        somaVenda += l.total_venda || 0;
        somaQtdItens += l.total_itens || 0;
      }

      res.json({
        lotes,
        totais: {
          total_lotes: lotes.length,
          total_itens: somaQtdItens,
          total_custo: Number(somaCusto.toFixed(2)),
          total_venda: Number(somaVenda.toFixed(2))
        }
      });
    } catch (err) {
      console.error('[Perdas API] Erro em GET /lotes:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Obter detalhes e itens de um lote específico
  router.get('/lotes/:id', (req, res) => {
    try {
      const { id } = req.params;
      const lote = db.prepare('SELECT * FROM lotes_perdas WHERE id = ?').get(id);

      if (!lote) {
        return res.status(404).json({ error: 'Lote de perdas não encontrado.' });
      }

      const itens = db.prepare(`
        SELECT * FROM itens_lote_perdas 
        WHERE lote_id = ? 
        ORDER BY id ASC
      `).all(id);

      res.json({
        lote,
        itens
      });
    } catch (err) {
      console.error('[Perdas API] Erro em GET /lotes/:id:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
