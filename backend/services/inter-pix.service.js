const fs = require('fs');
const path = require('path');
const https = require('https');
const fetch = require('node-fetch');

/**
 * Serviço de Integração com a API Pix do Banco Inter PJ (Taxa Zero)
 * Possui suporte nativo a modo Real (mTLS) e modo Simulado (Mock) para testes.
 */
class InterPixService {
  constructor(db) {
    this.db = db;
    
    // Configurações do Banco Inter vindas do .env
    this.clientId = process.env.INTER_CLIENT_ID || '';
    this.clientSecret = process.env.INTER_CLIENT_SECRET || '';
    
    // Caminhos dos certificados no servidor
    this.certPath = process.env.INTER_CERT_PATH || path.join(__dirname, '../certs/inter.crt');
    this.keyPath = process.env.INTER_KEY_PATH || path.join(__dirname, '../certs/inter.key');
    
    this.chavePix = 'belafarmasul@gmail.com'; // Chave Pix cadastrada no Banco Inter

    // Cache do Access Token OAuth2
    this.cachedToken = null;
    this.tokenExpiresAt = null;

    // Memória para simulações locais (Modo Mock/Teste)
    this.isSimulatedMode = false;
    this.mockCharges = new Map(); // Guarda { txid: { value, description, status, createdAt } }

    this.checkConfiguration();
  }

  /**
   * Verifica se as credenciais e arquivos de certificados estão presentes.
   * Se faltar algo, ativa automaticamente o modo de simulação (Mock).
   */
  checkConfiguration() {
    const hasCredentials = this.clientId && this.clientSecret;
    const hasCertificates = fs.existsSync(this.certPath) && fs.existsSync(this.keyPath);

    if (!hasCredentials || !hasCertificates) {
      this.isSimulatedMode = true;
      console.log('------------------------------------------------------------');
      console.log('⚠️ [BANCO INTER PIX] Modo SIMULADO (MOCK) ativado!');
      console.log('   Motivo: Credenciais ou arquivos de certificados (.crt/.key) não configurados.');
      console.log('   Como configurar no .env para Produção:');
      console.log('   - INTER_CLIENT_ID, INTER_CLIENT_SECRET');
      console.log('   - INTER_CERT_PATH, INTER_KEY_PATH');
      console.log('------------------------------------------------------------');
    } else {
      console.log('⚡ [BANCO INTER PIX] Modo REAL (mTLS) ativado com sucesso.');
    }
  }

  /**
   * Retorna o HTTPS Agent configurado com os certificados mTLS do Banco Inter
   */
  getHttpsAgent() {
    if (this.isSimulatedMode) return null;
    
    try {
      return new https.Agent({
        cert: fs.readFileSync(this.certPath),
        key: fs.readFileSync(this.keyPath),
        keepAlive: true
      });
    } catch (e) {
      console.error('❌ [BANCO INTER PIX] Erro ao ler certificados do Banco Inter. Ativando modo simulado...', e.message);
      this.isSimulatedMode = true;
      return null;
    }
  }

  /**
   * Obtém o Token de Acesso OAuth2 do Banco Inter
   */
  async getAccessToken() {
    if (this.isSimulatedMode) return 'mock-token';

    // Se já tiver token válido no cache, retorna
    if (this.cachedToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    console.log('🔑 [BANCO INTER PIX] Solicitando novo Access Token OAuth2...');
    
    const agent = this.getHttpsAgent();
    const params = new URLSearchParams();
    params.append('client_id', this.clientId);
    params.append('client_secret', this.clientSecret);
    params.append('grant_type', 'client_credentials');
    params.append('scope', 'pix.write pix.read');

    try {
      const response = await fetch('https://cdg.bancointer.com.br/oauth/v2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString(),
        agent: agent,
        timeout: 8000
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro OAuth2 Banco Inter (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      this.cachedToken = data.access_token;
      // Define a expiração com folga de 60 segundos
      this.tokenExpiresAt = Date.now() + ((data.expires_in || 3600) - 60) * 1000;
      
      console.log('✅ [BANCO INTER PIX] Access Token OAuth2 obtido com sucesso.');
      return this.cachedToken;
    } catch (err) {
      console.error('❌ [BANCO INTER PIX] Falha na autenticação OAuth2:', err.message);
      throw err;
    }
  }

  /**
   * Cria uma Cobrança Imediata Pix (Pix Dinâmico)
   * @param {number} value Valor em Reais (BRL)
   * @param {string} description Descrição opcional
   */
  async createPixCharge(value, description) {
    const txid = 'belapix' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    const amountStr = parseFloat(value).toFixed(2);

    // MODO SIMULADO
    if (this.isSimulatedMode) {
      const payloadString = `00020126360014br.gov.bcb.pix0114mockinterpixpj5204000053039865405${amountStr}5802BR5915Bela Farma Sul6013Juiz de Fora62190515${txid}63041234`;
      
      const chargeMock = {
        txid: txid,
        value: parseFloat(value),
        description: description || 'Venda Gerador Pix (Simulado)',
        status: 'ATIVA', // status iniciais: ATIVA
        pixCopiaECola: payloadString,
        createdAt: new Date().toISOString()
      };

      this.mockCharges.set(txid, chargeMock);
      console.log(`[BANCO INTER MOCK] Cobrança criada com sucesso. Txid: ${txid}, Valor: R$ ${amountStr}`);
      return chargeMock;
    }

    // MODO REAL BANCO INTER PJ
    try {
      const token = await this.getAccessToken();
      const agent = this.getHttpsAgent();

      const body = {
        calendario: {
          expiracao: 86400 // 24 horas de validade
        },
        valor: {
          original: amountStr
        },
        chave: this.chavePix,
        solicitacaoPagador: description ? description.substring(0, 140) : 'Venda Bela Farma Sul'
      };

      console.log(`📡 [BANCO INTER PIX] Criando cobrança de R$ ${amountStr}...`);

      const response = await fetch(`https://cdg.bancointer.com.br/pix/v2/cob/${txid}`, {
        method: 'PUT', // A especificação do Bacen permite PUT com txid customizado
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        agent: agent,
        timeout: 8000
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro ao gerar Pix no Banco Inter (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      console.log(`✅ [BANCO INTER PIX] Cobrança criada. Txid: ${txid}`);
      return {
        txid: txid,
        value: parseFloat(value),
        description: description,
        status: data.status, // 'ATIVA'
        pixCopiaECola: data.pixCopiaECola,
        createdAt: new Date().toISOString()
      };
    } catch (err) {
      console.error('❌ [BANCO INTER PIX] Erro ao criar cobrança dinâmica:', err.message);
      throw err;
    }
  }

  /**
   * Consulta o status de uma cobrança específica pelo txid
   */
  async getChargeStatus(txid) {
    // MODO SIMULADO
    if (this.isSimulatedMode) {
      const charge = this.mockCharges.get(txid);
      if (!charge) return 'REMOVIDA';
      return charge.status;
    }

    // MODO REAL
    try {
      const token = await this.getAccessToken();
      const agent = this.getHttpsAgent();

      const response = await fetch(`https://cdg.bancointer.com.br/pix/v2/cob/${txid}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        agent: agent,
        timeout: 5000
      });

      if (!response.ok) {
        throw new Error(`Erro ao consultar Pix no Banco Inter (${response.status})`);
      }

      const data = await response.json();
      // O status do Pix do Banco Central pode ser: 'ATIVA' (pendente), 'CONCLUIDA' (paga), 'REMOVIDA_PELO_RECEBEDOR', etc.
      return data.status; 
    } catch (err) {
      console.error(`❌ [BANCO INTER PIX] Erro ao consultar txid ${txid}:`, err.message);
      return 'ERRO';
    }
  }

  /**
   * Simula o pagamento de um Pix na retaguarda (Apenas para modo Mock/Desenvolvimento)
   */
  simulatePayment(txid) {
    if (!this.isSimulatedMode) return false;
    
    const charge = this.mockCharges.get(txid);
    if (charge && charge.status === 'ATIVA') {
      charge.status = 'CONCLUIDA'; // 'CONCLUIDA' equivale ao pago do Banco Central
      console.log(`[BANCO INTER MOCK] ✓ Pagamento simulado com sucesso para txid: ${txid}`);
      
      // Realiza o lançamento automático no caixa diário
      const today = new Intl.DateTimeFormat('fr-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date());

      const PixBotService = require('./pix-bot.service');
      const pixBot = new PixBotService(this.db);
      pixBot.recordPixDirect(charge.value, charge.description || 'Venda Gerador Pix (Simulado)', today);
      
      return true;
    }
    return false;
  }
}

module.exports = InterPixService;
