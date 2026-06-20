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
      const nowMs = Date.now();
      if (liveClosingCache && (nowMs - liveClosingCacheTime < CACHE_TTL_MS)) {
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
