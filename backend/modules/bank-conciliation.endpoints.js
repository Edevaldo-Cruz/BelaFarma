/**
 * backend/modules/bank-conciliation.endpoints.js
 *
 * Rotas de API para o Painel de Conciliação Bancária
 */

const express = require('express');
const conciliador = require('../services/conciliacao-extrato.service');
const openFinance = require('../services/open-finance.service');
const { executarRotinaDiaria, getUltimaExecucao } = require('../services/bank-conciliation-cron.service');

module.exports = function (db) {
  const router = express.Router();

  // 1. Resumo e Painel de Conciliação
  router.get('/painel', async (req, res) => {
    try {
      const pendenciasSistema = conciliador.obterPendenciasSistema();
      const execucaoInfo = getUltimaExecucao();

      if (!openFinance.isConfigured()) {
        return res.json({
          success: false,
          needsConfig: true,
          pendenciasSistema,
          ultimaExecucao: execucaoInfo.ultima,
          historicoExecucoes: execucaoInfo.historico,
          message: 'Credenciais do Open Finance (Pluggy) ainda não configuradas neste servidor.'
        });
      }

      const [painel, saldo, itemStatus] = await Promise.all([
        conciliador.obterPainelConciliacao(),
        openFinance.getSaldo(),
        openFinance.getItemStatus().catch(() => null)
      ]);

      res.json({
        success: true,
        saldo,
        itemStatus,
        ultimaExecucao: execucaoInfo.ultima,
        historicoExecucoes: execucaoInfo.historico,
        ...painel
      });
    } catch (err) {
      console.error('[BankConciliation] Erro em /painel:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Executar rotina diária sob demanda (conciliação + auditoria de anomalias)
  router.post('/executar-rotina-diaria', async (req, res) => {
    try {
      if (!openFinance.isConfigured()) {
        return res.status(400).json({ error: 'Credenciais do Open Finance (Pluggy) ainda não configuradas.' });
      }
      const enviarWhatsapp = Boolean(req.body?.enviarWhatsapp);
      const resultado = await executarRotinaDiaria({
        origem: 'MANUAL',
        enviarWhatsapp
      });
      res.json(resultado);
    } catch (err) {
      console.error('[BankConciliation] Erro em /executar-rotina-diaria:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Ler configuração atual (sem expor clientSecret em texto puro)
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

  // 4. Salvar e validar credenciais no banco do sistema
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

  // 5. Conciliar Itens Selecionados
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

  // 6. Conciliação Automática em Massa (Extrato + Pendências vencidas de Maquininha e iFood)
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

  // 7. Conciliar e zerar pendências vencidas de Maquininha e iFood no sistema
  router.post('/zerar-pendencias', async (req, res) => {
    try {
      const userName = req.user?.name || req.body?.userName || 'Administrador';
      let transacoesExtrato = [];
      if (openFinance.isConfigured()) {
        try {
          transacoesExtrato = await openFinance.getTransacoes();
        } catch (err) {
          console.warn('[BankConciliation] Open Finance indisponível ao zerar pendências, prosseguindo com baixa local:', err.message);
        }
      }
      const resultado = conciliador.conciliarPendenciasSistema({
        userName,
        transacoesExtrato
      });
      res.json({
        success: true,
        ...resultado
      });
    } catch (err) {
      console.error('[BankConciliation] Erro em /zerar-pendencias:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 8. Saldo rápido das contas conectadas
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
