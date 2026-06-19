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

// Função auxiliar para tratar erros do Digifarma
const handleDigifarmaError = (err, res, route) => {
  console.error(`[Finance] Erro em ${route}:`, err);
  const msg = err && err.message ? err.message : String(err);
  const isOffline = msg.includes('Offline') || 
                    msg.includes('Inacessível') || 
                    msg.includes('Timeout') || 
                    msg.includes('ECONNREFUSED') || 
                    msg.includes('connection') ||
                    msg.includes('socket');
  if (isOffline) {
    return res.status(503).json({ error: 'O servidor do Digifarma está Offline ou Inacessível.' });
  }
  return res.status(500).json({ error: msg });
};

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

  // Variáveis globais para cache de vendas live
  let liveClosingCache = null;
  let liveClosingCacheTime = 0;
  const CACHE_TTL_MS = 120000; // 2 minutos de cache (120.000 ms)

  // 5. Fechamento de Caixa em Tempo Real (Direto do Digifarma)
  // Tabela real: CAB_VENDAS (vendas) + CAB_VENDAS_FPAGTOS (formas de pagamento)
  // TIPO_PAGAMENTO_ID: 1=Dinheiro, 2=Cheque, 3=ChequePré, 4=Cartão, 5=Crediário, 6=Parcelamento, 8=Pix
  // Para Cartão (id=4), a coluna BANDEIRA contém "DEBITO" ou "CREDITO"
  router.get('/live-closing', async (req, res) => {
    try {
      const nowMs = Date.now();
      if (liveClosingCache && (nowMs - liveClosingCacheTime < CACHE_TTL_MS)) {
        console.log('[Finance] ⚡ Retornando fechamento de hoje via cache (TTL 2m)');
        return res.json(liveClosingCache);
      }

      // Total de vendas do dia - Otimizado com ajuste matemático de fuso para Brasília (-3h = -0.125 dia)
      const sqlVendas = `
        SELECT 
          COUNT(*) as QTD_VENDAS,
          COALESCE(SUM(VENDA_TOTAL), 0) as TOTAL_VENDAS
        FROM CAB_VENDAS 
        WHERE CAST((VENDA_DATA_HORA - 0.125) AS DATE) = CURRENT_DATE
          AND CANCELADO <> 'S'
      `;

      // Breakdown por forma de pagamento - Otimizado com CAST e ajuste de fuso (-3h)
      const sqlPagamentos = `
        SELECT 
          fp.TIPO_PAGAMENTO_ID,
          fp.BANDEIRA,
          COALESCE(SUM(fp.VALOR), 0) as TOTAL
        FROM CAB_VENDAS_FPAGTOS fp
        JOIN CAB_VENDAS v ON fp.VENDA_NOTA_ID = v.VENDA_NOTA_ID
        WHERE CAST((v.VENDA_DATA_HORA - 0.125) AS DATE) = CURRENT_DATE
          AND v.CANCELADO <> 'S'
        GROUP BY fp.TIPO_PAGAMENTO_ID, fp.BANDEIRA
      `;

      // Fundo de Caixa: Pegar o valor do último caixa aberto
      const sqlFundoCaixa = `
        SELECT FIRST 1 VALOR_ABERTURA 
        FROM CAIXA 
        ORDER BY ABERTURA DESC
      `;

      // Executa as consultas de forma sequencial para evitar deadlocks/timeouts na conexão do Firebird
      const vendasResult = await queryDigifarma(sqlVendas, []);
      const pagResult = await queryDigifarma(sqlPagamentos, []);
      const fundoCaixaResult = await queryDigifarma(sqlFundoCaixa, []);

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

      const payload = {
        totalSales,
        dinheiro,
        credit,
        debit,
        pix,
        crediario,
        outros,
        qtdVendas,
        fundoCaixa
      };

      // Atualiza o cache e o timestamp do cache
      liveClosingCache = payload;
      liveClosingCacheTime = Date.now();

      res.json(payload);
    } catch (err) {
      return handleDigifarmaError(err, res, '/live-closing');
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

  // Rota de pagamentos do mês atual do Digifarma (Real-time com fuso corrigido)
  router.get('/monthly-payments', async (req, res) => {
    try {
      const sql = `
        SELECT 
          fp.TIPO_PAGAMENTO_ID,
          fp.BANDEIRA,
          COALESCE(SUM(fp.VALOR), 0) as TOTAL
        FROM CAB_VENDAS_FPAGTOS fp
        JOIN CAB_VENDAS v ON fp.VENDA_NOTA_ID = v.VENDA_NOTA_ID
        WHERE EXTRACT(MONTH FROM (v.VENDA_DATA_HORA - 0.125)) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR FROM (v.VENDA_DATA_HORA - 0.125)) = EXTRACT(YEAR FROM CURRENT_DATE)
          AND v.CANCELADO <> 'S'
        GROUP BY fp.TIPO_PAGAMENTO_ID, fp.BANDEIRA
      `;
      
      const payments = await queryDigifarma(sql);
      res.json(payments);
    } catch (err) {
      return handleDigifarmaError(err, res, '/monthly-payments');
    }
  });

  // Rota de relatório de vendas do Digifarma (Categorias e Horários)
  router.get('/sales-report', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      let start = startDate;
      let end = endDate;
      
      if (!start || !end) {
        const today = new Date();
        const past = new Date();
        past.setDate(today.getDate() - 30);
        
        const pad = (num) => String(num).padStart(2, '0');
        start = `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}`;
        end = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
      }

      // 1. Vendas por Categoria (Ajuste de fuso para Brasília -3h)
      const sqlCategorias = `
        SELECT 
          COALESCE(c.CATEGORIA, 'Sem Categoria') AS CATEGORIA_NOME,
          SUM(iv.ITEMVEND_PRVENDA * iv.ITEMVEND_QUANT) AS TOTAL_VENDA,
          SUM(iv.ITEMVEND_QUANT) AS QTD_ITENS
        FROM ITEM_VENDAS iv
        JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
        JOIN PRODUTOS p ON iv.PRODUTO_ID = p.PRODUTO_ID
        LEFT JOIN CATEGORIA c ON p.CATEGORIA_ID = c.CATEGORIA_ID
        WHERE v.CANCELADO <> 'S'
          AND CAST((v.VENDA_DATA_HORA - 0.125) AS DATE) BETWEEN ? AND ?
        GROUP BY c.CATEGORIA
        ORDER BY TOTAL_VENDA DESC
      `;

      // 2. Vendas por Horário (Ajuste de fuso para Brasília -3h)
      const sqlHorarios = `
        SELECT 
          EXTRACT(HOUR FROM (v.VENDA_DATA_HORA - 0.125)) AS HORA,
          SUM(v.VENDA_TOTAL) AS TOTAL_VENDA,
          COUNT(v.VENDA_NOTA_ID) AS QTD_VENDAS
        FROM CAB_VENDAS v
        WHERE v.CANCELADO <> 'S'
          AND CAST((v.VENDA_DATA_HORA - 0.125) AS DATE) BETWEEN ? AND ?
        GROUP BY EXTRACT(HOUR FROM (v.VENDA_DATA_HORA - 0.125))
        ORDER BY HORA ASC
      `;

      // Executa as consultas de forma sequencial para evitar deadlocks/timeouts na conexão do Firebird
      const categoriasResult = await queryDigifarma(sqlCategorias, [start, end]);
      const horariosResult = await queryDigifarma(sqlHorarios, [start, end]);

      res.json({
        categorias: (categoriasResult || []).map(r => ({
          categoria: (r.CATEGORIA_NOME || '').trim(),
          total: r.TOTAL_VENDA || 0,
          quantidade: r.QTD_ITENS || 0
        })),
        horarios: (horariosResult || []).map(r => ({
          hora: r.HORA,
          total: r.TOTAL_VENDA || 0,
          vendas: r.QTD_VENDAS || 0
        }))
      });
    } catch (err) {
      return handleDigifarmaError(err, res, '/sales-report');
    }
  });

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
