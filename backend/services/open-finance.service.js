/**
 * backend/services/open-finance.service.js
 *
 * Módulo de Integração com o Open Finance via Pluggy (Meu Pluggy)
 * Permite buscar saldo consolidado, extrato de transações enriquecido
 * e realizar conciliação bancária automática (Cartões, Pix, Boletos e Fornecedores).
 */

const fs = require('fs');
const path = require('path');

const backendEnvPath = path.join(__dirname, '../.env');
if (fs.existsSync(backendEnvPath)) {
  require('dotenv').config({ path: backendEnvPath });
}

const fetchFn = globalThis.fetch ? globalThis.fetch.bind(globalThis) : require('node-fetch');

function getDbSafe() {
  try {
    return require('../database');
  } catch (err) {
    return null;
  }
}

class OpenFinanceService {
  constructor() {
    this.baseUrl = 'https://api.pluggy.ai';
    this.cachedApiKey = null;
    this.cachedCredsFingerprint = null;
    this.apiKeyExpiresAt = 0;
  }

  getSetting(key) {
    try {
      const db = getDbSafe();
      if (!db || typeof db.prepare !== 'function') return '';
      const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
      return row && row.value ? String(row.value).trim() : '';
    } catch (err) {
      return '';
    }
  }

  setSetting(key, value) {
    const db = getDbSafe();
    if (!db || typeof db.prepare !== 'function') {
      throw new Error('Banco de dados indisponível para salvar configuração.');
    }
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `).run(key, String(value || '').trim(), now);
  }

  /**
   * Lê credenciais priorizando system_settings e fazendo fallback para process.env
   */
  getConfig() {
    const clientId = this.getSetting('pluggy_client_id') || String(process.env.PLUGGY_CLIENT_ID || '').trim();
    const clientSecret = this.getSetting('pluggy_client_secret') || String(process.env.PLUGGY_CLIENT_SECRET || '').trim();
    const defaultItemId = this.getSetting('pluggy_default_item_id') || String(process.env.PLUGGY_DEFAULT_ITEM_ID || '').trim();
    const defaultAccountId = this.getSetting('pluggy_default_account_id') || String(process.env.PLUGGY_DEFAULT_ACCOUNT_ID || '').trim();

    return {
      clientId,
      clientSecret,
      defaultItemId,
      defaultAccountId
    };
  }

  /**
   * Verifica se há credenciais mínimas configuradas para consultar a Pluggy
   */
  isConfigured() {
    const cfg = this.getConfig();
    return Boolean(cfg.clientId && cfg.clientSecret && (cfg.defaultAccountId || cfg.defaultItemId));
  }

  /**
   * Salva e valida credenciais do Open Finance na tabela system_settings
   */
  async saveConfig({ clientId, clientSecret, defaultItemId, defaultAccountId }) {
    const current = this.getConfig();
    const nextClientId = (clientId !== undefined ? String(clientId) : current.clientId).trim();
    const nextClientSecret = (
      clientSecret !== undefined && String(clientSecret).trim() !== ''
        ? String(clientSecret)
        : current.clientSecret
    ).trim();
    const nextItemId = (defaultItemId !== undefined ? String(defaultItemId) : current.defaultItemId).trim();
    let nextAccountId = (defaultAccountId !== undefined ? String(defaultAccountId) : current.defaultAccountId).trim();

    if (!nextClientId || !nextClientSecret) {
      throw new Error('Client ID e Client Secret são obrigatórios.');
    }
    if (!nextItemId && !nextAccountId) {
      throw new Error('Informe o Item ID ou Account ID da conta conectada na Pluggy.');
    }

    // Valida autenticação antes de persistir
    this.cachedApiKey = null;
    this.apiKeyExpiresAt = 0;
    const apiKey = await this.getApiKey({ clientId: nextClientId, clientSecret: nextClientSecret });

    // Se informou Item ID mas não Account ID, descobre automaticamente a conta principal
    if (nextItemId && !nextAccountId) {
      const resp = await fetchFn(`${this.baseUrl}/accounts?itemId=${encodeURIComponent(nextItemId)}`, {
        headers: { 'X-API-KEY': apiKey }
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Erro ao validar Item ID na Pluggy HTTP ${resp.status}: ${err}`);
      }
      const data = await resp.json();
      const contas = data.results || [];
      if (contas.length > 0 && contas[0].id) {
        nextAccountId = String(contas[0].id);
      }
    }

    this.setSetting('pluggy_client_id', nextClientId);
    this.setSetting('pluggy_client_secret', nextClientSecret);
    this.setSetting('pluggy_default_item_id', nextItemId);
    this.setSetting('pluggy_default_account_id', nextAccountId);

    return {
      clientId: nextClientId,
      clientSecret: nextClientSecret,
      defaultItemId: nextItemId,
      defaultAccountId: nextAccountId
    };
  }

  /**
   * Obtém chave temporária de API via Client ID & Secret
   */
  async getApiKey(overrideConfig = null) {
    const cfg = overrideConfig || this.getConfig();
    const fingerprint = `${cfg.clientId}:${cfg.clientSecret}`;

    if (
      !overrideConfig &&
      this.cachedApiKey &&
      this.cachedCredsFingerprint === fingerprint &&
      Date.now() < this.apiKeyExpiresAt
    ) {
      return this.cachedApiKey;
    }

    if (!cfg.clientId || !cfg.clientSecret) {
      throw new Error('Credenciais da Pluggy (PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET) não configuradas.');
    }

    const resp = await fetchFn(`${this.baseUrl}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Falha na autenticação Pluggy HTTP ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    this.cachedApiKey = data.apiKey;
    this.cachedCredsFingerprint = fingerprint;
    // Chave válida tipicamente por 2 horas; renovamos com 5 minutos de folga
    this.apiKeyExpiresAt = Date.now() + 115 * 60 * 1000;
    return this.cachedApiKey;
  }

  /**
   * Lista as contas conectadas (ou dados de saldo da conta principal)
   */
  async getContas(itemId = null) {
    const cfg = this.getConfig();
    const apiKey = await this.getApiKey(cfg);
    const targetItem = itemId || cfg.defaultItemId;
    const url = targetItem
      ? `${this.baseUrl}/accounts?itemId=${encodeURIComponent(targetItem)}`
      : `${this.baseUrl}/accounts`;

    const resp = await fetchFn(url, {
      headers: { 'X-API-KEY': apiKey }
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Erro ao buscar contas Pluggy HTTP ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    return data.results || [];
  }

  /**
   * Obtém saldo consolidado
   */
  async getSaldo() {
    const contas = await this.getContas();
    let saldoTotal = 0;
    const detalhe = contas.map(c => {
      saldoTotal += Number(c.balance || 0);
      return {
        id: c.id,
        nome: c.name,
        tipo: c.type,
        subtipo: c.subtype,
        numero: c.number,
        saldo: Number(c.balance || 0),
        moeda: c.currencyCode
      };
    });

    return {
      saldoTotal,
      contas: detalhe,
      atualizadoEm: new Date().toISOString()
    };
  }

  /**
   * Busca extrato de transações
   * @param {Object} options
   * @param {string} options.accountId
   * @param {string} options.from (YYYY-MM-DD)
   * @param {string} options.to (YYYY-MM-DD)
   * @param {number} options.pageSize
   */
  async getTransacoes(options = {}) {
    const cfg = this.getConfig();
    const apiKey = await this.getApiKey(cfg);
    let accountId = options.accountId || cfg.defaultAccountId;

    if (!accountId && cfg.defaultItemId) {
      const contas = await this.getContas(cfg.defaultItemId);
      if (contas.length > 0 && contas[0].id) {
        accountId = contas[0].id;
      }
    }

    if (!accountId) {
      throw new Error('accountId não informado para consulta de transações.');
    }

    let url = `${this.baseUrl}/v2/transactions?accountId=${encodeURIComponent(accountId)}`;
    if (options.from) url += `&from=${encodeURIComponent(options.from)}`;
    if (options.to) url += `&to=${encodeURIComponent(options.to)}`;
    if (options.pageSize) url += `&pageSize=${encodeURIComponent(options.pageSize)}`;

    const resp = await fetchFn(url, {
      headers: { 'X-API-KEY': apiKey }
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Erro ao buscar transações Pluggy HTTP ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    return data.results || [];
  }

  /**
   * Classifica e analisa o extrato para conciliação da farmácia
   */
  async analisarExtrato(options = {}) {
    const transacoes = await this.getTransacoes(options);

    const resumo = {
      totalTransacoes: transacoes.length,
      entradas: 0,
      saidas: 0,
      pixRecebidos: [],
      repassesCartao: [],
      boletosEPagamentos: [],
      tarifasEDebitos: [],
      outros: []
    };

    for (const t of transacoes) {
      const valor = Number(t.amount || 0);
      const desc = (t.description || '').toUpperCase();
      const pagadorDoc = t.paymentData?.payer?.documentNumber?.value || '';

      const item = {
        id: t.id,
        data: t.date ? t.date.substring(0, 10) : '',
        valor,
        descricao: t.description,
        categoria: t.category,
        pagadorDocumento: pagadorDoc,
        status: t.status
      };

      if (valor > 0) {
        resumo.entradas += valor;
        if (desc.includes('REDE ') || desc.includes('CIELO') || desc.includes('STONE') || desc.includes('GETNET') || desc.includes('PAGSEGURO') || desc.includes('IFOOD')) {
          resumo.repassesCartao.push(item);
        } else if (desc.includes('PIX') || desc.includes('QRS')) {
          resumo.pixRecebidos.push(item);
        } else {
          resumo.outros.push(item);
        }
      } else {
        resumo.saidas += Math.abs(valor);
        if (desc.includes('TARIFA') || desc.includes('IOF') || desc.includes('ENCARGOS') || desc.includes('JUROS')) {
          resumo.tarifasEDebitos.push(item);
        } else {
          resumo.boletosEPagamentos.push(item);
        }
      }
    }

    return resumo;
  }
}

module.exports = new OpenFinanceService();
