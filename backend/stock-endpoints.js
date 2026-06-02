const express = require('express');
const { 
  obterResumoEstoque, 
  listarProdutosEstoque, 
  obterCategorias 
} = require('./services/stock.service');

module.exports = function () {
  const router = express.Router();

  // 1. Obter cards informativos de resumo do estoque
  router.get('/summary', async (req, res) => {
    try {
      const summary = await obterResumoEstoque();
      res.json(summary);
    } catch (err) {
      if (err.message && err.message.includes('Offline')) {
        return res.status(503).json({ error: 'Servidor do Digifarma Offline' });
      }
      console.error('[Stock API] Erro em /summary:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Obter listagem filtrada e paginada de produtos do estoque
  router.get('/products', async (req, res) => {
    try {
      const { limit, offset, search, daysWithoutSales, stockStatus, categoryId, sort } = req.query;
      const result = await listarProdutosEstoque({
        limit,
        offset,
        search,
        daysWithoutSales,
        stockStatus,
        categoryId,
        sort
      });
      res.json(result);
    } catch (err) {
      if (err.message && err.message.includes('Offline')) {
        return res.status(503).json({ error: 'Servidor do Digifarma Offline' });
      }
      console.error('[Stock API] Erro em /products:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Obter categorias de produtos
  router.get('/categories', async (req, res) => {
    try {
      const categories = await obterCategorias();
      res.json(categories);
    } catch (err) {
      if (err.message && err.message.includes('Offline')) {
        return res.status(503).json({ error: 'Servidor do Digifarma Offline' });
      }
      console.error('[Stock API] Erro em /categories:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
