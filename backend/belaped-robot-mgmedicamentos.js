/**
 * belaped-robot-mgmedicamentos.js
 * Robô Oficial de Cotação e Montagem de Pedidos - MG MEDICAMENTOS
 * 
 * Contrato Oficial BelaPed:
 *  - iniciar()
 *  - fechar()
 *  - cotarEAN(ean, descricao) [Estrito por EAN]
 *  - adicionarAoCarrinho(ean, quantidade, descricao)
 *  - contarItensCarrinho()
 *  - limparCarrinho()
 */

const http = require('http');
const querystring = require('querystring');

class MgMedicamentosRobot {
  constructor(options = {}) {
    this.usuario = options.usuario || 'DSAPPWJ';
    this.senha = options.senha || 'DSAPPWJ';
    this.baseUrl = 'http://www.mgmedicamentos.com.br';
    this.urlLogin = `${this.baseUrl}/login`;
    this.urlPedido = `${this.baseUrl}/pedido/criar/az/00`;
    
    this.cookie = null;
    this.iniciado = false;
    this.catalogoPorEan = new Map();
    this.carrinhoLocal = new Map(); // EAN -> { item, quantidade }
    this.numeroDoPedido = null;
    
    // Parâmetros fixos identificados da sessão
    this.cliente = '145199';
    this.filial = '0';
    this.faturamento = '48';
  }

  /**
   * Executa requisição HTTP nativa com cookies da sessão
   */
  async _request(options, postData = null) {
    return new Promise((resolve, reject) => {
      const opts = {
        hostname: 'www.mgmedicamentos.com.br',
        port: 80,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...options.headers
        },
        ...options
      };

      if (this.cookie) {
        opts.headers['Cookie'] = this.cookie;
      }

      const req = http.request(opts, (res) => {
        // Captura novos cookies se houver
        const setCookie = res.headers['set-cookie'];
        if (setCookie && setCookie.length > 0) {
          const cookieParts = setCookie.map(c => c.split(';')[0]);
          this.cookie = cookieParts.join('; ');
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
      req.setTimeout(20000, () => {
        req.destroy(new Error('Timeout na requisição para MG Medicamentos'));
      });

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  /**
   * Inicia sessão e carrega catálogo completo de produtos na memória (Modo Turbo)
   */
  async iniciar() {
    try {
      console.log('[MG-Medicamentos] Iniciando sessão e autenticação...');

      // 1. Obtém sessão inicial
      const resInit = await this._request({
        path: '/portal/',
        method: 'GET'
      });

      // 2. Realiza login POST
      const postBody = querystring.stringify({
        r: '/pedido/criar/az/00',
        usuario: this.usuario,
        senha: this.senha
      });

      const resLogin = await this._request({
        path: '/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postBody),
          'Referer': `${this.baseUrl}/portal/`
        }
      }, postBody);

      // 3. Acessa tela de pedido e catálogo geral
      const resCatalogo = await this._request({
        path: '/pedido/criar/az/00',
        method: 'GET'
      });

      if (resCatalogo.statusCode !== 200) {
        throw new Error(`Falha ao acessar catálogo de MG Medicamentos: Status ${resCatalogo.statusCode}`);
      }

      // 4. Extrai produtos da variável "var itens = [...]"
      const matchItens = resCatalogo.body.match(/var itens = (\[[\s\S]*?\]);/);
      if (!matchItens) {
        throw new Error('Não foi possível extrair a lista de produtos de MG Medicamentos');
      }

      const listaItens = JSON.parse(matchItens[1]);
      this.catalogoPorEan.clear();

      for (const item of listaItens) {
        if (item.EAN13) {
          const eanLimpo = String(item.EAN13).trim().replace(/^0+/, '');
          this.catalogoPorEan.set(eanLimpo, item);
          this.catalogoPorEan.set(String(item.EAN13).trim(), item);
        }
      }

      // Extrai número do pedido em andamento caso exista
      const matchPedido = resCatalogo.body.match(/id=["']numero_do_pedido["'][^>]*>([^<]*)/i);
      if (matchPedido && matchPedido[1] && matchPedido[1].trim()) {
        this.numeroDoPedido = matchPedido[1].trim();
      }

      this.iniciado = true;
      console.log(`[MG-Medicamentos] Sessão iniciada com sucesso! ${this.catalogoPorEan.size} EANs indexados na memória.`);
      return { sucesso: true, itensIndexados: this.catalogoPorEan.size };
    } catch (error) {
      console.error('[MG-Medicamentos] Erro ao iniciar robô:', error.message);
      this.iniciado = false;
      return { sucesso: false, erro: error.message };
    }
  }

  /**
   * Encerra a sessão do robô
   */
  async fechar() {
    this.iniciado = false;
    this.cookie = null;
    this.catalogoPorEan.clear();
    console.log('[MG-Medicamentos] Sessão encerrada.');
    return { sucesso: true };
  }

  /**
   * Cotação estrita por EAN com retorno ultra-rápido do catálogo em memória
   */
  async cotarEAN(ean, descricao = '') {
    if (!this.iniciado) {
      await this.iniciar();
    }

    if (!ean) {
      return {
        distribuidora: 'MG MEDICAMENTOS',
        ean: '',
        disponivel: false,
        preco: null,
        estoque: 0,
        motivo: 'EAN não informado'
      };
    }

    const eanStr = String(ean).trim();
    const eanLimpo = eanStr.replace(/^0+/, '');

    const item = this.catalogoPorEan.get(eanStr) || this.catalogoPorEan.get(eanLimpo);

    if (!item) {
      return {
        distribuidora: 'MG MEDICAMENTOS',
        ean: eanStr,
        disponivel: false,
        preco: null,
        estoque: 0,
        motivo: 'Não encontrado no catálogo da MG Medicamentos'
      };
    }

    // Validação de estoque
    const temEstoque = item.ESTOQUE === 'SIM' || (item.SINALESTOQUE && item.SINALESTOQUE !== 'ZERADO');
    if (!temEstoque) {
      return {
        distribuidora: 'MG MEDICAMENTOS',
        ean: eanStr,
        descricao: item.DESCRICAO,
        disponivel: false,
        preco: null,
        estoque: 0,
        motivo: 'Produto sem estoque na distribuidora'
      };
    }

    // Preço líquido / com desconto
    const preco = parseFloat(item.PRECO_LIQUIDO || item.VRLIQ || item.PRECO || 0);

    return {
      distribuidora: 'MG MEDICAMENTOS',
      ean: eanStr,
      descricao: item.DESCRICAO,
      laboratorio: item.NOME_FORN || 'MG',
      preco: Number(preco.toFixed(2)),
      preco_padrao: Number(parseFloat(item.PRECO || preco).toFixed(2)),
      disponivel: true,
      estoque: temEstoque ? 999 : 0,
      validade: item.VALID_PROD || null,
      url: this.urlPedido
    };
  }

  /**
   * Adiciona um produto ao carrinho
   */
  async adicionarAoCarrinho(ean, quantidade, descricao = '') {
    if (!this.iniciado) {
      await this.iniciar();
    }

    const eanStr = String(ean).trim();
    const eanLimpo = eanStr.replace(/^0+/, '');
    const item = this.catalogoPorEan.get(eanStr) || this.catalogoPorEan.get(eanLimpo);

    if (!item) {
      return { sucesso: false, erro: 'Item não encontrado no catálogo da MG Medicamentos' };
    }

    try {
      const qtdInt = parseInt(quantidade, 10) || 1;
      
      // Clone e ajusta item para formato do ServCli
      const itemEnvio = { ...item };
      itemEnvio.QTDE = String(qtdInt);
      const vrLiq = parseFloat(itemEnvio.PRECO_LIQUIDO || itemEnvio.PRECO || 0);
      itemEnvio.SUBTOTAL = (vrLiq * qtdInt).toFixed(2);
      itemEnvio.timestamp = Date.now();

      // Monta query string no padrão jQuery $.get('/pedido/item/salvar', params)
      const params = {
        consulta: '',
        faturamento: this.faturamento,
        filial: this.filial,
        cliente: this.cliente,
        prazo: '',
        filtro: -999,
        forma_pagamento: ''
      };

      const queryObj = { ...params };
      for (const [k, v] of Object.entries(itemEnvio)) {
        queryObj[`item[${k}]`] = v;
      }

      const qs = querystring.stringify(queryObj);
      const res = await this._request({
        path: `/pedido/item/salvar?${qs}`,
        method: 'GET',
        headers: {
          'Referer': this.urlPedido,
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      this.carrinhoLocal.set(eanStr, {
        item: itemEnvio,
        quantidade: qtdInt,
        preco: vrLiq,
        subtotal: Number((vrLiq * qtdInt).toFixed(2))
      });

      return {
        sucesso: true,
        distribuidora: 'MG MEDICAMENTOS',
        ean: eanStr,
        descricao: item.DESCRICAO,
        quantidade: qtdInt,
        preco: vrLiq
      };
    } catch (error) {
      console.error('[MG-Medicamentos] Erro ao adicionar ao carrinho:', error.message);
      return { sucesso: false, erro: error.message };
    }
  }

  /**
   * Conta os itens do carrinho atual
   */
  async contarItensCarrinho() {
    return this.carrinhoLocal.size;
  }

  /**
   * Limpa o carrinho de compras
   */
  async limparCarrinho() {
    try {
      this.carrinhoLocal.clear();
      this.numeroDoPedido = null;
      console.log('[MG-Medicamentos] Carrinho local limpo com sucesso.');
      return { sucesso: true, itens: 0 };
    } catch (error) {
      return { sucesso: false, erro: error.message };
    }
  }
}

module.exports = MgMedicamentosRobot;
