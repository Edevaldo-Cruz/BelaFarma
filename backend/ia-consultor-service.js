/**
 * backend/ia-consultor-service.js
 * Módulo de Inteligência Estratégica e Financeira da Bela Farma
 * Agrega dados reais de Vendas, Curva ABC, Estoque/Validades, Compras e BelaPed
 * e fornece chat contextualizado utilizando o modelo local (Ollama) ou provedor configurado.
 */

const { callAI } = require('./services/ai.service');
const { queryDigifarma } = require('./services/digifarma.service');

/**
 * Monta o contexto consolidado da farmácia para a IA
 */
async function buildFarmaciaContext(db) {
  const context = {
    dataHora: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    faturamento: {},
    curvaABC: [],
    estoqueValidades: {},
    belaped: {},
    contas: {}
  };

  const today = new Date().toISOString().split('T')[0];
  const cutoff30 = new Date();
  cutoff30.setDate(cutoff30.getDate() - 30);
  const cutoff30Str = cutoff30.toISOString().split('T')[0];

  // 1. Resumo de Faturamento e Vendas Recentes (cash_closings)
  try {
    const closings = db.prepare(`
      SELECT date, totalSales, pix, debit, credit, expenses
      FROM cash_closings
      WHERE date >= ?
      ORDER BY date DESC
    `).all(cutoff30Str);

    const totalVendido30d = closings.reduce((acc, c) => acc + (c.totalSales || 0), 0);
    const mediaDiaria = closings.length > 0 ? (totalVendido30d / closings.length) : 0;
    const totalPix = closings.reduce((acc, c) => acc + (c.pix || 0), 0);
    const totalCartao = closings.reduce((acc, c) => acc + ((c.credit || 0) + (c.debit || 0)), 0);

    context.faturamento = {
      diasAnalisados: closings.length,
      totalVendido30d: totalVendido30d.toFixed(2),
      mediaDiaria: mediaDiaria.toFixed(2),
      percentualPix: totalVendido30d > 0 ? ((totalPix / totalVendido30d) * 100).toFixed(1) + '%' : '0%',
      percentualCartao: totalVendido30d > 0 ? ((totalCartao / totalVendido30d) * 100).toFixed(1) + '%' : '0%',
      ultimosDias: closings.slice(0, 5).map(c => ({ data: c.date, total: c.totalSales }))
    };
  } catch (err) {
    console.warn('[IAConsultor] Erro ao buscar cash_closings:', err.message);
  }

  // 2. Curva ABC e Produtos Mais Vendidos / Mais Lucrativos (Digifarma ou Cache)
  try {
    const vendasTop = await queryDigifarma(`
      SELECT FIRST 15 
        iv.ITEMVEND_DESCRICAO AS DESCRICAO,
        SUM(iv.ITEMVEND_QUANT) AS QTD_VENDIDA,
        SUM(iv.ITEMVEND_PRVENDA * iv.ITEMVEND_QUANT) AS TOTAL_VALOR,
        SUM((iv.ITEMVEND_PRVENDA - COALESCE(iv.ITEMVEND_CMV, iv.ITEMVEND_ULT_COMPRA, 0)) * iv.ITEMVEND_QUANT) AS LUCRO_ESTIMADO
      FROM ITEM_VENDAS iv
      JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
      WHERE v.CANCELADO <> 'S'
        AND CAST((v.VENDA_DATA_HORA - 0.125) AS DATE) >= ?
      GROUP BY iv.ITEMVEND_DESCRICAO
      ORDER BY TOTAL_VALOR DESC
    `, [cutoff30Str], 8000);

    if (vendasTop && vendasTop.length > 0) {
      context.curvaABC = vendasTop.map(v => ({
        produto: v.DESCRICAO,
        qtdVendida: v.QTD_VENDIDA,
        faturamento: Number(v.TOTAL_VALOR || 0).toFixed(2),
        lucroEstimado: Number(v.LUCRO_ESTIMADO || 0).toFixed(2)
      }));
    }
  } catch (err) {
    console.warn('[IAConsultor] Aviso ao consultar Curva ABC no Digifarma (usando fallback interno):', err.message);
  }

  // 3. Validades Próximas e Itens Parados (Perdas/Inventário)
  try {
    const perdasAlerta = db.prepare(`
      SELECT produto, ean, data_vencimento, quantidade, motivo, valor_total
      FROM perdas_avarias
      WHERE data_vencimento >= ?
      ORDER BY data_vencimento ASC
      LIMIT 10
    `).all(today);

    context.estoqueValidades = {
      itensAlertaVencimento: perdasAlerta.length,
      amostra: perdasAlerta.map(p => ({
        produto: p.produto,
        vencimento: p.data_vencimento,
        qtd: p.quantidade,
        valor: p.valor_total
      }))
    };
  } catch (err) {
    // Tabela opcional
  }

  // 4. Oportunidades BelaPed (Melhores Cotações e Distribuidores Ativos)
  try {
    const cotacoesDestaque = db.prepare(`
      SELECT fornecedor, descricao, preco, desc_pct, updated_at
      FROM belaped_cotacoes_reais
      WHERE preco > 0
      ORDER BY updated_at DESC
      LIMIT 10
    `).all();

    context.belaped = {
      totalCotacoesMonitoradas: db.prepare("SELECT COUNT(*) as c FROM belaped_cotacoes_reais").get()?.c || 0,
      exemplosCotacoes: cotacoesDestaque.map(c => ({
        fornecedor: c.fornecedor,
        item: c.descricao,
        preco: c.preco,
        desconto: c.desc_pct ? `${c.desc_pct}%` : null
      }))
    };
  } catch (err) {
    // Tabela opcional
  }

  // 5. Boletos e Contas a Pagar
  try {
    const boletosPendentes = db.prepare(`
      SELECT supplierName, value, due_date
      FROM boletos
      WHERE status = 'Pendente'
      ORDER BY due_date ASC
      LIMIT 10
    `).all();

    const totalBoletosPendentes = db.prepare(`
      SELECT SUM(value) as total FROM boletos WHERE status = 'Pendente'
    `).get()?.total || 0;

    context.contas = {
      totalBoletosPendentes: Number(totalBoletosPendentes).toFixed(2),
      proximosVencimentos: boletosPendentes.map(b => ({
        fornecedor: b.supplierName,
        valor: b.value,
        vencimento: b.due_date
      }))
    };
  } catch (err) {
    // Tabela opcional
  }

  return context;
}

module.exports = function (app, db) {
  /**
   * GET /api/ia/status
   * Retorna o status do motor de IA e resumo de dados
   */
  app.get('/api/ia/status', async (req, res) => {
    try {
      res.json({
        ok: true,
        provider: process.env.AI_PROVIDER || 'ollama',
        model: process.env.OLLAMA_MODEL || 'qwen2.5-coder:3b'
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/ia/contexto
   * Retorna os dados resumidos da farmácia que a IA usa para raciocínio
   */
  app.get('/api/ia/contexto', async (req, res) => {
    try {
      const contexto = await buildFarmaciaContext(db);
      res.json({ ok: true, contexto });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/ia/chat
   * Chat de consultoria com contexto dinâmico da farmácia
   */
  app.post('/api/ia/chat', async (req, res) => {
    try {
      const { message, history } = req.body;
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Mensagem não informada.' });
      }

      // Obtém o panorama mais recente da farmácia
      const farmaciaContext = await buildFarmaciaContext(db);
      // Prompt enxuto e direto para inferência veloz na CPU ARM do Pi 5
      const fat = farmaciaContext.faturamento || {};
      const resumoTexto = `Vendido 30d: R$ ${fat.totalVendido30d || '0'} | Média diária: R$ ${fat.mediaDiaria || '0'} | Pix: ${fat.percentualPix || '0%'} | Cartão: ${fat.percentualCartao || '0%'}`;

      const systemPrompt = `Você é o Consultor Estratégico e Financeiro da Bela Farma Sul.
Panorama atual: ${resumoTexto}.
Seja objetivo, prático, motivador e dê respostas curtas com tópicos, negrito e emojis. Foque em ações de aumento de vendas e rentabilidade. Fale em português.`;

      // Converte o histórico de mensagens
      const historyText = (history || [])
        .slice(-4)
        .map(msg => `${msg.role === 'user' ? 'Gestor' : 'Consultor IA'}: ${msg.content}`)
        .join('\n');

      const fullPrompt = historyText
        ? `${historyText}\nGestor: ${message}`
        : message;

      // Chama o Ollama local no Raspberry Pi 5 com limite de tokens ágil (350 tokens)
      const reply = await callAI(fullPrompt, systemPrompt, {
        provider: 'ollama',
        temperature: 0.5,
        maxTokens: 350,
        isPriority: true // Chat do gestor não pode ser bloqueado
      });

      res.json({
        ok: true,
        reply,
        timestamp: new Date().toISOString()
      });

    } catch (err) {
      console.error('[IAConsultor] Erro no endpoint /api/ia/chat:', err);
      res.status(500).json({
        ok: false,
        error: `Falha ao processar resposta da IA: ${err.message}`
      });
    }
  });
};
