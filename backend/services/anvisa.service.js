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
      const stopWords = ['SÓDICA', 'SODICA', 'LTDA', 'S.A.', 'LABORATORIO', 'LABORATÓRIOS', 'FARMACEUTICA', 'FARMACÊUTICA', 'BRASIL'];
      const palavras = nomeBusca
        .split(/[\s,\/\-_]+/)
        .filter(p => p.length >= 3 && !stopWords.includes(p));

      const termoPrincipal = palavras[0] || nomeBusca;
      const termoForma = palavras.find(p => ['INJETAVEL', 'GOTAS', 'COMPRIMIDO', 'COMPRIMIDOS', 'XAROPE', 'CAPSULA', 'CAPSULAS', 'SUSPENSAO', 'CREME', 'POMADA', 'SOLUCAO'].includes(p));

      // Busca ampla pelo termo principal no Digifarma
      const sqlDigifarma = `
        SELECT FIRST 10 PRODUTO, PROD_SALDO
        FROM PRODUTOS
        WHERE PROD_ATIVO = 'S'
          AND PRODUTO CONTAINING ?
      `;

      const digiProds = await queryDigifarma(sqlDigifarma, [termoPrincipal]);

      if (digiProds && digiProds.length > 0) {
        const comSaldo = digiProds.filter(p => Number(p.PROD_SALDO) > 0);
        
        if (comSaldo.length > 0) {
          // Se tivermos busca por forma e o produto no Digifarma contiver a mesma forma -> CONFIRMADO com estoque
          if (termoForma) {
            const exatoComForma = comSaldo.find(p => p.PRODUTO && normalizeText(p.PRODUTO).includes(termoForma));
            if (exatoComForma) {
              return {
                temEstoque: true,
                isDuvidoso: false,
                statusEstoque: 'comEstoque',
                saldo: Number(exatoComForma.PROD_SALDO),
                produtoNomeEncontrado: exatoComForma.PRODUTO.trim(),
                origem: 'Digifarma (Exato)'
              };
            }
          } else {
            // Sem termo de forma específico e produto em saldo -> CONFIRMADO
            return {
              temEstoque: true,
              isDuvidoso: false,
              statusEstoque: 'comEstoque',
              saldo: Number(comSaldo[0].PROD_SALDO),
              produtoNomeEncontrado: comSaldo[0].PRODUTO.trim(),
              origem: 'Digifarma'
            };
          }

          // Se encontrou no saldo pelo termo principal mas a forma não bateu exatamente -> MARCAR COMO DUVIDOSO / REQUER VERIFICAÇÃO!
          return {
            temEstoque: true, // Requer atenção
            isDuvidoso: true,
            statusEstoque: 'duvidoso',
            saldo: Number(comSaldo[0].PROD_SALDO),
            produtoNomeEncontrado: `${comSaldo[0].PRODUTO.trim()} (${comSaldo.length} itens parecidos com saldo)`,
            origem: 'Digifarma (Verificar Apresentação)'
          };
        }
      }
    } catch (e) {
      // Digifarma offline ou erro na consulta
    }

    // 2. Fallback: Busca na tabela local SQLite stock_products
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
          isDuvidoso: false,
          statusEstoque: 'comEstoque',
          saldo: Number(sqliteProd.stock),
          produtoNomeEncontrado: sqliteProd.name,
          origem: 'SQLite'
        };
      }
    } catch (e) {
      // Tabela stock_products não existente
    }

    return {
      temEstoque: false,
      isDuvidoso: false,
      statusEstoque: 'semEstoque',
      saldo: 0,
      produtoNomeEncontrado: null,
      origem: 'Nenhum'
    };
  } catch (err) {
    console.error('[ANVISA Service] Erro ao verificar estoque do produto:', err.message);
    return { temEstoque: false, isDuvidoso: false, statusEstoque: 'semEstoque', saldo: 0, produtoNomeEncontrado: null, origem: 'Erro' };
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
      let isDuvidoso = false;
      let statusEstoque = 'semEstoque';
      let saldoEstoque = 0;
      let produtoEncontradoEstoque = null;
      let origem = 'Automático';

      if (alert.tem_estoque_manual === 1) {
        temEstoque = true;
        isDuvidoso = false;
        statusEstoque = 'comEstoque';
        saldoEstoque = 1;
        origem = 'Manual (Sim)';
      } else if (alert.tem_estoque_manual === 0) {
        temEstoque = false;
        isDuvidoso = false;
        statusEstoque = 'semEstoque';
        saldoEstoque = 0;
        origem = 'Manual (Não)';
      } else {
        const stockInfo = await checkStockForAlert(db, alert);
        temEstoque = stockInfo.temEstoque;
        isDuvidoso = stockInfo.isDuvidoso;
        statusEstoque = stockInfo.statusEstoque;
        saldoEstoque = stockInfo.saldo;
        produtoEncontradoEstoque = stockInfo.produtoNomeEncontrado;
        origem = stockInfo.origem;
      }

      return {
        ...alert,
        temEstoque,
        isDuvidoso,
        statusEstoque,
        saldoEstoque,
        produtoEncontradoEstoque,
        origemEstoque: origem
      };
    })
  );

  // Filtros aplicados em memória
  let filtered = enrichedAlerts;
  if (filters.soComEstoque === 'true' || filters.soComEstoque === true) {
    filtered = filtered.filter(a => a.statusEstoque === 'comEstoque');
  } else if (filters.soDuvidosos === 'true' || filters.soDuvidosos === true) {
    filtered = filtered.filter(a => a.statusEstoque === 'duvidoso');
  } else if (filters.soRelevantes === 'true' || filters.soRelevantes === true) {
    filtered = filtered.filter(a => a.statusEstoque === 'comEstoque' || a.statusEstoque === 'duvidoso');
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

  const matchRE = text.match(/RE\s*(?:nº|n°|º|°)?\s*(\d+[\d.\/\-_]*\d{4})/i) || text.match(/RESOLUÇÃO[^\d]*(\d+[\d.\/\-_]*\d{4})/i);
  const numeroResolucao = matchRE ? `RE nº ${matchRE[1]}` : `RE nº ${Math.floor(1000 + Math.random() * 9000)}/${new Date().getFullYear()}`;

  const matchData = text.match(/(\d{2}\/\d{2}\/\d{4})/);
  let dataPublicacao = new Date().toISOString().split('T')[0];
  if (matchData) {
    const parts = matchData[1].split('/');
    dataPublicacao = `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  let tipoAcao = 'Proibição';
  if (/recolhimento/i.test(text)) tipoAcao = 'Recolhimento';
  else if (/suspens/i.test(text)) tipoAcao = 'Suspensão';
  else if (/interdi[cç]/i.test(text)) tipoAcao = 'Interdição';
  else if (/apreens/i.test(text)) tipoAcao = 'Apreensão';

  let nomeProduto = 'Produto / Medicamento Sanitário Indeterminado';
  let fabricante = 'Empresa Desconhecida';
  let lote = '';
  let motivo = text.length > 250 ? text.substring(0, 250) + '...' : text;

  const matchProdutoEmpresa = text.match(/do produto\s+([^\,\.]+)(?:\s+da empresa\s+([^\,\.]+))?/i);
  if (matchProdutoEmpresa) {
    if (matchProdutoEmpresa[1]) nomeProduto = matchProdutoEmpresa[1].trim();
    if (matchProdutoEmpresa[2]) fabricante = matchProdutoEmpresa[2].trim();
  } else {
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
 * Rotina diária de varredura completa na API da ANVISA e notificação automática
 */
async function fetchOnlineAnvisaUpdates(db) {
  try {
    console.log('[ANVISA Cron] Iniciando varredura diária de Dossiês/Produtos Irregulares da ANVISA...');

    let countNew = 0;
    let countInStockFound = 0;
    let countDuvidosoFound = 0;

    // Baixa até 3 páginas (150 itens mais recentes)
    for (let page = 1; page <= 3; page++) {
      const apiUrl = `https://consultas.anvisa.gov.br/api/dossie/c/?count=50&filter%5BtipoAssunto%5D=1&page=${page}`;

      try {
        const response = await fetch(apiUrl, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Authorization': 'Guest'
          }
        });

        if (!response.ok) continue;

        const data = await response.json();
        const items = data.content || data.items || (Array.isArray(data) ? data : []);

        for (const item of items) {
          const numeroResolucao = item.numeroResolucao || item.resolucao || `RE nº ${item.numeroDossie || Math.floor(Math.random()*9000)}`;
          const nomeProduto = (item.nomeProduto || item.produto || item.descricao || 'PRODUTO IRREGULAR').toUpperCase();
          const fabricante = (item.razaoSocialEmpresa || item.empresa || item.fabricante || 'Empresa Informada na RE').toUpperCase();
          const motivo = item.motivoIrregularidade || item.motivo || item.descricaoMedida || 'Medida sanitária cautelar / suspensão publicada em Diário Oficial.';
          const tipoAcao = item.descricaoTipoMedida || item.tipoMedida || 'Proibição';
          const lote = item.lote || item.lotes || 'Todos os Lotes';
          const dataPublicacao = item.dataPublicacao ? item.dataPublicacao.substring(0, 10) : new Date().toISOString().split('T')[0];

          // Verifica se já existe no SQLite
          const exists = db.prepare('SELECT id FROM anvisa_alerts WHERE numero_resolucao = ? OR (nome_produto = ? AND data_publicacao = ?)').get(numeroResolucao, nomeProduto, dataPublicacao);

          if (!exists) {
            const id = `anvisa-auto-${Date.now()}-${Math.floor(Math.random()*1000)}`;
            const mockAlert = { nome_produto: nomeProduto, ean: item.ean || '', principio_ativo: item.principioAtivo || '' };
            const stockCheck = await checkStockForAlert(db, mockAlert);

            db.prepare(`
              INSERT INTO anvisa_alerts (
                id, numero_resolucao, data_publicacao, nome_produto, fabricante,
                principio_ativo, motivo, tipo_acao, lote, ean, fonte_url, criado_em, verificado,
                status_estoque, notificado
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0)
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
              new Date().toISOString(),
              stockCheck.statusEstoque
            );
            countNew++;

            if (stockCheck.statusEstoque === 'comEstoque') countInStockFound++;
            if (stockCheck.statusEstoque === 'duvidoso') countDuvidosoFound++;
          }
        }
      } catch (errPage) {
        console.warn(`[ANVISA Cron] Erro na página ${page}:`, errPage.message);
      }
    }

    // Registra log e alerta no sistema se foram encontrados novos itens no estoque ou para verificação
    if (countInStockFound > 0 || countDuvidosoFound > 0) {
      console.log(`[ANVISA Cron] 🚨 ALERTA SANITÁRIO: ${countInStockFound} produtos em estoque e ${countDuvidosoFound} para verificação manual!`);
      
      // Registra na tabela de logs para notificação dos administradores
      try {
        db.prepare(`
          INSERT INTO logs (id, timestamp, userName, userId, action, category, details)
          VALUES (?, ?, 'Sistema ANVISA', 'system', 'Alerta Sanitário Detectado', 'ANVISA', ?)
        `).run(
          `log-anvisa-${Date.now()}`,
          new Date().toISOString(),
          `Varredura diária ANVISA encontrou ${countInStockFound} produtos proibidos com estoque e ${countDuvidosoFound} que requerem confirmação manual.`
        );
      } catch (e) {}
    }

    console.log(`[ANVISA Cron] Varredura concluída. ${countNew} novos alertas salvos (${countInStockFound} no estoque, ${countDuvidosoFound} dúvidas).`);
    return { success: true, countNew, countInStockFound, countDuvidosoFound };
  } catch (err) {
    console.error('[ANVISA Cron] Erro na varredura diária da ANVISA:', err.message);
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
