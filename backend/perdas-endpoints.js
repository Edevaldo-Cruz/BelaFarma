const express = require('express');
const { queryDigifarma } = require('./services/digifarma.service');

/**
 * Identifica se um produto é especial (Controlado ou Antibiótico)
 * Produtos especiais têm seu prejuízo contabilizado no financeiro, mas NÃO sofrem
 * baixa física automática no saldo do Digifarma (para evitar inconsistência sanitária Anvisa/SNGPC).
 */
function checkSpecialProduct(p) {
  if (!p) return { is_especial: false, is_controlado: false, is_antibiotico: false, tipo_especial: null };

  const psico = String(p.PSICOTROPICO || '').toUpperCase().trim();
  const anti = String(p.ANTIMICROBIANO || '').toUpperCase().trim();
  const desc = String(p.PRODUTO || p.descricao || '').toUpperCase();

  // 1. Psicotrópico / Portaria 344 / SNGPC
  const patternPsico = /\b(A1|A2|A3|B1|B2|C1|C2|C3|C4|C5)\b|\((A[1-3]|B[1-2]|C[1-5])\)/i;
  const isControlado = psico === 'S' || patternPsico.test(desc);

  // 2. Antibiótico / Antimicrobiano (RDC 20/2011)
  const patternAnti = /\b(AMOXICILINA|AZITROMICINA|CEFALEXINA|CIPROFLOXACINO|CLAVULANATO|LEVOFLOXACINO|SULFAMETOXAZOL|TRIMETOPRIMA|AMPICILINA|CLARITROMICINA|DOXICICLINA|METRONIDAZOL|NORFLOXACINO|CEFTRIAXONA|ERITROMICINA|GENTAMICINA|TOBRAMICINA|NEOMICINA|CLINDAMICINA|RIFAMICINA|OXACILINA|PENICILINA)\b/i;
  const isAntibiotico = anti === 'S' || patternAnti.test(desc);

  if (isControlado) {
    return {
      is_especial: true,
      is_controlado: true,
      is_antibiotico: isAntibiotico,
      tipo_especial: 'Controlado (Portaria 344/SNGPC)'
    };
  }

  if (isAntibiotico) {
    return {
      is_especial: true,
      is_controlado: false,
      is_antibiotico: true,
      tipo_especial: 'Antibiótico / Antimicrobiano'
    };
  }

  return {
    is_especial: false,
    is_controlado: false,
    is_antibiotico: false,
    tipo_especial: null
  };
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
            p.ANTIMICROBIANO,
            p.PROD_LISTA
          FROM PRODUTOS p
          WHERE p.COD_BARRAS = ? OR p.COD_BARRAS LIKE ?
        `;
        params = [q, `%${q}%`];
      } else if (isNumeric && q.length <= 6) {
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
            p.ANTIMICROBIANO,
            p.PROD_LISTA
          FROM PRODUTOS p
          WHERE p.PRODUTO_ID = ? OR p.COD_BARRAS = ?
        `;
        params = [parseInt(q, 10), q];
      } else {
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
            p.ANTIMICROBIANO,
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
          PROD_PRCOMPRA: (c.preco_venda || 0) * 0.65,
          PSICOTROPICO: 'N',
          ANTIMICROBIANO: 'N'
        }));
      }

      const products = rows.map(r => {
        const fullDesc = r.APRESENTACAO ? `${r.PRODUTO} ${r.APRESENTACAO}`.trim() : (r.PRODUTO || '').trim();
        const specialInfo = checkSpecialProduct(r);
        return {
          produto_id: r.PRODUTO_ID,
          codigo_barras: r.COD_BARRAS ? String(r.COD_BARRAS).trim() : '',
          descricao: fullDesc,
          saldo: Number(r.PROD_SALDO) || 0,
          preco_custo: Number(r.PROD_PRCOMPRA) || 0,
          preco_venda: Number(r.PROD_PRVENDA) || 0,
          is_especial: specialInfo.is_especial,
          is_controlado: specialInfo.is_controlado,
          is_antibiotico: specialInfo.is_antibiotico,
          tipo_especial: specialInfo.tipo_especial
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

      // Validação básica dos itens
      for (const it of itens) {
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

      // Processar itens:
      // - Produtos normais: abate saldo no Digifarma
      // - Produtos especiais (controlados/antibióticos): NÃO baixa estoque no Digifarma, apenas contabiliza financeiro
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

        // Verificar no Firebird dados atuais do produto
        let prodRow = null;
        try {
          let currentProduct = [];
          if (it.produto_id) {
            currentProduct = await queryDigifarma(
              "SELECT FIRST 1 PRODUTO_ID, PRODUTO, PROD_SALDO, PSICOTROPICO, ANTIMICROBIANO FROM PRODUTOS WHERE PRODUTO_ID = ?",
              [it.produto_id]
            );
          } else if (it.codigo_barras) {
            currentProduct = await queryDigifarma(
              "SELECT FIRST 1 PRODUTO_ID, PRODUTO, PROD_SALDO, PSICOTROPICO, ANTIMICROBIANO FROM PRODUTOS WHERE COD_BARRAS = ?",
              [it.codigo_barras]
            );
          }
          if (currentProduct && currentProduct.length > 0) {
            prodRow = currentProduct[0];
            saldoAnterior = Number(prodRow.PROD_SALDO) || 0;
          }
        } catch (checkErr) {
          console.warn(`[Perdas API] Falha ao consultar produto no Firebird (${it.descricao}):`, checkErr.message);
        }

        const specialInfo = checkSpecialProduct(prodRow || it);
        const isEspecial = it.is_especial || specialInfo.is_especial;
        const tipoEspecial = it.tipo_especial || specialInfo.tipo_especial;

        let statusBaixa = 'sucesso';
        let mensagemBaixa = '';

        if (isEspecial) {
          // 🛡️ PRODUTO ESPECIAL (Controlado ou Antibiótico)
          // Prejuízo contabilizado normalmente, mas SEM baixar estoque físico no Digifarma!
          saldoBaixado = 0;
          statusBaixa = 'ignorado_especial';
          mensagemBaixa = `Produto Especial (${tipoEspecial || 'Controlado/Antibiótico'}) - Estoque mantido no Digifarma para escrituração sanitária.`;
          console.log(`[Perdas API] 🛡️ Item Especial: "${it.descricao}" (${tipoEspecial}). Prejuízo contabilizado no BelaFarma (R$ ${(custoUnit * qty).toFixed(2)}). Baixa de estoque no Digifarma NÃO executada conforme solicitado.`);
        } else {
          // 📦 PRODUTO COMUM: Executa baixa no estoque do Digifarma Firebird
          if (prodRow) {
            try {
              const novoSaldo = Math.max(0, saldoAnterior - qty);
              saldoBaixado = saldoAnterior - novoSaldo;

              await queryDigifarma(
                "UPDATE PRODUTOS SET PROD_SALDO = ?, LASTUPDATESALDO = CURRENT_TIMESTAMP WHERE PRODUTO_ID = ?",
                [novoSaldo, prodRow.PRODUTO_ID]
              );
              statusBaixa = 'sucesso';
              mensagemBaixa = `Estoque baixado no Digifarma de ${saldoAnterior} para ${novoSaldo} (-${saldoBaixado}).`;
              console.log(`[Perdas API] ✅ Baixa efetuada no Digifarma para Prod #${prodRow.PRODUTO_ID} (${it.descricao}): Saldo Anterior: ${saldoAnterior}, Novo Saldo: ${novoSaldo}`);
            } catch (dbErr) {
              // ⚠️ NÃO TRAVA O RESTANTE DOS PRODUTOS!
              console.error(`[Perdas API] ⚠️ Falha ao abater estoque no Firebird (${it.descricao}):`, dbErr.message);
              statusBaixa = 'falha';
              saldoBaixado = 0;
              mensagemBaixa = `Erro ao atualizar estoque no Digifarma: ${dbErr.message}`;
            }
          } else {
            console.warn(`[Perdas API] ⚠️ Produto "${it.descricao}" não localizado no Firebird.`);
            statusBaixa = 'nao_encontrado';
            saldoBaixado = 0;
            mensagemBaixa = 'Produto não localizado na tabela PRODUTOS do Digifarma (saldo físico não abatido).';
          }
        }

        processedItems.push({
          ...it,
          quantidade: qty,
          preco_custo: custoUnit,
          preco_venda: vendaUnit,
          saldo_anterior_digifarma: saldoAnterior,
          saldo_baixado_digifarma: saldoBaixado,
          is_especial: isEspecial ? 1 : 0,
          tipo_especial: tipoEspecial || null,
          status_baixa: statusBaixa,
          mensagem_baixa: mensagemBaixa
        });
      }

      // Persistir Lote e Itens no SQLite (Transação)
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
            preco_custo, preco_venda, saldo_anterior_digifarma, saldo_baixado_digifarma,
            is_especial, tipo_especial, status_baixa, mensagem_baixa, observacao
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            item.is_especial ? 1 : 0,
            item.tipo_especial || null,
            item.status_baixa || 'sucesso',
            item.mensagem_baixa || null,
            item.observacao || null
          );
        }

        // Registrar no log de auditoria
        try {
          const logId = 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
          const especiaisCount = processedItems.filter(i => i.status_baixa === 'ignorado_especial').length;
          const falhasCount = processedItems.filter(i => i.status_baixa === 'falha' || i.status_baixa === 'nao_encontrado').length;
          const sucessoCount = processedItems.filter(i => i.status_baixa === 'sucesso').length;

          const descStatus = `(Sucesso: ${sucessoCount}, Especiais: ${especiaisCount}, Falhas ERP: ${falhasCount})`;

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
            `Lote de baixa de perdas #${loteId} confirmado: ${processedItems.length} itens ${descStatus}. Custo Total: R$ ${totalCusto.toFixed(2)}, Venda Total: R$ ${totalVenda.toFixed(2)}`
          );
        } catch (logErr) {
          console.warn('[Perdas API] Falha ao registrar log de auditoria:', logErr.message);
        }
      });

      insertLoteTx();

      const countSucesso = processedItems.filter(i => i.status_baixa === 'sucesso').length;
      const countEspeciais = processedItems.filter(i => i.status_baixa === 'ignorado_especial').length;
      const countFalhas = processedItems.filter(i => i.status_baixa === 'falha' || i.status_baixa === 'nao_encontrado').length;

      res.status(201).json({
        success: true,
        resumo: {
          total_itens: processedItems.length,
          total_custo: totalCusto,
          total_venda: totalVenda,
          baixados_sucesso: countSucesso,
          mantidos_especiais: countEspeciais,
          falhas_baixa: countFalhas
        },
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
