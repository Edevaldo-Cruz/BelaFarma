const express = require('express');
const multer = require('multer');
const {
  gerarPilulaEducacao,
  analisarFechamentoDeCaixa,
  analisarRelatorioDigifarma
} = require('./services/finance-agent.service');
const { queryDigifarma } = require('./services/digifarma.service');
const { calcularPorcentagensProduto } = require('./services/pricing-customizations.service');

// Configuração de upload recebendo via memória/disco
// Para preservar a leitura segura por FS, salvar numa temp dir segura
const upload = multer({ dest: './uploads/finance_temp/' });

// Função auxiliar para tratar erros do Digifarma
const handleDigifarmaError = (err, res, route, mockFallback) => {
  console.error(`[Finance] Erro em ${route}:`, err);
  
  // Se estiver em desenvolvimento, retorna dados simulados/mock
  const config = require('./config');
  if (!config.isProduction && mockFallback !== undefined) {
    console.warn(`[Finance] ⚠️ Digifarma offline/com erro. Retornando dados simulados para ${route}.`);
    return res.json(mockFallback);
  }

  const msg = err && err.message ? err.message : String(err);
  const isOffline = msg.includes('Offline') || 
                    msg.includes('Inacessível') || 
                    msg.includes('Timeout') || 
                    msg.includes('ECONNREFUSED') || 
                    msg.includes('connection') ||
                    msg.includes('socket');
  if (isOffline) {
    console.warn(`[Finance] ⚠️ Digifarma offline. Retornando payload vazio para evitar erros no console do navegador.`);
    if (route === '/live-closing') {
      return res.json({
        totalSales: 0, dinheiro: 0, credit: 0, debit: 0, pix: 0, crediario: 0, outros: 0, qtdVendas: 0, fundoCaixa: 0,
        isOffline: true
      });
    } else if (route === '/monthly-payments') {
      return res.json({ isOffline: true, payments: [] });
    } else if (route === '/sales-report') {
      return res.json({
        categorias: [],
        horarios: [],
        isOffline: true
      });
    } else if (route === '/sold-products-report') {
      return res.json({
        totalItens: 0,
        totalQtdGeral: 0,
        categorias: [],
        isOffline: true
      });
    }
    return res.json({ isOffline: true });
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
      const forceRefresh = req.query.refresh === 'true';
      const nowMs = Date.now();
      if (!forceRefresh && liveClosingCache && (nowMs - liveClosingCacheTime < CACHE_TTL_MS)) {
        console.log('[Finance] ⚡ Retornando fechamento de hoje via cache (TTL 2m)');
        return res.json(liveClosingCache);
      }

      // Calcula o início do dia comercial atual (início às 03:00)
      const getBusinessDayStartStr = () => {
        const now = new Date();
        if (now.getHours() < 3) {
          now.setDate(now.getDate() - 1);
        }
        const pad = (num) => String(num).padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} 03:00:00`;
      };
      const businessDayStart = getBusinessDayStartStr();

      // Total de vendas do dia - Otimizado para permitir uso de index (SARGable)
      const sqlVendas = `
        SELECT 
          COUNT(*) as QTD_VENDAS,
          COALESCE(SUM(VENDA_TOTAL), 0) as TOTAL_VENDAS
        FROM CAB_VENDAS 
        WHERE VENDA_DATA_HORA >= ?
          AND CANCELADO <> 'S'
      `;

      // Breakdown por forma de pagamento - Otimizado para permitir uso de index (SARGable)
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

      // Executa as consultas de forma sequencial para evitar deadlocks/timeouts na conexão do Firebird
      const vendasResult = await queryDigifarma(sqlVendas, [businessDayStart]);
      const pagResult = await queryDigifarma(sqlPagamentos, [businessDayStart]);
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

      // Buscar lista de crediários do dia no Digifarma
      let crediarioList = [];
      try {
        const { listarCrediarioDoDia } = require('./services/crediario.service');
        crediarioList = await listarCrediarioDoDia(businessDayStart);
      } catch (cErr) {
        console.warn('[Finance] Erro ao buscar crediários do dia no Digifarma:', cErr.message);
      }

      // Se não encontrou no pagResult mas há itens em crediarioList, soma o total
      if (crediario === 0 && crediarioList.length > 0) {
        crediario = crediarioList.reduce((acc, item) => acc + (item.val || 0), 0);
      }

      const payload = {
        totalSales,
        dinheiro,
        credit,
        debit,
        pix,
        crediario,
        crediarioList,
        outros,
        qtdVendas,
        fundoCaixa
      };

      // Atualiza o cache e o timestamp do cache
      liveClosingCache = payload;
      liveClosingCacheTime = Date.now();

      res.json(payload);
    } catch (err) {
      const mockPayload = {
        totalSales: 1250.50,
        dinheiro: 450.00,
        credit: 350.00,
        debit: 200.00,
        pix: 250.50,
        crediario: 0,
        outros: 0,
        qtdVendas: 35,
        fundoCaixa: 250.00
      };
      return handleDigifarmaError(err, res, '/live-closing', mockPayload);
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
      const mockPayments = [
        { TIPO_PAGAMENTO_ID: 1, BANDEIRA: null, TOTAL: 12450.00 },
        { TIPO_PAGAMENTO_ID: 4, BANDEIRA: 'VISA CREDITO', TOTAL: 8500.00 },
        { TIPO_PAGAMENTO_ID: 4, BANDEIRA: 'VISA DEBITO', TOTAL: 4200.00 },
        { TIPO_PAGAMENTO_ID: 8, BANDEIRA: null, TOTAL: 9350.00 }
      ];
      return handleDigifarmaError(err, res, '/monthly-payments', mockPayments);
    }
  });

  // Rota de relatório de vendas do Digifarma (Categorias, Horários e Evolução Diária de Tickets)
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

      // Otimização de range para permitir uso de índice (SARGable)
      const startDateTime = `${start} 03:00:00`;
      
      const endParts = end.split('-');
      const endDateObj = new Date(Number(endParts[0]), Number(endParts[1]) - 1, Number(endParts[2]));
      endDateObj.setDate(endDateObj.getDate() + 1);
      const pad = (num) => String(num).padStart(2, '0');
      const endDateTime = `${endDateObj.getFullYear()}-${pad(endDateObj.getMonth() + 1)}-${pad(endDateObj.getDate())} 02:59:59`;

      // 1. Vendas por Categoria (Otimizado para usar index)
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
          AND v.VENDA_DATA_HORA BETWEEN ? AND ?
        GROUP BY c.CATEGORIA
        ORDER BY TOTAL_VENDA DESC
      `;

      // 2. Vendas por Horário
      const sqlHorarios = `
        SELECT 
          EXTRACT(HOUR FROM v.VENDA_DATA_HORA) AS HORA,
          SUM(v.VENDA_TOTAL) AS TOTAL_VENDA,
          COUNT(v.VENDA_NOTA_ID) AS QTD_VENDAS
        FROM CAB_VENDAS v
        WHERE v.CANCELADO <> 'S'
          AND v.VENDA_DATA_HORA BETWEEN ? AND ?
        GROUP BY EXTRACT(HOUR FROM v.VENDA_DATA_HORA)
        ORDER BY HORA ASC
      `;

      // 3. Tickets Diários (Quantidade de cupons gerados por dia)
      const sqlTicketsDiarios = `
        SELECT 
          CAST(v.VENDA_DATA_HORA AS DATE) AS DATA_VENDA,
          COUNT(v.VENDA_NOTA_ID) AS QTD_TICKETS,
          SUM(v.VENDA_TOTAL) AS TOTAL_VENDA
        FROM CAB_VENDAS v
        WHERE v.CANCELADO <> 'S'
          AND v.VENDA_DATA_HORA BETWEEN ? AND ?
        GROUP BY CAST(v.VENDA_DATA_HORA AS DATE)
        ORDER BY DATA_VENDA ASC
      `;

      // Executa as consultas de forma sequencial para evitar deadlocks/timeouts na conexão do Firebird
      const categoriasResult = await queryDigifarma(sqlCategorias, [startDateTime, endDateTime]);
      const horariosResult = await queryDigifarma(sqlHorarios, [startDateTime, endDateTime]);
      const ticketsDiariosResult = await queryDigifarma(sqlTicketsDiarios, [startDateTime, endDateTime]);

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
        })),
        ticketsDiarios: (ticketsDiariosResult || []).map(r => {
          let dateStr = '';
          if (r.DATA_VENDA) {
            const dateObj = new Date(r.DATA_VENDA);
            const pad2 = (num) => String(num).padStart(2, '0');
            dateStr = `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
          }
          return {
            data: dateStr,
            tickets: r.QTD_TICKETS || 0,
            total: r.TOTAL_VENDA || 0
          };
        })
      });
    } catch (err) {
      const endParts = (endDate || '').split('-');
      const tempDate = endParts.length === 3 
        ? new Date(Number(endParts[0]), Number(endParts[1]) - 1, Number(endParts[2]))
        : new Date();
      
      const mockTicketsDiarios = [];
      const pad = (num) => String(num).padStart(2, '0');
      for (let i = 15; i >= 0; i--) {
        const d = new Date(tempDate);
        d.setDate(tempDate.getDate() - i);
        const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        mockTicketsDiarios.push({
          data: dateStr,
          tickets: Math.floor(Math.random() * 30) + 10,
          total: parseFloat((Math.random() * 1500 + 500).toFixed(2))
        });
      }

      const mockReport = {
        categorias: [
          { categoria: 'REFERENCIA', total: 4500.00, quantidade: 120 },
          { categoria: 'GENERICOS', total: 3800.00, quantidade: 210 },
          { categoria: 'SIMILARES', total: 2900.00, quantidade: 150 },
          { categoria: 'PERFUMARIAS', total: 1800.00, quantidade: 95 },
          { categoria: 'OUTROS', total: 500.00, quantidade: 30 }
        ],
        horarios: [
          { hora: 8, total: 350.00, vendas: 12 },
          { hora: 9, total: 480.00, vendas: 15 },
          { hora: 10, total: 720.00, vendas: 22 },
          { hora: 11, total: 610.00, vendas: 18 },
          { hora: 12, total: 850.00, vendas: 25 },
          { hora: 13, total: 400.00, vendas: 14 },
          { hora: 14, total: 530.00, vendas: 16 },
          { hora: 15, total: 690.00, vendas: 20 },
          { hora: 16, total: 880.00, vendas: 24 },
          { hora: 17, total: 950.00, vendas: 28 },
          { hora: 18, total: 620.00, vendas: 19 },
          { hora: 19, total: 300.00, vendas: 10 }
        ],
        ticketsDiarios: mockTicketsDiarios
      };
      return handleDigifarmaError(err, res, '/sales-report', mockReport);
    }
  });

  // Rota de produtos vendidos agrupados por categoria
  router.get('/sold-products-report', async (req, res) => {
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

      // Otimização de range para permitir uso de índice (SARGable)
      const startDateTime = `${start} 03:00:00`;

      const endParts = end.split('-');
      const endDateObj = new Date(Number(endParts[0]), Number(endParts[1]) - 1, Number(endParts[2]));
      endDateObj.setDate(endDateObj.getDate() + 1);
      const pad = (num) => String(num).padStart(2, '0');
      const endDateTime = `${endDateObj.getFullYear()}-${pad(endDateObj.getMonth() + 1)}-${pad(endDateObj.getDate())} 02:59:59`;

      const sql = `
        SELECT 
          p.PRODUTO_ID,
          p.PRODUTO,
          p.APRESENTACAO,
          p.COD_BARRAS,
          p.PROD_SALDO,
          COALESCE(c.CATEGORIA, 'OUTROS') AS CATEGORIA_NOME,
          SUM(iv.ITEMVEND_QUANT) AS QTD_VENDIDA,
          COALESCE(p.VALOR_ULT_COMPRA, p.PROD_PRCOMPRA, 0) AS ULTIMO_PRECO_DIGIFARMA
        FROM ITEM_VENDAS iv
        JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
        JOIN PRODUTOS p ON iv.PRODUTO_ID = p.PRODUTO_ID
        LEFT JOIN CATEGORIA c ON p.CATEGORIA_ID = c.CATEGORIA_ID
        WHERE v.CANCELADO <> 'S'
          AND v.VENDA_DATA_HORA BETWEEN ? AND ?
        GROUP BY p.PRODUTO_ID, p.PRODUTO, p.APRESENTACAO, p.COD_BARRAS, p.PROD_SALDO, c.CATEGORIA, p.VALOR_ULT_COMPRA, p.PROD_PRCOMPRA
        ORDER BY CATEGORIA_NOME ASC, QTD_VENDIDA DESC
      `;

      const results = await queryDigifarma(sql, [startDateTime, endDateTime]);

      if (!results || results.length === 0) {
        return res.json({
          period: { startDate: start, endDate: end },
          totalItens: 0,
          totalQtdGeral: 0,
          categorias: []
        });
      }

      // Busca dados de último fornecedor e preço de custo no cache SQLite
      const productIds = results.map(r => r.PRODUTO_ID).filter(Boolean);
      const cacheMap = new Map();

      if (db && productIds.length > 0) {
        try {
          const chunkSize = 500;
          for (let i = 0; i < productIds.length; i += chunkSize) {
            const chunk = productIds.slice(i, i + chunkSize);
            const placeholders = chunk.map(() => '?').join(',');
            const rows = db.prepare(`
              SELECT produto_id, ultima_compra_fornecedor, preco_unitario_ult_compra, custo_unitario, ultima_compra_valor, saldo
              FROM compras_estoque_cache
              WHERE produto_id IN (${placeholders})
            `).all(chunk);
            rows.forEach(r => cacheMap.set(r.produto_id, r));
          }
        } catch (errDb) {
          console.warn('[Finance] Erro ao buscar cache de fornecedor/custo:', errDb.message);
        }
      }

      // Agrupa por categoria
      const categoriaMap = new Map();
      let totalQtdGeral = 0;

      for (const r of results) {
        const catNome = (r.CATEGORIA_NOME || 'OUTROS').trim().toUpperCase() || 'OUTROS';
        const cached = cacheMap.get(r.PRODUTO_ID);

        const qtdVendida = parseFloat(r.QTD_VENDIDA) || 0;
        totalQtdGeral += qtdVendida;

        // Determina último fornecedor
        let ultimoFornecedor = cached?.ultima_compra_fornecedor ? String(cached.ultima_compra_fornecedor).trim() : null;
        if (!ultimoFornecedor || ultimoFornecedor === 'Cadastro Geral Digifarma') {
          ultimoFornecedor = 'Cadastro Geral / Não inf.';
        }

        // Determina último preço de custo
        let ultimoPreco = 0;
        if (cached && (cached.preco_unitario_ult_compra > 0 || cached.custo_unitario > 0 || cached.ultima_compra_valor > 0)) {
          ultimoPreco = cached.preco_unitario_ult_compra || cached.custo_unitario || cached.ultima_compra_valor;
        } else if (r.ULTIMO_PRECO_DIGIFARMA) {
          ultimoPreco = parseFloat(r.ULTIMO_PRECO_DIGIFARMA) || 0;
        }

        // Determina saldo em estoque
        let saldo = 0;
        if (r.PROD_SALDO !== null && r.PROD_SALDO !== undefined) {
          saldo = parseFloat(r.PROD_SALDO) || 0;
        } else if (cached?.saldo !== undefined && cached?.saldo !== null) {
          saldo = parseFloat(cached.saldo) || 0;
        }

        const item = {
          produtoId: r.PRODUTO_ID,
          produto: (r.PRODUTO || '').trim(),
          apresentacao: (r.APRESENTACAO || '').trim(),
          codBarras: (r.COD_BARRAS || '').trim(),
          saldo: saldo,
          qtdVendida: qtdVendida,
          ultimoFornecedor: ultimoFornecedor,
          ultimoPreco: ultimoPreco
        };

        if (!categoriaMap.has(catNome)) {
          categoriaMap.set(catNome, {
            categoria: catNome,
            totalProdutos: 0,
            totalQtd: 0,
            produtos: []
          });
        }

        const catObj = categoriaMap.get(catNome);
        catObj.totalProdutos += 1;
        catObj.totalQtd += qtdVendida;
        catObj.produtos.push(item);
      }

      // Converte para array ordenado
      const categoriasArray = Array.from(categoriaMap.values()).map(cat => ({
        ...cat,
        totalQtd: Math.round(cat.totalQtd * 100) / 100,
        produtos: cat.produtos.sort((a, b) => b.qtdVendida - a.qtdVendida)
      }));

      // Ordena as categorias por total de quantidade vendida DESC
      categoriasArray.sort((a, b) => b.totalQtd - a.totalQtd);

      return res.json({
        period: { startDate: start, endDate: end },
        totalItens: results.length,
        totalQtdGeral: Math.round(totalQtdGeral * 100) / 100,
        categorias: categoriasArray
      });
    } catch (err) {
      const mockSoldReport = {
        period: { startDate: req.query.startDate || '', endDate: req.query.endDate || '' },
        totalItens: 3,
        totalQtdGeral: 45,
        categorias: [
          {
            categoria: 'GENERICOS',
            totalProdutos: 2,
            totalQtd: 35,
            produtos: [
              { produtoId: 101, produto: 'DIPIRONA SODICA 500MG/ML', apresentacao: 'GTS 20ML', codBarras: '7891234567890', qtdVendida: 25, ultimoFornecedor: 'PROFARMA DIST.', ultimoPreco: 2.85 },
              { produtoId: 102, produto: 'PARACETAMOL 750MG', apresentacao: 'CX 20 COMP', codBarras: '7891234567891', qtdVendida: 10, ultimoFornecedor: 'PANPHARMA', ultimoPreco: 4.20 }
            ]
          },
          {
            categoria: 'PERFUMARIA',
            totalProdutos: 1,
            totalQtd: 10,
            produtos: [
              { produtoId: 201, produto: 'FRALDA PAMPERS CONFORT SEC G', apresentacao: 'PCT 32 UN', codBarras: '7891234567892', qtdVendida: 10, ultimoFornecedor: 'COFARMA', ultimoPreco: 45.90 }
            ]
          }
        ]
      };
      return handleDigifarmaError(err, res, '/sold-products-report', mockSoldReport);
    }
  });

  // Rota para obter o ranking dos 3 produtos mais vendidos e a classificação Curva ABC
  router.get('/top-products', async (req, res) => {
    try {
      const { period } = req.query;
      const now = new Date();
      let startDateTime;
      const pad = (num) => String(num).padStart(2, '0');
      
      const getBusinessDayStart = () => {
        const d = new Date(now);
        if (d.getHours() < 3) {
          d.setDate(d.getDate() - 1);
        }
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 03:00:00`;
      };

      if (period === 'month') {
        const d = new Date(now);
        startDateTime = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01 03:00:00`;
      } else if (period === 'semester') {
        const d = new Date(now);
        d.setDate(d.getDate() - 180);
        startDateTime = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 03:00:00`;
      } else {
        // dia atual (day)
        startDateTime = getBusinessDayStart();
      }

      const endDateTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

      // Query para buscar produtos vendidos no período ordenados por quantidade desc
      const sql = `
        SELECT 
          p.PRODUTO_ID,
          p.PRODUTO,
          p.APRESENTACAO,
          p.COD_BARRAS,
          SUM(iv.ITEMVEND_QUANT) as QTD_VENDIDA,
          SUM(iv.ITEMVEND_PRVENDA * iv.ITEMVEND_QUANT) as TOTAL_VALOR
        FROM ITEM_VENDAS iv
        JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
        JOIN PRODUTOS p ON iv.PRODUTO_ID = p.PRODUTO_ID
        WHERE v.CANCELADO <> 'S'
          AND v.VENDA_DATA_HORA BETWEEN ? AND ?
        GROUP BY p.PRODUTO_ID, p.PRODUTO, p.APRESENTACAO, p.COD_BARRAS
        ORDER BY QTD_VENDIDA DESC
      `;

      const results = await queryDigifarma(sql, [startDateTime, endDateTime]);
      
      if (!results || results.length === 0) {
        return res.json({ topProducts: [], abcCurve: [] });
      }

      const products = results.map(r => ({
        id: r.PRODUTO_ID,
        name: (r.PRODUTO || '').trim(),
        presentation: (r.APRESENTACAO || '').trim(),
        barcode: (r.COD_BARRAS || '').trim(),
        quantidade: r.QTD_VENDIDA || 0,
        totalValor: r.TOTAL_VALOR || 0,
        imageUrl: null
      }));

      // Busca imagens em lote no SQLite usando IN
      if (db) {
        try {
          const barcodes = products.map(p => p.barcode).filter(Boolean);
          if (barcodes.length > 0) {
            const placeholders = barcodes.map(() => '?').join(',');
            const photos = db.prepare(`SELECT ean, image_url FROM scraped_images WHERE ean IN (${placeholders})`).all(barcodes);
            const photoMap = new Map(photos.map(p => [p.ean, p.image_url]));
            
            products.forEach(p => {
              if (p.barcode && photoMap.has(p.barcode)) {
                p.imageUrl = photoMap.get(p.barcode);
              }
            });
          }
        } catch (dbErr) {
          console.error('[Top Products] Erro ao buscar fotos em lote no SQLite:', dbErr.message);
        }
      }

      // Ranking Top 3 (ordenado por quantidade)
      const topProducts = [...products].sort((a, b) => b.quantidade - a.quantidade).slice(0, 3);

      // Curva ABC (ordenado por faturamento total)
      const sortedByValue = [...products].sort((a, b) => b.totalValor - a.totalValor);
      const totalRevenue = sortedByValue.reduce((sum, p) => sum + p.totalValor, 0);

      let cumulativeValue = 0;
      const abcCurve = sortedByValue.map(p => {
        cumulativeValue += p.totalValor;
        const percentage = totalRevenue > 0 ? (cumulativeValue / totalRevenue) * 100 : 0;
        
        let curve = 'C';
        if (percentage <= 80) {
          curve = 'A';
        } else if (percentage <= 95) {
          curve = 'B';
        }
        
        return {
          ...p,
          cumulativePercentage: parseFloat(percentage.toFixed(2)),
          curve
        };
      });

      res.json({ topProducts, abcCurve });

    } catch (err) {
      // Fallback para mock se o Digifarma estiver offline
      const mockTopProducts = [
        { id: 99991, name: 'DORFLEX COMPRIMIDOS', presentation: '36 COMPRIMIDOS', barcode: '7896070601362', quantidade: 42, totalValor: 630.00, imageUrl: null },
        { id: 99992, name: 'NEOSALDINA DRAGEAS', presentation: '30 DRAGEAS', barcode: '7896094200152', quantidade: 35, totalValor: 875.00, imageUrl: null },
        { id: 99993, name: 'LOSARTANA POTASSICA 50MG', presentation: '30 COMPRIMIDOS', barcode: '7896004732100', quantidade: 28, totalValor: 140.00, imageUrl: null }
      ];

      // Tenta carregar fotos reais de scraped_images para os mocks em dev
      if (db) {
        try {
          const barcodes = mockTopProducts.map(p => p.barcode);
          const photos = db.prepare('SELECT ean, image_url FROM scraped_images WHERE ean IN (?,?,?)').all(barcodes);
          const photoMap = new Map(photos.map(p => [p.ean, p.image_url]));
          mockTopProducts.forEach(p => {
            if (photoMap.has(p.barcode)) p.imageUrl = photoMap.get(p.barcode);
          });
        } catch (e) {}
      }

      const mockAbcCurve = [
        { id: 99992, name: 'NEOSALDINA DRAGEAS', presentation: '30 DRAGEAS', barcode: '7896094200152', quantidade: 35, totalValor: 875.00, cumulativePercentage: 45.0, curve: 'A' },
        { id: 99991, name: 'DORFLEX COMPRIMIDOS', presentation: '36 COMPRIMIDOS', barcode: '7896070601362', quantidade: 42, totalValor: 630.00, cumulativePercentage: 77.0, curve: 'A' },
        { id: 99994, name: 'IBUPROFENO 600MG', presentation: '20 COMPRIMIDOS', barcode: '7896004732333', quantidade: 15, totalValor: 210.00, cumulativePercentage: 88.0, curve: 'B' },
        { id: 99993, name: 'LOSARTANA POTASSICA 50MG', presentation: '30 COMPRIMIDOS', barcode: '7896004732100', quantidade: 28, totalValor: 140.00, cumulativePercentage: 95.0, curve: 'B' },
        { id: 99995, name: 'PARACETAMOL 750MG', presentation: '20 COMPRIMIDOS', barcode: '7896004732444', quantidade: 18, totalValor: 90.00, cumulativePercentage: 99.6, curve: 'C' },
        { id: 99996, name: 'ALCOOL EM GEL 70%', presentation: '500ML', barcode: '7896004732555', quantidade: 1, totalValor: 8.00, cumulativePercentage: 100.0, curve: 'C' }
      ];

      return handleDigifarmaError(err, res, '/top-products', { topProducts: mockTopProducts, abcCurve: mockAbcCurve });
    }
  });

  /**
   * GET /api/finance-agent/provisions/sales-mix
   * GET /api/provisions/sales-mix
   * Calcula as provisões diárias e mensais ponderadas pelo mix real de itens vendidos,
   * EXCLUINDO vendas realizadas em Crediário (TIPO_PAGAMENTO_ID = 5).
   *
   * Query params:
   *  - date: 'YYYY-MM-DD' (dia específico)
   *  - month: 0-11 (mês)
   *  - year: YYYY (ano)
   */
  const handleProvisionsSalesMix = async (req, res) => {
    try {
      const { date, month, year } = req.query;
      let startDateTime, endDateTime;

      if (date) {
        const cleanDate = String(date).slice(0, 10);
        startDateTime = `${cleanDate} 00:00:00`;
        endDateTime = `${cleanDate} 23:59:59`;
      } else {
        const targetYear = parseInt(year) || new Date().getFullYear();
        const targetMonth = month !== undefined ? parseInt(month) : new Date().getMonth();
        const firstDay = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-01 00:00:00`;
        const lastDayNum = new Date(targetYear, targetMonth + 1, 0).getDate();
        const lastDay = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')} 23:59:59`;
        startDateTime = firstDay;
        endDateTime = lastDay;
      }

      // 1. Consulta produtos customizados na tabela SQLite
      const customMap = new Map();
      if (db) {
        try {
          const customRows = db.prepare('SELECT * FROM product_pricing_customizations').all();
          customRows.forEach(c => customMap.set(c.produto_id, c));
        } catch (dbErr) {
          console.warn('[Sales Mix Provisions] Erro ao ler customizações:', dbErr.message);
        }
      }

      // 2. Consulta itens vendidos no Digifarma com preço de venda e promocional
      const sql = `
        SELECT 
          CAST(v.VENDA_DATA_HORA AS DATE) as DATA_VENDA,
          iv.PRODUTO_ID,
          p.PRODUTO as NOME_PRODUTO,
          p.PROD_PRVENDA,
          p.PROD_PRPROMOCAO,
          iv.ITEMVEND_PRVENDA,
          SUM(iv.ITEMVEND_QUANT) as QTD_VENDIDA,
          SUM(iv.ITEMVEND_PRVENDA * iv.ITEMVEND_QUANT) as TOTAL_VALOR
        FROM ITEM_VENDAS iv
        JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
        JOIN PRODUTOS p ON iv.PRODUTO_ID = p.PRODUTO_ID
        WHERE (v.CANCELADO IS NULL OR v.CANCELADO <> 'S')
          AND v.VENDA_DATA_HORA BETWEEN ? AND ?
          AND NOT EXISTS (
            SELECT 1 FROM CAB_VENDAS_FPAGTOS fp
            WHERE fp.VENDA_NOTA_ID = v.VENDA_NOTA_ID
              AND fp.TIPO_PAGAMENTO_ID = 5
          )
        GROUP BY 1, 2, 3, 4, 5, 6
      `;

      let rows = [];
      try {
        rows = await queryDigifarma(sql, [startDateTime, endDateTime]);
      } catch (errQ) {
        console.error('[Sales Mix Provisions] Erro na query Firebird:', errQ.message);
        return res.status(500).json({ error: 'Erro ao consultar vendas no Digifarma: ' + errQ.message });
      }

      // 2.1 Consulta itens de Crediário quitados no Digifarma (ARQUIVO_MORTO) com preços de referência
      const sqlAM = `
        SELECT 
          CAST(am.ARQ_DATAPAG AS DATE) as DATA_PAGAMENTO,
          am.CONTREC_ID,
          am.PRODUTO_ID,
          p.PRODUTO as NOME_PRODUTO,
          p.PROD_PRVENDA,
          p.PROD_PRPROMOCAO,
          am.ARQ_QUANTIDADE as QTD,
          am.ARQ_VALORPAG as VALOR_PAGO,
          c.CLIENTE as NOME_CLIENTE
        FROM ARQUIVO_MORTO am
        LEFT JOIN PRODUTOS p ON am.PRODUTO_ID = p.PRODUTO_ID
        LEFT JOIN CLIENTES c ON am.CLIENTE_ID = c.CLIENTE_ID
        WHERE am.ARQ_DATAPAG BETWEEN ? AND ?
        ORDER BY am.ARQ_DATAPAG ASC
      `;

      // 2.2 Consulta recibos de quitação (CONTAS_RECEBIDAS) para rastrear clientes e valores pagos
      const sqlCrediario = `
        SELECT 
          CAST(cr.CONTREC_DATAPAG AS DATE) as DATA_PAGAMENTO,
          cr.CONTREC_ID,
          cr.CLIENTE_ID,
          c.CLIENTE as NOME_CLIENTE,
          COALESCE(cr.CONTREC_VALORPAG, 0) as VALOR_PAGO
        FROM CONTAS_RECEBIDAS cr
        LEFT JOIN CLIENTES c ON cr.CLIENTE_ID = c.CLIENTE_ID
        WHERE cr.CONTREC_DATAPAG BETWEEN ? AND ?
        ORDER BY cr.CONTREC_DATAPAG ASC
      `;

      // 2.3 Consulta regras de DESCONTO ESCALONADO (promoções por quantidade / atacado, ex: leve 3 por R$ 5 cada)
      const sqlEscalonado = `
        SELECT PRODUTO_ID, QUANTIDADE, VALOR_PACOTE
        FROM DESCONTO_ESCALONADO
        ORDER BY PRODUTO_ID, QUANTIDADE DESC
      `;

      let amRows = [];
      let crediarioRows = [];
      let escalonadoRows = [];
      try {
        [amRows, crediarioRows, escalonadoRows] = await Promise.all([
          queryDigifarma(sqlAM, [startDateTime, endDateTime]),
          queryDigifarma(sqlCrediario, [startDateTime, endDateTime]),
          queryDigifarma(sqlEscalonado)
        ]);
      } catch (errCred) {
        console.warn('[Sales Mix Provisions] Aviso: Erro ao consultar tabelas auxiliares no Digifarma:', errCred.message);
      }

      // Mapeia regras de desconto escalonado por PRODUTO_ID
      const escalonadoMap = new Map();
      if (escalonadoRows && escalonadoRows.length > 0) {
        for (const esc of escalonadoRows) {
          const pId = esc.PRODUTO_ID;
          if (!escalonadoMap.has(pId)) {
            escalonadoMap.set(pId, []);
          }
          const q = parseFloat(esc.QUANTIDADE || 0);
          const vPacote = parseFloat(esc.VALOR_PACOTE || 0);
          if (q > 0 && vPacote > 0) {
            escalonadoMap.get(pId).push({
              quantidade: q,
              valorPacote: vPacote,
              precoUnitario: vPacote / q
            });
          }
        }
        for (const tiers of escalonadoMap.values()) {
          tiers.sort((a, b) => b.quantidade - a.quantidade);
        }
      }

      // 3. Processa e consolida por data
      const dailyMap = {};
      let monthSales = 0;
      let monthProlabore = 0;
      let monthSocio1 = 0;
      let monthSocio2 = 0;
      let monthLucro = 0;
      let monthImpostos = 0;
      let totalCustomItemsCount = 0;
      let monthCrediarioReceived = 0;
      let monthTotalDiscounts = 0;

      for (const r of rows) {
        const dObj = new Date(r.DATA_VENDA);
        const y = dObj.getFullYear();
        const m = String(dObj.getMonth() + 1).padStart(2, '0');
        const d = String(dObj.getDate()).padStart(2, '0');
        const dateKey = `${y}-${m}-${d}`;

        if (!dailyMap[dateKey]) {
          dailyMap[dateKey] = {
            date: dateKey,
            sales: 0,
            prolabore: 0,
            socio1: 0,
            socio2: 0,
            lucro: 0,
            impostos: 0,
            customCount: 0,
            totalItems: 0,
            totalDiscounts: 0,
            customItems: [],
            crediarioReceived: 0,
            crediarioPayments: []
          };
        }

        const salesVal = parseFloat(r.TOTAL_VALOR || 0);
        const qtd = parseFloat(r.QTD_VENDIDA || 0);
        dailyMap[dateKey].sales += salesVal;
        dailyMap[dateKey].totalItems += qtd;

        monthSales += salesVal;

        const cust = customMap.get(r.PRODUTO_ID);
        
        // Determina preço de referência (promocional ativo ou venda normal)
        let refPrice = parseFloat(r.PROD_PRVENDA || 0);
        if (r.PROD_PRPROMOCAO > 0 && r.PROD_PRPROMOCAO < refPrice) {
          refPrice = parseFloat(r.PROD_PRPROMOCAO);
        }
        if (cust && cust.preco_venda && cust.preco_venda < refPrice) {
          refPrice = cust.preco_venda;
        }

        // Se a quantidade vendida atingir regra de DESCONTO ESCALONADO oficial (ex: leve 3 por R$ 15 = R$ 5 cada),
        // o preço de referência é o valor da promoção escalonada, evitando tratar como desconto indevido de balcão
        const escTiers = escalonadoMap.get(r.PRODUTO_ID);
        if (escTiers && escTiers.length > 0) {
          const matchedTier = escTiers.find(t => qtd >= t.quantidade);
          if (matchedTier && matchedTier.precoUnitario < refPrice) {
            refPrice = matchedTier.precoUnitario;
          }
        }

        const unitDiscount = Math.max(0, refPrice - parseFloat(r.ITEMVEND_PRVENDA || 0));
        const totalDiscount = unitDiscount * qtd;

        let pPct = 16.0;
        let s1Pct = 8.0;
        let s2Pct = 8.0;
        let lPct = 2.5;
        let iPct = 4.0;

        if (cust) {
          pPct = cust.pro_labore_total_pct || 16.0;
          s1Pct = cust.pro_labore_1_pct || (pPct / 2);
          s2Pct = cust.pro_labore_2_pct || (pPct / 2);
          lPct = cust.margem_liquida_pct !== undefined ? cust.margem_liquida_pct : 2.5;
          iPct = cust.imposto_pct || 4.0;
        } else if (refPrice > 0 && db) {
          try {
            const cacheRow = db.prepare('SELECT custo_unitario, ultima_compra_valor, categoria_id, ean FROM compras_estoque_cache WHERE produto_id = ?').get(r.PRODUTO_ID);
            const cmvCalc = cacheRow ? (cacheRow.custo_unitario || cacheRow.ultima_compra_valor || 0) : 0;
            const catIdCalc = cacheRow ? (cacheRow.categoria_id || 0) : 0;
            const perc = calcularPorcentagensProduto(refPrice, cmvCalc, catIdCalc);
            pPct = perc.proLaboreTotalPct;
            s1Pct = perc.proLabore1Pct;
            s2Pct = perc.proLabore2Pct;
            lPct = perc.margemLiquidaPct;
            iPct = perc.impostoPct;

            customMap.set(r.PRODUTO_ID, {
              produto_id: r.PRODUTO_ID,
              descricao: r.NOME_PRODUTO,
              cod_barras: cacheRow?.ean || '',
              cmv: cmvCalc,
              imposto_pct: iPct,
              taxa_cartao_pct: perc.taxaCartaoPct,
              custos_variaveis_pct: perc.custosVarPct,
              custo_fixo_pct: perc.custoFixoPct,
              pro_labore_1_pct: s1Pct,
              pro_labore_2_pct: s2Pct,
              pro_labore_total_pct: pPct,
              margem_liquida_pct: lPct,
              preco_venda: refPrice,
              markup_divisor: perc.markupDivisor,
              markup_multiplicador: perc.markupMultiplicador
            });
          } catch (eCalc) {}
        }

        const iVal = salesVal * (iPct / 100);
        let lVal = salesVal * (lPct / 100);
        let pVal = salesVal * (pPct / 100);

        // REGRA DE DESCONTO:
        // Descontar do lucro livre. Se o desconto for superior ao lucro líquido, descontar o restante do pró-labore.
        if (totalDiscount > 0) {
          dailyMap[dateKey].totalDiscounts = parseFloat(((dailyMap[dateKey].totalDiscounts || 0) + totalDiscount).toFixed(2));
          monthTotalDiscounts += totalDiscount;

          if (totalDiscount <= lVal) {
            lVal -= totalDiscount;
          } else {
            const sobraDesconto = totalDiscount - lVal;
            lVal = 0;
            pVal = Math.max(0, pVal - sobraDesconto);
          }
        }

        const s1Ratio = pPct > 0 ? (s1Pct / pPct) : 0.5;
        const s2Ratio = pPct > 0 ? (s2Pct / pPct) : 0.5;
        const s1Val = pVal * s1Ratio;
        const s2Val = pVal * s2Ratio;

        dailyMap[dateKey].prolabore += pVal;
        dailyMap[dateKey].socio1 += s1Val;
        dailyMap[dateKey].socio2 += s2Val;
        dailyMap[dateKey].lucro += lVal;
        dailyMap[dateKey].impostos += iVal;

        if (cust) {
          dailyMap[dateKey].customCount++;
          dailyMap[dateKey].customItems.push({
            produtoId: r.PRODUTO_ID,
            descricao: (r.NOME_PRODUTO || cust.descricao || '').trim(),
            vendas: salesVal,
            qtd,
            prolaborePct: pPct,
            prolaboreValor: pVal,
            descontoAplicado: totalDiscount
          });
          totalCustomItemsCount++;
        }

        monthProlabore += pVal;
        monthSocio1 += s1Val;
        monthSocio2 += s2Val;
        monthLucro += lVal;
        monthImpostos += iVal;
      }

      // 4. Processa itens de Crediário pagos (item a item de acordo com a porcentagem gravada ou padrão e absorção de desconto)
      const processedContrecIds = new Set();
      if (amRows && amRows.length > 0) {
        for (const item of amRows) {
          const valPago = parseFloat(item.VALOR_PAGO || 0);
          const qtd = parseFloat(item.QTD || 1);
          if (valPago <= 0) continue;

          let dateKey;
          if (item.DATA_PAGAMENTO instanceof Date) {
            dateKey = item.DATA_PAGAMENTO.toISOString().slice(0, 10);
          } else if (typeof item.DATA_PAGAMENTO === 'string') {
            dateKey = item.DATA_PAGAMENTO.slice(0, 10);
          } else {
            continue;
          }

          if (!dailyMap[dateKey]) {
            dailyMap[dateKey] = {
              date: dateKey,
              sales: 0,
              prolabore: 0,
              socio1: 0,
              socio2: 0,
              lucro: 0,
              impostos: 0,
              customCount: 0,
              totalItems: 0,
              totalDiscounts: 0,
              customItems: [],
              crediarioReceived: 0,
              crediarioPayments: []
            };
          }

          dailyMap[dateKey].sales += valPago;
          dailyMap[dateKey].totalItems += qtd;
          dailyMap[dateKey].crediarioReceived = parseFloat(((dailyMap[dateKey].crediarioReceived || 0) + valPago).toFixed(2));
          monthSales += valPago;
          monthCrediarioReceived += valPago;

          if (item.CONTREC_ID) {
            processedContrecIds.add(item.CONTREC_ID);
          }

          const cust = customMap.get(item.PRODUTO_ID);
          
          let refPrice = parseFloat(item.PROD_PRVENDA || 0);
          if (item.PROD_PRPROMOCAO > 0 && item.PROD_PRPROMOCAO < refPrice) {
            refPrice = parseFloat(item.PROD_PRPROMOCAO);
          }
          if (cust && cust.preco_venda && cust.preco_venda < refPrice) {
            refPrice = cust.preco_venda;
          }

          // Se a quantidade vendida atingir regra de DESCONTO ESCALONADO oficial
          const escTiers = escalonadoMap.get(item.PRODUTO_ID);
          if (escTiers && escTiers.length > 0) {
            const matchedTier = escTiers.find(t => qtd >= t.quantidade);
            if (matchedTier && matchedTier.precoUnitario < refPrice) {
              refPrice = matchedTier.precoUnitario;
            }
          }

          const unitPrice = qtd > 0 ? (valPago / qtd) : valPago;
          const unitDiscount = Math.max(0, refPrice - unitPrice);
          const totalDiscount = unitDiscount * qtd;

          let pPct = 16.0;
          let s1Pct = 8.0;
          let s2Pct = 8.0;
          let lPct = 2.5;
          let iPct = 4.0;

          if (cust) {
            pPct = cust.pro_labore_total_pct || 16.0;
            s1Pct = cust.pro_labore_1_pct || (pPct / 2);
            s2Pct = cust.pro_labore_2_pct || (pPct / 2);
            lPct = cust.margem_liquida_pct !== undefined ? cust.margem_liquida_pct : 2.5;
            iPct = cust.imposto_pct || 4.0;
          } else if (refPrice > 0 && db) {
            try {
              const cacheRow = db.prepare('SELECT custo_unitario, ultima_compra_valor, categoria_id, ean FROM compras_estoque_cache WHERE produto_id = ?').get(am.PRODUTO_ID);
              const cmvCalc = cacheRow ? (cacheRow.custo_unitario || cacheRow.ultima_compra_valor || 0) : 0;
              const catIdCalc = cacheRow ? (cacheRow.categoria_id || 0) : 0;
              const perc = calcularPorcentagensProduto(refPrice, cmvCalc, catIdCalc);
              pPct = perc.proLaboreTotalPct;
              s1Pct = perc.proLabore1Pct;
              s2Pct = perc.proLabore2Pct;
              lPct = perc.margemLiquidaPct;
              iPct = perc.impostoPct;

              customMap.set(am.PRODUTO_ID, {
                produto_id: am.PRODUTO_ID,
                descricao: r?.NOME_PRODUTO || '',
                cod_barras: cacheRow?.ean || '',
                cmv: cmvCalc,
                imposto_pct: iPct,
                taxa_cartao_pct: perc.taxaCartaoPct,
                custos_variaveis_pct: perc.custosVarPct,
                custo_fixo_pct: perc.custoFixoPct,
                pro_labore_1_pct: s1Pct,
                pro_labore_2_pct: s2Pct,
                pro_labore_total_pct: pPct,
                margem_liquida_pct: lPct,
                preco_venda: refPrice,
                markup_divisor: perc.markupDivisor,
                markup_multiplicador: perc.markupMultiplicador
              });
            } catch (eCalc) {}
          }

          const iVal = valPago * (iPct / 100);
          let lVal = valPago * (lPct / 100);
          let pVal = valPago * (pPct / 100);

          // REGRA DE DESCONTO:
          if (totalDiscount > 0) {
            dailyMap[dateKey].totalDiscounts = parseFloat(((dailyMap[dateKey].totalDiscounts || 0) + totalDiscount).toFixed(2));
            monthTotalDiscounts += totalDiscount;

            if (totalDiscount <= lVal) {
              lVal -= totalDiscount;
            } else {
              const sobraDesconto = totalDiscount - lVal;
              lVal = 0;
              pVal = Math.max(0, pVal - sobraDesconto);
            }
          }

          const s1Ratio = pPct > 0 ? (s1Pct / pPct) : 0.5;
          const s2Ratio = pPct > 0 ? (s2Pct / pPct) : 0.5;
          const s1Val = pVal * s1Ratio;
          const s2Val = pVal * s2Ratio;

          dailyMap[dateKey].prolabore += pVal;
          dailyMap[dateKey].socio1 += s1Val;
          dailyMap[dateKey].socio2 += s2Val;
          dailyMap[dateKey].lucro += lVal;
          dailyMap[dateKey].impostos += iVal;

          if (cust) {
            dailyMap[dateKey].customCount++;
            dailyMap[dateKey].customItems.push({
              produtoId: item.PRODUTO_ID,
              descricao: (item.NOME_PRODUTO || cust.descricao || 'Item Crediário').trim(),
              vendas: valPago,
              qtd,
              prolaborePct: pPct,
              prolaboreValor: pVal,
              isCrediario: true,
              descontoAplicado: totalDiscount
            });
            totalCustomItemsCount++;
          }

          monthProlabore += pVal;
          monthSocio1 += s1Val;
          monthSocio2 += s2Val;
          monthLucro += lVal;
          monthImpostos += iVal;
        }
      }

      // Adiciona o resumo dos pagamentos dos clientes por data
      for (const cr of crediarioRows) {
        let dateKey;
        if (cr.DATA_PAGAMENTO instanceof Date) {
          dateKey = cr.DATA_PAGAMENTO.toISOString().slice(0, 10);
        } else if (typeof cr.DATA_PAGAMENTO === 'string') {
          dateKey = cr.DATA_PAGAMENTO.slice(0, 10);
        } else {
          continue;
        }

        if (dailyMap[dateKey]) {
          if (!dailyMap[dateKey].crediarioPayments) dailyMap[dateKey].crediarioPayments = [];
          dailyMap[dateKey].crediarioPayments.push({
            id: cr.CONTREC_ID,
            cliente: (cr.NOME_CLIENTE || 'Cliente Crediário').trim(),
            valor: parseFloat(cr.VALOR_PAGO || 0)
          });
        }

        // Se o CONTREC_ID não tiver itens no ARQUIVO_MORTO (ex: pagamento avulso residual)
        if (!processedContrecIds.has(cr.CONTREC_ID)) {
          const valPago = parseFloat(cr.VALOR_PAGO || 0);
          if (valPago > 0) {
            if (!dailyMap[dateKey]) {
              dailyMap[dateKey] = {
                date: dateKey,
                sales: 0,
                prolabore: 0,
                socio1: 0,
                socio2: 0,
                lucro: 0,
                impostos: 0,
                customCount: 0,
                totalItems: 0,
                customItems: [],
                crediarioReceived: 0,
                crediarioPayments: []
              };
            }
            const pVal = valPago * 0.12;
            const s1Val = valPago * 0.06;
            const s2Val = valPago * 0.06;
            const lVal = valPago * 0.01;
            const iVal = valPago * 0.04;

            dailyMap[dateKey].sales += valPago;
            dailyMap[dateKey].prolabore += pVal;
            dailyMap[dateKey].socio1 += s1Val;
            dailyMap[dateKey].socio2 += s2Val;
            dailyMap[dateKey].lucro += lVal;
            dailyMap[dateKey].impostos += iVal;
            dailyMap[dateKey].crediarioReceived = parseFloat(((dailyMap[dateKey].crediarioReceived || 0) + valPago).toFixed(2));

            monthSales += valPago;
            monthProlabore += pVal;
            monthSocio1 += s1Val;
            monthSocio2 += s2Val;
            monthLucro += lVal;
            monthImpostos += iVal;
            monthCrediarioReceived += valPago;
          }
        }
      }

      // Calcula percentuais efetivos diários
      Object.keys(dailyMap).forEach(k => {
        const d = dailyMap[k];
        d.effectiveProlaborePct = d.sales > 0 ? parseFloat(((d.prolabore / d.sales) * 100).toFixed(2)) : 12;
        d.effectiveSocio1Pct = d.sales > 0 ? parseFloat(((d.socio1 / d.sales) * 100).toFixed(2)) : 6;
        d.effectiveSocio2Pct = d.sales > 0 ? parseFloat(((d.socio2 / d.sales) * 100).toFixed(2)) : 6;
        d.effectiveLucroPct = d.sales > 0 ? parseFloat(((d.lucro / d.sales) * 100).toFixed(2)) : 1;
        d.effectiveImpostosPct = d.sales > 0 ? parseFloat(((d.impostos / d.sales) * 100).toFixed(2)) : 4;
        d.prolabore = parseFloat(d.prolabore.toFixed(2));
        d.socio1 = parseFloat(d.socio1.toFixed(2));
        d.socio2 = parseFloat(d.socio2.toFixed(2));
        d.lucro = parseFloat(d.lucro.toFixed(2));
        d.impostos = parseFloat(d.impostos.toFixed(2));
        d.sales = parseFloat(d.sales.toFixed(2));
        d.crediarioReceived = parseFloat((d.crediarioReceived || 0).toFixed(2));
        d.totalDiscounts = parseFloat((d.totalDiscounts || 0).toFixed(2));
      });

      const monthSummary = {
        totalSales: parseFloat(monthSales.toFixed(2)),
        totalProlabore: parseFloat(monthProlabore.toFixed(2)),
        totalSocio1: parseFloat(monthSocio1.toFixed(2)),
        totalSocio2: parseFloat(monthSocio2.toFixed(2)),
        totalLucro: parseFloat(monthLucro.toFixed(2)),
        totalImpostos: parseFloat(monthImpostos.toFixed(2)),
        effectiveProlaborePct: monthSales > 0 ? parseFloat(((monthProlabore / monthSales) * 100).toFixed(2)) : 12,
        effectiveSocio1Pct: monthSales > 0 ? parseFloat(((monthSocio1 / monthSales) * 100).toFixed(2)) : 6,
        effectiveSocio2Pct: monthSales > 0 ? parseFloat(((monthSocio2 / monthSales) * 100).toFixed(2)) : 6,
        effectiveLucroPct: monthSales > 0 ? parseFloat(((monthLucro / monthSales) * 100).toFixed(2)) : 1,
        effectiveImpostosPct: monthSales > 0 ? parseFloat(((monthImpostos / monthSales) * 100).toFixed(2)) : 4,
        totalCustomItemsCount,
        totalCrediarioReceived: parseFloat(monthCrediarioReceived.toFixed(2)),
        totalDiscounts: parseFloat(monthTotalDiscounts.toFixed(2))
      };

      res.json({
        success: true,
        monthSummary,
        dailyBreakdown: dailyMap,
        totalDays: Object.keys(dailyMap).length
      });
    } catch (err) {
      console.error('[Sales Mix Provisions] Erro geral:', err);
      res.status(500).json({ error: err.message });
    }
  };

  router.get('/provisions/sales-mix', handleProvisionsSalesMix);
  router.get('/sales-mix', handleProvisionsSalesMix);

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
