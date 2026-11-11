/**
 * backend/services/banco-inter.service.js
 *
 * Módulo de Integração com a API de Cobrança v3 do Banco Inter
 * Suporta emissão de Boleto Híbrido (Boleto com QR Code Pix acoplado),
 * consulta de situação de pagamento, baixa e download do PDF do boleto.
 *
 * Utiliza mTLS com Certificado e Chave Privada do Banco Inter.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const fetch = require('node-fetch');

class BancoInterService {
  constructor() {
    this.clientId = process.env.INTER_CLIENT_ID;
    this.clientSecret = process.env.INTER_CLIENT_SECRET;
    this.certPath = process.env.INTER_CERT_PATH;
    this.keyPath = process.env.INTER_KEY_PATH;
    this.baseUrl = process.env.INTER_BASE_URL || 'https://cdpj.partners.bancointer.com.br';

    this.cachedToken = null;
    this.tokenExpiresAt = 0;
    this.httpsAgent = null;

    this.initAgent();
  }

  initAgent() {
    try {
      if (this.certPath && this.keyPath && fs.existsSync(this.certPath) && fs.existsSync(this.keyPath)) {
        const cert = fs.readFileSync(this.certPath);
        const key = fs.readFileSync(this.keyPath);
        this.httpsAgent = new https.Agent({
          cert,
          key,
          keepAlive: true,
          rejectUnauthorized: true
        });
        console.log('🔒 [Banco Inter] mTLS Agent configurado com sucesso com certificado e chave.');
      } else {
        console.warn('⚠️ [Banco Inter] Certificado ou chave não encontrados nos caminhos configurados.');
      }
    } catch (err) {
      console.error('❌ [Banco Inter] Erro ao carregar certificados mTLS:', err.message);
    }
  }

  /**
   * Obtém token OAuth2 (com cache em memória até expiração)
   */
  async getAccessToken() {
    if (this.cachedToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    if (!this.clientId || !this.clientSecret || !this.httpsAgent) {
      throw new Error('Credenciais do Banco Inter ou certificados mTLS não configurados.');
    }

    const tokenUrl = `${this.baseUrl}/oauth/v2/token`;
    const params = new URLSearchParams();
    params.append('client_id', this.clientId);
    params.append('client_secret', this.clientSecret);
    params.append('grant_type', 'client_credentials');
    params.append('scope', 'boleto-cobranca.read boleto-cobranca.write');

    try {
      const resp = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString(),
        agent: this.httpsAgent,
        timeout: 10000
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Falha na autenticação Banco Inter HTTP ${resp.status}: ${errText}`);
      }

      const data = await resp.json();
      this.cachedToken = data.access_token;
      // Expira 60 segundos antes da margem oficial
      this.tokenExpiresAt = Date.now() + ((data.expires_in || 3600) - 60) * 1000;
      console.log('🔑 [Banco Inter] Token de acesso renovado com sucesso.');
      return this.cachedToken;
    } catch (err) {
      console.error('❌ [Banco Inter] Erro ao obter token OAuth2:', err.message);
      throw err;
    }
  }

  /**
   * Emite um Boleto Híbrido (com Pix acoplado)
   * @param {Object} dados
   * @param {string} dados.seuNumero Identificador único (ex: INV_123)
   * @param {number} dados.valor Valor em reais (ex: 150.00)
   * @param {string} dados.dataVencimento Formato YYYY-MM-DD
   * @param {Object} dados.cliente Dados do pagador
   */
  async emitirBoletoHibrido({ seuNumero, valor, dataVencimento, cliente }) {
    if (!cliente.cpf) {
      throw new Error(`CPF do cliente ${cliente.nome} é obrigatório para emissão de boleto bancário no Banco Inter.`);
    }

    const cleanCpf = String(cliente.cpf).replace(/\D/g, '');
    if (cleanCpf.length !== 11 && cleanCpf.length !== 14) {
      throw new Error(`CPF/CNPJ inválido: ${cliente.cpf}`);
    }

    const token = await this.getAccessToken();
    const cobrancaUrl = `${this.baseUrl}/cobranca/v3/cobrancas`;

    const cleanPhone = cliente.telefone ? String(cliente.telefone).replace(/\D/g, '').slice(-11) : '';

    const payload = {
      seuNumero: String(seuNumero).substring(0, 15),
      valorNominal: Number(valor.toFixed(2)),
      dataVencimento: dataVencimento,
      numDiasAgenda: 60,
      pagador: {
        cpfCnpj: cleanCpf,
        tipoPessoa: cleanCpf.length === 11 ? 'FISICA' : 'JURIDICA',
        nome: String(cliente.nome).substring(0, 100),
        telefone: cleanPhone || undefined,
        email: cliente.email || undefined,
        cep: (cliente.cep || '36880000').replace(/\D/g, ''),
        numero: cliente.numero || 'S/N',
        complemento: cliente.complemento || '',
        bairro: cliente.bairro || 'Centro',
        cidade: cliente.cidade || 'Muriaé',
        uf: cliente.uf || 'MG',
        endereco: cliente.endereco || 'Área Urbana'
      },
      multa: {
        codigoMulta: 'PERCENTUAL',
        taxa: 2.0
      },
      mora: {
        codigoMora: 'TAXAMENSAL',
        taxa: 2.9
      },
      mensagem: {
        linha1: 'FATURA CREDIARIO 2.0 BELAFARMA',
        linha2: 'PAGAVEL EM QUALQUER BANCO OU VIA PIX'
      }
    };

    try {
      const resp = await fetch(cobrancaUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        agent: this.httpsAgent,
        timeout: 15000
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Erro ao emitir cobrança Inter HTTP ${resp.status}: ${errText}`);
      }

      const resData = await resp.json();
      console.log(`✅ [Banco Inter] Boleto emitido com sucesso! Nosso Número: ${resData.nossoNumero || resData.codigoBarras}`);

      return {
        success: true,
        nossoNumero: resData.nossoNumero,
        codigoBarras: resData.codigoBarras,
        linhaDigitavel: resData.linhaDigitavel,
        pixCopiaECola: resData.pixCopiaECola,
        txid: resData.txid,
        raw: resData
      };
    } catch (err) {
      console.error('❌ [Banco Inter] Erro ao emitir boleto:', err.message);
      throw err;
    }
  }

  /**
   * Obtém o PDF do boleto emitido pelo nossoNumero
   * @param {string} nossoNumero
   * @returns {Promise<Buffer>}
   */
  async obterBoletoPdf(nossoNumero) {
    const token = await this.getAccessToken();
    const pdfUrl = `${this.baseUrl}/cobranca/v3/cobrancas/${nossoNumero}/pdf`;

    const resp = await fetch(pdfUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      agent: this.httpsAgent,
      timeout: 15000
    });

    if (!resp.ok) {
      throw new Error(`Erro ao baixar PDF do boleto HTTP ${resp.status}`);
    }

    const data = await resp.json();
    if (data.pdf) {
      return Buffer.from(data.pdf, 'base64');
    }
    throw new Error('Retorno do Banco Inter não continha o campo pdf base64.');
  }

  /**
   * Consulta a situação de uma cobrança no Banco Inter
   * @param {string} nossoNumero
   */
  async consultarCobranca(nossoNumero) {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/cobranca/v3/cobrancas/${nossoNumero}`;

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      agent: this.httpsAgent,
      timeout: 10000
    });

    if (!resp.ok) {
      throw new Error(`Erro ao consultar cobrança HTTP ${resp.status}`);
    }

    return await resp.json();
  }

  /**
   * Configura a URL de Webhook para notificações automáticas de pagamento
   * @param {string} webhookUrl URL HTTPS pública que receberá o POST do Inter
   */
  async criarWebhook(webhookUrl) {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/cobranca/v3/cobrancas/webhook`;

    const resp = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ webhookUrl }),
      agent: this.httpsAgent,
      timeout: 10000
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Erro ao configurar Webhook Banco Inter HTTP ${resp.status}: ${errText}`);
    }

    console.log(`✅ [Banco Inter] Webhook registrado com sucesso: ${webhookUrl}`);
    return { success: true, webhookUrl };
  }

  /**
   * Consulta a URL do Webhook configurado atualmente no Banco Inter
   */
  async consultarWebhook() {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/cobranca/v3/cobrancas/webhook`;

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      agent: this.httpsAgent,
      timeout: 10000
    });

    if (!resp.ok) {
      if (resp.status === 404) {
        return { webhookUrl: null, active: false };
      }
      throw new Error(`Erro ao consultar Webhook Banco Inter HTTP ${resp.status}`);
    }

    return await resp.json();
  }

  /**
   * Exclui o Webhook registrado no Banco Inter
   */
  async excluirWebhook() {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}/cobranca/v3/cobrancas/webhook`;

    const resp = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      agent: this.httpsAgent,
      timeout: 10000
    });

    if (!resp.ok && resp.status !== 404) {
      throw new Error(`Erro ao excluir Webhook Banco Inter HTTP ${resp.status}`);
    }

    console.log('🗑️ [Banco Inter] Webhook de cobrança excluído.');
    return { success: true };
  }
}

module.exports = new BancoInterService();
