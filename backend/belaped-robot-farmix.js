/**
 * belaped-robot-farmix.js
 * Robô Oficial de Cotação e Montagem de Pedidos - FARMIX DISTRIBUIDORA
 * 
 * Contrato Oficial BelaPed:
 *  - iniciar()
 *  - fechar()
 *  - cotarEAN(ean, descricao) [Estrito por EAN]
 *  - adicionarAoCarrinho(ean, quantidade, descricao)
 *  - contarItensCarrinho()
 *  - limparCarrinho()
 */

const https = require('https');
const querystring = require('querystring');
const { validarCorrespondenciaProduto } = require('./belaped-validador.js');

class FarmixRobot {
  constructor(options = {}) {
    this.usuario = options.usuario || 'belafarmasul@gmail.com';
    this.senha = options.senha || 'Bfs@882494';
    this.baseUrl = 'https://portal.farmixon.com.br';
    this.urlLogin = `${this.baseUrl}/login`;
    this.urlPedido = `${this.baseUrl}/pedido/criar/TABPE/76`;

    this.cookie = null;
    this.iniciado = false;
    this.catalogoPorEan = new Map();
    this.carrinhoLocal = new Map();
    this.numeroDoPedido = null;
  }

  async _request(options, postData = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(options.path.startsWith('http') ? options.path : `${this.baseUrl}${options.path}`);
      const opts = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...options.headers
        },
        rejectUnauthorized: false
      };

      if (this.cookie) {
        opts.headers['Cookie'] = this.cookie;
      }

      const req = https.request(opts, (res) => {
        const setCookie = res.headers['set-cookie'];
        if (setCookie && setCookie.length > 0) {
          const cookieParts = setCookie.map(c => c.split(';')[0]);
          this.cookie = (this.cookie ? this.cookie + '; ' : '') + cookieParts.join('; ');
        }

        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        });
      });

      req.on('error', (err) => reject(err));
      req.setTimeout(25000, () => {
        req.destroy(new Error('Timeout na requisição para Farmix'));
      });

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  async iniciar() {
    try {
      console.log('[Farmix] Iniciando sessão e autenticação...');
      const resInit = await this._request({ path: '/entrar-portal-atual', method: 'GET' });

      const postBody = querystring.stringify({
        r: '/pedido/criar/TABPE/76',
        usuario: this.usuario,
        senha: this.senha
      });

      const resLogin = await this._request({
        path: '/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postBody),
          'Referer': `${this.baseUrl}/entrar-portal-atual`
        }
      }, postBody);

      if (resLogin.body.includes('Usuário não existe') || resLogin.body.includes('incorret')) {
        console.warn('[Farmix] Aviso: Credenciais não aceitas no portal atual da Farmix.');
        return { sucesso: false, erro: 'Usuário ou senha não reconhecidos no portal Farmix' };
      }

      this.iniciado = true;
      return { sucesso: true };
    } catch (error) {
      console.error('[Farmix] Erro ao iniciar:', error.message);
      this.iniciado = false;
      return { sucesso: false, erro: error.message };
    }
  }

  async fechar() {
    this.iniciado = false;
    this.cookie = null;
    this.catalogoPorEan.clear();
    console.log('[Farmix] Sessão encerrada.');
    return { sucesso: true };
  }

  async cotarEAN(ean, descricao = '') {
    if (!this.iniciado) {
      const init = await this.iniciar();
      if (!init.sucesso) {
        return {
          distribuidora: 'FARMIX',
          ean: String(ean || ''),
          disponivel: false,
          preco: null,
          estoque: 0,
          motivo: init.erro || 'Falha de autenticação na Farmix'
        };
      }
    }

    if (!ean) {
      return {
        distribuidora: 'FARMIX',
        ean: '',
        disponivel: false,
        preco: null,
        estoque: 0,
        motivo: 'EAN não informado'
      };
    }

    const eanStr = String(ean).trim();
    const item = this.catalogoPorEan.get(eanStr);

    if (!item) {
      return {
        distribuidora: 'FARMIX',
        ean: eanStr,
        disponivel: false,
        preco: null,
        estoque: 0,
        motivo: 'Não encontrado no catálogo da Farmix'
      };
    }

    const preco = parseFloat(item.PRECO_LIQUIDO || item.VRLIQ || item.PRECO || 0);
    return {
      distribuidora: 'FARMIX',
      ean: eanStr,
      descricao: item.DESCRICAO,
      laboratorio: item.NOME_FORN || 'FARMIX',
      preco: Number(preco.toFixed(2)),
      preco_padrao: Number(parseFloat(item.PRECO || preco).toFixed(2)),
      disponivel: true,
      estoque: 999,
      validade: item.VALID_PROD || null,
      url: this.urlPedido
    };
  }

  async adicionarAoCarrinho(ean, quantidade, descricao = '') {
    if (!this.iniciado) {
      await this.iniciar();
    }
    return { sucesso: false, erro: 'Montagem de carrinho na Farmix pendente de validação de credencial de faturamento' };
  }

  async contarItensCarrinho() {
    return this.carrinhoLocal.size;
  }

  async limparCarrinho() {
    this.carrinhoLocal.clear();
    return { sucesso: true, itens: 0 };
  }
}

module.exports = FarmixRobot;
