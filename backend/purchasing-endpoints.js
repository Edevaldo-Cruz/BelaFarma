const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
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
      const id = uuidv4();
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
    const reportsDir = path.join(__dirname, 'reports/digifarma');
    
    if (!fs.existsSync(reportsDir)) {
      return res.status(404).json({ error: 'Diretório de relatórios não encontrado.' });
    }

    try {
      const files = fs.readdirSync(reportsDir)
        .filter(f => f.endsWith('.csv') || f.endsWith('.pdf'))
        .map(f => ({
          path: path.join(reportsDir, f),
          name: f,
          type: f.endsWith('.pdf') ? 'application/pdf' : 'text/csv'
        }));

      if (files.length === 0) {
        return res.status(400).json({ error: 'Nenhum relatório (CSV ou PDF) encontrado na pasta backend/reports/digifarma.' });
      }

      const suggestion = await analisarRelatoriosDigifarma(files);
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

  return router;
};
