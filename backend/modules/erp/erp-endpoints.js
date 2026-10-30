/**
 * Belinha ERP - Express Endpoints
 * Rotas da API REST do ERP Nativo Independente
 */

const express = require('express');
const router = express.Router();

const multer = require('multer');
const uploadXml = multer({ limits: { fileSize: 15 * 1024 * 1024 } }); // 15MB

const {
  buscarProdutos,
  buscarProdutosPaginados,
  obterMetricasEstoque,
  obterProdutoPorCodigo,
  cadastrarProduto,
  atualizarPrecoEEstoque
} = require('./erp-products.service');

const {
  registrarVenda,
  cancelarVenda
} = require('./erp-pos.service');

const {
  listarVendas,
  obterVendaDetalhada,
  obterResumoCaixaDoDia
} = require('./erp-sales.service');

const {
  executarMigracaoErp,
  getMigrationHistory
} = require('./erp-migration.service');

const {
  processarPreviewNfe,
  confirmarImportacaoNfe,
  listarNotasEntrada,
  obterNotaDetalhada
} = require('./erp-nfe-inbound.service');

// ==========================================
// 1. ROTAS DE PRODUTOS & ESTOQUE
// ==========================================
router.get('/products/stats', (req, res) => {
  try {
    const stats = obterMetricasEstoque();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/products/catalog', (req, res) => {
  try {
    const { q, page, limit, stockFilter, curve } = req.query;
    const resultado = buscarProdutosPaginados({
      query: q,
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 50,
      stockFilter: stockFilter || 'all',
      curve: curve || 'all'
    });
    res.json({ success: true, ...resultado });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/products', (req, res) => {
  try {
    const { q, limit, onlyWithStock } = req.query;
    const prods = buscarProdutos({
      query: q,
      limit: parseInt(limit, 10) || 40,
      onlyWithStock: onlyWithStock === 'true'
    });
    res.json({ success: true, count: prods.length, data: prods });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/products/:code', (req, res) => {
  try {
    const prod = obterProdutoPorCodigo(req.params.code);
    if (!prod) {
      return res.status(404).json({ success: false, error: 'Produto não encontrado.' });
    }
    res.json({ success: true, data: prod });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/products', (req, res) => {
  try {
    const novo = cadastrarProduto(req.body);
    res.status(201).json({ success: true, data: novo });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.patch('/products/:code', (req, res) => {
  try {
    const updated = atualizarPrecoEEstoque(req.params.code, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// 2. ROTAS DE FRENTE DE CAIXA (PDV)
// ==========================================
router.post('/pos/checkout', (req, res) => {
  try {
    const userName = req.headers['x-user-name'] || req.body.user_name || 'Caixa';
    const resultado = registrarVenda({
      ...req.body,
      user_name: userName
    });
    res.status(201).json(resultado);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/pos/cancel/:id', (req, res) => {
  try {
    const userName = req.headers['x-user-name'] || req.body.user_name || 'Admin';
    const resultado = cancelarVenda(req.params.id, {
      user_name: userName,
      reason: req.body.reason || 'Cancelamento solicitado no caixa'
    });
    res.json(resultado);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// 3. ROTAS DE VENDAS & FECHAMENTO DIÁRIO
// ==========================================
router.get('/sales', (req, res) => {
  try {
    const { dataInicio, dataFim, status, limit, offset } = req.query;
    const vendas = listarVendas({
      dataInicio,
      dataFim,
      status,
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0
    });
    res.json({ success: true, count: vendas.length, data: vendas });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/sales/summary/day', (req, res) => {
  try {
    const { date } = req.query;
    const resumo = obterResumoCaixaDoDia(date);
    res.json({ success: true, data: resumo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/sales/:id', (req, res) => {
  try {
    const venda = obterVendaDetalhada(req.params.id);
    if (!venda) {
      return res.status(404).json({ success: false, error: 'Venda não encontrada.' });
    }
    res.json({ success: true, data: venda });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 4. ROTAS DE MIGRAÇÃO DO DIGIFARMA
// ==========================================
router.post('/migration/run', async (req, res) => {
  try {
    const { forceCacheOnly, resetTables } = req.body || {};
    const resultado = await executarMigracaoErp({
      forceCacheOnly: Boolean(forceCacheOnly),
      resetTables: Boolean(resetTables)
    });
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/migration/history', (req, res) => {
  try {
    const historico = getMigrationHistory();
    res.json({ success: true, data: historico });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 5. ROTAS DE NOTAS FISCAIS (ENTRADA / XML)
// ==========================================
router.post('/invoices/preview-xml', uploadXml.single('xmlFile'), (req, res) => {
  try {
    let xmlContent = '';
    if (req.file && req.file.buffer) {
      xmlContent = req.file.buffer.toString('utf-8');
    } else if (req.body && req.body.xmlString) {
      xmlContent = req.body.xmlString;
    } else {
      return res.status(400).json({ success: false, error: 'Envie um arquivo .xml ou o texto da NF-e no campo xmlString.' });
    }

    const preview = processarPreviewNfe(xmlContent);
    res.json(preview);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/invoices/confirm-import', (req, res) => {
  try {
    const userName = req.headers['x-user-name'] || req.body.created_by || 'Almoxarifado';
    const result = confirmarImportacaoNfe({
      ...req.body,
      created_by: userName
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/invoices', (req, res) => {
  try {
    const { limit, offset, search } = req.query;
    const notas = listarNotasEntrada({
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0,
      search
    });
    res.json({ success: true, count: notas.length, data: notas });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/invoices/:id', (req, res) => {
  try {
    const nota = obterNotaDetalhada(req.params.id);
    if (!nota) {
      return res.status(404).json({ success: false, error: 'Nota fiscal não encontrada.' });
    }
    res.json({ success: true, data: nota });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

