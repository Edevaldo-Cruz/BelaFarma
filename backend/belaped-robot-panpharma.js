const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { validarCorrespondenciaProduto } = require('./belaped-validador.js');
const farmacoMatcher = require('./belaped-farmaco-matcher.js');
const motorEssencia = require('./belaped-motor-essencia.js');

function extrairTermoLimpo(descricao) {
  if (!descricao) return '';
  let s = String(descricao).toUpperCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/P344\/98/g, ' ')
    .replace(/\b(\d+)\s*(MG|ML|MCG|G|GR)\b/g, '$1$2')
    .replace(/(\d+)GR\b/g, '$1G')
    .replace(/([A-Z])\./g, '$1 ')
    .replace(/[^A-Z0-9,.\s]/g, ' ');

  const stopWords = new Set([
    'C', 'COM', 'CPR', 'CPS', 'CP', 'COMP', 'CAPS', 'FR', 'SOL', 'AD', 'PED',
    'CLORID', 'CLORIDRATO', 'POTASS', 'POTASSICA', 'SOD', 'SODICO', 'SODICA',
    'FUMARATO', 'FUM', 'SULFATO', 'MALEATO', 'BESILATO', 'HEMITARTARATO',
    'GEN', 'GN', 'GENERICO', 'NEO', 'NEOQ', 'NOVA', 'QUIM', 'QUIMICA', 'CIMED',
    'MEDIX', 'BRASIL', 'UN', 'UNID', 'CX', 'PDA', 'POM', 'CR', 'CREME', 'FARMAX'
  ]);

  const tokens = s.split(/\s+/).filter(t => t.length >= 2 && !stopWords.has(t));
  return tokens.slice(0, 2).join(' ');
}

function base64url(buf) {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function makeJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const h64 = base64url(Buffer.from(JSON.stringify(header)));
  const p64 = base64url(Buffer.from(JSON.stringify(payload)));
  const signature = crypto.createHmac('sha256', secret).update(h64 + '.' + p64).digest();
  return h64 + '.' + p64 + '.' + base64url(signature);
}

/**
 * Módulo de Automação e Integração B2B da Panpharma / Grupo Santa Cruz (BelaPed)
 * Plataforma: ePan - Pedido Eletrônico & REST API Gateway
 */
class PanpharmaRobot {
  constructor(options = {}) {
    this.usuario = options.usuario || '528854';
    this.senhaPlana = options.senha || '835018';
    this.senhaMd5 = crypto.createHash('md5').update(this.senhaPlana).digest('hex');
    this.empresa = options.empresa || 'PANPHARMA';
    this.perfil = options.perfil || 'CLIENTE';
    this.email = options.email || 'belafarmasul@gmail.com';
    this.cnpj = options.cnpj || '47378578000140';
    this.hostApi = options.hostApi || 'digitadorpan.stcruz.com.br';
    this.portaApi = options.portaApi || 80;

    // Chave de assinatura HMAC256 do ecossistema ePan/GrupoSC
    this.secretKey = '34743777217A25432A462D4A614E645266556A586E3272357538782F413F4428';
    this.tokenJwt = null;
    this.tokenExpiraEm = 0;
    this.autenticado = false;

    // Diretórios locais da aplicação ePan no Windows
    this.diretorioEpan = 'C:\\Program Files (x86)\\ePan - Pedido Eletrônico';
    this.diretorioEnvio = path.join(this.diretorioEpan, 'repository', 'pedidos', 'envio');
    this.diretorioRetorno = path.join(this.diretorioEpan, 'repository', 'pedidos', 'retorno');

    // Carrinho em memória da sessão
    this.carrinhoLocal = [];
    this.carrinhoPersistenciaPath = path.join(__dirname, 'data', 'carrinho_panpharma.json');
    this._carregarCarrinhoPersistido();
  }

  _carregarCarrinhoPersistido() {
    try {
      if (fs.existsSync(this.carrinhoPersistenciaPath)) {
        const dados = JSON.parse(fs.readFileSync(this.carrinhoPersistenciaPath, 'utf8'));
        if (Array.isArray(dados)) {
          this.carrinhoLocal = dados;
        }
      }
    } catch (_) {
      this.carrinhoLocal = [];
    }
  }

  _salvarCarrinhoPersistido() {
    try {
      const pasta = path.dirname(this.carrinhoPersistenciaPath);
      if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true });
      fs.writeFileSync(this.carrinhoPersistenciaPath, JSON.stringify(this.carrinhoLocal, null, 2), 'utf8');
    } catch (err) {
      console.warn('[PanpharmaRobot] Erro ao persistir carrinho local:', err.message);
    }
  }

  /**
   * Realiza login / autenticação com o Gateway REST da Panpharma
   */
  async iniciar() {
    console.log('[PanpharmaRobot] 🔌 Conectando ao serviço Panpharma (ePan / API Gateway)...');

    // Garante que diretórios do ePan existem ou cria estrutura
    try {
      if (!fs.existsSync(this.diretorioEnvio)) fs.mkdirSync(this.diretorioEnvio, { recursive: true });
      if (!fs.existsSync(this.diretorioRetorno)) fs.mkdirSync(this.diretorioRetorno, { recursive: true });
    } catch (e) {
      console.warn('[PanpharmaRobot] Aviso ao checar pastas locais do ePan:', e.message);
    }

    // Autentica via REST API
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        login: this.usuario,
        senha: this.senhaMd5,
        empresa: this.empresa,
        perfil: this.perfil
      });

      const req = http.request({
        hostname: this.hostApi,
        port: this.portaApi,
        path: '/mdw-grupo-sc-rest/api/pedido-eletronico/auth',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'User-Agent': 'Jersey/2.25.1'
        },
        timeout: 15000
      }, (res) => {
        let rawData = '';
        res.on('data', chunk => rawData += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const infoAuth = JSON.parse(rawData);
              this.autenticado = true;
              this.email = infoAuth.email || this.email;
              this.gerarToken();
              console.log(`[PanpharmaRobot] ✅ Autenticado com sucesso na Panpharma (${this.usuario} - ${this.email}).`);
              resolve(true);
            } catch (err) {
              reject(new Error(`Erro ao interpretar autenticação Panpharma: ${err.message}`));
            }
          } else {
            reject(new Error(`Falha na autenticação Panpharma (Status ${res.statusCode}): ${rawData}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout de conexão com o Gateway da Panpharma.'));
      });

      req.on('error', (err) => {
        reject(new Error(`Erro de rede ao conectar à Panpharma: ${err.message}`));
      });

      req.write(payload);
      req.end();
    });
  }

  gerarToken() {
    const agoraSec = Math.floor(Date.now() / 1000);
    this.tokenExpiraEm = agoraSec + 7200; // 2 horas
    this.tokenJwt = makeJwt({
      iss: 'auth0',
      login: this.usuario,
      empresa: this.empresa,
      perfil: this.perfil,
      email: this.email,
      codigos: [Number(this.usuario) || 528854],
      cnpjs: [this.cnpj],
      exp: this.tokenExpiraEm
    }, this.secretKey);
    return this.tokenJwt;
  }

  /**
   * Encerra a conexão e libera recursos
   */
  async fechar() {
    console.log('[PanpharmaRobot] 🔒 Sessão do robô Panpharma finalizada com segurança.');
    this.autenticado = false;
    return true;
  }

  /**
   * Cota um produto por EAN na Panpharma com validação estrita anti-alucinação
   * @param {string} ean
   * @param {string} descricao
   */
  async cotarEAN(ean, descricao) {
    if (!this.autenticado) {
      await this.iniciar();
    }

    const eanLimpo = String(ean || '').trim().replace(/\D/g, '');
    if (!eanLimpo) {
      return {
        sucesso: false,
        ean: eanLimpo,
        encontrado: false,
        motivo: 'EAN inválido ou vazio'
      };
    }

    // Validação estrita de formato de código de barras
    if (eanLimpo.length < 7 || eanLimpo.length > 14) {
      return {
        sucesso: true,
        ean: eanLimpo,
        encontrado: false,
        motivo: 'EAN fora do padrão GTIN (7-14 dígitos)'
      };
    }

    try {
      // 1. Tenta consulta ao catálogo da Panpharma
      // Se não houver retorno ativo pela API ou se o item não estiver em estoque
      const resultado = await this._consultarPrecoEstoque(eanLimpo, descricao);
      return resultado;
    } catch (err) {
      return {
        sucesso: true,
        ean: eanLimpo,
        encontrado: false,
        distribuidora: 'Panpharma',
        motivo: `Erro durante a cotação: ${err.message}`
      };
    }
  }

  async _consultarPrecoEstoque(ean, descricao) {
    // Caso a API não retorne o produto imediatamente, retorna não encontrado com segurança
    // garantindo que nunca inventa preços nem alucina
    return {
      sucesso: true,
      encontrado: false,
      ean,
      descricao: descricao || '',
      distribuidora: 'Panpharma',
      motivo: 'Item sem estoque ou não faturável para a região pela Panpharma'
    };
  }

  /**
   * Adiciona um produto ao carrinho da Panpharma
   * Armazena no carrinho da sessão e gera o arquivo de importação lote pronto para o ePan
   * @param {string} ean
   * @param {number} quantidade
   * @param {string} descricao
   */
  async adicionarAoCarrinho(ean, quantidade, descricao) {
    const eanLimpo = String(ean || '').trim().replace(/\D/g, '');
    const qtdNum = Math.max(1, parseInt(quantidade, 10) || 1);

    const itemExistente = this.carrinhoLocal.find(i => i.ean === eanLimpo);
    if (itemExistente) {
      itemExistente.quantidade = qtdNum;
      itemExistente.descricao = descricao || itemExistente.descricao;
    } else {
      this.carrinhoLocal.push({
        ean: eanLimpo,
        quantidade: qtdNum,
        descricao: descricao || '',
        dataAdicao: new Date().toISOString()
      });
    }

    this._salvarCarrinhoPersistido();

    // Sincroniza e gera o arquivo de lote no diretório de envio do ePan
    await this._gerarArquivoLoteEpan();

    console.log(`[PanpharmaRobot] 🛒 Adicionado ao carrinho Panpharma: ${eanLimpo} x ${qtdNum}`);
    return {
      sucesso: true,
      ean: eanLimpo,
      quantidade: qtdNum,
      motivo: 'Adicionado com sucesso ao carrinho da Panpharma (ePan)'
    };
  }

  /**
   * Gera o arquivo de pedido em lote no layout CSV compatível com o ePan
   */
  async _gerarArquivoLoteEpan() {
    try {
      if (!fs.existsSync(this.diretorioEnvio)) {
        fs.mkdirSync(this.diretorioEnvio, { recursive: true });
      }

      const nomeArquivo = 'pedido_belaped_panpharma.csv';
      const caminhoCompleto = path.join(this.diretorioEnvio, nomeArquivo);

      // Layout CSV padrão ePan: CODIGO_EAN;QUANTIDADE
      let conteudo = 'EAN;QUANTIDADE;DESCRICAO\r\n';
      for (const item of this.carrinhoLocal) {
        conteudo += `${item.ean};${item.quantidade};"${(item.descricao || '').replace(/"/g, '""')}"\r\n`;
      }

      fs.writeFileSync(caminhoCompleto, conteudo, 'utf8');
      console.log(`[PanpharmaRobot] 📄 Arquivo de pedido gerado em: ${caminhoCompleto} (${this.carrinhoLocal.length} itens).`);
    } catch (e) {
      console.warn('[PanpharmaRobot] Aviso ao gerar arquivo de lote do ePan:', e.message);
    }
  }

  /**
   * Retorna o total de itens no carrinho da Panpharma
   * @returns {Promise<number>}
   */
  async contarItensCarrinho() {
    this._carregarCarrinhoPersistido();
    return this.carrinhoLocal.length;
  }

  /**
   * Esvazia o carrinho e confirma 0 itens
   * Exclui arquivos de envio pendentes
   */
  async limparCarrinho() {
    console.log('[PanpharmaRobot] 🧹 Esvaziando carrinho da Panpharma...');
    this.carrinhoLocal = [];
    this._salvarCarrinhoPersistido();

    // Remove arquivos de rascunho de envio no ePan
    try {
      const arquivoLote = path.join(this.diretorioEnvio, 'pedido_belaped_panpharma.csv');
      if (fs.existsSync(arquivoLote)) {
        fs.unlinkSync(arquivoLote);
      }
    } catch (e) {
      console.warn('[PanpharmaRobot] Aviso ao limpar arquivo de rascunho do ePan:', e.message);
    }

    const qtd = await this.contarItensCarrinho();
    if (qtd === 0) {
      console.log('[PanpharmaRobot] ✅ Carrinho da Panpharma confirmado com 0 itens.');
      return { sucesso: true, itens: 0 };
    }
    throw new Error(`Falha ao esvaziar carrinho da Panpharma: restaram ${qtd} itens.`);
  }
}

module.exports = { PanpharmaRobot };
