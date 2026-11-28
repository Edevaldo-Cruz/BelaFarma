/**
 * compras-endpoints.js
 * Roteador REST da Central de Compras BelaFarma (/api/central-compras/*)
 * 
 * Integração completa com os serviços:
 * - compras-estoque.service.js (Estoque mínimo 30d, CMV ponderado, gravação atômica Firebird)
 * - compras-mineracao.service.js (Mineração de WhatsApp, representantes, ofertas e validação Digifarma)
 * - compras-cotacoes.service.js (Motor de cotações, score ponderado 60/25/15, pedido mínimo, quebras)
 * - compras-aprovacao.service.js (Fila de aprovação obrigatória, alerta duplo, human-in-the-loop)
 * - compras-pedidos.service.js (Espelhos formais de pedido, controle orçamentário, boletos)
 * - baileys-compras-service.js (Instância isolada de WhatsApp comercial)
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Serviços da Central de Compras
const comprasEstoqueService = require('./services/compras-estoque.service');
const comprasMineracaoService = require('./services/compras-mineracao.service');
const comprasCotacoesService = require('./services/compras-cotacoes.service');
const comprasAprovacaoService = require('./services/compras-aprovacao.service');
const comprasPedidosService = require('./services/compras-pedidos.service');
const comprasEquivalentesService = require('./services/compras-equivalentes.service');
const comprasComparadorService = require('./services/compras-comparador-cotacoes.service');

// Serviço WhatsApp Baileys Compras
let baileysComprasService = null;
try {
  baileysComprasService = require('./baileys-compras-service');
} catch (e) {
  console.warn('[Compras-Endpoints] ⚠️ baileys-compras-service não carregado:', e.message);
}

module.exports = (db) => {
  if (baileysComprasService && typeof baileysComprasService.connect === 'function') {
    baileysComprasService.connect(db).catch(err => {
      console.warn('[Compras-Endpoints] ⚠️ Falha na inicialização do Baileys Compras:', err.message);
    });
  }

  // ──────────────────────────────────────────────────────────
  // 1. DASHBOARD & MÉTRICAS CONSOLIDADAS
  // ──────────────────────────────────────────────────────────

  router.get('/dashboard', async (req, res) => {
    try {
      // 1. Resumo de estoque mínimo e rupturas
      const estoqueResumo = comprasEstoqueService.obterResumoEstoqueMinimo();

      // 2. Contador de aprovações pendentes
      const aprovacoesContador = comprasAprovacaoService.obterContadorPendencias();

      // 3. Resumo orçamentário mensal
      const hoje = new Date();
      const mesAtual = hoje.getMonth() + 1;
      const anoAtual = hoje.getFullYear();
      const orcamentoResumo = comprasPedidosService.obterResumoOrcamentoMensal(mesAtual, anoAtual, db);

      // 4. Cotações recentes
      const cotacoesRecentes = comprasCotacoesService.listarCotacoes({ limite: 5, offset: 0 });

      // 5. Oportunidades ativas no radar
      const oportunidadesRecentes = comprasMineracaoService.listarOportunidades({ status: 'Aprovado_Radar', limite: 5 });

      // 6. Pedidos do mês
      const pedidosRecentes = comprasPedidosService.listarPedidos({ mes: mesAtual, ano: anoAtual, limite: 5 }, db);

      // 7. Status da Conexão WhatsApp Comercial
      let whatsappStatus = { isConnected: false, state: 'disconnected', hasQR: false };
      if (baileysComprasService && typeof baileysComprasService.getStatus === 'function') {
        whatsappStatus = baileysComprasService.getStatus();
      }

      res.json({
        success: true,
        data: {
          estoque: estoqueResumo,
          aprovacoes: aprovacoesContador,
          orcamento: orcamentoResumo,
          cotacoesRecentes,
          oportunidadesRecentes,
          pedidosRecentes: pedidosRecentes.pedidos || [],
          whatsapp: whatsappStatus,
          timestamp: new Date().toISOString()
        }
      });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no GET /dashboard:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // 2. ESTOQUE MÍNIMO 30 DIAS & SINCRONIZAÇÃO DIGIFARMA (FIREBIRD)
  // ──────────────────────────────────────────────────────────

  router.get('/estoque/minimo', async (req, res) => {
    try {
      const { status, curva, ciclo, ciclo_vida, cicloVida, busca, apenas_com_vendas, limite, offset } = req.query;
      const result = await comprasEstoqueService.listarProdutosAbaixoDoMinimo({
        status: status || null,
        curva: curva || null,
        cicloVida: ciclo || ciclo_vida || cicloVida || null,
        busca: busca || null,
        apenasComVendas: apenas_com_vendas === 'true' || apenas_com_vendas === '1',
        limite: limite ? parseInt(limite, 10) : 100,
        offset: offset ? parseInt(offset, 10) : 0
      });
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no GET /estoque/minimo:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/estoque/resumo', (req, res) => {
    try {
      const resumo = comprasEstoqueService.obterResumoEstoqueMinimo();
      res.json({ success: true, data: resumo });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/estoque/calcular/:produtoId', async (req, res) => {
    try {
      const { produtoId } = req.params;
      const margem = req.query.margem ? parseFloat(req.query.margem) : 15;
      const calculo = await comprasEstoqueService.calcularEstoqueMinimo30Dias(produtoId, margem);
      res.json({ success: true, data: calculo });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/estoque/sync-digifarma', async (req, res) => {
    try {
      const { itens, produtoId, estoqueMinimo } = req.body;

      if (Array.isArray(itens) && itens.length > 0) {
        // Gravação em lote no Firebird com transação atômica
        const result = await comprasEstoqueService.sincronizarLoteEstoqueMinimoDigifarma(itens);
        return res.json({ success: result.success, ...result });
      }

      if (produtoId !== undefined && estoqueMinimo !== undefined) {
        // Gravação unitária no Firebird
        const result = await comprasEstoqueService.sincronizarEstoqueMinimoDigifarma(produtoId, estoqueMinimo);
        return res.json({ success: result.success, ...result });
      }

      return res.status(400).json({
        success: false,
        error: 'Envie um array de itens ({ produtoId, estoqueMinimo }[]) ou produtoId e estoqueMinimo individuais.'
      });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /estoque/sync-digifarma:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/estoque/recalcular', async (req, res) => {
    try {
      const { margemPercent = 15 } = req.body;
      const result = await comprasEstoqueService.recalcularTodosEstoqueMinimo(margemPercent);
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /estoque/recalcular:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // 3. WHATSAPP COMERCIAL (BAILEYS ISOLADO) & MINERAÇÃO
  // ──────────────────────────────────────────────────────────

  router.get('/whatsapp/status', (req, res) => {
    try {
      if (!baileysComprasService || typeof baileysComprasService.getStatus !== 'function') {
        return res.json({
          success: true,
          data: { connected: false, state: 'disconnected', hasQR: false, error: 'Serviço Baileys não inicializado' }
        });
      }
      const status = baileysComprasService.getStatus();
      res.json({ success: true, data: status });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/whatsapp/qrcode', (req, res) => {
    try {
      if (!baileysComprasService || typeof baileysComprasService.getStatus !== 'function') {
        return res.json({ success: true, hasQR: false, qrCode: null });
      }
      const status = baileysComprasService.getStatus();
      res.json({
        success: true,
        hasQR: Boolean(status.hasQR || status.qrCode),
        qrCode: status.qrCode || null,
        state: status.state || 'disconnected'
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/whatsapp/reconnect', async (req, res) => {
    try {
      if (!baileysComprasService || typeof baileysComprasService.reconnect !== 'function') {
        return res.status(500).json({ success: false, error: 'Serviço Baileys Compras não disponível.' });
      }
      const result = await baileysComprasService.reconnect(db);
      res.json({ success: true, data: result, message: 'Reconexão iniciada com sucesso.' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/whatsapp/disconnect', async (req, res) => {
    try {
      if (!baileysComprasService || typeof baileysComprasService.disconnect !== 'function') {
        return res.status(500).json({ success: false, error: 'Serviço Baileys Compras não disponível.' });
      }
      const result = await baileysComprasService.disconnect();
      res.json({ success: true, data: result, message: 'Sessão desconectada com sucesso.' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/whatsapp/minerar', async (req, res) => {
    try {
      const { dias = 14, forcarReleitura = false } = req.body;
      const resultado = await comprasMineracaoService.executarVarreduraRetroativa90Dias(db, { dias, forcarReleitura });
      res.json({ success: true, data: resultado, message: 'Varredura e mineração concluídas com sucesso!' });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /whatsapp/minerar:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/minerar-90-dias', async (req, res) => {
    try {
      const resultado = await comprasMineracaoService.executarVarreduraRetroativa90Dias(db, req.body || {});
      res.json({ success: true, data: resultado, message: 'Varredura retroativa de 90 dias concluída com sucesso!' });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /minerar-90-dias:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/mineracao/processar-texto', async (req, res) => {
    try {
      const { text, phone = '5532999990000', pushName = 'Representante Comercial' } = req.body;
      if (!text || !text.trim()) {
        return res.status(400).json({ success: false, error: 'Texto da mensagem é obrigatório.' });
      }
      const resultado = await comprasMineracaoService.processarMensagemRecebida({
        id: `manual_${Date.now()}`,
        text,
        phone,
        pushName,
        timestamp: Date.now()
      }, db);
      res.json({ success: true, data: resultado, message: 'Texto processado e minerado com sucesso!' });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /mineracao/processar-texto:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/mineracao/limpar', (req, res) => {
    try {
      const { tudo } = req.body || {};
      const resultado = comprasMineracaoService.limparOportunidadesServidor(db, { tudo: tudo === true });
      res.json(resultado);
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /mineracao/limpar:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete('/oportunidades/:id', (req, res) => {
    try {
      const { id } = req.params;
      db.prepare('DELETE FROM compras_oportunidades_mineradas WHERE id = ?').run(id);
      res.json({ success: true, message: 'Oportunidade removida com sucesso.' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/central-compras/sincronizar-ultimas-compras
   * Sincronização em lote de alta performance das últimas entradas do Digifarma para SQLite (R2)
   * e recálculo automático das ofertas mineradas (R3).
   */
  router.post('/sincronizar-ultimas-compras', async (req, res) => {
    try {
      const resultado = await comprasMineracaoService.sincronizarUltimasComprasDigifarma(db, req.body || {});
      res.json({
        success: true,
        message: resultado.message || 'Sincronização de últimas compras realizada com sucesso!',
        ...resultado,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /sincronizar-ultimas-compras:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/central-compras/recalcular-ofertas-mineradas
   * Recálculo automático das oportunidades com os valores exatos de última compra (R3).
   */
  router.post('/recalcular-ofertas-mineradas', async (req, res) => {
    try {
      const resultado = comprasMineracaoService.recalcularOfertasMineradas(db);
      res.json({
        success: true,
        message: resultado.message || 'Oportunidades recalculadas com sucesso!',
        ...resultado,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /recalcular-ofertas-mineradas:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/central-compras/mineracao/variacao-precos
   * Retorna série temporal de variação de preços do produto por fornecedor
   */
  router.get('/mineracao/variacao-precos', async (req, res) => {
    try {
      const { produto, ean } = req.query;
      if (!produto && !ean) {
        return res.status(400).json({ success: false, error: 'Parâmetro produto ou ean é obrigatório' });
      }
      const resultado = comprasMineracaoService.obterVariacaoPrecosProduto(produto, ean, db);
      res.json({ success: true, data: resultado });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no GET /mineracao/variacao-precos:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/central-compras/mineracao/contexto-mensagem
   * Retorna o contexto da conversa do WhatsApp em torno da oferta minerada
   */
  router.get('/mineracao/contexto-mensagem', async (req, res) => {
    try {
      const { mensagemId, telefone, produtoNome, limite } = req.query;
      const resultado = comprasMineracaoService.obterContextoConversa(mensagemId, telefone, {
        produtoNome,
        limite: limite ? parseInt(limite, 10) : 30
      }, db);
      res.json({ success: true, data: resultado });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no GET /mineracao/contexto-mensagem:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * Atualiza os dados de identificação do fornecedor (Representante, Distribuidora, Prazos de Pagamento, Pedido Mínimo)
   */
  router.post('/mineracao/atualizar-contato', async (req, res) => {
    try {
      const { telefone, representante, distribuidora, prazosPagamento, pedidoMinimo } = req.body;
      const resultado = comprasMineracaoService.atualizarDadosContatoFornecedor({
        telefone,
        representante,
        distribuidora,
        prazosPagamento,
        pedidoMinimo
      }, db);
      res.json({ success: true, data: resultado });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /mineracao/atualizar-contato:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/oportunidades', async (req, res) => {
    try {
      const { status, fornecedor_id, busca, limite, offset, apenas_com_desconto, apenas_hoje } = req.query;
      const apenasHojeBool = apenas_hoje === undefined ? true : (apenas_hoje === 'true' || apenas_hoje === '1');
      let oportunidades = comprasMineracaoService.listarOportunidades(db, {
        status: status || null,
        fornecedorId: fornecedor_id || null,
        busca: busca || null,
        apenasComDesconto: apenas_com_desconto === 'true' || apenas_com_desconto === '1',
        apenasHoje: apenasHojeBool,
        limite: limite ? parseInt(limite, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0
      });

      // Se a tabela estiver completamente vazia e for explicitamente solicitado auto_minerar
      const totalGravadas = db ? (db.prepare('SELECT COUNT(*) as c FROM compras_oportunidades_mineradas').get()?.c || 0) : 0;
      if (oportunidades.length === 0 && totalGravadas === 0 && !busca && !fornecedor_id && req.query.auto_minerar === 'true') {
        try {
          await comprasMineracaoService.executarVarreduraRetroativa90Dias(db, { dias: 1 });
          oportunidades = comprasMineracaoService.listarOportunidades(db, {
            status: status || null,
            fornecedorId: fornecedor_id || null,
            busca: busca || null,
            apenasComDesconto: apenas_com_desconto === 'true' || apenas_com_desconto === '1',
            apenasHoje: apenasHojeBool,
            limite: limite ? parseInt(limite, 10) : 50,
            offset: offset ? parseInt(offset, 10) : 0
          });
        } catch (eScan) {}
      }

      res.json({ success: true, data: oportunidades });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/radar/oportunidades', async (req, res) => {
    try {
      const { status, fornecedor_id, busca, limite, offset, apenas_com_desconto, apenas_hoje } = req.query;
      const apenasHojeBool = apenas_hoje === undefined ? true : (apenas_hoje === 'true' || apenas_hoje === '1');
      let oportunidades = comprasMineracaoService.listarOportunidades(db, {
        status: status || null,
        fornecedorId: fornecedor_id || null,
        busca: busca || null,
        apenasComDesconto: apenas_com_desconto === 'true' || apenas_com_desconto === '1',
        apenasHoje: apenasHojeBool,
        limite: limite ? parseInt(limite, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0
      });

      if (oportunidades.length === 0 && !busca && !fornecedor_id && req.query.auto_minerar === 'true') {
        await comprasMineracaoService.executarVarreduraRetroativa90Dias(db, { dias: 1 });
        oportunidades = comprasMineracaoService.listarOportunidades(db, {
          status: status || null,
          fornecedorId: fornecedor_id || null,
          busca: busca || null,
          apenasComDesconto: apenas_com_desconto === 'true' || apenas_com_desconto === '1',
          apenasHoje: apenasHojeBool,
          limite: limite ? parseInt(limite, 10) : 50,
          offset: offset ? parseInt(offset, 10) : 0
        });
      }

      res.json({ success: true, data: oportunidades });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no GET /radar/oportunidades:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/oportunidades/ranking', async (req, res) => {
    try {
      const { status, fornecedor_id, busca, limite, apenas_hoje, apenas_com_desconto, apenas_bonificadas } = req.query;
      const apenasHojeBool = apenas_hoje === 'true' || apenas_hoje === '1';
      const ranking = comprasMineracaoService.obterRankingOportunidades(db, {
        status: status || null,
        fornecedorId: fornecedor_id || null,
        busca: busca || null,
        apenasHoje: apenasHojeBool,
        apenasComDesconto: apenas_com_desconto !== 'false' && apenas_com_desconto !== '0',
        apenasBonificadas: apenas_bonificadas === 'true' || apenas_bonificadas === '1',
        limite: limite ? parseInt(limite, 10) : 20
      });

      res.json({ success: true, data: ranking });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no GET /oportunidades/ranking:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/oportunidades/bonificadas', async (req, res) => {
    try {
      const { status, fornecedor_id, busca, limite, offset, apenas_hoje } = req.query;
      const apenasHojeBool = apenas_hoje === undefined ? false : (apenas_hoje === 'true' || apenas_hoje === '1');
      const oportunidades = comprasMineracaoService.listarOportunidades(db, {
        status: status || null,
        fornecedorId: fornecedor_id || null,
        busca: busca || null,
        apenasBonificadas: true,
        apenasHoje: apenasHojeBool,
        limite: limite ? parseInt(limite, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0
      });

      res.json({ success: true, data: oportunidades });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no GET /oportunidades/bonificadas:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // 3.1. PROMOÇÕES DO WHATSAPP (ENCARTES & TEXTO CRUZADOS COM ESTOQUE)
  // ──────────────────────────────────────────────────────────

  router.get('/promocoes-whatsapp', (req, res) => {
    try {
      const {
        busca,
        distribuidora,
        curva_abc,
        apenas_abaixo_ult_compra,
        apenas_comprar,
        midia_tipo,
        ordenar = 'desconto_desc',
        limite = 100,
        offset = 0
      } = req.query;

      const lim = Math.max(1, Math.min(500, parseInt(limite, 10) || 100));
      const off = Math.max(0, parseInt(offset, 10) || 0);

      let whereConditions = ['m.preco_ofertado > 0'];
      const params = [];

      if (busca && busca.trim()) {
        const b = `%${busca.trim()}%`;
        whereConditions.push('(m.produto_nome LIKE ? OR m.distribuidora LIKE ? OR m.representante LIKE ? OR m.ean LIKE ? OR e.descricao LIKE ?)');
        params.push(b, b, b, b, b);
      }

      if (distribuidora && distribuidora.trim()) {
        whereConditions.push('m.distribuidora LIKE ?');
        params.push(`%${distribuidora.trim()}%`);
      }

      if (curva_abc && ['A', 'B', 'C'].includes(curva_abc.toUpperCase())) {
        whereConditions.push('COALESCE(e.curva_abc, "C") = ?');
        params.push(curva_abc.toUpperCase());
      }

      if (midia_tipo && midia_tipo !== 'todos') {
        whereConditions.push('m.midia_tipo = ?');
        params.push(midia_tipo);
      }

      const precoUltCompraSql = `COALESCE(
        NULLIF(e.preco_unitario_ult_compra, 0),
        NULLIF(e.ultima_compra_valor, 0),
        NULLIF(u.preco_unitario_ult_compra, 0),
        NULLIF(m.preco_ult_compra_digifarma, 0),
        NULLIF(e.custo_unitario, 0),
        0
      )`;

      if (apenas_abaixo_ult_compra === 'true' || apenas_abaixo_ult_compra === '1') {
        whereConditions.push(`m.preco_ofertado < ${precoUltCompraSql}`);
      }

      if (apenas_comprar === 'true' || apenas_comprar === '1') {
        whereConditions.push(`ROUND(MAX(0, (COALESCE(e.vmd_ponderado, 0) * 30) - COALESCE(e.saldo, 0)), 1) > 0`);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      let orderSql = 'ORDER BY percentual_desconto DESC, data_oferta DESC';
      if (ordenar === 'comprar_desc') {
        orderSql = 'ORDER BY comprar_suprir_semana DESC, percentual_desconto DESC';
      } else if (ordenar === 'preco_asc') {
        orderSql = 'ORDER BY m.preco_ofertado ASC';
      } else if (ordenar === 'data_desc') {
        orderSql = 'ORDER BY COALESCE(m.data_oferta, m.created_at) DESC';
      } else if (ordenar === 'saldo_asc') {
        orderSql = 'ORDER BY saldo ASC';
      }

      const sqlData = `
        SELECT 
          m.id,
          m.produto_nome,
          m.distribuidora,
          m.representante,
          m.telefone,
          m.preco_ofertado,
          ${precoUltCompraSql} as preco_ult_compra,
          m.data_oferta,
          m.midia_tipo,
          h.midia_path,
          m.confianca_ocr,
          COALESCE(m.trecho_original, m.linha_raw, m.mensagem_raw) as texto_original,
          COALESCE(m.produto_id, e.produto_id) as produto_id,
          COALESCE(m.ean, e.ean) as ean,
          m.status,
          COALESCE(u.fornecedor_nome, e.ultima_compra_fornecedor, m.ultimo_fornecedor) as ult_fornecedor,
          m.tem_bonificacao,
          m.bonificacao_detalhe,
          COALESCE(e.saldo, 0) as saldo,
          COALESCE(e.curva_abc, 'C') as curva_abc,
          ROUND(COALESCE(e.vmd_ponderado, 0), 2) as vmd_ponderado,
          ROUND(COALESCE(e.saldo, 0) * COALESCE(NULLIF(e.custo_unitario, 0), m.preco_ofertado, 0), 2) as valor_estoque,
          ROUND(MAX(0, (COALESCE(e.vmd_ponderado, 0) * 30) - COALESCE(e.saldo, 0)), 1) as comprar_suprir_semana,
          COALESCE(NULLIF(e.custo_unitario, 0), m.preco_ofertado) as custo_unitario,
          CASE 
            WHEN ${precoUltCompraSql} > 0 
            THEN ROUND(((${precoUltCompraSql} - m.preco_ofertado) / ${precoUltCompraSql}) * 100, 2)
            ELSE 0 
          END as percentual_desconto,
          CASE 
            WHEN ${precoUltCompraSql} > 0 AND m.preco_ofertado < ${precoUltCompraSql} THEN 1 
            ELSE 0 
          END as abaixo_ult_compra
        FROM compras_oportunidades_mineradas m
        LEFT JOIN compras_estoque_cache e ON (m.produto_id IS NOT NULL AND m.produto_id = e.produto_id)
                                          OR (m.ean IS NOT NULL AND m.ean != '' AND m.ean = e.ean)
        LEFT JOIN digifarma_ultimas_compras_cache u ON (m.produto_id IS NOT NULL AND m.produto_id = u.produto_id)
                                                    OR (m.ean IS NOT NULL AND m.ean != '' AND m.ean = u.ean)
        LEFT JOIN compras_historico_mensagens h ON m.mensagem_id = h.message_id
        ${whereClause}
        ${orderSql}
        LIMIT ? OFFSET ?
      `;

      const rows = db.prepare(sqlData).all(...params, lim, off);

      // Total count with filters
      const sqlCount = `
        SELECT COUNT(*) as count
        FROM compras_oportunidades_mineradas m
        LEFT JOIN compras_estoque_cache e ON (m.produto_id IS NOT NULL AND m.produto_id = e.produto_id)
                                          OR (m.ean IS NOT NULL AND m.ean != '' AND m.ean = e.ean)
        LEFT JOIN digifarma_ultimas_compras_cache u ON (m.produto_id IS NOT NULL AND m.produto_id = u.produto_id)
                                                    OR (m.ean IS NOT NULL AND m.ean != '' AND m.ean = u.ean)
        ${whereClause}
      `;
      const totalCount = db.prepare(sqlCount).get(...params)?.count || 0;

      // Resumo geral (métricas)
      const resumo = db.prepare(`
        SELECT
          COUNT(*) as total_promocoes,
          SUM(CASE WHEN m.preco_ofertado < ${precoUltCompraSql} THEN 1 ELSE 0 END) as abaixo_ult_compra,
          SUM(CASE WHEN COALESCE(e.curva_abc, 'C') = 'A' AND ROUND(MAX(0, (COALESCE(e.vmd_ponderado, 0) * 30) - COALESCE(e.saldo, 0)), 1) > 0 THEN 1 ELSE 0 END) as curva_a_comprar,
          COUNT(DISTINCT m.distribuidora) as total_distribuidoras,
          SUM(CASE WHEN DATE(COALESCE(m.data_oferta, m.created_at)) >= DATE('now', '-1 day') THEN 1 ELSE 0 END) as novas_24h
        FROM compras_oportunidades_mineradas m
        LEFT JOIN compras_estoque_cache e ON (m.produto_id IS NOT NULL AND m.produto_id = e.produto_id)
                                          OR (m.ean IS NOT NULL AND m.ean != '' AND m.ean = e.ean)
        LEFT JOIN digifarma_ultimas_compras_cache u ON (m.produto_id IS NOT NULL AND m.produto_id = u.produto_id)
                                                    OR (m.ean IS NOT NULL AND m.ean != '' AND m.ean = u.ean)
        WHERE m.preco_ofertado > 0
      `).get();

      res.json({
        success: true,
        data: rows,
        total: totalCount,
        resumo: {
          total_promocoes: resumo?.total_promocoes || 0,
          abaixo_ult_compra: resumo?.abaixo_ult_compra || 0,
          curva_a_comprar: resumo?.curva_a_comprar || 0,
          total_distribuidoras: resumo?.total_distribuidoras || 0,
          novas_24h: resumo?.novas_24h || 0
        }
      });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no GET /promocoes-whatsapp:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/promocoes-whatsapp/novas-count', (req, res) => {
    try {
      const { since } = req.query;
      let sinceClause = "DATE(COALESCE(m.data_oferta, m.created_at)) >= DATE('now', '-1 day')";
      const params = [];

      if (since) {
        const sinceDate = !isNaN(Number(since)) ? new Date(Number(since)).toISOString() : new Date(since).toISOString();
        sinceClause = "COALESCE(m.data_oferta, m.created_at) > ?";
        params.push(sinceDate);
      }

      const row = db.prepare(`
        SELECT 
          COUNT(*) as count,
          MAX(COALESCE(m.data_oferta, m.created_at)) as ultima_oferta
        FROM compras_oportunidades_mineradas m
        WHERE m.preco_ofertado > 0 AND ${sinceClause}
      `).get(...params);

      const totais = db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN DATE(COALESCE(m.data_oferta, m.created_at)) >= DATE('now', '-1 day') THEN 1 ELSE 0 END) as novas_24h
        FROM compras_oportunidades_mineradas m
        WHERE m.preco_ofertado > 0
      `).get();

      res.json({
        success: true,
        data: {
          count: row?.count || 0,
          ultima_oferta: row?.ultima_oferta || null,
          total: totais?.total || 0,
          novas_24h: totais?.novas_24h || 0
        }
      });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no GET /promocoes-whatsapp/novas-count:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // 4. MOTOR DE COTAÇÕES, RANKING PONDERADO & PEDIMO MÍNIMO
  // ──────────────────────────────────────────────────────────

  router.get('/cotacoes', (req, res) => {
    try {
      const { status, busca, limite, offset } = req.query;
      let cotacoes = comprasCotacoesService.listarCotacoes(db, {
        status: status || null,
        busca: busca || null,
        limite: limite ? parseInt(limite, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0
      });

      // Se não houver cotações criadas, gera automaticamente uma para produtos críticos em estoque
      if (cotacoes.length === 0) {
        try {
          const auto = comprasCotacoesService.gerarSessaoCotacaoAutomaticaParaEstoqueCritico(db);
          if (auto && auto.id) {
            cotacoes = comprasCotacoesService.listarCotacoes(db, { limite: 10 });
          }
        } catch (autoErr) {
          console.warn('[Compras-Endpoints] Auto-cotação:', autoErr.message);
        }
      }

      res.json({ success: true, data: cotacoes });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/cotacoes/gerar-criticos', (req, res) => {
    try {
      const cotacao = comprasCotacoesService.gerarSessaoCotacaoAutomaticaParaEstoqueCritico(db);
      res.json({ success: true, data: cotacao, message: 'Sessão de cotação gerada com sucesso!' });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /cotacoes/gerar-criticos:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/cotacoes/:id', (req, res) => {
    try {
      const { id } = req.params;
      const cotacao = comprasCotacoesService.obterCotacao(id);
      if (!cotacao) {
        return res.status(404).json({ success: false, error: 'Cotação não encontrada.' });
      }
      res.json({ success: true, data: cotacao });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/cotacoes/criar', async (req, res) => {
    try {
      const { itens, titulo, observacoes, criadoPor = 'Administrador', enfileirarAprovacao = true } = req.body;
      if (!Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ success: false, error: 'Informe ao menos um produto para cotar.' });
      }

      // Cria a cotação e seus itens
      const cotacao = comprasCotacoesService.criarCotacao({
        titulo: titulo || `Cotação ${new Date().toLocaleDateString('pt-BR')}`,
        itens,
        observacoes,
        criadoPor
      });

      // Identifica fornecedores automaticamente para as categorias dos produtos
      const fornecedoresMapeados = comprasCotacoesService.identificarFornecedoresParaProdutos(itens);

      const mensagensEnfileiradas = [];

      // Se solicitado, gera mensagens e enfileira na Fila de Aprovação Humana (Human-in-the-Loop)
      if (enfileirarAprovacao && fornecedoresMapeados.length > 0) {
        for (const f of fornecedoresMapeados) {
          const textoMsg = comprasCotacoesService.gerarMensagemCotacao(
            f.distribuidora || f.fornecedorNome,
            f.representante || f.fornecedorNome,
            itens
          );

          const itemFila = comprasAprovacaoService.enfileirarMensagem({
            tipo: 'cotacao',
            destinatarioTelefone: f.telefone,
            destinatarioNome: f.representante || f.fornecedorNome,
            fornecedorId: f.fornecedorId,
            fornecedorNome: f.distribuidora || f.fornecedorNome,
            mensagemTexto: textoMsg,
            dadosContexto: {
              cotacaoId: cotacao.id,
              itens: itens.map(i => ({
                produtoId: i.produtoId,
                descricao: i.descricao,
                ean: i.ean,
                quantidade: i.quantidade
              }))
            },
            criadoPor
          });

          mensagensEnfileiradas.push(itemFila);
        }
      }

      res.json({
        success: true,
        data: {
          cotacao,
          fornecedoresMapeados,
          mensagensEnfileiradas
        },
        message: 'Cotação criada com sucesso e encaminhada para a Fila de Aprovação!'
      });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /cotacoes/criar:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/cotacoes/:id/respostas', (req, res) => {
    try {
      const { id } = req.params;
      const { fornecedorId, fornecedorNome, precoLiquido, prazoDias, condicaoPagamento, bonificacaoTexto, pontualidadeScore, taxaQuebraPercent, pedidoMinimoAtingido, valorTotalCotado } = req.body;

      if (!fornecedorNome || precoLiquido === undefined) {
        return res.status(400).json({ success: false, error: 'Fornecedor e preço líquido são obrigatórios.' });
      }

      const resposta = comprasCotacoesService.registrarRespostaCotacao(id, {
        fornecedorId,
        fornecedorNome,
        precoLiquido: parseFloat(precoLiquido),
        prazoDias: parseInt(prazoDias, 10) || 28,
        condicaoPagamento: condicaoPagamento || '28 dias',
        bonificacaoTexto,
        pontualidadeScore: pontualidadeScore !== undefined ? parseFloat(pontualidadeScore) : 75,
        taxaQuebraPercent: taxaQuebraPercent !== undefined ? parseFloat(taxaQuebraPercent) : 0,
        pedidoMinimoAtingido: pedidoMinimoAtingido !== undefined ? (pedidoMinimoAtingido ? 1 : 0) : 1,
        valorTotalCotado: valorTotalCotado ? parseFloat(valorTotalCotado) : 0
      });

      // Recalcula o ranking ponderado atualizado
      const cotacaoAtualizada = comprasCotacoesService.obterCotacao(id);

      res.json({
        success: true,
        data: { resposta, cotacao: cotacaoAtualizada },
        message: 'Resposta de cotação registrada e ranking ponderado recalculado!'
      });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /cotacoes/:id/respostas:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/cotacoes/:id/quebra', (req, res) => {
    try {
      const { id } = req.params;
      const { fornecedorId, motivo } = req.body;

      if (!fornecedorId) {
        return res.status(400).json({ success: false, error: 'ID do fornecedor em quebra é obrigatório.' });
      }

      const resultado = comprasCotacoesService.tratarQuebraFornecedor(id, fornecedorId, motivo);
      res.json({ success: true, data: resultado, message: 'Quebra registrada e itens reatribuídos para o 2º colocado!' });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /cotacoes/:id/quebra:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/cotacoes/:id/otimizar-minimo', (req, res) => {
    try {
      const { id } = req.params;
      const cotacao = comprasCotacoesService.obterCotacao(id);
      if (!cotacao) {
        return res.status(404).json({ success: false, error: 'Cotação não encontrada.' });
      }

      const resultado = comprasCotacoesService.otimizarPedidoMinimo(cotacao);
      res.json({ success: true, data: resultado });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/cotacoes/comparar-texto', async (req, res) => {
    try {
      const { texto, usarIA, quantidades } = req.body;
      if (!texto || !String(texto).trim()) {
        return res.status(400).json({ success: false, error: 'Texto da cotação é obrigatório.' });
      }

      console.log('──────────────────────────────────────────────────────────');
      console.log('[Comparador-Texto] 📥 Novo texto recebido para comparação:');
      console.log(texto);
      console.log('──────────────────────────────────────────────────────────');

      const resultado = await comprasComparadorService.compararCotacoesTexto(texto, {
        usarIA: usarIA === true,
        quantidades: quantidades || {},
        db
      });

      console.log('[Comparador-Texto] 📤 Fornecedores detectados:', resultado.fornecedoresEncontrados);
      console.log('[Comparador-Texto] 📤 Total produtos comparados:', resultado.itensComparados?.length);
      console.log('[Comparador-Texto] 📤 Fornecedores vencedores resumo:', (resultado.fornecedoresResumo || []).map(f => `${f.fornecedor} (${f.totalItens} itens)`));

      res.json(resultado);
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /cotacoes/comparar-texto:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/central-compras/cotacoes/consultar-estoque-lote
   * Permite consultar estoque, histórico de última compra e sugestão 30 dias para uma lista de produtos.
   */
  router.post('/cotacoes/consultar-estoque-lote', (req, res) => {
    try {
      const { produtos } = req.body;
      if (!Array.isArray(produtos) || produtos.length === 0) {
        return res.json({ success: true, data: {} });
      }

      const mapa = {};
      for (const p of produtos) {
        if (!p) continue;
        const info = comprasComparadorService.buscarInfoEstoqueProduto(p, db);
        if (info) {
          mapa[p] = info;
        }
      }

      res.json({ success: true, data: mapa });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /cotacoes/consultar-estoque-lote:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // 5. FILA DE APROVAÇÃO OBRIGATÓRIA (HUMAN-IN-THE-LOOP) & ALERTAS
  // ──────────────────────────────────────────────────────────

  router.get('/aprovacoes/pendentes', (req, res) => {
    try {
      const pendentes = comprasAprovacaoService.listarPendentes();
      res.json({ success: true, data: pendentes });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/aprovacoes', (req, res) => {
    try {
      const { status, tipo, limite, offset } = req.query;
      const fila = comprasAprovacaoService.listarFilaAprovacao({
        status: status || null,
        tipo: tipo || null,
        limite: limite ? parseInt(limite, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0
      });
      res.json({ success: true, data: fila });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/aprovacoes/contador', (req, res) => {
    try {
      const contador = comprasAprovacaoService.obterContadorPendencias();
      res.json({ success: true, ...contador });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/aprovacoes/:id', (req, res) => {
    try {
      const { id } = req.params;
      const item = comprasAprovacaoService.obterItemAprovacao(id);
      if (!item) {
        return res.status(404).json({ success: false, error: 'Item não encontrado na fila.' });
      }
      res.json({ success: true, data: item });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put('/aprovacoes/:id', (req, res) => {
    try {
      const { id } = req.params;
      const { novoTexto, novosItens, novoTelefone, novoDestinatario } = req.body;

      if (!novoTexto || !novoTexto.trim()) {
        return res.status(400).json({ success: false, error: 'O texto da mensagem é obrigatório.' });
      }

      const item = comprasAprovacaoService.editarMensagem(id, novoTexto, novosItens, {
        novoTelefone,
        novoDestinatario
      });

      res.json({ success: true, data: item, message: 'Mensagem atualizada com sucesso!' });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no PUT /aprovacoes/:id:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/aprovacoes/:id/aprovar', async (req, res) => {
    try {
      const { id } = req.params;
      const { usuario = 'Administrador', textoModificado } = req.body;

      // Se houver texto modificado, atualiza antes de aprovar
      if (textoModificado && textoModificado.trim()) {
        comprasAprovacaoService.editarMensagem(id, textoModificado);
      }

      // Aprova e dispara via WhatsApp Baileys Compras
      const resultado = await comprasAprovacaoService.aprovarMensagem(id, usuario, baileysComprasService);

      res.json({
        success: true,
        data: resultado,
        message: 'Mensagem aprovada e enviada ao representante com sucesso via WhatsApp!'
      });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /aprovacoes/:id/aprovar:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/aprovacoes/:id/rejeitar', (req, res) => {
    try {
      const { id } = req.params;
      const { motivo, usuario = 'Administrador' } = req.body;

      if (!motivo || !motivo.trim()) {
        return res.status(400).json({ success: false, error: 'Motivo da rejeição é obrigatório.' });
      }

      const item = comprasAprovacaoService.rejeitarMensagem(id, motivo, usuario);
      res.json({ success: true, data: item, message: 'Mensagem rejeitada e descartada da fila.' });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /aprovacoes/:id/rejeitar:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // 6. PEDIDOS DE COMPRA FORMAIS, ESPELHOS & ORÇAMENTO
  // ──────────────────────────────────────────────────────────

  router.get('/pedidos', (req, res) => {
    try {
      const { status, distribuidora, mes, ano, busca, limite, offset } = req.query;
      const pedidos = comprasPedidosService.listarPedidos({
        status: status || null,
        distribuidora: distribuidora || null,
        mes: mes ? parseInt(mes, 10) : null,
        ano: ano ? parseInt(ano, 10) : null,
        busca: busca || null,
        limite: limite ? parseInt(limite, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0
      }, db);
      res.json({ success: true, data: pedidos });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/pedidos/extrato', (req, res) => {
    try {
      const { mes, ano, distribuidora, busca } = req.query;
      const extrato = comprasPedidosService.obterExtratoMovimentacoes({
        mes: mes ? parseInt(mes, 10) : null,
        ano: ano ? parseInt(ano, 10) : null,
        distribuidora: distribuidora || null,
        busca: busca || null
      }, db);
      res.json({ success: true, data: extrato });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/pedidos/:id', (req, res) => {
    try {
      const { id } = req.params;
      const pedido = comprasPedidosService.obterPedidoPorId(id, db);
      if (!pedido) {
        return res.status(404).json({ success: false, error: 'Pedido de compra não encontrado.' });
      }
      res.json({ success: true, data: pedido });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/pedidos/:id/texto', (req, res) => {
    try {
      const { id } = req.params;
      const texto = comprasPedidosService.exportarEspelhoTexto(id, db);
      res.json({ success: true, texto });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/pedidos/gerar', async (req, res) => {
    try {
      const {
        cotacaoId,
        fornecedorId,
        distribuidora,
        representante,
        telefone,
        condicaoPagamento = '28/35/42 dias',
        previsaoEntrega = '2 dias úteis',
        itens,
        enfileirarAprovacao = true,
        vincularBoletos = true,
        criadoPor = 'Administrador'
      } = req.body;

      if (!distribuidora || !Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ success: false, error: 'Distribuidora e itens são obrigatórios.' });
      }

      // Validação orçamentária prévia
      const valorTotal = itens.reduce((acc, it) => acc + (it.quantidade * it.precoUnitario), 0);
      const hoje = new Date();
      const validacaoOrcamento = comprasPedidosService.validarTetoOrcamentario(valorTotal, hoje.getMonth() + 1, hoje.getFullYear(), db);

      // Cria pedido formal estruturado
      const novoPedido = comprasPedidosService.criarPedidoCompra({
        cotacaoId,
        fornecedorId,
        distribuidora,
        representante,
        telefone,
        condicaoPagamento,
        previsaoEntrega,
        itens,
        vincularBoletos,
        dbInstance: db
      });

      // Se solicitado, enfileira o espelho na fila de aprovação para envio via WhatsApp
      let itemAprovacao = null;
      if (enfileirarAprovacao && telefone) {
        itemAprovacao = comprasAprovacaoService.enfileirarMensagem({
          tipo: 'pedido',
          destinatarioTelefone: telefone,
          destinatarioNome: representante || distribuidora,
          fornecedorId,
          fornecedorNome: distribuidora,
          mensagemTexto: novoPedido.textoFormatado,
          dadosContexto: {
            pedidoId: novoPedido.id,
            numeroPedido: novoPedido.numeroPedido,
            valorTotal: novoPedido.valorTotal,
            itens: novoPedido.itens
          },
          criadoPor
        });
      }

      res.json({
        success: true,
        data: {
          pedido: novoPedido,
          validacaoOrcamento,
          itemAprovacao
        },
        message: 'Espelho de Pedido de Compra gerado com sucesso!'
      });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /pedidos/gerar:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/pedidos/:id/cancelar', (req, res) => {
    try {
      const { id } = req.params;
      const { motivo = 'Cancelado pelo Administrador' } = req.body;
      const pedido = comprasPedidosService.cancelarPedido(id, motivo, db);
      res.json({ success: true, data: pedido, message: 'Pedido de compra cancelado.' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // 7. CONTROLE ORÇAMENTÁRIO & LIMITES MENSAIS
  // ──────────────────────────────────────────────────────────

  router.get('/orcamento', (req, res) => {
    try {
      const hoje = new Date();
      const mes = req.query.mes ? parseInt(req.query.mes, 10) : hoje.getMonth() + 1;
      const ano = req.query.ano ? parseInt(req.query.ano, 10) : hoje.getFullYear();

      const resumo = comprasPedidosService.obterResumoOrcamentoMensal(mes, ano, db);
      res.json({ success: true, data: resumo });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/orcamento/definir', (req, res) => {
    try {
      const { mes, ano, limite } = req.body;
      if (!mes || !ano || limite === undefined) {
        return res.status(400).json({ success: false, error: 'Mês, ano e limite são obrigatórios.' });
      }

      const resLimit = comprasPedidosService.definirLimiteMensal(parseInt(mes, 10), parseInt(ano, 10), parseFloat(limite), db);
      res.json({ success: true, data: resLimit, message: 'Teto orçamentário atualizado com sucesso!' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // 8. REPRESENTANTES, DISTRIBUIDORAS & HISTÓRICO
  // ──────────────────────────────────────────────────────────

  router.get('/fornecedores', (req, res) => {
    try {
      const { busca } = req.query;
      const fornecedores = comprasMineracaoService.listarFornecedoresMinerados(db, { busca });
      res.json({ success: true, data: fornecedores });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/representantes', (req, res) => {
    try {
      const { busca } = req.query;
      const fornecedores = comprasMineracaoService.listarFornecedoresMinerados(db, { busca });
      res.json({ success: true, data: fornecedores });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/fornecedores', (req, res) => {
    try {
      const dados = req.body;
      if (!dados.distribuidora && !dados.representante) {
        return res.status(400).json({ success: false, error: 'Distribuidora ou Representante obrigatório.' });
      }

      const upserted = comprasMineracaoService.upsertFornecedorMeta(db, dados);
      res.json({ success: true, data: upserted, message: 'Fornecedor salvo com sucesso!' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put('/fornecedores/:id', (req, res) => {
    try {
      const { id } = req.params;
      const dados = req.body;
      const atualizado = comprasMineracaoService.atualizarFornecedorMeta(db, id, dados);
      res.json({ success: true, data: atualizado, message: 'Fornecedor atualizado com sucesso!' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/fornecedores/:id/catalogo', (req, res) => {
    try {
      const { id } = req.params;
      const catalogo = comprasMineracaoService.obterCatalogoFornecedor(db, id);
      res.json({ success: true, data: catalogo });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // 9. CONFIGURAÇÕES DA CENTRAL DE COMPRAS
  // ──────────────────────────────────────────────────────────

  router.get('/configuracoes', (req, res) => {
    try {
      const rows = db.prepare('SELECT chave, valor, descricao, updated_at FROM compras_configuracoes').all();
      const configMap = {};
      rows.forEach(r => { configMap[r.chave] = r.valor; });
      res.json({ success: true, data: { mapa: configMap, lista: rows } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/configuracoes', (req, res) => {
    try {
      const { configuracoes } = req.body;
      if (!configuracoes || typeof configuracoes !== 'object') {
        return res.status(400).json({ success: false, error: 'Objeto de configurações obrigatório.' });
      }

      const stmt = db.prepare(`
        INSERT INTO compras_configuracoes (chave, valor, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(chave) DO UPDATE SET
          valor = excluded.valor,
          updated_at = excluded.updated_at
      `);

      const nowIso = new Date().toISOString();
      const entries = Object.entries(configuracoes);

      db.transaction(() => {
        for (const [k, v] of entries) {
          stmt.run(k, String(v), nowIso);
        }
      })();

      res.json({ success: true, message: 'Configurações atualizadas com sucesso!' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // 10. PRODUTOS EQUIVALENTES & GRUPOS DE SUBSTITUIÇÃO
  // ──────────────────────────────────────────────────────────

  router.get('/equivalentes', (req, res) => {
    try {
      const { busca, pagina, limite, apenasRuptura } = req.query;
      const resultado = comprasEquivalentesService.listarGruposEquivalentes({
        busca: busca || '',
        pagina: pagina ? parseInt(pagina, 10) : 1,
        limite: limite ? parseInt(limite, 10) : 20,
        apenasRuptura: apenasRuptura === 'true' || apenasRuptura === true
      }, db);
      res.json({ success: true, data: resultado });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no GET /equivalentes:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/equivalentes/revisao-categorias', (req, res) => {
    try {
      const { busca, tipo, apenasComSaldo, limite } = req.query;
      const resultado = comprasEquivalentesService.listarRevisaoCategoriasOutros(db, {
        busca,
        tipo,
        apenasComSaldo,
        limite
      });
      res.json({ success: true, data: resultado });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no GET /equivalentes/revisao-categorias:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/equivalentes/atualizar-categoria-digifarma', async (req, res) => {
    try {
      const { itens } = req.body || {};
      if (!Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ success: false, error: 'Informe ao menos um produto em itens.' });
      }
      const resultado = await comprasEquivalentesService.atualizarCategoriasNoDigifarma(db, itens);
      res.json({
        success: resultado.success,
        data: resultado,
        message: resultado.erros.length === 0
          ? `${resultado.atualizados} produto(s) atualizado(s) no Digifarma com sucesso!`
          : `${resultado.atualizados} atualizado(s) no Digifarma, ${resultado.erros.length} com erro.`
      });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /equivalentes/atualizar-categoria-digifarma:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/equivalentes/:id', (req, res) => {
    try {
      const { id } = req.params;
      const grupo = comprasEquivalentesService.obterEstoqueConsolidadoGrupo(id, db);
      if (!grupo) {
        return res.status(404).json({ success: false, error: 'Grupo não encontrado.' });
      }
      res.json({ success: true, data: grupo });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/equivalentes', (req, res) => {
    try {
      const dados = req.body;
      if (!dados.nomeGrupo || !dados.principioAtivo) {
        return res.status(400).json({ success: false, error: 'Nome do grupo e princípio ativo são obrigatórios.' });
      }
      const grupo = comprasEquivalentesService.salvarGrupoManual(dados, db);
      res.json({ success: true, data: grupo, message: 'Grupo salvo com sucesso!' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/equivalentes/vincular', (req, res) => {
    try {
      const { grupoId, produtoId } = req.body;
      if (!grupoId || !produtoId) {
        return res.status(400).json({ success: false, error: 'grupoId e produtoId são obrigatórios.' });
      }
      const grupo = comprasEquivalentesService.vincularProdutoAoGrupo(grupoId, produtoId, db);
      res.json({ success: true, data: grupo, message: 'Produto vinculado ao grupo com sucesso!' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete('/equivalentes/:grupoId/produtos/:produtoId', (req, res) => {
    try {
      const { grupoId, produtoId } = req.params;
      const grupo = comprasEquivalentesService.desvincularProdutoDoGrupo(grupoId, produtoId, db);
      res.json({ success: true, data: grupo, message: 'Produto desvinculado do grupo.' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete('/equivalentes/:id', (req, res) => {
    try {
      const { id } = req.params;
      comprasEquivalentesService.removerGrupoEquivalente(id, db);
      res.json({ success: true, message: 'Grupo de equivalência removido com sucesso.' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/equivalentes/gerar-automaticos', async (req, res) => {
    try {
      let syncInfo = null;
      if (req.body?.sincronizarDigifarma !== false) {
        syncInfo = await comprasEquivalentesService.sincronizarSubstanciasDigifarma(db);
      }
      const resultado = comprasEquivalentesService.gerarGruposAutomaticos(db, {
        limparAutomaticosAntigos: req.body?.limparAutomaticosAntigos !== false
      });
      res.json({
        success: true,
        data: { ...resultado, syncDigifarma: syncInfo },
        message: `${resultado.gruposCriados} grupos criados, ${resultado.produtosVinculados} produtos vinculados (${resultado.gruposRemovidos} antigos limpos)!`
      });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /equivalentes/gerar-automaticos:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/equivalentes/reavaliar-faltas', async (req, res) => {
    try {
      const resultado = await comprasEquivalentesService.reavaliarFaltasComEquivalentes(db, {
        dryRun: Boolean(req.body?.dryRun),
        consultarFirebird: req.body?.consultarFirebird !== false
      });
      res.json({
        success: true,
        data: resultado,
        message: resultado.dryRun
          ? `Prévia: ${resultado.totalCobertasAuto} falta(s) automática(s) e ${resultado.totalCobertasManuais} manual(is) possuem equivalente em estoque.`
          : `${resultado.baixadas} falta(s) automática(s) baixada(s) e ${resultado.totalCobertasManuais} manual(is) sinalizada(s).`
      });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /equivalentes/reavaliar-faltas:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/equivalentes/comparar', (req, res) => {
    try {
      const resultado = comprasEquivalentesService.compararProdutosOuConsultar(req.body || {}, db);
      res.json({ success: true, data: resultado });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /equivalentes/comparar:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/produtos-busca', (req, res) => {
    try {
      const { q } = req.query;
      if (!q || q.trim().length < 2) {
        return res.json({ success: true, data: [] });
      }
      const rows = db.prepare(`
        SELECT produto_id, descricao, apresentacao, ean, categoria_id, saldo, custo_unitario, ultima_compra_valor
        FROM compras_estoque_cache
        WHERE descricao LIKE ? OR ean = ?
        LIMIT 25
      `).all(`%${q.trim()}%`, q.trim());
      res.json({ success: true, data: rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ─── ROTAS DO AGENTE HORÁCIO ──────────────────────────────────────────────

  /**
   * GET /api/central-compras/horacio/relatorios
   * Lista relatórios executivos e alertas gerados pelo Horácio
   */
  router.get('/horacio/relatorios', (req, res) => {
    try {
      const limite = parseInt(req.query.limite, 10) || 20;
      const horacioAgent = require('./services/horacio-agent.service');
      const relatorios = horacioAgent.listarRelatorios(db, limite);
      res.json({ success: true, data: relatorios });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/central-compras/horacio/executar-analise
   * Dispara a consolidação executiva do Horácio sob demanda
   */
  router.post('/horacio/executar-analise', async (req, res) => {
    try {
      const horacioAgent = require('./services/horacio-agent.service');
      const resultado = await horacioAgent.executarConsolidacaoHorarioCorte(db, { sobDemanda: true });
      res.json({ success: true, ...resultado });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/central-compras/horacio/criar-cotacao/:id
   * Converte os itens recomendados de um relatório em uma Sessão de Cotação aberta
   */
  router.post('/horacio/criar-cotacao/:id', (req, res) => {
    try {
      const horacioAgent = require('./services/horacio-agent.service');
      const resultado = horacioAgent.criarCotacaoDeRelatorio(req.params.id, db);
      res.json({ success: true, ...resultado });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/central-compras/horacio/disparar-whatsapp/:id
   * Reenvia o relatório executivo do Horácio para o WhatsApp do Administrador
   */
  router.post('/horacio/disparar-whatsapp/:id', async (req, res) => {
    try {
      const horacioAgent = require('./services/horacio-agent.service');
      const rel = db.prepare('SELECT * FROM compras_horacio_relatorios WHERE id = ?').get(req.params.id);
      if (!rel) return res.status(404).json({ success: false, error: 'Relatório não encontrado' });

      await horacioAgent.dispararAlertaWhatsappAdmin(rel.mensagem_whatsapp, rel.id, db);
      res.json({ success: true, message: 'Alerta reenviado com sucesso' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // 10. TRIAGEM DE FALTAS & COTAÇÃO (MEDICAMENTOS + PERFUMARIA)
  // ──────────────────────────────────────────────────────────

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS triagem_faltas_sessoes (
        id TEXT PRIMARY KEY,
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL,
        portais_resumo TEXT,
        itens_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS triagem_faltas_decisoes (
        sessao_id TEXT NOT NULL,
        ean TEXT NOT NULL,
        comprar INTEGER NOT NULL DEFAULT 0,
        portal_index INTEGER NOT NULL DEFAULT 0,
        qtd INTEGER NOT NULL DEFAULT 1,
        motivo TEXT DEFAULT '',
        observacao TEXT DEFAULT '',
        usuario TEXT DEFAULT '',
        atualizado_em TEXT NOT NULL,
        PRIMARY KEY (sessao_id, ean)
      );
    `);
  } catch (errSchema) {
    console.warn('[TriagemFaltas] Aviso ao criar tabelas:', errSchema.message);
  }

  function garantirSessaoInicialTriagem() {
    const existing = db.prepare('SELECT id FROM triagem_faltas_sessoes LIMIT 1').get();
    if (existing) return;
    try {
      const fsLocal = require('fs');
      const pathLocal = require('path');
      const seedPath = pathLocal.join(__dirname, 'seeds', 'triagem-faltas-seed.json');
      if (!fsLocal.existsSync(seedPath)) {
        console.warn('[TriagemFaltas] Seed inicial não encontrado em:', seedPath);
        return;
      }
      const seed = JSON.parse(fsLocal.readFileSync(seedPath, 'utf8'));
      const now = new Date().toISOString();
      db.prepare(
        'INSERT INTO triagem_faltas_sessoes (id, criado_em, atualizado_em, portais_resumo, itens_json) VALUES (?, ?, ?, ?, ?)'
      ).run(
        seed.sessaoId || '2026-11-27-inicial',
        seed.criadoEm || now,
        seed.criadoEm || now,
        JSON.stringify(seed.portaisResumo || {}),
        JSON.stringify(seed.itens || [])
      );
    } catch (errSeed) {
      console.warn('[TriagemFaltas] Erro ao carregar seed inicial:', errSeed.message);
    }
  }

  function lerDecisoesSessao(sessaoId) {
    const rows = db
      .prepare('SELECT ean, comprar, portal_index, qtd, motivo, observacao FROM triagem_faltas_decisoes WHERE sessao_id = ?')
      .all(sessaoId);
    const decisoes = {};
    for (const r of rows) {
      decisoes[r.ean] = {
        comprar: Boolean(r.comprar),
        portalIndex: Number(r.portal_index) || 0,
        qtd: Number(r.qtd) || 1,
        motivo: r.motivo || '',
        obs: r.observacao || ''
      };
    }
    return decisoes;
  }

  router.get('/triagem-faltas/atual', (req, res) => {
    try {
      garantirSessaoInicialTriagem();
      const row = db
        .prepare('SELECT id, criado_em, atualizado_em, portais_resumo, itens_json FROM triagem_faltas_sessoes ORDER BY atualizado_em DESC LIMIT 1')
        .get();
      if (!row) {
        const now = new Date().toISOString();
        return res.json({
          success: true,
          sessao: { id: 'sem-sessao', criadoEm: now, atualizadoEm: now, portaisResumo: {}, itens: [] },
          decisoes: {}
        });
      }
      const decisoes = lerDecisoesSessao(row.id);
      res.json({
        success: true,
        sessao: {
          id: row.id,
          criadoEm: row.criado_em,
          atualizadoEm: row.atualizado_em,
          portaisResumo: row.portais_resumo ? JSON.parse(row.portais_resumo) : {},
          itens: JSON.parse(row.itens_json || '[]')
        },
        decisoes
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put('/triagem-faltas/decisao', (req, res) => {
    try {
      const { sessaoId, ean, comprar, portalIndex, qtd, motivo, obs, usuario } = req.body || {};
      if (!sessaoId || !ean) {
        return res.status(400).json({ success: false, error: 'sessaoId e ean são obrigatórios' });
      }
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO triagem_faltas_decisoes (sessao_id, ean, comprar, portal_index, qtd, motivo, observacao, usuario, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(sessao_id, ean) DO UPDATE SET
          comprar = excluded.comprar,
          portal_index = excluded.portal_index,
          qtd = excluded.qtd,
          motivo = excluded.motivo,
          observacao = excluded.observacao,
          usuario = excluded.usuario,
          atualizado_em = excluded.atualizado_em
      `).run(
        String(sessaoId),
        String(ean),
        comprar ? 1 : 0,
        Math.max(0, Number(portalIndex) || 0),
        Math.max(1, parseInt(qtd, 10) || 1),
        String(motivo || ''),
        String(obs || ''),
        String(usuario || ''),
        now
      );
      res.json({ success: true, atualizadoEm: now });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put('/triagem-faltas/decisoes-lote', (req, res) => {
    try {
      const { sessaoId, decisoes, usuario } = req.body || {};
      if (!sessaoId || !Array.isArray(decisoes)) {
        return res.status(400).json({ success: false, error: 'sessaoId e decisoes[] são obrigatórios' });
      }
      const now = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO triagem_faltas_decisoes (sessao_id, ean, comprar, portal_index, qtd, motivo, observacao, usuario, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(sessao_id, ean) DO UPDATE SET
          comprar = excluded.comprar,
          portal_index = excluded.portal_index,
          qtd = excluded.qtd,
          motivo = excluded.motivo,
          observacao = excluded.observacao,
          usuario = excluded.usuario,
          atualizado_em = excluded.atualizado_em
      `);
      const tx = db.transaction((list) => {
        for (const d of list) {
          if (!d?.ean) continue;
          stmt.run(
            String(sessaoId),
            String(d.ean),
            d.comprar ? 1 : 0,
            Math.max(0, Number(d.portalIndex) || 0),
            Math.max(1, parseInt(d.qtd, 10) || 1),
            String(d.motivo || ''),
            String(d.obs || ''),
            String(usuario || ''),
            now
          );
        }
      });
      tx(decisoes);
      res.json({ success: true, total: decisoes.length, atualizadoEm: now });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/triagem-faltas/atualizar', async (req, res) => {
    try {
      const { cotarPortais = true, limiteMeds = 36, limitePerf = 30, usuario = 'Sistema' } = req.body || {};
      const { queryDigifarma } = require('./services/digifarma.service');

      const SKIP_NOISE = /POLPA MIX|POWERADE|GATORADE|HALLS|CURATIVO AVULSO|BELLIA ESMALTE|BENVIA|AGUA MINERAL|REFRIGERANTE|CHOCOLATE|BALA |CHICLETE/i;
      const rows = await queryDigifarma(`
        SELECT FIRST 260
               p.PRODUTO_ID, TRIM(p.COD_BARRAS) AS EAN, TRIM(p.PRODUTO) AS PRODUTO,
               TRIM(COALESCE(p.APRESENTACAO,'')) AS APRES,
               p.CATEGORIA_ID, p.CLASS_MED, p.PSICOTROPICO,
               COALESCE(p.PROD_SALDO,0) AS EST,
               COALESCE(p.PROD_CMV,0) AS CMV,
               COALESCE(p.VALOR_ULT_COMPRA,0) AS ULT,
               COALESCE(p.PROD_PRVENDA,0) AS PRVENDA,
               COALESCE(s30.Q30, 0) AS V30,
               COALESCE(s90.Q90, 0) AS V90
        FROM PRODUTOS p
        LEFT JOIN (
          SELECT iv.PRODUTO_ID, SUM(iv.ITEMVEND_QUANT) AS Q30
          FROM ITEM_VENDAS iv JOIN CAB_VENDAS cv ON cv.VENDA_NOTA_ID = iv.VENDA_NOTA_ID
          WHERE cv.CANCELADO <> 'S' AND cv.VENDA_DATA_HORA >= CURRENT_DATE - 30
          GROUP BY iv.PRODUTO_ID
        ) s30 ON s30.PRODUTO_ID = p.PRODUTO_ID
        LEFT JOIN (
          SELECT iv.PRODUTO_ID, SUM(iv.ITEMVEND_QUANT) AS Q90
          FROM ITEM_VENDAS iv JOIN CAB_VENDAS cv ON cv.VENDA_NOTA_ID = iv.VENDA_NOTA_ID
          WHERE cv.CANCELADO <> 'S' AND cv.VENDA_DATA_HORA >= CURRENT_DATE - 90
          GROUP BY iv.PRODUTO_ID
        ) s90 ON s90.PRODUTO_ID = p.PRODUTO_ID
        WHERE CHAR_LENGTH(TRIM(COALESCE(p.COD_BARRAS,''))) BETWEEN 8 AND 13
          AND COALESCE(p.PROD_ATIVO, 'S') <> 'N'
          AND (
            (COALESCE(p.PROD_SALDO,0) <= 0 AND COALESCE(s90.Q90,0) >= 3)
            OR (COALESCE(p.PROD_SALDO,0) <= COALESCE(s30.Q30,0) * 0.5 AND COALESCE(s30.Q30,0) >= 3)
          )
        ORDER BY CASE WHEN COALESCE(p.PROD_SALDO,0) <= 0 THEN 0 ELSE 1 END,
                 COALESCE(s30.Q30,0) DESC,
                 COALESCE(s90.Q90,0) DESC
      `);

      const meds = [];
      const perf = [];
      const seenEan = new Set();

      for (const r of rows) {
        const ean = String(r.EAN || '').trim();
        if (!/^\d{8,13}$/.test(ean) || seenEan.has(ean)) continue;
        const desc = `${r.PRODUTO || ''} ${r.APRES || ''}`.trim();
        if (SKIP_NOISE.test(desc)) continue;

        const catId = Number(r.CATEGORIA_ID || 0);
        const classMed = Number(r.CLASS_MED || 0);
        const isMed = [1, 2, 7].includes(catId) || [1, 2, 3].includes(classMed);
        const isPerf = !isMed && catId === 5;
        if (!isMed && !isPerf) continue;

        const cmv = Number(r.CMV || 0);
        const ult = Number(r.ULT || 0);
        const refCost = (cmv > 0 && ult > 0) ? Math.min(cmv, ult) : (cmv || ult);
        const est = Number(r.EST || 0);
        const v30 = Number(r.V30 || 0);
        const v90 = Number(r.V90 || 0);
        const giroMensal = Math.max(v30, Math.ceil(v90 / 3));
        const sug = Math.max(1, giroMensal - Math.max(0, est));

        const item = {
          ean,
          produto: String(r.PRODUTO || '').trim(),
          apresentacao: String(r.APRES || '').trim(),
          tipo: isMed ? 'MEDICAMENTO' : 'PERFUMARIA',
          subtipo: catId === 1 ? 'Referência' : catId === 2 ? 'Similar' : catId === 7 ? 'Genérico' : (isMed ? 'Medicamento' : 'Perfumaria'),
          c1: String(r.PSICOTROPICO || '').trim() === 'S',
          est,
          v30,
          v90,
          giroMensal,
          sug,
          cmv: Number(cmv.toFixed(2)),
          ult: Number(ult.toFixed(2)),
          refCost: Number(refCost.toFixed(2)),
          prVenda: Number(Number(r.PRVENDA || 0).toFixed(2)),
          ofertas: []
        };

        if (isMed && meds.length < Number(limiteMeds)) {
          seenEan.add(ean);
          meds.push(item);
        } else if (isPerf && perf.length < Number(limitePerf)) {
          seenEan.add(ean);
          perf.push(item);
        }
        if (meds.length >= Number(limiteMeds) && perf.length >= Number(limitePerf)) break;
      }

      const items = [...meds, ...perf];
      garantirSessaoInicialTriagem();
      const prevRow = db
        .prepare('SELECT id, portais_resumo, itens_json FROM triagem_faltas_sessoes ORDER BY atualizado_em DESC LIMIT 1')
        .get();
      const prevOffersMap = {};
      if (prevRow?.itens_json) {
        for (const pi of JSON.parse(prevRow.itens_json)) {
          prevOffersMap[pi.ean] = pi.ofertas || [];
        }
      }
      const prevDecisoes = prevRow ? lerDecisoesSessao(prevRow.id) : {};

      let portaisResumo = prevRow?.portais_resumo ? JSON.parse(prevRow.portais_resumo) : {};

      if (cotarPortais) {
        const puppeteer = require('puppeteer');
        const { DistrimedRobot } = require('./belaped-robot-distrimed');
        const { DivimedRobot } = require('./belaped-robot-divimed');
        const MgMedicamentosRobot = require('./belaped-robot-mgmedicamentos');

        const quoteOriente = async () => {
          const browser = await puppeteer.launch({ headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
          try {
            const page = await browser.newPage();
            await page.setViewport({ width: 1440, height: 900 });
            await page.setRequestInterception(true);
            page.on('request', (r) => {
              const t = r.resourceType();
              if (t === 'image' || t === 'media' || t === 'font') r.abort();
              else r.continue();
            });
            await page.goto('https://pedidoweb.orientefarma.com.br/auth/login', { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
            await page.waitForSelector('input#email', { timeout: 20000 });
            await page.type('input#email', process.env.ORIENTE_USER || 'belafarmasul@gmail.com', { delay: 10 });
            await page.type('input#senha', process.env.ORIENTE_PASS || 'Bfs@882494', { delay: 10 });
            await page.evaluate(() => {
              const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').trim() === 'Entrar');
              if (btn) btn.click();
            });
            await new Promise(r => setTimeout(r, 3500));
            await page.evaluate(() => {
              const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').toLowerCase().includes('confirmar'));
              if (btn) btn.click();
            });
            await new Promise(r => setTimeout(r, 2500));
            await page.evaluate(() => {
              const allEls = Array.from(document.querySelectorAll('div, label, li, button')).filter(
                el => (el.innerText || '').trim().length > 0 && (el.innerText || '').trim().length < 90
              );
              const opt = allEls.find(d => (d.innerText || '').includes('PE ORIENTE FARMA') && (d.innerText || '').includes('96'));
              if (opt) opt.click();
            });
            await new Promise(r => setTimeout(r, 600));
            await page.evaluate(() => {
              const btn = Array.from(document.querySelectorAll('button')).find(b => (b.innerText || '').toLowerCase().includes('confirmar'));
              if (btn) btn.click();
            });
            await new Promise(r => setTimeout(r, 3000));
            await page.goto('https://pedidoweb.orientefarma.com.br/pedidos', { waitUntil: 'networkidle2', timeout: 35000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 1200));

            return await page.evaluate(async (eans) => {
              const map = {};
              const BATCH = 10;
              for (let i = 0; i < eans.length; i += BATCH) {
                const slice = eans.slice(i, i + BATCH);
                await Promise.all(slice.map(async (ean) => {
                  try {
                    const url = `/api/produtos/condicao/96?codigoCliente=299103&termo=${encodeURIComponent(ean)}&pagina=1&tamanhoPagina=10&apenasComEstoque=true&ordenarPor=5&diasRetroativos=100`;
                    const resp = await fetch(url, { credentials: 'include' });
                    if (!resp.ok) return;
                    const data = await resp.json();
                    const hit = (data?.produtos || []).find(p => String(p.codigoBarras || '').trim() === ean);
                    if (!hit) return;
                    const estQ = hit.estoque && typeof hit.estoque.quantidade === 'number' ? hit.estoque.quantidade : 1;
                    const niv = String(hit.nivelEstoque || '').toUpperCase();
                    if (hit.ativo === false || estQ <= 0 || niv.includes('INDISPON') || niv.includes('ESGOTADO') || niv.includes('ZERO')) return;
                    const pSemSt = Number(hit.precoFinal || hit.valor || 0);
                    const pComSt = Number(hit.precoComSt || 0) > 0 ? Number(hit.precoComSt) : Number((pSemSt + Number(hit.valorSt || 0)).toFixed(2));
                    if (pComSt > 0) {
                      map[ean] = {
                        portal: 'Oriente',
                        precoSemSt: Number(pSemSt.toFixed(2)),
                        preco: Number(pComSt.toFixed(2)),
                        lab: String(hit.nomeFantasiaFornecedor || '').trim(),
                        val: String(hit.dataValidade || '').slice(0, 10),
                        linha: String(hit.descricaoLinha || '').trim()
                      };
                    }
                  } catch (_) {}
                }));
              }
              return map;
            }, items.map(x => x.ean));
          } finally {
            await browser.close().catch(() => {});
          }
        };

        const quoteMG = async () => {
          const r = new MgMedicamentosRobot();
          const map = {};
          try {
            await r.iniciar();
            for (const it of items) {
              const hit = r.catalogoPorEan.get(it.ean) || r.catalogoPorEan.get(it.ean.replace(/^0+/, ''));
              if (!hit) continue;
              const temEst = hit.ESTOQUE === 'SIM' || (hit.SINALESTOQUE && hit.SINALESTOQUE !== 'ZERADO');
              if (!temEst) continue;
              const p = parseFloat(hit.PRECO_LIQUIDO || hit.VRLIQ || hit.PRECO || 0);
              if (p > 0) {
                map[it.ean] = {
                  portal: 'MG Med',
                  precoSemSt: Number(p.toFixed(2)),
                  preco: Number(p.toFixed(2)),
                  lab: String(hit.NOME_FORN || '').trim(),
                  val: String(hit.VALID_PROD || '').trim()
                };
              }
            }
            return map;
          } finally {
            await r.fechar().catch(() => {});
          }
        };

        const quoteRobot = async (portalName, RobotCls) => {
          const r = new RobotCls();
          const map = {};
          const deadline = Date.now() + 75000;
          try {
            await r.iniciar();
            for (const it of items) {
              if (Date.now() > deadline) break;
              try {
                const resC = await r.cotarEAN(it.ean, it.produto);
                if (resC && resC.disponivel && Number(resC.preco_nf || resC.preco || 0) > 0) {
                  const pNf = Number(resC.preco_nf || resC.preco || 0);
                  const pLiq = Number(resC.preco_liquido || pNf);
                  map[it.ean] = {
                    portal: portalName,
                    precoSemSt: Number(pLiq.toFixed(2)),
                    preco: Number(pNf.toFixed(2)),
                    lab: String(resC.laboratorio || '').trim()
                  };
                }
              } catch (_) {}
            }
            return map;
          } finally {
            await r.fechar().catch(() => {});
          }
        };

        const [orR, mgR, distR, divR] = await Promise.allSettled([
          quoteOriente(),
          quoteMG(),
          quoteRobot('Distrimed', DistrimedRobot),
          quoteRobot('Divimed', DivimedRobot)
        ]);

        const maps = {
          Oriente: orR.status === 'fulfilled' ? orR.value : {},
          'MG Med': mgR.status === 'fulfilled' ? mgR.value : {},
          Distrimed: distR.status === 'fulfilled' ? distR.value : {},
          Divimed: divR.status === 'fulfilled' ? divR.value : {}
        };
        portaisResumo = {
          Distrimed: Object.keys(maps.Distrimed).length,
          Oriente: Object.keys(maps.Oriente).length,
          'MG Med': Object.keys(maps['MG Med']).length,
          Divimed: Object.keys(maps.Divimed).length
        };

        for (const it of items) {
          const ofertas = [];
          for (const m of [maps.Oriente, maps.Distrimed, maps['MG Med'], maps.Divimed]) {
            if (m[it.ean]) ofertas.push(m[it.ean]);
          }
          ofertas.sort((a, b) => a.preco - b.preco);
          it.ofertas = ofertas;
        }
      } else {
        for (const it of items) {
          it.ofertas = prevOffersMap[it.ean] || [];
        }
      }

      const now = new Date().toISOString();
      const sessaoId = `triagem-${Date.now()}`;
      db.prepare(
        'INSERT INTO triagem_faltas_sessoes (id, criado_em, atualizado_em, portais_resumo, itens_json) VALUES (?, ?, ?, ?, ?)'
      ).run(sessaoId, now, now, JSON.stringify(portaisResumo), JSON.stringify(items));

      // Preserva decisoes/motivos do usuario para EANs repetidos da sessao anterior
      const stmtDec = db.prepare(`
        INSERT INTO triagem_faltas_decisoes (sessao_id, ean, comprar, portal_index, qtd, motivo, observacao, usuario, atualizado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const decisoes = {};
      const txCopy = db.transaction(() => {
        for (const it of items) {
          const prev = prevDecisoes[it.ean];
          if (!prev) continue;
          // Se antes nao tinha estoque e agora tem, libera escolha automatica ao frontend
          if (prev.motivo === 'Sem estoque nas distribuidoras cotadas' && it.ofertas.length > 0) continue;
          const maxIdx = Math.max(0, it.ofertas.length - 1);
          const dec = {
            comprar: it.ofertas.length > 0 ? prev.comprar : false,
            portalIndex: Math.min(maxIdx, prev.portalIndex || 0),
            qtd: prev.qtd || it.sug,
            motivo: prev.motivo || '',
            obs: prev.obs || ''
          };
          decisoes[it.ean] = dec;
          stmtDec.run(sessaoId, it.ean, dec.comprar ? 1 : 0, dec.portalIndex, dec.qtd, dec.motivo, dec.obs, String(usuario), now);
        }
      });
      txCopy();

      res.json({
        success: true,
        sessao: { id: sessaoId, criadoEm: now, atualizadoEm: now, portaisResumo, itens: items },
        decisoes
      });
    } catch (err) {
      console.error('[TriagemFaltas] Erro ao atualizar:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });


  // ── Pesquisa Livre por Termo (Cotação Abrangente nas 8 Distribuidoras) ──
  const { createTriagemPesquisaLivreManager } = require('./triagem-pesquisa-livre');
  const pesquisaLivreMgr = createTriagemPesquisaLivreManager(db);

  router.post('/triagem-faltas/pesquisa-livre', (req, res) => {
    try {
      const { termo, usuario } = req.body || {};
      const pesquisa = pesquisaLivreMgr.iniciarPesquisa(termo, usuario);
      res.json({ success: true, pesquisa });
    } catch (err) {
      const status = err?.message?.includes('caracteres') ? 400 : 500;
      res.status(status).json({ success: false, error: err.message });
    }
  });

  router.get('/triagem-faltas/pesquisa-livre/historico', (req, res) => {
    try {
      const limit = Math.min(30, Math.max(1, parseInt(req.query?.limit, 10) || 12));
      const result = pesquisaLivreMgr.listarHistorico(limit);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/triagem-faltas/pesquisa-livre/:id', (req, res) => {
    try {
      const pesquisa = pesquisaLivreMgr.obterPesquisa(req.params.id);
      if (!pesquisa) {
        return res.status(404).json({ success: false, error: 'Pesquisa não encontrada' });
      }
      res.json({ success: true, pesquisa });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/triagem-faltas/pesquisa-livre/:id/cancelar', (req, res) => {
    try {
      const cancelada = pesquisaLivreMgr.cancelarPesquisa(req.params.id);
      res.json({ success: true, cancelada });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/triagem-faltas/pesquisa-selecoes', (req, res) => {
    try {
      const data = pesquisaLivreMgr.listarSelecoes(req.query?.sessaoId);
      res.json({ success: true, ...data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put('/triagem-faltas/pesquisa-selecoes/item', (req, res) => {
    try {
      const item = pesquisaLivreMgr.salvarSelecaoItem(req.body || {});
      res.json({ success: true, item });
    } catch (err) {
      const status = err?.message?.includes('obrigat') ? 400 : 500;
      res.status(status).json({ success: false, error: err.message });
    }
  });

  router.delete('/triagem-faltas/pesquisa-selecoes/item', (req, res) => {
    try {
      const sessaoId = req.body?.sessaoId || req.query?.sessaoId;
      const eanChave = req.body?.eanChave || req.query?.eanChave;
      const removido = pesquisaLivreMgr.removerSelecaoItem(sessaoId, eanChave);
      res.json({ success: true, removido });
    } catch (err) {
      const status = err?.message?.includes('obrigat') ? 400 : 500;
      res.status(status).json({ success: false, error: err.message });
    }
  });

  router.delete('/triagem-faltas/pesquisa-selecoes/limpar', (req, res) => {
    try {
      const sessaoId = req.body?.sessaoId || req.query?.sessaoId;
      const removidos = pesquisaLivreMgr.limparSelecoes(sessaoId);
      res.json({ success: true, removidos });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  return router;
};
