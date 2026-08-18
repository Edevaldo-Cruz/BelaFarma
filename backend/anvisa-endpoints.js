const express = require('express');
const {
  initializeAlerts,
  getAlertsWithStockInfo,
  parseAnvisaText,
  fetchOnlineAnvisaUpdates,
  checkStockForAlert
} = require('./services/anvisa.service');

module.exports = function (db) {
  const router = express.Router();

  // Garante inicialização da tabela com dados prévios
  initializeAlerts(db);

  // 1. Obter lista de alertas da ANVISA com informação de estoque
  router.get('/alerts', async (req, res) => {
    try {
      const { soComEstoque, soDuvidosos, soRelevantes, busca } = req.query;
      const alerts = await getAlertsWithStockInfo(db, { soComEstoque, soDuvidosos, soRelevantes, busca });
      const totalEmEstoque = alerts.filter(a => a.statusEstoque === 'comEstoque').length;
      const totalDuvidosos = alerts.filter(a => a.statusEstoque === 'duvidoso').length;

      res.json({
        success: true,
        alerts,
        total: alerts.length,
        totalEmEstoque,
        totalDuvidosos
      });
    } catch (err) {
      console.error('[ANVISA API] Erro ao listar alertas:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. Resumo de estatísticas para notificações do topo do sistema
  router.get('/summary', async (req, res) => {
    try {
      const alerts = await getAlertsWithStockInfo(db, {});
      const emEstoque = alerts.filter(a => a.temEstoque);
      res.json({
        success: true,
        totalAlertas: alerts.length,
        totalEmEstoque: emEstoque.length,
        produtosEmEstoque: emEstoque.map(a => ({
          id: a.id,
          nome: a.nome_produto,
          resolucao: a.numero_resolucao,
          saldo: a.saldoEstoque
        }))
      });
    } catch (err) {
      console.error('[ANVISA API] Erro ao obter resumo:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. Forçar busca/sincronização online de atualizações da ANVISA
  router.post('/sync', async (req, res) => {
    try {
      const result = await fetchOnlineAnvisaUpdates(db);
      const alerts = await getAlertsWithStockInfo(db, {});
      res.json({
        success: true,
        countNew: result.countNew,
        message: result.countNew > 0 
          ? `${result.countNew} novos alertas adicionados da ANVISA!`
          : 'Nenhum novo alerta encontrado no portal da ANVISA.',
        alerts
      });
    } catch (err) {
      console.error('[ANVISA API] Erro ao sincronizar ANVISA:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. Analisar e cadastrar texto/link colado de resolução da ANVISA
  router.post('/parse-text', async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ success: false, error: 'O texto da resolução é obrigatório.' });
      }

      const parsed = parseAnvisaText(text);
      const id = `anvisa-manual-${Date.now()}`;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO anvisa_alerts (
          id, numero_resolucao, data_publicacao, nome_produto, fabricante,
          principio_ativo, motivo, tipo_acao, lote, ean, fonte_url, criado_em, verificado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(
        id,
        parsed.numero_resolucao,
        parsed.data_publicacao,
        parsed.nome_produto,
        parsed.fabricante,
        parsed.principio_ativo || '',
        parsed.motivo,
        parsed.tipo_acao,
        parsed.lote || '',
        parsed.ean || '',
        parsed.fonte_url || '',
        now
      );

      const alertObj = db.prepare('SELECT * FROM anvisa_alerts WHERE id = ?').get(id);
      const stockInfo = await checkStockForAlert(db, alertObj);

      res.json({
        success: true,
        alert: {
          ...alertObj,
          temEstoque: stockInfo.temEstoque,
          saldoEstoque: stockInfo.saldo,
          produtoEncontradoEstoque: stockInfo.produtoNomeEncontrado
        }
      });
    } catch (err) {
      console.error('[ANVISA API] Erro ao extrair texto da ANVISA:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. Cadastrar alerta manualmente
  router.post('/create', async (req, res) => {
    try {
      const {
        numero_resolucao,
        data_publicacao,
        nome_produto,
        fabricante,
        principio_ativo,
        motivo,
        tipo_acao,
        lote,
        ean
      } = req.body;

      if (!numero_resolucao || !nome_produto || !motivo) {
        return res.status(400).json({ success: false, error: 'Campos Resolução, Produto e Motivo são obrigatórios.' });
      }

      const id = `anvisa-custom-${Date.now()}`;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO anvisa_alerts (
          id, numero_resolucao, data_publicacao, nome_produto, fabricante,
          principio_ativo, motivo, tipo_acao, lote, ean, criado_em, verificado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, 0)
      `).run(
        id,
        numero_resolucao,
        data_publicacao || new Date().toISOString().split('T')[0],
        nome_produto.toUpperCase(),
        (fabricante || '').toUpperCase(),
        principio_ativo || '',
        motivo,
        tipo_acao || 'Proibição',
        lote || '',
        ean || '',
        now
      );

      const alertObj = db.prepare('SELECT * FROM anvisa_alerts WHERE id = ?').get(id);
      const stockInfo = await checkStockForAlert(db, alertObj);

      res.json({
        success: true,
        alert: {
          ...alertObj,
          temEstoque: stockInfo.temEstoque,
          saldoEstoque: stockInfo.saldo
        }
      });
    } catch (err) {
      console.error('[ANVISA API] Erro ao criar alerta:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6. Atualizar a confirmação manual de estoque (Sim / Não / Resetar)
  router.patch('/alerts/:id/toggle-stock', (req, res) => {
    try {
      const { id } = req.params;
      const { temEstoqueManual } = req.body; // 1 = Sim, 0 = Não, null/undefined = Resetar p/ Automático

      const valueToSave = (temEstoqueManual === 1 || temEstoqueManual === 0) ? temEstoqueManual : null;

      db.prepare('UPDATE anvisa_alerts SET tem_estoque_manual = ? WHERE id = ?').run(valueToSave, id);

      res.json({
        success: true,
        message: 'Status de estoque atualizado com sucesso.',
        temEstoqueManual: valueToSave
      });
    } catch (err) {
      console.error('[ANVISA API] Erro ao alterar status manual:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7. Excluir alerta
  router.delete('/alerts/:id', (req, res) => {
    try {
      const { id } = req.params;
      db.prepare('DELETE FROM anvisa_alerts WHERE id = ?').run(id);
      res.json({ success: true, message: 'Alerta removido com sucesso.' });
    } catch (err) {
      console.error('[ANVISA API] Erro ao excluir alerta:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
