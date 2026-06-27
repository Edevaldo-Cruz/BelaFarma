/**
 * financial-health-endpoints.js
 * Módulo Consultor Financeiro — Bela Farma Sul
 */

const path = require('path');
const fs = require('fs');
const { callAI } = require('./services/ai.service');
const { queryDigifarma } = require('./services/digifarma.service');

const LAST_ANALYSIS_FILE = path.join(__dirname, 'last_financial_analysis.json');

module.exports = function (app, db) {

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/financial-health/snapshot
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/api/financial-health/snapshot', async (req, res) => {
    try {
      const days = parseInt(req.query.days) || 30;
      const snapshot = await buildSnapshot(db, days);
      res.json(snapshot);
    } catch (err) {
      console.error('[FinancialHealth] Erro no snapshot:', err);
      res.status(500).json({ error: `Erro ao buscar dados financeiros: ${err.message}` });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/financial-health/analyze
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/api/financial-health/analyze', async (req, res) => {
    try {
      const days = parseInt(req.body?.days) || 30;

      // 1. Agrega dados
      const snapshot = await buildSnapshot(db, days);

      // 2. Monta prompt
      const prompt = buildPrompt(snapshot, days);

      // 3. Chama IA (via ai.service.js)
      const rawText = await callAI(prompt, "Você é o Consultor Financeiro Sênior da Bela Farma Sul. Responda estritamente em JSON.", { temperature: 0.3 });

      // 4. Extrai JSON da resposta
      let analysis;
      try {
        let jsonText = rawText.trim();
        const startIndex = jsonText.indexOf('{');
        const endIndex = jsonText.lastIndexOf('}');
        
        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            jsonText = jsonText.substring(startIndex, endIndex + 1);
        }
        analysis = JSON.parse(jsonText);
      } catch {
        // Fallback: retorna texto raw
        analysis = { raw: rawText };
      }

      // Salva a última análise em disco
      try {
        fs.writeFileSync(LAST_ANALYSIS_FILE, JSON.stringify({ snapshot, analysis, timestamp: new Date() }), 'utf8');
      } catch (fileErr) {
        console.error('[FinancialHealth] Erro ao salvar análise no disco:', fileErr);
      }

      res.json({ snapshot, analysis });

    } catch (err) {
      console.error('[FinancialHealth] Erro inesperado:', err);
      res.status(500).json({ error: `Erro interno: ${err.message}` });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/financial-health/last-analysis
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/api/financial-health/last-analysis', (req, res) => {
    try {
      if (fs.existsSync(LAST_ANALYSIS_FILE)) {
        const data = fs.readFileSync(LAST_ANALYSIS_FILE, 'utf8');
        res.json(JSON.parse(data));
      } else {
        res.json(null);
      }
    } catch (err) {
      console.error('[FinancialHealth] Erro ao ler última análise:', err);
      res.status(500).json({ error: 'Erro ao ler última análise' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/financial-health/caixa-minimo
  // Calcula o Caixa Mínimo Operacional recomendado com base nas despesas reais
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/api/financial-health/caixa-minimo', async (req, res) => {
    try {
      const DIAS_COBERTURA = 15;
      const today = new Date().toISOString().split('T')[0];
      const currentMonth = new Date().toISOString().slice(0, 7);

      // 1. Despesas fixas do mês atual
      let despesasFixasMensais = 0;
      let listaContasFixas = [];
      try {
        const fixedPayments = db.prepare(`
          SELECT fixedAccountName, value, status, dueDate
          FROM fixed_account_payments WHERE month = ?
        `).all(currentMonth);
        despesasFixasMensais = fixedPayments.reduce((a, p) => a + (p.value || 0), 0);
        listaContasFixas = fixedPayments.map(p => ({ nome: p.fixedAccountName, valor: p.value, status: p.status }));
      } catch (e) { console.warn('[CaixaMinimo] fixed_account_payments:', e.message); }

      // 2. Boletos a vencer nos próximos 30 dias
      let boletosAVencer30 = 0;
      let listaBoletosVencendo = [];
      try {
        const dt30 = new Date(); dt30.setDate(dt30.getDate() + 30);
        const dt30Str = dt30.toISOString().split('T')[0];
        const boletos = db.prepare(`
          SELECT supplierName, due_date, value
          FROM boletos
          WHERE status = 'Pendente' AND due_date >= ? AND due_date <= ?
          ORDER BY due_date
        `).all(today, dt30Str);
        boletosAVencer30 = boletos.reduce((a, b) => a + (b.value || 0), 0);
        listaBoletosVencendo = boletos.map(b => ({ fornecedor: b.supplierName, vencimento: b.due_date, valor: b.value }));
      } catch (e) { console.warn('[CaixaMinimo] boletos:', e.message); }

      // 3. Média de compras dos últimos 3 meses
      let mediaComprasMensais = 0;
      try {
        const dt90 = new Date(); dt90.setDate(dt90.getDate() - 90);
        const orders = db.prepare(`
          SELECT totalValue FROM orders
          WHERE orderDate >= ? AND status != 'Cancelado'
        `).all(dt90.toISOString().split('T')[0]);
        const totalCompras90 = orders.reduce((a, o) => a + (o.totalValue || 0), 0);
        mediaComprasMensais = totalCompras90 / 3;
      } catch (e) { console.warn('[CaixaMinimo] orders:', e.message); }

      // 5. Saldo atual do cofre (safe_entries)
      let saldoCaixaAtual = 0;
      try {
        const entradas = db.prepare(`SELECT SUM(value) as total FROM safe_entries WHERE type = 'Entrada'`).get();
        const saidas   = db.prepare(`SELECT SUM(value) as total FROM safe_entries WHERE type = 'Saída'`).get();
        saldoCaixaAtual = (entradas?.total || 0) - (saidas?.total || 0);
      } catch (e) { console.warn('[CaixaMinimo] safe_entries:', e.message); }

      // Cálculo
      const totalBaseMensal = despesasFixasMensais + boletosAVencer30 + mediaComprasMensais;
      const caixaMinimo = (totalBaseMensal / 30) * DIAS_COBERTURA;
      const diferenca = saldoCaixaAtual - caixaMinimo;

      let situacao = 'Saudável';
      if (diferenca < 0) situacao = 'Crítico';
      else if (diferenca < caixaMinimo * 0.2) situacao = 'Atenção';

      res.json({
        caixaMinimo: Math.round(caixaMinimo * 100) / 100,
        situacao,
        saldoCaixaAtual: Math.round(saldoCaixaAtual * 100) / 100,
        diferenca: Math.round(diferenca * 100) / 100,
        diasCobertura: DIAS_COBERTURA,
        composicao: {
          despesasFixasMensais: Math.round(despesasFixasMensais * 100) / 100,
          boletosAVencer30dias: Math.round(boletosAVencer30 * 100) / 100,
          mediaComprasMensais: Math.round(mediaComprasMensais * 100) / 100,
          totalBaseMensal: Math.round(totalBaseMensal * 100) / 100,
        },
        detalhes: {
          contasFixas: listaContasFixas,
          boletosVencendo: listaBoletosVencendo,
        },
      });
    } catch (err) {
      console.error('[CaixaMinimo] Erro:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/financial-health/dre?month=2026-06
  // DRE (Demonstrativo de Resultados do Exercício) mensal consolidado
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/api/financial-health/dre', async (req, res) => {
    try {
      const month = req.query.month || new Date().toISOString().slice(0, 7);
      const [year, mon] = month.split('-');
      const startDate = `${month}-01`;
      const lastDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
      const endDate   = `${month}-${String(lastDay).padStart(2, '0')}`;

      // 1. Faturamento dos fechamentos de caixa
      let receitaBruta = 0;
      let breakdown = { credito: 0, debito: 0, pix: 0, dinheiro: 0, crediario: 0 };
      let diasComFechamento = 0;
      try {
        const closings = db.prepare(`
          SELECT totalSales, credit, debit, pix, totalInDrawer, totalCrediario, expenses
          FROM cash_closings WHERE date >= ? AND date <= ?
        `).all(startDate, endDate);
        diasComFechamento = closings.length;
        receitaBruta  = closings.reduce((a, c) => a + (c.totalSales || 0), 0);
        breakdown.credito   = closings.reduce((a, c) => a + (c.credit || 0), 0);
        breakdown.debito    = closings.reduce((a, c) => a + (c.debit || 0), 0);
        breakdown.pix       = closings.reduce((a, c) => a + (c.pix || 0), 0);
        breakdown.dinheiro  = closings.reduce((a, c) => a + (c.totalInDrawer || 0), 0);
        breakdown.crediario = closings.reduce((a, c) => a + (c.totalCrediario || 0), 0);
      } catch (e) { console.warn('[DRE] cash_closings:', e.message); }

      // 2. CMV Real do Digifarma
      let cmv = 0;
      let totalVendaDigifarma = 0;
      let usouCMVReal = false;
      try {
        const cmvResult = await queryDigifarma(`
          SELECT
            SUM(COALESCE(iv.ITEMVEND_CMV, iv.ITEMVEND_ULT_COMPRA, 0) * iv.ITEMVEND_QUANT) AS TOTAL_CMV,
            SUM(iv.ITEMVEND_PRVENDA * iv.ITEMVEND_QUANT) AS TOTAL_VENDA
          FROM ITEM_VENDAS iv
          JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
          WHERE v.CANCELADO <> 'S'
            AND CAST((v.VENDA_DATA_HORA - 0.125) AS DATE) >= ?
            AND CAST((v.VENDA_DATA_HORA - 0.125) AS DATE) <= ?
        `, [startDate, endDate]);
        if (cmvResult && cmvResult.length > 0) {
          cmv = cmvResult[0].TOTAL_CMV || 0;
          totalVendaDigifarma = cmvResult[0].TOTAL_VENDA || 0;
          usouCMVReal = true;
          if (totalVendaDigifarma > 0 && receitaBruta === 0) receitaBruta = totalVendaDigifarma;
        }
      } catch (e) { console.warn('[DRE] CMV Digifarma:', e.message); }

      // 3. Despesas fixas do mês
      let despesasFixas = 0;
      let listaFixas = [];
      try {
        const fixeds = db.prepare(`
          SELECT fixedAccountName, value, status FROM fixed_account_payments WHERE month = ?
        `).all(month);
        despesasFixas = fixeds.reduce((a, f) => a + (f.value || 0), 0);
        listaFixas = fixeds.map(f => ({ nome: f.fixedAccountName, valor: f.value, status: f.status }));
      } catch (e) { console.warn('[DRE] fixed_account_payments:', e.message); }

      // 4. Despesas operacionais (sangrias/daily_records)
      let despesasOperacionais = 0;
      try {
        const dailys = db.prepare(`
          SELECT expenses FROM cash_closings WHERE date >= ? AND date <= ?
        `).all(startDate, endDate);
        despesasOperacionais = dailys.reduce((a, d) => a + (d.expenses || 0), 0);
      } catch (e) { console.warn('[DRE] despesas operacionais:', e.message); }

      // 5. Boletos pagos no mês
      let boletosPagos = 0;
      let listaBoletos = [];
      try {
        const boletos = db.prepare(`
          SELECT supplierName, value FROM boletos
          WHERE status = 'Pago' AND due_date >= ? AND due_date <= ?
        `).all(startDate, endDate);
        boletosPagos = boletos.reduce((a, b) => a + (b.value || 0), 0);
        listaBoletos = boletos.map(b => ({ fornecedor: b.supplierName, valor: b.value }));
      } catch (e) { console.warn('[DRE] boletos pagos:', e.message); }

      // Cálculos DRE (Regime de Caixa)
      const receitaTotal = receitaBruta; // Vendas totais registradas no caixa
      const lucroBruto = receitaTotal - boletosPagos; // Sobra bruta após pagar fornecedores
      const margemBruta = receitaTotal > 0 ? (lucroBruto / receitaTotal) * 100 : 0;
      
      const despesasOperacionaisEFixas = despesasFixas + despesasOperacionais;
      const lucroLiquido = lucroBruto - despesasOperacionaisEFixas; // Resultado líquido do caixa
      const margemLiquida = receitaTotal > 0 ? (lucroLiquido / receitaTotal) * 100 : 0;
      const despesasTotal = despesasFixas + despesasOperacionais + boletosPagos;

      res.json({
        mes: month,
        periodo: { startDate, endDate, diasComFechamento },
        dre: {
          receitaBruta: Math.round(receitaTotal * 100) / 100,
          cmv: Math.round(cmv * 100) / 100,
          lucroBruto: Math.round(lucroBruto * 100) / 100,
          margemBruta: Math.round(margemBruta * 10) / 10,
          despesasFixas: Math.round(despesasFixas * 100) / 100,
          despesasOperacionais: Math.round(despesasOperacionais * 100) / 100,
          boletosPagos: Math.round(boletosPagos * 100) / 100,
          despesasTotal: Math.round(despesasTotal * 100) / 100,
          lucroLiquido: Math.round(lucroLiquido * 100) / 100,
          margemLiquida: Math.round(margemLiquida * 10) / 10,
        },
        breakdown,
        usouCMVReal,
        detalhes: {
          contasFixas: listaFixas,
          boletos: listaBoletos,
        },
      });
    } catch (err) {
      console.error('[DRE] Erro:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/financial-health/indicadores?days=30
  // Ticket Médio e Giro de Estoque
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/api/financial-health/indicadores', async (req, res) => {
    try {
      const days = parseInt(req.query.days) || 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().split('T')[0];

      // 1. Ticket Médio — Digifarma
      let ticketMedio = 0;
      let qtdVendas = 0;
      let totalVendas = 0;
      let evolucaoTicket = [];
      try {
        const ticketResult = await queryDigifarma(`
          SELECT
            SUM(v.TOTAL_VENDA) AS TOTAL,
            COUNT(DISTINCT v.VENDA_NOTA_ID) AS QTD
          FROM CAB_VENDAS v
          WHERE v.CANCELADO <> 'S'
            AND CAST((v.VENDA_DATA_HORA - 0.125) AS DATE) >= ?
        `, [cutoffStr]);
        if (ticketResult && ticketResult.length > 0) {
          totalVendas = ticketResult[0].TOTAL || 0;
          qtdVendas   = ticketResult[0].QTD || 0;
          ticketMedio = qtdVendas > 0 ? totalVendas / qtdVendas : 0;
        }

        // Evolução diária do ticket (últimos 14 dias para o gráfico)
        const dt14 = new Date(); dt14.setDate(dt14.getDate() - 14);
        const evolResult = await queryDigifarma(`
          SELECT
            CAST((v.VENDA_DATA_HORA - 0.125) AS DATE) AS DATA,
            SUM(v.TOTAL_VENDA) AS TOTAL,
            COUNT(DISTINCT v.VENDA_NOTA_ID) AS QTD
          FROM CAB_VENDAS v
          WHERE v.CANCELADO <> 'S'
            AND CAST((v.VENDA_DATA_HORA - 0.125) AS DATE) >= ?
          GROUP BY CAST((v.VENDA_DATA_HORA - 0.125) AS DATE)
          ORDER BY 1
        `, [dt14.toISOString().split('T')[0]]);
        evolucaoTicket = (evolResult || []).map(r => ({
          data: r.DATA,
          ticket: r.QTD > 0 ? Math.round((r.TOTAL / r.QTD) * 100) / 100 : 0,
          qtd: r.QTD,
          total: r.TOTAL,
        }));
      } catch (e) { console.warn('[Indicadores] Ticket Médio Digifarma:', e.message); }

      // Fallback: ticket dos fechamentos SQLite
      if (ticketMedio === 0) {
        try {
          const closings = db.prepare(`
            SELECT totalSales FROM cash_closings WHERE date >= ?
          `).all(cutoffStr);
          const totalFat = closings.reduce((a, c) => a + (c.totalSales || 0), 0);
          // sem qtd de vendas disponível no sqlite, estimar pelo período
          qtdVendas   = closings.length > 0 ? closings.length * 20 : 1; // estimativa
          totalVendas = totalFat;
          ticketMedio = totalFat / qtdVendas;
        } catch (e2) { console.warn('[Indicadores] Ticket fallback:', e2.message); }
      }

      // 2. Giro de Estoque
      // CMV do período (Digifarma)
      let cmvPeriodo = 0;
      try {
        const cmvResult = await queryDigifarma(`
          SELECT SUM(COALESCE(iv.ITEMVEND_CMV, iv.ITEMVEND_ULT_COMPRA, 0) * iv.ITEMVEND_QUANT) AS TOTAL_CMV
          FROM ITEM_VENDAS iv
          JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
          WHERE v.CANCELADO <> 'S'
            AND CAST((v.VENDA_DATA_HORA - 0.125) AS DATE) >= ?
        `, [cutoffStr]);
        if (cmvResult && cmvResult.length > 0) cmvPeriodo = cmvResult[0].TOTAL_CMV || 0;
      } catch (e) { console.warn('[Indicadores] CMV Giro:', e.message); }

      // Valor do estoque atual (SQLite stock_products)
      let valorEstoqueAtual = 0;
      let qtdProdutosEstoque = 0;
      try {
        const estoque = db.prepare(`
          SELECT SUM(cost_price * stock_qty) AS VALOR_TOTAL, COUNT(*) AS QTD
          FROM stock_products WHERE stock_qty > 0
        `).get();
        valorEstoqueAtual  = estoque?.VALOR_TOTAL || 0;
        qtdProdutosEstoque = estoque?.QTD || 0;
      } catch (e) { console.warn('[Indicadores] stock_products:', e.message); }

      // Giro = CMV_período / Valor_estoque × (30/days) para anualizar ao mês
      const giro = valorEstoqueAtual > 0 ? (cmvPeriodo / valorEstoqueAtual) : 0;
      const diasEstoque = cmvPeriodo > 0 ? Math.round((valorEstoqueAtual / (cmvPeriodo / days)) ) : 0;

      let interpretacaoGiro = '';
      if (giro === 0) interpretacaoGiro = 'Sem dados suficientes para calcular';
      else if (giro < 1)  interpretacaoGiro = `⚠️ Estoque girando ${giro.toFixed(1)}x — giro lento, dinheiro parado`;
      else if (giro < 3)  interpretacaoGiro = `🟡 Estoque girando ${giro.toFixed(1)}x — giro moderado`;
      else                interpretacaoGiro = `✅ Estoque girando ${giro.toFixed(1)}x — giro saudável`;

      res.json({
        periodo: { days, cutoffStr },
        ticketMedio: {
          valor: Math.round(ticketMedio * 100) / 100,
          qtdVendas,
          totalVendas: Math.round(totalVendas * 100) / 100,
          evolucao: evolucaoTicket,
        },
        giroEstoque: {
          giro: Math.round(giro * 100) / 100,
          interpretacao: interpretacaoGiro,
          cmvPeriodo: Math.round(cmvPeriodo * 100) / 100,
          valorEstoqueAtual: Math.round(valorEstoqueAtual * 100) / 100,
          qtdProdutosEstoque,
          diasEstoque,
        },
      });
    } catch (err) {
      console.error('[Indicadores] Erro:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/financial-health/balancete?month=2026-06
  // Balancete Patrimonial simplificado
  // Sem month = snapshot atual | Com month = histórico mensal
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/api/financial-health/balancete', async (req, res) => {
    try {
      const month = req.query.month; // undefined = snapshot atual
      const isSnapshot = !month;
      const today = new Date().toISOString().split('T')[0];

      let endDate = today;
      let startDate = null;
      if (month) {
        const [year, mon] = month.split('-');
        startDate = `${month}-01`;
        const lastDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
        endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
      }

      // ═══════════════════════════════════════════════════════════════════
      //  ATIVO
      // ═══════════════════════════════════════════════════════════════════

      // 1. Caixa (gaveta) — último fechamento
      let saldoCaixa = 0;
      let ultimoFechamento = null;
      try {
        const query = month
          ? `SELECT date, totalInDrawer, safeDeposit FROM cash_closings WHERE date >= ? AND date <= ? ORDER BY date DESC LIMIT 1`
          : `SELECT date, totalInDrawer, safeDeposit FROM cash_closings ORDER BY date DESC LIMIT 1`;
        const params = month ? [startDate, endDate] : [];
        const last = db.prepare(query).get(...params);
        if (last) {
          // O saldo do caixa é o que restou na gaveta após o depósito no cofre
          saldoCaixa = (last.totalInDrawer || 0) - (last.safeDeposit || 0);
          if (saldoCaixa < 0) saldoCaixa = 0;
          ultimoFechamento = last.date;
        }
      } catch (e) { console.warn('[Balancete] cash_closings:', e.message); }

      // 2. Cofre (safe_entries)
      let saldoCofre = 0;
      try {
        const query = month
          ? `SELECT 
               COALESCE(SUM(CASE WHEN type = 'Entrada' THEN value ELSE 0 END), 0) -
               COALESCE(SUM(CASE WHEN type = 'Saída' THEN value ELSE 0 END), 0) as saldo
             FROM safe_entries WHERE date <= ?`
          : `SELECT 
               COALESCE(SUM(CASE WHEN type = 'Entrada' THEN value ELSE 0 END), 0) -
               COALESCE(SUM(CASE WHEN type = 'Saída' THEN value ELSE 0 END), 0) as saldo
             FROM safe_entries`;
        const params = month ? [endDate] : [];
        const result = db.prepare(query).get(...params);
        saldoCofre = result?.saldo || 0;
      } catch (e) { console.warn('[Balancete] safe_entries:', e.message); }

      // 3. Estoque (Digifarma com fallback para SQLite stock_products)
      let valorEstoque = 0;
      let qtdProdutosEstoque = 0;
      let estoqueFonte = 'SQLite Local';

      try {
        const { queryDigifarma } = require('./services/digifarma.service');
        const estoqueDigi = await queryDigifarma(`
          SELECT 
            COALESCE(SUM(p.PROD_SALDO * COALESCE(p.PROD_PRCOMPRA, p.VALOR_ULT_COMPRA, 0)), 0) as VALOR_TOTAL,
            COUNT(*) as QTD
          FROM PRODUTOS p
          WHERE p.PROD_ATIVO = 'S' AND p.PROD_SALDO > 0
        `);
        if (estoqueDigi && estoqueDigi.length > 0 && (estoqueDigi[0].VALOR_TOTAL || estoqueDigi[0].valor_total) > 0) {
          valorEstoque = estoqueDigi[0].VALOR_TOTAL || estoqueDigi[0].valor_total || 0;
          qtdProdutosEstoque = estoqueDigi[0].QTD || estoqueDigi[0].qtd || 0;
          estoqueFonte = 'Digifarma (Real-time)';
        }
      } catch (e) {
        console.warn('[Balancete] Erro ao buscar estoque no Digifarma (usando fallback do SQLite):', e.message);
      }

      if (valorEstoque === 0) {
        try {
          const estoque = db.prepare(`
            SELECT COALESCE(SUM(cost_price * stock_qty), 0) AS valor_total, COUNT(*) AS qtd
            FROM stock_products WHERE stock_qty > 0 AND cost_price IS NOT NULL
          `).get();
          valorEstoque = estoque?.valor_total || 0;
          qtdProdutosEstoque = estoque?.qtd || 0;
        } catch (e) { console.warn('[Balancete] stock_products:', e.message); }
      }

      // 4. Crediário a receber — CRM local (customer_debts)
      let crediarioTotal = 0;
      let crediarioDetalhes = [];
      try {
        const debts = db.prepare(`
          SELECT cd.customerId, c.name as clientName, c.nickname,
                 SUM(cd.totalValue) as totalDevido, COUNT(*) as qtdCompras,
                 MIN(cd.purchaseDate) as compraAntiga
          FROM customer_debts cd
          LEFT JOIN customers c ON cd.customerId = c.id
          WHERE cd.status IN ('Pendente', 'Atrasado')
          GROUP BY cd.customerId
          ORDER BY totalDevido DESC
        `).all();
        crediarioTotal = debts.reduce((a, d) => a + (d.totalDevido || 0), 0);
        crediarioDetalhes = debts.map(d => ({
          cliente: d.clientName || d.nickname || 'Desconhecido',
          valor: d.totalDevido || 0,
          qtdCompras: d.qtdCompras || 0,
          compraAntiga: d.compraAntiga,
        }));
      } catch (e) { console.warn('[Balancete] customer_debts:', e.message); }

      // 4b. Crediário Digifarma (tentativa)
      let crediarioDigifarma = 0;
      let crediarioDigifarmaDetalhes = [];
      try {
        const { queryDigifarma } = require('./services/digifarma.service');
        const digiCrediario = await queryDigifarma(`
          SELECT
            cli.CLIENTE as clientName,
            SUM(c.FICHARIO_VALOR) as totalDevido,
            COUNT(*) as qtdCompras,
            MIN(c.FICHARIO_DATACOMPRA) as compraAntiga
          FROM FICHARIO c
          LEFT JOIN CLIENTES cli ON c.CLIENTE_ID = cli.CLIENTE_ID
          GROUP BY cli.CLIENTE
          ORDER BY 2 DESC
        `, []);
        if (digiCrediario && digiCrediario.length > 0) {
          crediarioDigifarma = digiCrediario.reduce((a, d) => a + (d.TOTALDEVIDO || d.totalDevido || 0), 0);
          crediarioDigifarmaDetalhes = digiCrediario.map(d => ({
            cliente: d.CLIENTNAME || d.clientName || 'Desconhecido',
            valor: d.TOTALDEVIDO || d.totalDevido || 0,
            qtdCompras: d.QTDCOMPRAS || d.qtdCompras || 0,
            compraAntiga: d.COMPRAANTIGA || d.compraAntiga,
          }));
        }
      } catch (e) { console.warn('[Balancete] crediario Digifarma (fallback CRM local):', e.message); }

      // Usar Digifarma se disponível, senão CRM local
      const crediarioFinal = crediarioDigifarma > 0 ? crediarioDigifarma : crediarioTotal;
      const crediarioDetalhesFinal = crediarioDigifarmaDetalhes.length > 0
        ? crediarioDigifarmaDetalhes : crediarioDetalhes;
      const fonteCrediario = crediarioDigifarma > 0 ? 'Digifarma' : 'CRM Local';

      const totalAtivo = saldoCaixa + saldoCofre + valorEstoque + crediarioFinal;

      // ═══════════════════════════════════════════════════════════════════
      //  PASSIVO
      // ═══════════════════════════════════════════════════════════════════

      // 5. Boletos pendentes
      let boletosTotalPendente = 0;
      let boletosDetalhes = [];
      try {
        const filterClause = month
          ? `WHERE status IN ('Pendente', 'Vencido') AND due_date <= ?`
          : `WHERE status IN ('Pendente', 'Vencido')`;
        const params = month ? [endDate] : [];
        const boletos = db.prepare(`
          SELECT supplierName, due_date, value, status
          FROM boletos ${filterClause}
          ORDER BY due_date ASC
        `).all(...params);
        boletosTotalPendente = boletos.reduce((a, b) => a + (b.value || 0), 0);

        // Agrupar por fornecedor
        const porFornecedor = {};
        for (const b of boletos) {
          const key = b.supplierName || 'Sem fornecedor';
          if (!porFornecedor[key]) porFornecedor[key] = { valor: 0, qtd: 0, itens: [] };
          porFornecedor[key].valor += b.value || 0;
          porFornecedor[key].qtd += 1;
          porFornecedor[key].itens.push({
            vencimento: b.due_date,
            valor: b.value,
            status: b.status,
          });
        }
        boletosDetalhes = Object.entries(porFornecedor).map(([fornecedor, data]) => ({
          fornecedor,
          ...data,
        })).sort((a, b) => b.valor - a.valor);
      } catch (e) { console.warn('[Balancete] boletos:', e.message); }

      // 6. Foguete Amarelo (accounts_payable)
      // 7. Contas fixas pendentes
      let contasFixasTotalPendente = 0;
      let contasFixasDetalhes = [];
      try {
        const queryMonth = month || new Date().toISOString().slice(0, 7);
        const fixeds = db.prepare(`
          SELECT fixedAccountName, value, status, dueDate
          FROM fixed_account_payments
          WHERE month = ? AND status != 'Pago'
          ORDER BY dueDate ASC
        `).all(queryMonth);
        contasFixasTotalPendente = fixeds.reduce((a, f) => a + (f.value || 0), 0);
        contasFixasDetalhes = fixeds.map(f => ({
          nome: f.fixedAccountName,
          valor: f.value,
          status: f.status,
          vencimento: f.dueDate,
        }));
      } catch (e) { console.warn('[Balancete] fixed_account_payments:', e.message); }

      const totalPassivo = boletosTotalPendente + contasFixasTotalPendente;

      // ═══════════════════════════════════════════════════════════════════
      //  PATRIMÔNIO LÍQUIDO
      // ═══════════════════════════════════════════════════════════════════
      const patrimonioLiquido = totalAtivo - totalPassivo;

      // Situação
      let situacao = 'Saudável';
      if (patrimonioLiquido < 0) situacao = 'Crítico';
      else if (patrimonioLiquido < totalAtivo * 0.15) situacao = 'Atenção';

      res.json({
        modo: isSnapshot ? 'atual' : 'mensal',
        referencia: isSnapshot ? today : month,
        ativo: {
          total: Math.round(totalAtivo * 100) / 100,
          disponivel: {
            caixa: Math.round(saldoCaixa * 100) / 100,
            cofre: Math.round(saldoCofre * 100) / 100,
            totalDisponivel: Math.round((saldoCaixa + saldoCofre) * 100) / 100,
            ultimoFechamento,
          },
          estoque: {
            valor: Math.round(valorEstoque * 100) / 100,
            qtdProdutos: qtdProdutosEstoque,
            fonte: estoqueFonte,
          },
          crediario: {
            total: Math.round(crediarioFinal * 100) / 100,
            fonte: fonteCrediario,
            detalhes: crediarioDetalhesFinal,
          },
        },
        passivo: {
          total: Math.round(totalPassivo * 100) / 100,
          boletos: {
            total: Math.round(boletosTotalPendente * 100) / 100,
            detalhes: boletosDetalhes,
          },
          contasFixas: {
            total: Math.round(contasFixasTotalPendente * 100) / 100,
            mes: month || new Date().toISOString().slice(0, 7),
            detalhes: contasFixasDetalhes,
          },
        },
        patrimonioLiquido: Math.round(patrimonioLiquido * 100) / 100,
        situacao,
      });
    } catch (err) {
      console.error('[Balancete] Erro:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/financial-health/chat
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/api/financial-health/chat', async (req, res) => {
    try {
      const { message, history } = req.body;

      let lastAnalysisData = 'Nenhuma análise recente disponível.';
      if (fs.existsSync(LAST_ANALYSIS_FILE)) {
        const fileContent = fs.readFileSync(LAST_ANALYSIS_FILE, 'utf8');
        const parsed = JSON.parse(fileContent);
        lastAnalysisData = JSON.stringify(parsed?.analysis || parsed);
      }

      const systemPrompt = `Você é a Isa, a Consultora Financeira da Bela Farma Sul.
O usuário está fazendo uma pergunta. Contexto da última análise financeira: 
${lastAnalysisData}

Responda de forma clara, curta, usando emojis e seja focado em ajudar a gestão financeira.`;

      // Converte o histórico para texto simples para o callAI que espera uma string
      const historyContext = (history || []).map(msg => `${msg.role === 'user' ? 'Usuário' : 'Isa'}: ${msg.content}`).join('\n');
      const fullPrompt = historyContext ? `${historyContext}\nUsuário: ${message}` : message;

      const reply = await callAI(fullPrompt, systemPrompt, { temperature: 0.7 });
      res.json({ reply });

    } catch (err) {
      console.error('[FinancialHealth] Erro no chat:', err);
      res.status(500).json({ error: err.message });
    }
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// buildSnapshot
// ─────────────────────────────────────────────────────────────────────────────
async function buildSnapshot(db, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const currentMonth = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().split('T')[0];

  // 1. Fechamentos de caixa
  const cashClosings = db.prepare(`
    SELECT date, totalSales, difference, pix, debit, credit, totalInDrawer, expenses
    FROM cash_closings
    WHERE date >= ?
    ORDER BY date DESC
  `).all(cutoffStr);

  const totalFaturamento = cashClosings.reduce((acc, r) => acc + (r.totalSales || 0), 0);
  const totalExpenses    = cashClosings.reduce((acc, r) => acc + (r.expenses || 0), 0);
  const diasComFechamento = cashClosings.length;
  const mediaDiaria = diasComFechamento > 0 ? totalFaturamento / diasComFechamento : 0;
  const totalCredito = cashClosings.reduce((acc, r) => acc + (r.credit || 0), 0);
  const totalDebito  = cashClosings.reduce((acc, r) => acc + (r.debit || 0), 0);
  const totalPix     = cashClosings.reduce((acc, r) => acc + (r.pix || 0), 0);

  // 2. Contas fixas do mês
  let fixedPayments = [];
  try {
    fixedPayments = db.prepare(`
      SELECT fixedAccountName, value, status, dueDate
      FROM fixed_account_payments
      WHERE month = ?
      ORDER BY dueDate
    `).all(currentMonth);
  } catch (e) {
    console.warn('[FinancialHealth] fixed_account_payments query failed:', e.message);
  }

  const totalContasFixas       = fixedPayments.reduce((acc, p) => acc + (p.value || 0), 0);
  const contasFixasPagas       = fixedPayments.filter(p => p.status === 'Pago').reduce((acc, p) => acc + p.value, 0);
  const contasFixasPendentes   = totalContasFixas - contasFixasPagas;

  // 3. Boletos pendentes (tabela boletos)
  let boletos = [];
  try {
    boletos = db.prepare(`
      SELECT supplierName, due_date, value, status
      FROM boletos
      WHERE status = 'Pendente'
      ORDER BY due_date
    `).all();
  } catch (e) {
    console.warn('[FinancialHealth] boletos query failed:', e.message);
  }

  const boletosVencidos      = boletos.filter(b => b.due_date < today);
  const boletosAVencer       = boletos.filter(b => b.due_date >= today);
  const totalBoletosVencidos = boletosVencidos.reduce((acc, b) => acc + (b.value || 0), 0);
  const totalBoletosAVencer  = boletosAVencer.reduce((acc, b) => acc + (b.value || 0), 0);

  const boletosPorFornecedor = {};
  for (const b of boletos) {
    const key = b.supplierName || 'Sem fornecedor';
    boletosPorFornecedor[key] = (boletosPorFornecedor[key] || 0) + (b.value || 0);
  }

  // 5. Pedidos / Compras
  let orders = [];
  try {
    orders = db.prepare(`
      SELECT distributor, totalValue, orderDate, status
      FROM orders
      WHERE orderDate >= ? AND status != 'Cancelado'
      ORDER BY orderDate DESC
    `).all(cutoffStr);
  } catch (e) {
    console.warn('[FinancialHealth] orders query failed:', e.message);
  }

  const totalCompras = orders.reduce((acc, o) => acc + (o.totalValue || 0), 0);
  const compraPorDistribuidora = {};
  for (const o of orders) {
    const key = o.distributor || 'Sem distribuidora';
    compraPorDistribuidora[key] = (compraPorDistribuidora[key] || 0) + (o.totalValue || 0);
  }

  // 5.5. Busca CMV Real e Vendas do Digifarma para comparar e ter a margem real
  let totalCMVReal = 0;
  let totalVendaDigifarma = 0;
  let usouCMVReal = false;
  try {
    const cmvResult = await queryDigifarma(`
      SELECT 
        SUM(COALESCE(iv.ITEMVEND_CMV, iv.ITEMVEND_ULT_COMPRA, 0) * iv.ITEMVEND_QUANT) AS TOTAL_CMV,
        SUM(iv.ITEMVEND_PRVENDA * iv.ITEMVEND_QUANT) AS TOTAL_VENDA
      FROM ITEM_VENDAS iv
      JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
      WHERE v.CANCELADO <> 'S'
        AND CAST((v.VENDA_DATA_HORA - 0.125) AS DATE) >= ?
    `, [cutoffStr]);
    
    if (cmvResult && cmvResult.length > 0) {
      totalCMVReal = cmvResult[0].TOTAL_CMV || 0;
      totalVendaDigifarma = cmvResult[0].TOTAL_VENDA || 0;
      usouCMVReal = true;
    }
  } catch (err) {
    console.warn('[FinancialHealth] Erro ao buscar CMV do Digifarma (usando fallback de margem estimada):', err.message);
  }

  // KPIs
  let margemBruta = 0;
  if (usouCMVReal && totalVendaDigifarma > 0) {
    margemBruta = ((totalVendaDigifarma - totalCMVReal) / totalVendaDigifarma) * 100;
  } else {
    margemBruta = totalFaturamento > 0 ? ((totalFaturamento - totalCompras) / totalFaturamento) * 100 : 0;
  }

  if (margemBruta < 0) margemBruta = 0;
  if (margemBruta > 100) margemBruta = 100;

  const totalDespesasTotal = totalContasFixas + totalBoletosVencidos + totalBoletosAVencer;
  const pontoEquilibrio = margemBruta > 0 ? totalContasFixas / (margemBruta / 100) : 0;
  
  const cmvProporcional = totalFaturamento * (1 - (margemBruta / 100));
  const saldoEstimado = totalFaturamento - cmvProporcional - totalContasFixas - totalExpenses;

  return {
    periodo: { days, cutoffStr, currentMonth },
    faturamento: {
      total: totalFaturamento, mediaDiaria, diasComFechamento,
      credito: totalCredito, debito: totalDebito, pix: totalPix,
      despesasOperacionais: totalExpenses,
    },
    contasFixas: {
      total: totalContasFixas, pagas: contasFixasPagas, pendentes: contasFixasPendentes,
      lista: fixedPayments.map(p => ({ nome: p.fixedAccountName, valor: p.value, status: p.status })),
    },
    boletos: {
      totalVencidos: totalBoletosVencidos, totalAVencer: totalBoletosAVencer,
      qtdVencidos: boletosVencidos.length, qtdAVencer: boletosAVencer.length,
      porFornecedor: boletosPorFornecedor,
    },
    compras: { total: totalCompras, porDistribuidora: compraPorDistribuidora, qtdPedidos: orders.length },
    kpis: {
      margemBrutaPercent: margemBruta,
      pontoEquilibrio,
      totalDespesasTotal,
      saldoEstimado,
      totalCMVReal,
      totalVendaDigifarma,
      usouCMVReal,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// buildPrompt
// ─────────────────────────────────────────────────────────────────────────────
function buildPrompt(snapshot, days) {
  const fmt = v => `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
  const pct = v => `${(v || 0).toFixed(1)}%`;
  const s = snapshot;

  const fornecedoresBoletos = Object.entries(s.boletos.porFornecedor)
    .sort((a, b) => b[1] - a[1])
    .map(([n, v]) => `  - ${n}: ${fmt(v)}`)
    .join('\n') || '  Nenhum boleto pendente';

  const distribuidoras = Object.entries(s.compras.porDistribuidora)
    .sort((a, b) => b[1] - a[1])
    .map(([d, v]) => `  - ${d}: ${fmt(v)}`)
    .join('\n') || '  Nenhuma compra no período';

  const contasFixasList = s.contasFixas.lista
    .map(c => `  - ${c.nome}: ${fmt(c.valor)} (${c.status})`)
    .join('\n') || '  Nenhuma conta fixa cadastrada';

  return `Você é o Consultor Financeiro Sênior da Bela Farma Sul, farmácia de pequeno porte no Brasil.
Analise os dados reais abaixo e retorne um diagnóstico completo em JSON estruturado.

DADOS FINANCEIROS — ÚLTIMOS ${days} DIAS:

=== FATURAMENTO ===
Total: ${fmt(s.faturamento.total)}
Média diária: ${fmt(s.faturamento.mediaDiaria)} (${s.faturamento.diasComFechamento} dias com fechamento)
Cartão crédito: ${fmt(s.faturamento.credito)} | Débito: ${fmt(s.faturamento.debito)} | PIX: ${fmt(s.faturamento.pix)}
Despesas operacionais do caixa: ${fmt(s.faturamento.despesasOperacionais)}

=== CONTAS FIXAS (MÊS ATUAL) ===
Total: ${fmt(s.contasFixas.total)} | Pagas: ${fmt(s.contasFixas.pagas)} | Pendentes: ${fmt(s.contasFixas.pendentes)}
${contasFixasList}

=== BOLETOS PENDENTES ===
Vencidos: ${fmt(s.boletos.totalVencidos)} (${s.boletos.qtdVencidos} boletos URGENTE)
A vencer: ${fmt(s.boletos.totalAVencer)} (${s.boletos.qtdAVencer} boletos)
Por fornecedor:
${fornecedoresBoletos}

=== COMPRAS ===
Total comprado: ${fmt(s.compras.total)} em ${s.compras.qtdPedidos} pedido(s)
Por distribuidora:
${distribuidoras}

=== KPIs ===
Margem bruta estimada: ${pct(s.kpis.margemBrutaPercent)}
Ponto de equilíbrio mensal: ${fmt(s.kpis.pontoEquilibrio)}
Total de compromissos: ${fmt(s.kpis.totalDespesasTotal)}
Saldo estimado: ${fmt(s.kpis.saldoEstimado)}

---
INSTRUÇÕES:
- Seja direto, profissional e focado em ações práticas
- Considere contexto de farmácia de bairro brasileira, pequeno porte
- Retorne SOMENTE JSON válido (sem markdown, sem texto extra) com esta estrutura exata:

{
  "resumoExecutivo": {
    "status": "Crítico|Atenção|Saudável",
    "emoji": "🔴|🟡|🟢",
    "frase": "Uma frase direta sobre saúde financeira atual",
    "faturamentoVsDespesas": "Análise comparativa em texto",
    "pontoEquilibrio": "Quanto precisa vender e se está atingindo"
  },
  "diagnostico": {
    "margemReal": "Análise da margem após custos",
    "fluxoDeCaixa": "Status do fluxo",
    "endividamento": "Análise do nível de dívida"
  },
  "alertas": [
    { "nivel": "critico|atencao|info", "titulo": "Título curto", "descricao": "Detalhe", "acao": "O que fazer" }
  ],
  "estrategiaCompra": {
    "analise": "Análise das compras",
    "fornecedorRisco": "Fornecedor com maior exposição",
    "recomendacao": "O que mudar"
  },
  "planoAcao": [
    { "prioridade": 1, "titulo": "Dica 1", "descricao": "Detalhe prático", "impactoEstimado": "Economia/ganho", "prazo": "Esta semana|Este mês|Próximo trimestre" }
  ],
  "dicasDeOuro": ["Ideia 1", "Ideia 2", "Ideia 3"]
}
`;
}
