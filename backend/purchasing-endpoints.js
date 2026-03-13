const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { analisarRelatoriosDigifarma } = require('./services/purchasing-agent.service');
const whatsappService = require('./services/whatsapp.service');

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

  router.post('/send-to-nayane', async (req, res) => {
    const { list } = req.body;
    const nayaneWhatsApp = process.env.NAYANE_WHATSAPP || '553299999999'; // Placeholder se não houver no .env

    if (!list) return res.status(400).json({ error: 'Relatório vazio.' });

    try {
      const message = `Oi Nayane, aqui é a Isa. Segue o resumo de intenção de compra aprovado:\n\n${list}\n\nAtt, Isa-Compras 🛒`;
      await whatsappService.sendMessage(nayaneWhatsApp, message);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
