const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { analisarRelatoriosDigifarma } = require('./services/purchasing-agent.service');
const whatsappService = require('./services/whatsapp.service');
const { queryDigifarma } = require('./services/digifarma.service');
const { callAI } = require('./services/ai.service');
const baileysSecondaryService = require('./baileys-secondary-service');
const { buscarRelatorioEntradas, darBaixaFaltas } = require('./services/entradas-sync.service');

module.exports = (db) => {
  
  // --- Fornecedores ---

  router.get('/suppliers', async (req, res) => {
    try {
      const digifarmaSuppliers = await queryDigifarma(`
        SELECT FORNECEDOR_ID, FORNECEDOR 
        FROM FORNECEDORES 
        ORDER BY FORNECEDOR ASC
      `);

      const localSuppliers = db.prepare('SELECT * FROM local_suppliers').all();
      const localMap = {};
      localSuppliers.forEach(ls => {
        localMap[ls.digifarma_id] = ls;
      });

      const result = digifarmaSuppliers.map(ds => {
        const local = localMap[ds.FORNECEDOR_ID] || {};
        return {
          id: local.id || null, // local id if exists
          digifarma_id: ds.FORNECEDOR_ID,
          name: ds.FORNECEDOR,
          representante: local.representante || '',
          telefone: local.telefone || '',
          prazo_boletos: local.prazo_boletos || ''
        };
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/suppliers/update', (req, res) => {
    const { digifarma_id, representante, telefone, prazo_boletos } = req.body;
    
    if (!digifarma_id) {
      return res.status(400).json({ error: 'ID do Digifarma é obrigatório.' });
    }

    try {
      const existing = db.prepare('SELECT id FROM local_suppliers WHERE digifarma_id = ?').get(digifarma_id);
      
      if (existing) {
        db.prepare(`
          UPDATE local_suppliers 
          SET representante = ?, telefone = ?, prazo_boletos = ?
          WHERE digifarma_id = ?
        `).run(representante, telefone, prazo_boletos, digifarma_id);
        res.json({ success: true, id: existing.id });
      } else {
        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        db.prepare(`
          INSERT INTO local_suppliers (id, digifarma_id, representante, telefone, prazo_boletos, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, digifarma_id, representante, telefone, prazo_boletos, createdAt);
        res.json({ success: true, id });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Processamento de Relatórios ---

  router.post('/analyze-reports', async (req, res) => {
    const { filenames } = req.body;
    const reportsDir = path.join(__dirname, 'reports/digifarma');

    try {
      let filesToAnalyze = [];

      if (filenames && Array.isArray(filenames) && filenames.length > 0) {
        filesToAnalyze = filenames.map(name => {
          const filePath = path.join(reportsDir, name);
          if (!fs.existsSync(filePath)) {
            throw new Error(`Arquivo ${name} não encontrado.`);
          }
          return {
            path: filePath,
            name: name,
            type: name.endsWith('.pdf') ? 'application/pdf' : 'text/csv'
          };
        });
      } else {
        // Fallback para manter compatibilidade ou analisar todos se o diretório existir
        if (!fs.existsSync(reportsDir)) {
          return res.status(404).json({ error: 'Diretório de relatórios não encontrado.' });
        }
        filesToAnalyze = fs.readdirSync(reportsDir)
          .filter(f => f.endsWith('.csv') || f.endsWith('.pdf'))
          .map(f => ({
            path: path.join(reportsDir, f),
            name: f,
            type: f.endsWith('.pdf') ? 'application/pdf' : 'text/csv'
          }));

        if (filesToAnalyze.length === 0) {
          return res.status(400).json({ error: 'Nenhum relatório selecionado.' });
        }
      }

      const suggestion = await analisarRelatoriosDigifarma(filesToAnalyze);
      res.json({ suggestion });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Sugestão de Compras (Tempo Real - Integração Direta Digifarma) ---

  router.get('/live-suggestions', async (req, res) => {
    try {
      // Filtra produtos com estoque baixo ou zerado (onde o estoque atual é menor que o mínimo, ou menor que 2)
      // Excluímos inativos ou serviços dependendo das flags do banco, mas para iniciar pegamos todos os ativos.
      // EAN também seria bom, mas para simplicidade focamos no nome.
      const sql = `
        SELECT 
          p.PRODUTO_ID as id,
          TRIM(p.PRODUTO) as name,
          p.PROD_SALDO as stock,
          p.PROD_ESTMINIMO as minStock,
          p.PROD_PRVENDA as price,
          COALESCE((
            SELECT SUM(i.ITEMVEND_QUANT) 
            FROM ITEM_VENDAS i
            JOIN CAB_VENDAS c ON c.VENDA_NOTA_ID = i.VENDA_NOTA_ID
            WHERE i.PRODUTO_ID = p.PRODUTO_ID
              AND CAST(c.VENDA_DATA_HORA AS DATE) >= CURRENT_DATE - 30
              AND c.CANCELADO = 'N'
          ), 0) as giro30d
        FROM PRODUTOS p
        WHERE (p.PROD_SALDO <= p.PROD_ESTMINIMO OR p.PROD_SALDO <= 1)
          AND p.PROD_SALDO >= 0
          AND p.PROD_ATIVO = 'S'
        ORDER BY p.PRODUTO ASC
        ROWS 1 TO 200
      `;

      const products = await queryDigifarma(sql);
      
      res.json({
        source: 'digifarma_live',
        timestamp: new Date().toISOString(),
        items: products.map(p => ({
          id: p.ID,
          name: p.NAME,
          currentStock: p.STOCK,
          minStock: p.MINSTOCK,
          price: p.PRICE,
          turnover30d: p.GIRO30D,
          suggestedQuantity: Math.max(1, (p.MINSTOCK || 2) - (p.STOCK || 0))
        }))
      });
    } catch (err) {
      // Retorna 503 Service Unavailable se o banco estiver offline
      if (err.message.includes('Offline')) {
        return res.status(503).json({ error: 'O servidor do Digifarma está desligado ou offline.' });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // --- Previsão de Esgotamento e Calendário de Compras ---

  router.get('/forecast', async (req, res) => {
    const daysAnalysis = parseInt(req.query.daysAnalysis) || 30;
    const leadTime = parseInt(req.query.leadTime) || 5;
    const daysCoverage = parseInt(req.query.daysCoverage) || 30;

    try {
      const dataN = new Date();
      dataN.setDate(dataN.getDate() - daysAnalysis);
      dataN.setHours(0, 0, 0, 0);

      // Helper function local para formatar data do Firebird
      const pad = (num) => String(num).padStart(2, '0');
      const dataInicio = `${dataN.getFullYear()}-${pad(dataN.getMonth() + 1)}-${pad(dataN.getDate())} 00:00:00`;

      // Query para buscar produtos ativos, vendas e faturamento no período
      const sql = `
        SELECT 
          p.PRODUTO_ID as id,
          TRIM(p.PRODUTO) as name,
          TRIM(p.APRESENTACAO) as presentation,
          TRIM(p.COD_BARRAS) as barcode,
          p.PROD_SALDO as stock,
          p.PROD_ESTMINIMO as minStock,
          p.PROD_PRVENDA as price,
          p.CATEGORIA_ID as categoryId,
          c.CATEGORIA as categoryName,
          COALESCE(SUM(iv.ITEMVEND_QUANT), 0) as totalSold,
          COALESCE(SUM(iv.ITEMVEND_PRVENDA * iv.ITEMVEND_QUANT), 0) as totalRevenue
        FROM PRODUTOS p
        LEFT JOIN ITEM_VENDAS iv ON iv.PRODUTO_ID = p.PRODUTO_ID
        LEFT JOIN CAB_VENDAS cv ON cv.VENDA_NOTA_ID = iv.VENDA_NOTA_ID AND cv.CANCELADO <> 'S' AND cv.VENDA_DATA_HORA >= ?
        LEFT JOIN CATEGORIA c ON p.CATEGORIA_ID = c.CATEGORIA_ID
        WHERE p.PROD_ATIVO = 'S'
        GROUP BY p.PRODUTO_ID, p.PRODUTO, p.APRESENTACAO, p.COD_BARRAS, p.PROD_SALDO, p.PROD_ESTMINIMO, p.PROD_PRVENDA, p.CATEGORIA_ID, c.CATEGORIA
      `;

      const products = await queryDigifarma(sql, [dataInicio]);

      // Filtrar produtos que têm faturamento no período e calcular Curva ABC
      const soldProducts = products
        .map(p => ({
          id: p.ID,
          name: p.NAME,
          presentation: p.PRESENTATION || '',
          barcode: p.BARCODE || '',
          stock: p.STOCK || 0,
          minStock: p.MINSTOCK || 0,
          price: p.PRICE || 0,
          categoryId: p.CATEGORYID,
          categoryName: p.CATEGORYNAME || 'Sem Categoria',
          totalSold: p.TOTALSOLD || 0,
          totalRevenue: p.TOTALREVENUE || 0
        }))
        .filter(p => p.totalSold > 0)
        .sort((a, b) => b.totalRevenue - a.totalRevenue);

      const totalRevenueGeral = soldProducts.reduce((sum, p) => sum + p.totalRevenue, 0);

      let cumulativeRevenue = 0;
      const abProducts = [];

      for (const p of soldProducts) {
        cumulativeRevenue += p.totalRevenue;
        const percentage = totalRevenueGeral > 0 ? (cumulativeRevenue / totalRevenueGeral) * 100 : 0;
        
        let curve = 'C';
        if (percentage <= 80) {
          curve = 'A';
        } else if (percentage <= 95) {
          curve = 'B';
        }

        // Se for Curva A ou B, mantemos para previsão de compras
        if (curve === 'A' || curve === 'B') {
          abProducts.push({
            ...p,
            curve
          });
        }
      }

      const today = new Date();
      const items = [];

      for (const p of abProducts) {
        const stock = p.stock;
        const totalSold = p.totalSold;
        const giroDiario = totalSold / daysAnalysis;
        const price = p.price;

        // Se vendeu, calcula dias restantes de estoque
        const diasRestantes = stock / giroDiario;
        
        // Data prevista de esgotamento
        const depletionDate = new Date(today);
        depletionDate.setDate(today.getDate() + Math.floor(diasRestantes));
        const depletionDateStr = depletionDate.toISOString().split('T')[0];

        // Data ideal de compra (depletionDate - leadTime)
        const purchaseDate = new Date(depletionDate);
        purchaseDate.setDate(depletionDate.getDate() - leadTime);
        const purchaseDateStr = purchaseDate.toISOString().split('T')[0];

        // Qtd sugerida para cobrir daysCoverage
        const suggestedQty = Math.ceil(giroDiario * daysCoverage);

        let status = 'planejado';
        if (stock <= 0) {
          status = 'esgotado';
        } else if (diasRestantes <= leadTime) {
          status = 'urgente';
        } else if (diasRestantes <= leadTime + 5) {
          status = 'alerta';
        }

        items.push({
          id: p.id,
          name: p.name,
          presentation: p.presentation,
          barcode: p.barcode,
          stock: stock,
          minStock: p.minStock,
          price: price,
          categoryId: p.categoryId,
          categoryName: p.categoryName,
          totalSold: totalSold,
          giroDiario: giroDiario,
          depletionDate: depletionDateStr,
          purchaseDate: purchaseDateStr,
          status: status,
          suggestedQty: suggestedQty,
          costValue: suggestedQty * price,
          curve: p.curve
        });
      }

      res.json({
        daysAnalysis,
        leadTime,
        daysCoverage,
        timestamp: new Date().toISOString(),
        items
      });
    } catch (err) {
      if (err.message && err.message.includes('Offline')) {
        return res.status(503).json({ error: 'O servidor do Digifarma está desligado ou offline.' });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // --- Cotações (Quotations) ---

  router.post('/quotes/last-suppliers', async (req, res) => {
    const { products } = req.body;
    if (!products || products.length === 0) return res.json([]);
    
    try {
      const placeholders = products.map(() => '?').join(',');
      // Usar a VIEW_ULT_COMPRAS e JOIN com PRODUTOS para buscar pelo NOME do produto
      const sql = `
        SELECT p.PRODUTO as PRODUTO_ID, v.FORNECEDOR 
        FROM VIEW_ULT_COMPRAS v
        JOIN PRODUTOS p ON v.PRODUTO_ID = p.PRODUTO_ID
        WHERE p.PRODUTO IN (${placeholders})
        ORDER BY v.COMPRA_DATA DESC
      `;
      const result = await queryDigifarma(sql, products);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/quotes/generate-text', async (req, res) => {
    const { items, supplierName } = req.body;
    
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Nenhum item selecionado.' });
    }

    try {
      const prompt = `Gere uma mensagem profissional e amigável de WhatsApp solicitando cotação para o fornecedor ${supplierName}.
A mensagem será enviada pela Bela Farma Sul.
Itens para cotar:\n${items.map(i => '- ' + i).join('\n')}
A mensagem deve ser direta, pedir o melhor preço e prazo, e terminar de forma educada.`;

      const text = await callAI(prompt, 'Você é um assistente de compras de uma farmácia.', { temperature: 0.7 });
      res.json({ text: text.trim() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/quotes/send', async (req, res) => {
    const { supplierDigifarmaId, supplierName, message, products } = req.body;

    if (!supplierDigifarmaId || !message) {
      return res.status(400).json({ error: 'Faltam parâmetros obrigatórios.' });
    }

    try {
      // Buscar o telefone do fornecedor na base local
      const localSupplier = db.prepare('SELECT telefone FROM local_suppliers WHERE digifarma_id = ?').get(supplierDigifarmaId);
      if (!localSupplier || !localSupplier.telefone) {
        return res.status(400).json({ error: 'Fornecedor não possui telefone cadastrado localmente.' });
      }

      const phone = localSupplier.telefone.replace(/\D/g, '');
      
      // Enviar via Baileys Secundário
      await baileysSecondaryService.sendTextToGroup(phone, message);

      // Registrar a cotação no banco
      const now = new Date().toISOString();
      for (const prod of products) {
        const id = 'qt_' + Date.now().toString() + '_' + Math.floor(Math.random() * 1000);
        db.prepare(`
          INSERT INTO quotations (id, productName, supplierId, supplierName, supplierPhone, status, rawMessage, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, 'Enviada', ?, ?, ?)
        `).run(id, prod, supplierDigifarmaId, supplierName, phone, message, now, now);
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/quotes', (req, res) => {
    try {
      const quotes = db.prepare('SELECT * FROM quotations ORDER BY updatedAt DESC').all();
      res.json(quotes);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Listas de Cotações ---

  router.get('/quotes/lists', (req, res) => {
    try {
      const lists = db.prepare('SELECT * FROM quotation_lists ORDER BY createdAt DESC').all();
      const items = db.prepare('SELECT * FROM quotation_list_items').all();
      
      const listsWithItems = lists.map(list => {
        return {
          ...list,
          items: items.filter(item => item.listId === list.id)
        };
      });
      res.json(listsWithItems);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/quotes/lists', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome da lista é obrigatório.' });

    try {
      const id = 'ql_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const createdAt = new Date().toISOString();
      db.prepare(`
        INSERT INTO quotation_lists (id, name, createdAt)
        VALUES (?, ?, ?)
      `).run(id, name, createdAt);
      res.json({ success: true, id, name, createdAt });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/quotes/lists/:id/items', (req, res) => {
    const listId = req.params.id;
    const { products } = req.body; // Array de { productId, productName }

    if (!products || !Array.isArray(products)) {
      return res.status(400).json({ error: 'Produtos inválidos.' });
    }

    try {
      const createdAt = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO quotation_list_items (id, listId, productId, productName, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `);

      db.transaction(() => {
        for (const prod of products) {
          const itemId = 'qli_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
          stmt.run(itemId, listId, prod.productId || prod.id, prod.productName, createdAt);
        }
      })();

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/quotes/lists/:id', (req, res) => {
    const listId = req.params.id;
    try {
      db.prepare('DELETE FROM quotation_lists WHERE id = ?').run(listId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Histórico de Compras ---

  router.get('/product/:id/history', async (req, res) => {
    const productId = req.params.id;
    
    // We need productId to be an integer/string that Digifarma understands.
    // If it's a UUID (auto-generated shortage), it's not in Digifarma. We must extract original ID or handle it.
    // However, shortages from Digifarma have PRODUTO_ID in their 'id' field originally, but AutoShortages creates 'sht_1234_...'
    // Wait! AutoShortages uses PRODUTO_ID inside 'id'? No, AutoShortages uses random ID.
    // Let's just assume we get the original ID or the product name to query.
    // We will query by name if ID is an auto-generated one!
    // But let's first try by PRODUTO_ID directly if it's numeric, otherwise by name.
    
    const { productName } = req.query; // Accept productName as fallback
    
    try {
      let sql = `
        SELECT FIRST 6
          C.DATA_EMISSAO as "dataCompra",
          F.FORNECEDOR as "fornecedor",
          C.NOTA_FISCAL as "notaFiscal",
          I.ITEM_NOTAS_QUANT as "quantidade",
          I.ITEM_NOTAS_PRCOMPRA as "precoCompra"
        FROM ITEM_NOTAS I
        JOIN CAB_NOTAS C ON I.CAB_NOTA_ID = C.CAB_NOTA_ID
        LEFT JOIN FORNECEDORES F ON C.FORNECEDOR_ID = F.FORNECEDOR_ID
      `;
      let params = [];
      
      if (!isNaN(parseInt(productId)) && !productId.startsWith('sht_') && !productId.startsWith('sh_auto_')) {
        sql += ` WHERE I.PRODUTO_ID = ? AND C.ENTRADA_SAIDA = 'E' AND C.CANCELAMENTO = 'N' ORDER BY C.DATA_EMISSAO DESC`;
        params.push(productId);
      } else if (productName) {
        // Query by product name
        sql += ` WHERE I.PRODUTO_ID = (SELECT FIRST 1 PRODUTO_ID FROM PRODUTOS WHERE PRODUTO LIKE ?) AND C.ENTRADA_SAIDA = 'E' AND C.CANCELAMENTO = 'N' ORDER BY C.DATA_EMISSAO DESC`;
        params.push(productName + '%');
      } else {
        return res.json([]);
      }
      
      const history = await queryDigifarma(sql, params);
      res.json(history);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Relatório de Entradas de Mercadorias e Baixa de Faltas ---

  router.get('/entries', async (req, res) => {
    try {
      const dias = parseInt(req.query.dias) || 30;
      const { dataInicio, dataFim, notaFiscal } = req.query;
      const limit = parseInt(req.query.limit) || 50;

      const resultado = await buscarRelatorioEntradas({
        dias,
        dataInicio,
        dataFim,
        notaFiscal,
        limit
      });

      res.json(resultado);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/entries/clear-shortages', (req, res) => {
    try {
      const { shortageIds, userName, details } = req.body;
      const resultado = darBaixaFaltas(shortageIds, userName, details);
      res.json(resultado);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
