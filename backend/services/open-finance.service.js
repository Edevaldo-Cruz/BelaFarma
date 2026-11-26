/**
 * backend/services/open-finance.service.js
 *
 * Módulo de Integração com o Open Finance via Pluggy (Meu Pluggy)
 * Suporta múltiplas contas bancárias (Itaú, Mercado Pago, etc.), classificação
 * entre Conta Principal vs. Investimento, e conexão de novas instituições.
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

const VALID_ROLES = ['PRINCIPAL', 'INVESTIMENTO', 'SECUNDARIO'];

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

    let extraItems = [];
    const rawItems = this.getSetting('pluggy_item_ids');
    if (rawItems) {
      try {
        const parsed = JSON.parse(rawItems);
        if (Array.isArray(parsed)) {
          extraItems = parsed.map(x => String(x || '').trim()).filter(Boolean);
        }
      } catch (e) {}
    }

    const itemIds = Array.from(new Set([defaultItemId, ...extraItems].filter(Boolean)));

    return {
      clientId,
      clientSecret,
      defaultItemId,
      defaultAccountId,
      itemIds
    };
  }

  /**
   * Verifica se há credenciais mínimas configuradas para consultar a Pluggy
   */
  isConfigured() {
    const cfg = this.getConfig();
    return Boolean(cfg.clientId && cfg.clientSecret && (cfg.defaultAccountId || cfg.itemIds.length > 0));
  }

  /**
   * Adiciona um Item ID à lista persistida de conexões da Pluggy
   */
  addItemIdToConfig(itemId) {
    const cleanId = String(itemId || '').trim();
    if (!cleanId) return [];
    const cfg = this.getConfig();
    const updated = Array.from(new Set([...cfg.itemIds, cleanId]));
    this.setSetting('pluggy_item_ids', JSON.stringify(updated));
    if (!cfg.defaultItemId) {
      this.setSetting('pluggy_default_item_id', cleanId);
    }
    return updated;
  }

  /**
   * Lê mapa de configurações de papel das contas bancárias
   */
  getAccountConfigsMap() {
    const map = new Map();
    try {
      const db = getDbSafe();
      if (!db || typeof db.prepare !== 'function') return map;
      const rows = db.prepare('SELECT * FROM bank_accounts_config').all();
      rows.forEach(r => map.set(r.account_id, r));
    } catch (e) {}
    return map;
  }

  /**
   * Infere papel padrão quando uma conta aparece pela primeira vez
   */
  inferDefaultRole(account, hasPrincipalAlready) {
    const name = String(account?.name || account?.marketingName || '').toLowerCase();
    if (name.includes('mercado pago') || name.includes('mercadopago')) {
      return 'INVESTIMENTO';
    }
    if (!hasPrincipalAlready && (account?.subtype === 'CHECKING_ACCOUNT' || account?.type === 'BANK')) {
      return 'PRINCIPAL';
    }
    return 'SECUNDARIO';
  }

  /**
   * Salva o papel (PRINCIPAL | INVESTIMENTO | SECUNDARIO) e rótulo de uma conta bancária
   */
  setAccountConfig({ accountId, itemId, bankName, accountNumber, role, customLabel }) {
    const cleanAccId = String(accountId || '').trim();
    if (!cleanAccId) {
      throw new Error('accountId é obrigatório.');
    }
    const normalizedRole = String(role || 'SECUNDARIO').toUpperCase();
    if (!VALID_ROLES.includes(normalizedRole)) {
      throw new Error(`Papel inválido: ${role}. Use PRINCIPAL, INVESTIMENTO ou SECUNDARIO.`);
    }

    const db = getDbSafe();
    if (!db || typeof db.prepare !== 'function') {
      throw new Error('Banco de dados indisponível.');
    }

    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      if (normalizedRole === 'PRINCIPAL') {
        db.prepare(`
          UPDATE bank_accounts_config
          SET role = 'SECUNDARIO', updated_at = ?
          WHERE role = 'PRINCIPAL' AND account_id != ?
        `).run(now, cleanAccId);
      }

      db.prepare(`
        INSERT INTO bank_accounts_config (
          account_id, item_id, bank_name, account_number, role, custom_label, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          item_id = COALESCE(NULLIF(excluded.item_id, ''), bank_accounts_config.item_id),
          bank_name = COALESCE(NULLIF(excluded.bank_name, ''), bank_accounts_config.bank_name),
          account_number = COALESCE(NULLIF(excluded.account_number, ''), bank_accounts_config.account_number),
          role = excluded.role,
          custom_label = COALESCE(excluded.custom_label, bank_accounts_config.custom_label),
          updated_at = excluded.updated_at
      `).run(
        cleanAccId,
        itemId || '',
        bankName || '',
        accountNumber || '',
        normalizedRole,
        customLabel !== undefined ? customLabel : null,
        now
      );
    });

    tx();
    return { accountId: cleanAccId, role: normalizedRole, customLabel };
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

    this.cachedApiKey = null;
    this.apiKeyExpiresAt = 0;
    const apiKey = await this.getApiKey({ clientId: nextClientId, clientSecret: nextClientSecret });

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
    if (nextItemId) {
      this.addItemIdToConfig(nextItemId);
    }

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
    this.apiKeyExpiresAt = Date.now() + 115 * 60 * 1000;
    return this.cachedApiKey;
  }

  /**
   * Obtém o status da conexão (Item) no Open Finance
   */
  async getItemStatus(itemId = null) {
    const cfg = this.getConfig();
    const targetItem = itemId || cfg.defaultItemId || cfg.itemIds[0];
    if (!targetItem) {
      return null;
    }

    const apiKey = await this.getApiKey(cfg);
    const resp = await fetchFn(`${this.baseUrl}/items/${encodeURIComponent(targetItem)}`, {
      headers: { 'X-API-KEY': apiKey }
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Erro ao consultar status do Item Pluggy HTTP ${resp.status}: ${err}`);
    }

    const item = await resp.json();
    return {
      id: item.id,
      status: item.status,
      executionStatus: item.executionStatus,
      lastUpdatedAt: item.lastUpdatedAt,
      nextAutoSyncAt: item.nextAutoSyncAt,
      consentExpiresAt: item.consentExpiresAt,
      error: item.error || null
    };
  }

  /**
   * Gera um novo link OAuth do MeuPluggy (connectorId 200) para autorizar novas contas (ex: Mercado Pago)
   */
  async gerarLinkConexaoMeuPluggy() {
    const apiKey = await this.getApiKey();
    const createRes = await fetchFn(`${this.baseUrl}/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey
      },
      body: JSON.stringify({ connectorId: 200, parameters: {} })
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`Erro ao criar conexão MeuPluggy HTTP ${createRes.status}: ${err}`);
    }

    const created = await createRes.json();
    const itemId = created.id;
    let authUrl = created.parameter?.data || null;

    for (let i = 0; i < 4 && !authUrl; i++) {
      await new Promise(r => setTimeout(r, 800));
      const detailRes = await fetchFn(`${this.baseUrl}/items/${encodeURIComponent(itemId)}`, {
        headers: { 'X-API-KEY': apiKey }
      });
      if (detailRes.ok) {
        const detail = await detailRes.json();
        if (detail.parameter?.data) {
          authUrl = detail.parameter.data;
          break;
        }
      }
    }

    if (!authUrl) {
      throw new Error('A Pluggy não retornou o link OAuth a tempo. Tente novamente.');
    }

    return { itemId, authUrl };
  }

  /**
   * Confirma uma nova conexão MeuPluggy após o usuário autorizar no link OAuth
   */
  async confirmarConexaoItem(itemId) {
    const cleanId = String(itemId || '').trim();
    if (!cleanId) {
      throw new Error('itemId é obrigatório para confirmar a conexão.');
    }

    const apiKey = await this.getApiKey();
    const itemRes = await fetchFn(`${this.baseUrl}/items/${encodeURIComponent(cleanId)}`, {
      headers: { 'X-API-KEY': apiKey }
    });
    if (!itemRes.ok) {
      const err = await itemRes.text();
      throw new Error(`Erro ao consultar conexão HTTP ${itemRes.status}: ${err}`);
    }

    const item = await itemRes.json();
    const accRes = await fetchFn(`${this.baseUrl}/accounts?itemId=${encodeURIComponent(cleanId)}`, {
      headers: { 'X-API-KEY': apiKey }
    });
    const accData = accRes.ok ? await accRes.json() : { results: [] };
    const rawContas = accData.results || [];

    if (item.status !== 'UPDATED' && rawContas.length === 0) {
      return {
        success: false,
        status: item.status,
        executionStatus: item.executionStatus,
        message:
          item.status === 'WAITING_USER_INPUT'
            ? 'A autorização ainda não foi concluída no link do MeuPluggy.'
            : `Conexão ainda em processamento (${item.status}). Aguarde alguns segundos e tente novamente.`
      };
    }

    this.addItemIdToConfig(cleanId);
    const contas = await this.getContas();

    return {
      success: true,
      status: item.status,
      contas
    };
  }

  /**
   * Lista todas as contas conectadas (multi-item) enriquecidas com papel (PRINCIPAL/INVESTIMENTO/SECUNDARIO)
   */
  async getContas(itemId = null) {
    const cfg = this.getConfig();
    const apiKey = await this.getApiKey(cfg);
    const targets = itemId ? [itemId] : cfg.itemIds;

    let rawAccounts = [];
    if (targets.length === 0) {
      const resp = await fetchFn(`${this.baseUrl}/accounts`, {
        headers: { 'X-API-KEY': apiKey }
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Erro ao buscar contas Pluggy HTTP ${resp.status}: ${err}`);
      }
      const data = await resp.json();
      rawAccounts = data.results || [];
    } else {
      const responses = await Promise.allSettled(
        targets.map(async (tid) => {
          const resp = await fetchFn(`${this.baseUrl}/accounts?itemId=${encodeURIComponent(tid)}`, {
            headers: { 'X-API-KEY': apiKey }
          });
          if (!resp.ok) {
            const err = await resp.text();
            throw new Error(`HTTP ${resp.status}: ${err}`);
          }
          const data = await resp.json();
          return (data.results || []).map(acc => ({ ...acc, itemId: acc.itemId || tid }));
        })
      );

      for (const r of responses) {
        if (r.status === 'fulfilled') {
          rawAccounts.push(...r.value);
        } else {
          console.warn('[OpenFinance] Falha parcial ao buscar contas de um item:', r.reason?.message || r.reason);
        }
      }

      if (rawAccounts.length === 0 && responses.every(r => r.status === 'rejected')) {
        const firstErr = responses[0]?.reason?.message || 'Falha ao consultar contas na Pluggy';
        throw new Error(`Erro ao buscar contas Pluggy: ${firstErr}`);
      }
    }

    // Deduplicar contas pelo account.id mantendo a mais recente
    const dedupMap = new Map();
    for (const acc of rawAccounts) {
      if (!acc || !acc.id) continue;
      dedupMap.set(acc.id, acc);
    }

    const configsMap = this.getAccountConfigsMap();
    let hasPrincipal = Array.from(configsMap.values()).some(c => c.role === 'PRINCIPAL');

    const enriched = [];
    for (const acc of dedupMap.values()) {
      let existingCfg = configsMap.get(acc.id);
      if (!existingCfg) {
        const inferredRole = this.inferDefaultRole(acc, hasPrincipal);
        if (inferredRole === 'PRINCIPAL') {
          hasPrincipal = true;
        }
        try {
          this.setAccountConfig({
            accountId: acc.id,
            itemId: acc.itemId || '',
            bankName: acc.marketingName || acc.name || '',
            accountNumber: acc.number || '',
            role: inferredRole,
            customLabel: null
          });
          existingCfg = { role: inferredRole, custom_label: null };
        } catch (e) {
          existingCfg = { role: inferredRole, custom_label: null };
        }
      }

      enriched.push({
        ...acc,
        role: existingCfg.role || 'SECUNDARIO',
        customLabel: existingCfg.custom_label || null
      });
    }

    return enriched;
  }

  /**
   * Obtém saldo separado por Conta Principal, Investimento e Total Consolidado
   */
  async getSaldo() {
    const contas = await this.getContas();

    let saldoTotal = 0;
    let saldoPrincipal = 0;
    let saldoInvestimento = 0;
    let contaPrincipal = null;

    const detalhe = contas.map(c => {
      const valor = Number(c.balance || 0);
      saldoTotal += valor;
      if (c.role === 'PRINCIPAL') {
        saldoPrincipal += valor;
        if (!contaPrincipal) {
          contaPrincipal = {
            id: c.id,
            itemId: c.itemId || null,
            nome: c.marketingName || c.name,
            customLabel: c.customLabel || null,
            numero: c.number,
            saldo: valor,
            role: c.role
          };
        }
      } else if (c.role === 'INVESTIMENTO') {
        saldoInvestimento += valor;
      }

      return {
        id: c.id,
        itemId: c.itemId || null,
        nome: c.marketingName || c.name,
        customLabel: c.customLabel || null,
        tipo: c.type,
        subtipo: c.subtype,
        numero: c.number,
        saldo: valor,
        moeda: c.currencyCode,
        role: c.role || 'SECUNDARIO'
      };
    });

    if (!contaPrincipal && detalhe.length > 0) {
      saldoPrincipal = detalhe[0].saldo;
      contaPrincipal = {
        id: detalhe[0].id,
        itemId: detalhe[0].itemId,
        nome: detalhe[0].nome,
        customLabel: detalhe[0].customLabel,
        numero: detalhe[0].numero,
        saldo: detalhe[0].saldo,
        role: detalhe[0].role
      };
    }

    return {
      configured: true,
      saldoPrincipal: Number(saldoPrincipal.toFixed(2)),
      saldoInvestimento: Number(saldoInvestimento.toFixed(2)),
      saldoTotal: Number(saldoTotal.toFixed(2)),
      contaPrincipal,
      contas: detalhe,
      atualizadoEm: new Date().toISOString()
    };
  }

  /**
   * Busca extrato de transações de uma conta específica, de todas ('ALL') ou da Conta Principal (padrão)
   */
  async getTransacoes(options = {}) {
    const cfg = this.getConfig();
    const apiKey = await this.getApiKey(cfg);

    const fetchByAccount = async (accountId, accountName = null) => {
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
      return (data.results || []).map(tx => ({
        ...tx,
        _accountId: accountId,
        _accountName: accountName || undefined
      }));
    };

    if (options.accountId === 'ALL') {
      const contas = await this.getContas();
      if (contas.length === 0) return [];
      const results = await Promise.allSettled(
        contas.map(c => fetchByAccount(c.id, c.customLabel || c.marketingName || c.name))
      );
      const merged = [];
      for (const r of results) {
        if (r.status === 'fulfilled') merged.push(...r.value);
      }
      return merged.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    }

    let accountId = options.accountId;
    if (!accountId) {
      try {
        const contas = await this.getContas();
        const principal = contas.find(c => c.role === 'PRINCIPAL') || contas[0];
        if (principal?.id) {
          accountId = principal.id;
        }
      } catch (e) {}
    }

    if (!accountId) {
      accountId = cfg.defaultAccountId;
    }

    if (!accountId) {
      throw new Error('accountId não informado para consulta de transações.');
    }

    return await fetchByAccount(accountId);
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
