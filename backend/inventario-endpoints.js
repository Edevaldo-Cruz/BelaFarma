const express = require('express');
const { queryDigifarma } = require('./services/digifarma.service');

function formatarDataFirebird(date) {
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

module.exports = function (db) {
  const router = express.Router();

  // 1. Obter status da sessão atual
  router.get('/status', (req, res) => {
    try {
      const activeSession = db.prepare("SELECT * FROM sessoes_inventario WHERE status = 'aberto'").get();
      if (!activeSession) {
        return res.json({ active: false });
      }

      const items = db.prepare(`
        SELECT codigo_barras, descricao, quantidade_contada, data_hora_bip 
        FROM itens_inventariados 
        WHERE sessao_id = ?
        ORDER BY datetime(data_hora_bip) DESC
      `).all(activeSession.id);

      // Busca soma das vendas durante inventário para cada item
      const itemsWithSales = items.map(item => {
        const salesRow = db.prepare(`
          SELECT COALESCE(SUM(quantidade_vendida), 0) as total_vendido 
          FROM vendas_durante_inventario 
          WHERE sessao_id = ? AND codigo_barras = ?
        `).get(activeSession.id, item.codigo_barras);
        
        return {
          ...item,
          quantidade_vendida: salesRow ? salesRow.total_vendido : 0
        };
      });

      res.json({
        active: true,
        session: activeSession,
        items: itemsWithSales
      });
    } catch (err) {
      console.error('[Inventário API] Erro em /status:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Iniciar nova sessão de contagem
  router.post('/iniciar', (req, res) => {
    try {
      const activeSession = db.prepare("SELECT * FROM sessoes_inventario WHERE status = 'aberto'").get();
      if (activeSession) {
        return res.status(400).json({ error: 'Já existe uma sessão de inventário aberta.' });
      }

      const sessaoId = 'inv_' + Date.now();
      const dataInicio = new Date().toISOString();
      const modoTeste = req.body.modo_teste ? 1 : 0;

      db.prepare("INSERT INTO sessoes_inventario (id, data_inicio, status, modo_teste) VALUES (?, ?, 'aberto', ?)")
        .run(sessaoId, dataInicio, modoTeste);

      res.json({
        success: true,
        session: { id: sessaoId, data_inicio: dataInicio, status: 'aberto', modo_teste: modoTeste }
      });
    } catch (err) {
      console.error('[Inventário API] Erro em /iniciar:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Registrar bip de código de barras
  router.post('/bip', async (req, res) => {
    try {
      const { codigo_barras, sessao_id, descricao, quantidade } = req.body;
      if (!codigo_barras || !sessao_id) {
        return res.status(400).json({ error: 'codigo_barras e sessao_id são obrigatórios.' });
      }

      const session = db.prepare("SELECT * FROM sessoes_inventario WHERE id = ? AND status = 'aberto'").get(sessao_id);
      if (!session) {
        return res.status(400).json({ error: 'Sessão de inventário inválida ou fechada.' });
      }

      const qtyToAdd = parseInt(quantidade) || 1;
      let resolvedDesc = '';

      // 1. Busca no cache local do SQLite primeiro
      try {
        const cachedProd = db.prepare("SELECT descricao FROM digifarma_products_cache WHERE codigo_barras = ? OR produto_id = ?").get(codigo_barras, codigo_barras);
        if (cachedProd) {
          resolvedDesc = cachedProd.descricao;
        }
      } catch (e) {
        console.warn(`[Inventário API] Falha ao consultar produto no cache local para EAN ${codigo_barras}:`, e.message);
      }

      // 2. Se não encontrou no cache local, busca no Digifarma (Firebird)
      if (!resolvedDesc) {
        try {
          const prodResult = await queryDigifarma(
            "SELECT PRODUTO FROM PRODUTOS WHERE COD_BARRAS = ? OR PRODUTO_ID = ?",
            [codigo_barras, codigo_barras]
          );
          if (prodResult && prodResult.length > 0) {
            resolvedDesc = prodResult[0].PRODUTO;
          }
        } catch (e) {
          console.warn(`[Inventário API] Falha ao consultar produto no Digifarma para EAN ${codigo_barras}:`, e.message);
        }
      }

      const finalDesc = resolvedDesc || descricao || 'Produto Desconhecido';
      const timestamp = new Date().toISOString();

      const existingItem = db.prepare("SELECT * FROM itens_inventariados WHERE sessao_id = ? AND codigo_barras = ?")
        .get(sessao_id, codigo_barras);

      let finalQty = qtyToAdd;
      if (existingItem) {
        finalQty = existingItem.quantidade_contada + qtyToAdd;
        db.prepare("UPDATE itens_inventariados SET quantidade_contada = ?, data_hora_bip = ? WHERE id = ?")
          .run(finalQty, timestamp, existingItem.id);
      } else {
        const itemId = 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        db.prepare("INSERT INTO itens_inventariados (id, sessao_id, codigo_barras, descricao, quantidade_contada, data_hora_bip) VALUES (?, ?, ?, ?, ?, ?)")
          .run(itemId, sessao_id, codigo_barras, finalDesc, qtyToAdd, timestamp);
      }

      res.json({
        success: true,
        item: {
          codigo_barras,
          descricao: finalDesc,
          quantidade_contada: finalQty,
          data_hora_bip: timestamp,
          isNew: !existingItem,
          isUnknown: !resolvedDesc && !descricao
        }
      });
    } catch (err) {
      console.error('[Inventário API] Erro em /bip:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Atualizar descrição de item desconhecido
  router.put('/item/descricao', (req, res) => {
    try {
      const { sessao_id, codigo_barras, descricao } = req.body;
      if (!sessao_id || !codigo_barras || !descricao) {
        return res.status(400).json({ error: 'sessao_id, codigo_barras e descricao são obrigatórios.' });
      }

      const result = db.prepare("UPDATE itens_inventariados SET descricao = ? WHERE sessao_id = ? AND codigo_barras = ?")
        .run(descricao, sessao_id, codigo_barras);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Item não encontrado nesta sessão.' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[Inventário API] Erro ao editar descrição:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Webhook para receber vendas em tempo real do PDV (Integração de compensação)
  router.post('/webhook-venda', (req, res) => {
    try {
      const { items } = req.body; // Array de { codigo_barras, quantidade_vendida, data_hora_venda }
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: 'Parâmetro items deve ser um array.' });
      }

      const activeSession = db.prepare("SELECT * FROM sessoes_inventario WHERE status = 'aberto'").get();
      if (!activeSession) {
        return res.json({ success: true, message: 'Nenhuma sessão de inventário ativa. Venda ignorada para compensação.' });
      }

      let countCompensated = 0;
      for (const saleItem of items) {
        const { codigo_barras, quantidade_vendida, data_hora_venda } = saleItem;
        if (!codigo_barras || !quantidade_vendida) continue;

        // Verifica se o item já foi bipado no inventário
        const bipRecord = db.prepare("SELECT * FROM itens_inventariados WHERE sessao_id = ? AND codigo_barras = ?")
          .get(activeSession.id, codigo_barras);

        if (bipRecord) {
          const timestampVenda = new Date(data_hora_venda || new Date());
          const timestampBip = new Date(bipRecord.data_hora_bip);

          // Se a venda ocorreu após o último bip do produto
          if (timestampVenda > timestampBip) {
            const saleId = 'sale_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            db.prepare(`
              INSERT INTO vendas_durante_inventario (id, sessao_id, codigo_barras, quantidade_vendida, data_hora_venda) 
              VALUES (?, ?, ?, ?, ?)
            `).run(saleId, activeSession.id, codigo_barras, parseFloat(quantidade_vendida), timestampVenda.toISOString());
            
            countCompensated++;
          }
        }
      }

      res.json({ success: true, compensatedCount: countCompensated });
    } catch (err) {
      console.error('[Inventário API] Erro em /webhook-venda:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Finalizar e compensar estoque no Digifarma
  router.post('/finalizar', async (req, res) => {
    try {
      const { sessao_id } = req.body;
      if (!sessao_id) {
        return res.status(400).json({ error: 'sessao_id é obrigatório.' });
      }

      const session = db.prepare("SELECT * FROM sessoes_inventario WHERE id = ? AND status = 'aberto'").get(sessao_id);
      if (!session) {
        return res.status(404).json({ error: 'Sessão ativa não encontrada.' });
      }

      const items = db.prepare("SELECT * FROM itens_inventariados WHERE sessao_id = ?").all(sessao_id);
      
      const reports = [];
      const data30DiasAtras = new Date();
      data30DiasAtras.setDate(data30DiasAtras.getDate() - 30);
      data30DiasAtras.setHours(0, 0, 0, 0);
      const data30AtrasStr = formatarDataFirebird(data30DiasAtras);

      for (const item of items) {
        // Busca soma de vendas após o bip
        const salesRow = db.prepare(`
          SELECT COALESCE(SUM(quantidade_vendida), 0) as total_vendido 
          FROM vendas_durante_inventario 
          WHERE sessao_id = ? AND codigo_barras = ?
        `).get(sessao_id, item.codigo_barras);

        const totalVendido = salesRow ? salesRow.total_vendido : 0;
        const estoqueCorrigido = Math.max(0, item.quantidade_contada - totalVendido);

        // 1. Atualizar saldo diretamente no Digifarma (Firebird)
        let syncSuccess = false;
        let dbErr = null;
        if (session.modo_teste === 1) {
          syncSuccess = true;
          dbErr = "Simulado (Modo de Teste)";
        } else {
          try {
            const updateResult = await queryDigifarma(
              "UPDATE PRODUTOS SET PROD_SALDO = ? WHERE COD_BARRAS = ?",
              [estoqueCorrigido, item.codigo_barras]
            );
            syncSuccess = true;
          } catch (e) {
            dbErr = e.message;
            console.error(`[Inventário API] Erro ao sincronizar item ${item.codigo_barras} no Firebird:`, dbErr);
          }
        }

        // 2. Busca giro de estoque (últimos 30 dias) para cálculo de cobertura
        let totalVendido30Dias = 0;
        try {
          const salesHistory = await queryDigifarma(`
            SELECT COALESCE(SUM(iv.ITEMVEND_QUANT), 0) as TOTAL_SAIDAS
            FROM ITEM_VENDAS iv
            JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
            JOIN PRODUTOS p ON iv.PRODUTO_ID = p.PRODUTO_ID
            WHERE v.CANCELADO <> 'S'
              AND v.VENDA_DATA_HORA >= ?
              AND p.COD_BARRAS = ?
          `, [data30AtrasStr, item.codigo_barras]);
          if (salesHistory && salesHistory.length > 0) {
            totalVendido30Dias = salesHistory[0].TOTAL_SAIDAS || 0;
          }
        } catch (e) {
          console.warn(`[Inventário API] Erro ao buscar giro para item ${item.codigo_barras}:`, e.message);
        }

        const mediaDiaria = totalVendido30Dias / 30.0;
        let diasCobertura = 999;
        if (mediaDiaria > 0) {
          diasCobertura = Math.round(estoqueCorrigido / mediaDiaria);
        }

        let statusEstoque = 'Normal';
        if (estoqueCorrigido === 0 || (mediaDiaria > 0 && diasCobertura < 7)) {
          statusEstoque = 'Crítico';
        } else if (mediaDiaria === 0 && estoqueCorrigido > 0) {
          statusEstoque = 'Sobrando';
        } else if (mediaDiaria > 0 && diasCobertura > 45) {
          statusEstoque = 'Sobrando';
        }

        reports.push({
          codigo_barras: item.codigo_barras,
          descricao: item.descricao,
          quantidade_contada: item.quantidade_contada,
          vendas_periodo: totalVendido,
          estoque_corrigido: estoqueCorrigido,
          giro_30d: totalVendido30Dias,
          media_diaria: mediaDiaria,
          dias_cobertura: diasCobertura,
          status_estoque: statusEstoque,
          sincronizado: syncSuccess,
          erro_sinc: dbErr
        });
      }

      // Finaliza a sessão no SQLite
      const dataFim = new Date().toISOString();
      db.prepare("UPDATE sessoes_inventario SET status = 'finalizado', data_fim = ? WHERE id = ?")
        .run(dataFim, sessao_id);

      res.json({
        success: true,
        sessao_id,
        data_fim: dataFim,
        relatorio: reports
      });
    } catch (err) {
      console.error('[Inventário API] Erro ao finalizar inventário:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 7. Editar quantidade de um item contado
  router.put('/item/quantidade', (req, res) => {
    try {
      const { sessao_id, codigo_barras, quantidade } = req.body;
      if (!sessao_id || !codigo_barras || quantidade === undefined) {
        return res.status(400).json({ error: 'sessao_id, codigo_barras e quantidade são obrigatórios.' });
      }
      const qty = parseFloat(quantidade);
      if (isNaN(qty) || qty < 0) {
        return res.status(400).json({ error: 'Quantidade inválida.' });
      }

      const result = db.prepare("UPDATE itens_inventariados SET quantidade_contada = ? WHERE sessao_id = ? AND codigo_barras = ?")
        .run(qty, sessao_id, codigo_barras);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Item não encontrado nesta sessão.' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[Inventário API] Erro ao editar quantidade:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 8. Excluir item contado
  router.delete('/item', (req, res) => {
    try {
      const { sessao_id, codigo_barras } = req.body;
      if (!sessao_id || !codigo_barras) {
        return res.status(400).json({ error: 'sessao_id e codigo_barras são obrigatórios.' });
      }

      db.prepare("DELETE FROM itens_inventariados WHERE sessao_id = ? AND codigo_barras = ?")
        .run(sessao_id, codigo_barras);
      db.prepare("DELETE FROM vendas_durante_inventario WHERE sessao_id = ? AND codigo_barras = ?")
        .run(sessao_id, codigo_barras);

      res.json({ success: true });
    } catch (err) {
      console.error('[Inventário API] Erro ao excluir item:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 9. Resetar contagens da sessão ativa (limpar tudo)
  router.post('/resetar', (req, res) => {
    try {
      const { sessao_id } = req.body;
      if (!sessao_id) {
        return res.status(400).json({ error: 'sessao_id é obrigatório.' });
      }

      db.prepare("DELETE FROM itens_inventariados WHERE sessao_id = ?").run(sessao_id);
      db.prepare("DELETE FROM vendas_durante_inventario WHERE sessao_id = ?").run(sessao_id);

      res.json({ success: true });
    } catch (err) {
      console.error('[Inventário API] Erro ao resetar contagem:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 10. Sincronizar catálogo do Digifarma com o cache local SQLite
  router.post('/sincronizar-cache', async (req, res) => {
    try {
      console.log('[Inventário API] Iniciando sincronização do catálogo do Digifarma...');
      
      const products = await queryDigifarma(`
        SELECT COD_BARRAS, PRODUTO_ID, PRODUTO, PROD_SALDO, PROD_PRVENDA 
        FROM PRODUTOS 
        WHERE PROD_ATIVO = 'S'
      `);
      
      console.log(`[Inventário API] Obtidos ${products.length} produtos do Digifarma. Gravando no SQLite...`);
      
      const deleteStmt = db.prepare("DELETE FROM digifarma_products_cache");
      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO digifarma_products_cache 
        (codigo_barras, produto_id, descricao, estoque_atual, preco_venda, atualizado_em) 
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      const timestamp = new Date().toISOString();
      
      // Executa todas as inserções numa transação rápida
      const runTransaction = db.transaction((prods) => {
        deleteStmt.run();
        for (const p of prods) {
          const barcode = (p.COD_BARRAS || '').trim() || String(p.PRODUTO_ID);
          if (!barcode) continue;
          insertStmt.run(
            barcode,
            String(p.PRODUTO_ID),
            (p.PRODUTO || '').trim(),
            parseFloat(p.PROD_SALDO || 0),
            parseFloat(p.PROD_PRVENDA || 0),
            timestamp
          );
        }
      });
      
      runTransaction(products);
      console.log(`[Inventário API] Sincronização concluída: ${products.length} produtos armazenados.`);
      
      res.json({ success: true, count: products.length });
    } catch (err) {
      console.error('[Inventário API] Erro ao sincronizar cache local:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 11. Obter lista de produtos não bipados na sessão
  router.get('/nao-bipados', (req, res) => {
    try {
      const { sessao_id } = req.query;
      if (!sessao_id) {
        return res.status(400).json({ error: 'sessao_id é obrigatório.' });
      }
      
      // Busca todos os produtos do cache local que não aparecem em itens_inventariados para esta sessão
      const items = db.prepare(`
        SELECT c.codigo_barras, c.descricao, c.estoque_atual, c.preco_venda 
        FROM digifarma_products_cache c
        LEFT JOIN itens_inventariados i ON c.codigo_barras = i.codigo_barras AND i.sessao_id = ?
        WHERE i.id IS NULL
        ORDER BY c.descricao ASC
      `).all(sessao_id);
      
      res.json({ items });
    } catch (err) {
      console.error('[Inventário API] Erro ao obter não bipados:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
