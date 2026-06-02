const express = require('express');
const { 
  obterResumoEstoque, 
  listarProdutosEstoque, 
  obterCategorias,
  obterInformacoesVendasProdutos,
  limparCacheEstoque
} = require('./services/stock.service');

module.exports = function () {
  const router = express.Router();

  // 1. Obter cards informativos de resumo do estoque
  router.get('/summary', async (req, res) => {
    try {
      const bypassCache = req.query.bypassCache === 'true';
      if (bypassCache) {
        limparCacheEstoque();
      }
      const summary = await obterResumoEstoque(bypassCache);
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
      const { limit, offset, search, daysWithoutSales, stockStatus, categoryId, sort, bypassCache } = req.query;
      
      const isBypass = bypassCache === 'true';
      if (isBypass) {
        limparCacheEstoque();
      }

      const result = await listarProdutosEstoque({
        limit,
        offset,
        search,
        daysWithoutSales,
        stockStatus,
        categoryId,
        sort,
        bypassCache: isBypass
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
      const bypassCache = req.query.bypassCache === 'true';
      if (bypassCache) {
        limparCacheEstoque();
      }
      const categories = await obterCategorias(bypassCache);
      res.json(categories);
    } catch (err) {
      if (err.message && err.message.includes('Offline')) {
        return res.status(503).json({ error: 'Servidor do Digifarma Offline' });
      }
      console.error('[Stock API] Erro em /categories:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Obter informações adicionais de venda em lote (Lazy Loading)
  router.post('/products/sales-info', async (req, res) => {
    try {
      const { productIds } = req.body;
      if (!Array.isArray(productIds)) {
        return res.status(400).json({ error: 'Parâmetro productIds é obrigatório e deve ser um array.' });
      }
      const salesInfo = await obterInformacoesVendasProdutos(productIds);
      res.json(salesInfo);
    } catch (err) {
      if (err.message && err.message.includes('Offline')) {
        return res.status(503).json({ error: 'Servidor do Digifarma Offline' });
      }
      console.error('[Stock API] Erro em /products/sales-info:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
