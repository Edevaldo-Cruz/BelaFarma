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
      // Obter o início do dia de hoje (YYYY-MM-DD 00:00:00) para usar o índice do banco de dados
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const todayStart = `${year}-${month}-${day} 00:00:00`;

      // Total de vendas do dia - Otimizado para usar o índice de VENDA_DATA_HORA
      const sqlVendas = `
        SELECT 
          COUNT(*) as QTD_VENDAS,
          COALESCE(SUM(VENDA_TOTAL), 0) as TOTAL_VENDAS
        FROM CAB_VENDAS 
        WHERE VENDA_DATA_HORA >= ?
          AND CANCELADO <> 'S'
      `;

      // Breakdown por forma de pagamento - Otimizado para usar o índice de VENDA_DATA_HORA
      const sqlPagamentos = `
        SELECT 
          fp.TIPO_PAGAMENTO_ID,
          fp.BANDEIRA,
          COALESCE(SUM(fp.VALOR), 0) as TOTAL
        FROM CAB_VENDAS_FPAGTOS fp
        JOIN CAB_VENDAS v ON fp.VENDA_NOTA_ID = v.VENDA_NOTA_ID
        WHERE v.VENDA_DATA_HORA >= ?
          AND v.CANCELADO <> 'S'
        GROUP BY fp.TIPO_PAGAMENTO_ID, fp.BANDEIRA
      `;

      // Fundo de Caixa: Pegar o valor do último caixa aberto
      const sqlFundoCaixa = `
        SELECT FIRST 1 VALOR_ABERTURA 
        FROM CAIXA 
        ORDER BY ABERTURA DESC
      `;

      const [vendasResult, pagResult, fundoCaixaResult] = await Promise.all([
        queryDigifarma(sqlVendas, [todayStart]),
        queryDigifarma(sqlPagamentos, [todayStart]),
        queryDigifarma(sqlFundoCaixa, [])
      ]);

      let qtdVendas = 0;
      if (vendasResult && vendasResult.length > 0) {
        qtdVendas = vendasResult[0].QTD_VENDAS || 0;
      }

      let fundoCaixa = 0;
      if (fundoCaixaResult && fundoCaixaResult.length > 0) {
        fundoCaixa = fundoCaixaResult[0].VALOR_ABERTURA || 0;
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

      // O valor líquido real é a soma de todos os recebimentos reais de hoje
      const totalSales = dinheiro + credit + debit + pix + crediario + outros;

      res.json({
        totalSales,
        dinheiro,
        credit,
        debit,
        pix,
        crediario,
        outros,
        qtdVendas,
        fundoCaixa
      });
    } catch (err) {
      if (err.message && err.message.includes('Offline')) {
        return res.status(503).json({ error: 'Servidor do Digifarma Offline' });
      }
      console.error('[Finance] Erro no live-closing:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Sincronizar Crediário do Digifarma → SQLite local
  // Apaga todos os customer_debts locais e reimporta do FICHARIO do Digifarma
  const syncCrediarioFromDigifarma = async () => {
    const crypto = require('crypto');
    const { listarCrediarioAtivo } = require('./services/crediario.service');

    console.log('[Crediário] 🔄 Iniciando sincronização do Digifarma...');
    const crediarios = await listarCrediarioAtivo();
    console.log(`[Crediário] Encontrados ${crediarios.length} registros em aberto.`);

    // Limpa dívidas locais antigas
    db.prepare('DELETE FROM customer_debts').run();

    const insertCustomer = db.prepare(`
      INSERT OR IGNORE INTO customers (id, name, phone, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertDebt = db.prepare(`
      INSERT INTO customer_debts (id, customerId, purchaseDate, description, totalValue, status, userName)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let newCustomers = 0;
    let newDebts = 0;

    db.transaction(() => {
      for (const cred of crediarios) {
        if (!cred.clientId) continue;
        const customerId = String(cred.clientId);

        const exists = db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId);
        if (!exists) {
          insertCustomer.run(
            customerId,
            cred.clientName || 'Desconhecido',
            cred.phone || '',
            new Date().toISOString(),
            new Date().toISOString()
          );
          newCustomers++;
        }

        const debtId = String(cred.id || crypto.randomUUID());
        const purchaseDate = cred.purchaseDate ? new Date(cred.purchaseDate).toISOString() : new Date().toISOString();
        const dueDate = cred.dueDate ? new Date(cred.dueDate).toLocaleDateString('pt-BR') : 'N/D';
        const description = `Fiado Digifarma - Venda #${cred.saleId || '?'} (Venc. ${dueDate})`;

        insertDebt.run(
          debtId,
          customerId,
          purchaseDate,
          description,
          cred.balance,
          'Pendente',
          'SISTEMA (Digifarma)'
        );
        newDebts++;
      }
    })();

    console.log(`[Crediário] ✅ Sincronização concluída! Clientes novos: ${newCustomers}, Títulos: ${newDebts}`);
    return { newCustomers, newDebts, total: crediarios.length };
  };

  // Endpoint manual para sincronizar
  router.post('/sync-crediario', async (req, res) => {
    try {
      const result = await syncCrediarioFromDigifarma();
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[Crediário] Erro na sincronização:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Auto-sync no boot (com delay de 10s para o Digifarma estar disponível)
  setTimeout(() => {
    syncCrediarioFromDigifarma().catch(err => {
      console.warn('[Crediário] ⚠️ Sync automático falhou (Digifarma pode estar offline):', err.message);
    });
  }, 10000);

  return router;
};
