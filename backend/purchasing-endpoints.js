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

  // --- Cotações (Quotations) ---

  router.post('/quotes/last-suppliers', async (req, res) => {
    const { products } = req.body;
    if (!products || products.length === 0) return res.json([]);
    
    try {
      const placeholders = products.map(() => '?').join(',');
      // Usar a VIEW_ULT_COMPRAS para buscar os últimos fornecedores dos produtos selecionados
      const sql = `
        SELECT PRODUTO_ID, FORNECEDOR 
        FROM VIEW_ULT_COMPRAS
        WHERE PRODUTO_ID IN (${placeholders})
        ORDER BY COMPRA_DATA DESC
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

  return router;
};
