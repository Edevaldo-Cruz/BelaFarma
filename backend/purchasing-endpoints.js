const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { analisarRelatoriosDigifarma } = require('./services/purchasing-agent.service');
const whatsappService = require('./services/whatsapp.service');
const { queryDigifarma } = require('./services/digifarma.service');

module.exports = (db) => {
  
  // --- Fornecedores ---

  router.get('/suppliers', (req, res) => {
    try {
      const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY name ASC').all();
      res.json(suppliers);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/suppliers', (req, res) => {
    const { name, whatsapp, category } = req.body;
    if (!name || !whatsapp || !category) {
      return res.status(400).json({ error: 'Nome, WhatsApp e Categoria são obrigatórios.' });
    }

    try {
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      db.prepare(`
        INSERT INTO suppliers (id, name, whatsapp, category, createdAt)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, name, whatsapp, category, createdAt);
      
      res.json({ id, name, whatsapp, category, createdAt });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/suppliers/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM suppliers WHERE id = ?').run(req.params.id);
      res.json({ success: true });
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
      const sql = \`
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
      \`;

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

  // --- Envio de Cotação ---

  router.post('/send-quotes', async (req, res) => {
    const { list, category } = req.body;
    if (!list || !category) {
      return res.status(400).json({ error: 'Lista e categoria são obrigatórios.' });
    }

    try {
      const suppliers = db.prepare('SELECT * FROM suppliers WHERE category = ?').all(category);
      
      if (suppliers.length === 0) {
        return res.status(404).json({ error: `Nenhum fornecedor cadastrado para a categoria ${category}.` });
      }

      const results = [];
      for (const supplier of suppliers) {
        const message = `Olá ${supplier.name}, sou a Isa da Bela Farma Sul. Segue nossa lista de cotação para hoje:\n\n${list}\n\nFavor nos enviar o melhor preço e prazo. No aguardo!`;
        try {
          await whatsappService.sendMessage(supplier.whatsapp, message);
          results.push({ name: supplier.name, status: 'sent' });
        } catch (err) {
          results.push({ name: supplier.name, status: 'failed', error: err.message });
        }
      }

      res.json({ results });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/send-to-edevaldo', async (req, res) => {
    const { list } = req.body;
    const edevaldoWhatsApp = process.env.EDEVALDO_WHATSAPP || process.env.ADMIN_WHATSAPP || '5532988634755';

    if (!list) return res.status(400).json({ error: 'Relatório vazio.' });

    try {
      const message = `Oi Edevaldo, aqui é a Isa. Segue o resumo de intenção de compra aprovado:\n\n${list}\n\nAtt, Isa-Compras 🛒`;
      await whatsappService.sendMessage(edevaldoWhatsApp, message);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
