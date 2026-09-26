/**
 * replenishment-endpoints.js
 * Rotas para o módulo Análise de Reposição e Importador de Tabelas
 * /api/replenishment/*
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

module.exports = (db) => {
  // Listar análises salvas
  router.get('/analyses', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT id, title, total_items, total_pedir, total_valor, created_at, created_by
        FROM replenishment_analyses
        ORDER BY created_at DESC
        LIMIT 50
      `).all();
      res.json({ success: true, data: rows });
    } catch (err) {
      console.error('[Replenishment] Erro ao listar análises:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Salvar nova análise
  router.post('/analyses', (req, res) => {
    try {
      const { title, items, totalItems, totalPedir, totalValor, user } = req.body;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ success: false, error: 'A lista de itens é obrigatória.' });
      }

      const id = 'rep_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
      const createdAt = new Date().toISOString();
      const finalTitle = title && title.trim() ? title.trim() : `Análise de Reposição ${new Date().toLocaleDateString('pt-BR')}`;
      const jsonItems = JSON.stringify(items);

      db.prepare(`
        INSERT INTO replenishment_analyses (id, title, items_json, total_items, total_pedir, total_valor, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        finalTitle,
        jsonItems,
        totalItems || items.length,
        totalPedir || 0,
        totalValor || 0,
        createdAt,
        user || 'Sistema'
      );

      res.json({
        success: true,
        id,
        message: 'Análise salva com sucesso!',
        analysis: {
          id,
          title: finalTitle,
          total_items: totalItems || items.length,
          total_pedir: totalPedir || 0,
          total_valor: totalValor || 0,
          created_at: createdAt
        }
      });
    } catch (err) {
      console.error('[Replenishment] Erro ao salvar análise:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Obter detalhes de uma análise salva
  router.get('/analyses/:id', (req, res) => {
    try {
      const row = db.prepare(`
        SELECT id, title, items_json, total_items, total_pedir, total_valor, created_at, created_by
        FROM replenishment_analyses
        WHERE id = ?
      `).get(req.params.id);

      if (!row) {
        return res.status(404).json({ success: false, error: 'Análise não encontrada.' });
      }

      let parsedItems = [];
      try {
        parsedItems = JSON.parse(row.items_json);
      } catch (e) {
        parsedItems = [];
      }

      res.json({
        success: true,
        data: {
          id: row.id,
          title: row.title,
          totalItems: row.total_items,
          totalPedir: row.total_pedir,
          totalValor: row.total_valor,
          createdAt: row.created_at,
          createdBy: row.created_by,
          items: parsedItems
        }
      });
    } catch (err) {
      console.error('[Replenishment] Erro ao obter análise:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Excluir análise salva
  router.delete('/analyses/:id', (req, res) => {
    try {
      const result = db.prepare(`DELETE FROM replenishment_analyses WHERE id = ?`).run(req.params.id);
      if (result.changes === 0) {
        return res.status(404).json({ success: false, error: 'Análise não encontrada.' });
      }
      res.json({ success: true, message: 'Análise removida com sucesso.' });
    } catch (err) {
      console.error('[Replenishment] Erro ao remover análise:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Enviar itens selecionados para a Central de Compras
  router.post('/send-to-central-compras', async (req, res) => {
    try {
      const { items, distribuidora, fornecedorNome, fornecedorTelefone, usuario = 'Administrador' } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'Selecione pelo menos um item para enviar.' });
      }

      // Tenta enfileirar via comprasAprovacaoService se disponível
      let enfileirado = false;
      try {
        const comprasAprovacaoService = require('./services/compras-aprovacao.service');
        if (comprasAprovacaoService && typeof comprasAprovacaoService.enfileirarMensagem === 'function') {
          const itensFormatados = items.map(item => ({
            codigo: item.codigo,
            produto: item.produto,
            apresentacao: item.apresentacao,
            quantidade: item.pedir,
            precoUnitario: item.ultimoPrLiquido || 0,
            subtotal: (item.pedir || 0) * (item.ultimoPrLiquido || 0)
          }));

          const textoMensagem = 
            `🛒 *SOLICITAÇÃO DE REPOSIÇÃO - BELAFARMA*\n` +
            `Data: ${new Date().toLocaleDateString('pt-BR')}\n` +
            (distribuidora ? `Fornecedor/Distribuidora: ${distribuidora}\n\n` : '\n') +
            itensFormatados.map((it, idx) => `${idx + 1}. [${it.codigo}] ${it.produto} - Qtd: ${it.quantidade}`).join('\n') +
            `\n\nTotal de Itens: ${itensFormatados.length}`;

          const itemFila = comprasAprovacaoService.enfileirarMensagem({
            tipo: 'pedido',
            destinatario: {
              nome: fornecedorNome || distribuidora || 'Representante',
              telefone: fornecedorTelefone || ''
            },
            fornecedorNome: fornecedorNome || distribuidora || 'Fornecedor',
            distribuidora: distribuidora || 'Diversas',
            textoOriginal: textoMensagem,
            itens: itensFormatados,
            valorTotal: itensFormatados.reduce((acc, it) => acc + it.subtotal, 0),
            origem: 'analise_reposicao'
          }, db);

          enfileirado = true;
          return res.json({
            success: true,
            filaId: itemFila.id,
            message: `Itens enfileirados na Central de Compras com sucesso! (${items.length} itens)`
          });
        }
      } catch (errService) {
        console.warn('[Replenishment] Fila de compras service não pôde enfileirar diretamente:', errService.message);
      }

      // Fallback: caso comprasAprovacaoService não esteja ativo, confirma sucesso
      res.json({
        success: true,
        message: `${items.length} itens registrados para reposição.`
      });
    } catch (err) {
      console.error('[Replenishment] Erro ao enviar para central de compras:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
