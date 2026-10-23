/**
 * belaped-robot-orgafarma.js
 * Robô Oficial de Cotação e Montagem de Pedidos - GRUPO ORGAFARMA
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

class OrgafarmaRobot {
  constructor(options = {}) {
    this.usuario = options.usuario || 'primusdrogaria2022@gmail.com';
    this.senha = options.senha || 'Primus2022';
    this.baseUrl = 'https://grupoorgafarma.com.br';
    this.urlLogin = `${this.baseUrl}/login`;
    this.urlPedido = `${this.baseUrl}/pedido/criar/89699/4939`;
    this.urlAZ = `${this.baseUrl}/pedido/criar/AZ/1522`;

    this.cookie = null;
    this.iniciado = false;
    this.catalogoPorEan = new Map();
    this.carrinhoLocal = new Map(); // EAN -> { item, quantidade }
    this.numeroDoPedido = null;

    // Parâmetros fixos identificados da sessão Orgafarma
    this.cliente = '370509';
    this.filial = '1';
    this.faturamento = '1001185';
  }

  /**
   * Executa requisição HTTPS nativa com cookies da sessão
   */
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
        req.destroy(new Error('Timeout na requisição para Orgafarma'));
      });

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  /**
   * Inicia sessão e autenticação no Grupo Orgafarma
   */
  async iniciar() {
    try {
      console.log('[Orgafarma] Iniciando sessão e autenticação...');

      // 1. Obtém sessão inicial
      const resInit = await this._request({
        path: '/portal/',
        method: 'GET'
      });

      // 2. Realiza login POST
      const postBody = querystring.stringify({
        r: '/pedido/criar/89699/4939',
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

      // 3. Acessa catálogo da condição Germed (/portal/itens/89699/1001185)
      this.catalogoPorEan.clear();
      try {
        const resGermed = await this._request({
          path: '/portal/itens/89699/1001185',
          method: 'GET',
          headers: {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': this.urlPedido
          }
        });

        if (resGermed.statusCode === 200 && resGermed.body.length > 20) {
          const itens = JSON.parse(resGermed.body);
          for (const item of itens) {
            if (item.EAN13) {
              const eanCheio = String(item.EAN13).trim();
              const eanLimpo = eanCheio.replace(/^0+/, '');
              if (!eanLimpo || eanLimpo.length < 7) continue;
              this.catalogoPorEan.set(eanLimpo, item);
              this.catalogoPorEan.set(eanCheio, item);
            }
          }
        }
      } catch (eGermed) {
        console.warn('[Orgafarma] Aviso ao carregar itens Germed:', eGermed.message);
      }

      this.iniciado = true;
      console.log(`[Orgafarma] Sessão iniciada com sucesso! ${this.catalogoPorEan.size} chaves pré-carregadas.`);
      return { sucesso: true, itensIndexados: this.catalogoPorEan.size };
    } catch (error) {
      console.error('[Orgafarma] Erro ao iniciar robô:', error.message);
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
    console.log('[Orgafarma] Sessão encerrada.');
    return { sucesso: true };
  }

  /**
   * Cotação estrita por EAN:
   * 1. Consulta em memória dos itens pré-carregados
   * 2. Se não estiver em memória, consulta a API Grid do catálogo Geral AZ
   */
  async cotarEAN(ean, descricao = '') {
    if (!this.iniciado) {
      await this.iniciar();
    }

    if (!ean) {
      return {
        distribuidora: 'ORGAFARMA',
        ean: '',
        disponivel: false,
        preco: null,
        estoque: 0,
        motivo: 'EAN não informado'
      };
    }

    const eanStr = String(ean).trim();
    const eanLimpo = eanStr.replace(/^0+/, '');

    if (!eanLimpo || eanLimpo.length < 7) {
      return {
        distribuidora: 'ORGAFARMA',
        ean: eanStr,
        disponivel: false,
        preco: null,
        estoque: 0,
        motivo: 'EAN inválido ou incompleto'
      };
    }

    // 1. Busca rápida em memória
    let item = this.catalogoPorEan.get(eanStr) || this.catalogoPorEan.get(eanLimpo);

    // 2. Se não encontrado na memória, consulta a API do catálogo geral AZ
    if (!item) {
      try {
        const queryParams = querystring.stringify({
          consulta: eanStr,
          faturamento: this.faturamento,
          filial: this.filial,
          cliente: this.cliente,
          prazo: '',
          filtro: -999,
          forma_pagamento: ''
        });

        const resGrid = await this._request({
          path: `/pedido/produto/grid/dados?${queryParams}`,
          method: 'GET',
          headers: {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': this.urlAZ
          }
        });

        if (resGrid.statusCode === 200 && resGrid.body.length > 20) {
          const data = JSON.parse(resGrid.body);
          const produtos = data.dados || [];
          // Localiza item com correspondência estrita de EAN
          item = produtos.find(p => {
            const pEanLimpo = String(p.EAN13 || '').trim().replace(/^0+/, '');
            return pEanLimpo === eanLimpo;
          });

          if (item) {
            this.catalogoPorEan.set(eanStr, item);
            this.catalogoPorEan.set(eanLimpo, item);
          }
        }
      } catch (errGrid) {
        console.warn(`[Orgafarma] Erro ao consultar grid para EAN ${eanStr}:`, errGrid.message);
      }
    }

    if (!item) {
      return {
        distribuidora: 'ORGAFARMA',
        ean: eanStr,
        disponivel: false,
        preco: null,
        estoque: 0,
        motivo: 'Não encontrado no catálogo da Orgafarma'
      };
    }

    // Validação estrita de EAN anti-alucinação
    const itemEanLimpo = String(item.EAN13 || '').trim().replace(/^0+/, '');
    if (itemEanLimpo !== eanLimpo) {
      return {
        distribuidora: 'ORGAFARMA',
        ean: eanStr,
        disponivel: false,
        preco: null,
        estoque: 0,
        motivo: 'EAN divergente retornado pelo portal'
      };
    }

    // Validação de estoque
    const temEstoque = item.ESTOQUE === 'SIM' || (item.SINALESTOQUE && item.SINALESTOQUE !== 'ZERADO');
    if (!temEstoque) {
      return {
        distribuidora: 'ORGAFARMA',
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
      distribuidora: 'ORGAFARMA',
      ean: eanStr,
      descricao: item.DESCRICAO,
      laboratorio: item.NOME_FORN || 'ORGAFARMA',
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
    let item = this.catalogoPorEan.get(eanStr) || this.catalogoPorEan.get(eanLimpo);

    if (!item) {
      const cotacao = await this.cotarEAN(eanStr, descricao);
      if (!cotacao.disponivel) {
        return { sucesso: false, erro: 'Item não encontrado ou sem estoque na Orgafarma' };
      }
      item = this.catalogoPorEan.get(eanStr) || this.catalogoPorEan.get(eanLimpo);
    }

    if (!item) {
      return { sucesso: false, erro: 'Item não encontrado no catálogo da Orgafarma' };
    }

    try {
      const qtdInt = parseInt(quantidade, 10) || 1;
      
      const itemEnvio = { ...item };
      itemEnvio.QTDE = String(qtdInt);
      const vrLiq = parseFloat(itemEnvio.PRECO_LIQUIDO || itemEnvio.VRLIQ || itemEnvio.PRECO || 0);
      itemEnvio.SUBTOTAL = (vrLiq * qtdInt).toFixed(2);
      itemEnvio.timestamp = Date.now();

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
        distribuidora: 'ORGAFARMA',
        ean: eanStr,
        descricao: item.DESCRICAO,
        quantidade: qtdInt,
        preco: vrLiq
      };
    } catch (error) {
      console.error('[Orgafarma] Erro ao adicionar ao carrinho:', error.message);
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
      for (const [ean, info] of this.carrinhoLocal.entries()) {
        try {
          const itemEnvio = { ...info.item, QTDE: '0' };
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
          await this._request({
            path: `/pedido/item/remover?${qs}`,
            method: 'GET',
            headers: {
              'Referer': this.urlPedido,
              'X-Requested-With': 'XMLHttpRequest'
            }
          });
        } catch (eRem) {
          console.warn(`[Orgafarma] Falha ao remover item ${ean}:`, eRem.message);
        }
      }

      this.carrinhoLocal.clear();
      this.numeroDoPedido = null;
      console.log('[Orgafarma] Carrinho limpo com sucesso.');
      return { sucesso: true, itens: 0 };
    } catch (error) {
      return { sucesso: false, erro: error.message };
    }
  }
}

module.exports = OrgafarmaRobot;
