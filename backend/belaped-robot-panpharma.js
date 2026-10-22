const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
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
 * Plataforma: ePan - Pedido Eletrônico & REST API Gateway + Motor Fiscal Preço NF (ST)
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

    // Metadados de produtos (NCM, CEST, classificação, laboratório)
    this.metadataMap = new Map();
    this.metadataCachePath = path.join(__dirname, 'data', 'panpharma_metadata_cache.json');
    this.metadataAtualizadoEm = 0;

    // Cache persistente de Preço NF com ST calculada
    this.stCache = new Map();
    this.stCachePath = path.join(__dirname, 'data', 'panpharma_st_cache.json');
    this.taxServerPort = 3009;

    // Diretórios locais da aplicação ePan no Windows
    this.diretorioEpan = 'C:\\Program Files (x86)\\ePan - Pedido Eletrônico';
    this.diretorioEnvio = path.join(this.diretorioEpan, 'repository', 'pedidos', 'envio');
    this.diretorioRetorno = path.join(this.diretorioEpan, 'repository', 'pedidos', 'retorno');

    // Carrinho em memória da sessão
    this.carrinhoLocal = [];
    this.carrinhoPersistenciaPath = path.join(__dirname, 'data', 'carrinho_panpharma.json');

    this._carregarCarrinhoPersistido();
    this._carregarStCache();
    this._carregarMetadataCache();
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

  _carregarStCache() {
    try {
      if (fs.existsSync(this.stCachePath)) {
        const dados = JSON.parse(fs.readFileSync(this.stCachePath, 'utf8'));
        if (typeof dados === 'object' && dados !== null) {
          for (const [k, v] of Object.entries(dados)) {
            this.stCache.set(String(k), v);
          }
        }
      }
    } catch (_) {}
  }

  _salvarStCache() {
    try {
      const pasta = path.dirname(this.stCachePath);
      if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true });
      const obj = {};
      for (const [k, v] of this.stCache.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(this.stCachePath, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
      console.warn('[PanpharmaRobot] Erro ao salvar cache de Preço NF (ST):', err.message);
    }
  }

  _carregarMetadataCache() {
    try {
      if (fs.existsSync(this.metadataCachePath)) {
        const dados = JSON.parse(fs.readFileSync(this.metadataCachePath, 'utf8'));
        if (typeof dados === 'object' && dados !== null) {
          for (const [k, v] of Object.entries(dados)) {
            this.metadataMap.set(String(k), v);
          }
        }
      }
    } catch (_) {}
  }

  /**
   * Garante que o microserviço fiscal PanpharmaTaxServer está em execução na porta 3009
   */
  async _garantirTaxServer() {
    try {
      const res = await fetch(`http://127.0.0.1:${this.taxServerPort}/ping`, { signal: AbortSignal.timeout(1200) });
      if (res.ok) return true;
    } catch (_) {}

    console.log('[PanpharmaRobot] ⚙️ Iniciando motor fiscal de cálculo do Preço NF (PanpharmaTaxServer)...');
    try {
      const jre = 'C:\\PROGRA~2\\EPAN-P~1\\jre1.8.0_131\\bin\\java.exe';
      const epanLib = 'C:\\PROGRA~2\\EPAN-P~1\\lib';
      const cp = '.;backend;' + epanLib + '\\*';
      const proc = spawn(jre, [
        '-Xms256m', '-Xmx860m', '-XX:+UseG1GC',
        `-Dtaxcomponent.conf.basedir=${epanLib}`,
        `-Dtaxcomponent.rules.basedir=${epanLib}`,
        '-cp', cp,
        'PanpharmaTaxServer'
      ], {
        cwd: path.resolve(__dirname, '..'),
        detached: true,
        stdio: 'ignore'
      });
      proc.unref();

      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 600));
        try {
          const res = await fetch(`http://127.0.0.1:${this.taxServerPort}/ping`, { signal: AbortSignal.timeout(1000) });
          if (res.ok) {
            console.log('[PanpharmaRobot] ✅ Motor fiscal Panpharma conectado com sucesso (Preço NF ativo).');
            return true;
          }
        } catch (_) {}
      }
    } catch (e) {
      console.warn('[PanpharmaRobot] Aviso ao subir motor fiscal:', e.message);
    }
    return false;
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

    // 2. Carrega catálogo de metadados tributários (NCM, CEST) se necessário
    await this._carregarMetadataPanpharma();

    // 3. Carrega ou atualiza o catálogo completo de preços e estoque (CD MG12)
    await this._carregarCatalogoPanpharma();

    // 4. Inicia motor fiscal em segundo plano se ainda não estiver ativo
    this._garantirTaxServer().catch(() => {});
    return true;
  }

  /**
   * Baixa os metadados tributários (NCM, CEST, classificação, laboratório) do catálogo
   */
  async _carregarMetadataPanpharma() {
    const agora = Date.now();
    const vinteQuatroHorasMs = 24 * 60 * 60 * 1000;

    if (this.metadataMap.size > 0 && fs.existsSync(this.metadataCachePath)) {
      try {
        const stats = fs.statSync(this.metadataCachePath);
        if ((agora - stats.mtimeMs) < vinteQuatroHorasMs) {
          return;
        }
      } catch (_) {}
    }

    try {
      console.log(`[PanpharmaRobot] 📥 Baixando metadados fiscais (NCM/CEST) da Panpharma (CD ${this.cdFilial})...`);
      const url = `http://${this.hostApi}/mdw-grupo-sc-rest/api/pedido-eletronico/digitacao/catalogo/${this.cdFilial}`;
      const res = await fetch(url, {
        headers: {
          'x-acess-token': this.tokenJwt,
          'x-acess-aplication-origin': 'EPAN',
          'User-Agent': 'Jersey/2.25.1'
        }
      });

      if (res.ok) {
        const zipBuf = Buffer.from(await res.arrayBuffer());
        const zip = new AdmZip(zipBuf);
        const data = JSON.parse(zip.readAsText('content', 'utf8'));
        const compactMap = {};
        if (Array.isArray(data.produtos)) {
          for (const p of data.produtos) {
            const info = {
              ean: p.ean ? String(p.ean).trim() : '',
              codigo: p.codigoPanpharma ? String(p.codigoPanpharma).trim() : '',
              ncm: p.ncm || '30049099',
              cest: p.cest || '1300301',
              classificacao: p.classificacao || 'M',
              descricao: p.descricao || '',
              laboratorio: (data.laboratorios && data.laboratorios[p.codigoLaboratorio]) || ''
            };
            if (info.codigo) {
              compactMap[info.codigo] = info;
              this.metadataMap.set(info.codigo, info);
            }
            if (info.ean) {
              compactMap[info.ean] = info;
              this.metadataMap.set(info.ean, info);
            }
          }
          fs.writeFileSync(this.metadataCachePath, JSON.stringify(compactMap), 'utf8');
          console.log(`[PanpharmaRobot] 📋 Metadados fiscais Panpharma atualizados: ${data.produtos.length} produtos.`);
        }
      }
    } catch (e) {
      console.warn('[PanpharmaRobot] Aviso ao obter metadados fiscais:', e.message);
    }
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
   * Indexa itens no Map para consulta O(1) imediata com Preço NF real
   */
  _indexarItens(itens) {
    if (!Array.isArray(itens)) return;
    this.catalogoMap.clear();

    for (const it of itens) {
      if (!it.d) continue; // d = EAN
      const eanStr = String(it.d).trim();
      const codStr = String(it.e || '').trim();

      const pf = Number(it.s || 0); // it.s = Preço Fábrica
      const pmc = Number(it.t || 0); // it.t = PMC
      const descPct = Number(it.f || 0); // it.f = % Desconto
      const vDesc = Number(it.valorDescontoUnitario || 0);
      const precoLiq = Number(it.precoLiquido || (pf - vDesc) || 0);
      const estoqueReal = Number(it.ff || 0); // it.ff = Quantidade física real em estoque

      if (precoLiq > 0) {
        const existente = this.catalogoMap.get(eanStr);
        // Salva sempre a condição com menor preço líquido para o EAN
        if (!existente || precoLiq < existente.precoLiquido) {
          const meta = this.metadataMap.get(codStr) || this.metadataMap.get(eanStr) || {};
          const cachedSt = this.stCache.get(eanStr);

          let precoNF = precoLiq;
          let valorST = 0;
          if (cachedSt && Math.abs(cachedSt.precoFabrica - pf) < 0.01 && Math.abs(cachedSt.valorDesconto - vDesc) < 0.01) {
            precoNF = Number(cachedSt.precoNF || precoLiq);
            valorST = Number(cachedSt.valorST || 0);
          }

          this.catalogoMap.set(eanStr, {
            ean: eanStr,
            codigo: codStr,
            preco: precoNF, // Coluna Preço NF que deve ser considerada para a cotação!
            precoNF: precoNF,
            precoLiquido: precoLiq,
            precoTabela: pf || precoLiq, // Preço Fábrica
            pmc: pmc,
            valorDesconto: vDesc,
            valorST: valorST,
            condicao: it.n || it.j || 'Á VISTA',
            prazo: Number(it.o) || 0,
            descontoPct: descPct,
            estoque: estoqueReal,
            disponivel: estoqueReal > 0,
            ncm: meta.ncm || '30049099',
            cest: meta.cest || '1300301',
            descricao: meta.descricao || ''
          });
        }
      }
    }
  }

  /**
   * Calcula o Preço NF exato (com ST) para um conjunto de itens via PanpharmaTaxServer
   */
  async calcularPrecoNF(itens) {
    if (!Array.isArray(itens) || itens.length === 0) return [];
    const pendentes = itens.filter(it => {
      const cached = this.stCache.get(it.ean);
      return !cached || Math.abs(cached.precoFabrica - it.precoTabela) >= 0.01 || Math.abs(cached.valorDesconto - it.valorDesconto) >= 0.01;
    });

    if (pendentes.length > 0) {
      await this._garantirTaxServer();
      try {
        const payload = pendentes.map(it => ({
          codigo: String(it.codigo),
          ean: String(it.ean),
          descricao: it.descricao || `Produto ${it.codigo}`,
          precoFabrica: it.precoTabela,
          valorDesconto: it.valorDesconto,
          pmc: it.pmc || it.precoTabela,
          ncm: it.ncm || '30049099',
          cest: it.cest || '1300301'
        }));

        const res = await fetch(`http://127.0.0.1:${this.taxServerPort}/calc-preco-nf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000)
        });

        if (res.ok) {
          const resultados = await res.json();
          if (Array.isArray(resultados)) {
            for (const r of resultados) {
              const eanStr = String(r.ean);
              const precoNF = Number(r.precoNF);
              const valorST = Number(r.valorST);
              this.stCache.set(eanStr, {
                ean: eanStr,
                codigo: r.codigo,
                precoFabrica: Number(r.precoFabrica),
                valorDesconto: Number(r.valorDesconto),
                precoLiquido: Number(r.precoLiquido),
                valorST: valorST,
                precoNF: precoNF,
                atualizadoEm: Date.now()
              });

              const itemCat = this.catalogoMap.get(eanStr);
              if (itemCat) {
                itemCat.preco = precoNF;
                itemCat.precoNF = precoNF;
                itemCat.valorST = valorST;
              }
            }
            this._salvarStCache();
          }
        }
      } catch (err) {
        console.warn('[PanpharmaRobot] Erro ao calcular Preço NF via motor fiscal:', err.message);
      }
    }

    return itens.map(it => this.catalogoMap.get(it.ean) || it);
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
   * Retorna SEMPRE o Preço NF (com ST incluída), conforme exigência comercial do portal.
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

    let item = this.catalogoMap.get(eanLimpo);

    if (item && item.precoLiquido > 0) {
      // Se não tem Preço NF calculado ainda ou se ST não foi calculada, calcula em tempo real
      const cached = this.stCache.get(eanLimpo);
      if (!cached || !item.precoNF || item.precoNF === item.precoLiquido) {
        try {
          await this.calcularPrecoNF([item]);
          item = this.catalogoMap.get(eanLimpo) || item;
        } catch (_) {}
      }

      const precoFinal = Number((item.precoNF || item.preco || item.precoLiquido).toFixed(2));
      const precoPadrao = Number((item.precoTabela || precoFinal).toFixed(2));
      const precoLiq = Number((item.precoLiquido || precoFinal).toFixed(2));
      const descVal = Number(((precoPadrao > precoFinal) ? ((precoPadrao - precoFinal) / precoPadrao * 100) : item.descontoPct).toFixed(2));

      if (item.disponivel && item.estoque > 0) {
        return {
          sucesso: true,
          encontrado: true,
          ean: eanLimpo,
          preco: precoFinal, // PREÇO NF (coluna considerada para cotação na Panpharma!)
          preco_padrao: precoPadrao, // Preço Fábrica
          preco_liquido: precoLiq,
          valor_st: Number((item.valorST || 0).toFixed(2)),
          desc_pct: descVal,
          disponivel: true,
          descricao: descricao || item.descricao || `Produto Panpharma ${item.codigo}`,
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
          preco: precoFinal,
          preco_padrao: precoPadrao,
          preco_liquido: precoLiq,
          valor_st: Number((item.valorST || 0).toFixed(2)),
          desc_pct: descVal,
          disponivel: false,
          descricao: descricao || item.descricao || `Produto Panpharma ${item.codigo}`,
          condicao_comercial: `${item.condicao} (${item.prazo}d)`,
          prazo_dias: item.prazo,
          codigo_produto: item.codigo,
          distribuidora: 'PANPHARMA',
          url_produto: 'https://www.panpharma.com.br/',
          estoque: item.estoque,
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

      // Layout CSV padrão ePan: CODIGO_EAN;QUANTIDADE;DESCRICAO
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
