/**
 * Belinha ERP - Controlled Medications Endpoints
 * Rotas da API REST para Medicamentos Controlados, Receitas e SNGPC/VISA
 */

const express = require('express');
const router = express.Router();

const {
  classifyProduct,
  searchPrescribers,
  upsertPrescriber,
  searchBuyers,
  upsertBuyer,
  recordSaleRecipes,
  listSaleRecipes,
  recordSanitaryLoss,
  listSanitaryLosses,
  deleteSanitaryLoss,
  syncInitialData
} = require('./controlled-medications.service');

// 1. Classificação de Produto (Retenção e Cor de Receita)
router.post('/classify', (req, res) => {
  try {
    const result = classifyProduct(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 2. Busca rápida de Prescritores / Médicos
router.get('/prescribers', (req, res) => {
  try {
    const list = searchPrescribers(req.query.q);
    res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/prescribers', (req, res) => {
  try {
    const saved = upsertPrescriber(req.body);
    res.status(201).json({ success: true, data: saved });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 3. Busca rápida de Compradores
router.get('/buyers', (req, res) => {
  try {
    const list = searchBuyers(req.query.q);
    res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/buyers', (req, res) => {
  try {
    const saved = upsertBuyer(req.body);
    res.status(201).json({ success: true, data: saved });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 4. Livro de Receitas Retidas (Vendas)
router.get('/recipes', (req, res) => {
  try {
    const { dataInicio, dataFim, recipeType, search, limit, offset } = req.query;
    const list = listSaleRecipes({
      dataInicio,
      dataFim,
      recipeType,
      search,
      limit: parseInt(limit, 10) || 100,
      offset: parseInt(offset, 10) || 0
    });
    res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Perdas Sanitárias (Validade Vencida / Avarias / VISA)
router.get('/losses', (req, res) => {
  try {
    const { dataInicio, dataFim, search, limit, offset } = req.query;
    const list = listSanitaryLosses({
      dataInicio,
      dataFim,
      search,
      limit: parseInt(limit, 10) || 100,
      offset: parseInt(offset, 10) || 0
    });
    res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/losses', (req, res) => {
  try {
    const saved = recordSanitaryLoss(req.body);
    res.status(201).json({ success: true, data: saved });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/losses/:id', (req, res) => {
  try {
    deleteSanitaryLoss(req.params.id);
    res.json({ success: true, message: 'Registro de perda excluído com sucesso.' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 6. Sincronização inicial de cadastros rápidos
router.post('/sync-initial', (req, res) => {
  try {
    const result = syncInitialData();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

