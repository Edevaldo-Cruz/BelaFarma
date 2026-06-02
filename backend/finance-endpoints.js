const express = require('express');
const multer = require('multer');
const {
  gerarPilulaEducacao,
  analisarFechamentoDeCaixa,
  analisarRelatorioDigifarma
} = require('./services/finance-agent.service');
const { queryDigifarma } = require('./services/digifarma.service');

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

  // 5. Fechamento de Caixa em Tempo Real (Direto do Digifarma)
  // Tabela real: CAB_VENDAS (vendas) + CAB_VENDAS_FPAGTOS (formas de pagamento)
  // TIPO_PAGAMENTO_ID: 1=Dinheiro, 2=Cheque, 3=ChequePré, 4=Cartão, 5=Crediário, 6=Parcelamento, 8=Pix
  // Para Cartão (id=4), a coluna BANDEIRA contém "DEBITO" ou "CREDITO"
  router.get('/live-closing', async (req, res) => {
    try {
      // Total de vendas do dia
      const sqlVendas = `
        SELECT 
          COUNT(*) as QTD_VENDAS,
          COALESCE(SUM(VENDA_TOTAL), 0) as TOTAL_VENDAS
        FROM CAB_VENDAS 
        WHERE CAST(VENDA_DATA_HORA AS DATE) = CURRENT_DATE
          AND CANCELADO <> 'S'
      `;

      // Breakdown por forma de pagamento
      const sqlPagamentos = `
        SELECT 
          fp.TIPO_PAGAMENTO_ID,
          fp.BANDEIRA,
          COALESCE(SUM(fp.VALOR), 0) as TOTAL
        FROM CAB_VENDAS_FPAGTOS fp
        JOIN CAB_VENDAS v ON fp.VENDA_NOTA_ID = v.VENDA_NOTA_ID
        WHERE CAST(v.VENDA_DATA_HORA AS DATE) = CURRENT_DATE
          AND v.CANCELADO <> 'S'
        GROUP BY fp.TIPO_PAGAMENTO_ID, fp.BANDEIRA
      `;

      const [vendasResult, pagResult] = await Promise.all([
        queryDigifarma(sqlVendas),
        queryDigifarma(sqlPagamentos)
      ]);

      let totalSales = 0;
      let qtdVendas = 0;
      if (vendasResult && vendasResult.length > 0) {
        totalSales = vendasResult[0].TOTAL_VENDAS || 0;
        qtdVendas = vendasResult[0].QTD_VENDAS || 0;
      }

      let dinheiro = 0, credit = 0, debit = 0, pix = 0, crediario = 0, outros = 0;

      if (pagResult && pagResult.length > 0) {
        for (const row of pagResult) {
          const tipo = row.TIPO_PAGAMENTO_ID;
          const bandeira = (row.BANDEIRA || '').toUpperCase();
          const valor = row.TOTAL || 0;

          if (tipo === 1) {
            dinheiro += valor;
          } else if (tipo === 4) {
            // Cartão: separar débito e crédito pela BANDEIRA
            if (bandeira.includes('DEBITO')) {
              debit += valor;
            } else {
              credit += valor;
            }
          } else if (tipo === 5) {
            crediario += valor;
          } else if (tipo === 8 || tipo === 15) {
            pix += valor;
          } else {
            outros += valor;
          }
        }
      }

      res.json({
        totalSales,
        qtdVendas,
        dinheiro,
        credit,
        debit,
        pix,
        crediario,
        outros
      });
    } catch (err) {
      if (err.message && err.message.includes('Offline')) {
        return res.status(503).json({ error: 'Servidor do Digifarma Offline' });
      }
      console.error('[Finance] Erro no live-closing:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
