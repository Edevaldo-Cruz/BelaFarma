/**
 * backend/modules/bank-conciliation.endpoints.js
 *
 * Rotas de API para o Painel de Conciliação Bancária
 */

const express = require('express');
const conciliador = require('../services/conciliacao-extrato.service');
const openFinance = require('../services/open-finance.service');

module.exports = function (db) {
  const router = express.Router();

  // 1. Resumo e Painel de Conciliação
  router.get('/painel', async (req, res) => {
    try {
      const painel = await conciliador.obterPainelConciliacao();
      const saldo = await openFinance.getSaldo();
      res.json({
        success: true,
        saldo,
        ...painel
      });
    } catch (err) {
      console.error('[BankConciliation] Erro em /painel:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Conciliar Itens Selecionados
  router.post('/conciliar', async (req, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Nenhum item informado para conciliação.' });
      }
      const userName = req.user?.name || req.body.userName || 'Administrador';
      const result = await conciliador.conciliarItens(items, userName);
      res.json(result);
    } catch (err) {
      console.error('[BankConciliation] Erro em /conciliar:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Conciliação Automática em Massa (Tudo o que for Maquininha e iFood)
  router.post('/auto-conciliar-tudo', async (req, res) => {
    try {
      const userName = req.user?.name || req.body.userName || 'Robô Open Finance';
      const result = await conciliador.autoConciliarTudo(userName);
      res.json(result);
    } catch (err) {
      console.error('[BankConciliation] Erro em /auto-conciliar-tudo:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Saldo rápido do Itaú
  router.get('/saldo', async (req, res) => {
    try {
      const saldo = await openFinance.getSaldo();
      res.json(saldo);
    } catch (err) {
      console.error('[BankConciliation] Erro em /saldo:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
