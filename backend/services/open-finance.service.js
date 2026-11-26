/**
 * backend/services/open-finance.service.js
 *
 * Módulo de Integração com o Open Finance via Pluggy (Meu Pluggy)
 * Permite buscar saldo consolidado, extrato de transações enriquecido
 * e realizar conciliação bancária automática (Cartões, Pix, Boletos e Fornecedores).
 */

const fs = require('fs');
const path = require('path');

class OpenFinanceService {
  constructor() {
    this.clientId = process.env.PLUGGY_CLIENT_ID;
    this.clientSecret = process.env.PLUGGY_CLIENT_SECRET;
    this.defaultItemId = process.env.PLUGGY_DEFAULT_ITEM_ID;
    this.defaultAccountId = process.env.PLUGGY_DEFAULT_ACCOUNT_ID;
    this.baseUrl = 'https://api.pluggy.ai';

    this.cachedApiKey = null;
    this.apiKeyExpiresAt = 0;
  }

  /**
   * Obtém chave temporária de API via Client ID & Secret
   */
  async getApiKey() {
    if (this.cachedApiKey && Date.now() < this.apiKeyExpiresAt) {
      return this.cachedApiKey;
    }

    if (!this.clientId || !this.clientSecret) {
      throw new Error('Credenciais da Pluggy (PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET) não configuradas.');
    }

    const resp = await globalThis.fetch(`${this.baseUrl}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: this.clientId,
        clientSecret: this.clientSecret
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Falha na autenticação Pluggy HTTP ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    this.cachedApiKey = data.apiKey;
    // Chave válida tipicamente por 2 horas; renovamos com 5 minutos de folga
    this.apiKeyExpiresAt = Date.now() + 115 * 60 * 1000;
    return this.cachedApiKey;
  }

  /**
   * Lista as contas conectadas (ou dados de saldo da conta principal)
   */
  async getContas(itemId = null) {
    const apiKey = await this.getApiKey();
    const targetItem = itemId || this.defaultItemId;
    const url = targetItem 
      ? `${this.baseUrl}/accounts?itemId=${targetItem}`
      : `${this.baseUrl}/accounts`;

    const resp = await globalThis.fetch(url, {
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
    const apiKey = await this.getApiKey();
    const accountId = options.accountId || this.defaultAccountId;
    if (!accountId) {
      throw new Error('accountId não informado para consulta de transações.');
    }

    let url = `${this.baseUrl}/v2/transactions?accountId=${accountId}`;
    if (options.from) url += `&from=${options.from}`;
    if (options.to) url += `&to=${options.to}`;
    if (options.pageSize) url += `&pageSize=${options.pageSize}`;

    const resp = await globalThis.fetch(url, {
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
      const descRaw = (t.descriptionRaw || '').toUpperCase();
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
        // Identificar repasses de cartão (Rede, Cielo, Stone, Getnet, etc.)
        if (desc.includes('REDE ') || desc.includes('CIELO') || desc.includes('STONE') || desc.includes('GETNET') || desc.includes('PAGSEGURO') || desc.includes('IFOOD')) {
          resumo.repassesCartao.push(item);
        } else if (desc.includes('PIX') || desc.includes('QRS')) {
          resumo.pixRecebidos.push(item);
        } else {
          resumo.outros.push(item);
        }
      } else {
        resumo.saidas += Math.abs(valor);
        // Identificar tarifas e impostos
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
