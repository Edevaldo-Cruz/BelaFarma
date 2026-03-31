/**
 * financial-health-endpoints.js
 * Módulo Consultor Financeiro — Bela Farma Sul
 */

const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs');

const LAST_ANALYSIS_FILE = path.join(__dirname, 'last_financial_analysis.json');

module.exports = function (app, db) {

  const GEMINI_MODEL = 'gemini-flash-latest';

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/financial-health/snapshot
  // ─────────────────────────────────────────────────────────────────────────
  app.get('/api/financial-health/snapshot', (req, res) => {
    try {
      const days = parseInt(req.query.days) || 30;
      const snapshot = buildSnapshot(db, days);
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

      // Lê a chave em tempo de execução (já carregada pelo dotenv do server.js)
      const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY não configurada no servidor.' });
      }

      // 1. Agrega dados
      const snapshot = buildSnapshot(db, days);

      // 2. Monta prompt
      const prompt = buildPrompt(snapshot, days);

      // 3. Chama Gemini (mesmo modelo e padrão do finance-agent.service.js)
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

      const geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 8192 }
        })
      });

      if (!geminiResponse.ok) {
        const errBody = await geminiResponse.text();
        console.error('[FinancialHealth] Gemini error:', geminiResponse.status, errBody.substring(0, 300));
        return res.status(502).json({ error: `Erro na API Gemini (${geminiResponse.status}): ${errBody.substring(0, 200)}` });
      }

      const geminiData = await geminiResponse.json();
      const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

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
  // POST /api/financial-health/chat
  // ─────────────────────────────────────────────────────────────────────────
  app.post('/api/financial-health/chat', async (req, res) => {
    try {
      const { message, history } = req.body;
      const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY não configurada.' });
      }

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

      const contents = (history || []).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));
      contents.push({ role: 'user', parts: [{ text: message }] });

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const payload = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: contents,
        generationConfig: { temperature: 0.7 }
      };

      const geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!geminiResponse.ok) {
        const errStr = await geminiResponse.text();
        throw new Error(`Gemini erro: ${errStr.substring(0, 100)}`);
      }

      const geminiData = await geminiResponse.json();
      const reply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
function buildSnapshot(db, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const currentMonth = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().split('T')[0];

  // 1. Fechamentos de caixa
  // Colunas confirmadas: date, totalSales, difference, pix, debit, credit, totalInDrawer, expenses
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

  // 4. Foguete Amarelo (accounts_payable)
  let fogueteAmarelo = [];
  try {
    fogueteAmarelo = db.prepare(`
      SELECT supplier_name, due_date, remaining_value, status
      FROM accounts_payable
      WHERE is_foguete_amarelo = 1 AND status != 'Quitado'
      ORDER BY due_date
    `).all();
  } catch (e) {
    console.warn('[FinancialHealth] accounts_payable query failed:', e.message);
  }

  const totalFoguete   = fogueteAmarelo.reduce((acc, f) => acc + (f.remaining_value || 0), 0);
  const fogueteVencido = fogueteAmarelo.filter(f => f.due_date < today).reduce((acc, f) => acc + (f.remaining_value || 0), 0);

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

  // KPIs
  const margemBruta     = totalFaturamento > 0 ? ((totalFaturamento - totalCompras) / totalFaturamento) * 100 : 0;
  const totalDespesasTotal = totalContasFixas + totalBoletosVencidos + totalBoletosAVencer + totalFoguete;
  const pontoEquilibrio = margemBruta > 0 ? totalContasFixas / (margemBruta / 100) : 0;

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
    fogueteAmarelo: { total: totalFoguete, vencido: fogueteVencido, qtd: fogueteAmarelo.length },
    compras: { total: totalCompras, porDistribuidora: compraPorDistribuidora, qtdPedidos: orders.length },
    kpis: {
      margemBrutaPercent: margemBruta,
      pontoEquilibrio,
      totalDespesasTotal,
      saldoEstimado: totalFaturamento - totalDespesasTotal,
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
Despesas operacionais (sangrias): ${fmt(s.faturamento.despesasOperacionais)}

=== CONTAS FIXAS (MÊS ATUAL) ===
Total: ${fmt(s.contasFixas.total)} | Pagas: ${fmt(s.contasFixas.pagas)} | Pendentes: ${fmt(s.contasFixas.pendentes)}
${contasFixasList}

=== BOLETOS PENDENTES ===
Vencidos: ${fmt(s.boletos.totalVencidos)} (${s.boletos.qtdVencidos} boletos URGENTE)
A vencer: ${fmt(s.boletos.totalAVencer)} (${s.boletos.qtdAVencer} boletos)
Por fornecedor:
${fornecedoresBoletos}

=== FOGUETE AMARELO (compras D+120) ===
Saldo: ${fmt(s.fogueteAmarelo.total)} em ${s.fogueteAmarelo.qtd} título(s) | Vencido: ${fmt(s.fogueteAmarelo.vencido)}

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
}`;
}
