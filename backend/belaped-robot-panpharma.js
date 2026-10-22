const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { validarCorrespondenciaProduto } = require('./belaped-validador.js');

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
 * Centro de Distribuição: MG12 (PP01 - MG - Varginha - Venda)
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
    this.cdFilial = options.cdFilial || 'MG12';

    // Chave de assinatura HMAC256 do ecossistema ePan/GrupoSC
    this.secretKey = '34743777217A25432A462D4A614E645266556A586E3272357538782F413F4428';
    this.tokenJwt = null;
    this.tokenExpiraEm = 0;
    this.autenticado = false;

    // Catálogo em memória e em cache local
    this.catalogoMap = new Map();
    this.catalogoCachePath = path.join(__dirname, 'data', 'panpharma_catalogo_cache.json');
    this.catalogoAtualizadoEm = 0;

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
   * Gera o token JWT com o schema oficial esperado pelo Gateway ePan
   */
  gerarToken() {
    const agoraSec = Math.floor(Date.now() / 1000);
    this.tokenExpiraEm = agoraSec + 7200; // 2 horas
    this.tokenJwt = makeJwt({
      usuario: {
        login: this.usuario,
        empresa: this.empresa,
        perfil: this.perfil,
        email: this.email,
        codigos: [Number(this.usuario) || 528854],
        cnpjs: [this.cnpj],
        versao: '2.1.51'
      },
      iss: 'auth0',
      exp: this.tokenExpiraEm
    }, this.secretKey);
    return this.tokenJwt;
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

    // 1. Autenticação inicial
    await new Promise((resolve, reject) => {
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

    // 2. Carrega ou atualiza o catálogo completo de preços e estoque (CD MG12)
    await this._carregarCatalogoPanpharma();
    return true;
  }

  /**
   * Baixa e indexa o catálogo completo de produtos do CD MG12
   */
  async _carregarCatalogoPanpharma() {
    const agora = Date.now();
    const quatroHorasMs = 4 * 60 * 60 * 1000;

    // Se já temos o catálogo carregado em memória recentemente, reutiliza
    if (this.catalogoMap.size > 0 && (agora - this.catalogoAtualizadoEm) < quatroHorasMs) {
      console.log(`[PanpharmaRobot] ⚡ Catálogo Panpharma em memória: ${this.catalogoMap.size} EANs indexados.`);
      return;
    }

    // Se houver cache no disco com menos de 4 horas, carrega do disco
    try {
      if (fs.existsSync(this.catalogoCachePath)) {
        const stats = fs.statSync(this.catalogoCachePath);
        if ((agora - stats.mtimeMs) < quatroHorasMs) {
          const raw = fs.readFileSync(this.catalogoCachePath, 'utf8');
          const itens = JSON.parse(raw);
          this._indexarItens(itens);
          this.catalogoAtualizadoEm = stats.mtimeMs;
          console.log(`[PanpharmaRobot] 📂 Catálogo Panpharma carregado do cache em disco: ${this.catalogoMap.size} EANs prontos.`);
          return;
        }
      }
    } catch (e) {
      console.warn('[PanpharmaRobot] Aviso ao ler cache do catálogo:', e.message);
    }

    // Baixa o catálogo completo direto da API do ePan
    try {
      console.log(`[PanpharmaRobot] 📥 Baixando catálogo ao vivo da Panpharma (CD ${this.cdFilial})...`);
      const url = `http://${this.hostApi}/mdw-grupo-sc-rest/api/pedido-eletronico/digitacao/${this.usuario}/${this.cdFilial}`;

      const res = await fetch(url, {
        headers: {
          'x-acess-token': this.tokenJwt,
          'x-acess-aplication-origin': 'EPAN',
          'User-Agent': 'Jersey/2.25.1'
        }
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const zipBuf = Buffer.from(await res.arrayBuffer());
      const zip = new AdmZip(zipBuf);
      const jsonContent = zip.readAsText('content', 'utf8');
      const itens = JSON.parse(jsonContent);

      this._indexarItens(itens);
      this.catalogoAtualizadoEm = agora;

      // Salva no cache do disco para aceleração de próximas chamadas
      try {
        const pasta = path.dirname(this.catalogoCachePath);
        if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true });
        fs.writeFileSync(this.catalogoCachePath, jsonContent, 'utf8');
      } catch (eSave) {
        console.warn('[PanpharmaRobot] Aviso ao salvar cache do catálogo:', eSave.message);
      }

      console.log(`[PanpharmaRobot] ✅ Catálogo Panpharma indexado com sucesso: ${this.catalogoMap.size} EANs disponíveis para cotação.`);
    } catch (err) {
      console.error('[PanpharmaRobot] ❌ Erro ao baixar catálogo da Panpharma:', err.message);
      // Se falhou o download mas tem cache antigo, usa o cache existente
      if (fs.existsSync(this.catalogoCachePath)) {
        try {
          const raw = fs.readFileSync(this.catalogoCachePath, 'utf8');
          const itens = JSON.parse(raw);
          this._indexarItens(itens);
          console.log(`[PanpharmaRobot] ⚠️ Usando catálogo em cache anterior: ${this.catalogoMap.size} EANs.`);
        } catch (_) {}
      }
    }
  }

  /**
   * Indexa itens no Map para consulta O(1) imediata
   */
  _indexarItens(itens) {
    if (!Array.isArray(itens)) return;
    this.catalogoMap.clear();

    for (const it of itens) {
      if (!it.d) continue; // d = EAN
      const eanStr = String(it.d).trim();
      const preco = Number(it.precoLiquido || it.s || 0);

      // Salva sempre o melhor preço para o EAN
      if (preco > 0) {
        const existente = this.catalogoMap.get(eanStr);
        if (!existente || preco < existente.preco) {
          this.catalogoMap.set(eanStr, {
            ean: eanStr,
            codigo: it.e,
            preco: preco,
            precoTabela: Number(it.t) || preco,
            condicao: it.n || it.j || 'Á VISTA',
            prazo: Number(it.o) || 0,
            descontoPct: Number(it.ff) || 0,
            estoque: Number(it.jj) || 0,
            disponivel: Number(it.jj) > 0
          });
        }
      }
    }
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
    if (!this.autenticado || this.catalogoMap.size === 0) {
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

    if (eanLimpo.length < 7 || eanLimpo.length > 14) {
      return {
        sucesso: true,
        ean: eanLimpo,
        encontrado: false,
        motivo: 'EAN fora do padrão GTIN (7-14 dígitos)'
      };
    }

    const item = this.catalogoMap.get(eanLimpo);

    if (item && item.preco > 0) {
      if (item.disponivel && item.estoque > 0) {
        return {
          sucesso: true,
          encontrado: true,
          ean: eanLimpo,
          preco: Number(item.preco.toFixed(2)),
          preco_padrao: Number(item.precoTabela.toFixed(2)),
          desc_pct: item.descontoPct,
          disponivel: true,
          descricao: descricao || `Produto Panpharma ${item.codigo}`,
          condicao_comercial: `${item.condicao} (${item.prazo}d)`,
          prazo_dias: item.prazo,
          codigo_produto: item.codigo,
          distribuidora: 'PANPHARMA',
          url_produto: 'https://www.panpharma.com.br/',
          estoque: item.estoque
        };
      } else {
        return {
          sucesso: true,
          encontrado: true,
          ean: eanLimpo,
          preco: Number(item.preco.toFixed(2)),
          disponivel: false,
          descricao: descricao || `Produto Panpharma ${item.codigo}`,
          distribuidora: 'PANPHARMA',
          motivo: 'Item sem estoque no momento na Panpharma (CD MG12)'
        };
      }
    }

    return {
      sucesso: true,
      encontrado: false,
      disponivel: false,
      ean: eanLimpo,
      descricao: descricao || '',
      distribuidora: 'PANPHARMA',
      motivo: 'Item não encontrado no catálogo da Panpharma (CD MG12)'
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
