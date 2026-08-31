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

// Serviço WhatsApp Baileys Compras
let baileysComprasService = null;
try {
  baileysComprasService = require('./baileys-compras-service');
} catch (e) {
  console.warn('[Compras-Endpoints] ⚠️ baileys-compras-service não carregado:', e.message);
}

module.exports = (db) => {

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
      const { status, curva, busca, apenas_com_vendas, limite, offset } = req.query;
      const result = await comprasEstoqueService.listarProdutosAbaixoDoMinimo({
        status: status || null,
        curva: curva || null,
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
      const { dias = 30, forcarReleitura = false } = req.body;
      let resultado;
      if (baileysComprasService && typeof baileysComprasService.minerarHistoricoConversas === 'function') {
        resultado = await baileysComprasService.minerarHistoricoConversas({ dias, forcarReleitura });
      } else {
        resultado = await comprasMineracaoService.minerarHistoricoConversas(db, { dias, forcarReleitura });
      }
      res.json({ success: true, data: resultado, message: 'Varredura e mineração concluídas com sucesso!' });
    } catch (err) {
      console.error('[Compras-Endpoints] Erro no POST /whatsapp/minerar:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/oportunidades', (req, res) => {
    try {
      const { status, fornecedor_id, busca, limite, offset } = req.query;
      const oportunidades = comprasMineracaoService.listarOportunidades({
        status: status || null,
        fornecedorId: fornecedor_id || null,
        busca: busca || null,
        limite: limite ? parseInt(limite, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0
      });
      res.json({ success: true, data: oportunidades });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ──────────────────────────────────────────────────────────
  // 4. MOTOR DE COTAÇÕES, RANKING PONDERADO & PEDIDO MÍNIMO
  // ──────────────────────────────────────────────────────────

  router.get('/cotacoes', (req, res) => {
    try {
      const { status, busca, limite, offset } = req.query;
      const cotacoes = comprasCotacoesService.listarCotacoes({
        status: status || null,
        busca: busca || null,
        limite: limite ? parseInt(limite, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0
      });
      res.json({ success: true, data: cotacoes });
    } catch (err) {
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

  return router;
};
