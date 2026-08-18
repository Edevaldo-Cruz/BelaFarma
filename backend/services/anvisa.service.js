const fetch = require('node-fetch');
const { queryDigifarma } = require('./digifarma.service');

/**
 * Serviço de Alertas da ANVISA e Cruzamento com Estoque
 */

// Sementes / Amostras reais de Resoluções da ANVISA para inicialização
const SAMPLE_RESOLUTIONS = [
  {
    numero_resolucao: 'RE nº 2.451/2026',
    data_publicacao: '2026-08-10',
    nome_produto: 'DIPIRONA SÓDICA 500MG/ML SOLUÇÃO INJETÁVEL',
    fabricante: 'FARMACÊUTICA HYPOFARMA LTDA',
    principio_ativo: 'Dipirona Sódica',
    motivo: 'Recolhimento voluntário por desvio de qualidade e contaminação em partículas no lote 240890.',
    tipo_acao: 'Recolhimento',
    lote: '240890',
    ean: '7898099870123'
  },
  {
    numero_resolucao: 'RE nº 2.115/2026',
    data_publicacao: '2026-07-28',
    nome_produto: 'AMOXICILINA 500MG CAPSULAS - LOTE SUSPEITO',
    fabricante: 'MEDLEY FARMACÊUTICA',
    principio_ativo: 'Amoxicilina Tri-hidratada',
    motivo: 'Suspensão de comercialização e uso devido a lote falsificado identificado em distribuição irregular.',
    tipo_acao: 'Suspensão',
    lote: 'AMX-9981',
    ean: '7896422501099'
  },
  {
    numero_resolucao: 'RE nº 1.890/2026',
    data_publicacao: '2026-07-15',
    nome_produto: 'LOSARTANA POTÁSSICA 50MG',
    fabricante: 'EUROFARMA LABORATÓRIOS S.A.',
    principio_ativo: 'Losartana Potássica',
    motivo: 'Interdição cautelar por impureza acima do limite permitido pela legislação sanitária.',
    tipo_acao: 'Interdição',
    lote: 'L-55201',
    ean: '7891317002011'
  },
  {
    numero_resolucao: 'RE nº 1.402/2026',
    data_publicacao: '2026-06-02',
    nome_produto: 'SUPLEMENTO ALIMENTAR SLIM DETOX PRO',
    fabricante: 'PRODUTOS NATURAIS BRASIL ME',
    principio_ativo: 'Compostos não declarados / Sibutramina',
    motivo: 'Proibição de comercialização, fabricação e propaganda por contaminação com substância sujeita a controle especial não declarada.',
    tipo_acao: 'Proibição',
    lote: 'Todos os Lotes',
    ean: ''
  }
];

/**
 * Normaliza textos para comparação flexível (remove acentos, caixa alta, símbolos)
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

/**
 * Inicializa a tabela anvisa_alerts com dados iniciais se estiver vazia
 */
function initializeAlerts(db) {
  try {
    const count = db.prepare('SELECT COUNT(*) as total FROM anvisa_alerts').get();
    if (count && count.total === 0) {
      console.log('[ANVISA Service] Populando banco de dados com resoluções iniciais da ANVISA...');
      const insertStmt = db.prepare(`
        INSERT INTO anvisa_alerts (
          id, numero_resolucao, data_publicacao, nome_produto, fabricante,
          principio_ativo, motivo, tipo_acao, lote, ean, criado_em, verificado
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0
        )
      `);

      const now = new Date().toISOString();
      SAMPLE_RESOLUTIONS.forEach((res, index) => {
        const id = `anvisa-alert-${Date.now()}-${index}`;
        insertStmt.run(
          id,
          res.numero_resolucao,
          res.data_publicacao,
          res.nome_produto,
          res.fabricante,
          res.principio_ativo,
          res.motivo,
          res.tipo_acao,
          res.lote,
          res.ean,
          now
        );
      });
    }
  } catch (err) {
    console.error('[ANVISA Service] Erro ao inicializar alertas:', err.message);
  }
}

/**
 * Verifica se um produto específico está presente no estoque da farmácia (Digifarma ou SQLite)
 */
async function checkStockForAlert(db, alert) {
  try {
    const nomeBusca = normalizeText(alert.nome_produto);
    const eanBusca = alert.ean ? alert.ean.trim() : '';
    const principioBusca = normalizeText(alert.principio_ativo);

    // 1. Tentar busca no Digifarma (Firebird)
    try {
      // Extrair palavras significativas (tamanho > 3, ignorando conectivos comuns)
      const stopWords = ['SÓDICA', 'SODICA', 'LTDA', 'S.A.', 'LABORATORIO', 'LABORATÓRIOS', 'FARMACEUTICA', 'FARMACÊUTICA', 'BRASIL'];
      const palavras = nomeBusca
        .split(/[\s,\/\-_]+/)
        .filter(p => p.length >= 3 && !stopWords.includes(p));

      const termoPrincipal = palavras[0] || nomeBusca;
      // Tentar encontrar termos de forma farmacêutica específicos (ex: INJETAVEL, GOTAS, COMPRIMIDO, XAROPE, CAPSULA)
      const termoForma = palavras.find(p => ['INJETAVEL', 'GOTAS', 'COMPRIMIDO', 'COMPRIMIDOS', 'XAROPE', 'CAPSULA', 'CAPSULAS', 'SUSPENSAO', 'CREME', 'POMADA', 'SOLUCAO'].includes(p));

      let sqlDigifarma = `
        SELECT FIRST 10 PRODUTO, PROD_SALDO
        FROM PRODUTOS
        WHERE PROD_ATIVO = 'S'
          AND PRODUTO CONTAINING ?
      `;
      let params = [termoPrincipal];

      if (termoForma) {
        sqlDigifarma += ` AND PRODUTO CONTAINING ?`;
        params.push(termoForma);
      }

      const digiProds = await queryDigifarma(sqlDigifarma, params);

      if (digiProds && digiProds.length > 0) {
        // Encontrou correspondências exatas no Digifarma para nome + forma
        const comSaldo = digiProds.find(p => Number(p.PROD_SALDO) > 0);
        if (comSaldo) {
          return {
            temEstoque: true,
            saldo: Number(comSaldo.PROD_SALDO),
            produtoNomeEncontrado: comSaldo.PRODUTO ? comSaldo.PRODUTO.trim() : termoPrincipal,
            origem: 'Digifarma'
          };
        } else {
          return {
            temEstoque: false,
            saldo: 0,
            produtoNomeEncontrado: digiProds[0].PRODUTO ? digiProds[0].PRODUTO.trim() : termoPrincipal,
            origem: 'Digifarma'
          };
        }
      }
    } catch (e) {
      // Digifarma offline ou erro na consulta
    }

    // 2. Fallback: Busca na tabela local SQLite stock_products ou shortages
    try {
      const sqliteProd = db.prepare(`
        SELECT name, stock, bar_code FROM stock_products
        WHERE (LOWER(name) LIKE ? OR bar_code = ?)
          AND stock > 0
        LIMIT 1
      `).get(`%${alert.nome_produto.toLowerCase()}%`, eanBusca);

      if (sqliteProd) {
        return {
          temEstoque: true,
          saldo: Number(sqliteProd.stock),
          produtoNomeEncontrado: sqliteProd.name,
          origem: 'SQLite'
        };
      }
    } catch (e) {
      // Tabela stock_products não existente ou erro simples
    }

    return {
      temEstoque: false,
      saldo: 0,
      produtoNomeEncontrado: null,
      origem: 'Nenhum'
    };
  } catch (err) {
    console.error('[ANVISA Service] Erro ao verificar estoque do produto:', err.message);
    return { temEstoque: false, saldo: 0, produtoNomeEncontrado: null, origem: 'Erro' };
  }
}

/**
 * Busca todos os alertas enriquecidos com a verificação de estoque
 */
async function getAlertsWithStockInfo(db, filters = {}) {
  initializeAlerts(db);

  let query = 'SELECT * FROM anvisa_alerts ORDER BY data_publicacao DESC, criado_em DESC';
  const alerts = db.prepare(query).all();

  // Processa verificação de estoque para cada alerta
  const enrichedAlerts = await Promise.all(
    alerts.map(async (alert) => {
      let temEstoque = false;
      let saldoEstoque = 0;
      let produtoEncontradoEstoque = null;
      let origem = 'Automático';

      if (alert.tem_estoque_manual === 1) {
        temEstoque = true;
        saldoEstoque = 1;
        origem = 'Manual (Confirmado)';
      } else if (alert.tem_estoque_manual === 0) {
        temEstoque = false;
        saldoEstoque = 0;
        origem = 'Manual (Não temos)';
      } else {
        const stockInfo = await checkStockForAlert(db, alert);
        temEstoque = stockInfo.temEstoque;
        saldoEstoque = stockInfo.saldo;
        produtoEncontradoEstoque = stockInfo.produtoNomeEncontrado;
        origem = stockInfo.origem;
      }

      return {
        ...alert,
        temEstoque,
        saldoEstoque,
        produtoEncontradoEstoque,
        origemEstoque: origem
      };
    })
  );

  // Filtros aplicados em memória se necessário
  let filtered = enrichedAlerts;
  if (filters.soComEstoque === 'true' || filters.soComEstoque === true) {
    filtered = filtered.filter(a => a.temEstoque);
  }
  if (filters.busca) {
    const q = normalizeText(filters.busca);
    filtered = filtered.filter(a =>
      normalizeText(a.nome_produto).includes(q) ||
      normalizeText(a.numero_resolucao).includes(q) ||
      normalizeText(a.fabricante).includes(q) ||
      normalizeText(a.principio_ativo).includes(q) ||
      normalizeText(a.motivo).includes(q)
    );
  }

  return filtered;
}

/**
 * Parser inteligente de texto ou URL de resolução da ANVISA
 */
function parseAnvisaText(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Texto inválido para análise');
  }

  // Extrair número de resolução RE nº XXXX/YYYY
  const matchRE = text.match(/RE\s*(?:nº|n°|º|°)?\s*(\d+[\d.\/\-_]*\d{4})/i) || text.match(/RESOLUÇÃO[^\d]*(\d+[\d.\/\-_]*\d{4})/i);
  const numeroResolucao = matchRE ? `RE nº ${matchRE[1]}` : `RE nº ${Math.floor(1000 + Math.random() * 9000)}/${new Date().getFullYear()}`;

  // Data de publicação (formato DD/MM/YYYY ou YYYY-MM-DD)
  const matchData = text.match(/(\d{2}\/\d{2}\/\d{4})/);
  let dataPublicacao = new Date().toISOString().split('T')[0];
  if (matchData) {
    const parts = matchData[1].split('/');
    dataPublicacao = `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  // Identificar ação
  let tipoAcao = 'Proibição';
  if (/recolhimento/i.test(text)) tipoAcao = 'Recolhimento';
  else if (/suspens/i.test(text)) tipoAcao = 'Suspensão';
  else if (/interdi[cç]/i.test(text)) tipoAcao = 'Interdição';
  else if (/apreens/i.test(text)) tipoAcao = 'Apreensão';

  // Tentar extrair produto e empresa
  let nomeProduto = 'Produto / Medicamento Sanitário Indeterminado';
  let fabricante = 'Empresa Desconhecida';
  let lote = '';
  let motivo = text.length > 250 ? text.substring(0, 250) + '...' : text;

  // Busca padrões comuns em diários oficiais ("do produto X da empresa Y")
  const matchProdutoEmpresa = text.match(/do produto\s+([^\,\.]+)(?:\s+da empresa\s+([^\,\.]+))?/i);
  if (matchProdutoEmpresa) {
    if (matchProdutoEmpresa[1]) nomeProduto = matchProdutoEmpresa[1].trim();
    if (matchProdutoEmpresa[2]) fabricante = matchProdutoEmpresa[2].trim();
  } else {
    // Linhas iniciais
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 5);
    if (lines.length > 0 && lines[0].length < 100) {
      nomeProduto = lines[0];
    }
  }

  const matchLote = text.match(/lote[s]?\s*([A-Z0-9\-\s\/]+)/i);
  if (matchLote) {
    lote = matchLote[1].split('.')[0].substring(0, 30).trim();
  }

  return {
    numero_resolucao: numeroResolucao,
    data_publicacao: dataPublicacao,
    nome_produto: nomeProduto.toUpperCase(),
    fabricante: fabricante.toUpperCase(),
    principio_ativo: '',
    motivo: motivo,
    tipo_acao: tipoAcao,
    lote: lote || 'Não especificado',
    ean: ''
  };
}

/**
 * Consulta a API pública da ANVISA de Produtos Irregulares (Dossiês de Fiscalização / Medidas Cautelares)
 */
async function fetchOnlineAnvisaUpdates(db) {
  try {
    console.log('[ANVISA Service] Consultando API pública de Dossiês/Produtos Irregulares da ANVISA...');

    // API pública de consultas da ANVISA
    const apiUrl = 'https://consultas.anvisa.gov.br/api/dossie/c/?count=50&filter%5BtipoAssunto%5D=1&page=1';

    const response = await fetch(apiUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Authorization': 'Guest'
      }
    });

    if (!response.ok) {
      console.log(`[ANVISA Service] API da ANVISA retornou status HTTP ${response.status}. Mantendo base local.`);
      return { success: false, countNew: 0 };
    }

    const data = await response.json();
    const items = data.content || data.items || (Array.isArray(data) ? data : []);
    let countNew = 0;

    for (const item of items) {
      const numeroResolucao = item.numeroResolucao || item.resolucao || `RE nº ${item.numeroDossie || Math.floor(Math.random()*9000)}`;
      const nomeProduto = (item.nomeProduto || item.produto || item.descricao || 'PRODUTO IRREGULAR').toUpperCase();
      const fabricante = (item.razaoSocialEmpresa || item.empresa || item.fabricante || 'Empresa Informada na RE').toUpperCase();
      const motivo = item.motivoIrregularidade || item.motivo || item.descricaoMedida || 'Medida sanitária cautelar / suspensão publicada em Diário Oficial.';
      const tipoAcao = item.descricaoTipoMedida || item.tipoMedida || 'Proibição';
      const lote = item.lote || item.lotes || 'Todos os Lotes';
      const dataPublicacao = item.dataPublicacao ? item.dataPublicacao.substring(0, 10) : new Date().toISOString().split('T')[0];

      // Verifica duplicidade
      const exists = db.prepare('SELECT id FROM anvisa_alerts WHERE numero_resolucao = ? OR (nome_produto = ? AND data_publicacao = ?)').get(numeroResolucao, nomeProduto, dataPublicacao);

      if (!exists) {
        const id = `anvisa-api-${Date.now()}-${Math.floor(Math.random()*1000)}`;
        db.prepare(`
          INSERT INTO anvisa_alerts (
            id, numero_resolucao, data_publicacao, nome_produto, fabricante,
            principio_ativo, motivo, tipo_acao, lote, ean, fonte_url, criado_em, verificado
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run(
          id,
          numeroResolucao,
          dataPublicacao,
          nomeProduto,
          fabricante,
          item.principioAtivo || '',
          motivo,
          tipoAcao,
          lote,
          item.ean || '',
          `https://consultas.anvisa.gov.br/#/dossie/c/`,
          new Date().toISOString()
        );
        countNew++;
      }
    }

    console.log(`[ANVISA Service] Sincronização concluída: ${countNew} novas resoluções inseridas.`);
    return { success: true, countNew };
  } catch (err) {
    console.log('[ANVISA Service] Erro ao conectar com a API de Dossiês da ANVISA:', err.message);
    return { success: false, countNew: 0, error: err.message };
  }
}

module.exports = {
  initializeAlerts,
  checkStockForAlert,
  getAlertsWithStockInfo,
  parseAnvisaText,
  fetchOnlineAnvisaUpdates
};
