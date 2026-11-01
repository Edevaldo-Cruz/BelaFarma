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

const {
  obterConfiguracoesFiscais,
  salvarConfiguracoesFiscais,
  emitirCupomFiscal,
  obterDanfeNfce,
  cancelarCupomFiscal,
  listarCuponsEmitidos,
  consultarStatusSefaz
} = require('./erp-fiscal.service');

const {
  sincronizarVendaDigifarma,
  atualizarNfceAutorizadaDigifarma
} = require('./erp-digifarma-sales-sync.service');

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
router.post('/pos/checkout', async (req, res) => {
  try {
    const userName = req.headers['x-user-name'] || req.body.user_name || 'Caixa';
    const resultado = registrarVenda({
      ...req.body,
      user_name: userName
    });

    const { emit_nfce, customer_cpf, customer_name } = req.body;
    let fiscalResult = null;
    let danfe = null;

    if (emit_nfce) {
      try {
        danfe = await emitirCupomFiscal(resultado.sale_id, { customer_cpf, customer_name });
        fiscalResult = {
          success: true,
          chave: danfe.chave_acesso || danfe.chNFe,
          nfe_number: danfe.nfe_number || danfe.nNF,
          serie: danfe.serie,
          protocolo: danfe.protocol_number || danfe.nProt,
          url_qrcode: danfe.qr_code_url
        };
      } catch (fiscalErr) {
        console.warn(`[Belinha PDV] ⚠️ Falha ao emitir NFC-e via SEFAZ para venda ${resultado.sale_id}:`, fiscalErr.message);
        fiscalResult = {
          success: false,
          error: fiscalErr.message,
          error_message: fiscalErr.message
        };
        // Grava status ERRO e motivo no banco para rastreio e reenvio na tela de vendas
        try {
          const { db } = require('./erp-database');
          db.prepare(`
            UPDATE sales 
            SET fiscal_status = 'ERRO',
                contingency_reason = ?,
                customer_cpf = COALESCE(?, customer_cpf),
                customer_name = COALESCE(?, customer_name)
            WHERE id = ?
          `).run(fiscalErr.message.substring(0, 255), customer_cpf || null, customer_name || null, resultado.sale_id);
        } catch (dbErr) {}
      }
    }

    // Sincroniza atomicamente com o Digifarma (baixa de estoque, caixa aberto, bloqueio fiscal)
    let digifarmaResult = null;
    try {
      digifarmaResult = await sincronizarVendaDigifarma(resultado, fiscalResult);
    } catch (syncErr) {
      console.error('[Belinha PDV] ❌ Erro ao invocar sincronização com Digifarma:', syncErr.message);
      digifarmaResult = { success: false, error: syncErr.message };
    }

    res.status(201).json({
      ...resultado,
      fiscal: fiscalResult,
      danfe,
      digifarma: digifarmaResult
    });
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
    const { dataInicio, dataFim, status, paymentMethod, limit, offset } = req.query;
    const vendas = listarVendas({
      dataInicio,
      dataFim,
      status,
      paymentMethod,
      limit: parseInt(limit, 10) || 150,
      offset: parseInt(offset, 10) || 0
    });

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const todayLocal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const dateRef = dataInicio || dataFim || todayLocal;
    const resumo = obterResumoCaixaDoDia(dateRef);

    res.json({
      success: true,
      count: vendas.length,
      data: vendas,
      resumo
    });
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
    } else if (req.body && req.body.xml) {
      xmlContent = req.body.xml;
    } else if (req.body && req.body.xmlString) {
      xmlContent = req.body.xmlString;
    } else {
      return res.status(400).json({ success: false, error: 'Envie um arquivo .xml ou o texto da NF-e no campo xml ou xmlString.' });
    }

    const preview = processarPreviewNfe(xmlContent);
    res.json({ success: true, data: preview, ...preview });
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
    res.status(201).json({ success: true, data: result, ...result });
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

// ==========================================
// 6. ROTAS FISCAIS (EMISSÃO DE CUPOM FISCAL NFC-e)
// ==========================================

// Obtém configurações fiscais da farmácia
router.get('/fiscal/settings', (req, res) => {
  try {
    const config = obterConfiguracoesFiscais();
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Atualiza configurações fiscais e Certificado Digital A1
router.post('/fiscal/settings', (req, res) => {
  try {
    const config = salvarConfiguracoesFiscais(req.body);
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Consulta status operacional do WebService da SEFAZ-MG
router.get('/fiscal/status-sefaz', async (req, res) => {
  try {
    const status = await consultarStatusSefaz();
    res.json(status);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Emite ou retransmite cupom fiscal (NFC-e Modelo 65) para uma venda
router.post('/fiscal/emit/:saleId', async (req, res) => {
  try {
    const { customer_cpf, customer_name, contingency, contingency_reason, force_retransmit } = req.body;
    const danfe = await emitirCupomFiscal(req.params.saleId, {
      customer_cpf,
      customer_name,
      contingency,
      contingency_reason,
      force_retransmit: Boolean(force_retransmit)
    });

    // Se autorizou e a venda foi originada com Digifarma, atualiza Digifarma para evitar reenvio duplicado
    try {
      const { atualizarNfceAutorizadaDigifarma } = require('./erp-digifarma-sales-sync.service');
      const { db } = require('./erp-database');
      const saleRow = db.prepare('SELECT digifarma_venda_nota_id FROM sales WHERE id = ?').get(req.params.saleId);
      if (saleRow && saleRow.digifarma_venda_nota_id) {
        await atualizarNfceAutorizadaDigifarma(saleRow.digifarma_venda_nota_id, {
          chave: danfe.access_key || danfe.chave_acesso,
          nfe_number: danfe.nfe_number,
          serie: danfe.nfe_series,
          protocolo: danfe.protocol_number
        });
      }
    } catch (syncErr) {
      console.warn('[Belinha Fiscal] ⚠️ Aviso ao atualizar status fiscal no Digifarma após reenvio:', syncErr.message);
    }

    res.json(danfe);
  } catch (err) {
    // Registra o erro na venda para exibição e tentativas futuras
    try {
      const { db } = require('./erp-database');
      db.prepare(`
        UPDATE sales
        SET fiscal_status = 'ERRO',
            contingency_reason = ?
        WHERE id = ?
      `).run(err.message.substring(0, 255), req.params.saleId);
    } catch (dbErr) {}

    res.status(400).json({ success: false, error: err.message });
  }
});

// Reenvio em lote de notas fiscais pendentes ou com erro no período
router.post('/fiscal/retransmit-batch', async (req, res) => {
  try {
    const { sale_ids = [], dataInicio, dataFim } = req.body;
    const { db } = require('./erp-database');

    let idsToProcess = [];
    if (Array.isArray(sale_ids) && sale_ids.length > 0) {
      idsToProcess = sale_ids;
    } else if (dataInicio) {
      const end = dataFim || dataInicio;
      const rows = db.prepare(`
        SELECT id FROM sales 
        WHERE sale_date BETWEEN ? AND ? 
          AND status = 'CONCLUIDA'
          AND (fiscal_status IS NULL OR fiscal_status IN ('NAO_EMITIDO', 'ERRO', 'CONTINGENCIA'))
        ORDER BY sale_date ASC, sale_time ASC
      `).all(dataInicio, end);
      idsToProcess = rows.map(r => r.id);
    }

    if (idsToProcess.length === 0) {
      return res.json({ success: true, count: 0, processed: 0, sucessos: 0, falhas: 0, resultados: [] });
    }

    const resultados = [];
    let sucessos = 0;
    let falhas = 0;

    for (const sId of idsToProcess) {
      try {
        const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(sId);
        if (!sale || sale.status === 'CANCELADA') continue;

        const danfe = await emitirCupomFiscal(sId, {
          customer_cpf: sale.customer_cpf,
          customer_name: sale.customer_name,
          force_retransmit: true
        });

        // Atualiza Digifarma se necessário
        if (sale.digifarma_venda_nota_id) {
          try {
            const { atualizarNfceAutorizadaDigifarma } = require('./erp-digifarma-sales-sync.service');
            await atualizarNfceAutorizadaDigifarma(sale.digifarma_venda_nota_id, {
              chave: danfe.access_key || danfe.chave_acesso,
              nfe_number: danfe.nfe_number,
              serie: danfe.nfe_series,
              protocolo: danfe.protocol_number
            });
          } catch (e) {}
        }

        sucessos++;
        resultados.push({ sale_id: sId, success: true, nfe_number: danfe.nfe_number });
      } catch (err) {
        falhas++;
        try {
          db.prepare(`UPDATE sales SET fiscal_status = 'ERRO', contingency_reason = ? WHERE id = ?`).run(err.message.substring(0, 255), sId);
        } catch (e) {}
        resultados.push({ sale_id: sId, success: false, error: err.message });
      }
    }

    res.json({
      success: true,
      total: idsToProcess.length,
      sucessos,
      falhas,
      resultados
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Obtém os dados completos do DANFE NFC-e com QR Code para impressão térmica
router.get('/fiscal/danfe/:saleId', async (req, res) => {
  try {
    const danfe = await obterDanfeNfce(req.params.saleId);
    res.json(danfe);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Cancela NFC-e emitida
router.post('/fiscal/cancel/:saleId', (req, res) => {
  try {
    const { motivo } = req.body;
    const resultado = cancelarCupomFiscal(req.params.saleId, motivo);
    res.json(resultado);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Lista cupons fiscais emitidos
router.get('/fiscal/cupons', (req, res) => {
  try {
    const { limit, offset, search, status } = req.query;
    const cupons = listarCuponsEmitidos({
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0,
      search,
      status
    });
    res.json({ success: true, count: cupons.length, data: cupons });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 6. ROTAS DE MEDICAMENTOS CONTROLADOS & SNGPC
// ==========================================
router.use('/controlled', require('./controlled-medications-endpoints'));

module.exports = router;


