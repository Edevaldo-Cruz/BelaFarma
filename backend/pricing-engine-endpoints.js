const express = require('express');
const { runPricingEngine } = require('./services/pricing-engine.service');

module.exports = function (db) {
  const router = express.Router();

  /**
   * 1. GET /api/pricing-engine/rules
   * Retorna as regras e a matriz de margens ativas
   */
  router.get('/rules', (req, res) => {
    try {
      const row = db.prepare('SELECT * FROM pricing_rules WHERE id = ?').get('default');
      if (!row) {
        return res.status(404).json({ error: 'Regras de precificação não encontradas.' });
      }

      let matrizMargens = {};
      try {
        matrizMargens = JSON.parse(row.matriz_margens_json);
      } catch (e) {
        console.warn('Erro ao decodificar JSON de matriz_margens:', e.message);
      }

      res.json({
        success: true,
        data: {
          aliquotaImpostosPct: row.aliquota_impostos_pct,
          despesasOperacionaisPct: row.despesas_operacionais_pct,
          taxaCartaoPct: row.taxa_cartao_pct,
          margemMinimaAbsolutaPct: row.margem_minima_absoluta_pct,
          maxVariacaoAlertaPct: row.max_variacao_alerta_pct,
          diasAnaliseAbc: row.dias_analise_abc,
          matrizMargens,
          atualizadoEm: row.atualizado_em
        }
      });
    } catch (err) {
      console.error('[Pricing Engine API] Erro ao obter regras:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 2. POST /api/pricing-engine/rules
   * Atualiza as regras de precificação e matriz de margens
   */
  router.post('/rules', (req, res) => {
    try {
      const {
        aliquotaImpostosPct,
        despesasOperacionaisPct,
        taxaCartaoPct,
        margemMinimaAbsolutaPct,
        maxVariacaoAlertaPct,
        diasAnaliseAbc,
        matrizMargens
      } = req.body;

      const timestamp = new Date().toISOString();

      db.prepare(`
        INSERT OR REPLACE INTO pricing_rules (
          id, aliquota_impostos_pct, despesas_operacionais_pct, taxa_cartao_pct,
          margem_minima_absoluta_pct, max_variacao_alerta_pct, dias_analise_abc,
          matriz_margens_json, atualizado_em
        ) VALUES (
          'default', ?, ?, ?,
          ?, ?, ?,
          ?, ?
        )
      `).run(
        parseFloat(aliquotaImpostosPct) || 4.0,
        parseFloat(despesasOperacionaisPct) || 12.0,
        parseFloat(taxaCartaoPct) || 2.5,
        parseFloat(margemMinimaAbsolutaPct) || 5.0,
        parseFloat(maxVariacaoAlertaPct) || 20.0,
        parseInt(diasAnaliseAbc) || 60,
        JSON.stringify(matrizMargens || {}),
        timestamp
      );

      res.json({
        success: true,
        message: 'Regras e matriz de margem salvas com sucesso!'
      });
    } catch (err) {
      console.error('[Pricing Engine API] Erro ao salvar regras:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 3. POST /api/pricing-engine/simulate
   * Dispara a simulação em lote do motor inteligente (100% no SQLite, sem escrita no Digifarma)
   */
  router.post('/simulate', async (req, res) => {
    try {
      const result = await runPricingEngine(db, req.body || {});
      res.json(result);
    } catch (err) {
      console.error('[Pricing Engine API] Erro na simulação de preços:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 4. GET /api/pricing-engine/suggestions
   * Retorna lista paginada e filtrada de sugestões de preços calculadas
   */
  router.get('/suggestions', (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;

      const search = (req.query.search || '').trim();
      const categoria = req.query.categoria || 'ALL';
      const curva = req.query.curva || 'ALL';
      const approvalFilter = req.query.approvalFilter || 'ALL';
      const guardrailFilter = req.query.guardrailFilter || 'ALL';
      const variationFilter = req.query.variationFilter || 'ALL';

      const whereClauses = [];
      const params = [];

      if (search) {
        whereClauses.push('(descricao LIKE ? OR ean LIKE ? OR produto_id LIKE ?)');
        const searchLike = `%${search}%`;
        params.push(searchLike, searchLike, searchLike);
      }

      if (categoria !== 'ALL') {
        whereClauses.push('categoria = ?');
        params.push(categoria);
      }

      if (curva !== 'ALL') {
        whereClauses.push('curva = ?');
        params.push(curva);
      }

      if (approvalFilter === 'REQUIRES_APPROVAL') {
        whereClauses.push('requer_aprovacao_manual = 1');
      } else if (approvalFilter === 'APPROVED_AUTO') {
        whereClauses.push('requer_aprovacao_manual = 0');
      }

      if (guardrailFilter === 'CMED') {
        whereClauses.push('trava_teto_cmed = 1');
      } else if (guardrailFilter === 'PISO') {
        whereClauses.push('trava_piso_minimo = 1');
      } else if (guardrailFilter === 'VOLATILIDADE') {
        whereClauses.push('trava_volatilidade = 1');
      } else if (guardrailFilter === 'ANY_TRAVA') {
        whereClauses.push('(trava_teto_cmed = 1 OR trava_piso_minimo = 1 OR trava_volatilidade = 1)');
      }

      if (variationFilter === 'INCREASE') {
        whereClauses.push('variacao_valor > 0.05');
      } else if (variationFilter === 'DECREASE') {
        whereClauses.push('variacao_valor < -0.05');
      } else if (variationFilter === 'DISCREPANT') {
        whereClauses.push('ABS(variacao_pct) >= 15');
      }

      const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      // Total count
      const countRow = db.prepare(`
        SELECT COUNT(1) as total 
        FROM pricing_suggestions 
        ${whereSQL}
      `).get(...params);

      const totalItems = countRow ? countRow.total : 0;

      // Paged rows
      const items = db.prepare(`
        SELECT * 
        FROM pricing_suggestions 
        ${whereSQL}
        ORDER BY curva ASC, requer_aprovacao_manual DESC, ABS(variacao_pct) DESC, descricao ASC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset);

      res.json({
        success: true,
        data: items,
        pagination: {
          totalItems,
          totalPages: Math.ceil(totalItems / limit) || 1,
          currentPage: page,
          limit
        }
      });
    } catch (err) {
      console.error('[Pricing Engine API] Erro ao obter sugestões:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 5. GET /api/pricing-engine/stats
   * Retorna estatísticas e métricas de impacto da precificação
   */
  router.get('/stats', (req, res) => {
    try {
      const statsRow = db.prepare(`
        SELECT 
          COUNT(1) as total,
          SUM(CASE WHEN curva = 'A' THEN 1 ELSE 0 END) as curveA,
          SUM(CASE WHEN curva = 'B' THEN 1 ELSE 0 END) as curveB,
          SUM(CASE WHEN curva = 'C' THEN 1 ELSE 0 END) as curveC,
          SUM(CASE WHEN categoria = 'generico' THEN 1 ELSE 0 END) as countGenerico,
          SUM(CASE WHEN categoria = 'similar' THEN 1 ELSE 0 END) as countSimilar,
          SUM(CASE WHEN categoria = 'referencia' THEN 1 ELSE 0 END) as countReferencia,
          SUM(CASE WHEN categoria = 'perfumaria' THEN 1 ELSE 0 END) as countPerfumaria,
          SUM(CASE WHEN categoria = 'mips' THEN 1 ELSE 0 END) as countMips,
          SUM(CASE WHEN requer_aprovacao_manual = 1 THEN 1 ELSE 0 END) as requiresApproval,
          SUM(CASE WHEN trava_teto_cmed = 1 THEN 1 ELSE 0 END) as travaCmed,
          SUM(CASE WHEN trava_piso_minimo = 1 THEN 1 ELSE 0 END) as travaPiso,
          SUM(CASE WHEN trava_volatilidade = 1 THEN 1 ELSE 0 END) as travaVolatilidade,
          SUM(CASE WHEN variacao_valor > 0 THEN 1 ELSE 0 END) as countIncrease,
          SUM(CASE WHEN variacao_valor < 0 THEN 1 ELSE 0 END) as countDecrease,
          AVG(CASE WHEN custo_liquido > 0 AND preco_atual > 0 THEN margem_atual_pct ELSE NULL END) as avgMargemAtual,
          AVG(CASE WHEN custo_liquido > 0 AND preco_sugerido > 0 THEN margem_projetada_pct ELSE NULL END) as avgMargemProjetada
        FROM pricing_suggestions
      `).get();

      const lastRun = db.prepare(`
        SELECT * FROM pricing_runs ORDER BY executado_em DESC LIMIT 1
      `).get();

      res.json({
        success: true,
        data: {
          total: statsRow ? statsRow.total || 0 : 0,
          curveA: statsRow ? statsRow.curveA || 0 : 0,
          curveB: statsRow ? statsRow.curveB || 0 : 0,
          curveC: statsRow ? statsRow.curveC || 0 : 0,
          categories: {
            generico: statsRow ? statsRow.countGenerico || 0 : 0,
            similar: statsRow ? statsRow.countSimilar || 0 : 0,
            referencia: statsRow ? statsRow.countReferencia || 0 : 0,
            perfumaria: statsRow ? statsRow.countPerfumaria || 0 : 0,
            mips: statsRow ? statsRow.countMips || 0 : 0
          },
          requiresApproval: statsRow ? statsRow.requiresApproval || 0 : 0,
          travas: {
            cmed: statsRow ? statsRow.travaCmed || 0 : 0,
            piso: statsRow ? statsRow.travaPiso || 0 : 0,
            volatilidade: statsRow ? statsRow.travaVolatilidade || 0 : 0
          },
          countIncrease: statsRow ? statsRow.countIncrease || 0 : 0,
          countDecrease: statsRow ? statsRow.countDecrease || 0 : 0,
          avgMargemAtual: statsRow && statsRow.avgMargemAtual ? parseFloat(statsRow.avgMargemAtual.toFixed(2)) : 0,
          avgMargemProjetada: statsRow && statsRow.avgMargemProjetada ? parseFloat(statsRow.avgMargemProjetada.toFixed(2)) : 0,
          marginGainPct: statsRow && statsRow.avgMargemProjetada && statsRow.avgMargemAtual 
            ? parseFloat((statsRow.avgMargemProjetada - statsRow.avgMargemAtual).toFixed(2)) 
            : 0,
          lastRun: lastRun || null
        }
      });
    } catch (err) {
      console.error('[Pricing Engine API] Erro ao obter estatísticas:', err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 6. GET /api/pricing-engine/export
   * Exporta todas as sugestões em formato CSV para conferência e auditoria
   */
  router.get('/export', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT 
          ean, produto_id, descricao, categoria, curva, estoque_atual,
          custo_liquido, preco_atual, preco_sugerido, preco_proffer,
          margem_atual_pct, margem_projetada_pct, variacao_pct, variacao_valor,
          trava_teto_cmed, trava_piso_minimo, trava_volatilidade,
          requer_aprovacao_manual, justificativa, calculado_em
        FROM pricing_suggestions
        ORDER BY curva ASC, categoria ASC, descricao ASC
      `).all();

      const headers = [
        'EAN', 'ID', 'Produto', 'Categoria', 'Curva ABC', 'Estoque',
        'Custo Líquido', 'Preço Atual', 'Preço Sugerido', 'Preço Proffer',
        'Margem Atual (%)', 'Margem Projetada (%)', 'Variação (%)', 'Variação (R$)',
        'Trava CMED', 'Trava Piso', 'Trava Volatilidade',
        'Requer Aprovação', 'Justificativa', 'Data Cálculo'
      ];

      const csvRows = [headers.join(';')];

      for (const r of rows) {
        csvRows.push([
          `"${r.ean || ''}"`,
          `"${r.produto_id || ''}"`,
          `"${(r.descricao || '').replace(/"/g, '""')}"`,
          `"${r.categoria || ''}"`,
          `"${r.curva || ''}"`,
          (r.estoque_atual || 0).toString().replace('.', ','),
          (r.custo_liquido || 0).toFixed(2).replace('.', ','),
          (r.preco_atual || 0).toFixed(2).replace('.', ','),
          (r.preco_sugerido || 0).toFixed(2).replace('.', ','),
          r.preco_proffer ? r.preco_proffer.toFixed(2).replace('.', ',') : '',
          (r.margem_atual_pct || 0).toFixed(2).replace('.', ','),
          (r.margem_projetada_pct || 0).toFixed(2).replace('.', ','),
          (r.variacao_pct || 0).toFixed(2).replace('.', ','),
          (r.variacao_valor || 0).toFixed(2).replace('.', ','),
          r.trava_teto_cmed ? 'SIM' : 'NÃO',
          r.trava_piso_minimo ? 'SIM' : 'NÃO',
          r.trava_volatilidade ? 'SIM' : 'NÃO',
          r.requer_aprovacao_manual ? 'SIM' : 'NÃO',
          `"${(r.justificativa || '').replace(/"/g, '""')}"`,
          `"${r.calculado_em || ''}"`
        ].join(';'));
      }

      const csvContent = '\uFEFF' + csvRows.join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=belinha_pricing_sugestoes.csv');
      res.send(csvContent);
    } catch (err) {
      console.error('[Pricing Engine API] Erro ao exportar CSV:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
