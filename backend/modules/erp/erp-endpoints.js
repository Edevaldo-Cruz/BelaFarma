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
  cancelarVenda,
  registrarMovimentacaoCaixa,
  listarMovimentacoesCaixa,
  criarPreVenda,
  listarPreVendas,
  obterPreVenda,
  consumirPreVenda,
  consultarStatusCrediarioCliente
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
  atualizarNfceAutorizadaDigifarma,
  sincronizarMovimentacaoCaixaDigifarma
} = require('./erp-digifarma-sales-sync.service');

const {
  calcularRbt12EAliquotas,
  processarApuracaoFiscal,
  quickFixProdutoFiscal,
  gerarSpedFiscalEfd,
  exportarRelatorioContabilCsv
} = require('./fiscal-accounting.service');

const { gerarArquivoSintegra } = require('./sintegra.service');

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
    const { limit, onlyWithStock } = req.query;
    const q = req.query.q || req.query.query || '';
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

/**
 * Identificação Rápida de Vendedor por Chave de Acesso (< 2ms)
 * Permite identificar o vendedor sem travar o caixa.
 */
router.post('/pos/identify-seller', (req, res) => {
  try {
    const security = require('../../security');
    const { db } = require('./erp-database');

    const { accessKey } = req.body || {};
    if (!accessKey) {
      return res.status(400).json({ success: false, error: 'Chave de acesso não informada.' });
    }

    const keyStr = String(accessKey).trim();
    const MASTER_KEY = process.env.MASTER_ACCESS_KEY || 'belafarma2024';

    // 1. Testa Chave Master
    if (security.verifyAccessKey(keyStr, MASTER_KEY)) {
      return res.json({
        success: true,
        seller: {
          id: 'master-admin',
          name: 'Administrador Bela',
          role: 'Administrador',
          jobRole: 'Gerente'
        }
      });
    }

    // 2. Procura nos usuários cadastrados no banco
    const allUsers = db.prepare('SELECT id, name, role, jobRole, accessKey, accessKeyHash FROM users').all();
    const matchedUser = allUsers.find(u => security.verifyAccessKey(keyStr, u.accessKey, u.accessKeyHash));

    if (matchedUser) {
      return res.json({
        success: true,
        seller: {
          id: matchedUser.id,
          name: matchedUser.name,
          role: matchedUser.role,
          jobRole: matchedUser.jobRole || 'Vendedor'
        }
      });
    }

    return res.status(401).json({ success: false, error: 'Chave de acesso não encontrada ou incorreta.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/pos/checkout', async (req, res) => {
  try {
    const userName = req.headers['x-user-name'] || req.body.user_name || req.body.seller_name || 'Caixa';
    const resultado = registrarVenda({
      ...req.body,
      user_name: userName
    });

    const { emit_nfce, customer_cpf, customer_name } = req.body;

    // Resposta imediata (< 15ms) para não travar o caixa
    res.status(201).json({
      ...resultado,
      fiscal: emit_nfce ? { status: 'EM_PROCESSAMENTO' } : null,
      danfe: null
    });

    // Processamento de emissão fiscal (SEFAZ) e sincronização externa em segundo plano
    setImmediate(async () => {
      let fiscalResult = null;
      let danfe = null;

      if (emit_nfce) {
        try {
          danfe = await emitirCupomFiscal(resultado.sale_id, { customer_cpf, customer_name });
          if (danfe && danfe.non_fiscal) {
            fiscalResult = { success: true, non_fiscal: true };
            console.log(`[Belinha PDV] ℹ️ Venda ${resultado.sale_id} concluída como Cupom Não Fiscal (itens sem cadastro fiscal)`);
          } else {
            fiscalResult = {
              success: true,
              chave: danfe.chave_acesso || danfe.chNFe,
              nfe_number: danfe.nfe_number || danfe.nNF,
              serie: danfe.serie,
              protocolo: danfe.protocol_number || danfe.nProt,
              url_qrcode: danfe.qr_code_url
            };
            console.log(`[Belinha PDV] ✅ NFC-e #${fiscalResult.nfe_number} emitida com sucesso em 2º plano para venda ${resultado.sale_id}`);
          }
        } catch (fiscalErr) {
          console.warn(`[Belinha PDV] ⚠️ Falha ao emitir NFC-e via SEFAZ em 2º plano para venda ${resultado.sale_id}:`, fiscalErr.message);
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

      // Sincronização em segundo plano com o Digifarma
      try {
        await sincronizarVendaDigifarma(resultado, fiscalResult);
      } catch (syncErr) {
        console.log(`[Belinha PDV] ℹ️ Digifarma background sync: ${syncErr.message}`);
      }
    });
  } catch (err) {
    console.error('[Belinha PDV /pos/checkout ERROR]:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// Reprocessar todas as vendas pendentes para o Digifarma
router.post('/pos/digifarma/sync-pending', async (req, res) => {
  try {
    const { reprocessarVendasPendentesDigifarma } = require('./erp-digifarma-sales-sync.service');
    const result = await reprocessarVendasPendentesDigifarma();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reprocessar uma venda específica para o Digifarma
router.post('/pos/digifarma/sync/:saleId', async (req, res) => {
  try {
    const { db } = require('./erp-database');
    const { sincronizarVendaDigifarma } = require('./erp-digifarma-sales-sync.service');
    const s = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.saleId);
    if (!s) {
      return res.status(404).json({ success: false, error: 'Venda não encontrada' });
    }
    const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(s.id);
    const payments = db.prepare('SELECT * FROM sale_payments WHERE sale_id = ?').all(s.id);

    const fiscalInfo = s.fiscal_status === 'AUTORIZADA' ? {
      success: true,
      chave: s.access_key,
      nfe_number: s.nfe_number,
      serie: s.nfe_series || 1,
      protocolo: s.protocol_number,
      url_qrcode: s.qr_code_url
    } : null;

    const syncResult = await sincronizarVendaDigifarma({
      sale_id: s.id,
      items,
      payments,
      total_items_value: s.total_items_value,
      discount_value: s.discount_value,
      total_value: s.total_value,
      user_name: s.user_name || s.seller_name || 'Caixa'
    }, fiscalInfo);

    res.json(syncResult);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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

// Movimentações de Caixa (Sangria e Suprimento)
router.post('/pos/cash-movement', async (req, res) => {
  try {
    const { movement_type, amount, reason, user_name } = req.body;
    const mov = registrarMovimentacaoCaixa({
      movement_type,
      amount,
      reason,
      user_name: user_name || req.headers['x-user-name'] || 'Caixa'
    });

    // Dispara sincronização em segundo plano com o CAIXA do Digifarma
    sincronizarMovimentacaoCaixaDigifarma(mov).then(syncRes => {
      const { db } = require('./erp-database');
      if (syncRes && syncRes.success) {
        db.prepare(`
          UPDATE cash_movements 
          SET digifarma_sync_status = 'SINCRONIZADO',
              digifarma_caixa_id = ?
          WHERE id = ?
        `).run(syncRes.caixa_id, mov.id);
      } else {
        db.prepare(`
          UPDATE cash_movements 
          SET digifarma_sync_status = 'FALHA',
              digifarma_sync_error = ?
          WHERE id = ?
        `).run(syncRes?.error || 'Erro desconhecido', mov.id);
      }
    }).catch(err => {
      console.warn('[PDV Movimentação] ⚠️ Falha na sincronização assíncrona com Digifarma:', err.message);
    });

    res.json(mov);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/pos/cash-movements', (req, res) => {
  try {
    const { date } = req.query;
    const resultado = listarMovimentacoesCaixa(date);
    res.json({ success: true, data: resultado });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Consulta de Crediário e Limite do Cliente
router.get('/pos/customer-credit/:term', (req, res) => {
  try {
    const info = consultarStatusCrediarioCliente(req.params.term);
    if (!info) {
      return res.status(404).json({ success: false, error: 'Cliente não encontrado no cadastro de crediário.' });
    }
    res.json({ success: true, data: info });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Pré-Vendas e Orçamentos (Balcão / WhatsApp)
router.post('/pos/pre-sales', (req, res) => {
  try {
    const resultado = criarPreVenda(req.body);
    res.json(resultado);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/pos/pre-sales', (req, res) => {
  try {
    const { status, limit } = req.query;
    const lista = listarPreVendas({ status, limit: parseInt(limit, 10) || 30 });
    res.json({ success: true, data: lista });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/pos/pre-sales/:id', (req, res) => {
  try {
    const ps = obterPreVenda(req.params.id);
    if (!ps) {
      return res.status(404).json({ success: false, error: 'Pré-venda não encontrada.' });
    }
    res.json({ success: true, data: ps });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/pos/pre-sales/:id/consume', (req, res) => {
  try {
    const { sale_id } = req.body;
    const resultado = consumirPreVenda(req.params.id, sale_id);
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
// 5.1. ROTAS CONTÁBEIS, APURAÇÃO DO SIMPLES (PGDAS-D) & SPED FISCAL
// ==========================================

// Consulta ou processa a apuração fiscal do Simples Nacional para uma competência/período
router.get('/fiscal/apuracao', async (req, res) => {
  try {
    const { competencia, aliquotaManual, dataInicial, dataFinal } = req.query;
    const now = new Date();
    const comp = competencia || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    const aliq = aliquotaManual ? parseFloat(aliquotaManual) : null;
    const resultado = await processarApuracaoFiscal(comp, {
      aliquotaManual: aliq,
      dataInicial,
      dataFinal
    });

    res.json({ success: true, ...resultado });
  } catch (err) {
    console.error('[Fiscal API] Erro na apuração fiscal:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Força o reprocessamento da apuração fiscal
router.post('/fiscal/apuracao/processar', async (req, res) => {
  try {
    const { competencia, aliquotaManual, dataInicial, dataFinal } = req.body;
    const now = new Date();
    const comp = competencia || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const aliq = aliquotaManual ? parseFloat(aliquotaManual) : null;
    const resultado = await processarApuracaoFiscal(comp, {
      aliquotaManual: aliq,
      dataInicial,
      dataFinal
    });

    res.json({ success: true, ...resultado });
  } catch (err) {
    console.error('[Fiscal API] Erro ao processar apuração fiscal:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Download do arquivo oficial SPED Fiscal EFD ICMS/IPI (.TXT)
router.get('/fiscal/sped-txt', (req, res) => {
  try {
    const { competencia } = req.query;
    if (!competencia) {
      return res.status(400).json({ success: false, error: 'Parâmetro competencia (YYYY-MM) obrigatório.' });
    }

    const conteudoSped = gerarSpedFiscalEfd(competencia);
    const filename = `SPED_EFD_${competencia.replace('-', '_')}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=iso-8859-1');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(conteudoSped);
  } catch (err) {
    console.error('[Fiscal API] Erro ao gerar SPED Fiscal:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Download do arquivo oficial SINTEGRA (.TXT - Convênio ICMS 57/95)
router.get('/fiscal/sintegra-txt', (req, res) => {
  try {
    const { competencia } = req.query;
    if (!competencia) {
      return res.status(400).json({ success: false, error: 'Parâmetro competencia (YYYY-MM) obrigatório.' });
    }

    const conteudoSintegra = gerarArquivoSintegra(competencia);
    const filename = `SINTEGRA_${competencia.replace('-', '_')}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=iso-8859-1');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(conteudoSintegra);
  } catch (err) {
    console.error('[Fiscal API] Erro ao gerar SINTEGRA:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Download do Relatório Analítico Consolidado em CSV para a Contabilidade
router.get('/fiscal/relatorio-csv', (req, res) => {
  try {
    const { competencia } = req.query;
    if (!competencia) {
      return res.status(400).json({ success: false, error: 'Parâmetro competencia (YYYY-MM) obrigatório.' });
    }

    const conteudoCsv = exportarRelatorioContabilCsv(competencia);
    const filename = `RELATORIO_SIMPLES_${competencia.replace('-', '_')}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(conteudoCsv);
  } catch (err) {
    console.error('[Fiscal API] Erro ao exportar CSV contábil:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Quick-Fix: Correção rápida de dados fiscais (NCM, CEST, CST) de produto com pendência
router.post('/fiscal/quick-fix', (req, res) => {
  try {
    const { productCode, ncm, cest, tributacao_monofasica, cst_pis, cst_cofins, aliquota_st } = req.body;
    if (!productCode) {
      return res.status(400).json({ success: false, error: 'Código do produto obrigatório.' });
    }

    const resultado = quickFixProdutoFiscal(productCode, {
      ncm,
      cest,
      tributacao_monofasica,
      cst_pis,
      cst_cofins,
      aliquota_st
    });

    res.json(resultado);
  } catch (err) {
    console.error('[Fiscal API] Erro no Quick-Fix de produto:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Configurações Fiscais e Dados do Contador (para SPED / SINTEGRA)
router.get('/fiscal/settings', (req, res) => {
  try {
    initErpDatabase();
    const config = db.prepare('SELECT * FROM fiscal_settings WHERE id = ?').get('primary') || {};
    // Não expõe certificado pfx ou senha completa
    const safeConfig = { ...config, certificate_password: config.certificate_password ? '********' : '' };
    res.json({ success: true, settings: safeConfig });
  } catch (err) {
    console.error('[Fiscal API] Erro ao buscar configurações fiscais:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/fiscal/settings', (req, res) => {
  try {
    initErpDatabase();
    const {
      cnpj, razao_social, nome_fantasia, inscricao_estadual,
      logradouro, numero, bairro, municipio, cod_municipio_ibge, uf, cep,
      contador_nome, contador_cpf, contador_crc, contador_cnpj,
      contador_cep, contador_endereco, contador_numero, contador_bairro,
      contador_telefone, contador_email
    } = req.body;

    db.prepare(`
      UPDATE fiscal_settings SET
        cnpj = COALESCE(?, cnpj),
        razao_social = COALESCE(?, razao_social),
        nome_fantasia = COALESCE(?, nome_fantasia),
        inscricao_estadual = COALESCE(?, inscricao_estadual),
        logradouro = COALESCE(?, logradouro),
        numero = COALESCE(?, numero),
        bairro = COALESCE(?, bairro),
        municipio = COALESCE(?, municipio),
        cod_municipio_ibge = COALESCE(?, cod_municipio_ibge),
        uf = COALESCE(?, uf),
        cep = COALESCE(?, cep),
        contador_nome = COALESCE(?, contador_nome),
        contador_cpf = COALESCE(?, contador_cpf),
        contador_crc = COALESCE(?, contador_crc),
        contador_cnpj = COALESCE(?, contador_cnpj),
        contador_cep = COALESCE(?, contador_cep),
        contador_endereco = COALESCE(?, contador_endereco),
        contador_numero = COALESCE(?, contador_numero),
        contador_bairro = COALESCE(?, contador_bairro),
        contador_telefone = COALESCE(?, contador_telefone),
        contador_email = COALESCE(?, contador_email),
        updated_at = datetime('now', 'localtime')
      WHERE id = 'primary'
    `).run(
      cnpj, razao_social, nome_fantasia, inscricao_estadual,
      logradouro, numero, bairro, municipio, cod_municipio_ibge, uf, cep,
      contador_nome, contador_cpf, contador_crc, contador_cnpj,
      contador_cep, contador_endereco, contador_numero, contador_bairro,
      contador_telefone, contador_email
    );

    const updated = db.prepare('SELECT * FROM fiscal_settings WHERE id = ?').get('primary');
    res.json({ success: true, settings: updated });
  } catch (err) {
    console.error('[Fiscal API] Erro ao salvar configurações fiscais:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 6. ROTAS DE MEDICAMENTOS CONTROLADOS & SNGPC
// ==========================================
router.use('/controlled', require('./controlled-medications-endpoints'));

module.exports = router;


