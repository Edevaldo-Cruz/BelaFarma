const express = require('express');
const multer = require('multer');
const {
  gerarPilulaEducacao,
  analisarFechamentoDeCaixa,
  analisarRelatorioDigifarma
} = require('./services/finance-agent.service');

// Configuração de upload recebendo via memória/disco
// Para preservar a leitura segura por FS, salvar numa temp dir segura
const upload = multer({ dest: './uploads/finance_temp/' });

module.exports = function (db) {
  const router = express.Router();

  // 1. Rota de Pilula Diária 
  router.get('/pilulas', async (req, res) => {
    try {
      const pilula = await gerarPilulaEducacao();
      res.json({ pilula });
    } catch (err) {
      console.error('[IsaFinanceiro] Erro em pilulas:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Rota de Análise de Caixa
  router.post('/analisar-caixa', async (req, res) => {
    try {
      const relatorioCaixa = await analisarFechamentoDeCaixa(db);
      res.json({ relatorio: relatorioCaixa });
    } catch (err) {
      console.error('[IsaFinanceiro] Erro na análise de caixa:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Rota de Upload do Digifarma (PDF/CSV)
  router.post('/upload-relatorio', upload.single('relatorio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
      }

      console.log(`[IsaFinanceiro] 📁 Processando ${req.file.originalname}...`);

      // Caminho arquivo temporário pelo Multer
      const filePath = req.file.path;
      const fileName = req.file.originalname;
      const mimeType = req.file.mimetype;

      const relatorioIA = await analisarRelatorioDigifarma(filePath, fileName, mimeType);

      res.json({ 
        fileName,
        relatorio: relatorioIA 
      });

    } catch (err) {
      console.error('[IsaFinanceiro] Erro no upload:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Analisar arquivo já existente na central
  router.post('/analisar-arquivo-central', async (req, res) => {
    try {
      const { filename } = req.body;
      if (!filename) return res.status(400).json({ error: 'Nome do arquivo é obrigatório.' });

      const path = require('path');
      const fs = require('fs');
      const reportsDir = path.join(__dirname, 'reports/digifarma');
      const filePath = path.join(reportsDir, filename);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Arquivo não encontrado na central.' });
      }

      console.log(`[IsaFinanceiro] 🤖 Analisando arquivo da central: ${filename}...`);
      
      const mimeType = filename.endsWith('.pdf') ? 'application/pdf' : 'text/csv';
      const relatorioIA = await analisarRelatorioDigifarma(filePath, filename, mimeType);

      res.json({ 
        fileName: filename,
        relatorio: relatorioIA 
      });
    } catch (err) {
      console.error('[IsaFinanceiro] Erro na análise central:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
