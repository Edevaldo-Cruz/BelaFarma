/**
 * backend/modules/bank-conciliation.endpoints.js
 *
 * Rotas de API para o Painel Unificado de Conta Corrente & Conciliação Bancária,
 * gestão multi-banco (Conta Principal vs. Investimento) e Alertas de Divergência.
 */

const express = require('express');
const conciliador = require('../services/conciliacao-extrato.service');
const openFinance = require('../services/open-finance.service');
const { executarRotinaDiaria, getUltimaExecucao } = require('../services/bank-conciliation-cron.service');

module.exports = function (db) {
  const router = express.Router();

  // 1. Resumo e Painel de Conciliação (suporta ?accountId=ALL ou id específico)
  router.get('/painel', async (req, res) => {
    try {
      const pendenciasSistema = conciliador.obterPendenciasSistema();
      const execucaoInfo = getUltimaExecucao();

      if (!openFinance.isConfigured()) {
        const divInfo = conciliador.listarAlertasDivergencia({});
        return res.json({
          success: false,
          needsConfig: true,
          pendenciasSistema,
          divergenciasAbertasCount: divInfo.counts.ALL.open,
          ultimaExecucao: execucaoInfo.ultima,
          historicoExecucoes: execucaoInfo.historico,
          message: 'Credenciais do Open Finance (Pluggy) ainda não configuradas neste servidor.'
        });
      }

      const accountId = req.query.accountId ? String(req.query.accountId) : undefined;
      const [painel, saldo, itemStatus] = await Promise.all([
        conciliador.obterPainelConciliacao(accountId ? { accountId } : {}),
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

  // 2. Saldo consolidado e da Conta Principal (retorna 200 mesmo quando não configurado)
  router.get('/saldo', async (req, res) => {
    try {
      if (!openFinance.isConfigured()) {
        return res.json({
          configured: false,
          saldoPrincipal: null,
          saldoInvestimento: 0,
          saldoTotal: 0,
          contaPrincipal: null,
          contas: []
        });
      }
      const saldo = await openFinance.getSaldo();
      res.json(saldo);
    } catch (err) {
      console.error('[BankConciliation] Erro em /saldo:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Contas conectadas e seus papéis (PRINCIPAL | INVESTIMENTO | SECUNDARIO)
  router.get('/accounts', async (req, res) => {
    try {
      if (!openFinance.isConfigured()) {
        return res.json({ configured: false, contas: [] });
      }
      const contas = await openFinance.getContas();
      res.json({ configured: true, contas });
    } catch (err) {
      console.error('[BankConciliation] Erro em /accounts:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Definir papel de uma conta (Conta Principal / Investimento / Secundário)
  router.put('/accounts/:accountId/role', async (req, res) => {
    try {
      const { accountId } = req.params;
      const { role, customLabel, bankName, accountNumber, itemId } = req.body || {};
      const updated = openFinance.setAccountConfig({
        accountId,
        itemId,
        bankName,
        accountNumber,
        role,
        customLabel
      });
      const saldo = openFinance.isConfigured() ? await openFinance.getSaldo() : null;
      res.json({ success: true, updated, saldo });
    } catch (err) {
      console.error('[BankConciliation] Erro em PUT /accounts/:accountId/role:', err);
      res.status(400).json({ error: err.message });
    }
  });

  // 5. Gerar link OAuth do MeuPluggy para conectar novo banco (ex: Mercado Pago)
  router.post('/gerar-link-conexao', async (req, res) => {
    try {
      if (!openFinance.isConfigured()) {
        return res.status(400).json({ error: 'Configure Client ID e Client Secret antes de conectar novas contas.' });
      }
      const linkInfo = await openFinance.gerarLinkConexaoMeuPluggy();
      res.json({ success: true, ...linkInfo });
    } catch (err) {
      console.error('[BankConciliation] Erro em /gerar-link-conexao:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Confirmar nova conexão MeuPluggy e registrar novas contas
  router.post('/confirmar-conexao', async (req, res) => {
    try {
      const { itemId } = req.body || {};
      const result = await openFinance.confirmarConexaoItem(itemId);
      res.json(result);
    } catch (err) {
      console.error('[BankConciliation] Erro em /confirmar-conexao:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 7. Alertas de Divergência (listagem com filtros por categoria e status)
  router.get('/divergencias', (req, res) => {
    try {
      const { category = '', status = '' } = req.query;
      const result = conciliador.listarAlertasDivergencia({ category, status });
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[BankConciliation] Erro em GET /divergencias:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 8. Marcar alerta de divergência como resolvido com observação
  router.put('/divergencias/:id/resolver', (req, res) => {
    try {
      const { id } = req.params;
      const resolutionNote = req.body?.resolutionNote || '';
      const resolvedBy = req.user?.name || req.body?.userName || 'Administrador';
      const alert = conciliador.resolverAlertaDivergencia(id, { resolutionNote, resolvedBy });
      res.json({ success: true, alert });
    } catch (err) {
      console.error('[BankConciliation] Erro em PUT /divergencias/:id/resolver:', err);
      res.status(400).json({ error: err.message });
    }
  });

  // 9. Reabrir alerta de divergência
  router.put('/divergencias/:id/reabrir', (req, res) => {
    try {
      const { id } = req.params;
      const alert = conciliador.reabrirAlertaDivergencia(id);
      res.json({ success: true, alert });
    } catch (err) {
      console.error('[BankConciliation] Erro em PUT /divergencias/:id/reabrir:', err);
      res.status(400).json({ error: err.message });
    }
  });

  // 10. Executar rotina diária sob demanda (conciliação + auditoria de anomalias)
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

  // 11. Ler configuração atual (sem expor clientSecret em texto puro)
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

  // 12. Salvar e validar credenciais no banco do sistema
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

  // 13. Conciliar Itens Selecionados
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

  // 14. Conciliação Automática em Massa (Extrato + Pendências vencidas de Maquininha e iFood)
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

  // 15. Conciliar e zerar pendências vencidas de Maquininha e iFood no sistema
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

  return router;
};
