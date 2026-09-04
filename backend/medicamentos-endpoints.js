/**
 * medicamentos-endpoints.js
 * Rotas REST para o Motor de Busca e Inteligência de Medicamentos e Estoque
 * 
 * Endpoints:
 * - GET /api/medicamentos/busca: Pesquisa rápida por nome, EAN ou ID com filtros de status e curva
 * - GET /api/medicamentos/rupturas: Lista produtos em ruptura ou abaixo do mínimo com orçamento de 30 dias
 * - GET /api/medicamentos/:id: Detalhe completo consolidado do produto por ID ou EAN
 * - POST /api/medicamentos/sincronizar: Dispara sincronização resiliente com o Firebird/Digifarma
 */

const express = require('express');
const medicamentosBuscaService = require('./services/medicamentos-busca.service');

function medicamentosEndpoints(db) {
  const router = express.Router();

  /**
   * GET /api/medicamentos/busca
   * Query params:
   *  - q: termo de busca (nome, EAN, ID)
   *  - status: filtro de status_ruptura ('RUPTURA', 'ABAIXO_MINIMO', 'NORMAL', 'EXCESSO')
   *  - curva: filtro de curva_abc ('A', 'B', 'C')
   *  - limit: limite de itens (padrão 25)
   *  - offset: deslocamento para paginação
   */
  router.get('/busca', (req, res) => {
    try {
      const { q, status, curva, limit = 25, offset = 0 } = req.query;
      const resultado = medicamentosBuscaService.buscarMedicamentos(db, {
        q,
        status,
        curva,
        limit: parseInt(limit, 10) || 25,
        offset: parseInt(offset, 10) || 0
      });
      res.json(resultado);
    } catch (err) {
      console.error('[Medicamentos Endpoints] Erro na busca:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/medicamentos/rupturas
   * Retorna os produtos que precisam de reposição urgente (em ruptura ou abaixo do mínimo)
   * com o cálculo do valor financeiro necessário para cobrir os 30 dias.
   */
  router.get('/rupturas', (req, res) => {
    try {
      const { curva, limit, offset } = req.query;
      const resultado = medicamentosBuscaService.obterRupturas(db, {
        curva,
        limit: limit !== undefined ? parseInt(limit, 10) : undefined,
        offset: offset !== undefined ? parseInt(offset, 10) : undefined
      });
      res.json(resultado);
    } catch (err) {
      console.error('[Medicamentos Endpoints] Erro ao listar rupturas:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/medicamentos/:id
   * Busca medicamento consolidado por ID primário do Digifarma ou código de barras EAN.
   */
  router.get('/:id', (req, res) => {
    try {
      const { id } = req.params;
      const medicamento = medicamentosBuscaService.obterMedicamentoPorId(db, id);

      if (!medicamento) {
        return res.status(404).json({
          success: false,
          message: `Medicamento com identificador '${id}' não encontrado.`
        });
      }

      res.json({
        success: true,
        data: medicamento
      });
    } catch (err) {
      console.error('[Medicamentos Endpoints] Erro ao obter medicamento por ID:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/medicamentos/sincronizar
   * Dispara a sincronização resiliente com o Firebird sob demanda
   */
  router.post('/sincronizar', async (req, res) => {
    try {
      const forceOffline = Boolean(req.body?.forceOffline);
      const margem = req.body?.margem ? Number(req.body.margem) : 15;
      const notificarHoracio = req.body?.notificarHoracio !== undefined ? Boolean(req.body.notificarHoracio) : true;

      const resultado = await medicamentosBuscaService.sincronizarEstoqueMedicamentos(db, {
        forceOffline,
        margemSegurancaPercent: margem,
        notificarHoracio
      });

      res.json(resultado);
    } catch (err) {
      console.error('[Medicamentos Endpoints] Erro na sincronização:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

module.exports = medicamentosEndpoints;
