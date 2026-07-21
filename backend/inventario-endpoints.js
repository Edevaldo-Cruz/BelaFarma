const express = require('express');
const fetch = require('node-fetch');
const { queryDigifarma, getDigifarmaConnection } = require('./services/digifarma.service');

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
          const isNumeric = /^\d+$/.test(codigo_barras);
          const val = isNumeric ? parseInt(codigo_barras, 10) : NaN;
          let prodResult = [];
          
          if (isNumeric && val <= 2147483647) {
            prodResult = await queryDigifarma(
              "SELECT PRODUTO FROM PRODUTOS WHERE COD_BARRAS = ? OR PRODUTO_ID = ?",
              [codigo_barras, val]
            );
          } else {
            prodResult = await queryDigifarma(
              "SELECT PRODUTO FROM PRODUTOS WHERE COD_BARRAS = ?",
              [codigo_barras]
            );
          }

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

      let dbFirebird = null;
      try {
        dbFirebird = await getDigifarmaConnection();
      } catch (connErr) {
        console.warn('[Inventário API] Não foi possível conectar ao Digifarma para finalização. Será usado o fallback local.', connErr.message);
      }

      for (const item of items) {
        // PULL STRATEGY: Busca soma de vendas após o bip diretamente no Digifarma
        let totalVendido = 0;
        try {
          if (!dbFirebird) throw new Error('Conexão indisponível.');
          const dateBipObj = new Date(item.data_hora_bip);
          const dataBipStr = formatarDataFirebird(dateBipObj);
          
          const salesRealtime = await dbFirebird.query(`
            SELECT COALESCE(SUM(iv.ITEMVEND_QUANT), 0) as TOTAL_VENDIDO_POS_BIP
            FROM ITEM_VENDAS iv
            JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
            JOIN PRODUTOS p ON iv.PRODUTO_ID = p.PRODUTO_ID
            WHERE v.CANCELADO <> 'S'
              AND v.VENDA_DATA_HORA >= ?
              AND p.COD_BARRAS = ?
          `, [dataBipStr, item.codigo_barras]);
          
          if (salesRealtime && salesRealtime.length > 0) {
            totalVendido = salesRealtime[0].TOTAL_VENDIDO_POS_BIP || 0;
          }
        } catch (e) {
          console.warn(`[Inventário API] Erro ao buscar vendas em tempo real para item ${item.codigo_barras}:`, e.message);
          // Fallback para a tabela local (legado)
          const salesRow = db.prepare(`
            SELECT COALESCE(SUM(quantidade_vendida), 0) as total_vendido 
            FROM vendas_durante_inventario 
            WHERE sessao_id = ? AND codigo_barras = ?
          `).get(sessao_id, item.codigo_barras);
          totalVendido = salesRow ? salesRow.total_vendido : 0;
        }

        const estoqueCorrigido = Math.max(0, item.quantidade_contada - totalVendido);

        // 1. Atualizar saldo diretamente no Digifarma (Firebird)
        let syncSuccess = false;
        let dbErr = null;
        if (session.modo_teste === 1) {
          syncSuccess = true;
          dbErr = "Simulado (Modo de Teste)";
        } else {
          try {
            if (!dbFirebird) throw new Error('Conexão indisponível.');
            const updateResult = await dbFirebird.query(
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
          if (!dbFirebird) throw new Error('Conexão indisponível.');
          const salesHistory = await dbFirebird.query(`
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

      if (dbFirebird) {
        dbFirebird.detach();
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

  // 12. Consultar produto por EAN na internet (Consulta Remédios + Open Food/Beauty Facts)
  router.get('/lookup', async (req, res) => {
    const { ean } = req.query;
    if (!ean) {
      return res.status(400).json({ error: 'EAN é obrigatório.' });
    }
    
    console.log(`[Inventário API] Iniciando busca em cadeia para o EAN: ${ean}...`);
    try {
      // 1. Tenta Consulta Remédios
      try {
        console.log(`[Inventário API] Buscando no Consulta Remédios para EAN: ${ean}`);
        const targetUrl = `https://consultaremedios.com.br/busca?termo=${encodeURIComponent(ean)}`;
        const response = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
          }
        });
        
        if (response.ok) {
          const html = await response.text();
          const h2Match = html.match(/<h2[^>]*class="[^"]*(?:font-medium|product|title)[^"]*"[^>]*>([\s\S]*?)<\/h2>/i) 
                       || html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
                       
          if (h2Match) {
            const productName = h2Match[1].replace(/<[^>]+>/g, '').trim();
            console.log(`[Inventário API] EAN ${ean} encontrado no Consulta Remédios: ${productName}`);
            return res.json({ success: true, name: productName });
          }
        }
      } catch (crErr) {
        console.error('[Inventário API] Erro ao buscar no Consulta Remédios:', crErr.message);
      }

      // 2. Tenta Open Food Facts (Alimentos, Bebidas, Conveniência)
      try {
        console.log(`[Inventário API] Buscando no Open Food Facts para EAN: ${ean}`);
        const urlFood = `https://world.openfoodfacts.org/api/v0/product/${ean}.json`;
        const foodRes = await fetch(urlFood, {
          headers: { 'User-Agent': 'BelaFarmaInventoryApp/1.0 (contact@belafarma.com.br)' }
        });
        if (foodRes.ok) {
          const data = await foodRes.json();
          if (data.status === 1 && data.product && data.product.product_name) {
            let productName = data.product.product_name;
            if (data.product.brands) {
              productName = `${productName} (${data.product.brands})`;
            }
            console.log(`[Inventário API] EAN ${ean} encontrado no Open Food Facts: ${productName}`);
            return res.json({ success: true, name: productName });
          }
        }
      } catch (offErr) {
        console.error('[Inventário API] Erro ao buscar no Open Food Facts:', offErr.message);
      }

      // 3. Tenta Open Beauty Facts (Perfumaria, Higiene, Cosméticos)
      try {
        console.log(`[Inventário API] Buscando no Open Beauty Facts para EAN: ${ean}`);
        const urlBeauty = `https://world.openbeautyfacts.org/api/v0/product/${ean}.json`;
        const beautyRes = await fetch(urlBeauty, {
          headers: { 'User-Agent': 'BelaFarmaInventoryApp/1.0 (contact@belafarma.com.br)' }
        });
        if (beautyRes.ok) {
          const data = await beautyRes.json();
          if (data.status === 1 && data.product && data.product.product_name) {
            let productName = data.product.product_name;
            if (data.product.brands) {
              productName = `${productName} (${data.product.brands})`;
            }
            console.log(`[Inventário API] EAN ${ean} encontrado no Open Beauty Facts: ${productName}`);
            return res.json({ success: true, name: productName });
          }
        }
      } catch (obfErr) {
        console.error('[Inventário API] Erro ao buscar no Open Beauty Facts:', obfErr.message);
      }

      console.log(`[Inventário API] EAN ${ean} não encontrado em nenhuma fonte pública.`);
      res.json({ success: false, error: 'Produto não encontrado na internet.' });
    } catch (err) {
      console.error('[Inventário API] Erro geral no lookup:', err);
      res.json({ success: false, error: err.message });
    }
  });

  // 13. Cadastrar produto no Digifarma (Firebird) e no cache local
  router.post('/produtos/cadastrar', async (req, res) => {
    try {
      const { codigo_barras, descricao, preco, estoque, sessao_id } = req.body;
      if (!codigo_barras || !descricao || preco === undefined) {
        return res.status(400).json({ error: 'codigo_barras, descricao e preco são obrigatórios.' });
      }
      
      const barcodeTrim = String(codigo_barras).trim();
      const descUpper = String(descricao).trim().toUpperCase();
      const valPrice = parseFloat(preco);
      const valStock = parseFloat(estoque || 0);
      
      if (isNaN(valPrice) || valPrice < 0) {
        return res.status(400).json({ error: 'Preço inválido.' });
      }
      if (isNaN(valStock) || valStock < 0) {
        return res.status(400).json({ error: 'Estoque inválido.' });
      }

      console.log(`[Inventário API] Solicitado cadastro de produto. EAN: ${barcodeTrim}, Nome: ${descUpper}`);

      // 1. Verificar se já existe no Digifarma
      const checkExist = await queryDigifarma("SELECT PRODUTO_ID FROM PRODUTOS WHERE COD_BARRAS = ? OR PRODUTO = ?", [barcodeTrim, descUpper]);
      if (checkExist && checkExist.length > 0) {
        return res.status(400).json({ error: 'Produto com este código de barras ou nome já existe no Digifarma.' });
      }

      // 2. Obter próximo ID da sequence
      const resGen = await queryDigifarma("SELECT GEN_ID(GEN_PRODUTOS, 1) as NEW_ID FROM RDB$DATABASE");
      if (!resGen || resGen.length === 0 || !resGen[0].NEW_ID) {
        throw new Error('Não foi possível obter o ID gerador do Digifarma.');
      }
      const newId = resGen[0].NEW_ID;
      
      // 3. Inserir no Digifarma (Firebird)
      const insertSql = `
        INSERT INTO PRODUTOS (
          PRODUTO_ID, PRODUTO, COD_BARRAS, PROD_PRVENDA, PROD_SALDO, 
          PROD_ATIVO, CATEGORIA_ID, TRIBUTACAO_ID, PADRAO_COMISSAO_ID, 
          PROD_UNIDADE, TIPO_PRECO
        ) VALUES (
          ?, ?, ?, ?, ?, 
          'S', 5, 1, 2, 
          'UND', 'M'
        )
      `;
      await queryDigifarma(insertSql, [newId, descUpper, barcodeTrim, valPrice, valStock]);
      console.log(`[Inventário API] Produto cadastrado no Digifarma. ID: ${newId}`);

      // 4. Salvar no cache local SQLite
      const timestamp = new Date().toISOString();
      db.prepare(`
        INSERT OR REPLACE INTO digifarma_products_cache 
        (codigo_barras, produto_id, descricao, estoque_atual, preco_venda, atualizado_em) 
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(barcodeTrim, String(newId), descUpper, valStock, valPrice, timestamp);
      console.log('[Inventário API] Cache local SQLite atualizado.');

      // 5. Se houver sessao_id e estoque > 0, insere como item inventariado
      if (sessao_id && valStock > 0) {
        const idBip = `${sessao_id}_${barcodeTrim}`;
        db.prepare(`
          INSERT INTO itens_inventariados (id, sessao_id, codigo_barras, descricao, quantidade_contada, data_hora_bip)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET quantidade_contada = quantidade_contada + EXCLUDED.quantidade_contada
        `).run(idBip, sessao_id, barcodeTrim, descUpper, valStock, timestamp);
        console.log(`[Inventário API] Novo produto ${barcodeTrim} adicionado à contagem ativa com estoque contada ${valStock}.`);
      }

      res.json({
        success: true,
        product: {
          id: newId,
          name: descUpper,
          barcode: barcodeTrim,
          price: valPrice,
          stock: valStock
        }
      });
    } catch (err) {
      console.error('[Inventário API] Erro ao cadastrar produto:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
