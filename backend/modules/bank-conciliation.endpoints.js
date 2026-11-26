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
      if (!openFinance.isConfigured()) {
        return res.json({
          success: false,
          needsConfig: true,
          message: 'Credenciais do Open Finance (Pluggy) ainda não configuradas neste servidor.'
        });
      }

      const [painel, saldo] = await Promise.all([
        conciliador.obterPainelConciliacao(),
        openFinance.getSaldo()
      ]);

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

  // 2. Ler configuração atual (sem expor clientSecret em texto puro)
  router.get('/config', (req, res) => {
    try {
      const cfg = openFinance.getConfig();
      res.json({
        configured: openFinance.isConfigured(),
        clientId: cfg.clientId || '',
        hasSecret: Boolean(cfg.clientSecret),
        defaultItemId: cfg.defaultItemId || '',
        defaultAccountId: cfg.defaultAccountId || ''
      });
    } catch (err) {
      console.error('[BankConciliation] Erro em GET /config:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Salvar e validar credenciais no banco do sistema
  router.post('/config', async (req, res) => {
    try {
      const { clientId, clientSecret, defaultItemId, defaultAccountId } = req.body || {};
      const saved = await openFinance.saveConfig({
        clientId,
        clientSecret,
        defaultItemId,
        defaultAccountId
      });

      res.json({
        success: true,
        config: {
          configured: openFinance.isConfigured(),
          clientId: saved.clientId || '',
          hasSecret: Boolean(saved.clientSecret),
          defaultItemId: saved.defaultItemId || '',
          defaultAccountId: saved.defaultAccountId || ''
        }
      });
    } catch (err) {
      console.error('[BankConciliation] Erro em POST /config:', err);
      const msg = err.message || 'Erro ao salvar configuração';
      const isClientError =
        msg.includes('obrigatóri') ||
        msg.includes('Informe') ||
        msg.includes('HTTP 400') ||
        msg.includes('HTTP 401') ||
        msg.includes('HTTP 403');
      res.status(isClientError ? 400 : 500).json({ error: msg });
    }
  });

  // 4. Conciliar Itens Selecionados
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

  // 5. Conciliação Automática em Massa (Tudo o que for Maquininha e iFood)
  router.post('/auto-conciliar-tudo', async (req, res) => {
    try {
      if (!openFinance.isConfigured()) {
        return res.status(400).json({ error: 'Credenciais do Open Finance (Pluggy) ainda não configuradas.' });
      }
      const userName = req.user?.name || req.body.userName || 'Robô Open Finance';
      const result = await conciliador.autoConciliarTudo(userName);
      res.json(result);
    } catch (err) {
      console.error('[BankConciliation] Erro em /auto-conciliar-tudo:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Saldo rápido do Itaú
  router.get('/saldo', async (req, res) => {
    try {
      if (!openFinance.isConfigured()) {
        return res.status(400).json({ error: 'Credenciais do Open Finance (Pluggy) ainda não configuradas.' });
      }
      const saldo = await openFinance.getSaldo();
      res.json(saldo);
    } catch (err) {
      console.error('[BankConciliation] Erro em /saldo:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
